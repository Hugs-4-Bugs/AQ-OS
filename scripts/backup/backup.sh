#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Backup Script
# Phase 14.5: Backups & Recovery
# SQLite backup, PostgreSQL backup, gzip, S3 upload, rotation, verify
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/opt/acquisitionos/backups}"
DB_PATH="${DB_PATH:-/opt/acquisitionos/data/acquisitionos.db}"
S3_BUCKET="${S3_BACKUP_BUCKET:-}"
S3_PREFIX="backups"
LOCAL_RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_PATH=$(date +%Y/%m/%d)
LOG_FILE="${LOG_FILE:-/var/log/acquisitionos/backup.log}"

# ── Colors & Logging ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
  local level="$1"
  shift
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
  echo -e "${msg}" >&2
  mkdir -p "$(dirname "${LOG_FILE}")"
  echo "${msg}" >> "${LOG_FILE}" 2>/dev/null || true
}

info()  { log "INFO" "$@"; }
warn()  { log "WARN" "${YELLOW}$*${NC}"; }
error() { log "ERROR" "${RED}$*${NC}"; }
success() { log "SUCCESS" "${GREEN}$*${NC}"; }

# ── Pre-flight Checks ───────────────────────────────────────────────
preflight() {
  info "Running pre-flight checks..."

  # Create backup directory
  mkdir -p "${BACKUP_DIR}/${DATE_PATH}"

  # Check disk space (require at least 500MB free)
  local available_kb
  available_kb=$(df -k "${BACKUP_DIR}" | awk 'NR==2 {print $4}')
  if [ "${available_kb}" -lt 512000 ]; then
    error "Insufficient disk space: ${available_kb}KB available, need 512000KB"
    exit 1
  fi

  info "Pre-flight checks passed"
}

# ── SQLite Backup ───────────────────────────────────────────────────
backup_sqlite() {
  if [ ! -f "${DB_PATH}" ]; then
    warn "SQLite database not found at ${DB_PATH}, skipping SQLite backup"
    return 0
  fi

  info "Starting SQLite backup..."
  local backup_file="${BACKUP_DIR}/${DATE_PATH}/sqlite_${TIMESTAMP}.db"

  # Use sqlite3 .backup for consistent backup
  if command -v sqlite3 &> /dev/null; then
    sqlite3 "${DB_PATH}" ".backup '${backup_file}'"
    if [ $? -eq 0 ]; then
      info "SQLite backup created: ${backup_file}"
    else
      error "SQLite .backup failed, falling back to file copy"
      cp "${DB_PATH}" "${backup_file}"
    fi
  else
    # Fallback: copy the file (may not be consistent under load)
    warn "sqlite3 not available, using file copy for SQLite backup"
    cp "${DB_PATH}" "${backup_file}"
  fi

  # Compress
  gzip -f "${backup_file}"
  local compressed_file="${backup_file}.gz"
  local file_size
  file_size=$(du -h "${compressed_file}" | cut -f1)
  success "SQLite backup compressed: ${compressed_file} (${file_size})"

  # Verify
  verify_backup "${compressed_file}" "sqlite"

  # Upload to S3 if configured
  s3_upload "${compressed_file}"

  echo "${compressed_file}"
}

# ── PostgreSQL Backup ───────────────────────────────────────────────
backup_postgres() {
  if [ -z "${POSTGRES_HOST:-}" ] && [ -z "${DATABASE_URL:-}" ]; then
    warn "No PostgreSQL configuration found, skipping PostgreSQL backup"
    return 0
  fi

  info "Starting PostgreSQL backup..."
  local backup_file="${BACKUP_DIR}/${DATE_PATH}/postgres_${TIMESTAMP}.sql"

  # Build pg_dump command
  local pg_cmd="pg_dump"

  if [ -n "${DATABASE_URL:-}" ]; then
    pg_cmd="${pg_cmd} \"${DATABASE_URL}\""
  else
    pg_cmd="${pg_cmd} -h ${POSTGRES_HOST:-localhost} -p ${POSTGRES_PORT:-5432} -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-acquisitionos}"
  fi

  pg_cmd="${pg_cmd} --no-owner --no-acl --format=custom"

  # Run pg_dump
  if eval "${pg_cmd}" > "${backup_file}" 2>/dev/null; then
    info "PostgreSQL backup created: ${backup_file}"
  else
    error "PostgreSQL backup failed"
    rm -f "${backup_file}"
    return 1
  fi

  # Compress
  gzip -f "${backup_file}"
  local compressed_file="${backup_file}.gz"
  local file_size
  file_size=$(du -h "${compressed_file}" | cut -f1)
  success "PostgreSQL backup compressed: ${compressed_file} (${file_size})"

  # Verify
  verify_backup "${compressed_file}" "postgres"

  # Upload to S3
  s3_upload "${compressed_file}"

  echo "${compressed_file}"
}

