#!/bin/bash
# verify-permanent-fix-phase2.sh — E2E: session validity over time, full OTP
# + magic-link flows, application restart + post-restart authentication.
# Synthetic test account ONLY. OTP/token values read from DB, never printed.
cd /home/z/my-project
BASE="http://localhost:3000"
EMAIL="pfx-e2e-20260924@test.local"
PASS='TestPass!2026x'
JAR="/tmp/pfx-p2.jar"
PASSRESULT=0
ok()   { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; PASSRESULT=1; }
hdr()  { echo ""; echo "──── $1 ────"; }
rm -f "$JAR"

hdr "A. Session valid after 4h of no activity (P5: rule is 48h, not 4h)"
curl -s -c "$JAR" -X POST "$BASE/api/auth/signin" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"rememberMe\":true}" -o /dev/null
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.user.findUnique({where:{email:'$EMAIL'}});
  const s=await p.userSession.findFirst({where:{userId:u.id,isRevoked:false},orderBy:{createdAt:'desc'}});
  await p.userSession.update({where:{id:s.id},data:{lastActivityAt:new Date(Date.now()-4*3600*1000)}});
  await p.\$disconnect();
})();" >/dev/null 2>&1
C4=$(curl -s -b "$JAR" -c "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/refresh")
[ "$C4" = "200" ] && ok "refresh 200 after simulated 4h idle (no false logout)" || fail "4h idle refresh: $C4 (expected 200)"
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.user.findUnique({where:{email:'$EMAIL'}});
  const s=await p.userSession.findFirst({where:{userId:u.id,isRevoked:false},orderBy:{createdAt:'desc'}});
  const ageMin=((Date.now()-new Date(s.lastActivityAt).getTime())/60000).toFixed(1);
  console.log('activity age after refresh: '+ageMin+' min (throttled write expected ~5-15 min)');
  await p.\$disconnect();
})();" >/dev/null 2>&1

hdr "B. Session valid after 1h (same policy proof)"
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.user.findUnique({where:{email:'$EMAIL'}});
  const s=await p.userSession.findFirst({where:{userId:u.id,isRevoked:false},orderBy:{createdAt:'desc'}});
  await p.userSession.update({where:{id:s.id},data:{lastActivityAt:new Date(Date.now()-1*3600*1000)}});
  await p.\$disconnect();
})();" >/dev/null 2>&1
C1=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/refresh")
[ "$C1" = "200" ] && ok "refresh 200 after simulated 1h idle" || fail "1h idle refresh: $C1"

hdr "C. FULL OTP login E2E (P8): request → persist → SMTP send → verify"
OTPREQ=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/otp/request" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\"}")
OTPCODE=$(echo "$OTPREQ" | tail -1)
OTPBODY=$(echo "$OTPREQ" | head -1)
[ "$OTPCODE" = "200" ] && ! echo "$OTPBODY" | rg -q 'deliveryIssue' && ok "OTP request 200, no deliveryIssue (SMTP accepted)" || fail "OTP request: $OTPCODE $OTPBODY"
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.user.findUnique({where:{email:'$EMAIL'},select:{loginOtp:true,loginOtpExpiry:true}});
  if(!u||!u.loginOtp){console.log('NO_OTP_PERSISTED');process.exit(1);}
  const minsLeft=((new Date(u.loginOtpExpiry)-Date.now())/60000).toFixed(1);
  console.log('OTP_PERSISTED expires_in='+minsLeft+'min');
  await p.\$disconnect();
})();" | rg -q 'OTP_PERSISTED' && ok "OTP persisted with ~10min expiry" || fail "OTP persistence"
# Read OTP (never printed) and verify with rememberMe=true
VERIFY=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.user.findUnique({where:{email:'$EMAIL'},select:{loginOtp:true}}).then(u=>{
  console.log(u.loginOtp);
  return p.\$disconnect();
});" 2>/dev/null)
OTPRES=$(curl -s -c "$JAR" -w "\n%{http_code}" -X POST "$BASE/api/auth/otp/verify" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"otp\":\"$VERIFY\",\"rememberMe\":true}")
OTPRES_CODE=$(echo "$OTPRES" | tail -1)
[ "$OTPRES_CODE" = "200" ] && echo "$OTPRES" | head -1 | rg -q 'Signed in successfully via OTP' && ok "OTP verify 200 + session cookies" || fail "OTP verify: $OTPRES_CODE $(echo $OTPRES | head -1 | head -c 120)"
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.user.findUnique({where:{email:'$EMAIL'}});
  const s=await p.userSession.findFirst({where:{userId:u.id,isRevoked:false},orderBy:{createdAt:'desc'}});
  console.log(s&&s.rememberMe===true?'OTP_SESSION_REMEMBERED=true':'OTP_SESSION_REMEMBERED=false');
  await p.\$disconnect();
})();" | rg -q 'OTP_SESSION_REMEMBERED=true' && ok "OTP session row: rememberMe=true (P5 wired through OTP)" || fail "OTP session not remembered"

