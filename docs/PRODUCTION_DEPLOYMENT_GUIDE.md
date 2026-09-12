# AcquisitionOS — Production Deployment Guide

Complete guide for deploying AcquisitionOS to production, covering architecture, infrastructure, configuration, monitoring, scaling, and incident response.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Infrastructure Requirements](#2-infrastructure-requirements)
3. [Deployment Steps](#3-deployment-steps)
4. [Docker Compose Production Configuration](#4-docker-compose-production-configuration)
5. [Nginx/Caddy Reverse Proxy Configuration](#5-nginxcaddy-reverse-proxy-configuration)
6. [SSL/TLS Configuration](#6-ssltls-configuration)
7. [Database Migration to PostgreSQL](#7-database-migration-to-postgresql)
8. [Celery Worker Deployment](#8-celery-worker-deployment)
9. [WebSocket Service Deployment](#9-websocket-service-deployment)
10. [Monitoring Stack Deployment](#10-monitoring-stack-deployment)
11. [Backup and Restore Procedures](#11-backup-and-restore-procedures)
12. [Scaling Strategy](#12-scaling-strategy)
13. [Security Hardening Checklist](#13-security-hardening-checklist)
14. [Performance Optimization](#14-performance-optimization)
15. [Incident Response Runbook](#15-incident-response-runbook)
16. [Rollback Procedures](#16-rollback-procedures)
17. [Phase-Specific Deployment Notes](#17-phase-specific-deployment-notes)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ACQUISITIONOS PRODUCTION ARCHITECTURE             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────┐     ┌──────────────────────────────────────┐    │
│  │   CDN / WAF   │────▶│        Reverse Proxy (Nginx)         │    │
│  │  (Cloudflare) │     │  SSL termination, rate limiting,     │    │
│  └───────────────┘     │  WebSocket proxy, static assets       │    │
│                         └──────────┬───────────────────────────┘    │
│                                    │                                │
│                    ┌───────────────┼───────────────┐                │
│                    ▼               ▼               ▼                │
│          ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│          │  Next.js #1  │ │  Next.js #2  │ │ FastAPI      │        │
│          │  (Frontend)  │ │  (Frontend)  │ │  (Backend)   │        │
│          └──────┬───────┘ └──────┬───────┘ └──────┬───────┘        │
│                 │                │                │                 │
│         ┌───────┴────────────────┘                │                 │
│         ▼                                        ▼                 │
│  ┌──────────────┐                       ┌──────────────┐           │
│  │  PostgreSQL  │                       │    Redis     │           │
│  │  (Primary)   │◀─────┐               │  (Cache +    │           │
│  └──────┬───────┘      │               │   Queue)     │           │
│         │              │               └──────┬───────┘           │
│  ┌──────┴───────┐      │                      │                    │
│  │  PostgreSQL  │      │               ┌──────┴───────┐           │
│  │  (Replica)   │      │               │ Celery Worker│           │
│  └──────────────┘      │               │ Celery Beat  │           │
│                         │               └──────────────┘           │
│  ┌──────────────────────┴──────────────────────┐                   │
│  │            WebSocket Service (Socket.io)     │                   │
│  └──────────────────────────────────────────────┘                   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Monitoring Stack                            │   │
│  │  Prometheus → Grafana | OTel Collector | Loki | Alertmanager │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  External Services:                                                 │
│  • Stripe / Razorpay (Payments)     • Google OAuth (Auth + Gmail)  │
│  • z-ai-web-dev-sdk (AI Engine)     • Telegram Bot API             │
│  • AWS S3 / Cloudflare R2 (Storage) • Twilio / Meta (WhatsApp)    │
│  • Resend / SMTP (Email)           • Sentry (Error Tracking)       │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 16 (App Router) | SSR, API routes, static assets |
| Backend | FastAPI (Python 3.11) | Heavy processing, webhooks, Celery tasks |
| Database | PostgreSQL 15 | Primary data store (SQLite for dev) |
| ORM | Prisma | Database client and schema management |
| Cache | Redis 7 | Session cache, rate limiting, Celery broker |
| Task Queue | Celery + Redis | Background job processing |
| WebSocket | Socket.io | Real-time notifications and updates |
| Reverse Proxy | Nginx / Caddy | SSL, load balancing, rate limiting |
| Monitoring | Prometheus + Grafana | Metrics, dashboards, alerts |
| Error Tracking | Sentry | Exception tracking and alerting |
| AI Engine | z-ai-web-dev-sdk | Lead discovery, enrichment, chat |
| Payments | Stripe / Razorpay | Subscription billing |
| Email | Resend / SMTP | Transactional emails |

---

## 2. Infrastructure Requirements

### Minimum (Small Team, <100 users)

| Resource | Specification |
|---|---|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Storage | 20 GB SSD |
| Database | PostgreSQL (shared instance) |
| Redis | Single instance (on app server) |

### Recommended (Growing Team, 100-1000 users)

| Resource | Specification |
|---|---|
| CPU | 4 vCPU |
| RAM | 8 GB |
| Storage | 50 GB SSD |
| Database | PostgreSQL (dedicated, 2 vCPU, 4 GB RAM) |
| Redis | Dedicated instance (1 GB RAM) |
| Monitoring | Separate instance (2 vCPU, 4 GB RAM) |

### Production Database: PostgreSQL

For production, **always use PostgreSQL** instead of SQLite. Key reasons:

- Concurrent connections (SQLite = single writer)
- Connection pooling via PgBouncer
- Read replicas for scaling
- Full-text search capabilities
- JSONB for complex queries
- Streaming replication for backups

### Cloud Provider Recommendations

| Provider | Service | Notes |
|---|---|---|
| AWS | EC2 + RDS + ElastiCache | Full control, most mature |
| GCP | GCE + Cloud SQL + Memorystore | Good integration with Google services |
| DigitalOcean | Droplets + Managed DB | Simple pricing, great for small teams |
| Railway | Managed containers | Easiest deployment, auto-scaling |
| Supabase | Managed PostgreSQL | Excellent Prisma integration |

---

## 3. Deployment Steps

### Step 1: Clone and Configure

```bash
# Clone the repository
git clone https://github.com/your-org/acquisitionos.git
cd acquisitionos

# Copy production environment template
cp .env.example .env

# Edit with production values
nano .env
```

### Step 2: Set Environment Variables

Set ALL required environment variables (see [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md)):

```bash
# Critical (app won't start without these)
ENVIRONMENT=production
DATABASE_URL=postgresql://user:pass@postgres:5432/acquisitionos
DIRECT_URL=postgresql://user:pass@postgres-host:5432/acquisitionos
JWT_SECRET=<64-byte-base64>
JWT_REFRESH_SECRET=<64-byte-base64>
APP_SECRET_KEY=<64-byte-base64>

# Required for AI features
ZAI_API_KEY=<your-key>

# Required for payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Required for security
TOKEN_ENCRYPTION_KEY=<fernet-key>
NEXTAUTH_SECRET=<32-byte-base64>

# Production-specific
AUTH_DEV_MODE=false
AUTH_AUTO_VERIFY=false
AUTH_DEV_OTP_IN_RESPONSE=false
AUTH_BYPASS_EMAIL=false
ENABLE_GOOGLE_OAUTH=true
```

### Step 3: Build Docker Images

```bash
# Build all images
docker compose build

# Or build individually
docker compose build frontend
docker compose build backend
```

### Step 4: Run Database Migrations

```bash
# Push Prisma schema to PostgreSQL
docker compose run --rm frontend npx prisma db push

# Generate Prisma client
docker compose run --rm frontend npx prisma generate

# Seed plan entitlements
docker compose run --rm frontend bun run scripts/seed-entitlements.ts
```

### Step 5: Start Services

```bash
# Start all services
docker compose up -d

# Verify all services are running
docker compose ps

# Check logs
docker compose logs -f --tail=50
```

### Step 6: Configure Reverse Proxy

See [Section 5](#5-nginxcaddy-reverse-proxy-configuration) for Nginx configuration.

### Step 7: Setup SSL Certificates

See [Section 6](#6-ssltls-configuration) for SSL setup.

### Step 8: Configure Monitoring

See [Section 10](#10-monitoring-stack-deployment) for monitoring setup.

### Step 9: Run Health Checks

```bash
# Frontend health
curl https://your-domain.com/api/health

# Backend health
curl https://your-domain.com/api/health?XTransformPort=8000

# Database connectivity
docker compose exec backend python -c "from app.database import check_db; check_db()"

# Redis connectivity
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" PING

# Celery worker status
docker compose exec celery-worker celery -A app.celery_app inspect active
```

### Step 10: Enable Backup Schedule

See [Section 11](#11-backup-and-restore-procedures) for backup setup.

---

## 4. Docker Compose Production Configuration

Create a `docker-compose.prod.yml` that overrides the development configuration:

```yaml
# docker-compose.prod.yml
version: "3.9"

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: acquisitionos
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups  # For backup scripts
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always
    deploy:
      resources:
        limits:
          memory: 2G
    # Don't expose port externally in production
    # Access only via Docker network

  redis:
    image: redis:7-alpine
    command: >
      redis-server
      --appendonly yes
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --requirepass ${REDIS_PASSWORD}
      --save 60 1000
      --save 300 100
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always
    deploy:
      resources:
        limits:
          memory: 1G

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: >
      uvicorn app.main:app
      --host 0.0.0.0
      --port 8000
      --workers 4
      --loop uvloop
      --http httptools
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: always
    deploy:
      resources:
        limits:
          memory: 1G
      replicas: 2

  celery-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: >
      celery -A app.celery_app worker
      --loglevel=info
      --concurrency=4
      -Q celery,email,billing,scraping,notifications,maintenance,workflows
      --without-heartbeat
      --without-mingle
      --without-gossip
    env_file: .env
    depends_on:
      - backend
      - redis
    restart: always
    deploy:
      resources:
        limits:
          memory: 1G
      replicas: 2

  celery-beat:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: >
      celery -A app.celery_app beat
      --loglevel=info
      --scheduler celery.beat:PersistentScheduler
    env_file: .env
    depends_on:
      - backend
      - redis
    restart: always
    deploy:
      resources:
        limits:
          memory: 256M

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    command: >
      sh -c "npx prisma generate && next start -p 3000"
    env_file: .env
    depends_on:
      - backend
    restart: always
    deploy:
      resources:
        limits:
          memory: 1G
      replicas: 2

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - frontend
      - backend
    restart: always
    healthcheck:
      test: ["CMD", "nginx", "-t"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  postgres_data:
  redis_data:
```

Deploy with:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 5. Nginx/Caddy Reverse Proxy Configuration

### Nginx Configuration

```nginx
# /etc/nginx/nginx.conf

worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}

http {
    # ── Rate Limiting Zones ──────────────────────────────────────
    limit_req_zone $binary_remote_addr zone=general:10m rate=200r/m;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
    limit_req_zone $binary_remote_addr zone=ai:10m rate=30r/m;
    limit_req_zone $binary_remote_addr zone=webhook:10m rate=100r/m;

    # ── Upstream Definitions ─────────────────────────────────────
    upstream frontend {
        least_conn;
        server frontend:3000;
    }

    upstream backend {
        least_conn;
        server backend:8000;
    }

    upstream websocket {
        server ws-service:3003;
    }

    # ── Shared SSL Settings ──────────────────────────────────────
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # ── Security Headers ─────────────────────────────────────────
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # ── Gzip Compression ─────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

    # ── HTTP → HTTPS Redirect ────────────────────────────────────
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # ── Main Server Block ────────────────────────────────────────
    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        client_max_body_size 50M;

        # ── Webhook Endpoints (higher rate limit, no auth) ────
        location /api/webhooks/ {
            limit_req zone=webhook burst=50 nodelay;
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # ── Gmail Push Notifications ─────────────────────────
        location /api/integrations/gmail/push {
            limit_req zone=webhook burst=20 nodelay;
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # ── Backend API ──────────────────────────────────────
        location /api/ {
            limit_req zone=general burst=20 nodelay;

            # Auth endpoints get stricter rate limiting
            location /api/auth/ {
                limit_req zone=auth burst=5 nodelay;
                proxy_pass http://backend;
            }

            # AI endpoints
            location /api/leads/discover {
                limit_req zone=ai burst=10 nodelay;
                proxy_pass http://frontend;
            }

            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Timeout for long AI operations
            proxy_read_timeout 120s;
            proxy_send_timeout 120s;
        }

        # ── WebSocket ────────────────────────────────────────
        location /socket.io/ {
            proxy_pass http://websocket;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
        }

        # ── Static Assets (long cache) ───────────────────────
        location /_next/static/ {
            proxy_pass http://frontend;
            expires 365d;
            add_header Cache-Control "public, immutable";
        }

        # ── Everything Else → Frontend ───────────────────────
        location / {
            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # ── Health Check (no rate limit) ─────────────────────
        location /api/health {
            proxy_pass http://frontend;
            access_log off;
        }
    }
}
```

### Caddy Configuration (Alternative)

```caddyfile
# Caddyfile
your-domain.com {
    # Security headers
    header {
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
        X-XSS-Protection "1; mode=block"
        Referrer-Policy strict-origin-when-cross-origin
    }

    # Webhook endpoints
    handle /api/webhooks/* {
        reverse_proxy backend:8000
    }

    # Gmail push
    handle /api/integrations/gmail/push {
        reverse_proxy backend:8000
    }

    # WebSocket
    handle /socket.io/* {
        reverse_proxy ws-service:3003
    }

    # API
    handle /api/* {
        reverse_proxy frontend:3000
    }

    # Static assets
    handle /_next/static/* {
        reverse_proxy frontend:3000
        header Cache-Control "public, max-age=31536000, immutable"
    }

    # Everything else
    handle {
        reverse_proxy frontend:3000
    }
}
```

---

## 6. SSL/TLS Configuration

### Option A: Let's Encrypt (Free)

```bash
# Install certbot
apt install certbot

# Obtain certificate
certbot certonly --standalone -d your-domain.com

# Certificates are stored at:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem

# Auto-renewal (add to crontab)
0 0 * * * certbot renew --quiet --post-hook "docker compose restart nginx"
```

### Option B: Cloudflare (Recommended)

1. Add your domain to Cloudflare
2. Set DNS records pointing to your server IP
3. Enable **Full (Strict)** SSL mode
4. Cloudflare handles SSL termination and provides origin certificates

### Option C: Commercial Certificate

Purchase from a CA (DigiCert, Sectigo, etc.) and install the certificate files.

### SSL Configuration Best Practices

- Use TLS 1.2+ only (disable TLS 1.0 and 1.1)
- Enable HSTS with `max-age=63072000; includeSubDomains; preload`
- Use strong cipher suites (ECDHE-based)
- Enable OCSP stapling
- Use certificate transparency monitoring

---

## 7. Database Migration to PostgreSQL

### Step 1: Export Data from SQLite

```bash
# Install sqlite3 and pgloader
apt install sqlite3 pgloader

# Or use a custom export script
# Export each table as CSV
sqlite3 db/custom.db ".mode csv" ".output leads.csv" "SELECT * FROM Lead;"
```

### Step 2: Update Prisma Schema for PostgreSQL

```bash
# Use the production schema
cp prisma/schema.production.prisma prisma/schema.prisma

# Update DATABASE_URL
export DATABASE_URL="postgresql://user:pass@host:5432/acquisitionos"
export DIRECT_URL="postgresql://user:pass@host:5432/acquisitionos"
```

### Step 3: Push Schema to PostgreSQL

```bash
npx prisma db push --schema=prisma/schema.production.prisma
npx prisma generate --schema=prisma/schema.production.prisma
```

### Step 4: Migrate Data

```bash
# Option A: Use pgloader (automatic)
pgloader sqlite:///path/to/custom.db postgresql://user:pass@host:5432/acquisitionos

# Option B: Manual CSV import
# Import each CSV file into PostgreSQL tables
```

### Step 5: Verify Data Integrity

```sql
-- Compare row counts
SELECT 'User' as tbl, COUNT(*) FROM "User"
UNION ALL SELECT 'Lead', COUNT(*) FROM "Lead"
UNION ALL SELECT 'Subscription', COUNT(*) FROM "Subscription"
-- ... etc
```

---

## 8. Celery Worker Deployment

### Production Configuration

```python
# backend/app/celery_app.py — Production settings

# Worker configuration
worker_concurrency = 4          # Number of concurrent processes
worker_max_tasks_per_child = 1000  # Restart worker after N tasks (memory leak prevention)
worker_prefetch_multiplier = 1  # Fetch one task at a time (fair scheduling)
task_acks_late = True           # Acknowledge after execution, not before
task_reject_on_worker_lost = True  # Re-queue task if worker crashes
worker_disable_rate_limits = False  # Enable rate limiting
```

### Queue Separation

| Queue | Purpose | Concurrency | Priority |
|---|---|---|---|
| `celery` | Default queue | 2 | Normal |
| `email` | Email sending | 2 | High |
| `billing` | Payment processing | 1 | Critical |
| `scraping` | Web scraping | 2 | Low |
| `notifications` | Push notifications | 2 | Normal |
| `maintenance` | Cleanup tasks | 1 | Low |
| `workflows` | Workflow execution | 2 | Normal |

### Scaling Workers

```bash
# Scale email workers
docker compose up -d --scale celery-worker-email=3

# Or use separate worker processes
celery -A app.celery_app worker -Q email --concurrency=4 -n email@%h
celery -A app.celery_app worker -Q scraping --concurrency=2 -n scraping@%h
celery -A app.celery_app worker -Q billing --concurrency=1 -n billing@%h
```

### Flower Monitoring

```bash
# Start Flower (protected with basic auth)
celery -A app.celery_app flower \
  --port=5555 \
  --basic-auth=admin:password \
  --url_prefix=flower

# Access at https://your-domain.com/flower/
```

---

## 9. WebSocket Service Deployment

### Mini Service Setup

```bash
# The WebSocket service runs as a mini service
cd mini-services/ws-service
bun install

# Start in production mode
NODE_ENV=production bun run start
```

### Docker Deployment

```yaml
# Add to docker-compose.prod.yml
ws-service:
  build:
    context: ./mini-services/ws-service
    dockerfile: Dockerfile
  environment:
    - REDIS_URL=redis://redis:6379/0
    - REDIS_PASSWORD=${REDIS_PASSWORD}
    - WS_HEARTBEAT_INTERVAL=30000
    - WS_RECONNECT_LIMIT=5
    - REDIS_PUBSUB_PREFIX=acos:pubsub:
  depends_on:
    - redis
  restart: always
  deploy:
    resources:
      limits:
        memory: 512M
```

### Health Check

```bash
# WebSocket health check
curl http://ws-service:3003/health
```

---

## 10. Monitoring Stack Deployment

### Start Monitoring Services

```bash
# Start monitoring stack
docker compose -f monitoring/docker-compose.monitoring.yml up -d
```

### Prometheus Configuration

Edit `monitoring/prometheus/prometheus.yml` with production targets:

```yaml
scrape_configs:
  - job_name: 'acquisitionos-frontend'
    metrics_path: /api/health/metrics
    static_configs:
      - targets: ['frontend:3000']

  - job_name: 'acquisitionos-backend'
    metrics_path: /metrics
    static_configs:
      - targets: ['backend:8000']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

### Grafana Dashboards

Two pre-configured dashboards are available:

1. **App Overview** — Request rate, error rate, latency, active users
2. **Infrastructure** — CPU, memory, disk, Redis, database, Celery

### Alert Rules

16 Prometheus alert rules are defined in `monitoring/prometheus/alerts.yml`. Key alerts:

| Alert | Condition | Severity |
|---|---|---|
| HighErrorRate | 5xx rate > 5% for 5 min | Critical |
| HighLatency | P99 > 5s for 10 min | Warning |
| EndpointDown | Health check fails for 2 min | Critical |
| RedisDown | Connection failures > 10 | Critical |
| CeleryQueueBacklog | Queue > 1000 tasks for 15 min | Warning |
| DiskSpaceLow | Disk usage > 85% | Warning |
| MemoryPressure | RAM usage > 90% | Critical |

---

## 11. Backup and Restore Procedures

### Database Backups

```bash
#!/bin/bash
# backup-database.sh — Daily PostgreSQL backup

BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/acquisitionos_$TIMESTAMP.sql.gz"

# Full backup
docker compose exec -T postgres pg_dump -U postgres acquisitionos | gzip > "$BACKUP_FILE"

# Keep only last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
```

### Redis Backups

Redis uses RDB + AOF persistence (configured in docker-compose.prod.yml):

- **RDB snapshots**: Every 60 seconds if ≥1000 keys changed
- **AOF log**: Every write operation logged
- **Manual backup**: `redis-cli BGSAVE`

### File Upload Backups

```bash
#!/bin/bash
# backup-uploads.sh — Sync S3 uploads to backup bucket

aws s3 sync s3://acquisitionos-assets s3://acquisitionos-assets-backup \
  --delete \
  --storage-class GLACIER
```

### Restore Procedures

```bash
# Restore PostgreSQL from backup
gunzip < /backups/postgres/acquisitionos_20240101_120000.sql.gz | \
  docker compose exec -T postgres psql -U postgres acquisitionos

# Restore Redis from RDB
docker compose stop redis
cp /backups/redis/dump.rdb /var/lib/redis/data/dump.rdb
docker compose start redis
```

### Automated Backup Schedule

```cron
# Daily full backup at 2 AM
0 2 * * * /opt/acquisitionos/scripts/backup-database.sh >> /var/log/acquisitionos-backup.log 2>&1

# Hourly incremental backup (WAL archiving)
0 * * * * /opt/acquisitionos/scripts/backup-wal.sh >> /var/log/acquisitionos-backup.log 2>&1

# Weekly S3 sync
0 3 * * 0 /opt/acquisitionos/scripts/backup-uploads.sh >> /var/log/acquisitionos-backup.log 2>&1
```

---

## 12. Scaling Strategy

### Horizontal Scaling for Next.js

```yaml
# Scale frontend replicas
frontend:
  deploy:
    replicas: 3  # Scale to 3 instances
```

Nginx automatically load balances across replicas using `least_conn`.

### Celery Worker Scaling

```bash
# Scale workers per queue
docker compose up -d --scale celery-worker=4

# Or run dedicated workers
celery -A app.celery_app worker -Q email --concurrency=8 -n email@%h
celery -A app.celery_app worker -Q scraping --concurrency=4 -n scraping@%h
```

### Redis Clustering

For high-availability Redis:

```yaml
# Use Redis Sentinel for failover
redis:
  image: redis:7-alpine
  command: redis-server --sentinel /etc/redis/sentinel.conf
```

Or use managed Redis (ElastiCache, Memorystore, Upstash).

### Database Read Replicas

```sql
-- Create a read replica connection
-- Application reads from replica, writes to primary

-- Primary: your-primary-db.example.com
-- Replica: your-replica-db.example.com
```

Update Prisma configuration for read/write splitting:

```typescript
// Use DATABASE_URL for writes, READ_REPLICA_URL for reads
const readClient = new PrismaClient({
  datasources: { db: { url: process.env.READ_REPLICA_URL } },
});
```

### Auto-Scaling Rules

| Metric | Scale Up | Scale Down |
|---|---|---|
| CPU > 70% for 5 min | Add 1 instance | — |
| CPU < 30% for 15 min | — | Remove 1 instance |
| Request latency P99 > 3s | Add 1 instance | — |
| Celery queue > 500 | Add 1 worker | — |
| Celery queue < 50 | — | Remove 1 worker |
| Memory > 80% | Add 1 instance | — |

---

## 13. Security Hardening Checklist

### Application Security

- [ ] `ENVIRONMENT=production` set
- [ ] `AUTH_DEV_MODE=false`
- [ ] `AUTH_DEV_OTP_IN_RESPONSE=false`
- [ ] `AUTH_BYPASS_EMAIL=false`
- [ ] `JWT_SECRET` is strong (≥64 bytes)
- [ ] `TOKEN_ENCRYPTION_KEY` set (Fernet key)
- [ ] All default passwords changed
- [ ] Admin endpoints are IP-restricted
- [ ] Rate limiting enabled on all endpoints
- [ ] CSRF protection enabled
- [ ] Security headers configured (Nginx)
- [ ] CORS configured for specific origins only

### Infrastructure Security

- [ ] SSL/TLS enabled (HTTPS only)
- [ ] HSTS header set with preload
- [ ] Database not exposed to internet
- [ ] Redis requires authentication
- [ ] Docker images use non-root user
- [ ] Firewall rules configured (only 80, 443 open)
- [ ] SSH key-based authentication only
- [ ] Fail2ban configured for SSH brute-force
- [ ] Regular security updates applied
- [ ] Container images scanned (Trivy)

### Data Security

- [ ] Database encrypted at rest
- [ ] Redis persistence encrypted
- [ ] OAuth tokens encrypted at rest (Fernet)
- [ ] PII fields encrypted or hashed
- [ ] Backup encryption enabled
- [ ] Data retention policies implemented
- [ ] GDPR compliance features enabled
- [ ] Audit logging enabled

### Network Security

- [ ] VPC / private network for internal communication
- [ ] Security groups restrict inter-service communication
- [ ] WAF (Cloudflare, AWS WAF) in front
- [ ] DDoS protection enabled
- [ ] VPN for administrative access
- [ ] API gateway for external API access

---

## 14. Performance Optimization

### Next.js Optimization

```typescript
// next.config.js
module.exports = {
  // Enable compression
  compress: true,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },

  // Static generation where possible
  output: 'standalone',

  // Experimental features
  experimental: {
    optimizeCss: true,
  },
};
```

### Database Optimization

- Add indexes for frequently queried columns (already done in Prisma schema)
- Use connection pooling (PgBouncer for PostgreSQL)
- Implement read replicas for heavy read workloads
- Use Prisma's `select` to fetch only needed fields
- Enable query logging to identify slow queries

### Redis Optimization

```bash
# Redis configuration for performance
maxmemory 512mb
maxmemory-policy allkeys-lru
save 60 1000        # RDB every 60s if 1000 keys changed
appendonly yes       # AOF persistence
appendfsync everysec # Sync every second
```

### Caching Strategy

| Data Type | Cache TTL | Strategy |
|---|---|---|
| User session | 15 min (access token lifetime) | Cache-aside |
| Subscription status | 5 min | Cache-aside with invalidation |
| Lead search results | 30 sec | Cache-aside |
| Pipeline view | 1 min | Cache-aside with invalidation |
| Plan entitlements | 1 hour | Cache-aside (rarely changes) |
| Credit balance | 30 sec | Write-through |
| Rate limit counters | 1 min | Native Redis TTL |

---

## 15. Incident Response Runbook

### Severity Levels

| Level | Description | Response Time | Examples |
|---|---|---|---|
| P1 — Critical | Service down, data loss | < 15 min | Database down, payment failures |
| P2 — High | Major feature broken | < 1 hour | Auth broken, discovery failing |
| P3 — Medium | Minor feature degraded | < 4 hours | Slow AI responses, email delays |
| P4 — Low | Non-urgent issue | < 24 hours | UI bugs, minor errors |

### P1: Service Down

1. **Identify** the failing component:
   ```bash
   docker compose ps
   docker compose logs --tail=100
   curl https://your-domain.com/api/health
   ```

2. **Communicate**: Post to status page and team channel

3. **Mitigate**: Restart failed services
   ```bash
   docker compose restart <service>
   ```

4. **Investigate**: Check logs, metrics, recent deployments

5. **Resolve**: Apply fix or rollback

6. **Post-mortem**: Document within 48 hours

### P1: Database Down

1. Check PostgreSQL status:
   ```bash
   docker compose exec postgres pg_isready -U postgres
   ```

2. Check disk space:
   ```bash
   df -h
   ```

3. Check connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```

4. Restart if needed:
   ```bash
   docker compose restart postgres
   ```

5. Restore from backup if data corruption

### P1: Payment Failures

1. Check Stripe/Razorpay status pages
2. Verify webhook signatures are correct
3. Check PaymentWebhook table for unprocessed events
4. Re-process failed webhooks:
   ```bash
   # From Stripe Dashboard or CLI
   stripe events resend evt_xxx
   ```

---

## 16. Rollback Procedures

### Application Rollback

```bash
# 1. Identify the working version
git log --oneline -10

# 2. Checkout the known-good version
git checkout <commit-hash>

# 3. Rebuild and deploy
docker compose build
docker compose up -d

# 4. Verify
curl https://your-domain.com/api/health
```

### Database Rollback

```bash
# If a migration broke things:

# 1. Stop the application
docker compose stop frontend backend celery-worker

# 2. Restore from backup
gunzip < /backups/postgres/acquisitionos_TIMESTAMP.sql.gz | \
  docker compose exec -T postgres psql -U postgres acquisitionos

# 3. Start services
docker compose start frontend backend celery-worker
```

### Quick Rollback Script

```bash
#!/bin/bash
# rollback.sh — Quick rollback to previous deployment

echo "Rolling back to previous deployment..."

# Pull the previous image
docker compose pull --quiet

# Restart with previous images
docker compose up -d --force-recreate

# Wait for health check
sleep 10

# Verify
if curl -sf http://localhost:3000/api/health > /dev/null; then
    echo "Rollback successful!"
else
    echo "Rollback may have issues. Check logs."
    docker compose logs --tail=50
fi
```

---

## 17. Phase-Specific Deployment Notes

### Phase 1: Core Infrastructure

- Deploy PostgreSQL and Redis first
- Verify database connectivity before starting the application
- Run `prisma db push` to create tables
- Seed plan entitlements

### Phase 2: Design System

- No special deployment considerations (frontend only)
- Verify static asset caching in Nginx

### Phase 3: Authentication

- Set `JWT_SECRET` and `JWT_REFRESH_SECRET` before first deployment
- Configure Google OAuth in Google Cloud Console
- Test auth flow end-to-end before going live
- Disable `AUTH_DEV_MODE` in production

### Phase 4: Subscription & Billing

- Configure Stripe or Razorpay (whichever is your primary payment provider)
- Set up webhook endpoints in the provider dashboard
- Test payment flow with test mode first
- Verify webhook signature verification works
- Seed plan entitlements with `scripts/seed-entitlements.ts`

### Phase 5: AI Features

- Set `ZAI_API_KEY` (required for AI features to work)
- AI features may take >10 seconds — ensure proxy timeout is high enough
- Consider Vercel Pro plan if deploying serverless (60s timeout)

### Phase 6: Security

- Set `TOKEN_ENCRYPTION_KEY` (Fernet key for OAuth token encryption)
- Configure Sentry DSN for error tracking
- Enable rate limiting on all endpoints
- Configure security headers in Nginx
- Run `bun run security:scan` to verify configuration

### Phase 7: Lead Discovery & Pipeline

- Set `DISCOVERY_MAX_CONCURRENT_JOBS` based on your AI API quota
- Test discovery flow with a small batch first
- Verify scraping endpoints have appropriate rate limits

### Phase 8: AI Chat & Sales Coach

- Same `ZAI_API_KEY` as Phase 5
- Test chat functionality with various lead contexts
- Verify credit deduction works per AI interaction

### Phase 9: Gmail Integration

- Create a separate OAuth client in Google Cloud Console for Gmail
- Enable Gmail API and Cloud Pub/Sub API
- Configure `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`
- Set up Pub/Sub topic for push notifications
- Test OAuth flow and email reading/writing

### Phase 10: Telegram & WhatsApp

- Create Telegram bot via @BotFather, configure `TELEGRAM_BOT_TOKEN`
- Set up Twilio or Meta WhatsApp Business API
- Configure webhook URLs for both services
- Test message sending and receiving

### Phase 11: Real-Time & Notifications

- Deploy WebSocket mini service (`mini-services/ws-service`)
- Verify Caddy/Nginx WebSocket proxy configuration
- Test real-time notification delivery
- Configure notification batching in Celery Beat

### Phase 12: Workflow Automation

- Set `WORKFLOW_MAX_RETRIES`, `WORKFLOW_TIMEOUT` environment variables
- Verify Celery workers have the `workflows` queue configured
- Test workflow trigger and execution
- Verify dead letter queue processing

### Phase 13: Competitor Intelligence

- No additional deployment requirements
- Competitor analysis uses existing `ZAI_API_KEY`
- Test competitor analysis flow

### Phase 14: Testing, Security, CI/CD & Documentation

- **CI/CD**: Review `.github/workflows/ci.yml`, `deploy.yml`, and `security.yml`
- **GitHub Secrets**: Configure all required secrets in repository settings:
  - `STAGING_DEPLOY_KEY`, `STAGING_HOST`, `STAGING_USER`, `STAGING_URL`
  - `PROD_DEPLOY_KEY`, `PROD_HOST`, `PROD_USER`, `PROD_URL`
  - `SLACK_WEBHOOK_URL`
- **Monitoring**: Deploy the full monitoring stack (Prometheus, Grafana, OTel)
- **Documentation**: Verify all docs in `docs/` are accurate and complete:
  - `RUNBOOK.md` — Operational procedures
  - `LAUNCH_CHECKLIST.md` — Pre-launch verification
  - `DISASTER_RECOVERY.md` — DR plan
  - `MONITORING_GUIDE.md` — Monitoring reference
  - `SECRETS_REFERENCE.md` — Secret rotation procedures
- **Backup**: Verify automated backup schedule and test restore
- **Compliance**: Verify GDPR export/delete, consent tracking, audit logs
- **Load Testing**: Run load tests to verify performance under stressng
- Verify rate limiting is working

### Phase 7: Lead Discovery

- Discovery jobs are async (Celery workers must be running)
- Set `DISCOVERY_MAX_CONCURRENT_JOBS` based on server capacity
- Set `ENRICHMENT_TIMEOUT_MS` appropriately (default 30s)
- Verify Celery worker has access to ZAI_API_KEY

### Phase 8: AI Chat

- Same ZAI_API_KEY requirements as Phase 5
- No additional deployment steps

### Phase 9: Gmail Integration

- Create separate Gmail OAuth client in Google Cloud Console
- Set up Pub/Sub topic and subscription
- Configure push endpoint URL
- Set `ENABLE_GMAIL_INTEGRATION=true`
- Test Gmail watch renewal (Celery Beat task)

### Phase 10: Telegram & WhatsApp

- Create Telegram bot via @BotFather, set webhook
- Configure Twilio or Meta WhatsApp Business API
- Set `ENABLE_TELEGRAM=true` and/or `ENABLE_WHATSAPP=true`
- Test webhook endpoints for each provider

### Phase 11: Real-Time

- Deploy WebSocket mini service (port 3003)
- Configure Nginx for WebSocket proxy (`/socket.io/` path)
- Set SSE timeout appropriately (`SSE_TIMEOUT=300000`)
- Test SSE connectivity at `/api/events/workflows`

### Phase 12: Workflow Automation Engine

- Set workflow environment variables (`WORKFLOW_MAX_RETRIES`, `WORKFLOW_TIMEOUT`, etc.)
- The `workflows` Celery queue is included in the default worker command
- Celery Beat schedule includes 4 workflow tasks (scheduler every 60s, recovery every 5min, cleanup daily, dead letter hourly)
- Webhook trigger endpoint (`/api/workflows/webhook/{id}`) does NOT require auth — configure rate limiting in Nginx
- SSE endpoint for workflow events at `/api/events/workflows?userId=xxx`
- Monitor dead letter queue size via `/api/workflows/metrics`
- Workflow execution is synchronous in the current single-process model — for production, use Celery workers for async execution
- Ensure `WORKFLOW_RETENTION_DAYS` is set to match your data retention policy (default: 90 days)
- Plan/credit enforcement is active: Free=3 workflows/50 exec, Pro=25/500, Elite=unlimited
