#!/bin/bash
while true; do
    echo "[$(date)] Starting Next.js dev server..."
    cd /home/z/my-project
    npx next dev -p 3000 2>&1 | tee -a /home/z/my-project/dev.log
    EXIT_CODE=$?
    echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 5s..."
    sleep 5
done
