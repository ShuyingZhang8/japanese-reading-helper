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

    # ── Install Docker from official apt repository ───────────────────────────
    # Ubuntu 24.04 default apt repos do not include docker-compose-plugin;
    # it is only available from Docker's official apt repo.
    apt-get update
    apt-get install -y ca-certificates curl git
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
      https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    usermod -aG docker ubuntu
    systemctl enable --now docker

    # ── Mount EBS volume for postgres data ────────────────────────────────────
    # EBS attachment is async — wait up to 60s for the device to appear.
    # t3 instances expose EBS as /dev/nvme1n1 (NVMe), not /dev/xvdf.
    for i in $(seq 1 30); do
      # Find the second nvme device (nvme0 = root, nvme1 = our EBS)
      EBS_DEV=$(lsblk -dpno NAME | grep nvme | grep -v nvme0n1 | head -1)
      if [ -n "$EBS_DEV" ]; then break; fi
      # Fallback: classic xen device name
      if [ -b /dev/xvdf ]; then EBS_DEV=/dev/xvdf; break; fi
      sleep 2
    done
    if [ -z "$EBS_DEV" ]; then
      echo "ERROR: EBS volume not found after 60s" >&2
      exit 1
    fi
    echo "EBS device: $EBS_DEV"
    mkfs.ext4 "$EBS_DEV" 2>/dev/null || true
    mkdir -p /data/postgres
    mount "$EBS_DEV" /data/postgres
    echo "$EBS_DEV /data/postgres ext4 defaults,nofail 0 2" >> /etc/fstab
    chown -R 999:999 /data/postgres   # postgres container UID

    # ── Clone app repo ────────────────────────────────────────────────────────
    git clone ${var.github_repo} /app
    chown -R ubuntu:ubuntu /app

    # ── Create docker-compose.override.yml for EBS postgres volume ────────────
    # Use a subdirectory to avoid ext4 lost+found conflicting with postgres init
    mkdir -p /data/postgres/pgdata
    chown -R 999:999 /data/postgres/pgdata
    cat > /app/docker-compose.override.yml << 'EOF'
services:
  db:
    volumes:
      - /data/postgres/pgdata:/var/lib/postgresql/data
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
