#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Database Backup & Restore Utility
# Phase L9: Production Database Preparation
#
# Unified script for SQLite and PostgreSQL backup/restore operations.
# Production-ready with error handling, verification, and compression.
#
# USAGE:
#   ./scripts/db-backup-restore.sh <command> [OPTIONS]
#
# COMMANDS:
#   backup     Create a backup (SQLite and/or PostgreSQL)
#   restore    Restore from a backup file
#   list       List available backups
#   verify     Verify a backup file integrity
#   info       Show database size and table counts
#
# EXAMPLES:
#   # Backup SQLite (auto-detected)
#   ./scripts/db-backup-restore.sh backup
#
#   # Backup PostgreSQL only
#   ./scripts/db-backup-restore.sh backup --type postgres
#
#   # Backup both databases
#   ./scripts/db-backup-restore.sh backup --type all
#
#   # Restore latest SQLite backup
#   ./scripts/db-backup-restore.sh restore --latest --type sqlite
#
#   # Restore specific PostgreSQL backup
#   ./scripts/db-backup-restore.sh restore --file /backups/postgres_20260101.sql.gz
#
#   # List backups
#   ./scripts/db-backup-restore.sh list
#
#   # Verify a backup file
#   ./scripts/db-backup-restore.sh verify --file /backups/sqlite_20260101.db.gz
#
#   # Show database info
#   ./scripts/db-backup-restore.sh info
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

# Paths
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/db/backups}"
SQLITE_DB="${SQLITE_DB:-${PROJECT_DIR}/db/custom.db}"

# PostgreSQL (from DATABASE_URL or env vars)
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-acquisitionos}"
PG_PASSWORD="${PG_PASSWORD:-}"

# Retention
RETENTION_DAYS="${RETENTION_DAYS:-30}"
RETENTION_COUNT="${RETENTION_COUNT:-50}"

# Timestamps
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_PATH=$(date +%Y/%m/%d)

# ═══════════════════════════════════════════════════════════════════
# COLORS & LOGGING
# ═══════════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log() {
  local level="$1"; shift
  local color="${CYAN}"
  case "${level}" in
    ERROR) color="${RED}" ;;
    WARN)  color="${YELLOW}" ;;
    SUCCESS) color="${GREEN}" ;;
  esac
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
  echo -e "${color}${msg}${NC}" >&2
}

info()    { log "INFO" "$@"; }
warn()    { log "WARN" "$@"; }
error()   { log "ERROR" "$@"; }
success() { log "SUCCESS" "$@"; }

die() {
  log "ERROR" "$1"
  exit 1
}

# ═══════════════════════════════════════════════════════════════════
# AUTO-DETECT DATABASE TYPE
# ═══════════════════════════════════════════════════════════════════

