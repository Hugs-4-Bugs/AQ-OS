#!/bin/bash
# REAL runtime auth verification against the running dev server (localhost:3000).
# NO bypasses, NO mock creds — only documented QA fixture + real endpoints.
# Security note: prints only HTTP codes, cookie NAMES, and non-secret JSON.
BASE="http://localhost:3000"
JAR="/home/z/my-project/.test-tmp/runtime-auth-cookies.txt"
mkdir -p "$(dirname "$JAR")"; rm -f "$JAR"
QA_EMAIL="preview.verify@acquisitionos.local"
QA_PASS='PreviewVerify#2026'

echo "=== 1. GET /api/auth/config (provider availability) ==="
curl -s "$BASE/api/auth/config" | head -c 500; echo

echo; echo "=== 2. REAL password login (documented QA fixture, real code path) ==="
HTTP=$(curl -s -c "$JAR" -o /tmp/pw-body.json -w "%{http_code}" -X POST "$BASE/api/auth/signin" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$QA_EMAIL\",\"password\":\"$QA_PASS\"}")
echo "signin HTTP:$HTTP"
head -c 200 /tmp/pw-body.json; echo
echo "cookies set: $(grep -oE '^HttpOnly_[0-9]+\s+\S+\s+\S+$' "$JAR" >/dev/null 2>&1 && grep -cE '.' "$JAR" || grep -cE '.' "$JAR") lines; names:"
awk 'NR>6 {print $6}' "$JAR" 2>/dev/null | sort -u | tr '\n' ' '; echo

echo; echo "=== 3. GET /api/auth/me with session cookie (authenticated probe) ==="
curl -s -b "$JAR" -o /tmp/me-body.json -w "me HTTP:%{http_code}\n" "$BASE/api/auth/me"
head -c 300 /tmp/me-body.json; echo

echo; echo "=== 4. WRONG-password attempt (must be truthfully rejected) ==="
HTTP2=$(curl -s -o /tmp/pw-bad.json -w "%{http_code}" -X POST "$BASE/api/auth/signin" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$QA_EMAIL\",\"password\":\"Definitely-Wrong-Password\"}")
echo "wrong-password signin HTTP:$HTTP2"
head -c 200 /tmp/pw-bad.json; echo

echo; echo "=== 5. Dev-bypass probes (MUST be inactive; AUTH_DEV_MODE=false) ==="
echo "--- 5a. Google dev callback (dev=1) must NOT mint a session ---"
DHC=$(curl -s -c /tmp/devcb.txt -o /tmp/devcb-body.txt -w "%{http_code}" \
  "$BASE/api/auth/callback/google?dev=1&code=dev-mock-code&state=bogus-state-value")
echo "dev-callback HTTP:$DHC  body:"; head -c 200 /tmp/devcb-body.txt; echo
echo "session cookies from dev callback: $(awk 'NR>6 {print $6}' /tmp/devcb.txt 2>/dev/null | sort -u | tr '\n' ' ') (empty = correctly refused)"

echo "--- 5b. OTP request must NOT return devDelivery (real SMTP only) ---"
OTP=$(curl -s -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d "{\"email\":\"$QA_EMAIL\"}")
echo "$OTP" | head -c 300; echo
echo "$OTP" | grep -q devDelivery && echo "BYPASS ACTIVE (BAD)" || echo "no devDelivery in response (bypass correctly inactive)"

echo; echo "=== 6. Google OAuth initiation (live redirect construction) ==="
curl -s -o /dev/null -D /tmp/goog-h.txt "$BASE/api/auth/google"
LOC=$(grep -i '^location:' /tmp/goog-h.txt | tr -d '\r')
echo "$LOC" | head -c 400; echo
python3 - "$LOC" <<'PY'
import sys, urllib.parse as up
loc = sys.argv[1].split(' ',1)[-1].strip()
q = up.parse_qs(up.urlparse(loc).query)
print('authorize host:', up.urlparse(loc).netloc)
print('client_id len:', len(q.get('client_id',[''])[0]), '| redirect_uri:', q.get('redirect_uri',[''])[0], '| scope:', q.get('scope',[''])[0])
PY

echo; echo "=== 7. Magic-link request (same SMTP dependency, real path) ==="
curl -s -X POST "$BASE/api/auth/magic-link/request" -H 'Content-Type: application/json' -d "{\"email\":\"$QA_EMAIL\"}" | head -c 200; echo
echo; echo "No secrets printed."
