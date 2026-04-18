output "ec2_public_ip" {
  description = "Elastic IP of the EC2 instance — set as EC2_HOST GitHub secret"
  value       = aws_eip.main.public_ip
}

output "app_url" {
  description = "Application URL"
  value       = "http://${aws_eip.main.public_ip}"
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh ubuntu@${aws_eip.main.public_ip}"
}
