#!/bin/bash
cd /home/z/my-project

while true; do
  echo "[$(date)] Starting Next.js production server..."
  NODE_OPTIONS="--max-old-space-size=2048" npx next start -p 3000 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE. Restarting in 2 seconds..."
  sleep 2
done
