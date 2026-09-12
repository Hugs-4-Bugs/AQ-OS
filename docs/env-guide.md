# AcquisitionOS — Environment Variable Reference

Complete reference for all environment variables used in AcquisitionOS.

## Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 | Required — Application will not start without this |
| 🟡 | Recommended — Important for production |
| 🟢 | Optional — Has sensible default |

---

## Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_APP_URL` | 🔴 Required | — | Public URL where the app is accessible (e.g., `https://app.example.com`) |
| `NODE_ENV` | 🟢 Optional | `development` | Runtime environment: `development` or `production` |
| `PORT` | 🟢 Optional | `3000` | HTTP server port |
| `NODE_OPTIONS` | 🟢 Optional | — | Node.js CLI options (e.g., `--max-old-space-size=1024`) |

### Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXTAUTH_URL` | 🔴 Required | — | NextAuth.js callback URL. Must match `NEXT_PUBLIC_APP_URL` |
| `NEXTAUTH_SECRET` | 🔴 Required | — | Encryption key for NextAuth sessions. Generate: `openssl rand -base64 32` |
| `JWT_SECRET` | 🔴 Required | — | JWT token signing key. Generate: `openssl rand -base64 32` |

---

## Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | 🔴 Required | — | Database connection string. SQLite: `file:./db/custom.db`, PostgreSQL: `postgresql://user:pass@host:5432/db` |

### Docker PostgreSQL

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_USER` | 🟡 Recommended | `acquisitionos` | PostgreSQL superuser username (Docker) |
| `POSTGRES_PASSWORD` | 🟡 Recommended | `acquisitionos_secret` | PostgreSQL superuser password (Docker) — **change in production** |
| `POSTGRES_DB` | 🟢 Optional | `acquisitionos` | PostgreSQL database name (Docker) |

---

## Redis

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | 🟢 Optional | — | Redis connection URL (e.g., `redis://localhost:6379`). App works without Redis. |

---

## SMTP / Email

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | 🔴 Required | — | SMTP server hostname (e.g., `smtp.gmail.com`) |
| `SMTP_PORT` | 🟢 Optional | `587` | SMTP port. `587` for TLS, `465` for SSL |
| `SMTP_USER` | 🔴 Required | — | SMTP authentication username |
| `SMTP_PASSWORD` | 🔴 Required | — | SMTP authentication password (use app-specific password for Gmail) |
| `SMTP_FROM` | 🔴 Required | — | Sender email address for outgoing emails |

### Resend (Alternative Email Provider)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | 🟢 Optional | — | Resend API key. If set, Resend is tried before SMTP |

---

## Google OAuth

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | 🔴 Required | — | Google OAuth Client ID. Get from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | 🔴 Required | — | Google OAuth Client Secret |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | 🔴 Required | — | Same as `GOOGLE_CLIENT_ID` (exposed to client for OAuth popup) |

---

## Payments — Stripe

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_PUBLISHABLE_KEY` | 🟡 Recommended | — | Stripe publishable key (starts with `pk_test_` or `pk_live_`) |
| `STRIPE_SECRET_KEY` | 🟡 Recommended | — | Stripe secret key (starts with `sk_test_` or `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | 🟡 Recommended | — | Stripe webhook signing secret (starts with `whsec_`). Required for payment processing. |

## Payments — Razorpay (India)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RAZORPAY_KEY_ID` | 🟢 Optional | — | Razorpay key ID (starts with `rzp_test_` or `rzp_live_`) |
| `RAZORPAY_KEY_SECRET` | 🟢 Optional | — | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | 🟢 Optional | — | Razorpay webhook signing secret |

---

## Cron Jobs

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CRON_SECRET` | 🔴 Required | — | Bearer token for authenticating cron job requests to `/api/cron/*`. Generate: `openssl rand -hex 32` |

---

## Auth Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_DEV_MODE` | 🟢 Optional | `false` | Enable developer bypasses. **MUST be `false` in production.** |
| `AUTH_AUTO_VERIFY` | 🟢 Optional | `false` | Auto-verify emails without sending. **MUST be `false` in production.** |
| `AUTH_DEV_OTP_IN_RESPONSE` | 🟢 Optional | `false` | Return OTP in API response. **MUST be `false` in production.** |
| `AUTH_DEV_OTP_IN_LOG` | 🟢 Optional | `false` | Log OTPs to console. **MUST be `false` in production.** |

> ⚠️ **Security Warning**: Setting any `AUTH_DEV_*` variable to `true` in production creates severe security vulnerabilities. These are for local development only.

---

## Integrations — Telegram

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | 🟢 Optional | — | Telegram Bot API token. Create bot at [@BotFather](https://t.me/BotFather) |

## Integrations — WhatsApp

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | 🟢 Optional | — | WhatsApp Business API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | 🟢 Optional | — | WhatsApp phone number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | 🟢 Optional | — | WhatsApp Business Account ID |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | 🟢 Optional | — | WhatsApp webhook verification token |

---

## Observability

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | 🟢 Optional | — | Sentry DSN for error tracking |
| `SENTRY_AUTH_TOKEN` | 🟢 Optional | — | Sentry auth token for source map uploads |
| `LOG_LEVEL` | 🟢 Optional | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |

---

## Backup Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BACKUP_DIR` | 🟢 Optional | `./backups` | Directory for database backup files |
| `RETENTION_DAYS` | 🟢 Optional | `30` | Days to keep backup files before cleanup |
| `DB_TYPE` | 🟢 Optional | `sqlite` | Database type for backup/restore: `sqlite` or `postgres` |
| `SQLITE_DB_PATH` | 🟢 Optional | `./prisma/dev.db` | Path to SQLite database file |

---

## Quick Setup Commands

```bash
# Generate random secrets
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -hex 32)"
```

## Minimum Viable .env (Development)

```env
DATABASE_URL=file:./db/custom.db
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-in-production
JWT_SECRET=dev-jwt-secret-change-in-production
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id
CRON_SECRET=dev-cron-secret
AUTH_DEV_MODE=true
```

## Minimum Viable .env (Production)

```env
DATABASE_URL=postgresql://acquisitionos:STRONG_PASSWORD@postgres:5432/acquisitionos
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=<32-char-random-string>
JWT_SECRET=<32-char-random-string>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id
STRIPE_PUBLISHABLE_KEY=pk_live_xxxx
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
CRON_SECRET=<32-char-random-string>
AUTH_DEV_MODE=false
AUTH_AUTO_VERIFY=false
AUTH_DEV_OTP_IN_RESPONSE=false
AUTH_DEV_OTP_IN_LOG=false
REDIS_URL=redis://redis:6379
POSTGRES_PASSWORD=STRONG_PASSWORD
```
