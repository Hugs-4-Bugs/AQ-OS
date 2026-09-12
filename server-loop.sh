#!/bin/bash
# AcquisitionOS Permanent Server Loop
# This script MUST run in foreground to survive sandbox cleanup.
# It automatically restarts Next.js if it crashes or gets killed.
# Exit: Never (loops forever)

cd /home/z/my-project

while true; do
  # Check if production build exists
  if [ ! -f ".next/BUILD_ID" ]; then
    echo "$(date '+%H:%M:%S'): No build found, rebuilding..."
    NODE_ENV=production bun run build > /tmp/rebuild.log 2>&1
  fi

  # Kill any stale processes
  pkill -f "next" 2>/dev/null || true
  sleep 1

  echo "$(date '+%H:%M:%S'): Starting production server on port 3000..."
  NODE_ENV=production npx next start -p 3000 >> /tmp/next-prod.log 2>&1
  EXIT_CODE=$?

  echo "$(date '+%H:%M:%S'): Server exited (code=$EXIT_CODE), restarting in 2s..."
  sleep 2
done
