#!/bin/bash
cd /home/z/my-project/mini-services/realtime-service
while true; do
  bun index.ts
  echo "[RESTART] Service died, restarting in 2s..."
  sleep 2
done
