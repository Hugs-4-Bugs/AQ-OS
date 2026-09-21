# Deploying to Railway (Recommended for Production)

> Railway is the recommended production host for AcquisitionOS: it runs the Next.js server as an always-on process, hosts PostgreSQL natively, supports cron-style scheduling, and has no sandbox timeouts.

## Why Railway over GLM for production

| Concern | GLM sandbox | Railway |
|---|---|---|
| Always-on server | No (periodic kills) | Yes |
| Persistent `.env` | No (wiped) | Yes (variables service) |
| Stable domain | Preview changes per session; deploy URL separate | Stable custom domain |
| Memory | 4 GB cap, OOM during builds | Configurable plans |
| Database | SQLite file in workspace | Managed PostgreSQL |
| Cron jobs | Manual endpoints only | Railway cron or external scheduler hitting `/api/cron/*` |

## 1. Create Account & Project

1. Sign up at [railway.com](https://railway.com) (GitHub login is easiest).
2. **New Project** → choose **Deploy from GitHub repo** and select this repository.
3. Railway auto-detects Next.js. Build command from `package.json`: `prisma generate && next build && node scripts/clean-standalone.js`; start: `node start.js` (which launches the standalone server). If Railway doesn't pick them up, set them explicitly in **Settings → Build/Start Command**.

## 2. Add PostgreSQL

1. In the same project: **New → Database → PostgreSQL**.
2. Railway injects `DATABASE_URL` into the service network; reference it in your app service variables as `${{Postgres.DATABASE_URL}}`.
3. Switch the Prisma datasource to PostgreSQL in `prisma/schema.prisma` (`provider = "postgresql"`) — the schema is already annotated for this. For Supabase/PgBouncer-style pooling, also set `directUrl = env("DIRECT_URL")`.

## 3. Set Environment Variables

Open the app service → **Variables** and add everything from `04-secrets-and-configuration/ALL-SECRETS.md`. Required for launch:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}

APP_URL=https://your-domain.up.railway.app     # or custom domain — MUST be the public URL
NEXT_PUBLIC_APP_URL=https://your-domain.up.railway.app

JWT_SECRET=<32+ random chars>
JWT_REFRESH_SECRET=<different 32+ random chars>

GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
ENABLE_GOOGLE_OAUTH=true

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=<16-char app password, no spaces>
EMAIL_FROM=you@gmail.com

CRON_SECRET=<random>            # protects /api/cron/*
```

Optional but expected by features: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*_ID`, `TELEGRAM_BOT_TOKEN`, `TWILIO_*`, `SERPAPI_KEY`.

## 4. Configure APP_URL Correctly (critical)

`APP_URL`/`NEXT_PUBLIC_APP_URL` must be the **public URL users visit**. It is used for Stripe success/cancel URLs, email links, and as the final fallback for OAuth origin resolution. Mismatched values cause OAuth callbacks and email links to point at the wrong host. Set it once, before registering OAuth redirect URIs.

Note: as of the dynamic-redirect fix, the OAuth initiation route prefers the incoming request's `x-forwarded-host`/`x-forwarded-proto` over env, so OAuth works on any domain — but Stripe URLs and emails still follow `APP_URL`.

## 5. Database Migration on Railway

One-time and per-release:

```bash
# locally, pointing at Railway Postgres (or use a Railway one-off shell)
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

Options:
- Add a Railway **start override**: `npx prisma migrate deploy && node start.js` for automatic migrations on deploy, or
- Run `prisma migrate deploy` manually per release (safer for big schema changes).

The repo also ships `scripts/migrate-to-postgresql.sh` and SQLite→PostgreSQL data-migration annotations in the schema if you need to carry existing sandbox data over.

## 6. Custom Domain

1. Service → **Settings → Networking → Generate Domain** gives `*.up.railway.app`; **Custom Domain** adds your own (add the CNAME at your DNS provider).
2. Railway terminates TLS automatically (SSL is immediate).
3. Update `APP_URL`/`NEXT_PUBLIC_APP_URL` to the final domain.
4. Register the OAuth redirect URI: `https://<domain>/api/auth/callback/google` in GCP.
5. Point the Stripe webhook to `https://<domain>/api/payments/webhook/stripe`.

## 7. Cron Jobs

The app exposes 12 protected endpoints under `/api/cron/*` (list in `06-api-reference/API-ROUTES.md`). They require `Authorization: Bearer <CRON_SECRET>`. Schedule the important ones with Railway cron or any scheduler:

| Endpoint | Cadence | Purpose |
|---|---|---|
| `/api/cron/sdr-cycle` | e.g. hourly | autonomous discover→score→outreach |
| `/api/cron/process-sequences` | every 5–15 min | advance outreach sequences |
| `/api/cron/meeting-reminders` | every 5 min | send due reminders |
| `/api/cron/hot-lead-scan` | every 15 min | promote hot leads |
| `/api/cron/credit-renewal` / `end-of-period` / `renew-subscriptions` | daily/hourly | billing cycles |
| `/api/cron/payment-reconciliation` | hourly | reconcile failed payments |
| `/api/cron/process-gmail-replies` | every 5 min | reply polling fallback |

## 8. Monitoring & Logs

- **Deployments tab:** build logs and deploy history; instant rollback to any previous deployment.
- **Logs tab:** live stdout (the app logs with structured prefixes like `[SMTP-Env-Diag]`).
- **Metrics tab:** CPU/RAM/network; set memory alerts.
- Health probes: `GET /api/health` (liveness), `/api/health/detailed` (DB/AI/SMTP), `/api/health/database`.
- Optionally wire OpenTelemetry exports (`OTEL_*` env) to any OTLP collector.

## 9. Post-Deploy Verification Checklist

```bash
curl -s https://your-domain/api/health                     # 200
curl -s https://your-domain/api/auth/config                # googleAvailable:true, emailConfigured:true
# sign up → OTP email received → sign in
# Google sign-in → consent → back on dashboard (no redirect_uri_mismatch)
# discovery run → leads appear
# (if configured) test Stripe checkout in test mode → webhook processed
```
