#!/bin/bash
# Re-test analyze-website on Cytecare only (already discovered + persisted)
cd /home/z/my-project
BASE="http://localhost:3000"
JA=/tmp/cookies-a.txt

CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE --max-time 2 || true)
if [ "$CODE" != "200" ]; then
  setsid nohup bash start-dev.sh > /dev/null 2>&1 &
  for i in $(seq 1 90); do CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE --max-time 2 || true); [ "$CODE" = "200" ] && break; sleep 1; done
fi

# ensure owner session (re-login if stale)
ME=$(curl -s -b $JA "$BASE/api/auth/me" | head -c 120)
if ! echo "$ME" | grep -q prabhat; then
  curl -s -X POST $BASE/api/auth/otp/request -H 'Content-Type: application/json' -d '{"email":"mailtoprabhat72@gmail.com"}' > /dev/null; sleep 2
  OTP=$(bun -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findUnique({where:{email:'mailtoprabhat72@gmail.com'},select:{loginOtp:true}}).then(u=>{console.log(u?.loginOtp||'');return p.\$disconnect();})" | tail -1)
  curl -s -c $JA -X POST $BASE/api/auth/otp/verify -H 'Content-Type: application/json' -d "{\"email\":\"mailtoprabhat72@gmail.com\",\"otp\":\"$OTP\"}" > /dev/null
fi

CYT_ID="cmtsrc66s001dnpmc13hka4z9"
echo "=== ANALYZE WEBSITE (retry probe — expect rich real-content analysis) ==="
curl -s -b $JA -X POST "$BASE/api/leads/$CYT_ID/analyze-website" --max-time 300 | head -c 1400
echo ""