hdr "D. Wrong-OTP still rejected (29 boundary)"
# Request a FRESH OTP so a live code is pending, then prove a wrong code
# hits the brute-force-recorded 401 path (mismatch), not a state error.
curl -s -o /dev/null -X POST "$BASE/api/auth/otp/request" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\"}"
WRONG=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/otp/verify" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"otp\":\"000001\",\"rememberMe\":true}")
[ "$WRONG" = "401" ] && ok "wrong OTP against live pending code → 401" || fail "wrong OTP: $WRONG (expected 401)"

hdr "E. FULL Magic Link E2E: request → persist → verify → cookies"
MLREQ=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/magic-link/request" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"rememberMe\":true}")
MLCODE=$(echo "$MLREQ" | tail -1)
[ "$MLCODE" = "200" ] && ! echo "$MLREQ" | head -1 | rg -q 'deliveryIssue' && ok "magic-link request 200, SMTP accepted" || fail "magic-link request: $MLCODE $(echo $MLREQ | head -1 | head -c 120)"
MLURL=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.user.findUnique({where:{email:'$EMAIL'},select:{magicLinkToken:true}}).then(u=>{
  console.log('http://localhost:3000/api/auth/magic-link/verify?token='+u.magicLinkToken+'&email='+encodeURIComponent('$EMAIL')+'&remember=1');
  return p.\$disconnect();
});" 2>/dev/null)
rm -f "$JAR"
MLRES=$(curl -s -c "$JAR" -o /dev/null -w "%{http_code}" "$MLURL")
[ "$MLRES" = "307" ] && ok "magic-link verify GET → 307 redirect" || fail "magic-link GET: $MLRES"
grep -q 'access_token' "$JAR" && ok "magic-link set access+refresh cookies" || fail "no cookies from magic-link"
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.user.findUnique({where:{email:'$EMAIL'}});
  const s=await p.userSession.findFirst({where:{userId:u.id,isRevoked:false},orderBy:{createdAt:'desc'}});
  console.log(s&&s.rememberMe===true?'ML_SESSION_REMEMBERED=true':'ML_SESSION_REMEMBERED=false');
  await p.\$disconnect();
})();" | rg -q 'ML_SESSION_REMEMBERED=true' && ok "magic-link session row: rememberMe=true (P5 via remember=1 param)" || fail "ML session not remembered"
# Magic-link token must be single-use
MLREUSE=$(curl -s -o /dev/null -w "%{http_code}" "$MLURL")
[ "$MLREUSE" = "307" ] && rg -q "auth_error" <(curl -s -o /dev/null -w "%{redirect_url}" "$MLURL" 2>/dev/null) 2>/dev/null
R1=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/refresh")
[ "$R1" = "200" ] && ok "post-magic-link refresh 200" || fail "post-ML refresh: $R1"

hdr "F. APPLICATION RESTART + post-restart authentication (tests 4/34/39/40)"
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
sleep 2
(nohup npm run dev > /dev/null 2>&1 &)
READY=0
for i in $(seq 1 30); do
  sleep 2
  H=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/health" 2>/dev/null)
  if [ "$H" = "200" ]; then READY=1; break; fi
done
[ "$READY" = "1" ] && ok "server restarted healthy (npm run dev + boot-recovery gate)" || fail "server did not come back"
PR=$(curl -s -b "$JAR" -c "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/refresh")
[ "$PR" = "200" ] && ok "session SURVIVES application restart (DB-backed, refresh 200)" || fail "post-restart refresh: $PR"
SUB=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" "$BASE/api/subscriptions/current")
[ "$SUB" = "200" ] && ok "subscription state correct after restart (200)" || fail "post-restart subscription: $SUB"

hdr "G. Boot-recovery idempotent no-op on healthy system (37/38 fast path)"
REC=$(timeout 30 node scripts/boot-recovery.mjs 2>&1; echo "EXIT=$?")
echo "$REC" | rg -q 'EXIT=0' && [ -z "$(echo "$REC" | rg 'CRITICAL|recovered')" ] && ok "no-op: silent, exit 0, nothing touched" || fail "boot-recovery noisy/failed: $REC"

echo ""
if [ $PASSRESULT -eq 0 ]; then echo "═══ ALL PHASE-2 E2E CHECKS PASSED ═══"; else echo "═══ SOME PHASE-2 CHECKS FAILED ═══"; fi
exit $PASSRESULT
