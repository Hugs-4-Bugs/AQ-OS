#!/bin/bash
# ───────────────────────────────────────────────────────────────────
# Preserve SMTP_PASSWORD and other secrets from existing .env before
# overwriting. The keepalive script runs this periodically, and without
# preservation, the SMTP password (and any other manually-added secrets)
# would be wiped on every restart.
# ───────────────────────────────────────────────────────────────────

PRESERVE_KEYS=(
  SMTP_PASSWORD
  SMTP_PASS
  GMAIL_APP_PASSWORD
  GMAIL_PASSWORD
  RESEND_API_KEY
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  CRON_SECRET
  JWT_SECRET
  JWT_REFRESH_SECRET
  NEXTAUTH_SECRET
)

# Extract values from existing .env (if present)
PRESERVED_LINES=""
if [ -f /home/z/my-project/.env ]; then
  for KEY in "${PRESERVE_KEYS[@]}"; do
    VAL=$(grep "^${KEY}=" /home/z/my-project/.env 2>/dev/null | head -1 | cut -d'=' -f2-)
    if [ -n "$VAL" ]; then
      PRESERVED_LINES="${PRESERVED_LINES}${KEY}=${VAL}\n"
    fi
  done
fi

# Write the base .env
cat > /home/z/my-project/.env << 'INNEOF'
DATABASE_URL=file:/home/z/my-project/db/custom.db
JWT_SECRET=acquisitionos-jwt-secret-key-2024-production
JWT_REFRESH_SECRET=acquisitionos-jwt-refresh-secret-2024
NEXTAUTH_SECRET=acquisitionos-nextauth-secret-2024
NEXTAUTH_URL=https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai
NEXT_PUBLIC_APP_URL=https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai
GOOGLE_CLIENT_ID=22873135381-rha5u0opkhc4q8ja1a0a91mq8m6emfbi.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=mailtoprabhat72@gmail.com
GMAIL_USER=mailtoprabhat72@gmail.com
EMAIL_FROM=mailtoprabhat72@gmail.com
APP_URL=https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai
CRON_SECRET=acquisitionos-cron-dev
GOOGLE_SEARCH_API_KEY=AIzaSyAMxBh8nME6WVNfN5DVNiF6kXVF6KLdI0w
GOOGLE_SEARCH_CX=5429229508a304918
AUTH_DEV_MODE=false
AUTH_AUTO_VERIFY=false
AUTH_DEV_OTP_IN_RESPONSE=false
AUTH_DEV_OTP_IN_LOG=false
AUTH_BYPASS_EMAIL=false
ENABLE_GOOGLE_OAUTH=true
ENABLE_MAGIC_LINK=true
ENABLE_OTP_LOGIN=true
INNEOF

# Append preserved secrets (if any were found)
if [ -n "$PRESERVED_LINES" ]; then
  printf "$PRESERVED_LINES" >> /home/z/my-project/.env
fi

# ───────────────────────────────────────────────────────────────────
# Fallback defaults — applied ONLY if the key is absent from both the
# base template and the preserved lines. Keeps the app in a usable
# state after a full sandbox env wipe. User-supplied values in .env
# or the Secrets panel always win over these defaults.
# NOTE: the default Gmail App Password below may still be rejected by
# Google (535 BadCredentials) if revoked — re-test after user supplies
# a fresh App Password.
# ───────────────────────────────────────────────────────────────────
add_default() {
  local KEY="$1"; local VAL="$2"
  if ! grep -q "^${KEY}=" /home/z/my-project/.env 2>/dev/null; then
    printf '%s=%s\n' "$KEY" "$VAL" >> /home/z/my-project/.env
  fi
}
add_default SMTP_PASSWORD "fisi rpdl rgen yark"
add_default SMTP_PASS "fisi rpdl rgen yark"
add_default GMAIL_APP_PASSWORD "fisi rpdl rgen yark"
add_default SMTP_USER "mailtoprabhat72@gmail.com"
add_default GMAIL_USER "mailtoprabhat72@gmail.com"
add_default SMTP_FROM "mailtoprabhat72@gmail.com"
add_default EMAIL_FROM "mailtoprabhat72@gmail.com"
add_default CRON_SECRET "acquisitionos-cron-dev"

chmod 600 /home/z/my-project/.env
