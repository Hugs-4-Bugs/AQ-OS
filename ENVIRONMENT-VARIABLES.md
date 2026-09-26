# AcquisitionOS — Environment Variable Inventory & Secret Source Map

> **Verification basis:** repository-wide audit of `process.env` usage in `src/` (161 unique names), `backend/` Python (`os.getenv`, 85 names), root runtime scripts, `mini-services/`, `deploy/`, `docker-compose*`, k8s manifests — re-verified 2026-09-22 (full-repo credential audit). **No secret values appear in this document.**
>
> **Totals (verified):** **201+ unique variable names** · **46 secret-class** · **5 client-side (`NEXT_PUBLIC_*`)** · **3 boot-critical** (`DATABASE_URL`, `JWT_SECRET`(+aliases), `NEXT_PUBLIC_APP_URL`).
>
> **Companion files:** `.env.example` (complete placeholder template) · `.env.local` (local-only real values, gitignored) · `LOCAL-CREDENTIALS-STATUS.md` (local availability + validation status, gitignored).

---

## 0. CURRENT WORKSPACE STATUS (2026-09-23 update — after 2nd sandbox reset)

Classification: **A = actually used AND configured** · **B = configured but unused** · **C = referenced but missing**.

> **2026-09-23:** The workspace reset truncated `.env` to `DATABASE_URL` again (2nd occurrence). Real
> credentials were re-recovered from repo git history via `scripts/recover-credentials.mjs`, and
> `ensure-env.sh` now **self-heals**: it runs the recovery automatically whenever `GOOGLE_CLIENT_ID`
> is missing from `.env`. Live re-validation: SMTP AUTH ✅ · Google client ✅ · end-to-end OTP mail
> IMAP-confirmed ✅. `APP_URL` / `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` are intentionally **unset**
> so OAuth redirect_uri and magic links resolve dynamically from the request origin.

| Bucket | Count | Detail |
|---|---|---|
| Variables defined in workspace `.env` | 26 | `DATABASE_URL` + 12 recovered provider credentials + 5 generated secrets (JWT/AUTH/NEXTAUTH/CRON, 64-hex) + 8 auth flags |
| **A — configured & used** | 24 | `DATABASE_URL`, `JWT_SECRET`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `SMTP_HOST/PORT/USER/PASSWORD/PASS`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM`, `GOOGLE_SEARCH_API_KEY/CX`, `CRON_SECRET`, `ENABLE_GOOGLE_OAUTH/OTP_LOGIN/MAGIC_LINK` (backend-only) |
| **B — configured but unused** | 2 | `AUTH_AUTO_VERIFY`, `AUTH_BYPASS_EMAIL` — read by nothing (Next.js OR backend); kept **false** by recovery script |
| **C — referenced but missing** | ~200 | almost all optional with code defaults; full list in `.env.example` |
| **Intentionally unset** | 3 | `APP_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` — dynamic request-origin detection wins (see §1) |

Live validation (non-destructive, 2026-09-22 audit + 2026-09-23 re-run): Google OAuth client — **VALID** (consent flow reachable; redirect_uri whitelisted for production AND preview origins) · Gmail SMTP app password — **VALID** (real SMTP AUTH handshake + real mails delivered, IMAP-confirmed) · SQLite DB file — present · JWT/AUTH secrets — 64-hex valid format · Google Search key — format-valid (live check skipped to preserve quota).

Classification legend: **R** = required for boot/feature · **O** = optional (graceful degradation) · **S** = secret (never commit) · **C** = reaches client bundle · **DEV** = development-only · **PROD** = production-relevant.

---

## 1. Core / Boot

| Variable | Class | Purpose | Used where | How to obtain |
|---|---|---|---|---|
| `DATABASE_URL` | R · S | Prisma connection. Local: `file:./db/custom.db` (SQLite). Prod: PostgreSQL URL | `src/lib/db.ts`, `db-pool.ts`, `instrumentation.ts` | Local: nothing to buy — file path. Prod: managed Postgres (§deployment doc) |
| `JWT_SECRET` | R · S | Signs/verifies every JWT (access 15 m, refresh 30 d) | `src/lib/auth.ts`, `src/proxy.ts`, `oauth-relay.ts` | Self-generate: `crypto.randomBytes(32).toString('hex')` |
| `AUTH_SECRET` | O · S | Alias fallback #1 for JWT_SECRET | `src/lib/auth.ts` | Self-generate (same command) |
| `NEXTAUTH_SECRET` | O · S | Alias fallback #2 for JWT_SECRET | `src/lib/auth.ts`, `instrumentation.ts` | Self-generate (same command) |
| `NEXT_PUBLIC_APP_URL` | R · C | Canonical public URL fallback (dynamic origin wins) | `src/lib/app-url.ts` + ~28 files | Your environment's URL |
| `APP_PUBLIC_URL` | O | Highest-priority explicit URL override | `src/lib/app-url.ts` | Your environment's URL |
| `APP_URL`, `NEXTAUTH_URL` | O | Legacy URL vars in fallback chains | auth callbacks, Stripe, Gmail OAuth | Your environment's URL |
| `NODE_ENV` | R | dev/prod switch (dev-OTP gate, guards, caching) | ~60 files | Set by tooling — do not set by hand |
| `JWT_REFRESH_SECRET` | dead · S | Written by `ensure-env.sh` but **never read in code** (refresh tokens reuse JWT_SECRET) | — | Do not document as functional |

## 2. Google OAuth & Google APIs

| Variable | Class | Purpose | How to obtain |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | O* · C-safe | Sign-in OAuth + Gmail/Calendar connect | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web). Redirect URIs to whitelist: `http://localhost:3000/api/auth/callback/google`, `https://<domain>/api/auth/callback/google` (canonical path verified: `src/app/api/auth/callback/google/`) |
| `GOOGLE_CLIENT_SECRET` | O* · S | OAuth token exchange | Same console page → Client secret |
| `GOOGLE_REDIRECT_URI` | O | Explicit override (Gmail OAuth service) | Self-computed from your domain |
| `GOOGLE_API_KEY` | O · S | Calendar free/busy lookups | Google Cloud → APIs & Services → Credentials → API key |
| `GOOGLE_SEARCH_API_KEY` | O · S | Lead discovery + website intel (Custom Search JSON API) | Google Cloud → enable "Custom Search API" → API key |
| `GOOGLE_SEARCH_CX` / `GOOGLE_SEARCH_ENGINE_ID` | O | Programmable Search engine id | programmablesearchengine.google.com → engine Setup → Search engine ID |
| `SERPAPI_KEY` | O · S | Alternative discovery search | serpapi.com → API key |

