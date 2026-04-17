# ── SSH key pair ──────────────────────────────────────────────────────────────

resource "aws_key_pair" "deploy" {
  key_name   = "${var.project}-deploy"
  public_key = var.ssh_public_key
  tags       = local.tags
}

# ── Latest Ubuntu 24.04 LTS AMI ───────────────────────────────────────────────

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]  # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── EC2 instance ──────────────────────────────────────────────────────────────

resource "aws_instance" "main" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deploy.key_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.ec2.id]

  root_block_device {
    volume_size = 20   # GB — enough for Docker images + OS
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = <<-USERDATA
    #!/bin/bash
    set -e

    # ── Install Docker + Compose plugin ──────────────────────────────────────
    apt-get update
    apt-get install -y docker.io docker-compose-plugin git
    usermod -aG docker ubuntu
    systemctl enable --now docker

    # ── Mount EBS volume for postgres data ────────────────────────────────────
    # /dev/xvdf is the EBS volume attached below (aws_volume_attachment)
    # mkfs is skipped if already formatted (e.g. after instance replacement)
    mkfs.ext4 /dev/xvdf 2>/dev/null || true
    mkdir -p /data/postgres
    mount /dev/xvdf /data/postgres
    echo '/dev/xvdf /data/postgres ext4 defaults,nofail 0 2' >> /etc/fstab
    chown -R 999:999 /data/postgres   # postgres container UID

    # ── Clone app repo ────────────────────────────────────────────────────────
    git clone ${var.github_repo} /app
    chown -R ubuntu:ubuntu /app

    # ── Create docker-compose.override.yml for EBS postgres volume ────────────
    cat > /app/docker-compose.override.yml << 'EOF'
    services:
      db:
        volumes:
          - /data/postgres:/var/lib/postgresql/data
    EOF
    chown ubuntu:ubuntu /app/docker-compose.override.yml
  USERDATA

  tags = merge(local.tags, { Name = var.project })
}

# ── Elastic IP ────────────────────────────────────────────────────────────────
# Stable public IP — survives instance stop/start

resource "aws_eip" "main" {
  instance = aws_instance.main.id
  domain   = "vpc"
  tags     = merge(local.tags, { Name = "${var.project}-eip" })
}

# ── EBS volume for postgres data ──────────────────────────────────────────────
# Separate from the root volume so data survives instance termination/replacement

resource "aws_ebs_volume" "postgres" {
  availability_zone = aws_instance.main.availability_zone
  size              = 20    # GB
  type              = "gp3"
  encrypted         = true
  tags              = merge(local.tags, { Name = "${var.project}-postgres-data" })
}

resource "aws_volume_attachment" "postgres" {
  device_name  = "/dev/xvdf"
  volume_id    = aws_ebs_volume.postgres.id
  instance_id  = aws_instance.main.id
  # Do not detach on destroy — prevents accidental data loss
  skip_destroy = true
}
