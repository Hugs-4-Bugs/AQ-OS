# AcquisitionOS — Local → Testing/Staging → Production Guide

> Verification basis: actual repository inspection 2026-09-22 (`vercel.json`, `Dockerfile`, `docker-compose*.yml`, `prisma/schema.production.prisma`, `scripts/migrate-to-postgresql.sh`, `docs/deployment/*`, `docs/operations/CRON-JOBS.md`, `DEPLOYMENT.md`). No secrets included.

---

## 1. Environment Matrix

| Aspect | Local (Mac) | Testing / Staging | Production |
|---|---|---|---|
| Runtime | `npm run dev` (Turbopack, :3000) | `npm run build && npm start` (standalone) or platform build | same as staging, live secrets |
| Database | **SQLite** file `db/custom.db` — nothing to install | managed PostgreSQL (recommended) or SQLite volume | **PostgreSQL required** for any ephemeral-FS host (Vercel); verified in `DEPLOYMENT.md` |
| `DATABASE_URL` | `file:./db/custom.db` | `postgresql://…staging…` | `postgresql://…prod…` |
| Auth secrets (`JWT_SECRET`/`AUTH_SECRET`) | self-generated, dev-only value | **separate** staging random secret | **separate** production random secret |
| `NEXT_PUBLIC_APP_URL` / `APP_PUBLIC_URL` | `http://localhost:3000` | `https://staging.<domain>` | `https://<production-domain>` |
| Google OAuth | localhost redirect URI whitelisted | staging redirect URI whitelisted | production redirect URI whitelisted |
| Email | Gmail SMTP (real) or dev-mode OTP | test sender/domain (Resend domain verified) | production domain + verified sender |
| Stripe | `sk_test_` + local `stripe listen` | `sk_test_` + staging webhook endpoint | `sk_live_` + production webhook endpoint |
| Razorpay | `rzp_test_` or disabled | test keys + staging webhook | live keys + production webhook |
| Cron | manual curl with `CRON_SECRET` | external scheduler → staging URL | external scheduler → production URL |
| Redis | not used | optional (`REDIS_URL` for cross-instance fan-out) | optional (realtime sidecar needs it) |
| Error tracking | none (console) | optional `NEXT_PUBLIC_SENTRY_DSN` | recommended |

