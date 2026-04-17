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

output "next_steps" {
  description = "What to do after terraform apply"
  value       = <<-EOT

    ── Next steps ────────────────────────────────────────────────
    1. Wait ~2 min for user_data to finish (Docker + git clone)

    2. SSH in and create backend/.env:
       ssh ubuntu@${aws_eip.main.public_ip}
       cat > /app/backend/.env << 'EOF'
       DATABASE_URL=postgresql://app:localdev@db:5432/reading_helper
       AI_PROVIDER=gemini
       GEMINI_API_KEY=<your-key>
       EOF

    3. Start services:
       cd /app && docker compose up -d

    4. Seed the database:
       docker compose exec backend python scripts/seed_db.py

    5. Verify:
       curl http://${aws_eip.main.public_ip}/health

    6. Add GitHub secrets:
       EC2_HOST     = ${aws_eip.main.public_ip}
       EC2_SSH_KEY  = (contents of your private SSH key)
       AI_PROVIDER  = gemini
       GEMINI_API_KEY = <your-key>
    ─────────────────────────────────────────────────────────────
  EOT
}
