#!/bin/bash
# Daemonized full vitest regression run — launched via double-fork wrapper.
cd /home/z/my-project
echo "$$" > /tmp/vitest.pid
{
  echo "[vitest] full suite started $(date -u +%FT%TZ) pid=$$"
  NODE_OPTIONS="--max-old-space-size=1536" npx vitest run 2>&1
  echo "EXIT=$?" > /tmp/vitest.status
  echo "[vitest] finished $(date -u +%FT%TZ)"
} > /home/z/my-project/vitest-full.log 2>&1
