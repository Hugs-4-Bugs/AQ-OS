#!/bin/bash
while true; do
  cd /home/z/my-project
  echo "[$(date)] Building Next.js production build (384MB for build)..." >> /home/z/my-project/server-restarts.log
  NODE_OPTIONS='--max-old-space-size=384' NODE_ENV=production npx next build >> /home/z/my-project/dev.log 2>&1
  BUILD_EXIT=$?
  if [ $BUILD_EXIT -ne 0 ]; then
    echo "[$(date)] Build failed with code $BUILD_EXIT" >> /home/z/my-project/server-restarts.log
    sleep 30
    continue
  fi
  echo "[$(date)] Build succeeded. Starting production server..." >> /home/z/my-project/server-restarts.log
  NODE_OPTIONS='--max-old-space-size=256' NODE_ENV=production node node_modules/.bin/next start -p 3000 >> /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE" >> /home/z/my-project/server-restarts.log
  sleep 5
done
