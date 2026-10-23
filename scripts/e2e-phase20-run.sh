#!/bin/bash
# Daemonized Phase 20 E2E run — launched via double-fork wrapper.
cd /home/z/my-project
echo "$$" > /tmp/e2e-p20.pid
{
  echo "[e2e-p20] started $(date -u +%FT%TZ) pid=$$"
  node scripts/e2e-phase20.cjs 2>&1
  echo "EXIT=$?" > /tmp/e2e-p20.status
  echo "[e2e-p20] finished $(date -u +%FT%TZ)"
} > /home/z/my-project/e2e-phase20.log 2>&1
