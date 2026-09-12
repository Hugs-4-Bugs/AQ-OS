#!/bin/bash
cd /home/z/my-project

# Start ultra proxy
node /tmp/ultra-proxy.js &
PROXY_PID=$!

while true; do
  echo "[$(date)] Starting custom server..."
  PORT=3001 NODE_OPTIONS="--max-old-space-size=2048" timeout 120 node /home/z/my-project/custom-server.js &
  SERVER_PID=$!
  
  # Wait for server to be ready
  for i in $(seq 1 30); do
    sleep 1
    if curl -s -o /dev/null http://localhost:3001/ 2>/dev/null; then
      echo "[$(date)] Server ready!"
      break
    fi
  done
  
  # Wait for server process to exit
  wait $SERVER_PID 2>/dev/null
  EXIT=$?
  echo "[$(date)] Server exited with code $EXIT"
  
  # Kill any remaining next-server processes
  pkill -f "next-server" 2>/dev/null
  
  sleep 2
done
