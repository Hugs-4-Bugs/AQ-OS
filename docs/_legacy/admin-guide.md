# AcquisitionOS Admin Guide

> **Version**: 3.0.0  
> **Audience**: System administrators, DevOps engineers, and platform operators  
> **Last Updated**: March 2026

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation and Setup](#installation-and-setup)
3. [Configuration](#configuration)
4. [User Management](#user-management)
5. [Monitoring and Alerts](#monitoring-and-alerts)
6. [Backup and Restore](#backup-and-restore)
7. [Troubleshooting Common Issues](#troubleshooting-common-issues)
8. [Performance Tuning](#performance-tuning)
9. [Security Best Practices](#security-best-practices)

---

## System Requirements

### Minimum Requirements

| Component | Requirement |
|-----------|-------------|
| **CPU** | 2 cores |
| **RAM** | 2 GB (4 GB recommended) |
| **Disk** | 10 GB free space (SSD recommended) |
| **OS** | Ubuntu 22.04+, Debian 12+, macOS 13+, or Windows with WSL2 |
| **Runtime** | Node.js 20+ or Bun 1.0+ |
| **Database** | SQLite 3.39+ (included) or PostgreSQL 15+ (recommended for production) |

### Recommended Production Requirements

| Component | Requirement |
|-----------|-------------|
| **CPU** | 4+ cores |
| **RAM** | 8 GB |
| **Disk** | 50 GB SSD |
| **OS** | Ubuntu 22.04 LTS |
| **Runtime** | Bun 1.0+ |
| **Database** | PostgreSQL 15+ with connection pooling |
| **Reverse Proxy** | Nginx or Caddy |
| **SSL** | Let's Encrypt or commercial certificate |

### External Service Requirements

| Service | Purpose | Required? |
|---------|---------|-----------|
| **SMTP Server** | Email delivery (verification, notifications, outreach) | Yes |
| **Google OAuth** | Social login | Recommended |
| **Stripe** | USD payment processing | For international payments |
| **Razorpay** | INR payment processing | For Indian payments |
| **Telegram Bot** | Telegram notifications | Optional |
| **WhatsApp Business API** | WhatsApp messaging | Optional |

---

## Installation and Setup

### Option 1: Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/acquisitionos.git
cd acquisitionos

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your configuration (see Configuration section)

# 3. Build and start
docker compose up -d

# 4. Check health
curl http://localhost:3000/api/health
```

### Option 2: Manual Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/acquisitionos.git
cd acquisitionos

# 2. Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# 3. Install dependencies
bun install

# 4. Configure environment
cp .env.example .env
# Edit .env with your configuration

# 5. Initialize database
bun run db:push
bun run db:generate

# 6. Start the application
bun run dev  # Development
# OR
bun run build && bun run start  # Production
```

### Option 3: Kubernetes

```bash
# 1. Apply namespace and secrets
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/secrets.yaml

# 2. Apply configurations
kubectl apply -f deploy/k8s/configmap.yaml

# 3. Deploy database (PostgreSQL)
kubectl apply -f deploy/k8s/postgres-statefulset.yaml

# 4. Deploy application
kubectl apply -f deploy/k8s/frontend-deployment.yaml

# 5. Configure ingress
kubectl apply -f deploy/k8s/ingress.yaml

# 6. Set up HPA for auto-scaling
kubectl apply -f deploy/k8s/hpa.yaml
```

### Option 4: Cloud Platforms

#### Railway
```bash
# Deploy using Railway CLI
railway up
# Health check path: /api/health
```

#### Render
```bash
# Deploy using render.yaml
# See deploy/render/render.yaml for configuration
# Health check path: /api/health
```

#### Vercel
```bash
# Deploy using Vercel CLI
vercel deploy --prod
# Note: Some features (webhooks, long-running processes) require a custom server
```

### First-Time Setup

After installation:

1. **Verify health**: `curl http://localhost:3000/api/health`
2. **Create admin account**: Sign up through the UI
3. **Configure SMTP**: Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` in `.env`
4. **Set up OAuth** (optional): Configure Google OAuth credentials
5. **Configure payments** (optional): Set up Stripe and/or Razorpay keys
6. **Run seed data** (development only): `bun run scripts/seed.ts`

---

## Configuration

### Environment Variables

All configuration is done through environment variables. Copy `.env.example` to `.env` and customize.

#### Core Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `file:./db/custom.db` | Database connection string |
| `JWT_SECRET` | Yes (prod) | — | Secret key for JWT signing (min 32 chars) |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Public app URL for callbacks |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |

#### Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret |
| `GOOGLE_PUBLIC_CLIENT_ID` | No | — | Google OAuth public client ID (frontend) |
| `AUTH_DEV_MODE` | No | `false` | Auto-verify emails in dev mode |
| `AUTH_BYPASS_EMAIL` | No | `false` | Skip email sending |
| `AUTH_LOG_OTP` | No | `false` | Log OTPs to console |

#### Email (SMTP)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | — | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASSWORD` | No | — | SMTP password |
| `SMTP_FROM` | No | `noreply@acquisitionos.com` | From email address |
| `SMTP_SECURE` | No | `false` | Use TLS |

#### Payment — Stripe

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | No | — | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | No | — | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | No | — | Stripe publishable key (frontend) |

#### Payment — Razorpay

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RAZORPAY_KEY_ID` | No | — | Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | No | — | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | No | — | Razorpay webhook secret |

#### Integrations

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | No | — | Telegram bot API token |
| `TWILIO_ACCOUNT_SID` | No | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | No | — | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | No | — | Twilio phone number |

#### Feature Flags

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FEATURE_WORKFLOWS` | No | `true` | Enable workflow automation |
| `FEATURE_COMPETITOR` | No | `true` | Enable competitor analysis |
| `FEATURE_MESSAGING` | No | `true` | Enable broadcast messaging |
| `FEATURE_AI_ASSISTANT` | No | `true` | Enable AI chat assistant |

### Nginx Configuration

For production deployments behind Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Health check (no auth required)
    location /api/health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }
}
```

---

## User Management

### User Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| **Owner** | Account creator | Full access + billing + user management |
| **Admin** | Organization administrator | All features + user management |
| **Member** | Standard team member | Read/write access to assigned resources |
| **Viewer** | Read-only access | View dashboards and reports only |

### Managing Users

#### Via UI
1. Go to **Settings → Organization → Team**
2. Click **"Invite Member"**
3. Enter email and select role
4. The invitee receives an email with an acceptance link

#### Via API
```bash
# Invite a user
curl -X POST http://localhost:3000/api/settings/org/invites \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "newuser@example.com", "role": "member"}'
```

### Account Lockout

Accounts are automatically locked after too many failed login attempts:
- **Threshold**: 5 failed attempts within 15 minutes
- **Lock duration**: 30 minutes (increases with repeated lockouts)
- **Unlock**: Automatic after cooldown, or admin can manually unlock

### Deactivating Users

1. Go to **Settings → Organization → Team**
2. Find the user and click the **"..."** menu
3. Select **"Deactivate"**
4. The user's sessions are immediately revoked

---

## Monitoring and Alerts

### Health Check Endpoints

#### Basic Health Check
```bash
curl http://localhost:3000/api/health
```

Returns: `200` if healthy, `503` if unhealthy. Checks database, memory, and environment variables.

#### Detailed Health Check
```bash
curl http://localhost:3000/api/health/detailed
```

Returns component-level status for: database, memory, disk, process, environment variables, and external providers.

### Monitoring Dashboard

Access the built-in monitoring dashboard at **Settings → Monitoring** or via API:

```bash
curl http://localhost:3000/api/metrics/dashboard \
  -H "Authorization: Bearer <admin-token>"
```

The dashboard provides:
- **System Health** — CPU, memory, uptime
- **API Performance** — Request rates, error rates, p50/p95/p99 response times
- **Database Metrics** — Query counts, slow queries, operation breakdown
- **Business Metrics** — Active users, leads, deals, credits, workflows
- **Active Alerts** — Current alerts with severity levels
- **Recent Logs** — Color-coded log viewer
- **Traces** — Distributed trace viewer

Auto-refreshes every 30 seconds.

### Alert Rules

The system automatically evaluates 8 alert rules every 30 seconds:

| Alert | Condition | Severity |
|-------|-----------|----------|
| High Error Rate | >5% error rate | High |
| Slow Response | >2s average response time | High |
| DB Connection Failure | Database unreachable | Critical |
| High Memory | >85% heap usage | Medium |
| Critical Memory | >95% heap usage | Critical |
| Credit Anomaly | Unusual credit consumption | Medium |
| API Latency Spike | >5s p95 response time | High |
| Zero Request Volume | No requests for 10 minutes | Low |

### Prometheus Integration

Export metrics for Prometheus scraping:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'acquisitionos'
    scrape_interval: 30s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: /api/metrics
```

### Grafana Dashboards

Pre-built Grafana dashboards are available in `deploy/grafana/dashboards/`:
- `app-overview.json` — Application overview
- `infrastructure.json` — Infrastructure metrics

---

## Backup and Restore

### Automated Backups

```bash
# Create a backup
bash scripts/backup/backup.sh

# Backups are stored in ./backups/ with timestamp
# Includes: SQLite database, uploads, configuration
```

### Backup Schedule

Set up a cron job for automated backups:

```bash
# Run backup script daily at 2 AM
bash scripts/backup/cron-setup.sh
```

This creates a cron entry:
```
0 2 * * * /path/to/acquisitionos/scripts/backup/backup.sh >> /var/log/acquisitionos-backup.log 2>&1
```

### Manual Backup

```bash
# Create a named backup
BACKUP_NAME=pre-migration bash scripts/backup/backup.sh

# Create a snapshot (point-in-time copy)
bash scripts/backup/snapshot.sh
```

### Restore

```bash
# List available backups
ls -la backups/

# Restore from a specific backup
BACKUP_FILE=backups/backup_20260305_020000.tar.gz bash scripts/backup/restore.sh
```

### Backup Retention

Configure retention policy:

```bash
# Run retention cleanup (keeps last 30 days)
bash scripts/backup/retention.sh
```

Default retention:
- Daily backups: Keep for 30 days
- Weekly backups: Keep for 12 weeks
- Monthly backups: Keep for 12 months

### Database Migration Rollback

```bash
# Rollback the last migration
bash scripts/backup/migration-rollback.sh
```

---

## Troubleshooting Common Issues

### Application Won't Start

**Symptom**: `bun run dev` fails or crashes immediately

**Solutions**:
1. Check `DATABASE_URL` in `.env` — ensure the path is correct
2. Run `bun run db:push` to ensure schema is in sync
3. Run `bun run db:generate` to regenerate Prisma client
4. Check port 3000 is not already in use: `lsof -i :3000`
5. Try with webpack instead of Turbopack: `next dev --webpack`

### Database Connection Errors

**Symptom**: "Database connection failed" in health check

**Solutions**:
1. Verify `DATABASE_URL` format:
   - SQLite: `file:./db/custom.db`
   - PostgreSQL: `postgresql://user:password@host:5432/dbname`
2. Check file permissions for SQLite database
3. For PostgreSQL, verify the server is running and accessible
4. Check connection pool settings

### Email Not Sending

**Symptom**: Verification emails, OTPs, or notifications not delivered

**Solutions**:
1. Verify SMTP settings: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
2. Test SMTP connection:
   ```bash
   bun -e "
   const nodemailer = require('nodemailer');
   const t = nodemailer.createTransport({host: process.env.SMTP_HOST, port: 587, auth: {user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD}});
   t.verify().then(() => console.log('SMTP OK')).catch(e => console.error('SMTP FAIL:', e));
   "
   ```
3. For Gmail, use an App Password (not your regular password)
4. Check `SMTP_PASSWORD` — if it contains spaces, quote it in `.env`

### Google OAuth Not Working

**Symptom**: "Continue with Google" button doesn't work or redirects fail

**Solutions**:
1. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
2. Ensure the redirect URI in Google Console matches:
   - `https://yourdomain.com/api/auth/callback/google`
3. The callback URL must be publicly accessible for OAuth to work
4. In development, use a tunnel (ngrok) or set `GOOGLE_PUBLIC_CLIENT_ID`

### Payment Webhook Failures

**Symptom**: Payments succeed but plan is not updated

**Solutions**:
1. Verify `STRIPE_WEBHOOK_SECRET` or `RAZORPAY_WEBHOOK_SECRET` matches the dashboard
2. Check webhook URL is accessible:
   - Stripe: `https://yourdomain.com/api/payments/webhook/stripe`
   - Razorpay: `https://yourdomain.com/api/payments/webhook/razorpay`
3. Review webhook logs in the Stripe/Razorpay dashboard
4. Use webhook replay: `POST /api/payments/webhook-replay`

### High Memory Usage

**Symptom**: Application consuming excessive memory, slow responses

**Solutions**:
1. Check `/api/health/detailed` for memory breakdown
2. Restart the application if heap usage > 90%
3. Reduce `NODE_OPTIONS=--max-old-space-size=4096` if needed
4. For production, consider switching to PostgreSQL (SQLite can grow large)
5. Enable connection pooling for PostgreSQL

### Rate Limiting Issues

**Symptom**: Legitimate requests getting 429 responses

**Solutions**:
1. Check rate limit configuration in `src/lib/security/rate-limiter.ts`
2. Adjust limits for your use case:
   ```typescript
   const LIMITERS = {
     api:     { windowMs: 60000, max: 60 },   // 60/min
     auth:    { windowMs: 60000, max: 5 },     // 5/min
     ai:      { windowMs: 60000, max: 10 },    // 10/min
   };
   ```
3. API key requests may have separate rate limits based on plan

### Slow Database Queries

**Symptom**: API responses taking >1s, high DB latency in health check

**Solutions**:
1. Check `/api/health/detailed` for DB latency
2. Review slow queries in monitoring dashboard
3. Add indexes for frequently queried fields
4. Consider migrating from SQLite to PostgreSQL for better concurrency
5. Enable Prisma query logging to identify N+1 queries

---

## Performance Tuning

### Application

| Setting | Default | Recommended (Production) | Description |
|---------|---------|--------------------------|-------------|
| `NODE_OPTIONS` | — | `--max-old-space-size=4096` | Node.js heap size |
| Connection pool | 5 | 10-20 (PostgreSQL) | Prisma connection pool size |
| Cache TTL | 60s | 300s | API cache time-to-live |

### Database

**SQLite Optimization**:
- Enable WAL mode: `PRAGMA journal_mode=WAL;`
- Set busy timeout: `PRAGMA busy_timeout=5000;`
- Increase cache size: `PRAGMA cache_size=-64000;` (64MB)

**PostgreSQL Optimization**:
```sql
-- Connection pooling
SET max_connections = 100;
SET shared_buffers = '256MB';

-- Query optimization
SET effective_cache_size = '1GB';
SET work_mem = '16MB';
SET maintenance_work_mem = '128MB';
```

### Caching

The application uses an in-memory cache layer. Configuration:

| Cache | Default TTL | Max Entries | Description |
|-------|-------------|-------------|-------------|
| API Cache | 60s | 500 | HTTP response caching |
| Credit Balance | 30s | 1000 | Credit balance lookups |
| Entitlements | 120s | 500 | Plan entitlement checks |
| Rate Limiter | 60s | 10000 | Rate limit counters |

### Auto-Scaling

For Kubernetes deployments:

```yaml
# deploy/k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        targetAverageUtilization: 70
    - type: Resource
      resource:
        name: memory
        targetAverageUtilization: 80
```

---

## Security Best Practices

### Production Checklist

- [ ] **JWT_SECRET** — Set a strong, unique secret (min 32 characters)
- [ ] **HTTPS** — Enable SSL/TLS for all traffic
- [ ] **SMTP** — Configure with TLS for email delivery
- [ ] **Rate Limiting** — Verify all rate limiters are active
- [ ] **CORS** — Restrict allowed origins
- [ ] **CSP Headers** — Configure Content-Security-Policy
- [ ] **HSTS** — Enable HTTP Strict Transport Security
- [ ] **Webhook Secrets** — Set Stripe/Razorpay webhook signing secrets
- [ ] **Database** — Use PostgreSQL with encrypted connections in production
- [ ] **Backups** — Configure automated daily backups
- [ ] **MFA** — Encourage all admin users to enable MFA
- [ ] **API Keys** — Set expiration dates on all API keys
- [ ] **Audit Logging** — Verify audit logging is working
- [ ] **Secrets Management** — Use environment variables, never commit secrets

### API Key Security

- **Scopes**: Assign minimum required scopes to each API key
- **Expiration**: Set expiration dates (30-90 days recommended)
- **Rotation**: Rotate keys regularly using the rotate endpoint
- **Audit**: Review API key usage analytics weekly
- **Revocation**: Immediately revoke compromised keys

### Database Security

- **Encryption**: Enable connection encryption (SSL/TLS) for PostgreSQL
- **Access**: Restrict database access to application servers only
- **Backups**: Encrypt backup files at rest
- **Principle of least privilege**: Use a dedicated database user with minimal permissions
- **Audit**: Enable database-level audit logging for sensitive tables

### Webhook Security

- **Signature Verification**: Always configure webhook signing secrets
- **HTTPS Only**: Only accept webhook payloads over HTTPS
- **Idempotency**: Handle duplicate webhook deliveries gracefully
- **Timing-Safe Comparison**: Never use `===` or `!==` for signature comparison

### Input Validation

The application includes comprehensive input validation:
- **SQL Injection** — Pattern detection in user inputs
- **XSS** — HTML sanitization for user-generated content
- **Path Traversal** — Block `../` patterns in file paths
- **Command Injection** — Block shell metacharacters
- **CSRF** — Double-submit cookie pattern with origin validation
- **Upload Security** — MIME type whitelist, magic bytes verification, filename sanitization

### Security Monitoring

- **Security Alerts**: Automatic alerts for suspicious login activity
- **Device Tracking**: Known device management with new device notifications
- **Account Lockout**: Automatic lockout after failed login attempts
- **Audit Logs**: Comprehensive audit trail for all sensitive operations
- **Rate Limiting**: Prevent brute force and abuse attacks

### Incident Response

1. **Detection**: Check monitoring dashboard and security alerts
2. **Containment**: Disable compromised API keys, lock affected accounts
3. **Investigation**: Review audit logs (`GET /api/audit`) for the affected user/IP
4. **Remediation**: Reset passwords, revoke sessions, update secrets
5. **Recovery**: Verify system health, restore from backup if needed
6. **Post-Incident**: Update security policies, review and improve detection rules

---

*Last updated: 2026-03-05 • AcquisitionOS v3.0.0*
