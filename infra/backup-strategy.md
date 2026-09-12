# AcquisitionOS — Backup Strategy

## Overview

This document defines the backup strategy for all AcquisitionOS data stores, including the SQLite database, Redis cache, and file uploads.

---

## 1. SQLite Database Backups

### Full Backups (Daily)

- **Schedule**: Every day at 02:00 UTC
- **Method**: SQLite `VACUUM INTO` command for consistent snapshot
- **Command**:
  ```bash
  sqlite3 /app/db/acquisitionos.db "VACUUM INTO '/backups/daily/acquisitionos_$(date +%Y%m%d_%H%M%S).db'"
  ```
- **Compression**: gzip after backup
  ```bash
  gzip /backups/daily/acquisitionos_*.db
  ```
- **Destination**: Local disk + S3 bucket (`s3://acquisitionos-backups/daily/`)

### Incremental Backups (Hourly)

- **Schedule**: Every hour at :30
- **Method**: WAL (Write-Ahead Log) checkpoint + copy
- **Command**:
  ```bash
  sqlite3 /app/db/acquisitionos.db "PRAGMA wal_checkpoint(TRUNCATE)"
  cp /app/db/acquisitionos.db-wal /backups/incremental/wal_$(date +%Y%m%d_%H%M%S).wal
  ```
- **Destination**: Local disk + S3 bucket (`s3://acquisitionos-backups/incremental/`)

### Pre-Migration Backups

- **Trigger**: Before every `prisma db push` or migration
- **Method**: Full VACUUM INTO backup
- **Retention**: 90 days (longer than regular backups)
- **Naming**: `acquisitionos_pre_migration_YYYYMMDD_HHMMSS.db.gz`

---

## 2. Redis Backups

### RDB Snapshots

- **Schedule**: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
- **Method**: `BGSAVE` triggered via Redis CLI
- **Configuration**:
  ```redis
  save 900 1       # After 15 min if at least 1 key changed
  save 300 100     # After 5 min if at least 100 keys changed
  save 60 10000    # After 1 min if at least 10000 keys changed
  ```
- **RDB file location**: `/var/lib/redis/dump.rdb`
- **Copy to backup**:
  ```bash
  redis-cli BGSAVE
  sleep 5  # Wait for background save to complete
  cp /var/lib/redis/dump.rdb /backups/redis/redis_$(date +%Y%m%d_%H%M%S).rdb
  gzip /backups/redis/redis_*.rdb
  ```

### AOF (Append Only File) - For durability

- **Configuration**:
  ```redis
  appendonly yes
  appendfsync everysec
  auto-aof-rewrite-percentage 100
  auto-aof-rewrite-min-size 64mb
  ```
- **AOF file location**: `/var/lib/redis/appendonly.aof`

---

## 3. File Upload Backups

### User Uploads

- **Location**: `/app/uploads/`
- **Schedule**: Daily sync at 03:00 UTC
- **Method**: `rsync` to S3
  ```bash
  aws s3 sync /app/uploads/ s3://acquisitionos-backups/uploads/$(date +%Y%m%d)/ --delete
  ```
- **Versioning**: S3 bucket versioning enabled

### Website Screenshots

- **Location**: `/app/screenshots/`
- **Schedule**: Daily sync at 03:30 UTC
- **Method**: Same rsync approach as user uploads

---

## 4. Backup Schedule Summary

| Data Store | Full Backup | Incremental | Retention | Destination |
|-----------|------------|-------------|-----------|-------------|
| SQLite DB | Daily 02:00 | Hourly :30 | 30 days | S3 + Local |
| Redis RDB | Every 6 hours | AOF (realtime) | 14 days | S3 + Local |
| File Uploads | Daily 03:00 | N/A | 30 days | S3 |
| Pre-Migration | On-demand | N/A | 90 days | S3 + Local |

---

## 5. Retention Policy

- **Daily full backups**: 30 days
- **Hourly incremental backups**: 7 days
- **Redis RDB snapshots**: 14 days
- **Pre-migration backups**: 90 days
- **S3 lifecycle policy**: Automatically transition to Glacier after 30 days, delete after 365 days

---

## 6. Backup Verification

### Automated Restore Testing

- **Schedule**: Weekly (Sunday 04:00 UTC)
- **Process**:
  1. Spin up a fresh test environment
  2. Download latest full backup from S3
  3. Restore to test environment
  4. Run health checks and data integrity queries
  5. Report pass/fail to Slack/PagerDuty

### Integrity Check Queries

```sql
-- Verify user count
SELECT COUNT(*) FROM User;

-- Verify no data corruption
PRAGMA integrity_check;

-- Verify latest records
SELECT MAX(createdAt) FROM User;
SELECT MAX(createdAt) FROM Lead;
SELECT MAX(createdAt) FROM AuditLog;
```

---

## 7. Backup Automation Script

```bash
#!/bin/bash
# backup.sh - AcquisitionOS Backup Script
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
S3_BUCKET="s3://acquisitionos-backups"
DB_PATH="${DB_PATH:-/app/db/acquisitionos.db}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# SQLite Full Backup
log "Starting SQLite full backup..."
sqlite3 "$DB_PATH" "VACUUM INTO '${BACKUP_DIR}/daily/acquisitionos_${TIMESTAMP}.db'"
gzip "${BACKUP_DIR}/daily/acquisitionos_${TIMESTAMP}.db"
aws s3 cp "${BACKUP_DIR}/daily/acquisitionos_${TIMESTAMP}.db.gz" "${S3_BUCKET}/daily/"
log "SQLite backup complete."

# Redis RDB Backup
log "Starting Redis backup..."
redis-cli BGSAVE
sleep 10
cp /var/lib/redis/dump.rdb "${BACKUP_DIR}/redis/redis_${TIMESTAMP}.rdb"
gzip "${BACKUP_DIR}/redis/redis_${TIMESTAMP}.rdb"
aws s3 cp "${BACKUP_DIR}/redis/redis_${TIMESTAMP}.rdb.gz" "${S3_BUCKET}/redis/"
log "Redis backup complete."

# Cleanup old local backups
find "${BACKUP_DIR}/daily/" -name "*.gz" -mtime +7 -delete
find "${BACKUP_DIR}/redis/" -name "*.gz" -mtime +7 -delete
find "${BACKUP_DIR}/incremental/" -name "*.wal" -mtime +3 -delete

log "All backups completed successfully."
```

---

## 8. Monitoring & Alerting

- **Backup failure**: Alert to PagerDuty (P2)
- **Backup size anomaly**: Alert if backup size deviates >50% from rolling 7-day average
- **Missed backup**: Alert if no backup created within expected window + 30 min
- **S3 upload failure**: Alert immediately, retry 3 times with exponential backoff
