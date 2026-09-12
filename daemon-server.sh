#!/bin/bash
cd /home/z/my-project
while true; do
  echo "$(date): Starting server..." >> /home/z/my-project/daemon.log
  node .next/standalone/server.js >> /home/z/my-project/server.log 2>&1
  EXIT_CODE=$?
  echo "$(date): Server exited with code $EXIT_CODE, restarting in 3s..." >> /home/z/my-project/daemon.log
  sleep 3
done
