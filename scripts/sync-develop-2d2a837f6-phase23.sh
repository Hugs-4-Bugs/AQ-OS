#!/usr/bin/env bash
# Sync workspace to GitHub develop @ 2d2a837f614d0464bcf6ef1da666e79bb893b786 (Phase 23 baseline).
# SAFE approach: reset --mixed (HEAD+index only) + checkout HEAD -- . (working tree update for develop-tracked paths only).
# .env, db/custom.db, upload/ untracked files, node_modules, server.pid, dev.log all PRESERVED.
# No DB migrate, no db:push, no reset, no reseed, no truncate. No git push.
set -uo pipefail

TARGET_SHA="2d2a837f614d0464bcf6ef1da666e79bb893b786"
cd /home/z/my-project

echo "============================================================"
echo "STEP 1.7: Stop running dev server (no DB impact)"
echo "============================================================"
DEV_PID=$(ss -tlnp 2>/dev/null | grep ':3000' | grep -oP 'pid=\K[0-9]+' | head -1)
if [ -n "$DEV_PID" ]; then
  echo "  Found dev server PID=$DEV_PID on port 3000. Stopping..."
  kill "$DEV_PID" 2>/dev/null || true
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if ! ss -tlnp 2>/dev/null | grep -q ':3000'; then
      echo "  Port 3000 freed after ${i}s."
      break
    fi
    sleep 1
  done
  if ss -tlnp 2>/dev/null | grep -q ':3000'; then
    pkill -9 -f 'next-server' 2>/dev/null || true
    pkill -9 -f 'next/dist/bin/next' 2>/dev/null || true
    pkill -9 -f 'bun --hot' 2>/dev/null || true
    sleep 3
  fi
else
  echo "  No dev server on port 3000."
fi

echo ""
echo "============================================================"
echo "STEP 1.8: git reset --mixed $TARGET_SHA (HEAD+index only, working tree preserved)"
echo "============================================================"
git reset --mixed "$TARGET_SHA" 2>&1 | tail -5
NEW_HEAD=$(git rev-parse HEAD)
echo "  HEAD now = $NEW_HEAD"

echo ""
echo "============================================================"
echo "STEP 1.9: git checkout HEAD -- . (update develop-tracked paths in working tree)"
echo "============================================================"
git checkout HEAD -- . 2>&1 | tail -5
echo "  Working tree updated for develop-tracked paths."

echo ""
echo "============================================================"
echo "STEP 1.10: Post-sync preservation verification"
echo "============================================================"
POST_ENV_SHA=$(sha256sum .env | awk '{print $1}')
POST_DB_SHA=$(sha256sum db/custom.db | awk '{print $1}')
POST_UPLOAD_COUNT=$(find upload -type f 2>/dev/null | wc -l)
echo "  .env sha256:       $POST_ENV_SHA"
echo "  db/custom.db sha:  $POST_DB_SHA"
echo "  upload/ file cnt:  $POST_UPLOAD_COUNT"

echo ""
echo "============================================================"
echo "STEP 1.11: Verify HEAD == develop target"
echo "============================================================"
if [ "$NEW_HEAD" = "$TARGET_SHA" ]; then
  echo "  HEAD MATCHES target SHA: $NEW_HEAD"
else
  echo "  !!! HEAD MISMATCH: HEAD=$NEW_HEAD, target=$TARGET_SHA"
fi

echo ""
echo "============================================================"
echo "STEP 1.12: Verify Phase 23 code present in working tree"
echo "============================================================"
echo "  getUserEntitlements exported:"
grep -c "export async function getUserEntitlements" src/lib/entitlement-service.ts 2>&1
echo "  isAutopilotPlanEligible exported:"
grep -c "export function isAutopilotPlanEligible" src/lib/entitlement-service.ts 2>&1
echo "  scheduler-runner skippedIneligible counter:"
grep -c "skippedIneligible" src/lib/autopilot/scheduler-runner.ts 2>&1
echo "  Phase 23 test files present:"
ls tests/unit/autopilot-entitlements.test.ts tests/unit/autopilot-entitlements-runner.test.ts 2>&1 | head -3

echo ""
echo "SYNC SCRIPT COMPLETE — workspace now at Phase 23 baseline."
