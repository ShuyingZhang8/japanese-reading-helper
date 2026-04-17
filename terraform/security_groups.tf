locals {
  tags = { Project = var.project, ManagedBy = "terraform" }
}

resource "aws_security_group" "ec2" {
  name        = "${var.project}-ec2"
  description = "EC2 instance: HTTP public, SSH from your IP only"
  vpc_id      = aws_vpc.main.id

  # HTTP: open to the internet
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH: restricted to your IP only
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.your_ip_cidr]
  }

  # All outbound (needed for apt-get, docker pull, git clone, AI API calls)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${var.project}-ec2-sg" })
}
