#!/bin/bash
# Daemonized Phase 22 E2E run — launched via double-fork wrapper so it
# survives tool-call boundaries (same pattern as e2e-phase21-run.sh).
# Usage: scripts/e2e-phase22-run.sh main|verify|cleanup
cd /home/z/my-project
PHASE="${1:-main}"
echo "$$" > /tmp/e2e-p22.pid
{
  echo "[e2e-p22:$PHASE] started $(date -u +%FT%TZ) pid=$$"
  node scripts/e2e-phase22.cjs "$PHASE" 2>&1
  echo "EXIT=$?" > /tmp/e2e-p22-$PHASE.status
  echo "[e2e-p22:$PHASE] finished $(date -u +%FT%TZ)"
} > /home/z/my-project/e2e-phase22-$PHASE.log 2>&1
