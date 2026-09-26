#!/bin/bash
# E2E verification of the auth fixes (dev-mode delivery + Google dev consent).
# Uses the running dev server on localhost:3000.
BASE="http://localhost:3000"
JAR="/tmp/auth-test-cookies.txt"
EMAIL="preview.verify@acquisitionos.local"
PASS='PreviewVerify#2026'
NEWEMAIL="e2e.devtest@acquisitionos.local"
NEWPASS='E2eTest#2026x'
rm -f "$JAR"

echo "=== 1. Password login (baseline, was working) ==="
curl -s -o /dev/null -w "signin HTTP:%{http_code}\n" -X POST "$BASE/api/auth/signin" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"

echo "=== 2. Google OAuth state (was 503 -> should return dev authUrl) ==="
STATE_RES=$(curl -s "$BASE/api/auth/google/state?origin=$BASE")
echo "$STATE_RES" | head -c 400; echo
STATE=$(echo "$STATE_RES" | python3 -c "import sys,json;print(json.load(sys.stdin).get('state',''))" 2>/dev/null)
echo "state extracted: ${STATE:0:30}..."

echo "=== 3. Dev consent page reachable ==="
curl -s -o /dev/null -w "consent page HTTP:%{http_code}\n" "$BASE/auth/dev/google-consent?state=$STATE"

echo "=== 4. Google dev callback (simulated consent) ==="
CB_HEADERS=$(curl -s -D - -o /dev/null "$BASE/api/auth/callback/google?dev=1&code=dev-mock-code&state=$STATE&dev_email=demo.google@acquisitionos.local&dev_name=Demo%20Google%20User")
echo "$CB_HEADERS" | grep -iE "^(HTTP|location|set-cookie: (access_token|refresh_token|auth)" | sed 's/=.*/=<...>/' | head -8
echo "$CB_HEADERS" | grep -c "set-cookie: access_token=" | xargs echo "access_token cookie set (count):"

echo "=== 5. /api/auth/me with the Google session cookies ==="
curl -s -c /tmp/gcookies.txt -o /dev/null "$BASE/api/auth/callback/google?dev=1&code=dev-mock-code&state=$STATE&dev_email=demo.google@acquisitionos.local&dev_name=Demo%20Google%20User"
curl -s -b /tmp/gcookies.txt "$BASE/api/auth/me" | head -c 300; echo

echo "=== 6. OTP login: request (was deliveryIssue, should return devDelivery.code) ==="
OTP_RES=$(curl -s -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}")
echo "$OTP_RES" | head -c 400; echo
OTP_CODE=$(echo "$OTP_RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['devDelivery']['code'])" 2>/dev/null)
echo "OTP code: $OTP_CODE"
echo "--- OTP verify with delivered code ---"
curl -s -c "$JAR" -o /dev/null -w "otp/verify HTTP:%{http_code}\n" -X POST "$BASE/api/auth/otp/verify" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP_CODE\"}"
curl -s -b "$JAR" "$BASE/api/auth/me" | head -c 200; echo

echo "=== 7. Magic link: request (was deliveryIssue, should return devDelivery.url) ==="
ML_RES=$(curl -s -X POST "$BASE/api/auth/magic-link/request" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}")
echo "$ML_RES" | head -c 400; echo
ML_URL=$(echo "$ML_RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['devDelivery']['url'])" 2>/dev/null)
echo "magic link: ${ML_URL:0:100}..."
echo "--- Magic link verify (follow redirect) ---"
curl -s -c /tmp/mlcookies.txt -o /dev/null -w "magic-link/verify HTTP:%{http_code} redirect:%{redirect_url}\n" "$ML_URL" | sed 's/=.*/=<...>/'
curl -s -b /tmp/mlcookies.txt "$BASE/api/auth/me" | head -c 200; echo

echo "=== 8. Forgot password: request (should return devDelivery.code) ==="
FP_RES=$(curl -s -X POST "$BASE/api/auth/forgot-password" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}")
echo "$FP_RES" | head -c 300; echo
FP_CODE=$(echo "$FP_RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['devDelivery']['code'])" 2>/dev/null)
echo "reset code: $FP_CODE"
echo "--- reset-password with delivered code ---"
curl -s -X POST "$BASE/api/auth/reset-password" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"$FP_CODE\",\"newPassword\":\"$PASS\"}" | head -c 200; echo

echo "=== 9. Signup: new account (was dead-end, should return devDelivery.code) ==="
SU_RES=$(curl -s -X POST "$BASE/api/auth/signup" -H 'Content-Type: application/json' \
  -d "{\"name\":\"E2E Dev Test\",\"email\":\"$NEWEMAIL\",\"password\":\"$NEWPASS\"}")
echo "$SU_RES" | head -c 400; echo
SU_CODE=$(echo "$SU_RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['devDelivery']['code'])" 2>/dev/null)
echo "verification code: $SU_CODE"
echo "--- verify-email with delivered code ---"
curl -s -X POST "$BASE/api/auth/verify-email" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$NEWEMAIL\",\"otp\":\"$SU_CODE\"}" | head -c 200; echo
echo "--- signin with the new account ---"
curl -s -X POST "$BASE/api/auth/signin" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$NEWEMAIL\",\"password\":\"$NEWPASS\"}" | head -c 200; echo

echo "=== DONE ==="
