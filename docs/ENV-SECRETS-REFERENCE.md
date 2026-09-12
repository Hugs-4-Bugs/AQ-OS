# AcquisitionOS — Environment & Secrets Reference

> **Version**: 2.0 | **Last Updated**: 2026-03-07 | **Owner**: Platform Team

Complete reference for all environment variables used by AcquisitionOS. Organized by category with sensitivity classification, requirement level, and usage notes.

> **Companion Docs**: [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) (detailed rotation procedures) | [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md) (setup guide) | [infra/secret-rotation.md](../infra/secret-rotation.md)

---

## Legend

| Marker | Meaning |
|--------|---------|
| 🔴 **Secret** | Cryptographic key or credential. Never commit to VCS. Store in vault/secrets manager. |
| 🟡 **Sensitive** | Non-critical credential but should not be exposed publicly. |
| 🟢 **Config** | Non-secret configuration value. Safe to commit. |
| ⚡ **Required** | Application will not start without this in production. |
| ○ | Optional but recommended. |

---

## Application

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `NODE_ENV` | 🟢 Config | ⚡ | `production` or `development`. Controls error handling, optimizations, and dev features. |
| `ENVIRONMENT` | 🟢 Config | ○ | Alias for NODE_ENV. Used in backend Python config. |
| `NEXT_PUBLIC_APP_URL` | 🟢 Config | ⚡ | Public URL for redirects. Format: `https://app.acquisitionos.com` |
| `FRONTEND_URL` | 🟢 Config | ○ | Frontend URL for CORS. Default: `http://localhost:3000` |
| `ALLOWED_ORIGINS` | 🟢 Config | ○ | Comma-separated CORS origins. Default: `http://localhost:3000` |

---

## Authentication

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `JWT_SECRET` | 🔴 Secret | ⚡ | Signs access tokens (15 min expiry). Generate: `openssl rand -base64 64`. **Must NOT be dev default.** |
| `JWT_REFRESH_SECRET` | 🔴 Secret | ⚡ | Signs refresh tokens (30 day expiry). Generate: `openssl rand -base64 64` |
| `JWT_SECRET_PREVIOUS` | 🔴 Secret | ○ | Previous JWT secret during rotation. 24-hour transition period. |
| `NEXTAUTH_SECRET` | 🔴 Secret | ○ | NextAuth.js encryption key. Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | 🟢 Config | ○ | NextAuth base URL. Must match Google OAuth redirect. |
| `TOKEN_ENCRYPTION_KEY` | 🔴 Secret | ⚡ | Fernet key for encrypting OAuth tokens at rest. Generate via `Fernet.generate_key()` |
| `AUTH_DEV_MODE` | 🟢 Config | ⚡ | Master dev flag. **Must be `false` in production.** |
| `AUTH_AUTO_VERIFY` | 🟢 Config | ⚡ | Auto-verify email. **Must be `false` in production.** |
| `AUTH_DEV_OTP_IN_RESPONSE` | 🟢 Config | ⚡ | Return OTP in API response. **Must be `false` in production.** |
| `AUTH_DEV_OTP_IN_LOG` | 🟢 Config | ⚡ | Log OTP to console. **Must be `false` in production.** |
| `AUTH_BYPASS_EMAIL` | 🟢 Config | ⚡ | Skip email sending. **Must be `false` in production.** |
| `ENABLE_GOOGLE_OAUTH` | 🟢 Config | ○ | Enable Google sign-in. Default: `false` |
| `ENABLE_MAGIC_LINK` | 🟢 Config | ○ | Enable magic link login. Default: `true` |
| `ENABLE_OTP_LOGIN` | 🟢 Config | ○ | Enable OTP login. Default: `true` |
| `OTP_MAX_ATTEMPTS` | 🟢 Config | ○ | Max OTP attempts before lockout. Default: `5` |
| `OTP_LOCKOUT_MINUTES` | 🟢 Config | ○ | Lockout duration. Default: `15` |

---

## Database (PostgreSQL)

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `DATABASE_URL` | 🟡 Sensitive | ⚡ | PostgreSQL connection string. Format: `postgresql://user:pass@host:5432/acquisitionos` |
| `DIRECT_URL` | 🟡 Sensitive | ○ | Direct DB connection for Prisma migrations (bypasses PgBouncer). Port 5432. |
| `READ_REPLICA_URL` | 🟡 Sensitive | ○ | Read replica URL for read/write splitting. |
| `POSTGRES_USER` | 🟡 Sensitive | ○ | PostgreSQL superuser for Docker. Default: `acquisitionos` |
| `POSTGRES_PASSWORD` | 🔴 Secret | ⚡ | PostgreSQL password. Generate: `openssl rand -base64 32` |
| `POSTGRES_DB` | 🟢 Config | ○ | Database name. Default: `acquisitionos` |

