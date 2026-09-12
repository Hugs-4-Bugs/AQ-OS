# AcquisitionOS — Environment Setup Guide

Complete guide to setting up the AcquisitionOS development and production environments across all phases (1–11).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start (5-Step Setup)](#2-quick-start-5-step-setup)
3. [Environment Variables by Phase](#3-environment-variables-by-phase)
4. [Database Setup](#4-database-setup)
5. [Redis Setup](#5-redis-setup)
6. [Celery Worker Setup](#6-celery-worker-setup)
7. [WebSocket Service Setup](#7-websocket-service-setup)
8. [Monitoring Stack Setup](#8-monitoring-stack-setup)
9. [Development Mode vs Production Mode](#9-development-mode-vs-production-mode)
10. [Troubleshooting Common Issues](#10-troubleshooting-common-issues)

---

## 1. Prerequisites

| Requirement | Version | Installation |
|---|---|---|
| **Node.js** | ≥ 20 | [nodejs.org](https://nodejs.org/) |
| **Bun** | ≥ 1.0 | [bun.sh](https://bun.sh/) |
| **Python** | ≥ 3.11 | [python.org](https://www.python.org/) |
| **Docker** | ≥ 24.0 | [docker.com](https://www.docker.com/) |
| **Docker Compose** | ≥ 2.20 | Included with Docker Desktop |
| **Git** | ≥ 2.40 | [git-scm.com](https://git-scm.com/) |
| **OpenSSL** | Any | System package manager |

### Verify Prerequisites

```bash
node --version    # v20.x or higher
bun --version     # 1.x or higher
python3 --version # 3.11 or higher
docker --version  # 24.x or higher
docker compose version  # 2.20 or higher
```

---

## 2. Quick Start (5-Step Setup)

### Step 1: Clone and Install

```bash
git clone https://github.com/your-org/acquisitionos.git
cd acquisitionos

# Install frontend dependencies
bun install

# Install backend dependencies
cd backend
pip install -r requirements.txt
cd ..
```

### Step 2: Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your values (see Section 3 for all variables)
nano .env
```

At minimum, set these required variables:

```env
DATABASE_URL="file:./db/custom.db"
JWT_SECRET="<generate-with-openssl-rand-base64-64>"
ZAI_API_KEY="<your-zai-api-key>"
```

### Step 3: Initialize Database

```bash
# Push schema to SQLite (development)
bun run db:push

# Seed plan entitlements
bun run scripts/seed-entitlements.ts
```

### Step 4: Start Services

```bash
# Development (frontend only)
bun run dev

# Full stack with Docker Compose
docker compose up -d
```

### Step 5: Verify

```bash
# Check frontend
curl http://localhost:3000/api/health

# Check backend (if running)
curl http://localhost:8000/health

# Check Redis (if running)
docker compose exec redis redis-cli PING
```

---

## 3. Environment Variables by Phase

### Phase 1: Core Infrastructure

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `file:./db/custom.db` | Database connection string (SQLite for dev, PostgreSQL for prod) |
| `REDIS_URL` | Yes | `redis://localhost:6379/0` | Redis connection URL |
| `REDIS_PASSWORD` | Prod | — | Redis authentication password |
| `CELERY_BROKER_URL` | Yes | `redis://localhost:6379/1` | Celery broker (Redis DB 1) |
| `CELERY_RESULT_BACKEND` | Yes | `redis://localhost:6379/2` | Celery result backend (Redis DB 2) |
| `APP_SECRET_KEY` | Yes | — | Application secret key for cryptographic operations |
| `ENVIRONMENT` | No | `development` | `development` or `production` |
| `FRONTEND_URL` | No | `http://localhost:3000` | Frontend URL for CORS |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed CORS origins |

### Phase 2: Design System (No additional env vars)

No environment variables are introduced in Phase 2 (UI and layout only).

### Phase 3: Authentication & Authorization

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | Yes | — | Secret for signing JWT access tokens (15 min expiry) |
| `JWT_REFRESH_SECRET` | Yes | — | Secret for signing JWT refresh tokens (30 day expiry) |
| `NEXTAUTH_SECRET` | Conditional | — | Required if using NextAuth.js |
| `NEXTAUTH_URL` | Conditional | — | Required if using NextAuth.js (e.g., `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | Conditional | — | Google OAuth client ID for sign-in |
| `GOOGLE_CLIENT_SECRET` | Conditional | — | Google OAuth client secret for sign-in |
| `AUTH_DEV_MODE` | No | `true` (dev) | Master feature flag for dev auth behavior |
| `AUTH_AUTO_VERIFY` | No | `true` (dev) | Auto-verify email on signup |
| `AUTH_DEV_OTP_IN_RESPONSE` | No | `true` (dev) | Return OTP in API response (dev only) |
| `AUTH_DEV_OTP_IN_LOG` | No | `true` (dev) | Log OTP to console |
| `AUTH_BYPASS_EMAIL` | No | `true` (dev) | Skip email sending |
| `OTP_MAX_ATTEMPTS` | No | `5` | Max OTP verification attempts before lockout |
| `OTP_LOCKOUT_MINUTES` | No | `15` | Lockout duration after max attempts |
| `ENABLE_MAGIC_LINK` | No | `true` | Enable magic link login |
| `ENABLE_OTP_LOGIN` | No | `true` | Enable OTP login |
| `ENABLE_GOOGLE_OAUTH` | No | `false` | Enable Google OAuth sign-in |

### Phase 4: Subscription & Billing

| Variable | Required | Default | Description |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Conditional | — | Stripe API secret key (sk_test_... or sk_live_...) |
| `STRIPE_WEBHOOK_SECRET` | Conditional | — | Stripe webhook endpoint signing secret (whsec_...) |
| `STRIPE_PUBLISHABLE_KEY` | Conditional | — | Stripe publishable key (pk_test_... or pk_live_...) |
| `RAZORPAY_KEY_ID` | Conditional | — | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | Conditional | — | Razorpay API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Conditional | — | Razorpay webhook signing secret |
| `TRIAL_DAYS` | No | `14` | Free trial duration in days |
| `GST_RATE` | No | `0.18` | GST rate for Indian users (18%) |

### Phase 5: AI Features & Integrations

| Variable | Required | Default | Description |
|---|---|---|---|
| `ZAI_API_KEY` | Yes | — | z-ai-web-dev-sdk API key (powers all AI features) |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key (alternative LLM) |
| `SERPAPI_KEY` | No | — | SerpAPI key for web scraping |
| `BRIGHTDATA_USERNAME` | No | — | Bright Data proxy username |
| `BRIGHTDATA_PASSWORD` | No | — | Bright Data proxy password |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | No | — | SMTP authentication username |
| `SMTP_PASSWORD` | No | — | SMTP authentication password |
| `SMTP_FROM_NAME` | No | `AcquisitionOS` | Sender display name |
| `SMTP_FROM_EMAIL` | No | `noreply@acquisitionos.com` | Sender email address |
| `RESEND_API_KEY` | No | — | Resend API key (email delivery) |

### Phase 6: Security & Audit

| Variable | Required | Default | Description |
|---|---|---|---|
| `TOKEN_ENCRYPTION_KEY` | Prod | — | Fernet key for encrypting OAuth tokens at rest |
| `MAX_LOGIN_ATTEMPTS` | No | `5` | Max login attempts before lockout |
| `LOGIN_LOCKOUT_MINUTES` | No | `15` | Lockout duration in minutes |
| `RATE_LIMIT_AUTH` | No | `5/minute` | Rate limit for auth endpoints |
| `RATE_LIMIT_AI` | No | `30/minute` | Rate limit for AI endpoints |
| `RATE_LIMIT_SCRAPING` | No | `10/minute` | Rate limit for scraping endpoints |
| `RATE_LIMIT_GENERAL` | No | `200/minute` | Rate limit for general endpoints |
| `SENTRY_DSN` | No | — | Sentry DSN for error tracking |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.1` | Sentry trace sampling rate |

### Phase 7: Lead Discovery & Pipeline

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISCOVERY_MAX_CONCURRENT_JOBS` | No | `3` | Max concurrent discovery jobs per user |
| `DISCOVERY_RESULTS_PER_JOB` | No | `50` | Max results per discovery job |
| `ENRICHMENT_TIMEOUT_MS` | No | `30000` | Enrichment request timeout (30s) |
| `SCRAPING_USER_AGENT` | No | `AcquisitionOS/1.0` | User-Agent header for scraping |
| `IMPORT_MAX_ROWS` | No | `1000` | Max rows for CSV import |
| `EXPORT_MAX_ROWS` | No | `5000` | Max rows for CSV/JSON export |

### Phase 8: AI Chat & Sales Coach

| Variable | Required | Default | Description |
|---|---|---|---|
| `ZAI_API_KEY` | Yes | — | (Same as Phase 5 — powers AI chat) |

No additional environment variables beyond `ZAI_API_KEY` already defined in Phase 5.

### Phase 9: Gmail Integration

| Variable | Required | Default | Description |
|---|---|---|---|
| `GMAIL_CLIENT_ID` | Conditional | — | Google OAuth client ID for Gmail API |
| `GMAIL_CLIENT_SECRET` | Conditional | — | Google OAuth client secret for Gmail API |
| `GMAIL_REDIRECT_URI` | Conditional | `http://localhost:8000/api/integrations/gmail/callback` | OAuth redirect URI for Gmail |
| `GOOGLE_PUBSUB_TOPIC` | Conditional | — | Google Cloud Pub/Sub topic for push notifications |
| `GOOGLE_PUBSUB_SUBSCRIPTION` | No | — | Pub/Sub subscription name |
| `ENABLE_GMAIL_INTEGRATION` | No | `false` | Enable Gmail integration feature |

> **Note**: Gmail uses a separate OAuth credential set from sign-in. The backend config references `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, and `GOOGLE_GMAIL_REDIRECT_URI`.

### Phase 10: Telegram & WhatsApp Integrations

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Conditional | — | Telegram Bot API token (from @BotFather) |
| `TELEGRAM_BOT_USERNAME` | No | — | Telegram bot username (e.g., `@AcquisitionOSBot`) |
| `TWILIO_ACCOUNT_SID` | Conditional | — | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Conditional | — | Twilio Auth Token |
| `TWILIO_WHATSAPP_NUMBER` | No | `whatsapp:+14155238886` | Twilio WhatsApp sandbox number |
| `META_WHATSAPP_TOKEN` | Conditional | — | Meta WhatsApp Business API token |
| `META_WHATSAPP_PHONE_ID` | Conditional | — | Meta WhatsApp Phone Number ID |
| `META_WEBHOOK_VERIFY_TOKEN` | Conditional | — | Meta webhook verification token |
| `META_APP_SECRET` | Conditional | — | Meta App Secret for webhook signature verification |
| `ENABLE_TELEGRAM` | No | `false` | Enable Telegram integration |
| `ENABLE_WHATSAPP` | No | `false` | Enable WhatsApp integration |

### Phase 11: Real-Time & Notifications

| Variable | Required | Default | Description |
|---|---|---|---|
| `WS_HEARTBEAT_INTERVAL` | No | `30000` | WebSocket heartbeat interval in ms |
| `WS_RECONNECT_LIMIT` | No | `5` | Max WebSocket reconnection attempts |
| `SSE_TIMEOUT` | No | `300000` | Server-Sent Events timeout in ms (5 min) |
| `NOTIFICATION_BATCH_SIZE` | No | `50` | Batch size for bulk notification processing |
| `REDIS_PUBSUB_PREFIX` | No | `acos:pubsub:` | Redis Pub/Sub channel prefix |

### Phase 12: Workflow Automation Engine

| Variable | Required | Default | Description |
|---|---|---|---|
| `WORKFLOW_MAX_RETRIES` | No | `3` | Max retry attempts for failed workflow steps |
| `WORKFLOW_TIMEOUT` | No | `300000` | Execution timeout in ms (5 min default) |
| `WORKFLOW_QUEUE_SIZE` | No | `1000` | Max workflow execution queue size |
| `WORKFLOW_RETENTION_DAYS` | No | `90` | Days to retain execution history before cleanup |
| `WORKFLOW_DLQ_SIZE` | No | `500` | Max dead letter queue size per user |

### Phase 13: Competitor Intelligence

| Variable | Required | Default | Description |
|---|---|---|---|
| `COMPETITOR_SCAN_INTERVAL` | No | `86400` | Interval between competitor scans (seconds) |
| `COMPETITOR_MAX_SCANS_PER_DAY` | No | `10` | Max competitor scans per user per day |

### Phase 14: Testing, Security, CI/CD & Documentation

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITEST_COVERAGE_THRESHOLD` | No | `70` | Minimum code coverage percentage for CI |
| `SLACK_WEBHOOK_URL` | No | — | Slack webhook URL for CI/CD notifications |
| `STAGING_DEPLOY_KEY` | CI/CD | — | SSH private key for staging server deployment |
| `STAGING_HOST` | CI/CD | — | Staging server hostname |
| `STAGING_USER` | CI/CD | — | Staging server SSH user |
| `STAGING_URL` | CI/CD | — | Staging application URL for health checks |
| `PROD_DEPLOY_KEY` | CI/CD | — | SSH private key for production server deployment |
| `PROD_HOST` | CI/CD | — | Production server hostname |
| `PROD_USER` | CI/CD | — | Production server SSH user |
| `PROD_URL` | CI/CD | — | Production application URL for health checks |

> **Note**: CI/CD variables (`STAGING_*`, `PROD_*`, `SLACK_WEBHOOK_URL`) are configured as GitHub Secrets in repository settings, not in `.env`. They are used by the GitHub Actions workflows in `.github/workflows/`.

### Storage & Infrastructure

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_ACCESS_KEY_ID` | No | — | AWS access key for S3 storage |
| `AWS_SECRET_ACCESS_KEY` | No | — | AWS secret key for S3 storage |
| `AWS_S3_BUCKET` | No | `acquisitionos-assets` | S3 bucket name |
| `AWS_REGION` | No | `ap-south-1` | AWS region |
| `CLOUDFLARE_R2_ENDPOINT` | No | — | Cloudflare R2 endpoint (S3-compatible) |
| `POSTGRES_PASSWORD` | No | `acquisitionos_dev` | PostgreSQL password (Docker) |
| `FLOWER_PORT` | No | `5555` | Celery Flower monitoring port |
| `FLOWER_BASIC_AUTH` | No | `admin:password` | Celery Flower basic auth credentials |
| `ADMIN_EMAIL` | No | — | Admin user email |
| `ADMIN_PASSWORD` | No | — | Admin user password |
| `DIRECT_URL` | Prod | — | Direct database URL for Prisma migrations (PostgreSQL) |
| `READ_REPLICA_URL` | Prod | — | Read replica database URL for read/write splitting |

---

## 4. Database Setup

### Development (SQLite)

The default development setup uses SQLite via Prisma.

```bash
# Push schema to database
bun run db:push

# Generate Prisma client
bun run db:generate

# Open Prisma Studio (database browser)
bun run db:studio
```

The SQLite database file is stored at `db/custom.db` (configured via `DATABASE_URL=file:./db/custom.db`).

### Production (PostgreSQL)

For production, use PostgreSQL via Docker or a managed service like Supabase.

#### Option A: Docker Compose PostgreSQL

```bash
# Start PostgreSQL container
docker compose up -d postgres

# Wait for health check
docker compose exec postgres pg_isready -U postgres
```

#### Option B: Supabase (Cloud)

1. Create a project at [supabase.com](https://supabase.com/)
2. Get the Transaction Pooler URL (port 6543) for `DATABASE_URL`
3. Get the Direct Connection URL (port 5432) for `DIRECT_URL`
4. Push schema:

```bash
export DATABASE_URL="postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
export DIRECT_URL="postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Use production schema
npx prisma db push --schema=prisma/schema.production.prisma
npx prisma generate --schema=prisma/schema.production.prisma
```

#### Migrating from SQLite to PostgreSQL

1. Export data from SQLite using Prisma Studio or custom script
2. Update `DATABASE_URL` to PostgreSQL connection string
3. Run `prisma db push` with the production schema
4. Import data into PostgreSQL
5. Verify data integrity with row counts

### Seeding

```bash
# Seed plan entitlements (17 features × 3 plans = 51 records)
bun run scripts/seed-entitlements.ts
```

---

## 5. Redis Setup

### Development (Docker)

```bash
# Start Redis
docker compose up -d redis

# Verify
docker compose exec redis redis-cli PING
# Expected: PONG
```

### Production Configuration

```bash
# Start Redis with persistence and memory limit
redis-server \
  --appendonly yes \
  --maxmemory 512mb \
  --maxmemory-policy allkeys-lru \
  --requirepass "${REDIS_PASSWORD}"
```

### Redis Database Allocation

| DB | Purpose |
|---|---|
| 0 | Application cache, sessions, OTP, rate limiting |
| 1 | Celery broker (task queue) |
| 2 | Celery result backend |

### Verifying Redis Connectivity

```bash
# With password
redis-cli -a "${REDIS_PASSWORD}" PING

# Check info
redis-cli -a "${REDIS_PASSWORD}" INFO server
```

---

## 6. Celery Worker Setup

### Starting Workers

```bash
# Start worker with all queues
cd backend
celery -A app.celery_app worker --loglevel=info --concurrency=4 \
  -Q celery,email,billing,scraping,notifications,maintenance,workflows

# Start beat scheduler (periodic tasks)
celery -A app.celery_app beat --loglevel=info \
  --scheduler celery.beat:PersistentScheduler

# Start Flower (monitoring dashboard)
celery -A app.celery_app flower --port=5555
```

### Docker Compose

All Celery services are included in `docker-compose.yml`:

```bash
docker compose up -d celery-worker celery-beat celery-flower
```

### Celery Beat Schedule

The Beat scheduler runs these periodic tasks:

| Task | Interval | Description |
|---|---|---|
| Trial expiry check | Every 1 hour | Expires trials past their end date |
| Monthly credit reset | 1st of month | Resets monthly credits for all users |
| Credit warning detection | Every 30 min | Checks for low-credit users |
| Stale job cleanup | Every 6 hours | Cleans up expired/stale discovery jobs |
| Notification batching | Every 5 min | Processes notification queue |
| Workflow scheduler | Every 60 seconds | Processes scheduled/cron workflow triggers |
| Workflow recovery | Every 5 min | Recovers stuck workflow executions |
| Workflow cleanup | Daily at 3am | Removes old workflow execution history |
| Workflow dead letter processor | Every 1 hour | Processes dead letter queue items |

---

## 7. WebSocket Service Setup

### Mini Service Architecture

The WebSocket service runs as a separate mini service using Socket.io.

```bash
# Navigate to the WebSocket mini service
cd mini-services/ws-service

# Install dependencies
bun install

# Start the service (auto-restart on changes)
bun run dev
```

The WebSocket service runs on its own port (default: 3003). The Caddy gateway routes WebSocket connections through `/?XTransformPort=3003`.

### Frontend Connection

```typescript
import { io } from "socket.io-client";

const socket = io("/?XTransformPort=3003");
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WS_HEARTBEAT_INTERVAL` | `30000` | Heartbeat ping interval (ms) |
| `WS_RECONNECT_LIMIT` | `5` | Max reconnection attempts |
| `REDIS_PUBSUB_PREFIX` | `acos:pubsub:` | Redis Pub/Sub channel prefix |

---

## 8. Monitoring Stack Setup

### Prometheus + Grafana + OpenTelemetry

The monitoring stack is defined in `monitoring/docker-compose.monitoring.yml`.

```bash
# Start the monitoring stack
docker compose -f monitoring/docker-compose.monitoring.yml up -d
```

### Services

| Service | Port | Purpose |
|---|---|---|
| Prometheus | 9090 | Metrics collection and alerting |
| Grafana | 3001 | Dashboard and visualization |
| OTel Collector | 4317/4318 | Telemetry collection and routing |
| Node Exporter | 9100 | System metrics |
| Redis Exporter | 9121 | Redis metrics |
| Loki | 3100 | Log aggregation (optional) |

### Grafana Setup

1. Access Grafana at `http://localhost:3001`
2. Default credentials: `admin/admin`
3. Datasources are auto-provisioned from `monitoring/grafana/datasources.yml`
4. Dashboards are in `monitoring/grafana/dashboards/`

### Prometheus Alerts

16 alert rules are defined in `monitoring/prometheus/alerts.yml` across 5 categories:

- **Application**: Error rate, latency, endpoint down
- **Database**: Pool exhaustion
- **Redis**: Connection failures, memory
- **Celery**: Queue backlog, worker down
- **Infrastructure**: Disk space, memory pressure, CPU

---

## 9. Development Mode vs Production Mode

### Key Differences

| Feature | Development | Production |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` |
| Database | SQLite (`file:./db/custom.db`) | PostgreSQL |
| `AUTH_DEV_MODE` | `true` | `false` |
| `AUTH_AUTO_VERIFY` | `true` | `false` |
| `AUTH_DEV_OTP_IN_RESPONSE` | `true` | `false` |
| `AUTH_BYPASS_EMAIL` | `true` | `false` |
| Email delivery | Console log | Resend/SMTP |
| `JWT_SECRET` | Auto-generated warning | Required (app won't start without it) |
| Redis | Optional | Required |
| Celery | Optional | Required |
| Docker | Optional | Required |
| Monitoring | Optional | Required |
| SSL/TLS | Not required | Required |
| Rate limiting | Relaxed | Strict |

### Development Mode

In development mode:
- Email verification is skipped (users are auto-verified)
- OTPs are returned in API responses for easy testing
- Emails are logged to console instead of being sent
- JWT_SECRET warning is displayed but not blocking
- Redis and Celery are optional (graceful degradation)

### Production Mode

In production mode:
- `JWT_SECRET` and `APP_SECRET_KEY` are **required** (app exits if missing)
- Email verification is mandatory
- OTPs are never returned in API responses
- All emails are sent via Resend or SMTP
- Redis and Celery are required for background jobs
- Rate limiting is strictly enforced
- Security headers are applied to all responses

---

## 10. Troubleshooting Common Issues

### Database Issues

**Problem**: `Prisma Client could not be generated`

```bash
# Solution: Ensure DATABASE_URL is set and run generate
export DATABASE_URL="file:./db/custom.db"
bun run db:generate
```

**Problem**: `Can't reach database server` (PostgreSQL)

```bash
# Check: PostgreSQL is running
docker compose exec postgres pg_isready -U postgres

# Check: Connection string format
# For Supabase, use Transaction Pooler (port 6543) for DATABASE_URL
# Use Direct Connection (port 5432) for DIRECT_URL and migrations
```

**Problem**: `P1001: Can't reach database server`

```bash
# If using Supabase pooler, ensure ?pgbouncer=true is in the URL
DATABASE_URL="postgresql://user:pass@host:6543/db?pgbouncer=true"
```

### Auth Issues

**Problem**: Users can't sign up or log in

```bash
# In development, ensure AUTH_DEV_MODE=true
AUTH_DEV_MODE=true
AUTH_AUTO_VERIFY=true
AUTH_DEV_OTP_IN_RESPONSE=true

# In production, verify JWT_SECRET is set
JWT_SECRET=<64-byte-base64-string>
```

**Problem**: Google OAuth not working

```bash
# Verify credentials are set
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>

# Check redirect URI matches exactly
NEXTAUTH_URL=http://localhost:3000  # Must match Google Console
```

### Redis Issues

**Problem**: `Redis connection refused`

```bash
# Check Redis is running
docker compose exec redis redis-cli PING

# Check password
redis-cli -a "${REDIS_PASSWORD}" PING

# Restart Redis
docker compose restart redis
```

### Celery Issues

**Problem**: Tasks not being processed

```bash
# Check worker is running
docker compose logs celery-worker --tail=50

# Check Flower dashboard
open http://localhost:5555

# Restart worker
docker compose restart celery-worker
```

### AI Feature Issues

**Problem**: Discovery or enrichment failing

```bash
# Verify ZAI_API_KEY is set
echo $ZAI_API_KEY

# Check it's not empty in .env
grep ZAI_API_KEY .env

# Test locally
ZAI_API_KEY=your_key bun run dev
```

### Docker Issues

**Problem**: Port already in use

```bash
# Find process using the port
lsof -i :3000
lsof -i :5432
lsof -i :6379

# Kill the process or change the port in docker-compose.yml
```

**Problem**: Container keeps restarting

```bash
# Check logs
docker compose logs <service-name> --tail=100

# Common cause: missing environment variables
# Ensure all required variables are in .env
```

### Build Issues

**Problem**: `next build` fails

```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules and reinstall
rm -rf node_modules
bun install

# Regenerate Prisma client
bun run db:generate
```

**Problem**: TypeScript errors

```bash
# Run type check
bun run lint

# Common fix: regenerate Prisma client after schema changes
bun run db:push && bun run db:generate
```

### Email Issues

**Problem**: Emails not being sent

```bash
# Development: Check console output (emails are logged, not sent)
# Production: Verify SMTP or Resend configuration

# Test Resend
RESEND_API_KEY=re_xxx bun run dev

# Test SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-password
```

---

## Environment File Template

```env
# ═══════════════════════════════════════════════════════════
# AcquisitionOS — Complete Environment Configuration
# ═══════════════════════════════════════════════════════════

# ── Phase 1: Core Infrastructure ──────────────────────────
DATABASE_URL="file:./db/custom.db"
REDIS_URL="redis://localhost:6379/0"
REDIS_PASSWORD=""
CELERY_BROKER_URL="redis://localhost:6379/1"
CELERY_RESULT_BACKEND="redis://localhost:6379/2"
APP_SECRET_KEY=""
ENVIRONMENT="development"
FRONTEND_URL="http://localhost:3000"
ALLOWED_ORIGINS="http://localhost:3000"

# ── Phase 3: Authentication ──────────────────────────────
JWT_SECRET=""
JWT_REFRESH_SECRET=""
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
AUTH_DEV_MODE="true"
AUTH_AUTO_VERIFY="true"
AUTH_DEV_OTP_IN_RESPONSE="true"
AUTH_DEV_OTP_IN_LOG="true"
AUTH_BYPASS_EMAIL="true"

# ── Phase 4: Billing ─────────────────────────────────────
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_PUBLISHABLE_KEY=""
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""

# ── Phase 5: AI & Email ──────────────────────────────────
ZAI_API_KEY=""
ANTHROPIC_API_KEY=""
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM_NAME="AcquisitionOS"
SMTP_FROM_EMAIL="noreply@acquisitionos.com"
RESEND_API_KEY=""

# ── Phase 6: Security ────────────────────────────────────
TOKEN_ENCRYPTION_KEY=""
SENTRY_DSN=""

# ── Phase 7: Discovery ──────────────────────────────────
DISCOVERY_MAX_CONCURRENT_JOBS="3"
DISCOVERY_RESULTS_PER_JOB="50"
ENRICHMENT_TIMEOUT_MS="30000"

# ── Phase 9: Gmail ───────────────────────────────────────
GMAIL_CLIENT_ID=""
GMAIL_CLIENT_SECRET=""
GMAIL_REDIRECT_URI="http://localhost:8000/api/integrations/gmail/callback"
GOOGLE_PUBSUB_TOPIC=""
ENABLE_GMAIL_INTEGRATION="false"

# ── Phase 10: Messaging ──────────────────────────────────
TELEGRAM_BOT_TOKEN=""
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"
META_WHATSAPP_TOKEN=""
META_WHATSAPP_PHONE_ID=""
META_WEBHOOK_VERIFY_TOKEN=""
META_APP_SECRET=""
ENABLE_TELEGRAM="false"
ENABLE_WHATSAPP="false"

# ── Phase 11: Real-Time ──────────────────────────────────
WS_HEARTBEAT_INTERVAL="30000"
WS_RECONNECT_LIMIT="5"
SSE_TIMEOUT="300000"
NOTIFICATION_BATCH_SIZE="50"
REDIS_PUBSUB_PREFIX="acos:pubsub:"

# ── Phase 12: Workflows ──────────────────────────────────
WORKFLOW_MAX_RETRIES="3"
WORKFLOW_TIMEOUT="300000"
WORKFLOW_QUEUE_SIZE="1000"
WORKFLOW_RETENTION_DAYS="90"
WORKFLOW_DLQ_SIZE="500"

# ── Storage ──────────────────────────────────────────────
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_S3_BUCKET="acquisitionos-assets"
AWS_REGION="ap-south-1"

# ── Admin ────────────────────────────────────────────────
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
```
