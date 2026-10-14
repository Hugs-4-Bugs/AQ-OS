#!/bin/bash
# Daemonized production build launcher — run via double-fork wrapper.
cd /home/z/my-project
echo "$$" > /tmp/build.pid
{
  echo "[build] started $(date -u +%FT%TZ) pid=$$"
  NODE_OPTIONS="--max-old-space-size=2048" bun run build
  echo "EXIT=$?" > /tmp/build.status
  echo "[build] finished $(date -u +%FT%TZ) exit=$(cat /tmp/build.status)"
} >> /home/z/my-project/build-prod.log 2>&1
