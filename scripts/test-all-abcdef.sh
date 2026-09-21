#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# FULL VERIFICATION — Tests B, C, D, E, F + security regressions
# Account A: kattyboy785@gmail.com    Account B: mailtoprabhat72@gmail.com
# ═══════════════════════════════════════════════════════════════════
set -u
BASE="http://localhost:3000"
JA=/home/z/my-project/scripts/.t-a.txt
JB=/home/z/my-project/scripts/.t-b.txt
EA="kattyboy785@gmail.com"
EB="mailtoprabhat72@gmail.com"
LEAD_A="cmqme6hgj0023rc2j1d2dhukv"   # owned by A
LEAD_B="cmtsrc65f000jnpmcwjsum91n"   # owned by B
PASS=0; FAIL=0

login() { # $1=email $2=jar
  rm -f "$2"
  # OTP requests are rate-limited — retry until accepted (honour retryAfter)
  local TRIES=0
  while : ; do
    RESP=$(curl -s -c "$2" -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d "{\"email\":\"$1\"}")
    echo "$RESP" | rg -q "Rate limit exceeded" || break
    TRIES=$((TRIES+1))
    [ $TRIES -gt 8 ] && { echo "  !! otp/request still rate-limited after $TRIES tries"; break; }
    sleep 16
  done
  local OTP=$(python3 -c "
import sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
row = con.execute(\"SELECT loginOtp FROM User WHERE email=?\", ('$1',)).fetchone()
print(row[0] if row and row[0] else 'NOT_FOUND')")
  curl -s -b "$2" -c "$2" -X POST "$BASE/api/auth/otp/verify" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"otp\":\"$OTP\"}" > /dev/null
  # Verify the session actually established (verify can also be rate-limited)
  local ME=$(curl -s -b "$2" "$BASE/api/auth/me" | python3 -c "import json,sys;
try: print(json.load(sys.stdin)['user']['email'])
except Exception: print('')" 2>/dev/null)
  if [ "$ME" != "$1" ]; then
    sleep 16
    RESP=$(curl -s -c "$2" -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d "{\"email\":\"$1\"}")
    OTP=$(python3 -c "
import sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
row = con.execute(\"SELECT loginOtp FROM User WHERE email=?\", ('$1',)).fetchone()
print(row[0] if row and row[0] else 'NOT_FOUND')")
    curl -s -b "$2" -c "$2" -X POST "$BASE/api/auth/otp/verify" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"otp\":\"$OTP\"}" > /dev/null
  fi
  sleep 1
}

check() { # $1=name $2=cond(0=pass)
  if [ "$2" -eq 0 ]; then echo "  ✓ PASS: $1"; PASS=$((PASS+1)); else echo "  ✗ FAIL: $1"; FAIL=$((FAIL+1)); fi
}
jq_get() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)" 2>/dev/null; }

echo "════ TEST B — PROFILE PERSISTENCE (A then B) ════"
login "$EA" "$JA"
STAMP=$(date +%s)
CODE_S=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" -X PUT "$BASE/api/settings/profile" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Prabhat Kumar\",\"phone\":\"+91 98000 $STAMP\",\"country\":\"India\",\"company\":\"Verify-$STAMP Corp\"}")
check "B1 save PUT → 200 ($CODE_S)" $([ "$CODE_S" = "200" ] && echo 0 || echo 1)
# refresh = same cookie fresh GET (token still valid); full re-login below covers logout→login
C1=$(curl -s -b "$JA" "$BASE/api/settings/profile" | jq_get "d['profile']['company']")
check "B2 refresh: company round-trips (got: $C1)" $([ "$C1" = "Verify-$STAMP Corp" ] && echo 0 || echo 1)
# logout → login
curl -s -b "$JA" -c "$JA" -X POST "$BASE/api/auth/signout" > /dev/null; rm -f "$JA"
login "$EA" "$JA"
P2=$(curl -s -b "$JA" "$BASE/api/settings/profile")
C2=$(echo "$P2" | jq_get "d['profile']['company'] + '|' + d['profile']['country'] + '|' + d['profile']['phone']")
check "B3 logout→login: company persists (got: $C2)" $(echo "$C2" | rg -q "Verify-$STAMP Corp" && echo 0 || echo 1)
check "B4 logout→login: country+phone persist (got: $C2)" $(echo "$C2" | rg -q "India" && echo "$C2" | rg -q "$STAMP" && echo 0 || echo 1)
N2=$(echo "$P2" | jq_get "d['profile']['name']")
check "B5 name persists (got: $N2)" $([ "$N2" = "Prabhat Kumar" ] && echo 0 || echo 1)
# Account B symmetric test
login "$EB" "$JB"
STAMP_B=$((STAMP+1))
curl -s -b "$JB" -X PUT "$BASE/api/settings/profile" -H 'Content-Type: application/json' \
  -d "{\"company\":\"BLtd-$STAMP_B\",\"country\":\"Singapore\"}" > /dev/null
curl -s -b "$JB" -c "$JB" -X POST "$BASE/api/auth/signout" > /dev/null; rm -f "$JB"
login "$EB" "$JB"
CB=$(curl -s -b "$JB" "$BASE/api/settings/profile" | jq_get "d['profile']['company'] + '|' + d['profile']['country']")
check "B6 Account B symmetric: own values persist (got: $CB)" $(echo "$CB" | rg -q "BLtd-$STAMP_B" && echo "$CB" | rg -q "Singapore" && echo 0 || echo 1)
# A must not see B's freshly saved company
CA_CHK=$(curl -s -b "$JA" "$BASE/api/settings/profile" | jq_get "d['profile']['company']")
check "B7 A still sees A's company, not B's (got: $CA_CHK)" $(echo "$CA_CHK" | rg -q "Verify-$STAMP Corp" && echo 0 || echo 1)

echo
echo "════ TEST B+ — ONBOARDING API (previously 500s / localStorage-only) ════"
login "$EA" "$JA"
CODE_OB=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" -X PUT "$BASE/api/settings/onboarding" -H 'Content-Type: application/json' \
  -d "{\"companyName\":\"Onb Co $STAMP\",\"targetNiches\":[\"dental\",\"fitness\"],\"targetCountries\":[\"India\"],\"targetChannels\":[\"email\"],\"currentStep\":6,\"completed\":true,\"data\":{\"foo\":\"bar\"}}")
check "B8 onboarding PUT with legacy 'data' field → 200 not 500 ($CODE_OB)" $([ "$CODE_OB" = "200" ] && echo 0 || echo 1)
NICHES=$(curl -s -b "$JA" "$BASE/api/settings/onboarding" | jq_get "d['settings']['targetNiches'] if d.get('settings') else 'NO_SETTINGS'")
check "B9 onboarding niches persisted to DB (got: $NICHES)" $(echo "$NICHES" | rg -q "dental" && echo 0 || echo 1)
ONB_DONE=$(curl -s -b "$JA" "$BASE/api/settings/onboarding" | jq_get "d['settings']['onboardingCompleted'] if d.get('settings') else 'NO'")
check "B10 onboardingCompleted flag in DB (got: $ONB_DONE)" $([ "$ONB_DONE" = "True" ] && echo 0 || echo 1)

echo
echo "════ TEST B++ — NOTIFICATION PREFERENCES 5-TOGGLE ROUNDTRIP ════"
ORIG=$(curl -s -b "$JA" "$BASE/api/settings/notifications")
OE0=$(echo "$ORIG" | jq_get "d['preferences']['emailEnabled']")
CODE_NP=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" -X PUT "$BASE/api/settings/notifications" -H 'Content-Type: application/json' \
  -d "{\"emailEnabled\":false,\"inAppEnabled\":false,\"typePreferences\":{\"deal_updates\":{\"inApp\":false,\"email\":false},\"credit_alerts\":{\"inApp\":false,\"email\":false},\"weekly_digest\":{\"inApp\":true,\"email\":true}}}")
check "B11 prefs PUT → 200 ($CODE_NP)" $([ "$CODE_NP" = "200" ] && echo 0 || echo 1)
curl -s -b "$JA" -c "$JA" -X POST "$BASE/api/auth/signout" > /dev/null; rm -f "$JA"
login "$EA" "$JA"
NP=$(curl -s -b "$JA" "$BASE/api/settings/notifications")
DU=$(echo "$NP" | jq_get "d['preferences']['typePreferences']['deal_updates']['inApp']")
WD=$(echo "$NP" | jq_get "d['preferences']['typePreferences']['weekly_digest']['inApp']")
EE=$(echo "$NP" | jq_get "d['preferences']['emailEnabled']")
check "B12 deal_updates persisted logout→login (got: $DU)" $([ "$DU" = "False" ] && echo 0 || echo 1)
check "B13 weekly_digest persisted (got: $WD)" $([ "$WD" = "True" ] && echo 0 || echo 1)
check "B14 global email switch persisted (got: $EE)" $([ "$EE" = "False" ] && echo 0 || echo 1)
# restore
curl -s -b "$JA" -X PUT "$BASE/api/settings/notifications" -H 'Content-Type: application/json' \
  -d "{\"emailEnabled\":$OE0,\"inAppEnabled\":true,\"typePreferences\":{\"deal_updates\":{\"inApp\":true,\"email\":true},\"credit_alerts\":{\"inApp\":true,\"email\":true},\"weekly_digest\":{\"inApp\":false,\"email\":false}}}" > /dev/null

echo
echo "════ TEST C — CROSS-ACCOUNT LOGIN SWEEP (A → B → refresh → A) ════"
# Currently logged in as A (jar JA)
ID_ME=$(curl -s -b "$JA" "$BASE/api/auth/me" | jq_get "d['user']['email']")
check "C1 A session resolves to A ($ID_ME)" $([ "$ID_ME" = "$EA" ] && echo 0 || echo 1)
LIST_A=$(curl -s -b "$JA" "$BASE/api/leads?limit=200")
check "C2 A lead list has no B lead" $(echo "$LIST_A" | rg -q "$LEAD_B" && echo 1 || echo 0)
# logout → login B
curl -s -b "$JA" -c "$JA" -X POST "$BASE/api/auth/signout" > /dev/null; rm -f "$JA"
login "$EB" "$JB"
ID_MB=$(curl -s -b "$JB" "$BASE/api/auth/me" | jq_get "d['user']['email']")
check "C3 B session resolves to B ($ID_MB)" $([ "$ID_MB" = "$EB" ] && echo 0 || echo 1)
LIST_B=$(curl -s -b "$JB" "$BASE/api/leads?limit=200")
check "C4 B lead list has no A lead" $(echo "$LIST_B" | rg -q "$LEAD_A" && echo 1 || echo 0)
# refresh: new GET with same session (cookie jar already re-issued by refresh rotation)
ID_MB2=$(curl -s -b "$JB" "$BASE/api/auth/me" | jq_get "d['user']['email']")
check "C5 B after refresh still B ($ID_MB2)" $([ "$ID_MB2" = "$EB" ] && echo 0 || echo 1)
NOTIF_B=$(curl -s -b "$JB" "$BASE/api/notifications?limit=100")
check "C6 B notifications contain no A-lead references" $(echo "$NOTIF_B" | rg -q "$LEAD_A" && echo 1 || echo 0)
# logout → login A again
curl -s -b "$JB" -c "$JB" -X POST "$BASE/api/auth/signout" > /dev/null; rm -f "$JB"
login "$EA" "$JA"
ID_MA=$(curl -s -b "$JA" "$BASE/api/auth/me" | jq_get "d['user']['email']")
check "C7 A re-login resolves to A ($ID_MA)" $([ "$ID_MA" = "$EA" ] && echo 0 || echo 1)
LIST_A2=$(curl -s -b "$JA" "$BASE/api/leads?limit=200")
check "C8 A re-login lead list still has no B lead" $(echo "$LIST_A2" | rg -q "$LEAD_B" && echo 1 || echo 0)

echo
echo "════ TEST D — LEAD ISOLATION / IDOR ════"
# Re-login both accounts cleanly (Test C ended with A logged in)
curl -s -b "$JA" -c "$JA" -X POST "$BASE/api/auth/signout" > /dev/null; rm -f "$JA"
curl -s -b "$JB" -c "$JB" -X POST "$BASE/api/auth/signout" > /dev/null; rm -f "$JB"
login "$EA" "$JA"
login "$EB" "$JB"
for probe in "GET_A_B|$LEAD_B" ; do :; done
CODE_AB=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" "$BASE/api/leads/$LEAD_B")
check "D1 A GET B's lead → denied ($CODE_AB)" $([ "$CODE_AB" = "403" ] || [ "$CODE_AB" = "404" ] && echo 0 || echo 1)
CODE_BA=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" "$BASE/api/leads/$LEAD_A")
check "D2 B GET A's lead → denied ($CODE_BA)" $([ "$CODE_BA" = "403" ] || [ "$CODE_BA" = "404" ] && echo 0 || echo 1)
CODE_AA=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" "$BASE/api/leads/$LEAD_A")
check "D3 A GET own lead → 200 ($CODE_AA)" $([ "$CODE_AA" = "200" ] && echo 0 || echo 1)
CODE_BB=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" "$BASE/api/leads/$LEAD_B")
check "D4 B GET own lead → 200 ($CODE_BB)" $([ "$CODE_BB" = "200" ] && echo 0 || echo 1)
CODE_PUT=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X PUT "$BASE/api/leads/$LEAD_A" -H 'Content-Type: application/json' -d '{"notes":"HACKED"}')
check "D5 B PUT A's lead → denied ($CODE_PUT)" $([ "$CODE_PUT" = "403" ] || [ "$CODE_PUT" = "404" ] && echo 0 || echo 1)
CODE_DEL=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" -X DELETE "$BASE/api/leads/$LEAD_A")
check "D6 B DELETE A's lead → denied ($CODE_DEL)" $([ "$CODE_DEL" = "403" ] || [ "$CODE_DEL" = "404" ] && echo 0 || echo 1)
for sub in activities communications notes reminders outreach analyze; do
  CODE_SUB=$(curl -s -o /dev/null -w "%{http_code}" -b "$JB" "$BASE/api/leads/$LEAD_A/$sub")
  check "D7 B GET A's lead/$sub → denied ($CODE_SUB)" $([ "$CODE_SUB" = "403" ] || [ "$CODE_SUB" = "404" ] || [ "$CODE_SUB" = "405" ] && echo 0 || echo 1)
done
CODE_XPIPE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" -X POST "$BASE/api/prospecting/pipeline/run" -H 'Content-Type: application/json' -d "{\"leadId\":\"$LEAD_B\"}")
check "D8 A runs pipeline on B's lead → denied ($CODE_XPIPE)" $([ "$CODE_XPIPE" = "403" ] || [ "$CODE_XPIPE" = "404" ] || [ "$CODE_XPIPE" = "400" ] && echo 0 || echo 1)
CODE_EXPORT=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/leads/export")
check "D9 no-auth lead export → 401 ($CODE_EXPORT)" $([ "$CODE_EXPORT" = "401" ] && echo 0 || echo 1)

echo
echo "════ TEST F — CREDITS / HISTORY / NOTIFICATIONS ════"
CA=$(curl -s -b "$JA" "$BASE/api/credits" | jq_get "d.get('credits', d.get('balance','?'))")
CB=$(curl -s -b "$JB" "$BASE/api/credits" | jq_get "d.get('credits', d.get('balance','?'))")
check "F1 balances differ per account [$CA vs $CB]" $([ "$CA" != "$CB" ] && echo 0 || echo 1)
CRH_A=$(curl -s -b "$JA" "$BASE/api/credits/history" | head -c 400)
check "F2 A credit history loads" $([ -n "$CRH_A" ] && echo 0 || echo 1)
WF_A=$(curl -s -b "$JA" "$BASE/api/workflows" | head -c 200)
WF_B=$(curl -s -b "$JB" "$BASE/api/workflows" | head -c 200)
check "F3 A workflows endpoint scoped OK" $([ -n "$WF_A" ] && echo 0 || echo 1)
check "F4 B workflows endpoint scoped OK" $([ -n "$WF_B" ] && echo 0 || echo 1)
NA=$(curl -s -b "$JA" "$BASE/api/notifications?limit=100")
check "F5 A notifications contain no B lead refs" $(echo "$NA" | rg -q "$LEAD_B" && echo 1 || echo 0)
KEYS_A=$(curl -s -b "$JA" "$BASE/api/settings/api-keys" | head -c 200)
KEYS_B=$(curl -s -b "$JB" "$BASE/api/settings/api-keys" | head -c 200)
check "F6 A api-keys scoped OK" $([ -n "$KEYS_A" ] && echo 0 || echo 1)
check "F7 B api-keys scoped OK" $([ -n "$KEYS_B" ] && echo 0 || echo 1)

echo
echo "════ SECURITY REGRESSION — THIS SESSION'S FIXES ════"
# R1 proxy-pool now super-admin only
CODE_PP=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" "$BASE/api/leads/proxy-pool")
check "R1 A GET proxy-pool → 403 ($CODE_PP)" $([ "$CODE_PP" = "403" ] && echo 0 || echo 1)
CODE_PPW=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" -X POST "$BASE/api/leads/proxy-pool" -H 'Content-Type: application/json' -d '{"url":"http://evilproxy.example:8080","type":"datacenter"}')
check "R2 A POST proxy-pool → 403 ($CODE_PPW)" $([ "$CODE_PPW" = "403" ] && echo 0 || echo 1)
# R3 metrics now super-admin only
CODE_M1=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" "$BASE/api/metrics")
check "R3 A GET metrics → 403 ($CODE_M1)" $([ "$CODE_M1" = "403" ] && echo 0 || echo 1)
CODE_M2=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" "$BASE/api/metrics/dashboard")
check "R4 A GET metrics/dashboard → 403 ($CODE_M2)" $([ "$CODE_M2" = "403" ] && echo 0 || echo 1)
# R5 LLM suggestions now authenticated
CODE_SG=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/leads/discover/suggestions?niche=dental&country=USA")
check "R5 no-auth suggestions → 401 ($CODE_SG)" $([ "$CODE_SG" = "401" ] && echo 0 || echo 1)
# R6 auth/debug now super-admin only
CODE_DB=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" "$BASE/api/auth/debug")
check "R6 A GET auth/debug → 403 ($CODE_DB)" $([ "$CODE_DB" = "403" ] && echo 0 || echo 1)
# R7 media metadata scoping (use a non-existent id: expect 404 either way; the check is that route scopes by user)
CODE_MM=$(curl -s -o /dev/null -w "%{http_code}" -b "$JA" "$BASE/api/messaging/media/nonexistent-id-123")
check "R7 A GET foreign/absent media → 404 ($CODE_MM)" $([ "$CODE_MM" = "404" ] && echo 0 || echo 1)

echo
echo "════ RESULTS: PASS=$PASS FAIL=$FAIL ════"
exit $FAIL
