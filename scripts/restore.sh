#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Database Restore Script
# Phase 10: DevOps Infrastructure
#
# Restores the database from a backup file.
# SUPPORTS: SQLite (.db) and PostgreSQL (.sql.gz) backups.
#
# Usage:
#   ./restore.sh <backup_file>
#   ./restore.sh ./backups/acquisitionos_20250101_120000.db
#   DB_TYPE=postgres ./restore.sh ./backups/acquisitionos_20250101_120000.sql.gz
# ═══════════════════════════════════════════════════════════════════

set -e

# ─── Validate Arguments ────────────────────────────────────────
if [ -z "$1" ]; then
    echo "Usage: ./restore.sh <backup_file>"
    echo ""
    echo "Examples:"
    echo "  ./restore.sh ./backups/acquisitionos_20250101_120000.db"
    echo "  DB_TYPE=postgres ./restore.sh ./backups/acquisitionos_20250101_120000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "✗ ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Auto-detect DB type from file extension
if [[ "$BACKUP_FILE" == *.sql.gz ]]; then
    DB_TYPE="${DB_TYPE:-postgres}"
elif [[ "$BACKUP_FILE" == *.db ]]; then
    DB_TYPE="${DB_TYPE:-sqlite}"
else
    DB_TYPE="${DB_TYPE:-sqlite}"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AcquisitionOS — Database Restore"
echo " Type: ${DB_TYPE}"
echo " Backup: ${BACKUP_FILE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Confirmation ──────────────────────────────────────────────
echo ""
echo "⚠ WARNING: This will REPLACE the current database with the backup."
echo "  Make sure the application is stopped before restoring."
echo ""
read -p "  Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# ─── Perform Restore ───────────────────────────────────────────
if [ "$DB_TYPE" = "postgres" ]; then
    # PostgreSQL restore
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_USER="${DB_USER:-acquisitionos}"
    DB_NAME="${DB_NAME:-acquisitionos}"

    echo ""
    echo "▶ Restoring PostgreSQL database..."
    echo "  Host: ${DB_HOST}:${DB_PORT}"
    echo "  Database: ${DB_NAME}"

    if command -v psql &> /dev/null; then
        gunzip -c "$BACKUP_FILE" | PGPASSWORD="${DB_PASSWORD}" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -q

        echo "✓ PostgreSQL restore complete"
    else
        echo "✗ ERROR: psql not found. Install postgresql-client."
        exit 1
    fi
else
    # SQLite restore
    SQLITE_DB_PATH="${SQLITE_DB_PATH:-./prisma/dev.db}"

    echo ""
    echo "▶ Restoring SQLite database..."
    echo "  Target: ${SQLITE_DB_PATH}"

    # Check if current DB exists and create a safety backup
    if [ -f "$SQLITE_DB_PATH" ]; then
        SAFETY_BACKUP="${SQLITE_DB_PATH}.pre-restore-$(date +%Y%m%d_%H%M%S)"
        cp "$SQLITE_DB_PATH" "$SAFETY_BACKUP"
        echo "  Safety backup created: $SAFETY_BACKUP"
    fi

    # Also check the custom.db path
    if [ -f "./db/custom.db" ]; then
        SAFETY_BACKUP2="./db/custom.db.pre-restore-$(date +%Y%m%d_%H%M%S)"
        cp "./db/custom.db" "$SAFETY_BACKUP2"
        echo "  Safety backup created: $SAFETY_BACKUP2"
        cp "$BACKUP_FILE" "./db/custom.db"
        echo "✓ SQLite restore complete (./db/custom.db)"
    fi

    # Restore to standard path
    cp "$BACKUP_FILE" "$SQLITE_DB_PATH"
    echo "✓ SQLite restore complete ($SQLITE_DB_PATH)"
fi

# ─── Post-Restore Steps ────────────────────────────────────────
echo ""
echo "▶ Post-restore steps:"
echo "  1. Verify the data integrity"
echo "  2. Restart the application"
echo "  3. Test critical endpoints: /api/health"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ Restore complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
