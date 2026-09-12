# AcquisitionOS — Database Migration & Rollback Strategy

## Overview

This document defines the procedures for applying database migrations (via Prisma) and rolling them back safely in case of issues.

---

## 1. Prisma Migration Procedures

### Development Environment

```bash
# Create a migration after schema changes
npx prisma migrate dev --name descriptive_migration_name

# Apply pending migrations
npx prisma migrate dev

# Reset database (DANGER: destroys all data)
npx prisma migrate reset
```

### Production Environment (SQLite with db push)

Since AcquisitionOS uses SQLite with `prisma db push`, migrations are schema-first:

```bash
# 1. PRE-MIGRATION: Create backup
./infra/scripts/backup-before-migration.sh

# 2. Generate migration SQL for review
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma.new \
  --script > migration.sql

# 3. Review migration.sql before applying

# 4. Apply schema changes
npx prisma db push

# 5. Generate Prisma client
npx prisma generate

# 6. Verify application starts
bun run build
```

---

## 2. Pre-Migration Requirements

### Checklist Before Every Migration

- [ ] **Backup created**: Full database backup completed and verified
- [ ] **Backup tested**: Integrity check on backup file passes
- [ ] **Migration reviewed**: SQL changes reviewed by at least one team member
- [ ] **Rollback plan documented**: Steps to undo the migration documented
- [ ] **Staging tested**: Migration applied to staging environment successfully
- [ ] **Downtime window scheduled**: Users notified if downtime is expected
- [ ] **Monitoring ready**: Alerts configured for post-migration validation

### Pre-Migration Backup Script

```bash
#!/bin/bash
# backup-before-migration.sh
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_PATH="${DB_PATH:-/app/db/acquisitionos.db}"
BACKUP_DIR="/backups/pre-migration"

mkdir -p "$BACKUP_DIR"

echo "Creating pre-migration backup..."
sqlite3 "$DB_PATH" "VACUUM INTO '${BACKUP_DIR}/pre_migration_${TIMESTAMP}.db'"
gzip "${BACKUP_DIR}/pre_migration_${TIMESTAMP}.db"

# Upload to S3
aws s3 cp "${BACKUP_DIR}/pre_migration_${TIMESTAMP}.db.gz" \
  s3://acquisitionos-backups/pre-migration/

# Verify backup
INTEGRITY=$(sqlite3 "${BACKUP_DIR}/pre_migration_${TIMESTAMP}.db" "PRAGMA integrity_check;" 2>/dev/null || echo "failed")
if [[ "$INTEGRITY" != "ok" ]]; then
  echo "FATAL: Pre-migration backup integrity check failed!"
  exit 1
fi

echo "Pre-migration backup created: pre_migration_${TIMESTAMP}.db.gz"
echo "BACKUP_FILE=pre_migration_${TIMESTAMP}.db.gz" >> "$GITHUB_ENV" || true
```

---

## 3. Rollback Commands

### Standard Rollback (Within 24 hours)

```bash
#!/bin/bash
# rollback-migration.sh
set -euo pipefail

BACKUP_FILE=${1:?Usage: rollback-migration.sh <backup_file>}
S3_BUCKET="s3://acquisitionos-backups"
DB_PATH="${DB_PATH:-/app/db/acquisitionos.db}"

echo "=== AcquisitionOS Migration Rollback ==="
echo "Restoring from: $BACKUP_FILE"

# Step 1: Stop application
echo "Stopping application..."
systemctl stop acquisitionos || true

# Step 2: Save current state
cp "$DB_PATH" "${DB_PATH}.failed-migration.$(date +%Y%m%d_%H%M%S)"

# Step 3: Download and restore backup
if [[ "$BACKUP_FILE" == s3://* ]]; then
  aws s3 cp "$BACKUP_FILE" /tmp/rollback.db.gz
else
  aws s3 cp "${S3_BUCKET}/pre-migration/${BACKUP_FILE}" /tmp/rollback.db.gz
fi

gunzip -c /tmp/rollback.db.gz > "$DB_PATH"

# Step 4: Verify integrity
INTEGRITY=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;")
if [[ "$INTEGRITY" != "ok" ]]; then
  echo "FATAL: Rollback database integrity check failed!"
  exit 1
fi

# Step 5: Regenerate Prisma client for old schema
git checkout HEAD~1 -- prisma/schema.prisma
npx prisma generate

# Step 6: Start application
systemctl start acquisitionos

# Step 7: Verify
sleep 10
curl -sf http://localhost:3000/api/health && echo "Health check passed!" || echo "WARNING: Health check failed"

echo "Migration rollback complete!"
```

### Quick Rollback (Schema revert only, no data loss)

For additive-only changes (new tables, new columns with defaults):

```bash
# Revert schema file
git revert HEAD -- prisma/schema.prisma

# Re-apply old schema
npx prisma db push

# Regenerate client
npx prisma generate

# Restart
systemctl restart acquisitionos
```

---

## 4. Emergency Rollback Procedures

### Critical: Data-Loss Migration

If a migration accidentally drops data:

1. **IMMEDIATELY stop the application** - do not let it write more data
2. **Do NOT apply the rollback** if it would overwrite the current state
3. **Assess data loss scope**:
   ```sql
   SELECT COUNT(*) FROM AffectedTable;
   ```
4. **Restore from pre-migration backup** (follow rollback-migration.sh)
5. **Extract lost data** from the failed-migration database:
   ```bash
   sqlite3 /app/db/acquisitionos.db.failed-migration.* "SELECT * FROM AffectedTable;" > lost_data.csv
   ```
6. **Manually merge lost data** back into restored database
7. **Conduct root cause analysis**

### Emergency: Schema Drift

If schema drift is detected between Prisma schema and actual database:

```bash
# Check for drift
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-url "file:./db/acquisitionos.db" \
  --script

# If drift found, baseline the database
npx prisma db push --accept-data-loss  # LAST RESORT ONLY
```

---

## 5. Migration Types & Risk Assessment

| Type | Risk | Rollback Difficulty | Example |
|------|------|-------------------|---------|
| Add table | Low | Easy (drop table) | New SystemMetrics model |
| Add column (nullable/default) | Low | Easy (drop column) | Add `billingCycle` to Subscription |
| Add column (required) | Medium | Medium | Add required field with default |
| Rename column | High | Hard | Requires data migration |
| Drop column | High | Hard | Data loss if not backed up |
| Change column type | High | Hard | Int to String, etc. |
| Add index | Low | Easy | `@@index([field])` |
| Add relation | Medium | Medium | New foreign key |
| Remove relation | High | Hard | Breaking foreign key |

---

## 6. Migration Best Practices

1. **Always use additive changes first** — add new columns/tables before removing old ones
2. **Deploy schema changes separately** from code changes that use them
3. **Use dual-write patterns** when changing column types or names
4. **Never use `prisma db push --accept-data-loss`** in production
5. **Test migrations on a copy** of production data before applying
6. **Keep schema changes small** — one logical change per migration
7. **Document every migration** with its purpose and rollback plan
8. **Monitor for 24 hours** after migration before considering it successful
