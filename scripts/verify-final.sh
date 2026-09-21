#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# FINAL VERIFICATION — Issues 1-3 (Tests B, C, D, E, F via API)
# Account A: kattyboy785@gmail.com    Account B: mailtoprabhat72@gmail.com
# ═══════════════════════════════════════════════════════════════════
set -u
BASE="http://localhost:3000"
JA=/home/z/my-project/scripts/.verify-a.txt
JB=/home/z/my-project/scripts/.verify-b.txt
EA="kattyboy785@gmail.com"
EB="mailtoprabhat72@gmail.com"
PASS=0; FAIL=0

login() { # $1=email $2=jar
  rm -f "$2"
  curl -s -c "$2" -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d "{\"email\":\"$1\"}" > /dev/null
  local OTP=$(python3 -c "
import sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
row = con.execute(\"SELECT loginOtp FROM User WHERE email=?\", ('$1',)).fetchone()
print(row[0] if row and row[0] else 'NOT_FOUND')")
  curl -s -b "$2" -c "$2" -X POST "$BASE/api/auth/otp/verify" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"otp\":\"$OTP\"}" > /dev/null
}

check() { # $1=name $2=condition(0=pass)
  if [ "$2" -eq 0 ]; then echo "  ✓ PASS: $1"; PASS=$((PASS+1)); else echo "  ✗ FAIL: $1"; FAIL=$((FAIL+1)); fi
}

echo "════ TEST B — PROFILE PERSISTENCE (Account A) ════"
login "$EA" "$JA"
STAMP=$(date +%s)
# Edit + save
R1=$(curl -s -b "$JA" -X PUT "$BASE/api/settings/profile" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Prabhat Kumar\",\"phone\":\"+91 98000 $STAMP\",\"country\":\"India\",\"company\":\"Verify-$STAMP Corp\"}")
check "save returns 200 payload" $([ -n "$R1" ] && echo 0 || echo 1)
# Same-session read-back
C1=$(curl -s -b "$JA" "$BASE/api/settings/profile" | python3 -c "import json,sys; print(json.load(sys.stdin)['profile']['company'])")
check "company round-trips immediately (got: $C1)" $([ "$C1" = "Verify-$STAMP Corp" ] && echo 0 || echo 1)
# Fresh session (logout → login)
curl -s -b "$JA" -c "$JA" -X POST "$BASE/api/auth/signout" > /dev/null; rm -f "$JA"
login "$EA" "$JA"
P2=$(curl -s -b "$JA" "$BASE/api/settings/profile")
C2=$(echo "$P2" | python3 -c "import json,sys; d=json.load(sys.stdin)['profile']; print(d['company'], '|', d['country'], '|', d['phone'])")
check "company persists after logout→login (got: $C2)" $(echo "$C2" | rg -q "Verify-$STAMP Corp" && echo 0 || echo 1)
check "country persists (got: $C2)" $(echo "$C2" | rg -q "India" && echo 0 || echo 1)
check "phone persists (got: $C2)" $(echo "$C2" | rg -q "$STAMP" && echo 0 || echo 1)
N2=$(echo "$P2" | python3 -c "import json,sys; print(json.load(sys.stdin)['profile']['name'])")
check "name persists (got: $N2)" $([ "$N2" = "Prabhat Kumar" ] && echo 0 || echo 1)

echo
echo "════ TEST C/D — LEAD ISOLATION (backend responses) ════"
login "$EB" "$JB"
LEAD_A="cmqme6hgj0023rc2j1d2dhukv"   # Emaar Properties (A's)
LEAD_B="cmtsrc65f000jnpmcwjsum91n"   # The Bangalore Hospital (B's)

# D1: list isolation
LA_COUNT=$(curl -s -b "$JA" "$BASE/api/leads?limit=200" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('leads',d if isinstance(d,list) else [])))")
LB_COUNT=$(curl -s -b "$JB" "$BASE/api/leads?limit=200" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('leads',d if isinstance(d,list) else [])))")
check "A's list does not contain B's lead" $(curl -s -b "$JA" "$BASE/api/leads?limit=200" | rg -q "$LEAD_B" && echo 1 || echo 0)
check "B's list does not contain A's lead" $(curl -s -b "$JB" "$BASE/api/leads?limit=200" | rg -q "$LEAD_A" && echo 1 || echo 0)

# D2: detail IDOR
CODE_A_TO_B=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" "$BASE/api/leads/$LEAD_B")
CODE_B_TO_A=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" "$BASE/api/leads/$LEAD_A")
CODE_A_TO_A=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" "$BASE/api/leads/$LEAD_A")
CODE_B_TO_B=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" "$BASE/api/leads/$LEAD_B")
check "A reading B's lead → denied ($CODE_A_TO_B)" $([ "$CODE_A_TO_B" = "403" ] || [ "$CODE_A_TO_B" = "404" ] && echo 0 || echo 1)
check "B reading A's lead → denied ($CODE_B_TO_A)" $([ "$CODE_B_TO_A" = "403" ] || [ "$CODE_B_TO_A" = "404" ] && echo 0 || echo 1)
check "A reading own lead → 200 ($CODE_A_TO_A)" $([ "$CODE_A_TO_A" = "200" ] && echo 0 || echo 1)
check "B reading own lead → 200 ($CODE_B_TO_B)" $([ "$CODE_B_TO_B" = "200" ] && echo 0 || echo 1)