**Variables that must change between environments** (complete operational set): `DATABASE_URL`, `JWT_SECRET`/`AUTH_SECRET`/`NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL` (+`APP_PUBLIC_URL`), `GOOGLE_CLIENT_ID/SECRET` (or share client + add all redirect URIs), `SMTP_*`/`RESEND_API_KEY` + `EMAIL_FROM`, `STRIPE_*` (incl. all Price IDs), `RAZORPAY_*`, `CRON_SECRET`, `ENCRYPTION_KEY`, optional `REDIS_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `GMAIL_PUBSUB_*`.

> Cookie security note: session cookies automatically switch to `secure` mode in production (`NODE_ENV`-driven, verified in `src/lib/auth.ts`), so HTTPS is mandatory in staging/production.

---

## 2. Database: SQLite → PostgreSQL (the one real migration)

The current database **is SQLite** (verified). Production on ephemeral hosts (Vercel) **requires** PostgreSQL because the filesystem is not writable across instances. The repository ships a prepared path (all verified):

1. **Target schema exists:** `prisma/schema.production.prisma` — `provider = "postgresql"`, Supabase-oriented `directUrl = env("DIRECT_URL")`.
2. **Guided migration script:** `scripts/migrate-to-postgresql.sh` (813 lines: backup → provider switch → data migration → verify).
3. **Ops runbook:** `infra/db-migration-rollback.md` (pre-migration backup + rollback procedure).

Recommended staging/production database providers (per `DEPLOYMENT.md`): Vercel Postgres, Neon, Supabase or Railway. Set `DATABASE_URL` (+ `DIRECT_URL` when using the Supabase schema) in the platform's environment settings, then:

```bash
npx prisma db push --schema=prisma/schema.production.prisma   # create tables on the managed PG
```

SQLite continues to work for self-managed Docker/EBS hosts (the root `Dockerfile` creates `/app/data` and is SQLite-compatible), but scheduled DB backups become mandatory (§6).

---

## 3. Deployment Targets (verified repository configuration)

### 3.1 Vercel
- `vercel.json` (read in full): framework `nextjs`, `installCommand: npm install --legacy-peer-deps`, `buildCommand: npm run build`, region `sin1`, security headers, `NEXT_TELEMETRY_DISABLED=1`.
- ⚠️ **`vercel.json` has NO `crons` key** while 12 `/api/cron/*` endpoints exist — Vercel Cron will not fire them. Use an external scheduler (§5) or add a `crons` block.
- ⚠️ SQLite cannot persist on Vercel → PostgreSQL migration (§2) is mandatory for Vercel.

### 3.2 Docker (self-managed — keeps SQLite possible)
- Root `Dockerfile` (verified): `node:20-alpine`, two-stage, `npm ci --ignore-scripts` → `prisma generate` → `npm run build` (standalone output) → non-root runtime user → `HEALTHCHECK` on `/api/health` → `CMD node server.js`.
- `npm start` runs `start.js`, which assembles `.next/standalone` + static + public and boots the server.
- ⚠️ The Dockerfile `COPY … .npmrc` step fails today because `.npmrc` is absent from the repo — create an empty `.npmrc` or adjust the COPY before containerized builds.
- `docker-compose.prod.yml` defines the fuller stack (postgres:15, redis:7, Python backend + celery, realtime-service, nginx, prometheus, grafana) — the **optional** full-fidelity environment.

### 3.3 Platform docs bundled in-repo
`docs/deployment/` contains per-target runbooks (Cloudflare Workers + cron dispatcher, GCP Cloud Scheduler + Terraform, AWS/Azure variants, EC2/K8s/Railway/Render assets under `deploy/`). Follow the one matching your host; the environment-variable set is identical across targets.

---

## 4. Production Environment Variables Checklist

Set in the hosting provider's dashboard (never in files):

```text
# Core
DATABASE_URL=<managed PG connection string>     (+ DIRECT_URL if using schema.production.prisma)
JWT_SECRET=<new 64-hex>      AUTH_SECRET=<same or new>      NEXTAUTH_SECRET=<same or new>
NEXT_PUBLIC_APP_URL=https://<production-domain>              APP_PUBLIC_URL=https://<production-domain>
NODE_ENV=production

# Auth / email
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET      (prod redirect URI whitelisted)
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / EMAIL_FROM   (or RESEND_API_KEY)
ENCRYPTION_KEY=<64-hex>      GMAIL_ENCRYPTION_KEY=<64-hex>
AUTH_DEV_MODE=false          (belt & braces; production ignores dev delivery anyway)

# Billing (live)
STRIPE_SECRET_KEY=sk_live_…   STRIPE_WEBHOOK_SECRET=whsec_…   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…
STRIPE_*_PRICE_ID=… (plans + credit packs)
RAZORPAY_KEY_ID=rzp_live_…    RAZORPAY_KEY_SECRET=…           RAZORPAY_WEBHOOK_SECRET=…

# Jobs & optional infra
CRON_SECRET=<new random>      GMAIL_CRON_API_KEY=<random>
REDIS_URL=redis://…           (only if running realtime sidecar / multi-instance)
NEXT_PUBLIC_SENTRY_DSN=…      (recommended)
```

Production webhook URLs to register: `/api/payments/webhook/stripe`, `/api/payments/webhook/razorpay`, optionally `/api/gmail/pubsub/webhook`, `/api/telegram/webhook`, `/api/calendar/webhook`.

---

## 5. Cron / Scheduled Jobs in Production

12 Bearer-protected endpoints under `/api/cron/*` (verified list: `autonomous-outreach`, `credit-renewal`, `end-of-period`, `expire-api-keys`, `hot-lead-scan`, `meeting-reminders`, `payment-reconciliation`, `process-gmail-replies`, `process-sequences`, `renew-subscriptions`, `sdr-cycle`, `sequence-processing`) plus job endpoints `/api/payments/process-billing`, `/api/feedback/retry-emails`, `/api/gmail/jobs/process`, `/api/meetings/reminders/process`.

- **External scheduler required** — in-repo docs (`docs/deployment/`) wire a Cloudflare Worker dispatcher or GCP Cloud Scheduler to POST each path with `Authorization: Bearer $CRON_SECRET` (suggested cadence: */10 min for sequences/replies/reminders; */30 for api-keys/hot-leads/sdr; daily 03:00 for renewals/reconciliation).
- `vercel.json` does not schedule them (no `crons` key) — do not assume Vercel Cron fires anything.
- ⚠️ `scheduled`-trigger workflows only fire if the optional Python Celery stack runs; wire `processScheduledTriggers` to a cron endpoint if you need them without Celery.

---

## 6. Monitoring, Backups & Go-Live

- **Health:** `/api/health`, `/api/health/database` (also the Docker HEALTHCHECK target).
- **Metrics/logs:** in-repo observability stack (`src/lib/observability/*`: structured logger, metrics collector, alert engine, health). Sentry is a console shim — attach `NEXT_PUBLIC_SENTRY_DSN` for remote capture. OpenTelemetry packages are installed but **not initialized** (verified).
- **Backups:** `scripts/backup/backup.sh` (SQLite `sqlite3 .backup` → gzip → integrity check → optional S3 → 30-day rotation; supports `pg_dump` for PG). ⚠️ Its default `DB_PATH=/opt/...` does not match this repo — always pass `DB_PATH=db/custom.db` (or the PG URL). Host-crontab installer: `scripts/backup/cron-setup.sh`. Restore: `scripts/backup/restore.sh --latest`.
- **Go-live checklist (condensed):** PG migrated & backed up · all prod env vars set · Google prod redirect URI whitelisted · live payment keys + webhooks registered and receiving (test a real charge) · external cron scheduler active · `AUTH_DEV_MODE` unset/false · HTTPS live · `/api/health` green · first admin is `super_admin` in the prod DB · DNS/domain mapped · smoke test the §11 checklist of `LOCAL-DEVELOPMENT-SETUP.md` against the production URL.

---

## 7. Pre-Production Build Verification (run before every deploy)

```bash
npm install --legacy-peer-deps   # clean install
npm run build                    # prisma generate → next build --webpack → clean-standalone  (verified green)
npm start                        # boots .next/standalone via start.js
curl -s localhost:3000/api/health
```

Known non-blocking items (verified, tracked for later): ~322 pre-existing TypeScript errors hidden by `typescript.ignoreBuildErrors: true`; 13 declared-but-unused dependencies; OpenTelemetry not initialized; duplicate workflow engines/DLQ flags.