---

## Redis

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `REDIS_URL` | 🟡 Sensitive | ⚡ | Redis connection URL. Format: `redis://host:6379/0` |
| `REDIS_PASSWORD` | 🔴 Secret | ⚡ | Redis authentication password. Generate: `openssl rand -base64 32` |
| `REDIS_PUBSUB_PREFIX` | 🟢 Config | ○ | Pub/Sub channel prefix. Default: `acos:pubsub:` |

### Redis Database Allocation

| DB | Purpose |
|----|---------|
| 0 | Application cache, sessions, OTP, rate limiting |
| 1 | Celery broker (task queue) |
| 2 | Celery result backend |

---

## Celery (Background Jobs)

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `CELERY_BROKER_URL` | 🟡 Sensitive | ○ | Redis URL for Celery broker. Format: `redis://:pass@host:6379/1` |
| `CELERY_RESULT_BACKEND` | 🟡 Sensitive | ○ | Redis URL for results. Format: `redis://:pass@host:6379/2` |

---

## Google OAuth

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `GOOGLE_CLIENT_ID` | 🟢 Config | ○ | Google OAuth client ID. Format: `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | 🔴 Secret | ○ | Google OAuth client secret. Obtained from Google Cloud Console. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | 🟢 Config | ○ | Client-side Google ID (safe to expose). Same as `GOOGLE_CLIENT_ID`. |

### Required Redirect URIs in Google Cloud Console
- Sign-in: `https://app.acquisitionos.com/api/auth/google/callback`
- Gmail: `https://app.acquisitionos.com/api/integrations/google/callback`

---

## Gmail Integration

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `GMAIL_CLIENT_ID` | 🟢 Config | ○ | Separate OAuth client for Gmail API. |
| `GMAIL_CLIENT_SECRET` | 🔴 Secret | ○ | Separate OAuth secret for Gmail API. |
| `GMAIL_REDIRECT_URI` | 🟢 Config | ○ | Gmail OAuth callback URL. |
| `GOOGLE_PUBSUB_TOPIC` | 🟢 Config | ○ | Pub/Sub topic for push notifications. |
| `ENABLE_GMAIL_INTEGRATION` | 🟢 Config | ○ | Enable Gmail feature. Default: `false` |

---

## Payments — Stripe

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `STRIPE_SECRET_KEY` | 🔴 Secret | ○ | Stripe API key. Format: `sk_test_*` (test) or `sk_live_*` (live). |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 🟢 Config | ○ | Stripe public key. Format: `pk_test_*` or `pk_live_*`. Safe to expose. |
| `STRIPE_WEBHOOK_SECRET` | 🔴 Secret | ○ | Webhook signing secret. Format: `whsec_*`. |
| `STRIPE_PRICE_PRO_MONTHLY` | 🟢 Config | ○ | Stripe Price ID for Pro monthly plan. |
| `STRIPE_PRICE_PRO_YEARLY` | 🟢 Config | ○ | Stripe Price ID for Pro yearly plan. |
| `STRIPE_PRICE_ELITE_MONTHLY` | 🟢 Config | ○ | Stripe Price ID for Elite monthly plan. |
| `STRIPE_PRICE_ELITE_YEARLY` | 🟢 Config | ○ | Stripe Price ID for Elite yearly plan. |

---

## Payments — Razorpay

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `RAZORPAY_KEY_ID` | 🟢 Config | ○ | Razorpay key identifier. Format: `rzp_test_*` or `rzp_live_*`. |
| `RAZORPAY_KEY_SECRET` | 🔴 Secret | ○ | Razorpay API secret. |
| `RAZORPAY_WEBHOOK_SECRET` | 🔴 Secret | ○ | Razorpay webhook signing secret. |

---

## Payments — General

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `TRIAL_DAYS` | 🟢 Config | ○ | Free trial duration. Default: `14` |
| `GST_RATE` | 🟢 Config | ○ | GST rate for Indian users. Default: `0.18` |

---

