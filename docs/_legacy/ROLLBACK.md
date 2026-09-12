# AcquisitionOS — Rollback Procedure

> **Version**: 2.0 | **Last Updated**: 2025-06-18 | **Owner**: Platform Team
>
> This document provides step-by-step rollback procedures for every type of production failure. **Every deployment must have a rollback plan.** If a rollback plan doesn't exist, the deployment should not proceed.

---

## Table of Contents

1. [Database Rollback Strategy](#1-database-rollback-strategy)
2. [Application Version Rollback](#2-application-version-roll-back)
3. [Feature Flag Rollback](#3-feature-flag-rollback)
4. [Payment Gateway Disable](#4-payment-gateway-disable)
5. [Emergency Shutdown Procedure](#5-emergency-shutdown-procedure)
6. [Post-Rollback Verification](#6-post-rollback-verification)

---

## 1. Database Rollback Strategy

### 1.1 When to Roll Back the Database

- A Prisma migration introduced a breaking schema change that causes application errors
- Data corruption detected after a migration
- Performance regression caused by new indexes or constraints
- Accidental data deletion or modification

### 1.2 Pre-Migration Requirements

Before ANY database migration, ensure:

```bash
# 1. Take a fresh backup
bash scripts/backup/backup.sh

# 2. Verify backup integrity
ls -la /opt/acquisitionos/backups/$(date +%Y/%m/%d)/

# 3. Record the current migration state
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;
"

# 4. Note the current database size for comparison
docker compose exec postgres psql -U postgres -c "
  SELECT pg_size_pretty(pg_database_size('acquisitionos'));
"
```

### 1.3 Prisma Migration Rollback

AcquisitionOS uses Prisma for schema management. Rolling back a Prisma migration requires care because Prisma does not natively support down migrations.

**Option A: Using the migration-rollback script**

```bash
# The project includes a migration rollback helper
bash scripts/backup/migration-rollback.sh

# This script:
# 1. Takes a pre-rollback backup
# 2. Marks the migration as rolled back in _prisma_migrations
# 3. Applies the reverse SQL (if available)
# 4. Verifies database integrity
```

**Option B: Manual migration rollback**

```bash
# Step 1: Identify the problematic migration
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  SELECT migration_name, finished_at, logs
  FROM _prisma_migrations
  ORDER BY finished_at DESC LIMIT 5;
"

# Step 2: Stop the application to prevent writes
docker compose stop frontend backend celery-worker celery-beat

# Step 3: Take a pre-rollback backup
bash scripts/backup/backup.sh

# Step 4: Restore from the backup taken BEFORE the migration
bash scripts/backup/restore.sh --timestamp PRE_MIGRATION_TIMESTAMP --type postgres

# Step 5: Verify the database
docker compose exec postgres psql -U postgres -d acquisitionos -c "SELECT count(*) FROM \"User\";"
docker compose exec postgres psql -U postgres -d acquisitionos -c "SELECT count(*) FROM \"Lead\";"

# Step 6: Start services
docker compose start backend
sleep 10
docker compose start celery-worker celery-beat frontend
```

### 1.4 Full Database Restore from Backup

For critical data corruption or accidental deletion:

```bash
# Step 1: Stop all services
docker compose stop frontend backend celery-worker celery-beat

# Step 2: Restore from the latest known-good backup
bash scripts/backup/restore.sh --latest --type postgres

# Or restore from a specific timestamp
bash scripts/backup/restore.sh --timestamp 20250618_020000 --type postgres

# Step 3: Verify integrity
docker compose exec postgres psql -U postgres -d acquisitionos -c "PRAGMA integrity_check;"  # SQLite
docker compose exec postgres pg_isready -U postgres  # PostgreSQL

# Step 4: Start services in dependency order
docker compose start postgres
sleep 5
docker compose start redis
sleep 3
docker compose start backend
sleep 10
docker compose start celery-worker celery-beat
docker compose start frontend

# Step 5: Verify
curl -sf http://localhost:3000/api/health/detailed | jq .status
```

### 1.5 SQLite-Specific Rollback (Development / Simple Deployments)

```bash
# SQLite restore (for single-server deployments)
bash scripts/backup/restore.sh --latest --type sqlite

# The restore script:
# 1. Verifies gzip integrity
# 2. Decompresses to temp file
# 3. Runs PRAGMA integrity_check
# 4. Replaces the live database
# 5. Verifies the restored database
```

### 1.6 Point-in-Time Recovery (PostgreSQL)

If using PostgreSQL with WAL archiving enabled:

```bash
# Step 1: Stop PostgreSQL
docker compose stop postgres

# Step 2: Create recovery configuration
cat > /var/lib/postgresql/data/recovery.signal <<EOF
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
recovery_target_time = '2025-06-18 09:30:00 UTC'
recovery_target_action = 'promote'
EOF

# Step 3: Start PostgreSQL (it will enter recovery mode)
docker compose start postgres

# Step 4: Monitor recovery progress
docker compose logs postgres -f | rg "recovery|consistent"

# Step 5: Once recovery completes, remove recovery.signal
docker compose exec postgres rm -f /var/lib/postgresql/data/recovery.signal
docker compose restart postgres
```

---

## 2. Application Version Rollback

### 2.1 Docker-Based Rollback

AcquisitionOS is deployed via Docker Compose with tagged images.

```bash
# Step 1: Identify the current and previous versions
docker compose images
# Output shows current image tags

# Step 2: Check available images
docker images | rg acquisitionos

# Step 3: Rollback to previous image
# Option A: Edit docker-compose.yml to use previous tag
# Change: image: acquisitionos/frontend:v2.1.0
# To:     image: acquisitionos/frontend:v2.0.0

# Option B: Use environment variable for image tag
export FRONTEND_IMAGE=acquisitionos/frontend:v2.0.0
docker compose up -d --force-recreate frontend

# Step 4: Verify
curl -sf http://localhost:3000/api/health | jq .
```

### 2.2 Vercel-Based Rollback

If deploying to Vercel:

```bash
# Step 1: List recent deployments
vercel ls

# Step 2: Rollback to a previous deployment
vercel rollback <deployment-url>

# Or via Vercel Dashboard:
# Project → Deployments → Find stable version → "..." → Rollback
```

### 2.3 Rolling Back Specific Services

```bash
# Rollback frontend only (most common)
docker compose stop frontend
# Deploy previous frontend image
docker compose up -d --force-recreate frontend

# Rollback backend only
docker compose stop backend celery-worker celery-beat
# Deploy previous backend image
docker compose up -d --force-recreate backend celery-worker celery-beat

# Rollback everything (last resort)
docker compose down
# Deploy all previous images
docker compose up -d
```

### 2.4 Git-Based Rollback (if deploying from source)

```bash
# Step 1: Identify the commit to roll back to
git log --oneline -10

# Step 2: Roll back to the known-good commit
git revert HEAD  # Safe: creates a new commit that undoes the last
# OR
git checkout <known-good-commit>  # Detached HEAD — for emergency only

# Step 3: Rebuild and deploy
docker compose build frontend backend
docker compose up -d --force-recreate frontend backend celery-worker celery-beat

# Step 4: Verify
curl -sf http://localhost:3000/api/health/detailed | jq .
```

### 2.5 Blue-Green Deployment Rollback

If using blue-green deployment:

```bash
# The previous (blue) environment is still running
# Simply switch the load balancer back

# Nginx: Update upstream to point to blue
# Edit /etc/nginx/conf.d/upstream.conf
# Change: server blue-frontend:3000;
# From:   server green-frontend:3000;

# Reload nginx
docker compose exec nginx nginx -s reload

# Verify
curl -sf http://localhost:3000/api/health | jq .
```

---

## 3. Feature Flag Rollback

### 3.1 Feature Flags in AcquisitionOS

Feature flags are stored in two places:

1. **Database** (`FeatureFlag` table) — Runtime toggles via admin UI or API
2. **Environment variables** — Auth dev mode flags (`AUTH_DEV_MODE`, `AUTH_BYPASS_EMAIL`, etc.)

### 3.2 Database Feature Flags

```bash
# List all feature flags
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  SELECT key, name, enabled, plans FROM \"FeatureFlag\" ORDER BY key;
"

# Disable a specific feature flag
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  UPDATE \"FeatureFlag\" SET enabled = false WHERE key = 'feature_key_here';
"

# Enable a specific feature flag
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  UPDATE \"FeatureFlag\" SET enabled = true WHERE key = 'feature_key_here';
"

# Restrict a feature to specific plans
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  UPDATE \"FeatureFlag\" SET plans = '[\"pro\",\"elite\"]' WHERE key = 'feature_key_here';
"
```

### 3.3 Auth Dev Mode Flags

```bash
# CRITICAL: These must be OFF in production
# To disable immediately:

# In .env or environment:
AUTH_DEV_MODE=false
AUTH_AUTO_VERIFY=false
AUTH_DEV_OTP_IN_RESPONSE=false
AUTH_BYPASS_EMAIL=false

# Restart frontend to pick up changes
docker compose restart frontend

# Verify
docker compose logs frontend --tail=20 | rg "feature-flags"
# Should show all flags as false
```

### 3.4 Plan Entitlement Rollback

If a plan change caused issues:

```bash
# Check current entitlements
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  SELECT plan, feature, enabled, limit FROM \"PlanEntitlement\" ORDER BY plan, feature;
"

# Re-seed entitlements from the known-good seed file
docker compose exec frontend npx ts-node scripts/seed-entitlements.ts

# Or manually fix a specific entitlement
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  UPDATE \"PlanEntitlement\" SET enabled = true WHERE plan = 'pro' AND feature = 'api_access';
"
```

---

## 4. Payment Gateway Disable

### 4.1 When to Disable a Payment Gateway

- Payment provider is experiencing an outage
- Webhook processing is failing consistently
- Fraud detection triggered
- Security compromise of API keys

### 4.2 Disable Razorpay

```bash
# Option A: Remove Razorpay keys (stops new orders)
# In .env or environment:
# Comment out or remove:
# RAZORPAY_KEY_ID=
# RAZORPAY_KEY_SECRET=

# Restart frontend
docker compose restart frontend

# Option B: Disable via database — route all payments to Stripe
# This requires a code change or feature flag — not available at runtime
# Recommended: Remove keys and restart

# Option C: Emergency — reject Razorpay webhooks at Nginx
# Add to nginx.conf:
# location /api/payments/webhook/razorpay {
#     return 503;
# }
docker compose exec nginx nginx -s reload
```

### 4.3 Disable Stripe

```bash
# Option A: Remove Stripe keys
# In .env or environment:
# Comment out or remove:
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=

# Restart frontend
docker compose restart frontend

# Option B: Disable Stripe in Nginx
# Add to nginx.conf:
# location /api/payments/webhook/stripe {
#     return 503;
# }
docker compose exec nginx nginx -s reload
```

### 4.4 Disable ALL Payments (Emergency)

When both gateways are compromised or failing:

```bash
# Step 1: Block payment-related endpoints at Nginx
cat > /etc/nginx/conf.d/block-payments.conf <<'EOF'
location /api/payments/create-order {
    return 503 "Payment system temporarily unavailable";
}
location /api/payments/confirm {
    return 503 "Payment system temporarily unavailable";
}
EOF

docker compose exec nginx nginx -s reload

# Step 2: Continue processing existing webhooks (don't block)
# The webhook endpoints should remain active to process pending payments

# Step 3: Check for unprocessed webhooks
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  SELECT provider, count(*) FROM \"PaymentWebhook\"
  WHERE processed = false
  GROUP BY provider;
"

# Step 4: When ready to re-enable payments
rm /etc/nginx/conf.d/block-payments.conf
docker compose exec nginx nginx -s reload
```

### 4.5 Rotate Compromised Payment Keys

```bash
# Razorpay key rotation:
# 1. Generate new keys in Razorpay Dashboard → Settings → API Keys
# 2. Update environment variables
export RAZORPAY_KEY_ID="rzp_live_NEW_KEY_ID"
export RAZORPAY_KEY_SECRET="NEW_SECRET"
export RAZORPAY_WEBHOOK_SECRET="NEW_WEBHOOK_SECRET"
# 3. Restart services
docker compose up -d --force-recreate frontend

# Stripe key rotation:
# 1. Generate new keys in Stripe Dashboard → Developers → API Keys
# 2. Update environment variables
export STRIPE_SECRET_KEY="sk_live_NEW_KEY"
export STRIPE_WEBHOOK_SECRET="whsec_NEW_SECRET"
# 3. Restart services
docker compose up -d --force-recreate frontend

# 4. Revoke old keys in the provider dashboard
# 5. Verify with a test payment
```

---

## 5. Emergency Shutdown Procedure

### 5.1 When to Perform Emergency Shutdown

- Security breach detected (data exfiltration, unauthorized access)
- Ransomware or destructive attack in progress
- Runaway process consuming all resources
- Data corruption spreading

### 5.2 Emergency Shutdown Steps

```bash
#!/bin/bash
# emergency-shutdown.sh
# Execute this script to immediately halt all AcquisitionOS services

echo "🚨 EMERGENCY SHUTDOWN INITIATED"
echo "Timestamp: $(date -Iseconds)"
echo "Initiated by: $(whoami)"

# Step 1: Enable maintenance page immediately
echo "Enabling maintenance page..."
cat > /etc/nginx/conf.d/maintenance.conf <<'EOF'
server {
    listen 80 default_server;
    listen 443 ssl default_server;
    ssl_certificate /etc/letsencrypt/live/app.acquisitionos.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.acquisitionos.com/privkey.pem;

    location / {
        return 503;
        error_page 503 /maintenance.html;
    }

    location = /maintenance.html {
        root /var/www/maintenance;
        internal;
    }
}
EOF
docker compose exec nginx nginx -s reload 2>/dev/null || true

# Step 2: Take a snapshot backup before shutdown
echo "Taking emergency backup..."
bash /opt/acquisitionos/scripts/backup/backup.sh || true

# Step 3: Stop all services (order: clients first, then servers)
echo "Stopping services..."
docker compose stop frontend backend celery-worker celery-beat 2>/dev/null || true
docker compose stop nginx 2>/dev/null || true
docker compose stop redis 2>/dev/null || true
docker compose stop postgres 2>/dev/null || true

# Step 4: Verify all services are stopped
echo "Verifying shutdown..."
RUNNING=$(docker compose ps -q 2>/dev/null | wc -l)
if [ "$RUNNING" -gt 0 ]; then
  echo "⚠️  Some containers still running. Force killing..."
  docker compose kill 2>/dev/null || true
fi

# Step 5: Log the shutdown
echo "🚨 EMERGENCY SHUTDOWN COMPLETE"
echo "All services stopped at $(date -Iseconds)"
echo ""
echo "Next steps:"
echo "1. Investigate the cause"
echo "2. Review logs: docker compose logs --since 1h"
echo "3. Check backup: ls -la /opt/acquisitionos/backups/"
echo "4. Follow INCIDENT_RESPONSE.md"
echo "5. Do NOT restart services until root cause is identified"
```

### 5.3 Targeted Service Shutdown

If only specific services need to be stopped:

```bash
# Stop frontend only (users see 502 from Nginx)
docker compose stop frontend

# Stop frontend + backend (API calls fail, but static assets may still serve)
docker compose stop frontend backend

# Stop background processing only (emails, workflows delayed)
docker compose stop celery-worker celery-beat

# Stop database (⚠️ causes total outage)
docker compose stop postgres

# Stop realtime service only (notifications delayed, app still works)
docker compose stop realtime-service
```

### 5.4 Data Preservation During Emergency

```bash
# Create an immediate database dump before any investigation
docker compose exec -T postgres pg_dump -U postgres -F c acquisitionos | gzip > \
  /emergency/acquisitionos_emergency_$(date +%Y%m%d_%H%M%S).sql.gz

# Save Redis state
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" LASTSAVE

# Copy application logs
docker compose logs --since 6h > /emergency/logs_$(date +%Y%m%d_%H%M%S).txt

# Save Docker container states
docker compose ps > /emergency/docker_ps_$(date +%Y%m%d_%H%M%S).txt
docker stats --no-stream > /emergency/docker_stats_$(date +%Y%m%d_%H%M%S).txt
```

---

## 6. Post-Rollback Verification

### 6.1 Verification Checklist

After any rollback, complete ALL of the following checks before declaring the system recovered.

#### Infrastructure Verification

| # | Check | Command | Expected Result | Pass? |
|---|-------|---------|-----------------|-------|
| 6.1 | All containers running | `docker compose ps` | All services Up | ☐ |
| 6.2 | Health check passes | `curl -sf /api/health` | `{"status":"healthy"}` | ☐ |
| 6.3 | Detailed health passes | `curl -sf /api/health/detailed` | All components healthy | ☐ |
| 6.4 | No crash loops | `docker compose ps` | 0 restart counts | ☐ |
| 6.5 | Memory within limits | `docker stats --no-stream` | No OOM kills | ☐ |
| 6.6 | Disk space available | `df -h` | >20% free | ☐ |

#### Application Verification

| # | Check | Command/Action | Expected Result | Pass? |
|---|-------|---------------|-----------------|-------|
| 6.7 | User can sign in | Test login | JWT tokens set | ☐ |
| 6.8 | Dashboard loads | Visit /dashboard | No JS errors | ☐ |
| 6.9 | Leads page loads | Visit /leads | Data displays | ☐ |
| 6.10 | Pipeline loads | Visit /pipeline | Kanban renders | ☐ |
| 6.11 | AI features work | Test Discover | Results returned | ☐ |
| 6.12 | Payment flow works | Test checkout | Order created | ☐ |
| 6.13 | Webhook processing | Check PaymentWebhook | No unprocessed | ☐ |
| 6.14 | Email delivery | Test signup | Verification email sent | ☐ |
| 6.15 | WebSocket connected | Check notifications | Real-time updates | ☐ |

#### Data Integrity Verification

| # | Check | Command | Expected Result | Pass? |
|---|-------|---------|-----------------|-------|
| 6.16 | User count matches | `SELECT count(*) FROM "User"` | Same as pre-rollback | ☐ |
| 6.17 | Lead count matches | `SELECT count(*) FROM "Lead"` | Same as pre-rollback | ☐ |
| 6.18 | No orphaned records | Check FK constraints | 0 violations | ☐ |
| 6.19 | Subscription states valid | `SELECT status, count(*) FROM "Subscription" GROUP BY status` | No invalid states | ☐ |
| 6.20 | Credits are consistent | `SELECT u.credits, cl.balance FROM "User" u LEFT JOIN "CreditsLedger" cl ON ...` | Balances match | ☐ |
| 6.21 | Payment orders consistent | `SELECT status, count(*) FROM "PaymentOrder" GROUP BY status` | No anomalies | ☐ |
| 6.22 | Audit log intact | `SELECT count(*) FROM "AuditLog" WHERE "createdAt" > NOW() - INTERVAL '24 hours'` | Recent entries exist | ☐ |

#### Security Verification

| # | Check | Command | Expected Result | Pass? |
|---|-------|---------|-----------------|-------|
| 6.23 | JWT_SECRET is set | `echo $JWT_SECRET \| wc -c` | >44 characters | ☐ |
| 6.24 | AUTH_DEV_MODE is off | `echo $AUTH_DEV_MODE` | Empty or "false" | ☐ |
| 6.25 | Secure cookies | `curl -v /api/auth/signin` | Secure flag set | ☐ |
| 6.26 | Rate limiting active | Rapid login attempts | Blocked after 5 | ☐ |
| 6.27 | No unauthorized access | `curl /api/leads` without token | 401 response | ☐ |

### 6.2 Monitoring Verification (Post-Rollback)

```bash
# Wait 15 minutes after rollback, then verify:

# 1. Error rate is below threshold
curl -s 'http://localhost:9090/api/v1/query?query=sum(rate(http_requests_total{status=~"5.."}[5m]))/sum(rate(http_requests_total[5m]))' | jq '.data.result[0].value[1]'
# Should be < 0.02 (2%)

# 2. No new alerts firing
curl -s 'http://localhost:9090/api/v1/alerts' | jq '.data.alerts[] | select(.state=="firing")'

# 3. Grafana dashboards show normal patterns
# Visit https://grafana.acquisitionos.com → App Overview

# 4. Check Sentry for new error spikes
# Visit https://sentry.io/organizations/acquisitionos

# 5. Monitor for 1 hour before declaring full recovery
```

### 6.3 Post-Rollback Report Template

After completing the rollback and verification, document:

```markdown
## Rollback Report

**Date**: YYYY-MM-DD
**Incident ID**: INC-XXX
**Rolled back by**: Name
**Rollback start time**: HH:MM UTC
**Rollback end time**: HH:MM UTC
**Total downtime**: XX minutes

### What was rolled back
- [ ] Database
- [ ] Frontend (version X.Y.Z → X.Y.W)
- [ ] Backend (version X.Y.Z → X.Y.W)
- [ ] Feature flag: [flag name]
- [ ] Payment gateway: [provider]
- [ ] Other: [description]

### Root cause of the failure
[Describe what went wrong and why the rollback was needed]

### Rollback method used
[Describe the specific steps taken]

### Data loss assessment
- Users affected: [count]
- Data lost: [description]
- Transactions affected: [count]

### Verification results
- All checks passed: [yes/no]
- Outstanding issues: [list]

### Follow-up actions
1. [Action item]
2. [Action item]
3. [Action item]

### Post-mortem scheduled
Date: YYYY-MM-DD
Attendees: [list]
```

---

## Quick Reference: Rollback Decision Matrix

| Scenario | Rollback Method | Downtime | Data Risk |
|----------|----------------|----------|-----------|
| Bad frontend deployment | Redeploy previous image | ~2 min | None |
| Bad backend deployment | Redeploy previous image | ~2 min | None |
| Breaking DB migration | Restore from pre-migration backup | ~15 min | Possible (data after backup lost) |
| Feature flag issue | Toggle via database | ~1 min | None |
| Payment gateway failure | Remove keys, restart | ~2 min | None (pending webhooks may need replay) |
| Security breach | Emergency shutdown | Full outage | Preserve for forensics |
| Data corruption | Restore from backup | ~30 min | Data after backup lost |
| Performance regression | Scale up + rollback | ~5 min | None |
| Total unknown failure | Full restore from backup | ~30 min | Data after backup lost |

---

**See also**:
- [RUNBOOK.md](./RUNBOOK.md) — Operational runbook
- [GO_LIVE.md](./GO_LIVE.md) — Go-live checklist
- [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) — Incident response plan
- [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) — Disaster recovery
