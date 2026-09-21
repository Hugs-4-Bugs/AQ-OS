#!/bin/bash
# Probe which redirect URIs are registered in Google Cloud Console
# for client 22873135381-rha5u0opkhc4q8ja1a0a91mq8m6emfbi.
# A REGISTERED redirect_uri → Google shows the sign-in page (HTTP 200, no error).
# An UNREGISTERED redirect_uri → Google shows redirect_uri_mismatch error page.

CLIENT_ID="22873135381-rha5u0opkhc4q8ja1a0a91mq8m6emfbi.apps.googleusercontent.com"
CUR="https://preview-chat-9232d24b-5032-48c7-b56f-c132c2f15528.space-z.ai"
OLD="https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai"
PROD="https://acquisition.space-z.ai"

probe() {
  local label="$1"; local uri="$2"
  local enc=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$uri")
  local url="https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${enc}&response_type=code&scope=openid%20email%20profile&state=probe&client_type=web"
  local body=$(curl -s -m 20 -L "$url" 2>/dev/null)
  if echo "$body" | grep -qi "redirect_uri_mismatch\|redirect URI mismatch\|invalid redirect\|authError"; then
    echo "$label : MISMATCH (not registered)"
  elif echo "$body" | grep -qi "accounts.google.com/signin\|Sign in\|Choose an account\|gsi_\|SignInPage"; then
    echo "$label : ACCEPTED (registered)"
  else
    local len=${#body}
    echo "$label : UNKNOWN (body ${len} bytes) — inspect manually"
  fi
}

probe "PROD   /api/auth/callback/google" "$PROD/api/auth/callback/google"
probe "PROD   /api/auth/google/callback"  "$PROD/api/auth/google/callback"
probe "CUR    /api/auth/callback/google" "$CUR/api/auth/callback/google"
probe "CUR    /api/auth/google/callback"  "$CUR/api/auth/google/callback"
probe "OLD    /api/auth/callback/google" "$OLD/api/auth/callback/google"
probe "localhost:3000/api/auth/callback/google" "http://localhost:3000/api/auth/callback/google"
