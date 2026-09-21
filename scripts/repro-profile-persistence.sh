#!/usr/bin/env bash
# REPRODUCTION: Profile persistence across save → reload → new session (Issue 2).
# Uses real Account A (kattyboy785@gmail.com) via dev OTP flow (read OTP from DB).
set -u
BASE="http://localhost:3000"
EMAIL="kattyboy785@gmail.com"
JAR=/home/z/my-project/scripts/.repro-profile-cookies.txt
rm -f "$JAR"

echo "════ 1. Request OTP ════"
curl -s -c "$JAR" -X POST "$BASE/api/auth/otp/request" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}" | head -c 200
echo; echo

echo "════ 2. Read OTP from DB (dev) ════"
OTP=$(python3 -c "
import sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
row = con.execute(\"SELECT loginOtp FROM User WHERE email=?\", ('$EMAIL',)).fetchone()
print(row[0] if row and row[0] else 'NOT_FOUND')
")
echo "OTP=$OTP"
[ "$OTP" = "NOT_FOUND" ] && { echo "no OTP — abort"; exit 1; }

echo "════ 3. Verify OTP → session ════"
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/otp/verify" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP\"}" | head -c 150
echo; echo

echo "════ 4. GET profile (baseline) ════"
curl -s -b "$JAR" "$BASE/api/settings/profile" | head -c 400
echo; echo

STAMP=$(date +%s)
echo "════ 5. PUT profile (save) — name/phone/country/company=$STAMP-Corp ════"
curl -s -b "$JAR" -X PUT "$BASE/api/settings/profile" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Prabhat Kumar\",\"phone\":\"+91 90000 $STAMP\",\"country\":\"India\",\"company\":\"$STAMP-Corp\"}" \
  -w "\nHTTP=%{http_code}" | head -c 500
echo; echo

echo "════ 6. GET profile (immediately after save — same session) ════"
curl -s -b "$JAR" "$BASE/api/settings/profile" | head -c 400
echo; echo

echo "════ 7. Fresh session (logout → login simulation) ════"
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/signout" > /dev/null
rm -f "$JAR"
curl -s -c "$JAR" -X POST "$BASE/api/auth/otp/request" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}" > /dev/null
OTP2=$(python3 -c "
import sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
row = con.execute(\"SELECT loginOtp FROM User WHERE email=?\", ('$EMAIL',)).fetchone()
print(row[0] if row and row[0] else 'NOT_FOUND')
")
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/otp/verify" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP2\"}" > /dev/null

echo "════ 8. GET profile (NEW session — did it persist?) ════"
curl -s -b "$JAR" "$BASE/api/settings/profile" | head -c 400
echo; echo

echo "════ 9. DB ground truth ════"
node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.user.findUnique({ where: { email: '$EMAIL' }, select: { id:true, name:true, phone:true, country:true, company:true, settings:{ select:{ companyName:true } } } })
  .then(u => { console.log(JSON.stringify(u, null, 1)); return db.\$disconnect(); });
"
