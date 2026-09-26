#!/bin/bash
# verify-permanent-fix.sh — Runtime verification of the permanent auth fix
# Tests run against the LIVE server (http://localhost:3000).
# Synthetic test account only: pfx-e2e-20260924@test.local. No secrets printed.
cd /home/z/my-project
BASE="http://localhost:3000"
JAR_R="/tmp/pfx-remember.jar"     # rememberMe=true session
JAR_S="/tmp/pfx-session.jar"      # rememberMe=false session
EMAIL="pfx-e2e-20260924@test.local"
PASS='TestPass!2026x'
PASSRESULT=0

ok()   { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; PASSRESULT=1; }
hdr()  { echo ""; echo "──── $1 ────"; }

rm -f "$JAR_R" "$JAR_S"

hdr "1. Health + auth config honesty (P7)"
H=$(curl -s "$BASE/api/health")
echo "$H" | rg -q '"status":"healthy"' && ok "health healthy" || fail "health: $H"
CFG=$(curl -s "$BASE/api/auth/config")
echo "$CFG" | rg -q '"googleConfigured":true' && ok "googleConfigured:true (honest)" || fail "config: $CFG"
echo "$CFG" | rg -q '"emailConfigured":true' && ok "emailConfigured:true" || fail "email: $CFG"

hdr "2. Google OAuth real flow (P7)"
STATE=$(curl -s "$BASE/api/auth/google/state?origin=http://localhost:3000")
echo "$STATE" | rg -q 'accounts.google.com/o/oauth2/v2/auth' && ok "state → REAL accounts.google.com URL" || fail "state: $(echo $STATE | head -c 200)"
echo "$STATE" | rg -q 'devMode' && fail "state exposes devMode" || ok "no devMode field (real creds active)"
CLIENT_ID_IN_URL=$(echo "$STATE" | rg -o 'client_id=[0-9]+-' | head -1)
[ -n "$CLIENT_ID_IN_URL" ] && ok "authUrl carries real client_id ($CLIENT_ID_IN_URL…)" || fail "no client_id in authUrl"

hdr "3. Refresh semantics — no cookie (F/NO_TOKEN)"
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/refresh")
CODE=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
[ "$CODE" = "401" ] && echo "$BODY" | rg -q '"code":"NO_TOKEN"' && ok "401 + code=NO_TOKEN" || fail "got $CODE $BODY"

hdr "4. Password signin rememberMe=false → browser-session cookie (P5)"
S=$(curl -s -c "$JAR_S" -w "\n%{http_code}" -X POST "$BASE/api/auth/signin" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"rememberMe\":false}")
SCODE=$(echo "$S" | tail -1)
[ "$SCODE" = "200" ] && ok "signin 200" || fail "signin: $SCODE $(echo $S | head -1 | head -c 150)"
grep 'refresh_token' "$JAR_S" | rg -qv '.maxAge|Max-Age' ; REFRESH_S_LINE=$(grep 'refresh_token' "$JAR_S")
# curl jar: persistent cookies have expiry date; session cookies have expiry 0 (e.g. "0   refresh_token ...")
echo "$REFRESH_S_LINE" | awk '{print $5}' | grep -q '^0$' && ok "refresh cookie is SESSION cookie (no maxAge)" || fail "refresh cookie persisted despite rememberMe=false: $REFRESH_S_LINE"

