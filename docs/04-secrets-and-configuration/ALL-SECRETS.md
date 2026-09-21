# ALL SECRETS & ENVIRONMENT VARIABLES — Complete Reference

> **Every name below is taken from the actual source code** (`src/lib/*.ts`, `ensure-env.sh` template), not guessed. Where a commonly expected name does NOT match the code, it is called out explicitly. Canonical names are what `ensure-env.sh` writes — use them.

## Quick reality checks (read first)

1. **The app does NOT use `AUTH_SECRET`.** Sessions use **`JWT_SECRET` + `JWT_REFRESH_SECRET`** (`src/lib/auth.ts`). `NEXTAUTH_SECRET` is present in the env template for interop but the custom JWT layer is what matters.
2. **Stripe Price IDs are NOT required.** Checkout uses `price_data` with amounts hardcoded in `src/lib/stripe-service.ts` (`PLAN_PRICES_USD`: pro $29/mo · elite $89/mo; INR equivalents). Only the Stripe keys + webhook secret are env vars.
3. **Gmail SMTP password lives in `SMTP_PASSWORD`** (the reader accepts 9 aliases; canonical is `SMTP_PASSWORD`).
4. **Telegram/WhatsApp credentials are per-user in the database** (`TelegramConfig`/`WhatsappConfig`, entered in the app UI and encrypted) — platform-level env vars are optional conveniences/fallbacks.
5. `GEMINI_API_KEY` / `Z_AI_KEY` are **not read anywhere in the code**. The AI chain uses the built-in Z-AI SDK (no key) with `OPENAI_API_KEY` as fallback.

---

## AUTHENTICATION & SESSIONS

| Variable | Required | Purpose | How to get | Example format |
|---|---|---|---|---|
| `JWT_SECRET` | **REQUIRED** | Signs short-lived access-token cookies (HS256 via jose/jsonwebtoken). Missing → "session init failed" | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 64-char hex string |
| `JWT_REFRESH_SECRET` | **REQUIRED** | Signs long-lived refresh tokens (rotation + `UserSession` rows) | Same generator, use a different value | 64-char hex string |
| `NEXTAUTH_SECRET` | Optional | Interop/compat only (template keeps it aligned with JWT_SECRET) | Same generator | 64-char hex |
| `NEXTAUTH_URL` | Optional | NextAuth-style base URL; used as fallback in some Stripe URL building | Your public URL | `https://app.example.com` |
| `DATABASE_URL` | **REQUIRED** | Prisma datasource. SQLite in dev, PostgreSQL in production | Dev: `file:./dev.db`. Prod: from your Postgres provider | `postgresql://user:pass@host:5432/dbname` |

## APP URLS

| Variable | Required | Purpose | How to get | Example format |
|---|---|---|---|---|
| `APP_URL` | **REQUIRED (prod)** | Canonical public URL: Stripe success/cancel URLs, email links, OAuth last-resort fallback | The domain users visit | `https://app.example.com` (no trailing slash) |
| `NEXT_PUBLIC_APP_URL` | **REQUIRED (prod)** | Same as APP_URL but exposed to the browser bundle; also used in Stripe URL building | Same value as APP_URL | `https://app.example.com` |

> Note: Google OAuth does NOT depend on these anymore — it resolves the origin from request headers (`x-forwarded-host` etc.). But Stripe URLs and email links DO.

## GOOGLE OAUTH (sign-in + integrations)

