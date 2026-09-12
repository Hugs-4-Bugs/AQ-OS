#!/bin/bash
# Resilient auth-flow test suite — restarts server if killed, runs all tests, saves results
RESULTS=/home/z/my-project/scripts/auth-test-results.txt
: > "$RESULTS"

ensure_server() {
  for i in 1 2 3; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ --max-time 10)
    if [ "$CODE" = "200" ]; then return 0; fi
    cd /home/z/my-project
    pkill -9 -f 'next' 2>/dev/null; sleep 1
    setsid npx next dev -p 3000 > dev.log 2>&1 &
    sleep 20
  done
}

req() { # method path data label
  for attempt in 1 2 3; do
    ensure_server
    OUT=$(curl -s -w '\n__HTTP__%{http_code}' -X "$1" "http://localhost:3000$2" -H 'Content-Type: application/json' ${3:+-d "$3"} --max-time 45)
    BODY=$(echo "$OUT" | sed 's/__HTTP__.*//')
    CODE=$(echo "$OUT" | rg -o '__HTTP__[0-9]+' | rg -o '[0-9]+')
    if [ -n "$CODE" ] && [ "$CODE" != "000" ]; then
      echo "== $4 => HTTP $CODE" >> "$RESULTS"
      echo "$BODY" | head -c 500 >> "$RESULTS"
      echo >> "$RESULTS"
      return 0
    fi
    sleep 2
  done
  echo "== $4 => FAILED (server unreachable after 3 attempts)" >> "$RESULTS"
}

req POST /api/auth/signup '{"name":"Katty","email":"kattyboy785@gmail.com","password":"SomePass123!"}' "B: signup w/ Google-registered email (expect 409 emailRegistered)"
req POST /api/auth/signin '{"email":"kattyboy785@gmail.com","password":"Whatever123!"}' "C: signin w/ Google-only account (expect 409 noPasswordSet+suggestedMethods)"
req POST /api/auth/signin '{"email":"testsignup-check-1788938079@gmail.com","password":"TestPass123!"}' "D: signin w/ unverified pw account (expect 403 emailNotVerified+resent)"
req POST /api/auth/otp/request '{"email":"kattyboy785@gmail.com"}' "E: OTP request for Google-registered email (expect 200)"
req POST /api/auth/magic-link/request '{"email":"kattyboy785@gmail.com"}' "F: magic link for Google-registered email (expect 200)"
echo DONE >> "$RESULTS"
cat "$RESULTS"