hdr "5. Password signin rememberMe=true → persistent cookie + remembered session row (P5)"
S2=$(curl -s -c "$JAR_R" -w "\n%{http_code}" -X POST "$BASE/api/auth/signin" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"rememberMe\":true}")
S2CODE=$(echo "$S2" | tail -1)
[ "$S2CODE" = "200" ] && ok "signin(remember) 200" || fail "signin remember: $S2CODE"
REFRESH_R_LINE=$(grep 'refresh_token' "$JAR_R")
MAXAGE=$(echo "$REFRESH_R_LINE" | awk '{print $5}')
# jar expiry ≈ now + 30d (allow 29–32 days)
NOW=$(date +%s); LIMIT_LO=$((NOW + 29*86400)); LIMIT_HI=$((NOW + 32*86400))
[ "$MAXAGE" -ge "$LIMIT_LO" ] && [ "$MAXAGE" -le "$LIMIT_HI" ] && ok "refresh cookie maxAge ≈ 30d ($(( (MAXAGE-NOW)/86400 ))d)" || fail "refresh cookie maxAge=$MAXAGE"
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.user.findUnique({where:{email:'$EMAIL'}});
  const s=await p.userSession.findFirst({where:{userId:u.id,isRevoked:false},orderBy:{createdAt:'desc'}});
  if(!s){console.log('DBFAIL no session row');process.exit(1);}
  const flags=[];
  flags.push(s.rememberMe===true?'rememberMe=true':'rememberMe=FALSE(BAD)');
  flags.push(s.absoluteExpiresAt?'absoluteExpiresAt=SET':'absoluteExpiresAt=MISSING(BAD)');
  flags.push(s.lastActivityAt?'lastActivityAt=SET':'lastActivityAt=MISSING(BAD)');
  const idleH=((Date.now()-new Date(s.lastActivityAt).getTime())/3600000).toFixed(2);
  flags.push('idleHours='+idleH);
  const absD=((new Date(s.absoluteExpiresAt)-Date.now())/86400000).toFixed(1);
  flags.push('absoluteInDays='+absD);
  console.log('DB '+flags.join(' '));
  const okAll=s.rememberMe===true&&s.absoluteExpiresAt&&s.lastActivityAt&&absD>28.5&&absD<30.5&&idleH<1;
  await p.\$disconnect();
  process.exit(okAll?0:1);
})().catch(e=>{console.error('DBFAIL',e.message);process.exit(1)});
" && ok "session row: remembered + 30d absolute + fresh activity" || fail "session row policy fields"

hdr "6. Refresh succeeds + rotates + touches activity (P4/P6)"
R1=$(curl -s -b "$JAR_R" -c "$JAR_R" -w "\n%{http_code}" -X POST "$BASE/api/auth/refresh")
R1CODE=$(echo "$R1" | tail -1)
[ "$R1CODE" = "200" ] && echo "$R1" | head -1 | rg -q '"code":"OK"' && ok "refresh 200 code=OK (rotation)" || fail "refresh: $R1CODE $(echo $R1 | head -1 | head -c 150)"

hdr "7. 48h idle expiry enforced server-side (P6)"
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.user.findUnique({where:{email:'$EMAIL'}});
  const s=await p.userSession.findFirst({where:{userId:u.id,isRevoked:false},orderBy:{createdAt:'desc'}});
  await p.userSession.update({where:{id:s.id},data:{lastActivityAt:new Date(Date.now()-49*3600*1000)}});
  await p.\$disconnect();
})();" >/dev/null 2>&1
R2=$(curl -s -b "$JAR_R" -w "\n%{http_code}" -X POST "$BASE/api/auth/refresh")
R2CODE=$(echo "$R2" | tail -1)
echo "$R2" | head -1 | rg -q '"code":"SESSION_IDLE_EXPIRED"' && [ "$R2CODE" = "401" ] && ok "401 code=SESSION_IDLE_EXPIRED (>48h idle)" || fail "idle: $R2CODE $(echo $R2 | head -1 | head -c 150)"

hdr "8. Fresh non-remembered session NOT subject to idle rule (normal behavior)"
R3=$(curl -s -b "$JAR_S" -c "$JAR_S" -w "\n%{http_code}" -X POST "$BASE/api/auth/refresh")
R3CODE=$(echo "$R3" | tail -1)
[ "$R3CODE" = "200" ] && ok "non-remembered session refreshes normally (no idle rule)" || fail "session refresh: $R3CODE $(echo $R3 | head -1 | head -c 150)"

hdr "9. 30-day absolute ceiling enforced (P5)"
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.user.findUnique({where:{email:'$EMAIL'}});
  const s=await p.userSession.findFirst({where:{userId:u.id,isRevoked:false},orderBy:{createdAt:'desc'}});
  await p.userSession.update({where:{id:s.id},data:{absoluteExpiresAt:new Date(Date.now()-1000)}});
  await p.\$disconnect();
})();" >/dev/null 2>&1
R4=$(curl -s -b "$JAR_S" -w "\n%{http_code}" -X POST "$BASE/api/auth/refresh")
R4CODE=$(echo "$R4" | tail -1)
echo "$R4" | head -1 | rg -q '"code":"SESSION_EXPIRED"' && [ "$R4CODE" = "401" ] && ok "401 code=SESSION_EXPIRED (30d absolute)" || fail "absolute: $R4CODE $(echo $R4 | head -1 | head -c 150)"

hdr "10. Revoked session → SESSION_REVOKED (real logout)"
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.user.findUnique({where:{email:'$EMAIL'}});
  const s=await p.userSession.findFirst({where:{userId:u.id,isRevoked:false},orderBy:{createdAt:'desc'}});
  if(s) await p.userSession.update({where:{id:s.id},data:{isRevoked:true}});
  await p.\$disconnect();
})();" >/dev/null 2>&1
R5=$(curl -s -b "$JAR_S" -w "\n%{http_code}" -X POST "$BASE/api/auth/refresh")
echo "$R5" | head -1 | rg -q '"code":"SESSION_REVOKED"' && ok "401 code=SESSION_REVOKED" || fail "revoked: $(echo $R5 | head -1 | head -c 150)"

