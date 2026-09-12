#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Backup Cron Setup
# Phase 14.5: Backups & Recovery
# Daily full (2 AM), hourly incremental, weekly snapshot, monthly archive
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/acquisitionos}"
CRON_USER="${SUDO_USER:-$(whoami)}"
LOG_DIR="/var/log/acquisitionos"

# ── Logging ─────────────────────────────────────────────────────────
info() { echo "[INFO] $*"; }
success() { echo "[SUCCESS] $*"; }

# ── Create Log Directory ────────────────────────────────────────────
mkdir -p "${LOG_DIR}"

# ── Remove existing AcquisitionOS cron jobs ─────────────────────────
info "Removing existing AcquisitionOS cron jobs..."
crontab -l 2>/dev/null | grep -v "acquisitionos" | grep -v "# AO:" | crontab - 2>/dev/null || true

# ── Add New Cron Jobs ───────────────────────────────────────────────
info "Adding AcquisitionOS cron jobs..."

# Read existing crontab
EXISTING=$(crontab -l 2>/dev/null || echo "")

# Build new crontab with AcquisitionOS jobs
NEW_CRONTAB=$(cat <<EOF
${EXISTING}

# ═══ AcquisitionOS Backup Schedule ═══

# AO: Daily full backup at 2:00 AM
0 2 * * * cd ${APP_DIR} && bash scripts/backup/backup.sh >> ${LOG_DIR}/backup.log 2>&1

# AO: Hourly incremental (SQLite WAL checkpoint + quick copy)
0 * * * * cd ${APP_DIR} && bash scripts/backup/backup.sh >> ${LOG_DIR}/backup-incremental.log 2>&1

# AO: Weekly snapshot (Sunday at 3:00 AM)
0 3 * * 0 cd ${APP_DIR} && bash scripts/backup/snapshot.sh create --note "Weekly automated snapshot" >> ${LOG_DIR}/snapshot.log 2>&1

# AO: Monthly archive (1st of each month at 4:00 AM)
0 4 1 * * cd ${APP_DIR} && bash scripts/backup/snapshot.sh create --note "Monthly archive snapshot" >> ${LOG_DIR}/snapshot.log 2>&1

# AO: Retention enforcement (daily at 5:00 AM)
0 5 * * * cd ${APP_DIR} && bash scripts/backup/retention.sh >> ${LOG_DIR}/retention.log 2>&1

# AO: Migration check (daily at 1:00 AM)
0 1 * * * cd ${APP_DIR} && npx prisma migrate status >> ${LOG_DIR}/migration.log 2>&1
EOF
)

echo "${NEW_CRONTAB}" | crontab -

# ── Verify ──────────────────────────────────────────────────────────
info "Installed cron jobs:"
crontab -l 2>/dev/null | grep "AO:" || echo "  (no AO jobs found)"

# ── Set up log rotation ─────────────────────────────────────────────
if [ ! -f /etc/logrotate.d/acquisitionos-backup ]; then
  sudo tee /etc/logrotate.d/acquisitionos-backup > /dev/null <<EOF
${LOG_DIR}/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
  info "Log rotation configured"
fi

success "═══════════════════════════════════════════════════════════"
success "  AcquisitionOS cron jobs installed!"
success "  Daily full backup: 2:00 AM"
success "  Hourly incremental: Every hour"
success "  Weekly snapshot: Sunday 3:00 AM"
success "  Monthly archive: 1st of month 4:00 AM"
success "  Retention enforcement: Daily 5:00 AM"
success "═══════════════════════════════════════════════════════════"
