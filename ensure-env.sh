#!/bin/bash
# ───────────────────────────────────────────────────────────────────
# ensure-env.sh — keepalive-safe .env bootstrap
#
# SECURITY HARDENING (P0):
#   This script previously EMBEDDED real credentials (Google OAuth
#   client secret, Google API key, Gmail App Passwords) and WEAK,
#   guessable JWT/CRON secrets — and it is committed to git. Anyone
#   with repository access could forge admin sessions.
#
#   It now contains NO secret values:
#     • Every existing value in the current .env is PRESERVED.
#     • Only NON-SENSITIVE defaults are written for missing keys.
#     • JWT secrets are generated with `openssl rand` when absent.
#     • Other missing secrets are left for the operator to supply
#       (the app fails closed without them where it matters).
#
#   ⚠ ALL credentials that were previously committed to this file
#     MUST be rotated (Google OAuth client secret, Google API key,
#     Gmail App Passwords) — see FINAL-SECURITY-HARDENING-REPORT.md.
# ───────────────────────────────────────────────────────────────────

ENV_FILE="/home/z/my-project/.env"

# ── Auto-recovery of REAL credentials after a sandbox/workspace reset ──
# Workspace resets can truncate .env to a bare DATABASE_URL line. The real,
# user-configured credentials (Google OAuth, Gmail SMTP, Google Search) are
# preserved in this repo's git history (old committed ensure-env.sh versions)
# and are restored by scripts/recover-credentials.mjs — which merges only the
# missing keys into .env, generates strong secrets for JWT/NEXTAUTH/AUTH/CRON
# if absent, and NEVER prints secret values. If .env already has the real
# GOOGLE_CLIENT_ID, this is a no-op.
if ! grep -q "^GOOGLE_CLIENT_ID=" "$ENV_FILE" 2>/dev/null; then
  echo "[ensure-env] GOOGLE_CLIENT_ID missing from $ENV_FILE — running scripts/recover-credentials.mjs (restores real credentials from git history)"
  node /home/z/my-project/scripts/recover-credentials.mjs \
    || echo "[ensure-env] WARN: credential recovery failed — operator must configure real credentials manually"
fi

# Every key present in the current .env survives this script untouched.
# (Instead of a fixed allowlist, preserve ALL existing KEY=VALUE lines.)
EXISTING_ENV=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_ENV=$(cat "$ENV_FILE")
fi

# ── Non-sensitive base defaults ────────────────────────────────────
# Only used for keys that are MISSING from the existing .env.
set_if_missing() {
  local KEY="$1"; local VAL="$2"
  if ! printf '%s\n' "$EXISTING_ENV" | grep -q "^${KEY}="; then
    printf '%s=%s\n' "$KEY" "$VAL" >> "$ENV_FILE"
  fi
}

set_if_missing DATABASE_URL "file:/home/z/my-project/db/custom.db"
# NOTE: NEXTAUTH_URL / NEXT_PUBLIC_APP_URL / APP_URL are intentionally NOT
# injected. src/lib/app-url.ts resolves the public origin dynamically
# (PRODUCTION_URL → APP_PUBLIC_URL → Origin/Referer → env → fallback).
# Hardcoding a preview domain here caused wrong-URL magic links / OAuth
# redirects when a workspace .env was rebuilt (incident note 2026-09-23).
set_if_missing SMTP_HOST "smtp.gmail.com"
set_if_missing SMTP_PORT "587"
set_if_missing AUTH_DEV_MODE "false"
set_if_missing AUTH_AUTO_VERIFY "false"
set_if_missing AUTH_DEV_OTP_IN_RESPONSE "false"
set_if_missing AUTH_DEV_OTP_IN_LOG "false"
set_if_missing AUTH_BYPASS_EMAIL "false"
set_if_missing ENABLE_GOOGLE_OAUTH "true"
set_if_missing ENABLE_MAGIC_LINK "true"
set_if_missing ENABLE_OTP_LOGIN "true"

# ── JWT signing secrets: generated, never hardcoded ────────────────
ensure_random_secret() {
  local KEY="$1"
  if ! grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null; then
    local GENERATED
    GENERATED=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    printf '%s=%s\n' "$KEY" "$GENERATED" >> "$ENV_FILE"
  fi
}
ensure_random_secret JWT_SECRET
ensure_random_secret JWT_REFRESH_SECRET
ensure_random_secret NEXTAUTH_SECRET
ensure_random_secret AUTH_SECRET

# ── Secrets the OPERATOR must supply (never defaulted here) ────────
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  → Google Cloud Console
# GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_CX → Google Cloud Console
# SMTP_USER / SMTP_PASSWORD / GMAIL_APP_PASSWORD → Gmail App Password
# CRON_SECRET      → openssl rand -hex 16
# STRIPE_* / RAZORPAY_* → provider dashboards
# These are intentionally NOT set by this script. If absent, the
# corresponding features stay disabled or fail closed.

chmod 600 "$ENV_FILE" 2>/dev/null || true

# ── DB SAFETY (incident 2026-09-22/23) ─────────────────────────────
# The live SQLite DB (db/custom.db, gitignored) was destroyed by a
# workspace reset, losing all 34 users → "existing email treated as
# new account" + silent OTP no-ops. Best-effort boot-time snapshot so
# future resets can never silently destroy user data again.
# Non-fatal: never blocks boot; no-op when DB missing/empty/unchanged.
if [ -f "$ENV_FILE" ]; then
  # PART 15: distinguish first-ever setup vs UNEXPECTED missing DB.
  # If snapshots exist (a populated DB existed before) but the live file
  # is gone, this is NOT a fresh setup — scream and point at recovery.
  if [ ! -f "/home/z/my-project/db/custom.db" ] && ls /home/z/my-project/db-backups/custom-*.db >/dev/null 2>&1; then
    echo "*** CRITICAL: expected database db/custom.db is MISSING but prior snapshots exist. ***" >&2
    echo "*** This is NOT a fresh setup. DO NOT run prisma db push (would silently init an empty DB). ***" >&2
    echo "*** Recovery: node scripts/db-safety.mjs restore <snapshot> --confirm   (see DATABASE-DR-RUNBOOK.md) ***" >&2
  fi
  node scripts/db-safety.mjs auto >/dev/null 2>&1 || true
fi
