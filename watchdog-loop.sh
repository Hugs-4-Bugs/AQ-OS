#!/bin/bash
# AcquisitionOS Ultra-Fast Watchdog
# Checks every 3 seconds, restarts within 15 seconds total
# Designed to survive sandbox process kills

LOGFILE="/tmp/watchdog-loop.log"
PROJECT_DIR="/home/z/my-project"
NEXT_PORT=3000
CHECK_INTERVAL=3
MAX_RESTART_TIME=15

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') [watchdog] $1" >> "$LOGFILE"
}

# Ensure build exists before starting
ensure_build() {
  if [ ! -f "$PROJECT_DIR/.next/BUILD_ID" ]; then
    log "No production build found. Rebuilding..."
    cd "$PROJECT_DIR" && NODE_ENV=production bun run build >> "$LOGFILE" 2>&1
    if [ ! -f "$PROJECT_DIR/.next/BUILD_ID" ]; then
      log "FATAL: Build failed!"
      return 1
    fi
    log "Build completed successfully."
  fi
  return 0
}

# Start Next.js server
start_server() {
  # Kill any existing processes first
  pkill -f "next start" 2>/dev/null || true
  sleep 1
  
  cd "$PROJECT_DIR" && setsid env NODE_ENV=production npx next start -p $NEXT_PORT > /tmp/next-prod.log 2>&1 &
  local pid=$!
  log "Started Next.js server (PID: $pid)"
  
  # Wait for server to become ready (up to 15 seconds)
  local elapsed=0
  while [ $elapsed -lt $MAX_RESTART_TIME ]; do
    if curl -s -o /dev/null -w '' http://localhost:$NEXT_PORT/ 2>/dev/null; then
      log "Server is ready after ${elapsed}s"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  
  log "WARNING: Server did not respond within ${MAX_RESTART_TIME}s, but process may still be starting"
  return 0
}

# Main watchdog loop
main() {
  log "=== Watchdog started (PID: $$) ==="
  log "Check interval: ${CHECK_INTERVAL}s | Port: ${NEXT_PORT}"
  
  local fail_count=0
  local last_restart=0
  local now
  
  while true; do
    now=$(date +%s)
    
    # Check if server is responding
    if curl -s -o /dev/null -w '' http://localhost:$NEXT_PORT/ 2>/dev/null; then
      if [ $fail_count -gt 0 ]; then
        log "Server recovered (was failing for $fail_count checks)"
      fi
      fail_count=0
    else
      fail_count=$((fail_count + 1))
      
      # Don't restart too frequently (min 20s between restarts)
      local time_since_restart=$((now - last_restart))
      if [ $fail_count -ge 2 ] && [ $time_since_restart -ge 20 ]; then
        log "Server down for $fail_count consecutive checks. Restarting..."
        ensure_build && start_server
        last_restart=$now
        fail_count=0
        
        # Brief pause after restart to let it stabilize
        sleep 5
      elif [ $fail_count -eq 1 ]; then
        log "Server may be down (1st failure), will check again..."
      fi
    fi
    
    sleep $CHECK_INTERVAL
  done
}

main
