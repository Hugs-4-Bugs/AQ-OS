#!/bin/bash
trap '' SIGHUP SIGTERM SIGINT
cd /home/z/my-project
export NODE_ENV=production
export PORT=3000
export HOSTNAME=0.0.0.0
exec node .next/standalone/server.js
