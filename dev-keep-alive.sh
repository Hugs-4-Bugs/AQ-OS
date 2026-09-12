#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting Next.js dev server..."
  NODE_OPTIONS="--max-old-space-size=1024" npx next dev -p 3000 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE. Restarting in 5 seconds..."
  sleep 5
  rm -rf .next 2>/dev/null
done
