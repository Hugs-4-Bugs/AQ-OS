# AcquisitionOS — Operational Runbook

> **Version**: 2.0 | **Last Updated**: 2025-06-18 | **Owner**: Platform Team
>
> This runbook covers day-to-day operations, incident response, and maintenance procedures for AcquisitionOS production systems. All operators must be familiar with this document before going on-call.

---

## Table of Contents

1. [Service Architecture Overview](#1-service-architecture-overview)
2. [Health Check Endpoints](#2-health-check-endpoints)
3. [Common Incident Response Procedures](#3-common-incident-response-procedures)
4. [Database Backup and Restore](#4-database-backup-and-restore)
5. [Log Locations and Monitoring](#5-log-locations-and-monitoring)
6. [Performance Troubleshooting](#6-performance-troubleshooting)
7. [Payment Failure Recovery](#7-payment-failure-recovery)
8. [Session Management](#8-session-management)

---

## 1. Service Architecture Overview

### High-Level Architecture

```
                         INTERNET
                            |
                    [ Cloudflare CDN/WAF ]
                            |
                   [ Nginx Reverse Proxy ]
                   :80/:443 (SSL termination, rate limiting,
                      security headers, WebSocket proxy)
                      /       |        \
                     /        |         \
     +-----------+  +-----------+  +-----------+
     | Next.js   |  | Next.js   |  | FastAPI   |
     | Frontend  |  | Frontend   |  | Backend   |
     | :3000     |  | :3000     |  | :8000     |
     | (Node.js) |  | (Node.js) |  | (Python)  |
     +-----+-----+  +-----+-----+  +-----+-----+
           |               |              |
     +-----+---------------+--------------+------+
           |                              |
     +-----+-----+              +---------+--------+
     | SQLite /  |              |     Redis 7      |
     | PostgreSQL|              | :6379 (Cache +   |
     | :5432     |              |  Queue + PubSub) |
     +-----------+              +------------------+
                                       |
                            +----------+----------+
                            |                     |
                    +-------+-------+    +--------+-------+
                    | Celery Worker  |    | Celery Beat    |
                    | (8 concurrency)|    | (Scheduler)    |
                    +---------------+    +----------------+
```

### Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | Next.js | 16 | SSR + API routes, React dashboard |
| ORM | Prisma | Latest | Database access (SQLite dev / PostgreSQL prod) |
| Auth | JWT + bcrypt | jsonwebtoken, bcryptjs | Access tokens (15m), refresh tokens (30d), OTP, MFA/TOTP |
| Payments (India) | Razorpay | SDK | UPI, cards, netbanking, wallets, GST |
| Payments (Global) | Stripe | SDK | Cards, Apple/Google Pay (requires domain verification) |
| Cache/Queue | Redis | 7-alpine | Session cache, Celery broker, PubSub, rate limiting |
| Background Jobs | Celery | 5.x | Email, billing, scraping, notifications, workflows |
| API Backend | FastAPI | Latest | Python async API for heavy processing |
| Database (Dev) | SQLite | 3 | Local development via `file:./db/custom.db` |
| Database (Prod) | PostgreSQL | 15-alpine | Production via Supabase or self-hosted |
| Monitoring | Prometheus + Grafana | Latest | Metrics collection, dashboards, alerting |
| Realtime | WebSocket Service | Custom (Bun) | Socket.io server for live notifications |
| Reverse Proxy | Nginx | Alpine | SSL, rate limiting, security headers, load balancing |
| Error Tracking | Sentry | — | Frontend + backend error capture |

### Service Dependency Map

| Service | Depends On | Critical? |
|---------|-----------|-----------|
| Next.js Frontend | SQLite/PostgreSQL, Redis | Yes |
| FastAPI Backend | PostgreSQL, Redis | Yes |
| Celery Workers | PostgreSQL, Redis | Yes (async) |
| Celery Beat | Redis | Yes (scheduling) |
| WebSocket Service | Redis (PubSub) | No (degrades gracefully) |
| Nginx | Frontend, Backend | Yes (gateway) |

### Plan Hierarchy

| Plan | Price | Credits/Month | Key Features |
|------|-------|---------------|-------------|
| Free | $0 | 50 | Overview, Leads, Pipeline, Messaging, Insights, Deals |
| Pro | $29/mo or $279/yr | 500 | + Workflows, Competitors, API access, lead discovery |
| Elite | $89/mo or $849/yr | 2000 | + Priority AI, advanced analytics, white-label |

### Key Database Models (53+ Tables)

| Category | Key Models | Table Count |
|----------|-----------|-------------|
| User & Auth | User, UserSession, MfaConfig, LoginHistory, SecurityAlert, KnownDevice | 6+ |
| Organization | Organization, OrgMember, OrgInvitation | 3 |
| Billing | Subscription, PaymentOrder, PaymentWebhook, Invoice, CreditsLedger, CreditAddon, Coupon, TaxRate | 8 |
| Leads | Lead, LeadAnalysis, LeadScore, LeadNote, LeadActivity | 5+ |
| Outreach | OutreachMessage, OutreachSequence, SequenceStep, SequenceEnrollment | 4 |
| Email | EmailAccount, EmailThread, EmailMessage, EmailBounce, EmailUnsubscribe | 5 |
| Workflows | WorkflowDefinition, WorkflowStep, WorkflowExecution, WorkflowLog, WorkflowTemplate | 5 |
| Competitors | CompetitorData, CompetitorAnalysis | 2 |
| Notifications | Notification, NotificationPreferences | 2 |
| System | AuditLog, FeatureFlag, PlanEntitlement, UsageTracking, ApiKey | 5+ |

---

## 2. Health Check Endpoints

### Basic Health Check

```bash
curl -s https://app.acquisitionos.com/api/health | jq .
```

**Response**:
```json
{
  "status": "healthy",
  "service": "acquisitionos-frontend",
  "version": "2.0.0"
}
```

- Returns 200 when the Next.js process is running
- No database dependency check (lightweight)
- Use for load balancer health checks and Kubernetes liveness probes

### Detailed Health Check

```bash
curl -s https://app.acquisitionos.com/api/health/detailed | jq .
```

**Response**:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "environment": "production",
  "uptime": 86400,
  "timestamp": "2025-06-18T10:00:00.000Z",
  "components": {
    "database": {
      "status": "healthy",
      "latencyMs": 12.5,
      "details": "Database connection is active"
    },
    "memory": {
      "status": "healthy",
      "details": "Heap usage normal: 45.2% (180MB / 398MB)"
    },
    "process": {
      "status": "healthy",
      "details": "Process running for 1d 0h 0m 0s"
    }
  },
  "metrics": {
    "activeUsers": 142,
    "totalLeads": 3847,
    "queueDepth": 3
  }
}
```

**Component Status Thresholds**:

| Component | Healthy | Degraded | Unhealthy |
|-----------|---------|----------|-----------|
| Database | latency < 200ms | latency 200-1000ms | latency > 1000ms or error |
| Memory | heap < 85% | heap 85-95% | heap > 95% |
| Process | always healthy | — | — |

**HTTP Status Codes**:
- `200` — `healthy` or `degraded`
- `503` — `unhealthy`

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /
    port: 3000
  initialDelaySeconds: 40
  periodSeconds: 30
  timeoutSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /
    port: 3000
  initialDelaySeconds: 20
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

### Backend Health Check

```bash
curl -s http://localhost:8000/health | jq .
```

### Redis Health Check

```bash
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" PING
# Expected: PONG
```

### PostgreSQL Health Check

```bash
docker compose exec postgres pg_isready -U postgres -d acquisitionos
# Expected: accepting connections
```

---

## 3. Common Incident Response Procedures

### 3.1 Total Service Outage

**Symptoms**: All health checks failing, 5xx errors across all endpoints

**Response**:

```bash
# Step 1: Identify which component is down
docker compose ps
docker compose logs --tail=100 frontend backend nginx

# Step 2: Check infrastructure
curl -sf http://localhost:3000/api/health || echo "FRONTEND DOWN"
curl -sf http://localhost:8000/health || echo "BACKEND DOWN"
docker compose exec postgres pg_isready -U postgres || echo "DATABASE DOWN"
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" PING || echo "REDIS DOWN"

# Step 3: Restart failed services (in dependency order)
docker compose start postgres       # Wait for healthy
docker compose start redis          # Wait for healthy
docker compose start backend        # Wait for healthy
docker compose start celery-worker celery-beat
docker compose start frontend       # Wait for healthy
docker compose start nginx

# Step 4: Verify recovery
curl -sf http://localhost:3000/api/health/detailed | jq .status
```

### 3.2 Database Unavailable

**Symptoms**: `ECONNREFUSED`, `P1001` Prisma errors, connection pool exhaustion

**Response**:

```bash
# Check PostgreSQL status
docker compose exec postgres pg_isready -U postgres
docker compose exec postgres psql -U postgres -c "SELECT 1;"

# Check active connections
docker compose exec postgres psql -U postgres -c "
  SELECT count(*), state FROM pg_stat_activity GROUP BY state;
"

# Kill stuck queries (5+ minutes)
docker compose exec postgres psql -U postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE state = 'active' AND query_start < now() - interval '5 minutes';
"

# Check disk space (common cause)
df -h
docker compose exec postgres psql -U postgres -c "
  SELECT pg_size_pretty(pg_database_size('acquisitionos'));
"

# If PostgreSQL won't start, check logs
docker compose logs postgres --tail=50
```

### 3.3 Redis Down

**Symptoms**: Cache misses, session errors, Celery queue not processing, WebSocket failures

**Response**:

```bash
# Check Redis status
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO server
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO memory

# If Redis is OOM
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" --bigkeys
# Clear cache keys only (safe)
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" --scan --pattern "acos:cache:*" | \
  xargs docker compose exec -T redis redis-cli -a "$REDIS_PASSWORD" DEL

# Restart Redis
docker compose restart redis

# Verify Celery reconnects
docker compose logs celery-worker --tail=20 | rg "ready"
```

### 3.4 High Error Rate (>5% 5xx)

**Symptoms**: Prometheus `HighErrorRate` alert firing

**Response**:

```bash
# Identify error sources
docker compose logs frontend --tail=200 | rg "ERROR|500|5xx"
docker compose logs backend --tail=200 | rg "ERROR|traceback|500"

# Check Sentry for new error groups
# https://sentry.io/organizations/acquisitionos

# Common causes:
# 1. Bad deployment → Rollback (see ROLLBACK.md)
# 2. DB pool exhaustion → Restart, increase pool size
# 3. External API failure → Check provider status, enable fallback
# 4. Memory pressure → Restart, scale up
# 5. Redis connection errors → Restart Redis

# Emergency mitigation: enable maintenance mode if >20% error rate
docker compose exec frontend touch /tmp/maintenance-mode
docker compose exec nginx nginx -s reload  # with maintenance config
```

### 3.5 Celery Queue Backlog

**Symptoms**: `CeleryQueueBacklog` or `CeleryQueueBacklogCritical` alert

**Response**:

```bash
# Check queue lengths
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" LLEN celery
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" LLEN email
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" LLEN billing

# Scale workers
docker compose up -d --scale celery-worker=4

# If specific queue is backed up, run dedicated worker
docker compose run -d --name email-worker \
  celery -A app.celery_app worker -Q email --concurrency=8 -n email@%h

# Check for failed tasks
docker compose logs celery-worker --tail=100 | rg "ERROR|FAILED|RETRY"
```

---

## 4. Database Backup and Restore

### 4.1 Automated Backups

Backups run via `scripts/backup/backup.sh` scheduled by cron:

```bash
# View cron schedule
crontab -l | rg backup

# Typical schedule:
# 0 */6 * * * /opt/acquisitionos/scripts/backup/backup.sh >> /var/log/acquisitionos/backup.log 2>&1
```

**What gets backed up**:
- SQLite database (via `sqlite3 .backup` for consistency, or file copy as fallback)
- PostgreSQL database (via `pg_dump --format=custom`)
- Both are gzip-compressed and optionally uploaded to S3

**Backup location**: `/opt/acquisitionos/backups/YYYY/MM/DD/`

**Retention**: 30 days local, configurable S3 lifecycle

### 4.2 Manual Backup

```bash
# Run the full backup script
cd /opt/acquisitionos
bash scripts/backup/backup.sh

# Manual PostgreSQL dump
docker compose exec -T postgres pg_dump -U postgres -F c acquisitionos | gzip > \
  /backups/manual/acquisitionos_$(date +%Y%m%d_%H%M%S).sql.gz

# Manual SQLite backup (if using SQLite)
sqlite3 /opt/acquisitionos/data/acquisitionos.db ".backup '/tmp/backup.db'"
gzip -c /tmp/backup.db > /backups/manual/sqlite_$(date +%Y%m%d_%H%M%S).db.gz

# Manual Redis snapshot
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" LASTSAVE
```

### 4.3 Restore from Backup

Use the dedicated restore script:

```bash
# Restore from latest backup
bash scripts/backup/restore.sh --latest --type sqlite
bash scripts/backup/restore.sh --latest --type postgres

# Restore from a specific timestamp
bash scripts/backup/restore.sh --timestamp 20250618_020000 --type sqlite

# Restore from a specific file
bash scripts/backup/restore.sh --file /backups/2025/06/18/sqlite_20250618_020000.db.gz

# Dry run (no changes made)
bash scripts/backup/restore.sh --latest --dry-run
```

### 4.4 Full PostgreSQL Restore (Manual)

```bash
# WARNING: Requires downtime. Schedule a maintenance window.

# 1. Stop all services that use the database
docker compose stop frontend backend celery-worker celery-beat

# 2. Restore from backup
gunzip < /backups/postgres/acquisitionos_20250618.sql.gz | \
  docker compose exec -T postgres pg_restore \
    --clean --if-exists --no-owner --no-acl -d acquisitionos

# 3. Start PostgreSQL and verify
docker compose start postgres
docker compose exec postgres pg_isready -U postgres
docker compose exec postgres psql -U postgres -c "SELECT count(*) FROM \"User\";"

# 4. Start services in order
docker compose start backend
sleep 10
docker compose start celery-worker celery-beat
docker compose start frontend

# 5. Verify
curl -sf http://localhost:3000/api/health/detailed | jq .
```

### 4.5 Verify Backup Integrity

```bash
# Check gzip integrity
gzip -t /backups/2025/06/18/sqlite_20250618_020000.db.gz

# Verify SQLite backup
temp_db=$(mktemp --suffix=.db)
gunzip -c /backups/2025/06/18/sqlite_20250618_020000.db.gz > "$temp_db"
sqlite3 "$temp_db" "PRAGMA integrity_check;"
rm -f "$temp_db"

# Verify PostgreSQL backup
temp_file=$(mktemp --suffix=.sql)
gunzip -c /backups/postgres/acquisitionos_20250618.sql.gz > "$temp_file"
pg_restore --list "$temp_file" > /dev/null 2>&1 && echo "Valid" || echo "Invalid"
rm -f "$temp_file"
```

---

## 5. Log Locations and Monitoring

### 5.1 Log Locations

| Service | Log Path | How to Access |
|---------|---------|--------------|
| Next.js Frontend | `docker compose logs frontend` | stdout/stderr via Docker |
| FastAPI Backend | `docker compose logs backend` | stdout/stderr via Docker |
| Celery Workers | `docker compose logs celery-worker` | stdout/stderr via Docker |
| Celery Beat | `docker compose logs celery-beat` | stdout/stderr via Docker |
| Nginx | `docker compose logs nginx` | Access + error logs |
| PostgreSQL | `docker compose logs postgres` | Server logs |
| Redis | `docker compose logs redis` | Server logs |
| Backup Script | `/var/log/acquisitionos/backup.log` | File on host |
| Restore Script | `/var/log/acquisitionos/restore.log` | File on host |

### 5.2 Docker Log Configuration

All services use JSON file driver with rotation:

```yaml
logging:
  driver: json-file
  options:
    max-size: "50m"
    max-file: "5"
```

### 5.3 Useful Log Commands

```bash
# Follow logs in real-time
docker compose logs -f frontend
docker compose logs -f backend celery-worker

# Search for errors
docker compose logs frontend --since 1h | rg "ERROR|error|500"
docker compose logs backend --since 1h | rg "ERROR|traceback|500"

# Search for payment-related issues
docker compose logs frontend --since 6h | rg "Razorpay|Stripe|payment|webhook"

# Search for auth issues
docker compose logs frontend --since 1h | rg "auth|signin|signup|JWT|token"

# Search for specific user activity
docker compose logs frontend --since 1h | rg "userId.*USER_ID_HERE"

# Export logs for analysis
docker compose logs frontend --since 24h > /tmp/frontend-logs.txt
```

### 5.4 Monitoring Stack

**Prometheus** (port 9090):
- Scrapes metrics from all services every 15s
- 30-day retention, 5GB storage limit
- Config: `monitoring/prometheus/prometheus.yml`

**Grafana** (port 3001, proxied at `/grafana`):
- Dashboards: App Overview, Infrastructure, Database, Redis, Celery
- Config: `monitoring/grafana/dashboards/`

**Sentry**:
- Captures frontend and backend errors
- Source maps uploaded during build

### 5.5 Key Metrics to Monitor

| Metric | Source | Alert Threshold | Dashboard |
|--------|--------|----------------|-----------|
| HTTP 5xx rate | Prometheus | >5% for 5 min (critical) | App Overview |
| P95 latency | Prometheus | >2s for 5 min (warning) | App Overview |
| P99 latency | Prometheus | >5s for 5 min (critical) | App Overview |
| DB connection pool | Prometheus | >90% for 5 min (warning) | Database |
| Redis memory | Prometheus | >85% for 10 min (warning) | Redis |
| Celery queue depth | Prometheus | >1000 for 10 min (warning) | Celery |
| Disk space | Node exporter | <20% (warning), <10% (critical) | Infrastructure |
| Memory usage | Node exporter | >85% (warning), >95% (critical) | Infrastructure |
| CPU usage | Node exporter | >85% for 15 min (warning) | Infrastructure |

### 5.6 Application-Level Metrics

The `/api/metrics` endpoint exposes custom Prometheus metrics:

- `http_requests_total` — request count by method, path, status
- `http_request_duration_seconds` — request latency histograms
- `db_query_duration_seconds` — database query latency
- `api_request_duration_seconds` — API route latency
- Active user count, total leads, workflow execution depth (from `/api/health/detailed`)

---

## 6. Performance Troubleshooting

### 6.1 Slow API Responses

**Symptoms**: P95 latency >2s, user complaints about slowness

```bash
# Check which routes are slow
curl -s http://localhost:9090/api/v1/query?query='histogram_quantile(0.95,sum(rate(http_request_duration_seconds_bucket[5m]))by(le,route))' | jq .

# Common slow routes:
# /api/leads/discover — AI-powered, depends on Z-AI API
# /api/leads/[id]/analyze-website — Scraping + AI analysis
# /api/leads/[id]/enrich — Multiple API calls
# /api/sales-assistant — LLM inference

# Check database query performance
docker compose exec postgres psql -U postgres -c "
  SELECT query, calls, total_exec_time, mean_exec_time
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC LIMIT 20;
"

# Check if AI API is slow
docker compose logs frontend --since 30m | rg "ai.*timeout|ai.*slow|ZAI"
```

**Remediation**:

| Cause | Fix |
|-------|-----|
| Slow AI API responses | Check Z-AI API status, consider caching, reduce prompt complexity |
| Missing DB indexes | Add indexes on frequently queried columns |
| Large result sets | Add pagination, limit default page sizes |
| N+1 queries | Use Prisma `include` instead of sequential queries |
| Memory pressure | Restart services, increase memory limits |

### 6.2 High Memory Usage

**Symptoms**: OOM kills, `MemoryPressureWarning` alert, heap >85%

```bash
# Check current memory usage
docker stats --no-stream

# Check Node.js heap usage
curl -s http://localhost:3000/api/health/detailed | jq '.components.memory'

# Common causes:
# 1. Memory leak in long-running process
# 2. Large Prisma query results not garbage collected
# 3. Too many concurrent AI requests
# 4. WebSocket connections accumulating

# Mitigate immediately
docker compose restart frontend

# Long-term: increase memory limits in docker-compose.prod.yml
# frontend:
#   deploy:
#     resources:
#       limits:
#         memory: 2G  # Increase from 1G
```

### 6.3 Slow Database Queries

```bash
# Identify slow queries
docker compose exec postgres psql -U postgres -c "
  SELECT query, calls, total_exec_time, mean_exec_time, rows
  FROM pg_stat_statements
  WHERE mean_exec_time > 100
  ORDER BY mean_exec_time DESC LIMIT 20;
"

# Check for missing indexes
docker compose exec postgres psql -U postgres -c "
  SELECT schemaname, relname, seq_scan, idx_scan
  FROM pg_stat_user_tables
  WHERE seq_scan > idx_scan AND seq_scan > 100
  ORDER BY seq_scan DESC;
"

# Check for table bloat
docker compose exec postgres psql -U postgres -c "
  SELECT schemaname, relname, n_dead_tup, n_live_tup,
    ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS bloat_pct
  FROM pg_stat_user_tables
  WHERE n_dead_tup > 10000
  ORDER BY bloat_pct DESC;
"

# Run VACUUM if needed
docker compose exec postgres psql -U postgres -c "VACUUM ANALYZE \"Lead\";"
```

### 6.4 Redis Performance

```bash
# Check Redis latency
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" --latency

# Check slow log
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" SLOWLOG GET 20

# Check memory usage by key pattern
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" --bigkeys

# Check hit rate
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | rg "keyspace_hits|keyspace_misses"
```

---

## 7. Payment Failure Recovery

### 7.1 Payment Flow Overview

```
User clicks "Upgrade"
       |
       v
POST /api/payments/create-order
       |
       v
PaymentOrder created (status: pending)
       |
       v
Provider order created (Razorpay order / Stripe session)
       |
       v
User completes payment on provider's checkout
       |
       v
Webhook: POST /api/payments/webhook/razorpay or /stripe
       |
       v
Webhook signature verified → PaymentWebhook recorded (idempotency)
       |
       v
confirmPaymentAndActivate() — atomic transaction:
  - PaymentOrder.status → completed
  - Subscription updated to active
  - User.plan + User.credits updated
  - CreditsLedger entry created
  - Invoice created (non-blocking)
  - Notification sent
       |
       v
Coupon usage incremented (only on success)
```

### 7.2 Check Payment Provider Status

```bash
# Stripe status
curl -s https://status.stripe.com

# Razorpay status
curl -s https://status.razorpay.com

# Test Stripe connectivity
curl -s https://api.stripe.com/v1/balance \
  -u "$STRIPE_SECRET_KEY:" | jq .

# Test Razorpay connectivity
curl -s https://api.razorpay.com/v1/orders \
  -u "$RAZORPAY_KEY_ID:$RAZORPAY_KEY_SECRET" | jq .
```

### 7.3 Investigate Failed Payments

```bash
# Check PaymentWebhook table for unprocessed events
# (SQL for PostgreSQL)
SELECT * FROM "PaymentWebhook"
WHERE processed = false
ORDER BY "receivedAt" DESC LIMIT 20;

# Check PaymentWebhook errors
SELECT * FROM "PaymentWebhook"
WHERE "processingError" IS NOT NULL
ORDER BY "receivedAt" DESC LIMIT 10;

# Check failed payment orders
SELECT * FROM "PaymentOrder"
WHERE status = 'failed'
ORDER BY "createdAt" DESC LIMIT 20;

# Check pending orders older than 1 hour
SELECT * FROM "PaymentOrder"
WHERE status = 'pending'
AND "createdAt" < NOW() - INTERVAL '1 hour'
ORDER BY "createdAt" DESC;

# Check subscription mismatches (user has Pro payment but still Free plan)
SELECT u.id, u.email, u.plan, po.plan as paid_plan, po.status, po."createdAt"
FROM "User" u
JOIN "PaymentOrder" po ON po."userId" = u.id
WHERE po.status = 'completed'
AND u.plan != po.plan
ORDER BY po."createdAt" DESC;
```

### 7.4 Re-process Failed Webhooks

```bash
# Via the webhook replay API
curl -X POST https://app.acquisitionos.com/api/payments/webhook-replay \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventId": "evt_xxx"}'

# Via Stripe CLI (resend event)
stripe events resend evt_xxx

# Manually trigger confirmPaymentAndActivate for a specific order
# (Dev/staging only — production confirm endpoint is blocked)
curl -X POST https://staging.acquisitionos.com/api/payments/confirm \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paymentOrderId": "ORDER_ID", "providerPaymentId": "PAY_ID"}'
```

### 7.5 Manual Subscription Fix

When a user has paid but their subscription didn't activate:

```bash
# Step 1: Verify the payment was captured in the provider dashboard
# Stripe: Dashboard → Payments → Search by user email
# Razorpay: Dashboard → Payments → Search by user email

# Step 2: Check the PaymentOrder status
# If status = 'completed' but user plan is wrong:
#   - The confirmPaymentAndActivate may have partially failed
#   - Check the subscription table

# Step 3: Manual credit adjustment if needed
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  -- Fix user plan
  UPDATE \"User\" SET plan = 'pro', credits = 500, \"creditsMonthly\" = 500,
    \"isTrial\" = false, \"trialEndsAt\" = NULL
  WHERE id = 'USER_ID';

  -- Fix subscription
  UPDATE \"Subscription\" SET plan = 'pro', status = 'active',
    \"isTrial\" = false, \"trialEndsAt\" = NULL,
    \"currentPeriodStart\" = NOW(),
    \"currentPeriodEnd\" = NOW() + INTERVAL '30 days'
  WHERE \"userId\" = 'USER_ID' AND status IN ('trialing', 'active', 'past_due');

  -- Add ledger entry
  INSERT INTO \"CreditsLedger\" (id, \"userId\", action, credits, balance, description)
  VALUES (gen_random_uuid(), 'USER_ID', 'manual_adjustment', 500, 500,
    'Manual adjustment after payment confirmation failure');
"
```

### 7.6 Refund Processing

```bash
# Process refund via API
curl -X POST https://app.acquisitionos.com/api/payments/refund \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentOrderId": "ORDER_ID",
    "reason": "customer_request",
    "amount": 29.00
  }'

# Refund via Stripe Dashboard
# Dashboard → Payments → Find payment → Refund

# Refund via Razorpay Dashboard
# Dashboard → Payments → Find payment → Refund

# After refund, update subscription
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  UPDATE \"PaymentOrder\" SET status = 'refunded' WHERE id = 'ORDER_ID';
  UPDATE \"Subscription\" SET status = 'canceled', \"cancelAtPeriodEnd\" = false
  WHERE \"userId\" = 'USER_ID' AND status = 'active';
"
```

---

## 8. Session Management

### 8.1 How Sessions Work

AcquisitionOS uses JWT-based session management:

| Token Type | Expiry | Storage | Path |
|-----------|--------|---------|------|
| Access Token | 15 minutes | `access_token` cookie (httpOnly) | `/` |
| Refresh Token | 30 days | `refresh_token` cookie (httpOnly) | `/api/auth` |

**Token lifecycle**:
1. User signs in → `POST /api/auth/signin`
2. Server generates access + refresh tokens
3. Tokens set as httpOnly cookies with `SameSite=Strict`
4. Frontend auto-refreshes access token via `useTokenRefresh` hook
5. `POST /api/auth/refresh` rotates refresh token and issues new access token
6. Session stored in `UserSession` table with device info, IP, user agent

**Security features**:
- Refresh token cookie scoped to `/api/auth` (accessible only to auth endpoints)
- JWT_SECRET is required in production (server fails to start without it)
- Brute force protection: 5 failed login attempts → 15-minute lockout
- MFA/TOTP support with backup codes
- Suspicious login detection (new IP + new device)
- Session revocation on logout (single device or all devices)

### 8.2 Session Troubleshooting

```bash
# Check active sessions for a user
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  SELECT us.id, us.\"deviceInfo\", us.\"ipAddress\", us.\"isRevoked\",
    us.\"createdAt\", us.\"expiresAt\"
  FROM \"UserSession\" us
  JOIN \"User\" u ON us.\"userId\" = u.id
  WHERE u.email = 'user@example.com'
  AND us.\"isRevoked\" = false
  AND us.\"expiresAt\" > NOW()
  ORDER BY us.\"createdAt\" DESC;
"

# Revoke a specific session
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  UPDATE \"UserSession\" SET \"isRevoked\" = true
  WHERE \"refreshToken\" = 'TOKEN_VALUE';
"

# Revoke all sessions for a user (force logout all devices)
curl -X POST https://app.acquisitionos.com/api/settings/sessions/revoke-all \
  -H "Authorization: Bearer $USER_TOKEN"

# Check login history for suspicious activity
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  SELECT lh.ip, lh.\"userAgent\", lh.country, lh.success, lh.\"failReason\", lh.\"createdAt\"
  FROM \"LoginHistory\" lh
  JOIN \"User\" u ON lh.\"userId\" = u.id
  WHERE u.email = 'user@example.com'
  ORDER BY lh.\"createdAt\" DESC LIMIT 20;
"
```

### 8.3 Account Lockout Recovery

```bash
# Check if an account is locked
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  SELECT email, \"otpAttemptCount\", \"otpLockedUntil\"
  FROM \"User\" WHERE email = 'user@example.com';
"

# Unlock an account
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  UPDATE \"User\" SET \"otpAttemptCount\" = 0, \"otpLockedUntil\" = NULL
  WHERE email = 'user@example.com';
"
```

### 8.4 MFA Recovery

```bash
# Check MFA status for a user
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  SELECT u.email, mc.\"isEnabled\", mc.\"verifiedAt\"
  FROM \"MfaConfig\" mc
  JOIN \"User\" u ON mc.\"userId\" = u.id
  WHERE u.email = 'user@example.com';
"

# Disable MFA for a locked-out user (admin action)
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  UPDATE \"MfaConfig\" SET \"isEnabled\" = false
  WHERE \"userId\" = (SELECT id FROM \"User\" WHERE email = 'user@example.com');
"

# The proper MFA flow:
# 1. POST /api/auth/mfa/setup — Creates disabled MFA config with TOTP secret
# 2. POST /api/auth/mfa/confirm — Verifies TOTP code and enables MFA
# 3. POST /api/auth/mfa/verify — Verifies TOTP code during login
# 4. POST /api/auth/mfa/disable — Disables MFA (requires current TOTP code)
```

### 8.5 JWT Secret Rotation

```bash
# Step 1: Set the previous secret alongside the new one
export JWT_SECRET_PREVIOUS="$JWT_SECRET"
export JWT_SECRET="$(openssl rand -base64 64 | tr -d '\n')"

# Step 2: Deploy and restart
docker compose up -d --force-recreate frontend backend

# Step 3: Wait for transition period
# - Access tokens expire in 15 minutes
# - Refresh tokens expire in 30 days
# After 24 hours: most access tokens have rotated
# After 30 days: all refresh tokens have rotated

# Step 4: Remove JWT_SECRET_PREVIOUS after 30 days
unset JWT_SECRET_PREVIOUS
docker compose up -d --force-recreate frontend backend
```

---

## Appendix: Quick Command Reference

```bash
# Check all service health
docker compose ps && docker stats --no-stream

# Restart everything
docker compose restart

# View recent errors across all services
docker compose logs --since 30m | rg "ERROR|error|FATAL|panic"

# Force pull and recreate (after image update)
docker compose pull && docker compose up -d --force-recreate

# Enter a container shell
docker compose exec frontend sh
docker compose exec backend bash
docker compose exec postgres psql -U postgres -d acquisitionos

# Free disk space
docker system prune -af --volumes
# WARNING: removes unused volumes including old DB data
```

---

**See also**:
- [GO_LIVE.md](./GO_LIVE.md) — Pre-launch checklist
- [ROLLBACK.md](./ROLLBACK.md) — Rollback procedures
- [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) — Incident response plan
- [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) — Disaster recovery
- [MONITORING_GUIDE.md](./MONITORING_GUIDE.md) — Monitoring setup
- [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) — Secrets and rotation
