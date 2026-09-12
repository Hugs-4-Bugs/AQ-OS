#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Snapshot Script
# Phase 14.5: Backups & Recovery
# Full app snapshot (db + uploads + config), versioned, list/info/delete
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
SNAPSHOT_DIR="${SNAPSHOT_DIR:-/opt/acquisitionos/snapshots}"
DB_PATH="${DB_PATH:-/opt/acquisitionos/data/acquisitionos.db}"
UPLOADS_DIR="${UPLOADS_DIR:-/opt/acquisitionos/uploads}"
CONFIG_DIR="${CONFIG_DIR:-/opt/acquisitionos/config}"
APP_DIR="${APP_DIR:-/opt/acquisitionos}"
S3_BUCKET="${S3_BACKUP_BUCKET:-}"
LOG_FILE="${LOG_FILE:-/var/log/acquisitionos/snapshot.log}"

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
Usage: $0 <command> [options]

Commands:
  create              Create a full application snapshot
  list                List all snapshots
  info <id>           Show snapshot details
  delete <id>         Delete a snapshot
  restore <id>        Restore from a snapshot

Options:
  --note TEXT         Add a note to the snapshot
  --upload-dir PATH   Override uploads directory
  -h, --help          Show this help message
EOF
  exit 0
}

# ── Create Snapshot ─────────────────────────────────────────────────
create_snapshot() {
  local note="${1:-}"
  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)
  local snapshot_id="snap_${timestamp}"
  local snapshot_path="${SNAPSHOT_DIR}/${snapshot_id}"

  info "Creating snapshot: ${snapshot_id}"
  mkdir -p "${snapshot_path}"

  # 1. Database backup
  info "Backing up database..."
  if [ -f "${DB_PATH}" ]; then
    if command -v sqlite3 &> /dev/null; then
      sqlite3 "${DB_PATH}" ".backup '${snapshot_path}/database.db'"
    else
      cp "${DB_PATH}" "${snapshot_path}/database.db"
    fi
    gzip -f "${snapshot_path}/database.db"
    success "Database backed up"
  else
    warn "No database file found at ${DB_PATH}"
  fi

  # 2. Uploads directory
  if [ -d "${UPLOADS_DIR}" ]; then
    info "Backing up uploads..."
    tar -czf "${snapshot_path}/uploads.tar.gz" -C "$(dirname "${UPLOADS_DIR}")" "$(basename "${UPLOADS_DIR}")" 2>/dev/null || true
    success "Uploads backed up"
  fi

  # 3. Configuration
  if [ -d "${CONFIG_DIR}" ]; then
    info "Backing up configuration..."
    tar -czf "${snapshot_path}/config.tar.gz" -C "$(dirname "${CONFIG_DIR}")" "$(basename "${CONFIG_DIR}")" 2>/dev/null || true
    success "Configuration backed up"
  fi

  # 4. Environment file
  if [ -f "${APP_DIR}/.env" ]; then
    cp "${APP_DIR}/.env" "${snapshot_path}/.env"
    success "Environment file backed up"
  fi

  # 5. Prisma schema
  if [ -f "${APP_DIR}/prisma/schema.prisma" ]; then
    cp "${APP_DIR}/prisma/schema.prisma" "${snapshot_path}/schema.prisma"
    success "Prisma schema backed up"
  fi

  # 6. Git info
  if [ -d "${APP_DIR}/.git" ]; then
    cd "${APP_DIR}"
    git rev-parse HEAD > "${snapshot_path}/git_commit" 2>/dev/null || true
    git describe --tags --always > "${snapshot_path}/git_version" 2>/dev/null || true
  fi

  # 7. Generate manifest
  local total_size
  total_size=$(du -sh "${snapshot_path}" 2>/dev/null | cut -f1 || echo "unknown")

  cat > "${snapshot_path}/manifest.json" <<EOF
{
  "id": "${snapshot_id}",
  "timestamp": "${timestamp}",
  "date": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "type": "full_snapshot",
  "note": "${note}",
  "size": "${total_size}",
  "components": {
    "database": $([ -f "${snapshot_path}/database.db.gz" ] && echo "true" || echo "false"),
    "uploads": $([ -f "${snapshot_path}/uploads.tar.gz" ] && echo "true" || echo "false"),
    "config": $([ -f "${snapshot_path}/config.tar.gz" ] && echo "true" || echo "false"),
    "env": $([ -f "${snapshot_path}/.env" ] && echo "true" || echo "false"),
    "schema": $([ -f "${snapshot_path}/schema.prisma" ] && echo "true" || echo "false")
  },
  "git_commit": "$(cat "${snapshot_path}/git_commit" 2>/dev/null || echo "unknown")",
  "git_version": "$(cat "${snapshot_path}/git_version" 2>/dev/null || echo "unknown")"
}
EOF

  # 8. Create compressed archive
  tar -czf "${snapshot_path}.tar.gz" -C "${SNAPSHOT_DIR}" "${snapshot_id}" 2>/dev/null

  # 9. Upload to S3
  if [ -n "${S3_BUCKET}" ] && command -v aws &> /dev/null; then
    info "Uploading snapshot to S3..."
    aws s3 cp "${snapshot_path}.tar.gz" "s3://${S3_BUCKET}/snapshots/${snapshot_id}.tar.gz" 2>/dev/null || true
    success "Snapshot uploaded to S3"
  fi

  success "Snapshot created: ${snapshot_id} (${total_size})"
  echo "${snapshot_id}"
}

