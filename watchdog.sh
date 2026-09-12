#!/bin/bash
# AcquisitionOS Aggressive Watchdog
# Checks every 10 seconds and restarts within 2 seconds of failure
# This script NEVER exits - it loops forever

LOG="/tmp/watchdog.log"
STARTUP_DELAY=8
CHECK_INTERVAL=10

log() {
  echo "[$(date '+%H:%M:%S')] $1" >> "$LOG"
}

log "=== WATCHDOG STARTED ==="

# Kill any existing next processes
pkill -f "next" 2>/dev/null || true
sleep 2

while true; do
  # Check if server responds
  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/ 2>/dev/null)
  
  if [ "$HTTP_CODE" = "000" ] || [ "$HTTP_CODE" = "502" ] || [ -z "$HTTP_CODE" ]; then
    log "Server DOWN (HTTP $HTTP_CODE). Restarting..."
    
    # Kill stale processes
    pkill -f "next start" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    sleep 1
    
    # Start production server
    cd /home/z/my-project
    nohup npx next start -p 3000 > /tmp/next-prod.log 2>&1 &
    
    log "Started next start PID=$!. Waiting ${STARTUP_DELAY}s..."
    sleep "$STARTUP_DELAY"
    
    # Verify it came up
    HTTP_CODE2=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/ 2>/dev/null)
    if [ "$HTTP_CODE2" != "000" ] && [ -n "$HTTP_CODE2" ]; then
      log "Server UP (HTTP $HTTP_CODE2)"
    else
      log "Server still DOWN after restart. Will retry in ${CHECK_INTERVAL}s"
    fi
  fi
  
  sleep "$CHECK_INTERVAL"
done
