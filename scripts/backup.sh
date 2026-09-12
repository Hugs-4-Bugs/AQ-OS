#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Database Backup Script
# Phase 10: DevOps Infrastructure
#
# Backs up the SQLite database (default) or PostgreSQL.
# Designed for cron-based automated backups.
#
# Usage:
#   ./backup.sh              # Backup SQLite (default)
#   DB_TYPE=postgres ./backup.sh  # Backup PostgreSQL
# ═══════════════════════════════════════════════════════════════════

set -e

# ─── Configuration ─────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_TYPE="${DB_TYPE:-sqlite}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AcquisitionOS — Database Backup"
echo " Type: ${DB_TYPE}"
echo " Timestamp: ${TIMESTAMP}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Create Backup Directory ───────────────────────────────────
mkdir -p "$BACKUP_DIR"

# ─── Perform Backup ────────────────────────────────────────────
if [ "$DB_TYPE" = "postgres" ]; then
    # PostgreSQL backup
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_USER="${DB_USER:-acquisitionos}"
    DB_NAME="${DB_NAME:-acquisitionos}"
    BACKUP_FILE="$BACKUP_DIR/acquisitionos_${TIMESTAMP}.sql.gz"

    echo ""
    echo "▶ Backing up PostgreSQL database..."
    echo "  Host: ${DB_HOST}:${DB_PORT}"
    echo "  Database: ${DB_NAME}"
    echo "  User: ${DB_USER}"

    if command -v pg_dump &> /dev/null; then
        PGPASSWORD="${DB_PASSWORD}" pg_dump \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            --no-owner \
            --no-privileges \
            --clean \
            --if-exists \
            | gzip > "$BACKUP_FILE"

        FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo "✓ PostgreSQL backup saved: $BACKUP_FILE ($FILESIZE)"
    else
        echo "✗ ERROR: pg_dump not found. Install postgresql-client."
        exit 1
    fi
else
    # SQLite backup
    SQLITE_DB_PATH="${SQLITE_DB_PATH:-./prisma/dev.db}"
    BACKUP_FILE="$BACKUP_DIR/acquisitionos_${TIMESTAMP}.db"

    echo ""
    echo "▶ Backing up SQLite database..."
    echo "  Source: ${SQLITE_DB_PATH}"

    if [ -f "$SQLITE_DB_PATH" ]; then
        # Use sqlite3 backup API for consistency (if available)
        if command -v sqlite3 &> /dev/null; then
            sqlite3 "$SQLITE_DB_PATH" ".backup '$BACKUP_FILE'"
            echo "✓ SQLite backup (consistent) saved: $BACKUP_FILE"
        else
            # Fallback to file copy (may have slight inconsistency)
            cp "$SQLITE_DB_PATH" "$BACKUP_FILE"
            echo "⚠ WARNING: sqlite3 not found, used file copy (may be inconsistent)"
            echo "✓ SQLite backup (copy) saved: $BACKUP_FILE"
        fi

        FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo "  Size: $FILESIZE"
    else
        echo "⚠ WARNING: No SQLite database found at $SQLITE_DB_PATH"
        echo "  Checking alternative path ./db/custom.db..."

        if [ -f "./db/custom.db" ]; then
            cp "./db/custom.db" "$BACKUP_FILE"
            FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
            echo "✓ SQLite backup saved from ./db/custom.db: $BACKUP_FILE ($FILESIZE)"
        else
            echo "✗ ERROR: No SQLite database found"
            exit 1
        fi
    fi
fi

# ─── Cleanup Old Backups ───────────────────────────────────────
echo ""
echo "▶ Cleaning up backups older than ${RETENTION_DAYS} days..."

DELETED_COUNT=0
if [ "$DB_TYPE" = "postgres" ]; then
    DELETED_COUNT=$(find "$BACKUP_DIR" -name "acquisitionos_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
else
    DELETED_COUNT=$(find "$BACKUP_DIR" -name "acquisitionos_*.db" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
fi

if [ "$DELETED_COUNT" -gt 0 ]; then
    echo "✓ Deleted $DELETED_COUNT old backup(s)"
else
    echo "✓ No old backups to clean up"
fi

# ─── Summary ──────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ Backup complete"
echo "  File: $BACKUP_FILE"
echo "  Retention: ${RETENTION_DAYS} days"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
