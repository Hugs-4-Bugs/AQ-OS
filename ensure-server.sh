#!/bin/bash
cd /home/z/my-project
pkill -f 'next-server' 2>/dev/null
pkill -f 'next start' 2>/dev/null
sleep 2

if [ ! -f .next/BUILD_ID ]; then
    echo "[$(date)] Rebuilding..." >> /tmp/server-daemon.log
    npx next build >> /tmp/server-daemon.log 2>&1
fi

# Start daemon if not running
if ! pgrep -f 'server-daemon.sh' > /dev/null; then
    nohup /home/z/my-project/server-daemon.sh >> /tmp/server-daemon.log 2>&1 &
    disown
fi

sleep 12
curl -s -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:3000/
