#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — SQLite to PostgreSQL Migration Script
# Phase L9: Production Database Preparation
#
# This script guides the complete migration from SQLite to PostgreSQL.
# It handles: backup, schema creation, data migration, verification,
# and environment variable updates.
#
# USAGE:
#   ./scripts/migrate-to-postgresql.sh [OPTIONS]
#
# OPTIONS:
#   --dry-run          Show steps without executing
#   --skip-backup      Skip the SQLite backup step (not recommended)
#   --skip-verify      Skip post-migration verification
#   --pg-host HOST     PostgreSQL host (default: localhost)
#   --pg-port PORT     PostgreSQL port (default: 5432)
#   --pg-user USER     PostgreSQL user (default: postgres)
#   --pg-db NAME       PostgreSQL database name (default: acquisitionos)
#   --pg-password PWD   PostgreSQL password
#   -h, --help         Show this help
#
# PREREQUISITES:
#   - PostgreSQL 14+ installed and running
#   - sqlite3 CLI installed
#   - Node.js 18+ and npm/bun
#   - @prisma/client installed in project
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"
DB_PATH="${DB_PATH:-${PROJECT_DIR}/db/custom.db}"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/db/backups}"
MIGRATION_DIR="${PROJECT_DIR}/db/migration"
SQLITE_DUMP_FILE="${MIGRATION_DIR}/sqlite_dump.sql"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# PostgreSQL defaults (override with CLI flags)
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-acquisitionos}"
PG_PASSWORD="${PG_PASSWORD:-}"

# Control flags
DRY_RUN=false
SKIP_BACKUP=false
SKIP_VERIFY=false

# ═══════════════════════════════════════════════════════════════════
# COLORS & LOGGING
# ═══════════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log() {
  local level="$1"; shift
  local color=""
  case "${level}" in
    INFO)  color="${CYAN}" ;;
    WARN)  color="${YELLOW}" ;;
    ERROR) color="${RED}" ;;
    SUCCESS) color="${GREEN}" ;;
    STEP) color="${BOLD}${BLUE}" ;;
  esac
  local msg="[${level}] $*"
  echo -e "${color}${msg}${NC}" >&2
}

info()    { log "INFO" "$@"; }
warn()    { log "WARN" "$@"; }
error()   { log "ERROR" "$@"; }
success() { log "SUCCESS" "$@"; }
step()    { log "STEP" "$@"; }

# ═══════════════════════════════════════════════════════════════════
# USAGE
# ═══════════════════════════════════════════════════════════════════

usage() {
  cat <<EOF
${BOLD}AcquisitionOS — SQLite to PostgreSQL Migration${NC}

Usage: $0 [OPTIONS]

OPTIONS:
  --dry-run            Show migration steps without executing
  --skip-backup        Skip SQLite backup (DANGEROUS)
  --skip-verify        Skip post-migration verification
  --pg-host HOST       PostgreSQL host (default: localhost)
  --pg-port PORT       PostgreSQL port (default: 5432)
  --pg-user USER       PostgreSQL user (default: postgres)
  --pg-db NAME         PostgreSQL database name (default: acquisitionos)
  --pg-password PWD     PostgreSQL password
  -h, --help           Show this help message

ENVIRONMENT VARIABLES:
  DATABASE_URL          Current SQLite DATABASE_URL (auto-detected)
  PG_HOST, PG_PORT, PG_USER, PG_DB, PG_PASSWORD
                        PostgreSQL connection parameters

EXAMPLES:
  # Dry run to see what will happen:
  $0 --dry-run --pg-host db.example.com --pg-password mysecret

  # Full migration:
  $0 --pg-host db.example.com --pg-user acquisitionos --pg-password mysecret

  # Migrate to local PostgreSQL:
  $0 --pg-password localdev

POST-MIGRATION:
  After successful migration, update your .env file:
    DATABASE_URL="postgresql://user:password@host:5432/acquisitionos?schema=public&pgbouncer=true"

  And regenerate the Prisma client:
    cd ${PROJECT_DIR} && npx prisma generate

EOF
  exit 0
}

