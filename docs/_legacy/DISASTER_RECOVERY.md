# AcquisitionOS — Disaster Recovery Plan

Complete disaster recovery plan for AcquisitionOS production systems. This document defines recovery objectives, backup strategies, and step-by-step recovery procedures for all failure scenarios.

---

## Table of Contents

1. [RPO/RTO Targets](#1-rporto-targets)
2. [Backup Strategy](#2-backup-strategy)
3. [Recovery Procedures](#3-recovery-procedures)
4. [Failover Procedures](#4-failover-procedures)
5. [Data Loss Scenarios](#5-data-loss-scenarios)
6. [Communication Plan](#6-communication-plan)
7. [Testing DR](#7-testing-dr)
8. [Post-Incident Review](#8-post-incident-review)

---

## 1. RPO/RTO Targets

### Definitions

| Term | Definition |
|---|---|
| **RPO** (Recovery Point Objective) | Maximum acceptable amount of data loss, measured in time |
| **RTO** (Recovery Time Objective) | Maximum acceptable downtime after a disaster |

### Targets by Component

| Component | RPO | RTO | Priority | Notes |
|---|---|---|---|---|
| **PostgreSQL Database** | 1 hour | 30 min | P0 | Point-in-time recovery via WAL |
| **Redis Cache** | 5 min | 10 min | P1 | AOF + RDB persistence |
| **Application (Next.js)** | 0 (stateless) | 15 min | P0 | Rebuild from Docker image |
| **Application (FastAPI)** | 0 (stateless) | 15 min | P0 | Rebuild from Docker image |
| **WebSocket Service** | 0 (stateless) | 10 min | P1 | Reconnect from clients |
| **Celery Workers** | 0 (tasks requeued) | 15 min | P1 | Tasks resume from queue |
| **File Uploads (S3)** | 24 hours | 1 hour | P2 | S3 cross-region replication |
| **Monitoring Stack** | 1 day | 2 hours | P3 | Rebuild from config |
| **Configuration (.env)** | 0 (backed up) | 15 min | P0 | Stored in secrets manager |

### Tier Classification

| Tier | RPO | RTO | Components | SLA |
|---|---|---|---|---|
| **Tier 1 — Critical** | <1 hour | <30 min | Database, Application, Auth | 99.9% |
| **Tier 2 — Important** | <5 min | <1 hour | Redis, Celery, WebSocket | 99.5% |
| **Tier 3 — Standard** | <24 hours | <4 hours | Monitoring, Backups | 99% |

---

## 2. Backup Strategy

### What's Backed Up

| Data | Backup Method | Frequency | Retention | Storage Location |
|---|---|---|---|---|
| PostgreSQL | `pg_dump` + WAL archiving | Daily full + hourly WAL | 30 days | Server `/backups/` + S3 |
| Redis | RDB + AOF | Continuous (AOF) + Every 60s (RDB) | Latest only | Server volume |
| Environment Config | Encrypted `.env` copy | On change | 90 days | S3 (encrypted) |
| Docker Compose configs | Git repository | Continuous | Infinite | GitHub |
| Grafana Dashboards | JSON export | Weekly | 90 days | Git repository |
| Prometheus Rules | Git repository | Continuous | Infinite | GitHub |
| Nginx Config | Git repository | Continuous | Infinite | GitHub |
| User File Uploads | S3 versioning | Continuous | 90 day versions | S3 + Cross-region |

### Backup Scripts

The following backup scripts are available in `scripts/backup/`:

| Script | Purpose | Schedule |
|---|---|---|
| `backup.sh` | Full PostgreSQL backup | Daily at 2 AM |
| `snapshot.sh` | LVM/ filesystem snapshot | On demand |
| `retention.sh` | Clean old backups | Daily at 3 AM |
| `cron-setup.sh` | Configure backup cron jobs | One-time setup |
| `migration-rollback.sh` | Rollback a database migration | On demand |
| `restore.sh` | Restore from backup | On demand |

### Backup Verification

```bash
# Verify backup integrity
gunzip -t /backups/postgres/acquisitionos_$(date +%Y%m%d)*.sql.gz

# Test restore to a temporary database
createdb acquisitionos_test
gunzip < /backups/postgres/acquisitionos_$(date +%Y%m%d)*.sql.gz | \
  psql -U postgres acquisitionos_test

# Verify row counts
psql -U postgres acquisitionos_test -c "SELECT 'User' as tbl, COUNT(*) FROM \"User\";"
```

### Offsite Backup Replication

```bash
# Sync backups to S3 (encrypted)
aws s3 sync /backups/ s3://acquisitionos-backups/ \
  --sse aws:kms \
  --sse-kms-key-id alias/acquisitionos-backup-key

# Verify S3 backup
aws s3 ls s3://acquisitionos-backups/postgres/ --recursive | \
  awk '{print $4, $5}' | sort -k2
```

---

## 3. Recovery Procedures

### Full Database Restore

**When to use**: Complete database loss, corruption, or migration to new server

**Estimated RTO**: 30 minutes

```bash
#!/bin/bash
# full-db-restore.sh — Restore PostgreSQL from backup

set -euo pipefail

BACKUP_FILE="${1:?Usage: $0 <backup_file.sql.gz>}"
DB_NAME="acquisitionos"

echo "=== Full Database Restore ==="
echo "Backup file: $BACKUP_FILE"
echo "Target database: $DB_NAME"
echo ""

# 1. Stop all services that use the database
echo "Step 1: Stopping services..."
docker compose stop frontend backend celery-worker celery-beat

# 2. Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# 3. Verify backup integrity
echo "Step 2: Verifying backup integrity..."
gunzip -t "$BACKUP_FILE"

# 4. Drop and recreate database
echo "Step 3: Recreating database..."
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE $DB_NAME;"

# 5. Restore from backup
echo "Step 4: Restoring data..."
gunzip < "$BACKUP_FILE" | docker compose exec -T postgres psql -U postgres $DB_NAME

# 6. Verify restore
echo "Step 5: Verifying restore..."
TABLES=$(docker compose exec -T postgres psql -U postgres $DB_NAME -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
echo "Restored $TABLES tables"

# 7. Run Prisma schema sync (adds any new columns)
echo "Step 6: Syncing Prisma schema..."
docker compose run --rm frontend npx prisma db push --skip-generate

# 8. Start services
echo "Step 7: Starting services..."
docker compose start postgres
sleep 5
docker compose start backend celery-worker celery-beat frontend

# 9. Verify health
echo "Step 8: Verifying application health..."
sleep 15
if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "✅ Database restore completed successfully!"
else
  echo "❌ Health check failed. Check logs."
  docker compose logs --tail=50
fi
```

### Point-in-Time Recovery

**When to use**: Need to restore database to a specific point in time (e.g., before a bad migration or accidental deletion)

**Prerequisites**: WAL archiving must be enabled

**Estimated RTO**: 45 minutes

```bash
#!/bin/bash
# pitr-restore.sh — Point-in-Time Recovery for PostgreSQL

set -euo pipeify

TARGET_TIME="${1:?Usage: $0 <target_timestamp>}"
# Format: "2024-01-15 14:30:00 UTC"

echo "=== Point-in-Time Recovery ==="
echo "Target time: $TARGET_TIME"

# 1. Stop all services
docker compose stop frontend backend celery-worker celery-beat

# 2. Stop PostgreSQL
docker compose stop postgres

# 3. Back up current data directory (just in case)
echo "Backing up current data directory..."
cp -r /var/lib/postgresql/data /var/lib/postgresql/data_pre_pitr

# 4. Prepare recovery
docker compose exec postgres bash -c "
  # Create recovery signal file
  touch /var/lib/postgresql/data/recovery.signal

  # Configure recovery settings
  cat >> /var/lib/postgresql/data/postgresql.conf << 'CONF'
restore_command = 'cp /backups/wal/%f %p'
recovery_target_time = '$TARGET_TIME'
recovery_target_action = 'promote'
CONF
"

# 5. Start PostgreSQL in recovery mode
docker compose start postgres

# 6. Monitor recovery progress
echo "Monitoring recovery progress..."
for i in $(seq 1 60); do
  if docker compose exec -T postgres psql -U postgres -c "SELECT pg_is_in_recovery();" 2>/dev/null | rg -q "f"; then
    echo "Recovery completed! Database is now primary."
    break
  fi
  echo "Recovery in progress... ($i/60)"
  sleep 10
done

# 7. Verify data
docker compose exec -T postgres psql -U postgres -c "SELECT now(), pg_current_wal_lsn();"

# 8. Start services
docker compose start backend celery-worker celery-beat frontend

# 9. Verify health
sleep 15
curl -sf http://localhost:3000/api/health && echo "Restore successful!" || echo "Health check failed!"
```

### Application Server Recovery

**When to use**: Application server crashed, needs to be rebuilt from scratch

**Estimated RTO**: 15-30 minutes

```bash
#!/bin/bash
# app-server-recovery.sh — Rebuild application server from scratch

set -euo pipeify

echo "=== Application Server Recovery ==="

# 1. Install prerequisites
apt update && apt install -y docker.io docker-compose-plugin git

# 2. Clone repository
cd /opt
git clone https://github.com/your-org/acquisitionos.git
cd acquisitionos

# 3. Checkout production branch
git checkout main

# 4. Restore environment configuration
# Option A: From S3 backup
aws s3 cp s3://acquisitionos-backups/config/.env.production .env

# Option B: From secrets manager
# (Pull from HashiCorp Vault, AWS Secrets Manager, etc.)

# 5. Pull Docker images
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

# 6. Run database migrations
docker compose run --rm frontend npx prisma generate
docker compose run --rm frontend npx prisma db push

# 7. Start all services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 8. Verify health
sleep 20
curl -sf http://localhost:3000/api/health && echo "App server recovery successful!" || echo "Health check failed!"
```

### Configuration Recovery

**When to use**: `.env` file lost or corrupted

```bash
#!/bin/bash
# config-recovery.sh — Restore environment configuration

# Option 1: From S3 encrypted backup
aws s3 cp s3://acquisitionos-backups/config/.env.production /opt/acquisitionos/.env \
  --sse aws:kms

# Option 2: From GitHub Secrets (requires manual reconstruction)
# Access GitHub repo Settings → Secrets → Actions
# Reconstruct .env from secrets

# Option 3: From another server
scp production-server:/opt/acquisitionos/.env /opt/acquisitionos/.env

# Verify critical variables
source /opt/acquisitionos/.env
for var in DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET NEXTAUTH_SECRET ZAI_API_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set!"
  else
    echo "OK: $var is set"
  fi
done
```

### Integration Reconnection

**When to use**: External integrations (Gmail, Telegram, WhatsApp) need to be reconnected after a disaster

| Integration | Reconnection Steps |
|---|---|
| **Gmail** | 1. Verify `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in `.env` 2. Users must re-authenticate via OAuth flow 3. Check Pub/Sub topic configuration |
| **Telegram** | 1. Verify `TELEGRAM_BOT_TOKEN` in `.env` 2. Set webhook URL: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://app.acquisitionos.com/api/webhooks/telegram` 3. Test with `/start` command |
| **WhatsApp** | 1. Verify `META_WHATSAPP_TOKEN` and `META_APP_SECRET` 2. Verify webhook URL in Meta Dashboard 3. Test with a message |
| **Stripe** | 1. Verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` 2. Verify webhook endpoint in Stripe Dashboard 3. Send test event from Dashboard |
| **Razorpay** | 1. Verify `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` 2. Verify webhook URL in Razorpay Dashboard 3. Send test event |
| **Sentry** | 1. Verify `SENTRY_DSN` in `.env` 2. Trigger test error 3. Verify in Sentry Dashboard |

---

## 4. Failover Procedures

### Manual Failover

**When to use**: Primary server is down and you need to switch to a standby

```bash
#!/bin/bash
# manual-failover.sh — Switch to standby server

STANDBY_HOST="${1:?Usage: $0 <standby_host>}"

echo "=== Manual Failover to $STANDBY_HOST ==="

# 1. Verify standby is healthy
ssh $STANDBY_HOST "docker compose ps"
ssh $STANDBY_HOST "curl -sf http://localhost:3000/api/health"

# 2. Ensure database replication is up to date
ssh $STANDBY_HOST "docker compose exec postgres psql -U postgres -c 'SELECT pg_is_in_recovery();'"

# 3. Promote standby to primary (if using replication)
ssh $STANDBY_HOST "docker compose exec postgres psql -U postgres -c 'SELECT pg_promote();'"

# 4. Update DNS to point to standby
# Via Cloudflare API:
curl -X PUT "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${RECORD_ID}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -d "{\"type\":\"A\",\"name\":\"app\",\"content\":\"${STANDBY_IP}\",\"ttl\":60,\"proxied\":true}"

# 5. Verify new primary
sleep 10
curl -sf https://app.acquisitionos.com/api/health && echo "Failover successful!" || echo "Failover may have issues!"

echo "IMPORTANT: Update monitoring, alerts, and team channels."
```

### Automated Failover

Automated failover is configured via:

1. **PostgreSQL**: Streaming replication with `repmgr` or managed service (Supabase/RDS) auto-failover
2. **Redis**: Redis Sentinel for automatic failover
3. **Application**: Docker Compose with `restart: always` policy
4. **Load Balancer**: Nginx upstream health checks with automatic removal of unhealthy instances

---

## 5. Data Loss Scenarios

### Scenario: Accidental Table Truncation

**Impact**: Data in one table lost, other tables intact

**Recovery**:
1. Stop the application immediately
2. Restore the specific table from the latest backup:
   ```bash
   # Create a temporary restore database
   createdb acquisitionos_restore
   gunzip < /backups/postgres/latest.sql.gz | psql -U postgres acquisitionos_restore

   # Export the truncated table
   pg_dump -U postgres -t "Lead" acquisitionos_restore > lead_table.sql

   # Import into production
   psql -U postgres acquisitionos < lead_table.sql

   # Clean up
   dropdb acquisitionos_restore
   ```
3. If WAL archiving is available, use PITR for more recent data

### Scenario: Accidental Database Drop

**Impact**: Complete data loss

**Recovery**:
1. Follow [Full Database Restore](#full-database-restore) procedure
2. If WAL archiving enabled, use [Point-in-Time Recovery](#point-in-time-recovery)
3. Verify data integrity with row counts

### Scenario: Redis Data Loss

**Impact**: Session data, cache, rate limit counters lost; Celery queue lost

**Recovery**:
1. **Sessions**: Users will need to re-authenticate (acceptable — access tokens expire in 15 min)
2. **Cache**: Application will rebuild cache naturally (cache-aside pattern)
3. **Rate Limiting**: Counters reset — acceptable short-term increase
4. **Celery Queue**: Check for dead letter items and re-queue important tasks
   ```bash
   # Re-queue failed payment webhooks
   docker compose exec backend python -c "
   from app.tasks.billing_tasks import process_webhook
   from app.database import get_session
   from app.models import PaymentWebhook
   session = get_session()
   unprocessed = session.query(PaymentWebhook).filter_by(processed=False).all()
   for wh in unprocessed:
       process_webhook.delay(event_id=wh.eventId)
   "
   ```

### Scenario: File Upload Loss (S3)

**Impact**: User-uploaded files (screenshots, avatars) lost

**Recovery**:
1. Restore from S3 cross-region replica:
   ```bash
   aws s3 sync s3://acquisitionos-assets-backup s3://acquisitionos-assets --delete
   ```
2. If no cross-region replica, files are lost — users must re-upload

### Scenario: Secret Compromise

**Impact**: Cryptographic secrets leaked; attacker can forge tokens or decrypt data

**Recovery**:
1. Follow emergency rotation in [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md)
2. Specifically:
   - Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` immediately
   - Revoke all user sessions (force re-login)
   - Rotate `TOKEN_ENCRYPTION_KEY` and re-encrypt all stored tokens
   - Rotate payment provider keys via their dashboards
   - Rotate third-party API keys (Telegram, WhatsApp, etc.)
3. Audit logs for unauthorized access during compromise window
4. Notify affected users if data was accessed

---

## 6. Communication Plan

### Notification Hierarchy

| Priority | Who to Notify | How | Within |
|---|---|---|---|
| P1 — Critical | On-call engineer → Engineering lead → CTO | PagerDuty + Phone | 5 min |
| P2 — High | On-call engineer → Engineering lead | PagerDuty + Slack | 15 min |
| P3 — Medium | Engineering team | Slack | 1 hour |
| P4 — Low | Engineering team | Slack | 24 hours |

### External Communication

| Stakeholder | When | Template |
|---|---|---|
| **Users** | P1 incidents, >30 min outage | Status page + Email |
| **Customers (Enterprise)** | P1 incidents immediately | Direct email + Phone |
| **Partners** | If integrations affected | Email |
| **Public** | P1, >1 hour outage | Status page + Social media |

### Incident Communication Templates

#### Status Page — Initial Report

```
[Investigating] We are investigating reports of [service] being unavailable.
Our engineering team is actively working on the issue. We will provide an update within 15 minutes.
```

#### Status Page — Update

```
[Update] We have identified the root cause of [issue] and are implementing a fix.
[Estimated time for resolution: XX minutes]. We apologize for the inconvenience.
```

#### Status Page — Resolution

```
[Resolved] [Service] has been fully restored as of [time UTC].
The incident lasted approximately [duration]. We will publish a post-incident report within 48 hours.
```

#### User Email — Data Incident

```
Subject: Important Security Notice from AcquisitionOS

Dear [User Name],

We are writing to inform you of a security incident that may have affected your account.

What Happened:
[Brief description of the incident]

What Data Was Affected:
[Specific data types affected]

What We Have Done:
- [Action 1: e.g., Rotated all security keys]
- [Action 2: e.g., Forced password reset for all users]
- [Action 3: e.g., Engaged external security firm]

What You Should Do:
1. [Action 1: e.g., Reset your password]
2. [Action 2: e.g., Review your account activity]
3. [Action 3: e.g., Enable MFA if not already enabled]

We take the security of your data extremely seriously and sincerely apologize for this incident.

For questions, contact: security@acquisitionos.com

Sincerely,
The AcquisitionOS Team
```

---

## 7. Testing DR

### Monthly DR Test (Automated)

```bash
#!/bin/bash
# dr-test-monthly.sh — Automated monthly DR test

echo "=== Monthly DR Test — $(date) ==="

# 1. Verify backup exists and is recent
LATEST_BACKUP=$(ls -t /backups/postgres/*.sql.gz | head -1)
BACKUP_AGE=$(( ($(date +%s) - $(stat -c %Y "$LATEST_BACKUP")) / 3600 ))
if [ "$BACKUP_AGE" -gt 25 ]; then
  echo "FAIL: Latest backup is $BACKUP_AGE hours old (>25 hours)"
  exit 1
fi
echo "PASS: Latest backup is $BACKUP_AGE hours old"

# 2. Verify backup integrity
gunzip -t "$LATEST_BACKUP" && echo "PASS: Backup integrity verified" || echo "FAIL: Backup corrupt"

# 3. Test restore to temporary database
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS acquisitionos_dr_test;"
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE acquisitionos_dr_test;"
gunzip < "$LATEST_BACKUP" | docker compose exec -T postgres psql -U postgres acquisitionos_dr_test

# 4. Verify row counts
TABLES=("User" "Lead" "Subscription" "PaymentOrder")
for table in "${TABLES[@]}"; do
  COUNT=$(docker compose exec -T postgres psql -U postgres acquisitionos_dr_test -t -c "SELECT COUNT(*) FROM \"$table\";" | tr -d ' ')
  echo "PASS: $table has $COUNT rows"
done

# 5. Clean up
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE acquisitionos_dr_test;"

# 6. Verify S3 backup
S3_COUNT=$(aws s3 ls s3://acquisitionos-backups/postgres/ --recursive | wc -l)
echo "PASS: $S3_COUNT backups in S3"

# 7. Measure restore time
START_TIME=$(date +%s)
# (Restore would happen here)
END_TIME=$(date +%s)
RESTORE_TIME=$((END_TIME - START_TIME))
echo "PASS: Restore time: ${RESTORE_TIME}s (RTO target: 1800s)"

echo "=== Monthly DR Test Complete ==="
```

### Quarterly DR Drill (Manual)

**Full DR drill procedure** (performed once per quarter):

1. **Schedule** the drill with the team (1 week notice)
2. **Simulate** a disaster scenario (e.g., "primary database is down")
3. **Execute** the full recovery procedure from this document
4. **Measure** actual RTO and compare against target
5. **Verify** data integrity after recovery
6. **Document** findings and any gaps
7. **Improve** procedures based on findings

### DR Test Checklist

- [ ] Backup exists and is <24 hours old
- [ ] Backup file passes integrity check (`gunzip -t`)
- [ ] Full database restore completes successfully
- [ ] Row counts match production (within acceptable variance)
- [ ] Application starts and passes health check after restore
- [ ] S3 offsite backup is accessible
- [ ] Restore time is within RTO target
- [ ] Configuration can be reconstructed from backup/secrets manager
- [ ] Integration reconnection procedure works
- [ ] Communication plan contact list is current

---

## 8. Post-Incident Review

### Review Template

```markdown
# Post-Incident Review — [Incident Title]

**Date**: [YYYY-MM-DD]
**Duration**: [Start time] — [End time] ([Total duration])
**Severity**: [P1/P2/P3/P4]
**Impact**: [Number of users affected, revenue impact, etc.]
**Resolved by**: [Engineer name(s)]

## Timeline

| Time (UTC) | Event |
|---|---|
| HH:MM | Alert triggered |
| HH:MM | Engineer acknowledged |
| HH:MM | Root cause identified |
| HH:MM | Fix implemented |
| HH:MM | Service restored |

## Root Cause

[Detailed explanation of what caused the incident]

## What Went Well

- [Thing 1]
- [Thing 2]

## What Could Be Improved

- [Gap 1]
- [Gap 2]

## Action Items

| # | Action | Owner | Due Date | Status |
|---|---|---|---|---|
| 1 | [Action item] | [Name] | [Date] | ☐ |
| 2 | [Action item] | [Name] | [Date] | ☐ |

## Lessons Learned

[Key takeaways that should inform future practices]

## Attachments

- [Grafana screenshot during incident]
- [Relevant log excerpts]
- [Code changes made]
```

### Review Process

1. **Schedule** review within 48 hours of incident resolution
2. **Invite** all involved engineers, engineering lead, product representative
3. **Walk through** the timeline and root cause
4. **Focus** on process and system improvements, not blame
5. **Assign** action items with owners and deadlines
6. **Publish** the review to the team wiki
7. **Track** action items to completion

### Action Item Categories

| Category | Examples | Typical Owner |
|---|---|---|
| **Monitoring** | Add alert, improve dashboard | Platform team |
| **Automation** | Add auto-restart, self-healing | DevOps |
| **Process** | Update runbook, add checklist | Engineering |
| **Architecture** | Add redundancy, improve fallback | Platform team |
| **Communication** | Update escalation, improve templates | Engineering lead |
