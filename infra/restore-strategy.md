# AcquisitionOS — Restore Strategy

## Overview

This document defines the procedures for restoring AcquisitionOS from backups in various failure scenarios, including point-in-time recovery, full disaster recovery, and individual component restore.

---

## 1. Point-in-Time Recovery (PITR)

### SQLite PITR

Since SQLite doesn't natively support PITR with WAL archiving, we achieve this through our incremental backup strategy:

1. **Identify target time**: Determine the point you need to recover to
2. **Select base backup**: Choose the most recent full backup before the target time
3. **Apply incremental WALs**: Apply WAL files in chronological order up to the target time

```bash
# Step 1: Stop the application
systemctl stop acquisitionos

# Step 2: Restore base full backup
gunzip -c /backups/daily/acquisitionos_20260304_020000.db.gz > /app/db/acquisitionos.db

# Step 3: Copy WAL files up to target time
cp /backups/incremental/wal_20260304_030000.wal /app/db/acquisitionos.db-wal
# Do NOT copy WALs after the target time

# Step 4: Replay WAL
sqlite3 /app/db/acquisitionos.db "PRAGMA wal_checkpoint(FULL)"

# Step 5: Verify integrity
sqlite3 /app/db/acquisitionos.db "PRAGMA integrity_check;"

# Step 6: Start the application
systemctl start acquisitionos
```

### Redis PITR

1. **Stop Redis**
2. **Replace RDB file with target version**
3. **Optionally apply AOF for finer granularity**
4. **Start Redis**

```bash
# Stop Redis
systemctl stop redis

# Restore RDB
gunzip -c /backups/redis/redis_20260304_060000.rdb.gz > /var/lib/redis/dump.rdb

# Or restore with AOF for more recent data
cp /backups/redis/appendonly.aof /var/lib/redis/appendonly.aof

# Start Redis
systemctl start redis

# Verify
redis-cli PING
redis-cli INFO keyspace
```

---

## 2. Database Restore Procedures

### Full Database Restore from S3

```bash
#!/bin/bash
# restore-db.sh - Full SQLite Database Restore
set -euo pipefail

BACKUP_DATE=${1:?Usage: restore-db.sh YYYYMMDD}
S3_BUCKET="s3://acquisitionos-backups"
DB_PATH="${DB_PATH:-/app/db/acquisitionos.db}"

echo "=== AcquisitionOS Database Restore ==="
echo "Target date: $BACKUP_DATE"

# Step 1: Stop application
echo "Stopping application..."
systemctl stop acquisitionos || true

# Step 2: Backup current (possibly corrupted) database
echo "Creating safety backup of current database..."
cp "$DB_PATH" "${DB_PATH}.pre-restore.$(date +%Y%m%d_%H%M%S)"

# Step 3: Download backup from S3
echo "Downloading backup from S3..."
aws s3 cp "${S3_BUCKET}/daily/acquisitionos_${BACKUP_DATE}_020000.db.gz" /tmp/restore.db.gz

# Step 4: Decompress and restore
echo "Decompressing and restoring..."
gunzip -c /tmp/restore.db.gz > "$DB_PATH"

# Step 5: Verify integrity
echo "Verifying database integrity..."
INTEGRITY=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;")
if [[ "$INTEGRITY" != "ok" ]]; then
  echo "FATAL: Database integrity check failed!"
  echo "Restoring pre-restore backup..."
  cp "${DB_PATH}.pre-restore."* "$DB_PATH"
  exit 1
fi

# Step 6: Verify data
USER_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM User;")
LEAD_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM Lead;")
echo "Users: $USER_COUNT | Leads: $LEAD_COUNT"

# Step 7: Generate Prisma client
npx prisma generate

# Step 8: Start application
echo "Starting application..."
systemctl start acquisitionos

# Step 9: Health check
sleep 10
curl -sf http://localhost:3000/api/health || echo "WARNING: Health check failed"

echo "Database restore complete!"
```

### Partial Data Restore (Specific Tables)

```bash
# Export specific table from backup
sqlite3 /backups/daily/acquisitionos_backup.db ".dump Lead" > lead_restore.sql

# Import into production database
sqlite3 /app/db/acquisitionos.db < lead_restore.sql
```

---

## 3. Redis Restore Procedures

### Full Redis Restore