| Variable | Required | Purpose | How to get | Example format |
|---|---|---|---|---|
| `GOOGLE_CLIENT_ID` | **REQUIRED for Google login** | OAuth 2.0 client id for sign-in and Calendar/Gmail integrations | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client (Web application) | `1234567890-abc123.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | **REQUIRED for Google login** | Client secret paired with the id | Same console page | `GOCSPX-xxxxxxxxxxxxxxxx` |
| `ENABLE_GOOGLE_OAUTH` | Optional | Feature flag surfaced in `/api/auth/config` | Set `true` | `true` |

Plus **GCP Console registration** (not an env var): each domain's `/api/auth/callback/google` must be in *Authorized redirect URIs* — see `GOOGLE-CLOUD-SETUP.md`.

## EMAIL / SMTP (outbound email)

| Variable | Required | Purpose | How to get | Example format |
|---|---|---|---|---|
| `SMTP_HOST` | REQUIRED for real email | SMTP server host | `smtp.gmail.com` for Gmail | `smtp.gmail.com` |
| `SMTP_PORT` | REQUIRED for real email | SMTP port (587 = STARTTLS) | 587 for Gmail | `587` |
| `SMTP_USER` | **REQUIRED** | Sending mailbox address (canonical alias; code also accepts `SMTP_USERNAME`, `GMAIL_USER`, `EMAIL_USER`, `EMAIL_USERNAME`, `MAIL_USER`, `MAIL_USERNAME`) | Your Gmail address | `you@gmail.com` |
| `SMTP_PASSWORD` | **REQUIRED** | **Gmail App Password** — 16 characters, **stored without spaces**. NOT the Google login password. (Code aliases: `SMTP_PASS`, `SMTP_AUTH_PASSWORD`, `GMAIL_APP_PASSWORD`, `GMAIL_PASSWORD`, `EMAIL_PASSWORD`, `EMAIL_PASS`, `MAIL_PASSWORD`, `MAIL_PASS`) | Google Account → Security → 2-Step Verification → App passwords | `abcdefghijklmnop` (16 chars, no spaces — never write the real value in docs) |
| `EMAIL_FROM` | **REQUIRED** | From-header address. For Gmail use the same mailbox as SMTP_USER (mismatch → SPF/DKIM failures) | Same as SMTP_USER | `you@gmail.com` |
| `RESEND_API_KEY` | Optional | Tier-1 email transport (Resend API) — used before SMTP if present | resend.com API keys | `re_xxxxxxxxxx` |

Transport chain: Resend → Gmail SMTP → Ethereal (dev sink). Capability check: `GET /api/auth/config` → `emailConfigured:true`.

## LEAD DISCOVERY

| Variable | Required | Purpose | How to get | Example format |
|---|---|---|---|---|
| `GOOGLE_SEARCH_API_KEY` | REQUIRED for discovery | Custom Search JSON API key | Google Cloud Console → APIs → Enable *Custom Search API* → Credentials → API key | `AIzaSy...` |
| `GOOGLE_SEARCH_ENGINE_ID` | REQUIRED for discovery | Programmable Search Engine id (the code reads `GOOGLE_SEARCH_ENGINE_ID`; `ensure-env.sh` writes it as `GOOGLE_SEARCH_CX` — keep both aligned) | programmablesearchengine.google.com → your engine → Search engine ID | `8f2a1c9e3b7d44a21` (or `xxxxxxxxxxxx:yyyyyy`) |
| `SERPAPI_KEY` | Optional | Fallback search provider when Google keys absent | serpapi.com dashboard | 64-char hex |

## STRIPE PAYMENTS

| Variable | Required | Purpose | How to get | Example format |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | REQUIRED for payments | Server-side Stripe API key | Stripe Dashboard → Developers → API keys | `sk_test_...` / `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | REQUIRED for payments | Verifies webhook signatures at `/api/payments/webhook/stripe` | Stripe → Developers → Webhooks → your endpoint → Signing secret | `whsec_...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Optional | Exposed via `/api/payments/provider-status` for client integrations | Stripe → API keys | `pk_test_...` / `pk_live_...` |
| `STRIPE_SUCCESS_URL` | Optional | Override post-checkout redirect (default: `APP_URL + /billing?session_id={CHECKOUT_SESSION_ID}&status=success`) | Optional | `https://app.example.com/billing?session_id={CHECKOUT_SESSION_ID}&status=success` |
| `STRIPE_CANCEL_URL` | Optional | Override cancel redirect (default: `APP_URL + /billing?status=cancelled`) | Optional | full URL |
| ~~`STRIPE_PRICE_*_ID`~~ | **NOT USED** | Checkout builds inline `price_data` from amounts in `PLAN_PRICES_USD`/`PLAN_PRICES_INR` (pro 29/89, elite 279/849 USD) | — edit `src/lib/stripe-service.ts` to change pricing | — |

Plans in code: **free, pro, elite** (there is no separate "premium" tier).

## AI FEATURES