# D3: PUT IDOR (B updates A's lead must fail)
CODE_PUT=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X PUT "$BASE/api/leads/$LEAD_A" -H 'Content-Type: application/json' -d '{"notes":"HACKED"}')
check "B updating A's lead → denied ($CODE_PUT)" $([ "$CODE_PUT" = "403" ] || [ "$CODE_PUT" = "404" ] && echo 0 || echo 1)
# D4: DELETE IDOR
CODE_DEL=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X DELETE "$BASE/api/leads/$LEAD_A")
check "B deleting A's lead → denied ($CODE_DEL)" $([ "$CODE_DEL" = "403" ] || [ "$CODE_DEL" = "404" ] && echo 0 || echo 1)
# D5: sub-resource IDOR (activities/communications/notes)
for sub in activities communications notes reminders; do
  CODE_SUB=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" "$BASE/api/leads/$LEAD_A/$sub")
  check "B GET A's lead/$sub → denied ($CODE_SUB)" $([ "$CODE_SUB" = "403" ] || [ "$CODE_SUB" = "404" ] && echo 0 || echo 1)
done

# D6: unauthenticated access blocked
CODE_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/leads/$LEAD_A/activities")
check "no-auth lead/activities → 401 ($CODE_NOAUTH)" $([ "$CODE_NOAUTH" = "401" ] && echo 0 || echo 1)
CODE_STATS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/leads/stats")
check "no-auth leads/stats → 401 ($CODE_STATS)" $([ "$CODE_STATS" = "401" ] && echo 0 || echo 1)
CODE_DEALS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/deals")
check "no-auth deals → 401 ($CODE_DEALS)" $([ "$CODE_DEALS" = "401" ] && echo 0 || echo 1)

# C: history isolation — notifications scoped
NA=$(curl -s -b "$JA" "$BASE/api/notifications?limit=50" | head -c 300)
NB=$(curl -s -b "$JB" "$BASE/api/notifications?limit=50" | head -c 300)
echo "  (A notif: $(echo $NA | head -c 60)... / B notif: $(echo $NB | head -c 60)...)"

# E: pipeline on own lead + denial on foreign lead
echo
echo "════ TEST E — AI PIPELINE ════"
CODE_FOR=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X POST "$BASE/api/prospecting/pipeline/run" -H 'Content-Type: application/json' -d "{\"leadId\":\"$LEAD_B\"}")
check "B runs pipeline on OWN lead → accepted ($CODE_FOR)" $([ "$CODE_FOR" = "200" ] && echo 0 || echo 1)
CODE_X=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X POST "$BASE/api/prospecting/pipeline/run" -H 'Content-Type: application/json' -d "{\"leadId\":\"$LEAD_A\"}")
check "B runs pipeline on A's lead → denied ($CODE_X)" $([ "$CODE_X" = "403" ] || [ "$CODE_X" = "404" ] || [ "$CODE_X" = "400" ] && echo 0 || echo 1)

# F: history/notifications/credits isolation
echo
echo "════ TEST F — CREDITS & HISTORY ISOLATION ════"
CR_A=$(curl -s -b "$JA" "$BASE/api/credits" | head -c 200)
CR_B=$(curl -s -b "$JB" "$BASE/api/credits" | head -c 200)
check "A credits endpoint works" $([ -n "$CR_A" ] && echo 0 || echo 1)
check "B credits endpoint works" $([ -n "$CR_B" ] && echo 0 || echo 1)
CA=$(curl -s -b "$JA" "$BASE/api/credits" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('credits',d.get('balance','?')))" 2>/dev/null)
CB=$(curl -s -b "$JB" "$BASE/api/credits" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('credits',d.get('balance','?')))" 2>/dev/null)
echo "  A balance=$CA B balance=$CB"
check "balances differ (isolated) [$CA vs $CB]" $([ "$CA" != "$CB" ] && echo 0 || echo 1)

# Platform endpoints locked down
CODE_CA=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" "$BASE/api/billing/analytics")
check "org-user blocked from platform billing analytics ($CODE_CA)" $([ "$CODE_CA" = "403" ] && echo 0 || echo 1)
CODE_RECOVER=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/realtime/recover" -H 'Content-Type: application/json' -d "{\"userId\":\"$LEAD_A\"}")
check "no-auth realtime/recover → 401 ($CODE_RECOVER)" $([ "$CODE_RECOVER" = "401" ] && echo 0 || echo 1)

echo
echo "════ RESULTS: PASS=$PASS FAIL=$FAIL ════"
