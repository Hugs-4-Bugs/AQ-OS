#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — EC2 Deploy Script
# Phase 14.4: Deployment
# Complete: Docker, clone, env, SSL, services, firewall, log rotation, swap
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
APP_NAME="acquisitionos"
APP_DIR="/opt/${APP_NAME}"
REPO_URL="${REPO_URL:-https://github.com/your-org/acquisitionos.git}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-app.acquisitionos.com}"
EMAIL="${EMAIL:-admin@acquisitionos.com}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 32)}"
REDIS_PASSWORD="${REDIS_PASSWORD:-$(openssl rand -hex 32)}"
SECRET_KEY="${SECRET_KEY:-$(openssl rand -hex 64)}"
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-$(openssl rand -hex 16)}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
  exit 1
}

# ── 1. System Updates & Dependencies ────────────────────────────────
log "Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq \
  apt-transport-https \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  software-properties-common \
  certbot \
  python3-certbot-nginx \
  ufw \
  htop \
  jq \
  logrotate

# ── 2. Install Docker ───────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
  sudo usermod -aG docker "$USER"
  log "Docker installed successfully"
else
  log "Docker already installed"
fi

# ── 3. Install Docker Compose ───────────────────────────────────────
# Docker Compose V2 is included with Docker (docker compose)
# No separate installation needed for modern Docker
if ! docker compose version &> /dev/null; then
  log "Docker Compose V2 not found, installing Docker plugin..."
  mkdir -p ~/.docker/cli-plugins
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o ~/.docker/cli-plugins/docker-compose
  chmod +x ~/.docker/cli-plugins/docker-compose
  log "Docker Compose V2 installed successfully"
else
  log "Docker Compose already available"
fi

# ── 4. Configure Swap ───────────────────────────────────────────────
if [ ! -f /swapfile ]; then
  log "Configuring ${SWAP_SIZE} swap..."
  sudo fallocate -l "${SWAP_SIZE}" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  sudo sysctl vm.swappiness=10
  echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
  log "Swap configured"
else
  log "Swap already configured"
fi

# ── 5. Clone Repository ─────────────────────────────────────────────
if [ ! -d "${APP_DIR}" ]; then
  log "Cloning repository..."
  sudo git clone -b "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  sudo chown -R "$USER":"$USER" "${APP_DIR}"
else
  log "Repository already cloned, pulling latest..."
  cd "${APP_DIR}"
  git fetch origin
  git reset --hard "origin/${BRANCH}"
fi

cd "${APP_DIR}"

# ── 6. Configure Environment ────────────────────────────────────────
log "Configuring environment..."
if [ ! -f .env ]; then
  cat > .env <<EOF
# AcquisitionOS Production Environment
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
SECRET_KEY=${SECRET_KEY}
GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
ENVIRONMENT=production
EOF
  chmod 600 .env
  log "Environment file created"
else
  log "Environment file already exists"
fi

# ── 7. SSL Certificate with Certbot ─────────────────────────────────
log "Setting up SSL certificate..."
if [ ! -d /etc/letsencrypt/live/"${DOMAIN}" ]; then
  # Start nginx temporarily for certbot challenge
  sudo docker compose -f docker-compose.prod.yml up -d nginx 2>/dev/null || true
  sleep 5

  sudo certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    -d "${DOMAIN}"

  log "SSL certificate obtained"
else
  log "SSL certificate already exists"
fi

# Set up auto-renewal
echo "0 0 1 * * certbot renew --quiet && docker compose -f ${APP_DIR}/docker-compose.prod.yml restart nginx" | sudo tee /etc/cron.d/certbot-renew

# ── 8. Start Services ───────────────────────────────────────────────
log "Starting services..."
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

log "Waiting for services to be healthy..."
sleep 30

# ── 9. Run Database Migrations ──────────────────────────────────────
log "Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head || true

# ── 10. Configure Firewall ──────────────────────────────────────────
log "Configuring firewall..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw --force enable
log "Firewall configured"

# ── 11. Configure Log Rotation ──────────────────────────────────────
log "Configuring log rotation..."
sudo tee /etc/logrotate.d/acquisitionos <<EOF
${APP_DIR}/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 $USER $USER
    sharedscripts
    postrotate
        docker compose -f ${APP_DIR}/docker-compose.prod.yml restart nginx 2>/dev/null || true
    endpostrotate
}

/var/log/nginx/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 nginx adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 \$(cat /var/run/nginx.pid) || true
    endpostrotate
}
EOF
log "Log rotation configured"

# ── 12. Install Systemd Service ─────────────────────────────────────
log "Installing systemd service..."
sudo cp deploy/ec2/systemd/acquisitionos.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable acquisitionos
log "Systemd service installed"

# ── 13. Health Check ────────────────────────────────────────────────
log "Running health check..."
for i in $(seq 1 10); do
  if curl -sf "https://${DOMAIN}/" > /dev/null 2>&1; then
    log "Health check passed!"
    break
  fi
  if [ "$i" -eq 10 ]; then
    error "Health check failed after 10 attempts"
  fi
  log "Waiting for services... attempt $i/10"
  sleep 10
done

# ── Summary ──────────────────────────────────────────────────────────
log "═══════════════════════════════════════════════════════════"
log "  AcquisitionOS Deployment Complete!"
log "  URL: https://${DOMAIN}"
log "  App Directory: ${APP_DIR}"
log "  ══════════════════════════════════════════════════════════"
log "  Next Steps:"
log "  1. Verify the application at https://${DOMAIN}"
log "  2. Configure DNS if needed"
log "  3. Set up monitoring alerts"
log "  4. Configure backup schedule: ./scripts/backup/cron-setup.sh"
log "═══════════════════════════════════════════════════════════"
