variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-west-2"
}

variable "project" {
  description = "Project name — used as prefix for all resource names"
  type        = string
  default     = "reading-helper"
}

variable "instance_type" {
  description = "EC2 instance type. t3.micro = free tier (12 months); t3.small for more memory"
  type        = string
  default     = "t3.small"
}

variable "ssh_public_key" {
  description = "SSH public key to install on the EC2 instance (contents of ~/.ssh/id_rsa.pub or similar)"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository to clone on the EC2 instance (e.g. https://github.com/you/reading-helper.git)"
  type        = string
}