## Email

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `SMTP_HOST` | 🟢 Config | ○ | SMTP server. Default: `smtp.gmail.com` |
| `SMTP_PORT` | 🟢 Config | ○ | SMTP port. Default: `587` |
| `SMTP_USER` | 🟡 Sensitive | ○ | SMTP username (email address). |
| `SMTP_PASS` | 🔴 Secret | ○ | SMTP password or app-specific password. |
| `SMTP_FROM_NAME` | 🟢 Config | ○ | Sender display name. Default: `AcquisitionOS` |
| `SMTP_FROM_EMAIL` | 🟢 Config | ○ | Sender email address. Default: `noreply@acquisitionos.com` |
| `RESEND_API_KEY` | 🔴 Secret | ○ | Resend API key (alternative to SMTP). Format: `re_*` |

> **Note**: At least one email delivery method must be configured (SMTP or Resend) for production.

---

## AI

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `ZAI_API_KEY` | 🔴 Secret | ⚡ | z-ai-web-dev-sdk API key. Powers all AI features. |
| `ANTHROPIC_API_KEY` | 🔴 Secret | ○ | Anthropic Claude API key. Used as fallback AI provider. |

---

## Messaging — Telegram

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | 🔴 Secret | ○ | Telegram Bot API token. From @BotFather. |
| `TELEGRAM_BOT_USERNAME` | 🟢 Config | ○ | Bot username. Format: `@AcquisitionOSBot` |
| `ENABLE_TELEGRAM` | 🟢 Config | ○ | Enable Telegram integration. Default: `false` |

---

## Messaging — WhatsApp

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `META_WHATSAPP_TOKEN` | 🔴 Secret | ○ | WhatsApp Business API token. Auto-expires in 60 days. |
| `META_WHATSAPP_PHONE_ID` | 🟢 Config | ○ | WhatsApp phone number ID. |
| `META_WEBHOOK_VERIFY_TOKEN` | 🔴 Secret | ○ | Webhook verification token. Generate: `openssl rand -hex 16` |
| `META_APP_SECRET` | 🔴 Secret | ○ | Meta app secret for webhook signatures. |
| `TWILIO_ACCOUNT_SID` | 🟢 Config | ○ | Twilio account identifier. |
| `TWILIO_AUTH_TOKEN` | 🔴 Secret | ○ | Twilio authentication token. |
| `TWILIO_WHATSAPP_NUMBER` | 🟢 Config | ○ | WhatsApp sandbox number. Format: `whatsapp:+14155238886` |
| `ENABLE_WHATSAPP` | 🟢 Config | ○ | Enable WhatsApp integration. Default: `false` |

---

## Monitoring & Observability

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `SENTRY_DSN` | 🟡 Sensitive | ○ | Sentry error tracking DSN. Format: `https://key@sentry.io/project` |
| `SENTRY_TRACES_SAMPLE_RATE` | 🟢 Config | ○ | Sentry trace sampling. Default: `0.1` (10%) |

---

## WebSocket / Real-Time

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `WS_HEARTBEAT_INTERVAL` | 🟢 Config | ○ | Heartbeat interval (ms). Default: `30000` |
| `WS_RECONNECT_LIMIT` | 🟢 Config | ○ | Max reconnect attempts. Default: `5` |
| `SSE_TIMEOUT` | 🟢 Config | ○ | SSE timeout (ms). Default: `300000` |
| `NOTIFICATION_BATCH_SIZE` | 🟢 Config | ○ | Batch size for notifications. Default: `50` |

---

## Security

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `MAX_LOGIN_ATTEMPTS` | 🟢 Config | ○ | Max login attempts before lockout. Default: `5` |
| `LOGIN_LOCKOUT_MINUTES` | 🟢 Config | ○ | Lockout duration. Default: `15` |
| `RATE_LIMIT_AUTH` | 🟢 Config | ○ | Auth endpoint rate limit. Default: `5/minute` |
| `RATE_LIMIT_AI` | 🟢 Config | ○ | AI endpoint rate limit. Default: `30/minute` |
| `RATE_LIMIT_SCRAPING` | 🟢 Config | ○ | Scraping rate limit. Default: `10/minute` |
| `RATE_LIMIT_GENERAL` | 🟢 Config | ○ | General rate limit. Default: `200/minute` |

---

## Workflows

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `WORKFLOW_MAX_RETRIES` | 🟢 Config | ○ | Max retry attempts. Default: `3` |
| `WORKFLOW_TIMEOUT` | 🟢 Config | ○ | Execution timeout (ms). Default: `300000` |
| `WORKFLOW_QUEUE_SIZE` | 🟢 Config | ○ | Max queue size. Default: `1000` |
| `WORKFLOW_RETENTION_DAYS` | 🟢 Config | ○ | History retention (days). Default: `90` |
| `WORKFLOW_DLQ_SIZE` | 🟢 Config | ○ | Dead letter queue size. Default: `500` |

