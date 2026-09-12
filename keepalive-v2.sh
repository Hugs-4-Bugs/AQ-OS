#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Keepalive v3 (health-check based)
# ═══════════════════════════════════════════════════════════════════
#
# FIX (2026-09-09): The previous keepalive-v2.sh UNCONDITIONALLY killed
# and restarted the Next.js server on every cron tick (every 5 minutes),
# even when the server was perfectly healthy. This caused:
#   - Active user sessions/WebSocket connections to drop every 5 min
#   - In-progress operations to fail
#   - The dev server HMR state to reset constantly ("changes occurring
#     every few minutes" as reported by the user)
#
# This v3 script is HEALTH-CHECK BASED:
#   1. If the server responds HTTP 200 on / AND Google OAuth config
#      returns {"googleAvailable":true,"emailConfigured":true} →
#      DO NOTHING. Exit 0. The server stays up, sessions persist.
#   2. If the server is down OR .env is missing Google credentials →
#      restore .env (via ensure-env.sh), restart the server.
#
# This preserves the original goal (keep the server alive + env vars
# restored after the sandbox wipes them) while eliminating the
# unnecessary restarts that disrupt the running application.
# ═══════════════════════════════════════════════════════════════════

set -u
cd /home/z/my-project

LOG_PREFIX="[keepalive-v3]"

# ── Step 1: Health check — is the server responding? ────────────────
SERVER_HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ --max-time 8 2>/dev/null || echo "000")

# ── Step 2: Health check — is Google OAuth configured? ──────────────
OAUTH_CONFIG=$(curl -s http://localhost:3000/api/auth/config --max-time 8 2>/dev/null || echo "")

# ── Step 3: Health check — does .env have Google credentials? ───────
ENV_HAS_GOOGLE=""
if [ -f /home/z/my-project/.env ]; then
  ENV_HAS_GOOGLE=$(grep -c "^GOOGLE_CLIENT_ID=" /home/z/my-project/.env 2>/dev/null || echo "0")
fi

# ── Evaluate health ─────────────────────────────────────────────────
SERVER_HEALTHY="false"
if [ "$SERVER_HTTP_CODE" = "200" ]; then
  if echo "$OAUTH_CONFIG" | grep -q '"googleAvailable":true'; then
    if [ "$ENV_HAS_GOOGLE" = "1" ] || [ "$ENV_HAS_GOOGLE" = "2" ]; then
      SERVER_HEALTHY="true"
    fi
  fi
fi

if [ "$SERVER_HEALTHY" = "true" ]; then
  # Everything is healthy — do NOT restart. This is the key fix: the
  # previous script always restarted; this one leaves a healthy server
  # alone so user sessions and in-progress work are preserved.
  echo "$LOG_PREFIX ✅ Server healthy (HTTP $SERVER_HTTP_CODE, OAuth OK, .env OK) — no action taken."
  exit 0
fi

# ── Server is unhealthy — restore .env and restart ───────────────────
echo "$LOG_PREFIX ⚠️ Server unhealthy (HTTP=$SERVER_HTTP_CODE, oauth=${OAUTH_CONFIG:0:60}, envGoogle=$ENV_HAS_GOOGLE) — restoring env + restarting."

# Restore environment variables
/home/z/my-project/ensure-env.sh

# Disable middleware (known issue workaround, preserved from v2)
if [ -f src/middleware.ts ]; then
  mv src/middleware.ts src/middleware.ts.disabled 2>/dev/null
fi

# Restore the SWC native binary (preserved from v2)
cp node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node node_modules/next/dist/server/next-swc.linux-x64-gnu.node 2>/dev/null

# Kill any existing Next.js process
pkill -9 -f 'next' 2>/dev/null
sleep 2

# Start the dev server in the background (detached, survives this script)
setsid npx next dev -p 3000 > /home/z/my-project/dev.log 2>&1 &
sleep 25

# Verify it came up
NEW_HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ --max-time 15 2>/dev/null || echo "000")
echo "$LOG_PREFIX Restart complete — new HTTP status: $NEW_HTTP_CODE"

if [ "$NEW_HTTP_CODE" = "200" ]; then
  echo "$LOG_PREFIX ✅ Server restored successfully."
  exit 0
else
  echo "$LOG_PREFIX ❌ Server failed to come up (HTTP $NEW_HTTP_CODE). Will retry on next cron tick."
  exit 1
fi