detect_db_type() {
  local db_url="${DATABASE_URL:-}"

  if [[ "${db_url}" == postgresql://* ]] || [[ "${db_url}" == postgres://* ]]; then
    echo "postgres"
  elif [[ "${db_url}" == file:* ]]; then
    echo "sqlite"
  else
    # Fallback: check what's available
    if [ -f "${SQLITE_DB}" ]; then
      echo "sqlite"
    elif command -v psql &> /dev/null; then
      echo "postgres"
    else
      echo "unknown"
    fi
  fi
}

# Parse DATABASE_URL for PostgreSQL parameters
parse_pg_url() {
  local url="${DATABASE_URL:-}"

  if [[ -n "${url}" ]] && [[ "${url}" == postgres*://* ]]; then
    # Extract from URL: postgresql://user:pass@host:port/db
    local stripped="${url#postgresql://}"
    stripped="${stripped#postgres://}"

    # Extract credentials and host
    local credentials_host="${stripped%%/*}"
    local db_name="${stripped#*/}"

    # Remove query params from db name
    db_name="${db_name%%\?*}"

    if [[ "${credentials_host}" == *@* ]]; then
      local user_pass="${credentials_host%%@*}"
      PG_USER="${user_pass%%:*}"
      PG_PASSWORD="${user_pass#*:}"
      local host_port="${credentials_host#*@}"
      PG_HOST="${host_port%%:*}"
      PG_PORT="${host_port#*:}"
      PG_PORT="${PG_PORT%%\?*}"
    else
      PG_HOST="${credentials_host%%:*}"
      PG_PORT="${credentials_host#*:}"
      PG_PORT="${PG_PORT%%\?*}"
    fi

    PG_DB="${db_name%%\?*}"
    [ -n "${PG_DB}" ] && [ "${PG_DB}" != "${db_name}" ] || PG_DB="acquisitionos"
  fi
}

# ═══════════════════════════════════════════════════════════════════
# PSQL HELPER
# ═══════════════════════════════════════════════════════════════════

run_psql() {
  local db="${1:-${PG_DB}}"
  if [ -n "${PG_PASSWORD}" ]; then
    PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${db}" "${@:2}"
  else
    psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${db}" "${@:2}"
  fi
}

# ═══════════════════════════════════════════════════════════════════
# COMMAND: BACKUP
# ═══════════════════════════════════════════════════════════════════

cmd_backup() {
  local backup_type="${BACKUP_TYPE:-auto}"

  # Auto-detect if not specified
  if [ "${backup_type}" = "auto" ]; then
    backup_type=$(detect_db_type)
  fi

  info "Starting backup (type: ${backup_type})..."

  # Create backup directory
  mkdir -p "${BACKUP_DIR}/${DATE_PATH}"

  case "${backup_type}" in
    sqlite|all)
      backup_sqlite
      ;;
  esac

  case "${backup_type}" in
    postgres|all)
      backup_postgres
      ;;
  esac

  if [ "${backup_type}" = "unknown" ]; then
    error "Cannot auto-detect database type. Specify with --type sqlite|postgres|all"
    exit 1
  fi

  # Generate manifest
  generate_manifest "${backup_type}"

  # Rotate old backups
  rotate_backups

  success "Backup complete!"
}

backup_sqlite() {
  if [ ! -f "${SQLITE_DB}" ]; then
    warn "SQLite database not found at ${SQLITE_DB}, skipping"
    return 0
  fi

  info "Backing up SQLite: ${SQLITE_DB}"

  local backup_file="${BACKUP_DIR}/${DATE_PATH}/sqlite_${TIMESTAMP}.db"

  # Use sqlite3 for consistent backup (ONLINE, no locks needed)
  if command -v sqlite3 &> /dev/null; then
    if sqlite3 "${SQLITE_DB}" ".backup '${backup_file}'" 2>/dev/null; then
      info "SQLite backup created via .backup API"
    else
      warn "sqlite3 .backup failed, using file copy"
      cp "${SQLITE_DB}" "${backup_file}"
    fi
  else
    warn "sqlite3 not available — using file copy (may be inconsistent under load)"
    cp "${SQLITE_DB}" "${backup_file}"
  fi

  # Compress
  gzip -f "${backup_file}"
  local gz_file="${backup_file}.gz"
  local size
  size=$(du -h "${gz_file}" | cut -f1)

  # Verify
  verify_sqlite_backup "${gz_file}" || die "SQLite backup verification failed!"

  success "SQLite backup: ${gz_file} (${size})"
}

backup_postgres() {
  parse_pg_url

  # Verify pg_dump is available
  if ! command -v pg_dump &> /dev/null; then
    warn "pg_dump not found — skipping PostgreSQL backup"
    return 0
  fi

  info "Backing up PostgreSQL: ${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DB}"

  local backup_file="${BACKUP_DIR}/${DATE_PATH}/postgres_${TIMESTAMP}.sql"

  # Build pg_dump command
  local dump_opts=(
    "--no-owner"
    "--no-acl"
    "--format=custom"
    "--compress=6"
  )

  # Run pg_dump
  local dump_status=0
  if [ -n "${PG_PASSWORD}" ]; then
    PGPASSWORD="${PG_PASSWORD}" pg_dump \
      -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" \
      "${dump_opts[@]}" \
      -f "${backup_file}" 2>/dev/null || dump_status=$?
  else
    pg_dump \
      -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" \
      "${dump_opts[@]}" \
      -f "${backup_file}" 2>/dev/null || dump_status=$?
  fi

  if [ ${dump_status} -ne 0 ]; then
    die "PostgreSQL backup failed with exit code ${dump_status}"
  fi

  # Compress (custom format is already compressed, but gzip for safety)
  gzip -f "${backup_file}"
  local gz_file="${backup_file}.gz"
  local size
  size=$(du -h "${gz_file}" | cut -f1)

  # Verify
  verify_postgres_backup "${gz_file}" || die "PostgreSQL backup verification failed!"

  success "PostgreSQL backup: ${gz_file} (${size})"
}

# ═══════════════════════════════════════════════════════════════════
# COMMAND: RESTORE
# ═══════════════════════════════════════════════════════════════════

cmd_restore() {
  local restore_type="${RESTORE_TYPE:-sqlite}"
  local source="${RESTORE_SOURCE:-}"

  if [ -z "${source}" ]; then
    die "No backup source specified. Use --latest, --file PATH, or --timestamp TS"
  fi

  # Resolve backup file
  local backup_file
  backup_file=$(resolve_backup_file "${source}" "${restore_type}") || die "Could not resolve backup: ${source}"

  info "Restoring ${restore_type} from: ${backup_file}"

  # Verify file before restore
  case "${restore_type}" in
    sqlite)  verify_sqlite_backup "${backup_file}" || die "Backup file verification failed!" ;;
    postgres) verify_postgres_backup "${backup_file}" || die "Backup file verification failed!" ;;
  esac

  # Create pre-restore backup
  if [ "${NO_PRE_BACKUP:-false}" != "true" ]; then
    info "Creating pre-restore safety backup..."
    pre_restore_backup "${restore_type}" || warn "Pre-restore backup failed — proceeding anyway"
  fi

  # Perform restore
  case "${restore_type}" in
    sqlite)  restore_sqlite "${backup_file}" ;;
    postgres) restore_postgres "${backup_file}" ;;
  esac

  success "Restore complete!"
}