# ── List Snapshots ──────────────────────────────────────────────────
list_snapshots() {
  info "Available snapshots:"
  echo ""

  local count=0
  for manifest in "${SNAPSHOT_DIR}"/snap_*/manifest.json; do
    if [ -f "${manifest}" ]; then
      local snap_id
      snap_id=$(basename "$(dirname "${manifest}")")
      local snap_date
      snap_date=$(python3 -c "import json; print(json.load(open('${manifest}'))['date'])" 2>/dev/null || echo "unknown")
      local snap_size
      snap_size=$(python3 -c "import json; print(json.load(open('${manifest}'))['size'])" 2>/dev/null || echo "unknown")
      local snap_note
      snap_note=$(python3 -c "import json; print(json.load(open('${manifest}')).get('note', ''))" 2>/dev/null || echo "")

      printf "  %-25s  %-12s  %s %s\n" "${snap_id}" "${snap_size}" "${snap_date}" "${snap_note:+— ${snap_note}}"
      count=$((count + 1))
    fi
  done

  # Also check tarball-only snapshots
  for tarball in "${SNAPSHOT_DIR}"/snap_*.tar.gz; do
    if [ -f "${tarball}" ]; then
      local snap_id
      snap_id=$(basename "${tarball}" .tar.gz)
      if [ ! -d "${SNAPSHOT_DIR}/${snap_id}" ]; then
        local snap_size
        snap_size=$(du -h "${tarball}" | cut -f1)
        printf "  %-25s  %-12s  (archived)\n" "${snap_id}" "${snap_size}"
        count=$((count + 1))
      fi
    fi
  done

  echo ""
  info "Total: ${count} snapshot(s)"
}

# ── Snapshot Info ────────────────────────────────────────────────────
snapshot_info() {
  local snap_id="$1"
  local manifest="${SNAPSHOT_DIR}/${snap_id}/manifest.json"

  if [ ! -f "${manifest}" ]; then
    error "Snapshot not found: ${snap_id}"
    exit 1
  fi

  info "Snapshot Details:"
  if command -v python3 &> /dev/null; then
    python3 -m json.tool "${manifest}"
  else
    cat "${manifest}"
  fi
}

# ── Delete Snapshot ─────────────────────────────────────────────────
delete_snapshot() {
  local snap_id="$1"

  info "Deleting snapshot: ${snap_id}"

  # Remove directory
  rm -rf "${SNAPSHOT_DIR}/${snap_id}"

  # Remove tarball
  rm -f "${SNAPSHOT_DIR}/${snap_id}.tar.gz"

  # Remove from S3
  if [ -n "${S3_BUCKET}" ] && command -v aws &> /dev/null; then
    aws s3 rm "s3://${S3_BUCKET}/snapshots/${snap_id}.tar.gz" 2>/dev/null || true
  fi

  success "Snapshot deleted: ${snap_id}"
}

# ── Restore Snapshot ────────────────────────────────────────────────
restore_snapshot() {
  local snap_id="$1"
  local snapshot_path="${SNAPSHOT_DIR}/${snap_id}"

  # Extract from tarball if only archive exists
  if [ ! -d "${snapshot_path}" ] && [ -f "${snapshot_path}.tar.gz" ]; then
    info "Extracting snapshot archive..."
    tar -xzf "${snapshot_path}.tar.gz" -C "${SNAPSHOT_DIR}"
  fi

  if [ ! -d "${snapshot_path}" ]; then
    error "Snapshot not found: ${snap_id}"
    exit 1
  fi

  info "Restoring from snapshot: ${snap_id}"

  # Restore database
  if [ -f "${snapshot_path}/database.db.gz" ]; then
    info "Restoring database..."
    gunzip -c "${snapshot_path}/database.db.gz" > "${DB_PATH}"
    success "Database restored"
  fi

  # Restore uploads
  if [ -f "${snapshot_path}/uploads.tar.gz" ]; then
    info "Restoring uploads..."
    tar -xzf "${snapshot_path}/uploads.tar.gz" -C "$(dirname "${UPLOADS_DIR}")"
    success "Uploads restored"
  fi

  # Restore config
  if [ -f "${snapshot_path}/config.tar.gz" ]; then
    info "Restoring configuration..."
    tar -xzf "${snapshot_path}/config.tar.gz" -C "$(dirname "${CONFIG_DIR}")"
    success "Configuration restored"
  fi

  success "Snapshot restore complete: ${snap_id}"
}

# ── Main ────────────────────────────────────────────────────────────
COMMAND="${1:-}"
shift || true

NOTE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --note) NOTE="$2"; shift 2 ;;
    --upload-dir) UPLOADS_DIR="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) break ;;
  esac
done

case "${COMMAND}" in
  create)  create_snapshot "${NOTE}" ;;
  list)    list_snapshots ;;
  info)    snapshot_info "${1:-}" ;;
  delete)  delete_snapshot "${1:-}" ;;
  restore) restore_snapshot "${1:-}" ;;
  *)       usage ;;
esac
