#!/usr/bin/env bash
# B-side verification (rate-limit aware)
set -u
BASE="http://localhost:3000"
JB=/home/z/my-project/scripts/.verify-b2.txt
EB="mailtoprabhat72@gmail.com"
LEAD_A="cmqme6hgj0023rc2j1d2dhukv"
LEAD_B="cmtsrc65f000jnpmcwjsum91n"
PASS=0; FAIL=0
check() { if [ "$2" -eq 0 ]; then echo "  ✓ PASS: $1"; PASS=$((PASS+1)); else echo "  ✗ FAIL: $1"; FAIL=$((FAIL+1)); fi; }

echo "════ B login ════"
rm -f "$JB"
curl -s -c "$JB" -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d "{\"email\":\"$EB\"}" > /dev/null
sleep 2
OTP=$(node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.user.findUnique({ where: { email: '$EB' }, select: { loginOtp: true } }).then(u => { console.log(u.loginOtp); return db.\$disconnect(); });")
R=$(curl -s -b "$JB" -c "$JB" -X POST "$BASE/api/auth/otp/verify" -H 'Content-Type: application/json' -d "{\"email\":\"$EB\",\"otp\":\"$OTP\"}")
echo "$R" | head -c 100; echo

echo "════ D — B isolation checks ════"
CODE_B_TO_A=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" "$BASE/api/leads/$LEAD_A")
check "B reading A's lead → denied ($CODE_B_TO_A)" $([ "$CODE_B_TO_A" = "403" ] || [ "$CODE_B_TO_A" = "404" ] && echo 0 || echo 1)
CODE_B_TO_B=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" "$BASE/api/leads/$LEAD_B")
check "B reading own lead → 200 ($CODE_B_TO_B)" $([ "$CODE_B_TO_B" = "200" ] && echo 0 || echo 1)
CODE_PUT=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X PUT "$BASE/api/leads/$LEAD_A" -H 'Content-Type: application/json' -d '{"notes":"HACKED"}')
check "B updating A's lead → denied ($CODE_PUT)" $([ "$CODE_PUT" = "403" ] || [ "$CODE_PUT" = "404" ] && echo 0 || echo 1)
CODE_DEL=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X DELETE "$BASE/api/leads/$LEAD_A")
check "B deleting A's lead → denied ($CODE_DEL)" $([ "$CODE_DEL" = "403" ] || [ "$CODE_DEL" = "404" ] && echo 0 || echo 1)
for sub in activities communications notes reminders; do
  CODE_SUB=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" "$BASE/api/leads/$LEAD_A/$sub")
  check "B GET A's lead/$sub → denied ($CODE_SUB)" $([ "$CODE_SUB" = "403" ] || [ "$CODE_SUB" = "404" ] && echo 0 || echo 1)
done
# notes WRITE idor
CODE_WNOTE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X POST "$BASE/api/leads/$LEAD_A/notes" -H 'Content-Type: application/json' -d '{"content":"x"}')
check "B POST note on A's lead → denied ($CODE_WNOTE)" $([ "$CODE_WNOTE" = "403" ] || [ "$CODE_WNOTE" = "404" ] && echo 0 || echo 1)
# B list contains own lead only
check "B list contains own lead" $(curl -s -b "$JB" "$BASE/api/leads?limit=200" | rg -q "$LEAD_B" && echo 0 || echo 1)
check "B list does NOT contain A's lead" $(curl -s -b "$JB" "$BASE/api/leads?limit=200" | rg -q "$LEAD_A" && echo 1 || echo 0)
# B notifications work
NB=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" "$BASE/api/notifications?limit=5")
check "B notifications → 200 ($NB)" $([ "$NB" = "200" ] && echo 0 || echo 1)

echo "════ E — pipeline on OWN lead ════"
CODE_FOR=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X POST "$BASE/api/prospecting/pipeline/run" -H 'Content-Type: application/json' -d "{\"leadId\":\"$LEAD_B\"}")
check "B pipeline OWN lead → accepted ($CODE_FOR)" $([ "$CODE_FOR" = "200" ] && echo 0 || echo 1)
CODE_X=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X POST "$BASE/api/prospecting/pipeline/run" -H 'Content-Type: application/json' -d "{\"leadId\":\"$LEAD_A\"}")
check "B pipeline on A's lead → denied ($CODE_X)" $([ "$CODE_X" = "403" ] || [ "$CODE_X" = "404" ] || [ "$CODE_X" = "400" ] && echo 0 || echo 1)

echo "════ F — B credits ════"
CRB=$(curl -s -b "$JB" "$BASE/api/credits" | head -c 120)
echo "  B credits: $CRB"
check "B credits returns balance" $(echo "$CRB" | rg -q "credits|balance" && echo 0 || echo 1)

echo
echo "════ B-SIDE RESULTS: PASS=$PASS FAIL=$FAIL ════"
