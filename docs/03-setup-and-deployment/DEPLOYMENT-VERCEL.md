# Deploying to Vercel

> Vercel works for AcquisitionOS because the app is a standard Next.js App Router project, but read the limitations section: long-running and stateful pieces (websockets, in-process SSE, SQLite) need adjustments.

## 1. Create Account & Connect GitHub

1. Sign up at [vercel.com](https://vercel.com) with GitHub.
2. **Add New → Project** → import the repository.
3. Framework preset: **Next.js** (auto-detected). Build command: `prisma generate && next build && node scripts/clean-standalone.js` (from `package.json` `vercel-build` script — Vercel runs `vercel-build` if present). Output handling is standard Next.js.

## 2. Set Environment Variables (Dashboard Only)

**Important: Vercel does NOT read your `.env` file.** Everything must be entered in **Project → Settings → Environment Variables** (choose Production/Preview/Environments scopes). Add all variables from `04-secrets-and-configuration/ALL-SECRETS.md`:

```env
DATABASE_URL=postgresql://...          # see step 3
APP_URL=https://your-app.vercel.app    # or custom domain
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

JWT_SECRET=...
JWT_REFRESH_SECRET=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ENABLE_GOOGLE_OAUTH=true

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
EMAIL_FROM=...

CRON_SECRET=...

# payments / discovery / channels when used
STRIPE_SECRET_KEY=... NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=... STRIPE_WEBHOOK_SECRET=... STRIPE_PRICE_*_ID=...
GOOGLE_SEARCH_API_KEY=... GOOGLE_SEARCH_ENGINE_ID=...
TELEGRAM_BOT_TOKEN=... TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_WHATSAPP_NUMBER=...
```

Redeploy after adding variables (runtime only reads them at boot).

## 3. Database Setup

**Vercel cannot host SQLite** (serverless filesystem is ephemeral/read-only except `/tmp`). Options:

- **Vercel Postgres** (powered by Neon): Storage tab → Create Database → it injects `DATABASE_URL` automatically.
- **External Postgres** (Supabase, Neon, Railway): paste its connection string into `DATABASE_URL`. For pooled connections (PgBouncer), add `directUrl` support in the datasource block per the schema's annotations.

Then run migrations once from your machine:

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

Also update `prisma/schema.prisma` to `provider = "postgresql"` before deploying (schema is annotated for this).

## 4. Configure APP_URL

Set `APP_URL`/`NEXT_PUBLIC_APP_URL` to the final Vercel (or custom) domain. These drive Stripe success/cancel URLs and links inside emails. OAuth itself uses the incoming request's forwarded host headers, so it works on both `*.vercel.app` previews and the production domain — **provided each domain's redirect URI is registered in Google Cloud Console** (`https://<domain>/api/auth/callback/google`).

## 5. Stripe Webhook URL for Vercel

In Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

```
https://your-app.vercel.app/api/payments/webhook/stripe
```

Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. (Razorpay equivalent: `/api/payments/webhook/razorpay`.)

## 6. Cron Jobs on Vercel

Use `vercel.json` cron config to hit protected endpoints, e.g.:

```json
{
  "crons": [
    { "path": "/api/cron/process-sequences", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/meeting-reminders", "schedule": "*/5 * * * *" }
  ]
}
```

Vercel cron calls the path with a GET; the routes accept `Authorization: Bearer <CRON_SECRET>` (also via `?key=`). Note: Vercel cron on Hobby has limited granularity — consider an external scheduler (cron-job.org, Upstash QStash) for 1–5 minute cadences.

## 7. Known Vercel Limitations with Long-Running Processes

| App feature | Serverless impact | What to do |
|---|---|---|
| WebSocket (`/api/ws`) | No persistent socket support | Rely on SSE (`/api/events/*`) which works streaming on Functions, or move WS to a separate service |
| Long SSE streams | Functions have execution-time caps (10s–300s by plan) | Keep streams short or poll `/api/realtime/status` |
| Gmail Pub/Sub push | Works (it's just an HTTPS webhook) | Fine as-is |
| Background loops (sequence engines running in-process) | Not persistent | Drive all periodic work through the `/api/cron/*` endpoints instead of in-process timers |
| SQLite `DATABASE_URL=file:` | Not supported | Must use Postgres (step 3) |
| `instrumentation.ts` OTel exporter | Long-lived exporters may not flush | Configure an OTLP endpoint and keep spans short |
| Image optimization `sharp` | Supported | Fine |

## 8. Deploy & Verify

```bash
npx vercel --prod
curl -s https://your-app.vercel.app/api/health
curl -s https://your-app.vercel.app/api/auth/config
# then run the same post-deploy checklist as Railway (signup, OTP email, Google login, discovery)
```

**Bottom line:** Vercel is a good second option; if you want websockets, relaxed streaming, and one platform for app+DB+cron, prefer Railway (`DEPLOYMENT-RAILWAY.md`).
