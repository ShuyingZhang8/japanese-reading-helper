# Adaptive AI Japanese Reading Companion

A Japanese reading comprehension tool for language learners. Paste any Japanese article, select your JLPT level, and the app highlights unfamiliar vocabulary, explains sentences with grammar breakdowns, and generates quizzes to reinforce what you've read.

---

## Features

- **JLPT-aware tokenization** — Morphological analysis via SudachiPy identifies words above your proficiency level (N5–N1)
- **AI sentence explanations** — Word-by-word meanings, grammar patterns, and English translation for any sentence you click
- **Interactive quizzes** — Auto-generated comprehension, vocabulary, and grammar questions with multiple-choice answers
- **Offline fallback** — JMdict dictionary provides explanations when no AI API key is configured
- **PDF export** — Download a learning report with vocabulary list, explanations, and quiz answers

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | FastAPI + Python 3.11 + asyncpg |
| Database | PostgreSQL 16 |
| Tokenizer | SudachiPy + sudachidict_core |
| AI Providers | OpenAI API / Google Gemini API, JMdict (offline) |
| Web Server | Nginx (reverse proxy + SPA routing) |
| Containers | Docker + Docker Compose |
| Cloud | AWS EC2 + EBS + VPC |
| IaC | Terraform |
| CI/CD | GitHub Actions |


---

## Getting Started

The app is deployed to AWS. To run your own instance, provision the infrastructure with Terraform and push to `main` — the CD pipeline handles the rest.

### Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) 1.6+
- AWS credentials configured (`aws configure` or environment variables)
- An EC2 key pair created in your target region
- An OpenAI or Google Gemini API key

### 1. Clone the repository

```bash
git clone https://github.com/shuying-zhang/reading_helper.git
cd reading_helper
```

### 2. Configure Terraform variables

```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

Edit `terraform/terraform.tfvars` with your values:

```hcl
aws_region     = "us-west-2"
instance_type  = "t3.small"
ssh_public_key = "ssh-rsa AAAA..."   # contents of ~/.ssh/id_rsa.pub
github_repo    = "https://github.com/your-username/reading_helper.git"
```

### 3. Provision infrastructure

```bash
cd terraform
terraform init
terraform apply
```

This creates a VPC, EC2 instance, EBS volume, and Elastic IP. The public IP is printed in the output.

### 4. Add GitHub Secrets

In your repository settings, add the following secrets so the CD workflow can deploy:

| Secret | Description |
|---|---|
| `EC2_HOST` | Public IP from `terraform output` |
| `EC2_SSH_KEY` | Private key matching the public key in `terraform.tfvars` |
| `AI_PROVIDER` | `openai` or `gemini` |
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |

### 5. Deploy

Push to `main`. The CD workflow builds the Docker images, starts the containers, and seeds the database automatically.

```bash
git push origin main
```

The app will be available at `http://<your-ec2-ip>` once the workflow completes.

---

