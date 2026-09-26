#!/bin/bash
# Fresh first-run discovery on a SECOND lead (B's own lead "Nakheel").
cd /home/z/my-project
BASE="http://localhost:3000"
JB=/tmp/cookies-b2.txt; rm -f $JB

CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE --max-time 2 || true)
if [ "$CODE" != "200" ]; then
  setsid nohup bash start-dev.sh > /dev/null 2>&1 &
  for i in $(seq 1 90); do CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE --max-time 2 || true); [ "$CODE" = "200" ] && break; sleep 1; done
fi

echo "=== LOGIN AS kattyboy785 (owner of Nakheel lead) ==="
curl -s -X POST $BASE/api/auth/otp/request -H 'Content-Type: application/json' -d '{"email":"kattyboy785@gmail.com"}' > /dev/null; sleep 2
OTP=$(bun -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findUnique({where:{email:'kattyboy785@gmail.com'},select:{loginOtp:true}}).then(u=>{console.log(u?.loginOtp||'');return p.\$disconnect();})" | tail -1)
RES=$(curl -s -c $JB -X POST $BASE/api/auth/otp/verify -H 'Content-Type: application/json' -d "{\"email\":\"kattyboy785@gmail.com\",\"otp\":\"$OTP\"}")
echo "$RES" | grep -q "Signed in successfully" && echo "  login OK" || { echo "  LOGIN FAILED: $RES"; exit 1; }

NAKHEL_ID="cmqme6hgx0029rc2jnsibh02a"
echo "=== BEFORE: Nakheel website state ==="
curl -s -b $JB "$BASE/api/leads/$NAKHEL_ID" | bun -e "
const d = await new Response(require('fs').readFileSync(0)).json();
console.log('  website:', d.lead?.website, '| status:', d.lead?.websiteStatus, '| hasWebsite:', d.lead?.hasWebsite);
" 2>/dev/null

echo "=== ENRICH (fresh discovery + verify + persist) ==="
curl -s -b $JB -X POST "$BASE/api/leads/$NAKHEL_ID/enrich" -H 'Content-Type: application/json' -d '{"includeScreenshot":false}' --max-time 240 | head -c 400
echo ""

echo "=== AFTER: Nakheel website state ==="
curl -s -b $JB "$BASE/api/leads/$NAKHEL_ID" | bun -e "
const d = await new Response(require('fs').readFileSync(0)).json();
console.log('  website:', d.lead?.website, '| status:', d.lead?.websiteStatus, '| hasWebsite:', d.lead?.hasWebsite, '| quality:', d.lead?.websiteQuality);
" 2>/dev/null