| Variable | Required | Purpose | How to get | Example format |
|---|---|---|---|---|
| — (none) | — | **Z-AI SDK is the primary provider and needs no key** in the GLM environment (`z-ai-web-dev-sdk` authenticates the platform) | Nothing to configure | — |
| `OPENAI_API_KEY` | Optional | OpenAI-compatible fallback provider (used when Z-AI unavailable) | platform.openai.com | `sk-...` |
| `OPENAI_MODEL` | Optional | Model for the fallback (default `gpt-4o`) | — | `gpt-4o-mini` |
| ~~`GEMINI_API_KEY`~~ / ~~`Z_AI_KEY`~~ | **NOT READ** | No code path references these; do not rely on them | — | — |

## NOTIFICATIONS

| Variable | Required | Purpose | How to get | Example format |
|---|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Optional (platform-level) | Bot token fallback for Telegram alerts; primary source is the user-linked `TelegramConfig` row (bot connected via UI) | Telegram → @BotFather → /newbot | `123456:ABC-DEF...` |
| `TELEGRAM_WEBHOOK_URL` | Optional | Public webhook URL for the Telegram bot (`/api/telegram/webhook`) | Your domain + path | `https://app.example.com/api/telegram/webhook` |
| `TWILIO_ACCOUNT_SID` | Optional | Status probe + defaults for WhatsApp-via-Twilio; per-user credentials are stored encrypted in `WhatsappConfig` from the settings UI | Twilio Console → Account Info | `ACxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Optional | Pairs with the SID | Twilio Console | 32-char hex |
| `TWILIO_WHATSAPP_NUMBER` | Optional | WhatsApp sender | Twilio → Messaging → WhatsApp sender | `+14155238886` |
| `WHATSAPP_API_TOKEN` | Optional | Alternative WhatsApp provider token (checked in integrations status) | Meta developer app | long token |
| VAPID keys (web push) | Optional | Web push subscriptions (`/api/notifications/push/*`) | Generate with `web-push generate-vapid-keys` | set via settings UI/service |

## CRON / OPS / MISC

| Variable | Required | Purpose | How to get | Example format |
|---|---|---|---|---|
| `CRON_SECRET` | **REQUIRED (prod)** | Bearer token protecting all `/api/cron/*` endpoints (12 endpoints) | Any random string | `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` |
| `GMAIL_ENCRYPTION_KEY` | Optional | Fallback encryption key for stored OAuth/credentials; dev default exists — set a real 32-char key in prod | Random 32 chars | 32-char string |
| `REDIS_URL` | Optional | Enables Redis pub/sub fan-out for multi-instance deployments (ioredis) | Your Redis provider | `redis://default:pass@host:6379` |
| `SENTRY_DSN` / OTEL vars | Optional | Error tunnel + OpenTelemetry exports | Sentry/OTLP provider | `https://...ingest.sentry.io/...` |
| `AUTH_DEV_MODE`, `AUTH_BYPASS_EMAIL`, `AUTH_AUTO_VERIFY`, `AUTH_DEV_OTP_IN_LOG`, `AUTH_DEV_OTP_IN_RESPONSE` | Dev only | Dev conveniences (OTP in responses/logs, skip email) — **never enable in production** | — | `true` |
| `ENABLE_OTP_LOGIN`, `ENABLE_MAGIC_LINK` | Optional | Auth method feature flags (surface in `/api/auth/config`) | — | `true` |

## Platform matrix

| Variable group | GLM sandbox | Railway | Vercel |
|---|---|---|---|
| JWT/DATABASE/URLS/SMTP/GOOGLE/CRON | Secrets panel → `ensure-env.sh` | Variables tab | Environment Variables tab |
| Redis/OTEL/Sentry | optional | optional | optional |
| SQLite `file:` DATABASE_URL | works (dev) | replace with Postgres | unsupported — use Postgres |

## Generation cheat-sheet

```bash
# JWT secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# CRON_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
# WhatsApp VAPID keys
npx web-push generate-vapid-keys
```

## Currently configured in this deployment (status audit)

SET and verified: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_HOST/PORT/USER/PASSWORD`, `EMAIL_FROM`, `CRON_SECRET`, `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX`, auth flags.
NOT set (features coded but inactive): all `STRIPE_*`, `TELEGRAM_BOT_TOKEN`, `TWILIO_*`, `RESEND_API_KEY`, `OPENAI_API_KEY` (Z-AI covers AI), `REDIS_URL`, VAPID keys.