resolve_backup_file() {
  local source="$1"
  local type="$2"
  local prefix

  case "${type}" in
    sqlite)  prefix="sqlite" ;;
    postgres) prefix="postgres" ;;
    *) die "Unknown backup type: ${type}" ;;
  esac

  # Absolute path
  if [[ "${source}" == /* ]]; then
    [ -f "${source}" ] || die "Backup file not found: ${source}"
    echo "${source}"
    return
  fi

  # Latest backup
  if [ "${source}" = "latest" ]; then
    local latest
    latest=$(find "${BACKUP_DIR}" -name "${prefix}_*.gz" -type f 2>/dev/null | sort -r | head -1)
    [ -n "${latest}" ] || die "No ${type} backups found in ${BACKUP_DIR}"
    echo "${latest}"
    return
  fi

  # Timestamp-based search
  if [[ "${source}" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
    local match
    match=$(find "${BACKUP_DIR}" -name "${prefix}_${source}*.gz" -type f 2>/dev/null | head -1)
    [ -n "${match}" ] || die "No ${type} backup found for timestamp: ${source}"
    echo "${match}"
    return
  fi

  die "Invalid backup source: ${source}. Use --latest, --file PATH, or a YYYYMMDD_HHMMSS timestamp."
}

pre_restore_backup() {
  local type="$1"
  local pre_dir="${BACKUP_DIR}/pre_restore"
  mkdir -p "${pre_dir}"

  case "${type}" in
    sqlite)
      if [ -f "${SQLITE_DB}" ]; then
        local pre_file="${pre_dir}/sqlite_prerestore_${TIMESTAMP}.db"
        cp "${SQLITE_DB}" "${pre_file}" && gzip -f "${pre_file}"
        success "Pre-restore backup: ${pre_file}.gz"
      fi
      ;;
    postgres)
      parse_pg_url
      if command -v pg_dump &> /dev/null; then
        local pre_file="${pre_dir}/postgres_prerestore_${TIMESTAMP}.sql"
        if [ -n "${PG_PASSWORD}" ]; then
          PGPASSWORD="${PG_PASSWORD}" pg_dump \
            -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" \
            --no-owner --no-acl -f "${pre_file}" 2>/dev/null || true
        else
          pg_dump \
            -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" \
            --no-owner --no-acl -f "${pre_file}" 2>/dev/null || true
        fi
        gzip -f "${pre_file}" 2>/dev/null || true
        success "Pre-restore PostgreSQL backup created"
      else
        warn "pg_dump not available for pre-restore backup"
      fi
      ;;
  esac
}

restore_sqlite() {
  local backup_file="$1"

  if [ "${DRY_RUN:-false}" = "true" ]; then
    info "[DRY RUN] Would restore ${backup_file} -> ${SQLITE_DB}"
    return
  fi

  # Decompress to temp
  local temp_db
  temp_db=$(mktemp --suffix=.db)
  trap "rm -f '${temp_db}'" EXIT

  gunzip -c "${backup_file}" > "${temp_db}" || die "Failed to decompress backup file"

  # Verify integrity
  if command -v sqlite3 &> /dev/null; then
    local check
    check=$(sqlite3 "${temp_db}" "PRAGMA integrity_check;" 2>/dev/null)
    [ "${check}" = "ok" ] || die "Backup file integrity check failed: ${check}"
  fi

  # Replace database
  local old_db="${SQLITE_DB}.pre_restore"
  mv "${SQLITE_DB}" "${old_db}" 2>/dev/null || true
  cp "${temp_db}" "${SQLITE_DB}"
  rm -f "${temp_db}" "${old_db}"

  # Verify restored database
  if command -v sqlite3 &> /dev/null; then
    local restored_check
    restored_check=$(sqlite3 "${SQLITE_DB}" "PRAGMA integrity_check;" 2>/dev/null)
    [ "${restored_check}" = "ok" ] || die "Restored database failed integrity check!"
    success "SQLite integrity check: OK"
  fi

  # Show table counts
  local table_count
  table_count=$(sqlite3 "${SQLITE_DB}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null)
  success "Restored ${table_count} tables to ${SQLITE_DB}"
}

restore_postgres() {
  local backup_file="$1"

  if [ "${DRY_RUN:-false}" = "true" ]; then
    info "[DRY RUN] Would restore ${backup_file} -> PostgreSQL"
    return
  fi

  parse_pg_url

  if ! command -v pg_restore &> /dev/null; then
    die "pg_restore is required for PostgreSQL restore"
  fi

  # Decompress
  local temp_file
  temp_file=$(mktemp --suffix=.dump)
  trap "rm -f '${temp_file}'" EXIT

  gunzip -c "${backup_file}" > "${temp_file}" || die "Failed to decompress backup file"

  # Verify format
  if ! pg_restore --list "${temp_file}" > /dev/null 2>&1; then
    die "Invalid PostgreSQL backup format"
  fi

  # Restore with clean + if-exists
  local restore_opts=(
    "--clean"
    "--if-exists"
    "--no-owner"
    "--no-acl"
    "--verbose"
  )

  info "Restoring to ${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DB}..."
  local restore_status=0

  if [ -n "${PG_PASSWORD}" ]; then
    PGPASSWORD="${PG_PASSWORD}" pg_restore \
      -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" \
      "${restore_opts[@]}" \
      "${temp_file}" 2>&1 || restore_status=$?
  else
    pg_restore \
      -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" \
      "${restore_opts[@]}" \
      "${temp_file}" 2>&1 || restore_status=$?
  fi

  rm -f "${temp_file}"

  # pg_restore --clean can return non-zero for non-critical errors
  if [ ${restore_status} -ne 0 ]; then
    warn "pg_restore completed with warnings (exit code ${restore_status}). Some errors may be non-critical."
  else
    success "PostgreSQL restore completed without errors"
  fi

  # Verify
  local table_count
  table_count=$(run_psql -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
  success "Restored ${table_count:-?} tables to PostgreSQL"
}

# ═══════════════════════════════════════════════════════════════════
# COMMAND: LIST
# ═══════════════════════════════════════════════════════════════════

cmd_list() {
  local filter_type="${LIST_TYPE:-all}"

  echo ""
  echo -e "${BOLD}Available Backups in ${BACKUP_DIR}${NC}"
  echo ""

  local total_size=0
  local count=0

  while IFS= read -r -d '' file; do
    local basename_f
    basename_f=$(basename "${file}")
    local type_tag="?"

    if [[ "${basename_f}" == sqlite_* ]]; then
      type_tag="SQLite"
      [[ "${filter_type}" == "postgres" ]] && continue
    elif [[ "${basename_f}" == postgres_* ]]; then
      type_tag="PostgreSQL"
      [[ "${filter_type}" == "sqlite" ]] && continue
    else
      continue
    fi

    local file_size
    file_size=$(du -h "${file}" | cut -f1)
    local file_date
    file_date=$(stat -c %Y "${file}" 2>/dev/null || stat -f %m "${file}" 2>/dev/null)
    local date_str
    date_str=$(date -d "@${file_date}" "+%Y-%m-%d %H:%M" 2>/dev/null || date -r "${file_date}" "+%Y-%m-%d %H:%M" 2>/dev/null)

    printf "  %-50s  %8s  %s  %s\n" "${basename_f}" "${file_size}" "${type_tag}" "${date_str}"
    count=$((count + 1))
  done < <(find "${BACKUP_DIR}" -name "*.gz" -type f -print0 2>/dev/null | sort -z -r)

  echo ""
  if [ ${count} -eq 0 ]; then
    warn "No backups found"
  else
    info "Total: ${count} backup(s)"
  fi

  local dir_size
  dir_size=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1 || echo "unknown")
  info "Storage: ${dir_size}"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# COMMAND: VERIFY
# ═══════════════════════════════════════════════════════════════════

cmd_verify() {
  local file="${VERIFY_FILE:-}"

  if [ -z "${file}" ]; then
    die "No file specified. Use --file PATH"
  fi

  [ -f "${file}" ] || die "File not found: ${file}"

  info "Verifying: ${file}"

  # Check gzip integrity
  if ! gzip -t "${file}" 2>/dev/null; then
    die "Gzip integrity check FAILED"
  fi
  info "Gzip integrity: OK"

  # Type-specific verification
  local basename_f
  basename_f=$(basename "${file}")

  if [[ "${basename_f}" == sqlite_* ]]; then
    verify_sqlite_backup "${file}"
  elif [[ "${basename_f}" == postgres_* ]]; then
    verify_postgres_backup "${file}"
  else
    warn "Unknown backup type — only gzip integrity verified"
  fi

  success "Verification complete"
}

verify_sqlite_backup() {
  local file="$1"

  if ! command -v sqlite3 &> /dev/null; then
    warn "sqlite3 not available — skipping database integrity check"
    return 0
  fi

  local temp_db
  temp_db=$(mktemp)
  gunzip -c "${file}" > "${temp_db}" 2>/dev/null || die "Failed to decompress"

  local check
  check=$(sqlite3 "${temp_db}" "PRAGMA integrity_check;" 2>/dev/null)
  rm -f "${temp_db}"

  if [ "${check}" = "ok" ]; then
    success "SQLite integrity: OK"
  else
    die "SQLite integrity check FAILED: ${check}"
  fi
}

verify_postgres_backup() {
  local file="$1"

  if ! command -v pg_restore &> /dev/null; then
    warn "pg_restore not available — skipping format check"
    return 0
  fi

  local temp_file
  temp_file=$(mktemp)
  gunzip -c "${file}" > "${temp_file}" 2>/dev/null || die "Failed to decompress"

  if pg_restore --list "${temp_file}" > /dev/null 2>&1; then
    success "PostgreSQL backup format: valid"
  else
    rm -f "${temp_file}"
    die "PostgreSQL backup format: INVALID"
  fi

  rm -f "${temp_file}"
}

# ═══════════════════════════════════════════════════════════════════
# COMMAND: INFO
# ═══════════════════════════════════════════════════════════════════

cmd_info() {
  local db_type
  db_type=$(detect_db_type)

  echo ""
  echo -e "${BOLD}Database Information${NC}"
  echo ""

  # Environment info
  echo -e "${BOLD}  Environment:${NC}"
  echo "    DATABASE_URL:     ${DATABASE_URL:-(not set)}"
  echo "    Detected type:    ${db_type}"
  echo ""

  # SQLite info
  if [ -f "${SQLITE_DB}" ]; then
    local sqlite_size
    sqlite_size=$(du -h "${SQLITE_DB}" | cut -f1)
    local sqlite_tables
    sqlite_tables=$(sqlite3 "${SQLITE_DB}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "?")
    local sqlite_size_bytes
    sqlite_size_bytes=$(stat -c%s "${SQLITE_DB}" 2>/dev/null || stat -f%z "${SQLITE_DB}" 2>/dev/null || echo 0)

    echo -e "${BOLD}  SQLite:${NC}"
    echo "    Path:            ${SQLITE_DB}"
    echo "    Size:            ${sqlite_size} (${sqlite_size_bytes} bytes)"
    echo "    Tables:          ${sqlite_tables}"

    if command -v sqlite3 &> /dev/null; then
      echo "    Integrity:       $(sqlite3 "${SQLITE_DB}" "PRAGMA integrity_check;" 2>/dev/null)"
    fi
    echo ""
  fi

  # PostgreSQL info
  if [[ "${db_type}" == "postgres" ]] || [[ "${DATABASE_URL:-}" == postgres* ]]; then
    parse_pg_url

    echo -e "${BOLD}  PostgreSQL:${NC}"
    echo "    Host:            ${PG_HOST}:${PG_PORT}"
    echo "    Database:        ${PG_DB}"
    echo "    User:            ${PG_USER}"

    if command -v psql &> /dev/null; then
      local pg_tables
      pg_tables=$(run_psql -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs || echo "?")
      local pg_size
      pg_size=$(run_psql -t -c "SELECT pg_size_pretty(pg_database_size('${PG_DB}'));" 2>/dev/null | xargs || echo "?")
      local pg_connections
      pg_connections=$(run_psql -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname = '${PG_DB}';" 2>/dev/null | xargs || echo "?")
      local pg_version
      pg_version=$(run_psql -t -c "SELECT version();" 2>/dev/null | head -1 | xargs || echo "?")

      echo "    Version:         ${pg_version}"
      echo "    Size:            ${pg_size}"
      echo "    Tables:          ${pg_tables}"
      echo "    Connections:     ${pg_connections}"
    fi
    echo ""
  fi

  # Backup info
  local backup_count
  backup_count=$(find "${BACKUP_DIR}" -name "*.gz" -type f 2>/dev/null | wc -l | xargs)
  local backup_size
  backup_size=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1 || echo "0")

  echo -e "${BOLD}  Backups:${NC}"
  echo "    Directory:       ${BACKUP_DIR}"
  echo "    Count:           ${backup_count}"
  echo "    Total size:      ${backup_size}"
  echo "    Retention:       ${RETENTION_DAYS} days"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════

generate_manifest() {
  local type="$1"
  local manifest="${BACKUP_DIR}/${DATE_PATH}/manifest_${TIMESTAMP}.json"

  cat > "${manifest}" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "date": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "type": "${type}",
  "backup_dir": "${BACKUP_DIR}",
  "retention_days": ${RETENTION_DAYS}
}
EOF

  info "Manifest: ${manifest}"
}

rotate_backups() {
  info "Rotating backups older than ${RETENTION_DAYS} days..."

  local deleted=0
  while IFS= read -r file; do
    rm -f "${file}"
    deleted=$((deleted + 1))
  done < <(find "${BACKUP_DIR}" -name "*.gz" -type f -mtime +${RETENTION_DAYS} 2>/dev/null)

  # Also enforce count limit
  local total
  total=$(find "${BACKUP_DIR}" -name "*.gz" -type f 2>/dev/null | wc -l | xargs)
  if [ "${total}" -gt "${RETENTION_COUNT}" ]; then
    local to_delete=$((total - RETENTION_COUNT))
    info "Exceeding count limit (${total}/${RETENTION_COUNT}), removing ${to_delete} oldest..."
    find "${BACKUP_DIR}" -name "*.gz" -type f -print0 2>/dev/null \
      | sort -z -r \
      | tail -z -n +$((RETENTION_COUNT + 1)) \
      | xargs -0 rm -f 2>/dev/null || true
  fi

  # Clean empty directories
  find "${BACKUP_DIR}" -type d -empty -delete 2>/dev/null || true

  if [ ${deleted} -gt 0 ]; then
    info "Deleted ${deleted} expired backup(s)"
  fi
}

# ═══════════════════════════════════════════════════════════════════
# USAGE
# ═══════════════════════════════════════════════════════════════════

usage() {
  cat <<EOF
${BOLD}AcquisitionOS — Database Backup & Restore Utility${NC}

Usage: $0 <command> [OPTIONS]

COMMANDS:
  backup     Create a database backup
  restore    Restore from a backup
  list       List available backups
  verify     Verify a backup file's integrity
  info       Show database information

BACKUP OPTIONS:
  --type TYPE    Database type: sqlite, postgres, all, auto (default: auto)

RESTORE OPTIONS:
  --latest            Restore the most recent backup
  --file PATH         Restore from a specific file
  --timestamp TS      Restore from a timestamp (YYYYMMDD_HHMMSS)
  --type TYPE         Database type: sqlite (default), postgres
  --dry-run           Show what would be done
  --no-pre-backup     Skip pre-restore safety backup

LIST OPTIONS:
  --type TYPE    Filter: sqlite, postgres, all (default: all)

VERIFY OPTIONS:
  --file PATH    Backup file to verify

ENVIRONMENT VARIABLES:
  DATABASE_URL         Database connection URL (auto-detected)
  BACKUP_DIR            Backup directory (default: db/backups)
  SQLITE_DB             SQLite file path (default: db/custom.db)
  RETENTION_DAYS        Days to keep backups (default: 30)

EXAMPLES:
  $0 backup
  $0 backup --type postgres
  $0 backup --type all
  $0 restore --latest
  $0 restore --latest --type postgres
  $0 restore --file ./backups/sqlite_20260101_120000.db.gz
  $0 restore --latest --dry-run
  $0 list
  $0 list --type postgres
  $0 verify --file ./backups/sqlite_20260101.db.gz
  $0 info
EOF
  exit 0
}

# ═══════════════════════════════════════════════════════════════════
# PARSE COMMAND
# ═══════════════════════════════════════════════════════════════════

COMMAND="${1:-}"
shift || true

case "${COMMAND}" in
  backup)
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --type) BACKUP_TYPE="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) die "Unknown option for backup: $1" ;;
      esac
    done
    cmd_backup
    ;;
  restore)
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --latest) RESTORE_SOURCE="latest"; shift ;;
        --file)   RESTORE_SOURCE="$2"; shift 2 ;;
        --timestamp) RESTORE_SOURCE="$2"; shift 2 ;;
        --type)   RESTORE_TYPE="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --no-pre-backup) NO_PRE_BACKUP=true; shift ;;
        -h|--help) usage ;;
        *) die "Unknown option for restore: $1" ;;
      esac
    done
    cmd_restore
    ;;
  list)
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --type) LIST_TYPE="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) die "Unknown option for list: $1" ;;
      esac
    done
    cmd_list
    ;;
  verify)
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --file) VERIFY_FILE="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) die "Unknown option for verify: $1" ;;
      esac
    done
    cmd_verify
    ;;
  info)
    cmd_info
    ;;
  ""|-h|--help)
    usage
    ;;
  *)
    die "Unknown command: ${COMMAND}. Use --help for usage."
    ;;
esac
