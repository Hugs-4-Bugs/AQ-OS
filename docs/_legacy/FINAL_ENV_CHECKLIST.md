# AcquisitionOS — Final Environment Variable Checklist

## Required for Core Application

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | SQLite/PostgreSQL connection string | ✅ Yes | `file:./db/custom.db` |
| `JWT_SECRET` | Secret for signing JWT tokens | ✅ Yes (Production) | Dev fallback |
| `NEXT_PUBLIC_APP_URL` | Public URL of the application | ✅ Yes | `http://localhost:3000` |

## Authentication

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID | ❌ Optional | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | ❌ Optional | - |

## Email Service

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SMTP_HOST` | SMTP server hostname | ❌ Optional | - |
| `SMTP_PORT` | SMTP server port | ❌ Optional | - |
| `SMTP_USER` | SMTP username | ❌ Optional | - |
| `SMTP_PASS` | SMTP password | ❌ Optional | - |
| `EMAIL_FROM` | From email address | ❌ Optional | - |

## Payment - Razorpay

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `RAZORPAY_KEY_ID` | Razorpay API key ID | ❌ Optional | Dev mode |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret | ❌ Optional | Dev mode |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook verification secret | ❌ Optional | Dev mode |

## Payment - Stripe

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key | ❌ Optional | Dev mode |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | ❌ Optional | Dev mode |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | ❌ Optional | Dev mode |

## AI Services

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key | ❌ Optional | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | ❌ Optional | - |

## Integrations

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GMAIL_CLIENT_ID` | Gmail API client ID | ❌ Optional | - |
| `GMAIL_CLIENT_SECRET` | Gmail API client secret | ❌ Optional | - |
| `GMAIL_REDIRECT_URI` | Gmail OAuth redirect URI | ❌ Optional | - |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | ❌ Optional | - |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | ❌ Optional | - |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | ❌ Optional | - |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Meta API token | ❌ Optional | - |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID | ❌ Optional | - |

## Observability

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SENTRY_DSN` | Sentry error tracking DSN | ❌ Optional | - |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry client-side DSN | ❌ Optional | - |

## Feature Flags (Dev Mode)

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `AUTH_DEV_MODE` | Master switch for dev auth bypasses | ❌ Optional | `true` (dev) |
| `AUTH_AUTO_VERIFY` | Auto-verify email on signup | ❌ Optional | `true` (dev) |
| `AUTH_DEV_OTP_IN_RESPONSE` | Return OTP in API response | ❌ Optional | `true` (dev) |
| `AUTH_DEV_OTP_IN_LOG` | Log OTPs to console | ❌ Optional | `true` (dev) |
| `AUTH_BYPASS_EMAIL` | Skip email sending | ❌ Optional | `true` (dev) |

## Runtime Blockers (Production)

The following MUST be set before production deployment:

1. ✅ `JWT_SECRET` — Server will crash without it (hard-crash guard added in RC)
2. ✅ `DATABASE_URL` — Must point to production DB
3. ✅ `NEXT_PUBLIC_APP_URL` — Must be production URL
4. ✅ At least one payment gateway (Razorpay OR Stripe) — for billing
5. ✅ SMTP configuration — for email verification and notifications

## Optional but Recommended

- Google OAuth — for social login
- Email service — for verification codes, magic links, notifications
- AI API keys — for AI features
- Sentry — for error monitoring

## Dev Mode Behavior

When payment gateway keys are missing, the app operates in "dev mode":
- Payment orders are created with placeholder IDs
- Direct confirmation via `/api/payments/confirm` is allowed (dev only - 403 in production)
- OTPs are returned in API responses
- Emails are skipped (logged to console instead)