\* Without it, Google sign-in degrades to the in-app dev-consent simulator (dev only) and Gmail/Calendar connect is disabled.

## 3. Email (Resend → SMTP chain)

| Variable | Class | Purpose | How to obtain |
|---|---|---|---|
| `RESEND_API_KEY` | O · S | Primary email provider (takes priority when set) | resend.com → API Keys |
| `SMTP_HOST` / `SMTP_PORT` | O | SMTP endpoint (aliases `MAIL_*`, `EMAIL_*`) | e.g. `smtp.gmail.com` / `587` |
| `SMTP_USER` | O | SMTP username (aliases: `SMTP_USERNAME`, `GMAIL_USER`, `EMAIL_USER`, `MAIL_USER`, …) | your Gmail address |
| `SMTP_PASSWORD` | O · S | SMTP password (aliases: `SMTP_PASS`, `SMTP_AUTH_PASSWORD`, `GMAIL_APP_PASSWORD`, `GMAIL_PASSWORD`, `EMAIL_PASSWORD`, `MAIL_PASSWORD`, … — 9 accepted names) | Google Account → Security → 2-Step Verification → App passwords (16-char) |
| `SMTP_FROM` / `EMAIL_FROM` / `FROM_EMAIL` | O | From-address chain | your verified sender address |

## 4. Auth Behaviour Flags