---

## Lead Discovery

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `DISCOVERY_MAX_CONCURRENT_JOBS` | 🟢 Config | ○ | Max concurrent jobs per user. Default: `3` |
| `DISCOVERY_RESULTS_PER_JOB` | 🟢 Config | ○ | Max results per job. Default: `50` |
| `ENRICHMENT_TIMEOUT_MS` | 🟢 Config | ○ | Enrichment timeout. Default: `30000` |
| `SCRAPING_USER_AGENT` | 🟢 Config | ○ | User-Agent for scraping. Default: `AcquisitionOS/1.0` |
| `IMPORT_MAX_ROWS` | 🟢 Config | ○ | Max CSV import rows. Default: `1000` |
| `EXPORT_MAX_ROWS` | 🟢 Config | ○ | Max export rows. Default: `5000` |

---

## CI/CD (GitHub Secrets)

These are stored as **GitHub Secrets**, not in `.env`:

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `STAGING_DEPLOY_KEY` | 🔴 Secret | ○ | SSH key for staging server. |
| `STAGING_HOST` | 🟢 Config | ○ | Staging server hostname. |
| `STAGING_USER` | 🟢 Config | ○ | SSH user for staging. |
| `STAGING_URL` | 🟢 Config | ○ | Staging URL for health checks. |
| `PROD_DEPLOY_KEY` | 🔴 Secret | ○ | SSH key for production server. |
| `PROD_HOST` | 🟢 Config | ○ | Production server hostname. |
| `PROD_USER` | 🟢 Config | ○ | SSH user for production. |
| `PROD_URL` | 🟢 Config | ○ | Production URL for health checks. |
| `SLACK_WEBHOOK_URL` | 🟡 Sensitive | ○ | Slack webhook for deploy notifications. |

---

## Storage

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | 🔴 Secret | ○ | AWS access key for S3. |
| `AWS_SECRET_ACCESS_KEY` | 🔴 Secret | ○ | AWS secret key for S3. |
| `AWS_S3_BUCKET` | 🟢 Config | ○ | S3 bucket name. Default: `acquisitionos-assets` |
| `AWS_REGION` | 🟢 Config | ○ | AWS region. Default: `ap-south-1` |
| `CLOUDFLARE_R2_ENDPOINT` | 🟢 Config | ○ | Cloudflare R2 endpoint (S3-compatible). |

---

## Quick Environment Verification

```bash
#!/bin/bash
# verify-env.sh — Check all required variables are set

REQUIRED=("DATABASE_URL" "JWT_SECRET" "JWT_REFRESH_SECRET" "TOKEN_ENCRYPTION_KEY"
           "ZAI_API_KEY" "NODE_ENV" "REDIS_URL")

echo "=== Environment Verification ==="
FAIL=0
for var in "${REQUIRED[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ MISSING: $var"
    FAIL=$((FAIL+1))
  else
    echo "✅ SET: $var (${#!var} chars)"
  fi
done

[ "$NODE_ENV" != "production" ] && echo "❌ NODE_ENV is not production!" && FAIL=$((FAIL+1))
[ "$AUTH_DEV_MODE" = "true" ] && echo "❌ AUTH_DEV_MODE is true in production!" && FAIL=$((FAIL+1))
[ "$JWT_SECRET" = "acquisitionos-dev-secret-change-in-production" ] && echo "❌ JWT_SECRET is dev default!" && FAIL=$((FAIL+1))

[ $FAIL -eq 0 ] && echo "✅ All required variables verified" || echo "❌ $FAIL issue(s) found — DO NOT DEPLOY"
```

---

## Secret Rotation Schedule Summary

| Secret | Frequency | Downtime | See |
|--------|-----------|---------|-----|
| `JWT_SECRET` | 90 days | None (dual-key) | [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) §16 |
| `JWT_REFRESH_SECRET` | 90 days | None (dual-key) | [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) §16 |
| `TOKEN_ENCRYPTION_KEY` | 180 days | None (script re-encrypt) | [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) §14 |
| `STRIPE_SECRET_KEY` | 180 days | None | [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) §6 |
| `RAZORPAY_KEY_SECRET` | 180 days | None | [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) §7 |
| `REDIS_PASSWORD` | 90 days | Brief (<30s) | [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) §5 |
| `GOOGLE_CLIENT_SECRET` | 365 days | Brief | [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) §8 |
| `META_WHATSAPP_TOKEN` | 60 days | Brief | [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) §12 |
