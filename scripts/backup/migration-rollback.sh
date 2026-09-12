#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Migration Rollback Script
# Phase 14.5: Backups & Recovery
# Pre-migration backup, run Prisma migration, auto-rollback on failure
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/opt/acquisitionos}"
DB_PATH="${DB_PATH:-/opt/acquisitionos/data/acquisitionos.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/acquisitionos/backups}"
LOG_FILE="${LOG_FILE:-/var/log/acquisitionos/migration.log}"

# ── Logging ─────────────────────────────────────────────────────────
log() {
  local level="$1"; shift
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
  echo "${msg}"
  mkdir -p "$(dirname "${LOG_FILE}")"
  echo "${msg}" >> "${LOG_FILE}" 2>/dev/null || true
}

info()    { log "INFO" "$@"; }
warn()    { log "WARN" "$@"; }
error()   { log "ERROR" "$@"; }
success() { log "SUCCESS" "$@"; }

# ── Pre-migration Backup ────────────────────────────────────────────
pre_migration_backup() {
  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_file="${BACKUP_DIR}/migration_pre_${timestamp}.db"

  info "Creating pre-migration backup..."

  mkdir -p "${BACKUP_DIR}"

  if [ -f "${DB_PATH}" ]; then
    if command -v sqlite3 &> /dev/null; then
      sqlite3 "${DB_PATH}" ".backup '${backup_file}'"
    else
      cp "${DB_PATH}" "${backup_file}"
    fi
    gzip -f "${backup_file}"
    success "Pre-migration backup created: ${backup_file}.gz"
    echo "${backup_file}.gz"
  else
    warn "No database file found, skipping pre-migration backup"
    echo ""
  fi
}

# ── Run Migration ───────────────────────────────────────────────────
run_migration() {
  local migration_name="${1:-}"

  info "Running Prisma migration..."

  cd "${APP_DIR}"

  if [ -n "${migration_name}" ]; then
    if ! npx prisma migrate dev --name "${migration_name}" --create-only 2>&1; then
      error "Migration creation failed"
      return 1
    fi

    if ! npx prisma migrate deploy 2>&1; then
      error "Migration deployment failed"
      return 1
    fi
  else
    if ! npx prisma migrate deploy 2>&1; then
      error "Migration deployment failed"
      return 1
    fi
  fi

  success "Migration completed successfully"
}

# ── Rollback ────────────────────────────────────────────────────────
rollback() {
  local backup_file="$1"

  if [ -z "${backup_file}" ]; then
    error "No pre-migration backup available for rollback"
    return 1
  fi

  info "Rolling back to pre-migration state..."

  if [ ! -f "${backup_file}" ]; then
    error "Backup file not found: ${backup_file}"
    return 1
  fi

  # Restore the database
  gunzip -c "${backup_file}" > "${DB_PATH}"

  success "Rollback complete — database restored to pre-migration state"
}

# ── Verify Database ─────────────────────────────────────────────────
verify_database() {
  info "Verifying database integrity..."

  if [ ! -f "${DB_PATH}" ]; then
    error "Database file not found after migration"
    return 1
  fi

  if command -v sqlite3 &> /dev/null; then
    local result
    result=$(sqlite3 "${DB_PATH}" "PRAGMA integrity_check;" 2>/dev/null)
    if [ "${result}" = "ok" ]; then
      success "Database integrity verified"
      return 0
    else
      error "Database integrity check failed: ${result}"
      return 1
    fi
  else
    warn "sqlite3 not available, skipping integrity check"
    return 0
  fi
}

# ── Main ────────────────────────────────────────────────────────────
main() {
  local migration_name="${1:-}"

  info "═══════════════════════════════════════════════════════════"
  info "  AcquisitionOS Migration — $(date '+%Y-%m-%d %H:%M:%S')"
  info "═══════════════════════════════════════════════════════════"

  # Step 1: Pre-migration backup
  PRE_BACKUP=$(pre_migration_backup)

  # Step 2: Run migration
  if run_migration "${migration_name}"; then
    # Step 3: Verify database
    if verify_database; then
      success "═══════════════════════════════════════════════════════════"
      success "  Migration completed successfully!"
      success "═══════════════════════════════════════════════════════════"
    else
      error "Database verification failed — initiating rollback..."
      rollback "${PRE_BACKUP}"
      exit 1
    fi
  else
    error "Migration failed — initiating automatic rollback..."
    rollback "${PRE_BACKUP}"
    exit 1
  fi
}

main "$@"
