#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Backup Retention Script
# Phase 14.5: Backups & Recovery
# Keep: 7 daily, 4 weekly, 12 monthly. Delete expired, report storage
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/opt/acquisitionos/backups}"
SNAPSHOT_DIR="${SNAPSHOT_DIR:-/opt/acquisitionos/snapshots}"
DAILY_RETENTION=7
WEEKLY_RETENTION=4
MONTHLY_RETENTION=12
LOG_FILE="${LOG_FILE:-/var/log/acquisitionos/retention.log}"

# ── Logging ─────────────────────────────────────────────────────────
log() {
  local level="$1"; shift
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
  echo "${msg}"
  mkdir -p "$(dirname "${LOG_FILE}")"
  echo "${msg}" >> "${LOG_FILE}" 2>/dev/null || true
}

info()    { log "INFO" "$@"; }
error()   { log "ERROR" "$@"; }
success() { log "SUCCESS" "$@"; }

# ── Retention Logic ─────────────────────────────────────────────────
apply_retention() {
  local dir="$1"
  local pattern="$2"
  local daily_keep="$3"
  local weekly_keep="$4"
  local monthly_keep="$5"

  if [ ! -d "${dir}" ]; then
    info "Directory not found: ${dir}"
    return
  fi

  info "Applying retention in ${dir} for pattern ${pattern}"

  local all_backups=()
  while IFS= read -r f; do
    all_backups+=("$f")
  done < <(find "${dir}" -name "${pattern}" -type f | sort -r)

  local total=${#all_backups[@]}
  info "Found ${total} backup(s)"

  if [ "${total}" -eq 0 ]; then
    return
  fi

  local daily_count=0
  local weekly_count=0
  local monthly_count=0
  local deleted=0
  local kept=0

  local today
  today=$(date +%Y%m%d)
  local current_week
  current_week=$(date +%Y%V)
  local current_month
  current_month=$(date +%Y%m)

  local last_daily_date=""
  local last_weekly_date=""
  local last_monthly_date=""

  for backup in "${all_backups[@]}"; do
    local filename
    filename=$(basename "${backup}")

    # Extract date from filename (format: YYYYMMDD)
    local backup_date
    backup_date=$(echo "${filename}" | grep -oP '\d{8}' | head -1 || echo "00000000")

    if [ "${backup_date}" = "00000000" ]; then
      # Can't determine date — keep it
      kept=$((kept + 1))
      continue
    fi

    local backup_week
    backup_week=$(date -d "${backup_date:0:4}-${backup_date:4:2}-${backup_date:6:2}" +%Y%V 2>/dev/null || echo "000000")
    local backup_month="${backup_date:0:6}"

    local should_keep=false

    # Daily retention: keep one backup per day
    if [ "${daily_count}" -lt "${daily_keep}" ]; then
      if [ "${backup_date}" != "${last_daily_date}" ]; then
        daily_count=$((daily_count + 1))
        last_daily_date="${backup_date}"
        should_keep=true
        info "  KEEP (daily #${daily_count}): ${filename}"
      fi
    fi

    # Weekly retention: keep one backup per week
    if [ "${weekly_count}" -lt "${weekly_keep}" ] && [ "${backup_week}" != "${last_weekly_date}" ]; then
      weekly_count=$((weekly_count + 1))
      last_weekly_date="${backup_week}"
      should_keep=true
      info "  KEEP (weekly #${weekly_count}): ${filename}"
    fi

    # Monthly retention: keep one backup per month
    if [ "${monthly_count}" -lt "${monthly_keep}" ] && [ "${backup_month}" != "${last_monthly_date}" ]; then
      monthly_count=$((monthly_count + 1))
      last_monthly_date="${backup_month}"
      should_keep=true
      info "  KEEP (monthly #${monthly_count}): ${filename}"
    fi

    if [ "${should_keep}" = false ]; then
      info "  DELETE (expired): ${filename}"
      rm -f "${backup}"
      deleted=$((deleted + 1))
    else
      kept=$((kept + 1))
    fi
  done

  success "Retention applied: ${kept} kept, ${deleted} deleted"
}

# ── Storage Report ──────────────────────────────────────────────────
storage_report() {
  info "═══════════════════════════════════════════════════════════"
  info "  Backup Storage Report"
  info "═══════════════════════════════════════════════════════════"

  # Backups directory
  if [ -d "${BACKUP_DIR}" ]; then
    local backup_size
    backup_size=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1 || echo "unknown")
    local backup_count
    backup_count=$(find "${BACKUP_DIR}" -name "*.gz" -type f 2>/dev/null | wc -l || echo "0")
    info "  Backups: ${backup_size} (${backup_count} files)"
  fi

  # Snapshots directory
  if [ -d "${SNAPSHOT_DIR}" ]; then
    local snapshot_size
    snapshot_size=$(du -sh "${SNAPSHOT_DIR}" 2>/dev/null | cut -f1 || echo "unknown")
    local snapshot_count
    snapshot_count=$(find "${SNAPSHOT_DIR}" -maxdepth 1 -name "snap_*" -type d 2>/dev/null | wc -l || echo "0")
    info "  Snapshots: ${snapshot_size} (${snapshot_count} snapshots)"
  fi

  # Disk usage
  local disk_usage
  disk_usage=$(df -h "${BACKUP_DIR}" 2>/dev/null | awk 'NR==2 {print $5}' || echo "unknown")
  info "  Disk usage: ${disk_usage}"

  info "═══════════════════════════════════════════════════════════"
}

# ── Clean Empty Directories ─────────────────────────────────────────
clean_empty_dirs() {
  find "${BACKUP_DIR}" -type d -empty -delete 2>/dev/null || true
  find "${SNAPSHOT_DIR}" -type d -empty -delete 2>/dev/null || true
}

# ── Main ────────────────────────────────────────────────────────────
main() {
  info "═══════════════════════════════════════════════════════════"
  info "  AcquisitionOS Retention Policy"
  info "  Daily: ${DAILY_RETENTION}, Weekly: ${WEEKLY_RETENTION}, Monthly: ${MONTHLY_RETENTION}"
  info "═══════════════════════════════════════════════════════════"

  # Apply retention to SQLite backups
  apply_retention "${BACKUP_DIR}" "sqlite_*.db.gz" "${DAILY_RETENTION}" "${WEEKLY_RETENTION}" "${MONTHLY_RETENTION}"

  # Apply retention to PostgreSQL backups
  apply_retention "${BACKUP_DIR}" "postgres_*.sql.gz" "${DAILY_RETENTION}" "${WEEKLY_RETENTION}" "${MONTHLY_RETENTION}"

  # Apply retention to snapshots
  apply_retention "${SNAPSHOT_DIR}" "snap_*.tar.gz" "${DAILY_RETENTION}" "${WEEKLY_RETENTION}" "${MONTHLY_RETENTION}"

  # Clean empty directories
  clean_empty_dirs

  # Storage report
  storage_report

  success "Retention policy applied successfully"
}

main
