#!/bin/bash
# Watchdog script: keeps the Next.js dev server running.
# Restarts automatically if the process dies.
cd /home/z/my-project

while true; do
  echo "[watchdog] $(date '+%H:%M:%S') Starting bun run dev..."
  bun run dev >> /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[watchdog] $(date '+%H:%M:%S') Process exited with code $EXIT_CODE. Restarting in 3s..."
  sleep 3
done
