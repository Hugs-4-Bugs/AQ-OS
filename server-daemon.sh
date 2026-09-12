#!/bin/bash
cd /home/z/my-project
LOG="/tmp/server-daemon.log"

while true; do
    # Check if Next.js is responding
    if ! curl -s -o /dev/null -w '' http://127.0.0.1:3000/ 2>/dev/null; then
        echo "[$(date)] Server not responding, restarting..." >> "$LOG"
        
        # Kill any stale processes
        pkill -f 'next-server' 2>/dev/null
        pkill -f 'next start' 2>/dev/null
        pkill -f 'next dev' 2>/dev/null
        sleep 2
        
        # Ensure build exists
        if [ ! -d ".next" ] || [ ! -f ".next/BUILD_ID" ]; then
            echo "[$(date)] No build found, rebuilding..." >> "$LOG"
            npx next build >> "$LOG" 2>&1
        fi
        
        # Start server
        echo "[$(date)] Starting production server..." >> "$LOG"
        env NODE_ENV=production npx next start -p 3000 >> "$LOG" 2>&1 &
        sleep 8
    fi
    sleep 5
done
