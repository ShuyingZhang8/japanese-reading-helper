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
git clone ${github_repo} /app
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
