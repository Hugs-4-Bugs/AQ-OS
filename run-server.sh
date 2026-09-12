#!/bin/bash
while true; do
  npx next dev -p 3000 2>&1 | tee dev.log
  echo "Server exited, restarting in 3s..."
  sleep 3
done