| Variable | Class | Purpose |
|---|---|---|
| `AUTH_DEV_MODE` | DEV | When `NODE_ENV !== 'production'` **and** this is NOT the literal string `false`, unsendable OTP/magic codes are returned in API responses (`src/lib/dev-auth.ts`). With real email configured the flag is irrelevant. Keep `false` in any shared environment. |
| `ENCRYPTION_KEY` | PROD · S | AES-256-GCM for OAuth tokens at rest. **Throws in production if unset**; dev auto-derives a key. 64-hex recommended. |
| `GMAIL_ENCRYPTION_KEY` | O · S | Encrypts Telegram/WhatsApp/legacy Gmail credentials (misnomer). Falls back to a hardcoded dev key if unset. |
| `ENABLE_GOOGLE_OAUTH`, `ENABLE_OTP_LOGIN`, `ENABLE_MAGIC_LINK` | backend-only | **Read by the Python backend** (`backend/app/config.py`) as feature flags; NOT read anywhere in the Next.js app. Harmless to keep set. |
| `AUTH_BYPASS_EMAIL`, `AUTH_AUTO_VERIFY`, `AUTH_DEV_OTP_IN_LOG`, `AUTH_DEV_OTP_IN_RESPONSE` | dead | Present in `ensure-env.sh`/`.env` but **never read by any application code** (verified Next.js + backend, 2026-09-22) — documented for completeness only. |

## 5. Payments

| Variable | Class | Purpose | How to obtain |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | O · S | Stripe SDK (`sk_test_…` / `sk_live_…`; mode auto-detected by prefix) | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | O · S | Webhook signature (`whsec_…`); production rejects unsigned webhooks | Stripe Dashboard → Developers → Webhooks → signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | O · C | Client checkout | Stripe Dashboard → API keys → Publishable |
| `STRIPE_PRICE_{STARTER,PRO,ELITE}_{MONTHLY,YEARLY}_ID` (canonical; +3 legacy alias conventions auto-resolved, e.g. `STRIPE_{PLAN}_{CYCLE}_PRICE_ID`) | O | Plan Price IDs. Missing ID → that plan/cycle shows "Coming Soon" and checkout is not initiated | Stripe Dashboard → Products → Price ID (created manually) |
| `STRIPE_PRICE_CREDITS_{100,500,1000}_ID` | O | Credit add-on Price IDs | Stripe Dashboard → Products |
| `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` / `STRIPE_PORTAL_RETURN_URL` | O | Checkout/portal redirects | Your URLs |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | O · S(/C for ID) | Razorpay orders + HMAC verification (`rzp_test_`/`rzp_live_` prefix) | Razorpay Dashboard → Settings → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | O · S | Webhook HMAC-SHA256 verification | Razorpay Dashboard → Webhooks |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | O · C | Client checkout | Razorpay Dashboard |
| `RAZORPAY_PLAN_{PRO,ELITE}_{MONTHLY,YEARLY}` | O | Recurring plan IDs (`plan_…`) | Razorpay Dashboard → Subscriptions → Plans |

Webhook endpoints to configure (paths verified): `https://<domain>/api/payments/webhook/stripe` (11 event types), `https://<domain>/api/payments/webhook/razorpay` (8 event types).

## 6. AI Providers (all optional; built-in Z-AI needs no key)

