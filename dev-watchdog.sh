#!/bin/bash
# Dev server watchdog - restarts Next.js when it gets OOM killed
cd /home/z/my-project

PORT=3000
MAX_RESTARTS=100
RESTART_COUNT=0

echo "[watchdog] Starting Next.js dev server watchdog on port $PORT..."

while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
  # Kill any existing server processes
  fuser -k $PORT/tcp 2>/dev/null
  pkill -9 -f "next-server" 2>/dev/null
  pkill -9 -f "next dev" 2>/dev/null
  sleep 2

  # Start the server  
  NODE_OPTIONS="--max-old-space-size=768" node_modules/.bin/next dev -p $PORT --webpack &> /tmp/next-dev.log &
  
  RESTART_COUNT=$((RESTART_COUNT + 1))
  echo "[watchdog] #${RESTART_COUNT}: Server started"

  # Wait for server to be ready (max 90s)
  READY=0
  for i in $(seq 1 90); do
    HTTP_CODE=$(curl -s --connect-timeout 2 -o /dev/null -w "%{http_code}" http://localhost:$PORT/ 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "401" ]; then
      READY=1
      echo "[watchdog] Server ready after ${i}s (HTTP $HTTP_CODE)"
      break
    fi
    sleep 1
  done

  if [ $READY -eq 0 ]; then
    echo "[watchdog] Server failed to start. Restarting in 5s..."
    sleep 5
    continue
  fi

  # Monitor - check every 5s if server responds with valid HTTP
  FAIL_COUNT=0
  while true; do
    sleep 5
    HTTP_CODE=$(curl -s --connect-timeout 2 -o /dev/null -w "%{http_code}" http://localhost:$PORT/ 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "401" ]; then
      FAIL_COUNT=0
    else
      FAIL_COUNT=$((FAIL_COUNT + 1))
      echo "[watchdog] Server check failed (HTTP=$HTTP_CODE, fails=$FAIL_COUNT)"
      if [ $FAIL_COUNT -ge 2 ]; then
        echo "[watchdog] Server died. Restarting in 3s..."
        sleep 3
        break
      fi
    fi
  done
done

echo "[watchdog] Max restarts reached. Exiting."
