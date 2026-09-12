#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting Next.js..."
  PORT=3001 NODE_OPTIONS="--max-old-space-size=2048" node node_modules/.bin/next start -p 3001
  echo "[$(date)] Server exited. Restarting in 2s..."
  sleep 2
done
