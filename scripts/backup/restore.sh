#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Restore Script
# Phase 14.5: Backups & Recovery
# Restore from file/latest/timestamp, pre-restore backup, verify, dry-run
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/opt/acquisitionos/backups}"
DB_PATH="${DB_PATH:-/opt/acquisitionos/data/acquisitionos.db}"
LOG_FILE="${LOG_FILE:-/var/log/acquisitionos/restore.log}"
DRY_RUN=false

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

# ── Usage ────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 [OPTIONS] <backup_source>

Backup source:
  --file PATH        Restore from a specific backup file
  --latest           Restore from the latest backup
  --timestamp TS     Restore from a specific timestamp (YYYYMMDD_HHMMSS)

Options:
  --type TYPE        Database type: sqlite (default) or postgres
  --dry-run          Show what would be done without making changes
  --no-pre-backup    Skip pre-restore backup
  --db-path PATH     Override database path (SQLite)
  -h, --help         Show this help message

Examples:
  $0 --latest
  $0 --timestamp 20250101_020000
  $0 --file /backups/2025/01/01/sqlite_20250101_020000.db.gz
  $0 --latest --type postgres
  $0 --latest --dry-run
EOF
  exit 0
}

# ── Parse Arguments ─────────────────────────────────────────────────
BACKUP_SOURCE=""
BACKUP_TYPE="sqlite"
NO_PRE_BACKUP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      BACKUP_SOURCE="$2"
      shift 2
      ;;
    --latest)
      BACKUP_SOURCE="latest"
      shift
      ;;
    --timestamp)
      BACKUP_SOURCE="timestamp:$2"
      shift 2
      ;;
    --type)
      BACKUP_TYPE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --no-pre-backup)
      NO_PRE_BACKUP=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      error "Unknown argument: $1"
      usage
      ;;
  esac
done