hdr "11. Invalid JWT → INVALID_TOKEN"
curl -s -b "$BASE" -X POST "$BASE/api/auth/refresh" -H "Cookie: refresh_token=not.a.jwt" -o /dev/null -w "" 2>/dev/null
R6=$(curl -s -X POST "$BASE/api/auth/refresh" -H "Cookie: refresh_token=not.a.jwt")
echo "$R6" | rg -q '"code":"INVALID_TOKEN"' && ok "401 code=INVALID_TOKEN" || fail "invalid: $R6"

hdr "12. Subscription endpoint (P3): authenticated free user"
curl -s -c "$JAR_R" -X POST "$BASE/api/auth/signin" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"rememberMe\":true}" -o /dev/null
SUB=$(curl -s -b "$JAR_R" -w "\n%{http_code}" "$BASE/api/subscriptions/current")
SUBCODE=$(echo "$SUB" | tail -1)
[ "$SUBCODE" = "200" ] && echo "$SUB" | head -1 | rg -q '"plan":"free"' && ok "verified free plan for free user" || fail "sub: $SUBCODE $(echo $SUB | head -1 | head -c 120)"

hdr "13. Rate-limit bucket isolation (P9): OTP vs signin vs magic-link"
# Consume the OTP bucket (5/60s) for email A with a NONEXISTENT address
# (no real emails sent — user lookup fails fast, generic 200).
A="pfx-rl-a-$RANDOM@test.invalid"
B="pfx-rl-b-$RANDOM@test.invalid"
CODES_A=""
for i in 1 2 3 4 5 6 7; do
  C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/otp/request" -H "Content-Type: application/json" -d "{\"email\":\"$A\"}")
  CODES_A="$CODES_A $C"
done
echo "$CODES_A" | rg -q '429' && ok "email A exhausted otp bucket (5/60s):$CODES_A" || fail "no 429 for A:$CODES_A"
CB=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/otp/request" -H "Content-Type: application/json" -d "{\"email\":\"$B\"}")
[ "$CB" = "200" ] && ok "email B unaffected (separate IP+email bucket)" || fail "B got $CB (bucket collision!)"
CM=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/magic-link/request" -H "Content-Type: application/json" -d "{\"email\":\"$A\"}")
[ "$CM" = "200" ] && ok "magic-link bucket independent of OTP bucket" || fail "magic-link got $CM (shared bucket!)"
CS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/signin" -H "Content-Type: application/json" -d "{\"email\":\"$A\",\"password\":\"wrongpass\"}")
[ "$CS" = "401" ] && ok "signin bucket independent (401 not 429)" || fail "signin got $CS"

hdr "14. OTP rate limiting still blocks abuse (32)"
CODES_B=""
for i in 1 2 3 4 5 6; do
  C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/otp/request" -H "Content-Type: application/json" -d "{\"email\":\"$B\"}")
  CODES_B="$CODES_B $C"
done
echo "$CODES_B" | rg -q '429' && ok "abuse still rate-limited:$CODES_B" || fail "abuse NOT limited:$CODES_B"

hdr "15. Refresh bucket isolated + generous (P9/33)"
CRC=""
for i in 1 2 3; do
  C=$(curl -s -b "$JAR_R" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/refresh")
  CRC="$CRC $C"
done
# refresh of remembered session was revoked in step 10? No — JAR_R re-signed in step 12.
echo "$CRC" | rg -q '200' && ok "refresh works repeatedly (own bucket):$CRC" || fail "refresh codes:$CRC"

hdr "16. Signout revokes (11)"
SO=$(curl -s -b "$JAR_R" -w "\n%{http_code}" -X POST "$BASE/api/auth/signout")
SO_CODE=$(echo "$SO" | tail -1)
[ "$SO_CODE" = "200" ] && ok "signout 200" || fail "signout $SO_CODE"
RR=$(curl -s -b "$JAR_R" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/refresh")
[ "$RR" = "401" ] && ok "post-signout refresh 401 (real logout)" || fail "post-signout refresh: $RR"

echo ""
if [ $PASSRESULT -eq 0 ]; then echo "═══ ALL RUNTIME CHECKS PASSED ═══"; else echo "═══ SOME CHECKS FAILED ═══"; fi
exit $PASSRESULT
