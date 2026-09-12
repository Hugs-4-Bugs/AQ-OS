# AcquisitionOS — Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Docker Deployment](#docker-deployment)
4. [Manual Deployment (EC2/VM)](#manual-deployment-ec2vm)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Cloud Platform Deployment](#cloud-platform-deployment)
7. [SSL/TLS Setup](#ssltls-setup)
8. [Backup and Restore](#backup-and-restore)
9. [Monitoring Setup](#monitoring-setup)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Minimum System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB SSD |
| OS | Ubuntu 22.04+ | Ubuntu 24.04 LTS |

### Software Requirements

- **Docker** 24.0+ (with Compose V2 plugin)
- **Git** 2.40+
- **curl**, **jq** (for scripts)

### Required Accounts

- **Domain name** with DNS control
- **Google OAuth** credentials (optional, for Google Sign-in)
- **Stripe** or **Razorpay** account (optional, for payments)
- **SMTP** service (Gmail, SendGrid, etc.) or **Resend** API key
- **AWS S3** bucket (optional, for backup offsite storage)

---

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/acquisitionos.git /opt/acquisitionos
cd /opt/acquisitionos
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
chmod 600 .env
```

Edit `.env` with your values. **Critical variables:**

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Database connection string | Yes |
| `JWT_SECRET` | Token signing secret (64+ char hex) | Production |
| `NEXT_PUBLIC_APP_URL` | Public URL (e.g., https://app.example.com) | Yes |
| `SMTP_HOST` | SMTP server for email | For auth flows |
| `SMTP_USER` | SMTP username | For auth flows |
| `SMTP_PASSWORD` | SMTP password | For auth flows |

Generate strong secrets:

```bash
# JWT_SECRET
openssl rand -hex 64

# PostgreSQL password
openssl rand -hex 32
```

### 3. Database Setup

**SQLite** (default, for small deployments):
```bash
DATABASE_URL=file:./data/acquisitionos.db
```

**PostgreSQL** (recommended for production):
```bash
DATABASE_URL=postgresql://user:password@host:5432/acquisitionos
```

Run migrations:
```bash
npx prisma migrate deploy
# or for development:
npx prisma db push
```

---

## Docker Deployment

### Development

```bash
# Start all services (PostgreSQL, Redis, Backend, Frontend, Celery, Nginx)
docker compose up -d

# View logs
docker compose logs -f frontend

# Stop
docker compose down
```

### Production

```bash
# Build and start production stack
docker compose -f docker-compose.prod.yml up -d

# View status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f frontend

# Stop
docker compose -f docker-compose.prod.yml down
```

### Production Stack Services

| Service | Port | Description |
|---------|------|-------------|
| `frontend` | 3000 | Next.js application |
| `backend` | 8000 | Python FastAPI (optional) |
| `postgres` | 5432 | PostgreSQL database |
| `redis` | 6379 | Redis cache/broker |
| `nginx` | 80/443 | Reverse proxy with SSL |
| `prometheus` | 9090 | Metrics collection |
| `grafana` | 3000 | Monitoring dashboards |
| `celery-worker` | — | Background task processor |
| `celery-beat` | — | Periodic task scheduler |
| `realtime-service` | 3003 | WebSocket server |

### Environment Variables for Docker Compose

Set in `.env` or shell environment before running `docker compose`:

```bash
DOMAIN=app.example.com
POSTGRES_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>
SECRET_KEY=<64-char-hex>
GRAFANA_ADMIN_PASSWORD=<strong-password>
```

---

## Manual Deployment (EC2/VM)

### Automated Script

```bash
# One-command deployment (Ubuntu 22.04+)
DOMAIN=app.example.com \
EMAIL=admin@example.com \
bash deploy/ec2/deploy.sh
```

This script:
1. Installs Docker and Compose V2
2. Configures swap (2GB)
3. Clones the repository
4. Generates random secrets
5. Obtains SSL certificates via Certbot
6. Starts all services via Docker Compose
7. Configures UFW firewall (SSH, HTTP, HTTPS)
8. Sets up log rotation
9. Installs systemd service
10. Runs health checks

### Manual Steps

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. Clone and configure
git clone https://github.com/your-org/acquisitionos.git /opt/acquisitionos
cd /opt/acquisitionos
cp .env.example .env
# Edit .env with your values

# 3. Build and start
docker compose -f docker-compose.prod.yml up -d

# 4. Run migrations
docker compose -f docker-compose.prod.yml exec frontend npx prisma migrate deploy

# 5. Verify
curl http://localhost:3000/api/health
```

### Systemd Service

```bash
# Install the systemd service
sudo cp deploy/ec2/systemd/acquisitionos.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable acquisitionos
sudo systemctl start acquisitionos

# Check status
sudo systemctl status acquisitionos
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes 1.27+
- `kubectl` configured
- Helm 3 (optional)
- cert-manager for TLS

### Deploy

```bash
# 1. Create namespace
kubectl apply -f deploy/k8s/namespace.yaml

# 2. Create secrets (REPLACE with real values!)
kubectl apply -f deploy/k8s/secrets.yaml

# 3. Create ConfigMap
kubectl apply -f deploy/k8s/configmap.yaml

# 4. Deploy PostgreSQL
kubectl apply -f deploy/k8s/postgres-statefulset.yaml

# 5. Deploy Redis
kubectl apply -f deploy/k8s/redis-statefulset.yaml

# 6. Deploy Backend
kubectl apply -f deploy/k8s/backend-deployment.yaml

# 7. Deploy Frontend
kubectl apply -f deploy/k8s/frontend-deployment.yaml

# 8. Deploy Celery
kubectl apply -f deploy/k8s/celery-worker-deployment.yaml
kubectl apply -f deploy/k8s/celery-beat-deployment.yaml

# 9. Configure HPA
kubectl apply -f deploy/k8s/hpa.yaml

# 10. Create Ingress
kubectl apply -f deploy/k8s/ingress.yaml
```

### Important Notes

- **Frontend data volume**: Uses a PersistentVolumeClaim (`frontend-data-pvc`) for SQLite data persistence
- **Secrets template**: `deploy/k8s/secrets.yaml` contains placeholder values — **never commit real secrets**
- Use [sealed-secrets](https://github.com/bitnami-labs/sealed-secrets) or [external-secrets](https://external-secrets.io/) for production

---

## Cloud Platform Deployment

### Render

Use `deploy/render/render.yaml` as a Render Blueprint:
- Auto-configures PostgreSQL, Redis, web service, workers, and cron jobs
- Health check: `/api/health`

### Railway

Use `deploy/railway/railway.json`:
- Dockerfile-based build
- Health check: `/api/health`
- 2 replicas with auto-restart

### AWS (Terraform)

Use `deploy/terraform/`:
```bash
cd deploy/terraform
terraform init
terraform plan -var="postgres_password=$(openssl rand -hex 32)"
terraform apply
```

Provisions: VPC, RDS PostgreSQL, ElastiCache Redis, ECS cluster, ALB, S3 buckets, CloudWatch alarms.

---

## SSL/TLS Setup

### Let's Encrypt (Certbot)

```bash
# Obtain certificate
sudo certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@example.com \
  --agree-tos \
  -d app.example.com

# Auto-renewal is handled by cron
# Verify renewal:
sudo certbot renew --dry-run
```

### Custom Certificates

Place certificates in `/etc/letsencrypt/live/DOMAIN/` and update `nginx.prod.conf`:

```nginx
ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
```

### TLS Configuration

The production nginx config enforces:
- TLS 1.2 and 1.3 only
- Strong cipher suites (ECDHE, AES-GCM, CHACHA20)
- HSTS with 2-year max-age and preload
- OCSP stapling
- HTTP → HTTPS redirect

---

## Backup and Restore

### Automated Backups

```bash
# Set up cron jobs (daily full, hourly incremental, weekly snapshot)
bash scripts/backup/cron-setup.sh
```

### Manual Backup

```bash
# Full backup (SQLite + PostgreSQL)
DB_PATH=/opt/acquisitionos/data/acquisitionos.db \
BACKUP_DIR=/opt/acquisitionos/backups \
bash scripts/backup/backup.sh

# Full application snapshot (DB + uploads + config + env)
bash scripts/backup/snapshot.sh create --note "Pre-deployment backup"
```

### Restore

```bash
# Restore from latest backup
bash scripts/backup/restore.sh --latest --type sqlite

# Restore from specific file
bash scripts/backup/restore.sh --file /backups/2026/05/23/sqlite_20260523_020000.db.gz --type sqlite

# Dry run (show what would happen)
bash scripts/backup/restore.sh --latest --dry-run

# Restore from snapshot
bash scripts/backup/snapshot.sh restore snap_20260523_020000
```

### S3 Offsite Backup

```bash
# Configure S3 bucket
export S3_BACKUP_BUCKET=your-backup-bucket
export AWS_DEFAULT_REGION=us-east-1

# Ensure AWS CLI is configured
aws configure
```

### Retention Policy

| Type | Retention |
|------|-----------|
| Daily | 7 backups |
| Weekly | 4 backups |
| Monthly | 12 backups |

Run retention enforcement:
```bash
bash scripts/backup/retention.sh
```

### Migration with Auto-Rollback

```bash
# Run migration (auto-backs up and rolls back on failure)
bash scripts/backup/migration-rollback.sh

# Create a named migration
bash scripts/backup/migration-rollback.sh add_new_field
```

---

## Monitoring Setup

### Health Check Endpoints

| Endpoint | Purpose | Auth Required |
|----------|---------|---------------|
| `GET /api/health` | Fast check for load balancers | No |
| `GET /api/health/detailed` | Component-level status | No |

**Basic response** (`/api/health`):
```json
{
  "status": "healthy",
  "service": "acquisitionos",
  "version": "2.0.0",
  "checks": [
    { "name": "database", "ok": true, "latencyMs": 5.23 },
    { "name": "memory", "ok": true },
    { "name": "env_vars", "ok": true }
  ]
}
```

**Detailed response** (`/api/health/detailed`):
```json
{
  "status": "healthy",
  "components": {
    "database": { "status": "healthy", "latencyMs": 5.23 },
    "memory": { "status": "healthy" },
    "disk": { "status": "healthy" },
    "process": { "status": "healthy" },
    "envVars": { "status": "healthy" },
    "providers": { "status": "degraded" }
  },
  "metrics": { "activeUsers": 42, "totalLeads": 1200, "queueDepth": 3 }
}
```

**Status codes**: 200 (healthy/degraded), 503 (unhealthy)

### Prometheus + Grafana

The production Docker Compose includes Prometheus and Grafana:

```bash
# Start monitoring stack
docker compose -f docker-compose.prod.yml up -d prometheus grafana

# Access Grafana
# URL: https://your-domain/grafana/
# Default credentials from .env: GRAFANA_ADMIN_USER / GRAFANA_ADMIN_PASSWORD
```

Pre-configured dashboards in `deploy/grafana/dashboards/`.

### Alerts

Prometheus alert rules in `deploy/prometheus/alerts.yml`:
- High CPU usage
- High memory usage
- Database connection failures
- Service down

### Process Manager

For non-Docker deployments, use `process-manager.js`:

```bash
# Start with process manager (auto-restart, health checks)
node process-manager.js
```

Features:
- Exponential backoff on restart (2s → 60s)
- Max 10 restarts before giving up
- HTTP health checks every 10 seconds
- Graceful SIGTERM/SIGINT handling

---

## Troubleshooting

### Common Issues

#### 1. Server won't start — "Port 3000 already in use"

```bash
# Find the process using port 3000
lsof -i :3000
# or
ss -tlnp | grep 3000

# Kill the process
kill -9 <PID>
```

#### 2. Database connection errors

```bash
# Check if database file exists (SQLite)
ls -la db/custom.db

# Check Prisma client
npx prisma generate

# Test connection
npx prisma db push --accept-data-loss
```

#### 3. Email not sending

```bash
# Check SMTP configuration
curl http://localhost:3000/api/health

# Test SMTP directly
node -e "
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  t.verify().then(() => console.log('SMTP OK')).catch(e => console.error('SMTP FAIL:', e.message));
"
```

#### 4. Health check failing (503)

```bash
# Check detailed health
curl http://localhost:3000/api/health/detailed

# Common causes:
# - Database unreachable → check DATABASE_URL
# - Memory pressure → check with: free -h
# - Missing env vars → check: env | grep -E 'DATABASE_URL|JWT_SECRET'
```

#### 5. Docker container keeps restarting

```bash
# Check container logs
docker compose logs frontend --tail 100

# Check container exit code
docker inspect <container-id> | jq '.[0].State'

# Common causes:
# - OOM killed → increase memory limit
# - Missing env vars → check .env file
# - Port conflict → check port availability
```

#### 6. SSL certificate errors

```bash
# Check certificate expiry
echo | openssl s_client -connect app.example.com:443 2>/dev/null | openssl x509 -noout -dates

# Force renew
sudo certbot renew --force-renewal

# Restart nginx
docker compose -f docker-compose.prod.yml restart nginx
```

#### 7. Slow database queries

```bash
# Check database size (SQLite)
ls -lh db/custom.db

# If >100MB, consider:
# 1. Running VACUUM: sqlite3 db/custom.db "VACUUM;"
# 2. Migrating to PostgreSQL
```

### Getting Help

- Health endpoint: `GET /api/health/detailed`
- Application logs: `docker compose logs -f frontend`
- Nginx logs: `docker compose logs -f nginx`
- System logs: `journalctl -u acquisitionos -f`
