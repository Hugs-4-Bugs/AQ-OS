#!/usr/bin/env bash
# REPRODUCTION: login as the preview account with real leads, run AI pipeline + workflow.
set -u
BASE="http://localhost:3000"
EMAIL="preview.verify@acquisitionos.local"
JAR=/home/z/my-project/scripts/.repro-cookies.txt
rm -f "$JAR"

echo "════ 1. Request OTP ════"
curl -s -c "$JAR" -X POST "$BASE/api/auth/otp/request" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}" | head -c 400
echo; echo

echo "════ 2. Read OTP from DB (dev) ════"
OTP=$(python3 -c "
import sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
row = con.execute(\"SELECT loginOtp, loginOtpExpiry FROM User WHERE email=?\", ('$EMAIL',)).fetchone()
print(row[0] if row and row[0] else 'NOT_FOUND')
")
echo "OTP=$OTP"
[ "$OTP" = "NOT_FOUND" ] && { echo "no OTP — abort"; exit 1; }

echo "════ 3. Verify OTP → session ════"
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/otp/verify" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP\"}" | head -c 500
echo; echo

echo "════ 4. Who am I ════"
curl -s -b "$JAR" "$BASE/api/auth/me" | head -c 400
echo; echo

echo "════ 5. GET /api/leads (list) ════"
curl -s -b "$JAR" "$BASE/api/leads?limit=5" > /home/z/my-project/scripts/.repro-leads.json
python3 -c "
import json
d = json.load(open('/home/z/my-project/scripts/.repro-leads.json'))
leads = d.get('leads', [])
print('total:', d.get('pagination', {}).get('total'))
for l in leads[:5]:
    print(l['id'], '|', l.get('businessName'), '| active:', l.get('isActive'))
"
