#!/bin/bash
# Persistent Next.js dev server
# Traps signals and restarts if needed
trap '' SIGHUP SIGTERM SIGINT
cd /home/z/my-project
export PORT=3000
export HOSTNAME=0.0.0.0

while true; do
  echo "[$(date)] Starting Next.js dev server..." >> /home/z/my-project/server-persistent.log
  npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 3s..." >> /home/z/my-project/server-persistent.log
  sleep 3
done