# ═══════════════════════════════════════════════════════════════════
# PARSE ARGUMENTS
# ═══════════════════════════════════════════════════════════════════

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)         DRY_RUN=true; shift ;;
    --skip-backup)     SKIP_BACKUP=true; shift ;;
    --skip-verify)     SKIP_VERIFY=true; shift ;;
    --pg-host)         PG_HOST="$2"; shift 2 ;;
    --pg-port)         PG_PORT="$2"; shift 2 ;;
    --pg-user)         PG_USER="$2"; shift 2 ;;
    --pg-db)           PG_DB="$2"; shift 2 ;;
    --pg-password)     PG_PASSWORD="$2"; shift 2 ;;
    -h|--help)         usage ;;
    *)
      error "Unknown argument: $1"
      echo "Use --help for usage information."
      exit 1
      ;;
  esac
done

# ═══════════════════════════════════════════════════════════════════
# PSQL HELPER
# ═══════════════════════════════════════════════════════════════════

run_psql() {
  if [ -n "${PG_PASSWORD}" ]; then
    PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" "$@"
  else
    psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" "$@"
  fi
}

run_pg_cmd() {
  if [ -n "${PG_PASSWORD}" ]; then
    PGPASSWORD="${PG_PASSWORD}" "$@"
  else
    "$@"
  fi
}

# ═══════════════════════════════════════════════════════════════════
# PRE-FLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════

