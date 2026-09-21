#!/usr/bin/env bash
# Focused re-run of Test B6 — Account B symmetric profile persistence,
# with generous pacing for the OTP rate limiter.
set -u
BASE="http://localhost:3000"
JB=/home/z/my-project/scripts/.t-e.txt
EB="mailtoprabhat72@gmail.com"

login() { # $1=email $2=jar
  rm -f "$2"
  local ATTEMPTS=0
  while [ $ATTEMPTS -lt 6 ]; do
    ATTEMPTS=$((ATTEMPTS+1))
    RESP=$(curl -s -c "$2" -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d "{\"email\":\"$1\"}")
    if echo "$RESP" | rg -q "Rate limit exceeded"; then echo "  (otp rate-limited, wait 20s: attempt $ATTEMPTS)"; sleep 20; continue; fi
    local OTP=$(python3 -c "
import sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
row = con.execute(\"SELECT loginOtp FROM User WHERE email=?\", ('$1',)).fetchone()
print(row[0] if row and row[0] else 'NOT_FOUND')")
    curl -s -b "$2" -c "$2" -X POST "$BASE/api/auth/otp/verify" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"otp\":\"$OTP\"}" > /dev/null
    local ME=$(curl -s -b "$2" "$BASE/api/auth/me" | python3 -c "import json,sys
try: print(json.load(sys.stdin)['user']['email'])
except Exception: print('')" 2>/dev/null)
    [ "$ME" = "$1" ] && { echo "  (logged in as $ME)"; return 0; }
    sleep 20
  done
  return 1
}

login "$EB" "$JB" || { echo "LOGIN FAILED"; exit 1; }
STAMP=$(date +%s)
curl -s -b "$JB" -X PUT "$BASE/api/settings/profile" -H 'Content-Type: application/json' \
  -d "{\"company\":\"BLtd-$STAMP\",\"country\":\"Singapore\"}" > /dev/null
# logout → login
curl -s -b "$JB" -c "$JB" -X POST "$BASE/api/auth/signout" > /dev/null; rm -f "$JB"
sleep 3
login "$EB" "$JB" || { echo "RELOGIN FAILED"; exit 1; }
RES=$(curl -s -b "$JB" "$BASE/api/settings/profile" | python3 -c "import json,sys
d=json.load(sys.stdin)['profile']
print(d['company'] + ' | ' + d['country'])")
echo "B-profile after logout→login: $RES"
if echo "$RES" | rg -q "BLtd-$STAMP" && echo "$RES" | rg -q "Singapore"; then
  echo "✓ PASS: Test B6 — Account B symmetric profile persistence"
else
  echo "✗ FAIL: Test B6"
  exit 1
fi