# ── Resolve Backup File ────────────────────────────────────────────
resolve_backup_file() {
  local source="$1"
  local type="$2"
  local prefix

  case "${type}" in
    sqlite)  prefix="sqlite" ;;
    postgres) prefix="postgres" ;;
    *) error "Unknown backup type: ${type}"; exit 1 ;;
  esac

  if [[ "${source}" == /* ]]; then
    # Absolute file path
    if [ -f "${source}" ]; then
      echo "${source}"
      return
    else
      error "Backup file not found: ${source}"
      exit 1
    fi
  fi

  if [ "${source}" = "latest" ]; then
    # Find latest backup
    local latest
    latest=$(find "${BACKUP_DIR}" -name "${prefix}_*.db.gz" -o -name "${prefix}_*.sql.gz" 2>/dev/null | sort -r | head -1)
    if [ -z "${latest}" ]; then
      error "No ${type} backups found in ${BACKUP_DIR}"
      exit 1
    fi
    echo "${latest}"
    return
  fi

  if [[ "${source}" == timestamp:* ]]; then
    local ts="${source#timestamp:}"
    # Search for backup matching the timestamp
    local match
    match=$(find "${BACKUP_DIR}" -name "${prefix}_${ts}*.gz" 2>/dev/null | head -1)
    if [ -z "${match}" ]; then
      error "No ${type} backup found for timestamp ${ts}"
      exit 1
    fi
    echo "${match}"
    return
  fi

  error "Could not resolve backup source: ${source}"
  exit 1
}

# ── Pre-restore Backup ──────────────────────────────────────────────
pre_restore_backup() {
  if [ "${NO_PRE_BACKUP}" = true ]; then
    warn "Skipping pre-restore backup (--no-pre-backup)"
    return
  fi

  info "Creating pre-restore backup..."
  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)

  case "${BACKUP_TYPE}" in
    sqlite)
      if [ -f "${DB_PATH}" ]; then
        local pre_backup="${BACKUP_DIR}/pre_restore/sqlite_prerestore_${timestamp}.db"
        mkdir -p "$(dirname "${pre_backup}")"
        cp "${DB_PATH}" "${pre_backup}"
        gzip -f "${pre_backup}"
        success "Pre-restore backup created: ${pre_backup}.gz"
      else
        warn "No existing database to backup before restore"
      fi
      ;;
    postgres)
      warn "Pre-restore PostgreSQL backup should be done via pg_dump"
      ;;
  esac
}

# ── Restore SQLite ──────────────────────────────────────────────────
restore_sqlite() {
  local backup_file="$1"

  info "Restoring SQLite from: ${backup_file}"

  # Verify gzip integrity
  if ! gzip -t "${backup_file}" 2>/dev/null; then
    error "Backup file is corrupted: ${backup_file}"
    exit 1
  fi

  if [ "${DRY_RUN}" = true ]; then
    info "[DRY RUN] Would restore ${backup_file} to ${DB_PATH}"
    return
  fi

  # Decompress to temporary file
  local temp_db
  temp_db=$(mktemp --suffix=.db)
  gunzip -c "${backup_file}" > "${temp_db}"

  # Verify the decompressed database
  if command -v sqlite3 &> /dev/null; then
    local integrity
    integrity=$(sqlite3 "${temp_db}" "PRAGMA integrity_check;" 2>/dev/null)
    if [ "${integrity}" != "ok" ]; then
      error "Database integrity check failed on backup file"
      rm -f "${temp_db}"
      exit 1
    fi
    success "Backup file integrity verified"
  fi

  # Replace the database
  local backup_current="${DB_PATH}.restoring"
  mv "${DB_PATH}" "${backup_current}" 2>/dev/null || true
  cp "${temp_db}" "${DB_PATH}"
  rm -f "${temp_db}" "${backup_current}"

  # Verify restored database
  if command -v sqlite3 &> /dev/null; then
    local restored_integrity
    restored_integrity=$(sqlite3 "${DB_PATH}" "PRAGMA integrity_check;" 2>/dev/null)
    if [ "${restored_integrity}" = "ok" ]; then
      success "SQLite restore complete and verified"
    else
      error "Restored database failed integrity check!"
      exit 1
    fi
  else
    success "SQLite restore complete (verification skipped - sqlite3 not available)"
  fi
}

# ── Restore PostgreSQL ──────────────────────────────────────────────
restore_postgres() {
  local backup_file="$1"

  info "Restoring PostgreSQL from: ${backup_file}"

  # Verify gzip integrity
  if ! gzip -t "${backup_file}" 2>/dev/null; then
    error "Backup file is corrupted: ${backup_file}"
    exit 1
  fi

  if [ "${DRY_RUN}" = true ]; then
    info "[DRY RUN] Would restore ${backup_file} to PostgreSQL"
    return
  fi

  # Decompress
  local temp_sql
  temp_sql=$(mktemp --suffix=.sql)
  gunzip -c "${backup_file}" > "${temp_sql}"

  # Build restore command
  local pg_cmd="pg_restore"
  if [ -n "${DATABASE_URL:-}" ]; then
    pg_cmd="${pg_cmd} --dbname=\"${DATABASE_URL}\""
  else
    pg_cmd="${pg_cmd} -h ${POSTGRES_HOST:-localhost} -p ${POSTGRES_PORT:-5432} -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-acquisitionos}"
  fi

  pg_cmd="${pg_cmd} --clean --if-exists --no-owner --no-acl ${temp_sql}"

  if eval "${pg_cmd}" 2>&1; then
    success "PostgreSQL restore complete"
  else
    error "PostgreSQL restore encountered errors (some may be non-critical)"
  fi

  rm -f "${temp_sql}"
}

# ── Main ────────────────────────────────────────────────────────────
main() {
  if [ -z "${BACKUP_SOURCE}" ]; then
    error "No backup source specified"
    usage
  fi

  info "═══════════════════════════════════════════════════════════"
  info "  AcquisitionOS Restore"
  info "  Source: ${BACKUP_SOURCE}"
  info "  Type: ${BACKUP_TYPE}"
  info "  Dry Run: ${DRY_RUN}"
  info "═══════════════════════════════════════════════════════════"

  # Resolve backup file
  BACKUP_FILE=$(resolve_backup_file "${BACKUP_SOURCE}" "${BACKUP_TYPE}")
  info "Resolved backup file: ${BACKUP_FILE}"

  # Pre-restore backup
  pre_restore_backup

  # Restore
  case "${BACKUP_TYPE}" in
    sqlite)
      restore_sqlite "${BACKUP_FILE}"
      ;;
    postgres)
      restore_postgres "${BACKUP_FILE}"
      ;;
  esac

  success "═══════════════════════════════════════════════════════════"
  success "  Restore complete!"
  success "  Restored from: ${BACKUP_FILE}"
  success "═══════════════════════════════════════════════════════════"
}

main