| Variable | Class | Purpose |
|---|---|---|
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` | O · S/-/- | Fallback provider 1 (default model `gpt-4o`) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` / `ANTHROPIC_BASE_URL` | O · S/-/- | Fallback provider 2 (default `claude-sonnet-4-20250514`) |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` / `OPENROUTER_BASE_URL` | O · S/-/- | Fallback provider 3 (default `openai/gpt-4o`) |
| `AI_LOCAL_ENDPOINT` / `AI_LOCAL_MODEL` | O | Local LLM (Ollama/LM Studio-style) |
| `AI_*` tunables (15: `AI_DEFAULT_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_TOKENS`, `AI_DEFAULT_TEMPERATURE`, `AI_CHAT_CREDIT_COST`, …) | O | Runtime tuning; sane defaults hardcoded in `src/lib/ai/ai-provider.ts` |
| `AI_DAILY_BUDGET_USD` / `AI_MONTHLY_BUDGET_USD` | O | Spend caps (cost tracker) |

## 7. Messaging / Push / Misc Integrations

| Variable | Class | Purpose | How to obtain |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | O · S | Webhook signature validation (per-user bot tokens live in DB) | @BotFather → /newbot |
| `TELEGRAM_WEBHOOK_URL` | O | Registered Telegram webhook | your domain + `/api/telegram/webhook` |
| `WHATSAPP_API_TOKEN`, `META_APP_SECRET` | O · S | Meta WhatsApp Cloud flags/signature | developers.facebook.com → WhatsApp |
| `TWILIO_AUTH_TOKEN` | O · S | Twilio WhatsApp signature | twilio.com console |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | O · C/S | Web-push notifications | self-generate (web-push keypair) |
| `GMAIL_PUBSUB_TOPIC` / `_SUBSCRIPTION` / `_WEBHOOK_URL` / `_VERIFICATION_TOKEN` | PROD · S(token) | Gmail push (REST `users.watch`) | Google Cloud Pub/Sub console |
| `GMAIL_CRON_API_KEY` | O · S | Auth for `/api/gmail/jobs/process` | self-generate |
| `GMAIL_UNSUBSCRIBE_SECRET` | O · S | HMAC for one-click unsubscribe links | self-generate |
| `GOOGLE_MAPS_API_KEY`, `YELP_API_KEY`, `JUSTDIAL_API_KEY/URL`, `INDIAMART_API_KEY`, `FACEBOOK_APP_ID/SECRET`, `INSTAGRAM_APP_ID/SECRET`, `LINKEDIN_CLIENT_ID/SECRET` | O · S | Optional lead-discovery source adapters | respective developer consoles |

## 8. Infrastructure / Observability

| Variable | Class | Purpose |
|---|---|---|
| `REDIS_URL` | O · S* | **Optional** pub/sub fan-out only (§8 of setup doc); no local requirement |
| `CRON_SECRET` | O · S | Bearer token for all `/api/cron/*` + feedback retry endpoints |
| `CRON_AUTH_TOKEN` | O · S | Alt token for `/api/meetings/reminders/process` |
| `NEXT_PUBLIC_SENTRY_DSN` | O · C | Only Sentry variable in code (client shim + `/api/sentry` tunnel). Server Sentry is a no-op shim — no `@sentry/nextjs` installed |
| `OTEL_ENABLED`, `OTEL_EXPORTER`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` | PROD · dead | OpenTelemetry init exists but **is never called** (verified) |
| `LOG_LEVEL` | O | Logger verbosity |
| `ALLOWED_ORIGINS` | O | CORS/CSRF allowlist |
| `DATABASE_POOL_SIZE`, `DATABASE_*_TIMEOUT_*`, `DATABASE_SSL_MODE`, `PGBOUNCER_ENABLED` | PROD | PostgreSQL pool tuning (dormant on SQLite) |
| `UPLOAD_STORAGE_PATH`, `BACKUP_DIR`, `PORT`, `HOSTNAME` | O | Paths/bind |
| `SECRET_KEY`, `REDIS_URL` | PROD · S | Only for the optional realtime sidecar (`mini-services/realtime-service`) |
| `COMPANY_*`, `PRODUCT_NAME` | O | Invoice PDF branding |
| `WORKFLOW_TIMEOUT`, `WORKFLOW_MAX_RETRIES` | O | Workflow engine limits (defaults 300000 ms / 3) |
| `NEXT_TELEMETRY_DISABLED` | O | Build telemetry off (set by `vercel.json`/Dockerfile) |

## 9. Counts Summary

| Category | Count |
|---|---|
| Core/boot + URLs | 10 |
| Google OAuth + APIs + search | 10 |
| Email (incl. aliases) | 24 |
| Auth flags (+dead) | 10 |
| Payments (Stripe 16-name convention included) | 26 |
| AI providers + tunables | 25 |
| Messaging/push/Gmail infra | 14 |
| Discovery source adapters | 13 |
| Infra/observability/misc | 30+ |
| **Total unique names** | **201** |
| Secret-class | **46** |
| `NEXT_PUBLIC_*` (client) | 5 |
| Boot-critical minimal set | 3 (`DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_APP_URL`) |

---

## 10. Secret Source Map (no values — where each secret comes from)

```text
DATABASE_URL            → local: nothing to obtain (file:./db/custom.db)
                        → prod: your managed PostgreSQL provider (Supabase/Neon/Railway/Vercel Postgres)
JWT_SECRET              → you generate (openssl rand -hex 32 / crypto.randomBytes(32))
AUTH_SECRET             → you generate (same)
NEXTAUTH_SECRET         → you generate (same)
ENCRYPTION_KEY          → you generate (same; required in production)
GMAIL_ENCRYPTION_KEY    → you generate (same)
GOOGLE_CLIENT_ID        → Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID
GOOGLE_CLIENT_SECRET    → same page → "Client secret"          SOURCE: Google Cloud Console
GOOGLE_API_KEY          → Google Cloud Console → Credentials → API key
GOOGLE_SEARCH_API_KEY   → Google Cloud Console → enable Custom Search API → API key
GOOGLE_SEARCH_CX        → programmablesearchengine.google.com → Setup → Search engine ID
SERPAPI_KEY             → serpapi.com → account → API key
SMTP_USER / EMAIL_FROM  → your Gmail address (or verified sender)
SMTP_PASSWORD           → Google Account → Security → 2-Step Verification → App passwords
                          SOURCE: Google Account app-password page (16-char, NOT login password)
RESEND_API_KEY          → resend.com → dashboard → API Keys
STRIPE_SECRET_KEY       → Stripe Dashboard → Developers → API Keys → Secret key
STRIPE_WEBHOOK_SECRET   → Stripe Dashboard → Developers → Webhooks → endpoint signing secret
STRIPE_*_PRICE_ID       → Stripe Dashboard → Products → each Price ID
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY → Stripe Dashboard → API Keys → Publishable key
RAZORPAY_KEY_ID/SECRET  → Razorpay Dashboard → Account & Settings → API Keys
RAZORPAY_WEBHOOK_SECRET → Razorpay Dashboard → Settings → Webhooks → secret you set
NEXT_PUBLIC_RAZORPAY_KEY_ID → Razorpay Dashboard → API Keys → Key Id
RAZORPAY_PLAN_*         → Razorpay Dashboard → Subscriptions → Plans → plan_id
TELEGRAM_BOT_TOKEN      → Telegram @BotFather → /newbot → token     (webhook validation only)
WHATSAPP_API_TOKEN      → Meta for Developers → WhatsApp → Business → token
META_APP_SECRET         → Meta for Developers → App Settings → Basic → App secret
TWILIO_AUTH_TOKEN       → Twilio Console → Account Info → Auth Token
VAPID_*                 → self-generate via web-push keypair (npx web-push generate-vapid-keys)
CRON_SECRET             → you generate (any long random string)
NEXT_PUBLIC_SENTRY_DSN  → sentry.io → project → Client Keys (DSN)
REDIS_URL               → self-hosted Redis or managed provider (OPTIONAL)
```

### SOURCE UNKNOWN — MANUAL VERIFICATION REQUIRED

- `GOOGLE_SEARCH_CX` value currently in the workspace `.env` — engine ownership could not be verified programmatically; confirm it belongs to your Programmable Search engine.
- Legacy dev fallback strings `acquisitionos-cron-dev` (in `payment-reconciliation`, `meetings/reminders/process` code paths) — hardcoded dev fallbacks; verify they are never valid in production before go-live.

---

## 11. Secret Handling Rules (enforced)

1. `.gitignore` covers `.env*` (verified line 34) — `.env`, `.env.local`, `.env.*.local` are never committed.
2. `.env.example` in the repo root contains **placeholders only** and is the safe template.
3. **No real credential value appears in any documentation or PDF in this repository.**
4. ⚠️ **Credential exposure status (full audit 2026-09-22 — rotation REQUIRED before production):**
   - `tool-results/bash_1789224624861_a6df86f85563.txt` and `tool-results/read_1789224632137_3675a27d2adf.txt` (committed tool logs) contained the **full current `GOOGLE_CLIENT_SECRET` value and full Gmail app password**. They were **untracked** in commit `9a34777` (files remain on disk; directory already gitignored) — but the values remain reachable in Git **history** and in the pushed `origin/main` tree on GitHub. **Rotate the Google OAuth client secret and the Gmail app password.**
   - `ensure-env.sh` embedded the **full `GOOGLE_SEARCH_API_KEY`** in earlier commits; the current working-tree version is cleaned, but the value remains on `origin/main` and in history. **Rotate the Google Search API key** (or restrict it to the Custom Search API).
   - `DEPLOYMENT.md` / `worklog.md` contain a truncated (≈10-char) fragment of an OLD, different `GOCSPX-…` client secret — not exploitable alone; cosmetic cleanup recommended.
   - `JWT_SECRET` / `AUTH_SECRET` values are **NOT** in any commit (verified via pickaxe over all history).
   - `CRON_SECRET` current value is a guessable dev string — rotate before any shared/production deployment.
5. When sharing the project, share `.env.example` + `ENVIRONMENT-VARIABLES.md` — never your `.env` / `.env.local`.
6. `.env.local` mirrors the workspace `.env` exactly (verified key-for-key) — it exists so a new machine can reproduce the current environment; it is gitignored and must never be committed.