```bash
#!/bin/bash
# restore-redis.sh - Full Redis Restore
set -euo pipefail

BACKUP_DATE=${1:?Usage: restore-redis.sh YYYYMMDD}
S3_BUCKET="s3://acquisitionos-backups"

echo "=== AcquisitionOS Redis Restore ==="

# Stop Redis
echo "Stopping Redis..."
systemctl stop redis

# Download backup
echo "Downloading Redis backup..."
aws s3 cp "${S3_BUCKET}/redis/redis_${BACKUP_DATE}_060000.rdb.gz" /tmp/redis_restore.rdb.gz

# Decompress
gunzip -c /tmp/redis_restore.rdb.gz > /var/lib/redis/dump.rdb

# Set permissions
chown redis:redis /var/lib/redis/dump.rdb
chmod 640 /var/lib/redis/dump.rdb

# Remove AOF (to force RDB load)
rm -f /var/lib/redis/appendonly.aof

# Start Redis
echo "Starting Redis..."
systemctl start redis

# Verify
sleep 5
redis-cli PING
redis-cli INFO keyspace

echo "Redis restore complete!"
```

### Selective Key Restore

```bash
# Export specific keys from backup Redis instance
redis-cli -h backup-redis --rdb /tmp/backup.rdb

# Start temporary Redis with backup
redis-server --port 6380 --dbfilename /tmp/backup.rdb &

# Copy specific keys to production
redis-cli -p 6380 GET "session:abc123" | redis-cli -p 6379 SET "session:abc123"

# Cleanup
kill %1
```

---

## 4. File Restore Procedures

### Full Upload Directory Restore

```bash
#!/bin/bash
# restore-uploads.sh - Restore User Uploads
set -euo pipefail

BACKUP_DATE=${1:?Usage: restore-uploads.sh YYYYMMDD}
S3_BUCKET="s3://acquisitionos-backups"

echo "=== AcquisitionOS File Upload Restore ==="

# Download from S3
aws s3 sync "${S3_BUCKET}/uploads/${BACKUP_DATE}/" /app/uploads/ --delete

# Set permissions
chown -R app:app /app/uploads/
chmod -R 755 /app/uploads/

echo "File restore complete!"
```

### Single File Restore

```bash
aws s3 cp s3://acquisitionos-backups/uploads/20260304/path/to/file.pdf /app/uploads/path/to/file.pdf
```

---

## 5. Disaster Recovery Runbook

### Severity Levels

| Level | Scenario | RTO | RPO |
|-------|----------|-----|-----|
| P1 - Critical | Full data center loss | 4 hours | 1 hour |
| P2 - High | Database corruption | 2 hours | 1 hour |
| P3 - Medium | Redis data loss | 30 min | 6 hours |
| P4 - Low | Single file loss | 1 hour | 24 hours |

### P1: Full Disaster Recovery

1. **Provision new infrastructure** (Terraform/Docker Compose)
2. **Restore database** from most recent S3 backup
3. **Restore Redis** from most recent RDB snapshot
4. **Restore file uploads** from S3
5. **Update DNS** to point to new infrastructure
6. **Verify health checks** pass
7. **Run smoke tests** against all critical paths
8. **Notify stakeholders**

### P2: Database Corruption Recovery

1. **Stop application immediately**
2. **Preserve corrupted database** for forensic analysis
3. **Restore from most recent backup** (follow Database Restore procedure)
4. **Verify data integrity** with check queries
5. **Start application**
6. **Monitor for anomalies** for 24 hours
7. **Root cause analysis** on corrupted database

### P3: Redis Data Loss

1. **Redis persistence should auto-recover** from RDB/AOF
2. **If not, restore from backup** (follow Redis Restore procedure)
3. **Application will auto-populate cache** on next requests
4. **User sessions will need re-authentication** (acceptable)
5. **Verify rate limit counters** are reset appropriately

---

## 6. Restore Testing Schedule

| Test Type | Frequency | Environment | Duration |
|-----------|-----------|-------------|----------|
| Full DB restore | Weekly | Staging | 30 min |
| Redis restore | Monthly | Staging | 15 min |
| File restore | Monthly | Staging | 15 min |
| Full DR drill | Quarterly | DR environment | 4 hours |
| PITR test | Monthly | Staging | 30 min |

---

## 7. Post-Restore Validation Checklist

- [ ] Application health endpoint returns 200
- [ ] Database integrity check passes
- [ ] User count matches expected range
- [ ] Latest Lead/User timestamps are reasonable
- [ ] Redis is responding and has expected key count
- [ ] File uploads are accessible
- [ ] Authentication works (login test)
- [ ] API endpoints return valid responses
- [ ] No error spikes in application logs
- [ ] Monitoring dashboards show normal patterns
