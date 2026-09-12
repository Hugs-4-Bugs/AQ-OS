#!/bin/bash
cd /home/z/my-project

# Kill any existing server
pkill -f "next" 2>/dev/null
sleep 2

# Remove stale cache
rm -rf .next 2>/dev/null

# Start with auto-restart
while true; do
  echo "[$(date)] Starting Next.js server..."
  NODE_OPTIONS="--max-old-space-size=2048" npx next start -p 3000 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE. Restarting in 3 seconds..."
  sleep 3
done