# ── Verify Backup ───────────────────────────────────────────────────
verify_backup() {
  local file="$1"
  local type="$2"

  info "Verifying ${type} backup: ${file}"

  # Check file exists and is non-empty
  if [ ! -f "${file}" ]; then
    error "Backup file not found: ${file}"
    return 1
  fi

  local file_size
  file_size=$(stat -f%z "${file}" 2>/dev/null || stat -c%s "${file}" 2>/dev/null || echo 0)
  if [ "${file_size}" -eq 0 ]; then
    error "Backup file is empty: ${file}"
    return 1
  fi

  # Verify gzip integrity
  if ! gzip -t "${file}" 2>/dev/null; then
    error "Gzip integrity check failed: ${file}"
    return 1
  fi

  # Type-specific verification
  case "${type}" in
    sqlite)
      # Decompress and verify it's a valid SQLite database
      local temp_db
      temp_db=$(mktemp)
      gunzip -c "${file}" > "${temp_db}"
      if command -v sqlite3 &> /dev/null; then
        if sqlite3 "${temp_db}" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
          success "SQLite integrity check passed"
        else
          error "SQLite integrity check failed"
          rm -f "${temp_db}"
          return 1
        fi
      fi
      rm -f "${temp_db}"
      ;;
    postgres)
      # Verify custom format with pg_restore --list
      local temp_file
      temp_file=$(mktemp)
      gunzip -c "${file}" > "${temp_file}"
      if command -v pg_restore &> /dev/null; then
        if pg_restore --list "${temp_file}" > /dev/null 2>&1; then
          success "PostgreSQL backup format verified"
        else
          error "PostgreSQL backup format invalid"
          rm -f "${temp_file}"
          return 1
        fi
      fi
      rm -f "${temp_file}"
      ;;
  esac

  success "Backup verification passed for ${type}"
}

# ── S3 Upload ───────────────────────────────────────────────────────
s3_upload() {
  local file="$1"

  if [ -z "${S3_BUCKET}" ]; then
    info "S3 bucket not configured, skipping upload"
    return 0
  fi

  info "Uploading to S3: s3://${S3_BUCKET}/${S3_PREFIX}/${DATE_PATH}/$(basename "${file}")"

  if command -v aws &> /dev/null; then
    if aws s3 cp "${file}" "s3://${S3_BUCKET}/${S3_PREFIX}/${DATE_PATH}/$(basename "${file}")" \
      --storage-class STANDARD_IA \
      --metadata "type=backup,timestamp=${TIMESTAMP}"; then
      success "S3 upload complete"
    else
      error "S3 upload failed"
      return 1
    fi
  else
    warn "AWS CLI not installed, skipping S3 upload"
  fi
}

# ── Local Rotation ──────────────────────────────────────────────────
rotate_local() {
  info "Rotating local backups (keeping ${LOCAL_RETENTION_DAYS} days)..."

  local deleted=0
  while IFS= read -r file; do
    rm -f "${file}"
    deleted=$((deleted + 1))
    info "Deleted: ${file}"
  done < <(find "${BACKUP_DIR}" -name "*.gz" -type f -mtime +${LOCAL_RETENTION_DAYS} 2>/dev/null)

  # Also remove empty directories
  find "${BACKUP_DIR}" -type d -empty -delete 2>/dev/null || true

  if [ "${deleted}" -gt 0 ]; then
    info "Rotated ${deleted} old backup(s)"
  else
    info "No backups to rotate"
  fi

  # Report storage usage
  local total_size
  total_size=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1 || echo "unknown")
  info "Total backup storage: ${total_size}"
}

# ── Generate Manifest ───────────────────────────────────────────────
generate_manifest() {
  local manifest_file="${BACKUP_DIR}/${DATE_PATH}/manifest_${TIMESTAMP}.json"

  # Build backup entries (avoid trailing commas in JSON)
  local backup_entries=""
  if [ -n "${SQLITE_FILE:-}" ]; then
    backup_entries="\"sqlite\": \"$(basename "${SQLITE_FILE}")\""
  fi
  if [ -n "${PG_FILE:-}" ]; then
    if [ -n "${backup_entries}" ]; then
      backup_entries="${backup_entries}, "
    fi
    backup_entries="${backup_entries}\"postgres\": \"$(basename "${PG_FILE}")\""
  fi

  cat > "${manifest_file}" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "date": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "type": "full",
  "backups": {${backup_entries}},
  "s3_bucket": "${S3_BUCKET:-not_configured}",
  "retention_days": ${LOCAL_RETENTION_DAYS}
}
EOF

  info "Manifest generated: ${manifest_file}"
}

# ── Main ────────────────────────────────────────────────────────────
main() {
  info "═══════════════════════════════════════════════════════════"
  info "  AcquisitionOS Backup — ${TIMESTAMP}"
  info "═══════════════════════════════════════════════════════════"

  preflight

  # Run backups
  SQLITE_FILE=$(backup_sqlite || echo "")
  PG_FILE=$(backup_postgres || echo "")

  # Generate manifest
  generate_manifest

  # Rotate old backups
  rotate_local

  success "═══════════════════════════════════════════════════════════"
  success "  Backup complete!"
  success "  SQLite: ${SQLITE_FILE:-skipped}"
  success "  PostgreSQL: ${PG_FILE:-skipped}"
  success "═══════════════════════════════════════════════════════════"
}

main "$@"