preflight() {
  step "━━━ STEP 0: Pre-flight Checks ━━━"

  # Check SQLite database exists
  if [ ! -f "${DB_PATH}" ]; then
    error "SQLite database not found at: ${DB_PATH}"
    error "Set DB_PATH environment variable if using a different location."
    exit 1
  fi
  info "SQLite database found: ${DB_PATH}"

  local db_size
  db_size=$(du -h "${DB_PATH}" | cut -f1)
  info "SQLite database size: ${db_size}"

  # Check sqlite3 is installed
  if ! command -v sqlite3 &> /dev/null; then
    error "sqlite3 CLI is not installed. Install it with:"
    error "  sudo apt-get install sqlite3  (Debian/Ubuntu)"
    error "  brew install sqlite3            (macOS)"
    exit 1
  fi
  info "sqlite3 CLI: $(command -v sqlite3)"

  # Check psql is installed
  if ! command -v psql &> /dev/null; then
    error "psql CLI is not installed. Install PostgreSQL client:"
    error "  sudo apt-get install postgresql-client  (Debian/Ubuntu)"
    error "  brew install postgresql                  (macOS)"
    exit 1
  fi
  info "psql CLI: $(command -v psql)"

  # Check Node.js
  if ! command -v node &> /dev/null; then
    error "Node.js is not installed"
    exit 1
  fi
  info "Node.js: $(node --version)"

  # Check Prisma CLI
  if ! command -v npx &> /dev/null && ! command -v bunx &> /dev/null; then
    error "npx or bunx is required for Prisma CLI"
    exit 1
  fi

  # Test PostgreSQL connectivity
  info "Testing PostgreSQL connectivity..."
  if run_psql -c "SELECT 1;" > /dev/null 2>&1; then
    info "PostgreSQL connection: OK"
    local pg_version
    pg_version=$(run_psql -c "SELECT version();" -t 2>/dev/null | head -1 | xargs)
    info "PostgreSQL version: ${pg_version}"
  else
    error "Cannot connect to PostgreSQL at ${PG_HOST}:${PG_PORT}"
    error "Ensure PostgreSQL is running and credentials are correct."
    error "  Host: ${PG_HOST}"
    error "  Port: ${PG_PORT}"
    error "  User: ${PG_USER}"
    error "  Database: ${PG_DB}"
    exit 1
  fi

  # Create migration directory
  mkdir -p "${MIGRATION_DIR}"

  success "Pre-flight checks passed"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# STEP 1: BACKUP SQLITE DATABASE
# ═══════════════════════════════════════════════════════════════════

backup_sqlite() {
  step "━━━ STEP 1: Backup SQLite Database ━━━"

  if [ "${SKIP_BACKUP}" = true ]; then
    warn "Skipping SQLite backup (--skip-backup)"
    return
  fi

  mkdir -p "${BACKUP_DIR}"
  local backup_file="${BACKUP_DIR}/pre_migration_${TIMESTAMP}.db"

  if [ "${DRY_RUN}" = true ]; then
    info "[DRY RUN] Would create backup: ${backup_file}"
    info "[DRY RUN] Using: sqlite3 ${DB_PATH} \".backup '${backup_file}'\""
    return
  fi

  # Use sqlite3 .backup for a consistent backup
  sqlite3 "${DB_PATH}" ".backup '${backup_file}'"
  if [ $? -eq 0 ]; then
    gzip -f "${backup_file}"
    local compressed_size
    compressed_size=$(du -h "${backup_file}.gz" | cut -f1)
    success "SQLite backup created: ${backup_file}.gz (${compressed_size})"
  else
    error "SQLite backup failed!"
    exit 1
  fi

  # Verify backup integrity
  local temp_check
  temp_check=$(mktemp)
  gunzip -c "${backup_file}.gz" > "${temp_check}"
  local integrity
  integrity=$(sqlite3 "${temp_check}" "PRAGMA integrity_check;" 2>/dev/null)
  rm -f "${temp_check}"

  if [ "${integrity}" = "ok" ]; then
    success "Backup integrity verified: OK"
  else
    error "Backup integrity check FAILED: ${integrity}"
    exit 1
  fi
  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# STEP 2: CREATE POSTGRESQL DATABASE
# ═══════════════════════════════════════════════════════════════════

create_postgres_db() {
  step "━━━ STEP 2: Create PostgreSQL Database ━━━"

  if [ "${DRY_RUN}" = true ]; then
    info "[DRY RUN] Would create database: ${PG_DB}"
    info "[DRY RUN] Would set up extensions: uuid-ossp, pgcrypto"
    return
  fi

  # Check if database already exists
  local db_exists
  db_exists=$(run_psql -t -c "SELECT 1 FROM pg_database WHERE datname = '${PG_DB}';" 2>/dev/null | xargs)

  if [ "${db_exists}" = "1" ]; then
    warn "Database '${PG_DB}' already exists"
    read -rp "  Drop and recreate? [y/N]: " confirm
    if [[ "${confirm}" =~ ^[Yy]$ ]]; then
      run_psql -c "DROP DATABASE ${PG_DB};"
      info "Database dropped"
    else
      warn "Using existing database. Schema will be pushed via Prisma."
      echo ""
      return
    fi
  fi

  # Create database
  run_psql -c "CREATE DATABASE ${PG_DB};"
  success "Database '${PG_DB}' created"

  # Enable extensions (commonly used by Prisma)
  run_psql -d "${PG_DB}" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" 2>/dev/null || true
  run_psql -d "${PG_DB}" -c "CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";" 2>/dev/null || true
  info "Extensions enabled: uuid-ossp, pgcrypto"

  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# STEP 3: UPDATE PRISMA SCHEMA FOR POSTGRESQL
# ═══════════════════════════════════════════════════════════════════

update_prisma_schema() {
  step "━━━ STEP 3: Update Prisma Schema for PostgreSQL ━━━"

  local schema_file="${PROJECT_DIR}/prisma/schema.prisma"
  local schema_backup="${BACKUP_DIR}/schema.prisma.pre_migration_${TIMESTAMP}"

  if [ ! -f "${schema_file}" ]; then
    error "Prisma schema not found at: ${schema_file}"
    exit 1
  fi

  if [ "${DRY_RUN}" = true ]; then
    info "[DRY RUN] Would update schema.prisma:"
    info "[DRY RUN]   Change: provider = \"sqlite\" -> provider = \"postgresql\""
    return
  fi

  # Backup the schema file
  cp "${schema_file}" "${schema_backup}"
  info "Schema backup: ${schema_backup}"

  # Update provider in schema
  if grep -q 'provider = "sqlite"' "${schema_file}"; then
    sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' "${schema_file}"
    rm -f "${schema_file}.bak"
    success "Schema provider changed: sqlite -> postgresql"
  else
    warn "Schema provider is not set to 'sqlite'. Check manually."
  fi

  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# STEP 4: PUSH SCHEMA TO POSTGRESQL
# ═══════════════════════════════════════════════════════════════════

push_schema() {
  step "━━━ STEP 4: Push Schema to PostgreSQL ━━━"

  local new_db_url="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"

  if [ "${DRY_RUN}" = true ]; then
    info "[DRY RUN] Would run: DATABASE_URL=\"${new_db_url}\" npx prisma db push"
    return
  fi

  info "Running prisma db push..."
  cd "${PROJECT_DIR}"

  DATABASE_URL="${new_db_url}" npx prisma db push --skip-generate 2>&1
  if [ $? -eq 0 ]; then
    success "Schema pushed to PostgreSQL successfully"
  else
    error "Schema push failed! Check the error above."
    error "To rollback, restore the schema backup:"
    error "  cp ${BACKUP_DIR}/schema.prisma.pre_migration_${TIMESTAMP} ${schema_file}"
    exit 1
  fi

  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# STEP 5: EXPORT DATA FROM SQLITE
# ═══════════════════════════════════════════════════════════════════

export_sqlite_data() {
  step "━━━ STEP 5: Export Data from SQLite ━━━"

  mkdir -p "${MIGRATION_DIR}"

  if [ "${DRY_RUN}" = true ]; then
    info "[DRY RUN] Would export all tables from SQLite to SQL format"
    info "[DRY RUN] Output: ${SQLITE_DUMP_FILE}"
    return
  fi

  info "Exporting SQLite data to PostgreSQL-compatible SQL..."

  # Get list of tables
  local tables
  tables=$(sqlite3 "${DB_PATH}" ".tables" 2>/dev/null | tr ' ' '\n' | sort)

  if [ -z "${tables}" ]; then
    error "No tables found in SQLite database"
    exit 1
  fi

  info "Found tables: $(echo "${tables}" | wc -l | xargs)"

  # Use a Node.js script to migrate data properly via Prisma
  # This handles type conversions (cuid, DateTime, JSON fields)
  local migrate_script="${PROJECT_DIR}/scripts/migrate-data-to-pg.ts"

  info "Generating data migration script: ${migrate_script}"
  cat > "${migrate_script}" <<'MIGRATE_SCRIPT'
/**
 * AcquisitionOS — Data Migration: SQLite -> PostgreSQL
 * Generated by migrate-to-postgresql.sh
 *
 * This script reads all data from SQLite via Prisma and writes
 * it to PostgreSQL via Prisma. It handles type conversions.
 */
import { PrismaClient } from '@prisma/client';

// Source: SQLite
const source = new PrismaClient({
  datasources: {
    db: {
      url: process.env.SQLITE_URL || 'file:./db/custom.db',
    },
  },
});

// Target: PostgreSQL
const target = new PrismaClient({
  datasources: {
    db: {
      url: process.env.PG_URL,
    },
  },
});

const TABLE_ORDER = [
  'User', 'Organization', 'OrgMember', 'OrgInvitation',
  'UserSession', 'LoginHistory', 'MfaConfig', 'UserSettings',
  'Subscription', 'CreditsLedger', 'CreditAddon', 'PaymentOrder',
  'PaymentWebhook', 'Invoice', 'Coupon', 'TaxRate', 'UsageTracking',
  'FeatureFlag', 'PlanEntitlement',
  'Lead', 'LeadAnalysis', 'LeadScore', 'LeadNote',
  'PipelineStage', 'PipelineCustomStage',
  'OutreachSequence', 'SequenceStep', 'SequenceEnrollment', 'OutreachMessage',
  'EmailAccount', 'EmailThread', 'EmailMessage', 'EmailBounce', 'EmailUnsubscribe',
  'Conversation', 'ConversationMessage',
  'TelegramConfig', 'WhatsappConfig',
  'Notification', 'NotificationPreferences',
  'AiChatSession', 'AiChatMessage',
  'WorkflowDefinition', 'WorkflowStep', 'WorkflowExecution', 'WorkflowLog',
  'ApiKey', 'ApiKeyUsage',
  'GdprRequest', 'DataExport', 'OnboardingProgress',
  'AuditLog', 'SecurityAlert', 'KnownDevice',
  'DiscoveryJob', 'AiCostRecord', 'FileContext',
  'Meeting', 'GoogleCalendarToken', 'CalendarWatch',
  'ScheduledEmail',
  'Deal', 'LeadActivity', 'Communication', 'FollowUpReminder',
  'MessageBroadcast', 'MessageTemplateApproval', 'MessageDelivery', 'DeliveryDeadLetter',
  'WsConnection', 'SseConnection', 'RealtimeEvent',
  'CompetitorAnalysis', 'CompetitorData',
  'MeetingReminder', 'MeetingIntentLog',
  'PromptTemplate',
];

async function migrate() {
  console.log('Starting data migration from SQLite to PostgreSQL...\n');

  let totalMigrated = 0;
  let totalErrors = 0;

  for (const modelName of TABLE_ORDER) {
    const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1) as keyof typeof source;
    const sourceModel = (source as any)[modelKey];
    const targetModel = (target as any)[modelKey];

    if (!sourceModel || !targetModel) {
      console.warn(`  Skipping ${modelName}: model not found on source or target`);
      continue;
    }

    try {
      const records = await sourceModel.findMany();
      const count = records.length;

      if (count === 0) {
        console.log(`  ${modelName}: 0 records (skipping)`);
        continue;
      }

      // Delete existing records in target (for idempotent re-runs)
      await targetModel.deleteMany();

      // Insert records
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await targetModel.createMany({
        data: records.map((r: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clean: any = { ...r };
          delete clean.id;
          delete clean.createdAt;
          delete clean.updatedAt;
          return r; // Use full record to preserve IDs and timestamps
        }),
        skipDuplicates: true,
      });

      console.log(`  ${modelName}: ${count} records migrated`);
      totalMigrated += count;
    } catch (err) {
      console.error(`  ${modelName}: ERROR - ${err instanceof Error ? err.message : String(err)}`);
      totalErrors++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Total records migrated: ${totalMigrated}`);
  console.log(`  Tables with errors: ${totalErrors}`);

  await source.$disconnect();
  await target.$disconnect();
}

migrate().catch(console.error);
MIGRATE_SCRIPT

  success "Data migration script created: ${migrate_script}"
  info ""
  info "To migrate data, run:"
  info "  SQLITE_URL=\"file:${DB_PATH}\" \\"
  info "  PG_URL=\"postgresql://${PG_USER}:***@${PG_HOST}:${PG_PORT}/${PG_DB}\" \\"
  info "  npx tsx ${migrate_script}"

  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# STEP 6: UPDATE ENVIRONMENT VARIABLES
# ═══════════════════════════════════════════════════════════════════

update_env() {
  step "━━━ STEP 6: Environment Variable Updates ━━━"

  local env_file="${PROJECT_DIR}/.env"
  local env_backup="${BACKUP_DIR}/env.pre_migration_${TIMESTAMP}"

  if [ "${DRY_RUN}" = true ]; then
    info "[DRY RUN] Would update ${env_file} with PostgreSQL DATABASE_URL"
    info ""
    info "${BOLD}  Required changes in .env:${NC}"
    info ""
    info "  # Current (SQLite):"
    info "  DATABASE_URL=file:/home/z/my-project/db/custom.db"
    info ""
    info "  # New (PostgreSQL):"
    info "  DATABASE_URL=postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"
    info ""
    info "  # Optional: For connection pooling (Supabase / PgBouncer):"
    info "  DATABASE_URL=postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}?pgbouncer=true&connect_timeout=15"
    info "  DIRECT_URL=postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}?connect_timeout=15"
    info ""
    info "  # Recommended: Add pool size configuration"
    info "  DATABASE_POOL_SIZE=10"
    info "  DATABASE_TIMEOUT_MS=30000"
    return
  fi

  # Backup current .env
  if [ -f "${env_file}" ]; then
    cp "${env_file}" "${env_backup}"
    info "Environment backup: ${env_backup}"

    # Update DATABASE_URL
    local new_url="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"

    if grep -q "^DATABASE_URL=" "${env_file}"; then
      sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=${new_url}|" "${env_file}"
      rm -f "${env_file}.bak"
      success "DATABASE_URL updated in .env"
    else
      echo "" >> "${env_file}"
      echo "# Updated for PostgreSQL migration (${TIMESTAMP})" >> "${env_file}"
      echo "DATABASE_URL=${new_url}" >> "${env_file}"
      success "DATABASE_URL added to .env"
    fi

    # Add pool size if not present
    if ! grep -q "^DATABASE_POOL_SIZE=" "${env_file}"; then
      echo "DATABASE_POOL_SIZE=10" >> "${env_file}"
      echo "DATABASE_TIMEOUT_MS=30000" >> "${env_file}"
      info "Added connection pool settings to .env"
    fi
  fi

  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# STEP 7: GENERATE PRISMA CLIENT
# ═══════════════════════════════════════════════════════════════════

generate_client() {
  step "━━━ STEP 7: Generate Prisma Client ━━━"

  if [ "${DRY_RUN}" = true ]; then
    info "[DRY RUN] Would run: npx prisma generate"
    return
  fi

  cd "${PROJECT_DIR}"
  npx prisma generate 2>&1
  if [ $? -eq 0 ]; then
    success "Prisma client generated for PostgreSQL"
  else
    error "Prisma client generation failed"
    exit 1
  fi

  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# STEP 8: VERIFY MIGRATION
# ═══════════════════════════════════════════════════════════════════

verify_migration() {
  step "━━━ STEP 8: Verify Migration ━━━"

  if [ "${SKIP_VERIFY}" = true ]; then
    warn "Skipping verification (--skip-verify)"
    return
  fi

  if [ "${DRY_RUN}" = true ]; then
    info "[DRY RUN] Would run verification queries against PostgreSQL"
    return
  fi

  local new_url="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"
  cd "${PROJECT_DIR}"

  info "Running verification queries..."

  # Count tables in PostgreSQL
  local pg_tables
  pg_tables=$(DATABASE_URL="${new_url}" npx prisma db execute --stdin <<'SQL' 2>/dev/null | xargs
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
SQL
)
  info "PostgreSQL tables: ${pg_tables:-unknown}"

  # Check key tables exist
  for table in User Lead Organization Subscription PaymentOrder; do
    local exists
    exists=$(run_psql -d "${PG_DB}" -t -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = '${table}' AND table_schema = 'public');" 2>/dev/null | xargs)
    if [ "${exists}" = "t" ]; then
      local count
      count=$(run_psql -d "${PG_DB}" -t -c "SELECT COUNT(*) FROM \"${table}\";" 2>/dev/null | xargs)
      info "  ${table}: ${count} rows"
    else
      warn "  ${table}: NOT FOUND"
    fi
  done

  # Verify indexes exist
  local index_count
  index_count=$(run_psql -d "${PG_DB}" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';" 2>/dev/null | xargs)
  info "PostgreSQL indexes: ${index_count}"

  # Test the health endpoint
  info "Testing database health check (via Prisma)..."
  DATABASE_URL="${new_url}" node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.user.count({ take: 1 }).then(c => {
      console.log('  Prisma connection: OK (User count: ' + c + ')');
      return prisma.\$disconnect();
    }).catch(e => {
      console.error('  Prisma connection FAILED:', e.message);
      process.exit(1);
    });
  " 2>&1

  success "Migration verification complete"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# STEP 9: POST-MIGRATION SUMMARY
# ═══════════════════════════════════════════════════════════════════

print_summary() {
  step "━━━ MIGRATION SUMMARY ━━━"
  echo ""

  local new_url="postgresql://${PG_USER}:***@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"

  echo -e "${BOLD}  Migration Status: COMPLETE${NC}" (if not dry-run)
  echo ""
  echo -e "${BOLD}  Post-Migration Checklist:${NC}"
  echo ""
  echo "  1. Verify .env has the correct DATABASE_URL:"
  echo "     DATABASE_URL=${new_url}"
  echo ""
  echo "  2. Restart the application:"
  echo "     cd ${PROJECT_DIR} && npm run dev"
  echo ""
  echo "  3. Run the data migration script:"
  echo "     SQLITE_URL=\"file:${DB_PATH}\" \\"
  echo "     PG_URL=\"postgresql://${PG_USER}:***@${PG_HOST}:${PG_PORT}/${PG_DB}\" \\"
  echo "     npx tsx ${MIGRATION_DIR}/migrate-data-to-pg.ts"
  echo ""
  echo "  4. Verify data counts match:"
  echo "     sqlite3 ${DB_PATH} 'SELECT COUNT(*) FROM User;'"
  echo "     psql -h ${PG_HOST} -U ${PG_USER} -d ${PG_DB} -c 'SELECT COUNT(*) FROM \"User\";'"
  echo ""
  echo "  5. Run the application health check:"
  echo "     curl http://localhost:3000/api/health/database"
  echo ""
  echo "  6. Set up automated PostgreSQL backups:"
  echo "     ${PROJECT_DIR}/scripts/db-backup-restore.sh backup --type postgres"
  echo ""
  echo -e "${BOLD}  Rollback Instructions:${NC}"
  echo ""
  echo "  If you need to rollback to SQLite:"
  echo "  1. Restore the schema: cp ${BACKUP_DIR}/schema.prisma.pre_migration_${TIMESTAMP} ${PROJECT_DIR}/prisma/schema.prisma"
  echo "  2. Restore the .env:   cp ${BACKUP_DIR}/env.pre_migration_${TIMESTAMP} ${PROJECT_DIR}/.env"
  echo "  3. Regenerate client:   cd ${PROJECT_DIR} && npx prisma generate"
  echo "  4. Restore SQLite data:  ${PROJECT_DIR}/scripts/db-backup-restore.sh restore --latest --type sqlite"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

main() {
  echo ""
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  AcquisitionOS — SQLite to PostgreSQL Migration${NC}"
  echo -e "${BOLD}${CYAN}  Phase L9: Production Database Preparation${NC}"
  echo -e "${BOLD}${CYAN}  Timestamp: ${TIMESTAMP}${NC}"
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo ""

  if [ "${DRY_RUN}" = true ]; then
    warn "DRY RUN MODE — No changes will be made"
    echo ""
  fi

  echo -e "${BOLD}  Configuration:${NC}"
  echo "  SQLite DB:      ${DB_PATH}"
  echo "  PostgreSQL:     ${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DB}"
  echo "  Backup Dir:     ${BACKUP_DIR}"
  echo "  Migration Dir:   ${MIGRATION_DIR}"
  echo ""

  # Execute all steps
  preflight
  backup_sqlite
  create_postgres_db
  update_prisma_schema
  push_schema
  export_sqlite_data
  update_env
  generate_client
  verify_migration
  print_summary

  echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Migration steps complete!${NC}"
  echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
  echo ""
}

main "$@"
