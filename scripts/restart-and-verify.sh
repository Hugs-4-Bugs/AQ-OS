#!/bin/bash
# Restart dev server via double-fork daemonization (documented working pattern)
# then verify the origin fixes took effect. Single tool-call safe.
cd /home/z/my-project
NEWDOMAIN='preview-chat-9531f1e0-3d55-4ec1-ac52-7d94f71953ed.space-z.ai'

echo "=== 1. Stop current dev server (port 3000) ==="
PID=$(ss -ltnp 2>/dev/null | grep ':3000' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
if [ -n "$PID" ]; then echo "killing pid=$PID"; kill "$PID" 2>/dev/null; sleep 3; kill -9 "$PID" 2>/dev/null; else echo "no listener found"; fi
sleep 1
ss -ltn 2>/dev/null | grep ':3000' && echo "PORT STILL BUSY" || echo "port 3000 free"

echo; echo "=== 2. Double-fork start (reparent to PID 1 during this call) ==="
python3 - "$NEWDOMAIN" <<'PY'
import os, sys
domain = sys.argv[1]
log = open('/home/z/my-project/dev-restart.log', 'ab', 0)
if os.fork() > 0:
    os._exit(0)          # parent exits -> child adopted by init mid-call
os.setsid()              # new session, detach from controlling terminal
if os.fork() > 0:
    os._exit(0)          # second fork -> grandchild reparented to PID 1
os.chdir('/home/z/my-project')
os.dup2(log.fileno(), 1)
os.dup2(log.fileno(), 2)
os.execvp('bun', ['bun', 'run', 'dev'])
PY
echo "double-fork launched"

echo; echo "=== 3. Poll health (max ~100s) ==="
OK=""
for i in $(seq 1 50); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://localhost:3000/api/health 2>/dev/null)
  if [ "$CODE" = "200" ]; then OK=yes; echo "health 200 after ~$((i*2))s"; break; fi
  sleep 2
done
[ -z "$OK" ] && { echo "HEALTH FAILED — last dev-restart.log lines:"; tail -15 dev-restart.log; exit 1; }

echo; echo "=== 4. Verify origin fixes ==="
echo "--- 4a. /api/auth/config ---"
curl -s http://localhost:3000/api/auth/config; echo
echo "--- 4b. Headerless Google initiation (fallback origin must be NEW domain) ---"
curl -s -o /dev/null -D - http://localhost:3000/api/auth/google 2>/dev/null | grep -i '^location:' | grep -oE 'redirect_uri=[^&]+' | head -1
echo "--- 4c. Request WITH current-preview Origin (dynamic origin must win) ---"
curl -s -o /dev/null -D - -H "Origin: https://$NEWDOMAIN" http://localhost:3000/api/auth/google 2>/dev/null | grep -i '^location:' | grep -oE 'redirect_uri=[^&]+' | head -1
echo "--- 4d. allowedDevOrigins warning check (request with new-domain Origin) ---"
BEFORE=$(wc -l < dev-restart.log)
curl -s -o /dev/null -H "Origin: https://$NEWDOMAIN" http://localhost:3000/ 2>/dev/null
sleep 1
grep -c "Blocked cross-origin" <(tail -n +$BEFORE dev-restart.log) 2>/dev/null || echo "0 (no new block warnings)"
echo "--- 4e. Password-login regression (documented QA fixture) ---"
JAR=/tmp/restart-check-cookies.txt; rm -f "$JAR"
curl -s -c "$JAR" -o /tmp/rpw.json -w "signin HTTP:%{http_code}\n" -X POST http://localhost:3000/api/auth/signin \
  -H 'Content-Type: application/json' -d '{"email":"preview.verify@acquisitionos.local","password":"PreviewVerify#2026"}'
curl -s -b "$JAR" -o /dev/null -w "me HTTP:%{http_code}\n" http://localhost:3000/api/auth/me
echo "No secrets printed."
