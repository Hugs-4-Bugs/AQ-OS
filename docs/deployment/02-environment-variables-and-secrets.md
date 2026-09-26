# Environment Variables & Secrets — Complete Inventory

Every variable below was discovered by scanning the current source tree (`src/**`) plus the app's own validators (`src/lib/env-validation.ts`, `src/lib/env-safeguard.ts`). Nothing here is invented.

**Column meanings:**

- **Side** — *server*: read only inside the Node process. *client*: `NEXT_PUBLIC_*`, embedded into browser JavaScript **at build time**.
- **Req** — *required*: production breaks or is insecure without it. *optional*: the related feature degrades gracefully.
- **Secret** — must be stored in a secret manager; compromise = incident.
- **Browser-safe** — may appear in the client bundle without leaking anything sensitive.

> ⚠️ **Golden rule:** anything **without** the `NEXT_PUBLIC_` prefix must **never** appear in frontend code or client bundles. Bundles are public — anyone can read them. Secrets go server-side only, injected from your cloud's secret manager.

---

## 1. Critical (the app will not run securely without these)

| Name | Purpose | Side | Req | Secret | Browser-safe | Production storage |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Prisma connection string (pooled path, e.g. through PgBouncer/RDS Proxy/Hyperdrive) | server | **REQUIRED** | 🔴 secret (contains password) | ❌ | Secret manager |
| `DIRECT_URL` | Direct (non-pooled) connection for Prisma migrations | server | **REQUIRED** (with `schema.production.prisma`) | 🔴 secret | ❌ | Secret manager |
| `JWT_SECRET` | Signs the custom auth JWTs (access + refresh cookies) | server | **REQUIRED** | 🔴 secret | ❌ | Secret manager |
| `NEXT_PUBLIC_APP_URL` | Public origin used by client code (build-time inlined) | client | **REQUIRED** | 🟢 non-secret | ✅ | Build-time env / CI variable |
| `APP_PUBLIC_URL` | Server-side public origin override (`app-url.ts` priority above headers) | server | **REQUIRED** (recommended) | 🟢 non-secret | ❌ | Env var / app config |
| `AUTH_DEV_MODE` | Enables dev-only auth fallbacks. | server | Set **`false`/unset** in prod | 🟢 non-secret | ❌ | App config (leave unset) |
| `NODE_ENV` | `production` in deployed environments (controls secure cookies, cache headers, console stripping) | server | **REQUIRED** (set by platform) | 🟢 non-secret | ❌ | Platform default |

Notes:

- `JWT_SECRET` has a hardcoded dev fallback in code (`acquisitionos-dev-secret-change-in-production`) — the app warns in production. **Generate a real 64-char random secret**; treat its absence as a P1 incident.
- URL resolution fallback order is documented in [`01-architecture.md`](./01-architecture.md) §2.2. Setting both `NEXT_PUBLIC_APP_URL` and `APP_PUBLIC_URL` to the same value removes all ambiguity.
- Never use `localhost` values for the URL vars in production — the app's own safeguard flags that combination.

**Generating secrets:**

```bash
# 64-hex-char secret (JWT_SECRET, ENCRYPTION_KEY, CRON_SECRET...)
openssl rand -hex 32
```

---

## 2. Database

| Name | Purpose | Side | Req | Secret | Browser-safe | Production storage |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Runtime queries (pooled) — see above | server | **REQUIRED** | 🔴 | ❌ | Secret manager |
| `DIRECT_URL` | Migrations / `prisma db push` (direct) | server | **REQUIRED** | 🔴 | ❌ | Secret manager |

Why two URLs: serverless/pooled setups sit behind a pooler that doesn't support prepared-statement-based migrations. Prisma uses `directUrl` for migrate/push commands. Format examples (placeholders):

```text
DATABASE_URL="postgresql://app_user:YOUR_DB_PASSWORD@your-pooler-host:5432/acquisitionos?sslmode=require&connection_limit=10"
DIRECT_URL="postgresql://app_user:YOUR_DB_PASSWORD@your-db-host:5432/acquisitionos?sslmode=require"
```

Deep dive: [`04-database-production.md`](./04-database-production.md).

---

## 3. Email (OTP, magic link, verification, invoices, notifications)

Primary provider is **SMTP (nodemailer)**; Resend is the alternative. Configure **one** of the two. `REQUIRED` if you want email-based signup/login to work.

| Name | Purpose | Side | Req | Secret | Browser-safe | Production storage |
| --- | --- | --- | --- | --- | --- | --- |
| `SMTP_HOST` | SMTP server (e.g. `smtp.gmail.com`) | server | w/ SMTP | 🟢 non-secret | ❌ | Secret manager (non-secret block) |
| `SMTP_PORT` | `587` (STARTTLS) or `465` (SSL) | server | w/ SMTP | 🟢 non-secret | ❌ | same |
| `SMTP_USER` | SMTP username (Gmail: full address) | server | w/ SMTP | 🟡 semi (identifies sender) | ❌ | Secret manager |
| `SMTP_PASSWORD` | SMTP password / **Gmail App Password (16 chars)** | server | w/ SMTP | 🔴 secret | ❌ | Secret manager |
| `SMTP_FROM` / `EMAIL_FROM` / `MAIL_FROM` / `FROM_EMAIL` | From-address for outgoing mail | server | recommended | 🟢 non-secret | ❌ | Env var |
| `RESEND_API_KEY` | Resend API key (alternative provider) | server | w/ Resend | 🔴 secret | ❌ | Secret manager |

Aliases the code also accepts (useful for migration from other setups; mark `NEEDS VERIFICATION` for exact precedence): `SMTP_PASS`, `SMTP_USERNAME`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_PASSWORD`, `EMAIL_USER`, `EMAIL_PASSWORD`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_FROM_ADDRESS`. **Prefer the canonical names above.**

Gmail sender checklist: 2-Step Verification on → App Password generated → SPF TXT record for the sending domain → send a test via `scripts/test-smtp.ts` before go-live.

---

## 4. Payments

Both providers are integrated; enable the one(s) you sell with.

### Stripe

| Name | Purpose | Side | Req | Secret | Browser-safe |
| --- | --- | --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Server-side Stripe API (`sk_...`) | server | for billing | 🔴 secret | ❌ |
| `STRIPE_PUBLISHABLE_KEY` | Client-side Stripe.js (`pk_...`) | client | for billing | 🟢 by design public | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhook signatures (`whsec_...`) for `POST /api/payments/webhook/stripe` | server | for billing | 🔴 secret | ❌ |
| `STRIPE_SUCCESS_URL` | Override checkout success redirect (defaults to `<app>/billing?session_id=...`) | server | optional | 🟢 non-secret | ❌ |
| `STRIPE_CANCEL_URL` | Override checkout cancel redirect | server | optional | 🟢 non-secret | ❌ |

### Razorpay

| Name | Purpose | Side | Req | Secret | Browser-safe |
| --- | --- | --- | --- | --- | --- |
| `RAZORPAY_KEY_ID` | Razorpay key id | server | for Razorpay | 🟡 semi | ❌ |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret | server | for Razorpay | 🔴 secret | ❌ |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies Razorpay webhook payloads | server | for Razorpay | 🔴 secret | ❌ |

After deploy: register `https://app.yourdomain.com/api/payments/webhook/stripe` in Stripe and `https://app.yourdomain.com/api/payments/webhook/razorpay` in Razorpay.

---

## 5. Google integrations

| Name | Purpose | Side | Req | Secret | Browser-safe |
| --- | --- | --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client for Google sign-in + Gmail connect | server | for those features | 🟢 non-secret | ❌ |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret (`GOCSPX-...`) | server | for those features | 🔴 secret | ❌ |
| `GOOGLE_API_KEY` | Google Calendar freeBusy API calls | server | for calendar | 🔴 secret | ❌ |
| `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` | Google Custom Search used by lead discovery | server | for discovery via Google CSE | 🔴 secret / 🟢 non-secret | ❌ |
| `SERPAPI_KEY` | Alternative discovery search provider | server | optional | 🔴 secret | ❌ |

OAuth console checklist: authorized redirect URIs must include **exactly** `https://app.yourdomain.com/api/auth/google/callback` (verify the exact path in `src/app/api/auth/google/` when configuring) — mismatch = `redirect_uri_mismatch`.

### Gmail push (OPTIONAL feature)

| Name | Purpose | Side | Req |
| --- | --- | --- | --- |
| `GMAIL_PUBSUB_TOPIC` | Google Cloud Pub/Sub topic Gmail notifies | server | for push mode |
| `GMAIL_PUBSUB_SUBSCRIPTION` | Subscription name | server | for push mode |
| `GMAIL_PUBSUB_WEBHOOK_URL` | HTTPS push endpoint → `/api/gmail/pubsub/webhook` | server | for push mode |
| `GMAIL_CRON_API_KEY` | Protects `/api/gmail/jobs/process` (pull/cron mode) | server | recommended if used |

Without Pub/Sub, Gmail replies are ingested by scheduling `/api/cron/process-gmail-replies` — that is the fallback mode.

---

## 6. AI providers (server-side only — never in client bundles)

| Name | Purpose | Side | Req | Secret |
| --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` | OpenAI fallback provider (default model `gpt-4o`) | server | **one provider REQUIRED in external prod** | 🔴 |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` / `ANTHROPIC_BASE_URL` | Anthropic fallback provider | server | alternative | 🔴 |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` / `OPENROUTER_BASE_URL` | OpenRouter fallback provider | server | alternative | 🔴 |
| `AI_LOCAL_ENDPOINT` / `AI_LOCAL_MODEL` | Self-hosted OpenAI-compatible endpoint | server | alternative | 🔴/🟢 |

Tuning (all optional, sane defaults in `src/lib/ai/ai-provider.ts`): `AI_DEFAULT_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_TOKENS`, `AI_DEFAULT_TEMPERATURE`, `AI_CHAT_CREDIT_COST`, `AI_ANALYSIS_CREDIT_COST`, `AI_SCORING_CREDIT_COST`, `AI_OUTREACH_CREDIT_COST`, `AI_ANALYSIS_CACHE_HOURS`, `AI_SCORING_CACHE_HOURS`, `AI_CHAT_MAX_MESSAGES_PER_SESSION`, `AI_MEMORY_MAX_TOKENS`, `AI_MEMORY_MAX_AGE_HOURS`, `AI_MEMORY_CACHE_SIZE`, `AI_PROMPT_MAX_INPUT_LENGTH`.

> The built-in `z-ai` primary provider reads **no** env keys; outside the GLM sandbox its availability is **NEEDS VERIFICATION**. Always set at least one fallback key in production.

---

## 7. Real-time, push & messaging

| Name | Purpose | Side | Req | Secret |
| --- | --- | --- | --- | --- |
| `REDIS_URL` | Cross-instance SSE fan-out (pub/sub). Absent → single-process bus (graceful no-op) | server | `OPTIONAL` | 🔴 secret |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push for browser notifications | server (+public key shipped to clients by the app) | `OPTIONAL` | 🟢 / 🔴 |
| `TELEGRAM_BOT_TOKEN` | Telegram notification channel & webhook verification | server | `OPTIONAL` | 🔴 |
| `TELEGRAM_WEBHOOK_URL` | Override webhook URL (defaults to app URL) | server | `OPTIONAL` | 🟢 |

---

## 8. Observability & platform

| Name | Purpose | Side | Req | Secret |
| --- | --- | --- | --- | --- |
| `OTEL_ENABLED` | Enables OpenTelemetry instrumentation | server | `OPTIONAL` | 🟢 |
| `OTEL_EXPORTER` | Exporter selection | server | `OPTIONAL` | 🟢 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint (works with each cloud's managed collector or self-hosted) | server | `OPTIONAL` | 🟢 |
| `OTEL_SERVICE_NAME` | Service identifier in traces | server | `OPTIONAL` | 🟢 |
| `LOG_LEVEL` | App log verbosity (`info` default in production) | server | `OPTIONAL` | 🟢 |
| `ANALYTICS_CACHE_TTL` | Analytics cache seconds (default 300) | server | `OPTIONAL` | 🟢 |
| `ENRICHMENT_TIMEOUT_MS` | Lead-enrichment HTTP timeout (default 30000) | server | `OPTIONAL` | 🟢 |
| `PORT` / `HOSTNAME` | Listen port / bind address (`3000` / `0.0.0.0` set in Dockerfile) | server | set by platform | 🟢 |

---

## 9. Branding / invoice identity (all optional, have code defaults)

`COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_EMAIL`, `COMPANY_PHONE`, `COMPANY_GST_NUMBER`, `COMPANY_TAX_ID`, `PRODUCT_NAME`, `NEXT_PUBLIC_APP_VERSION` — used on generated PDF invoices and product references. **Review the defaults in `src/lib/invoice-pdf-service.ts` and override them with your real company details** — the built-in defaults are clearly placeholder values. Non-secret; store as app config/env.

---

## 10. Where values come from (summary)

| Value | Source |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Your cloud's managed-PostgreSQL console (`database.md` per cloud) |
| `JWT_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` | `openssl rand -hex 32` — generated by you |
| `SMTP_*` | Your email provider (Gmail: Google Account → Security → App passwords) |
| `RESEND_API_KEY` | Resend dashboard |
| `STRIPE_*`, `RAZORPAY_*` | Provider dashboards (test → live mode) |
| `GOOGLE_*` | Google Cloud Console → APIs & Services → Credentials |
| `OPENAI/ANTHROPIC/OPENROUTER_*` | Provider dashboards |
| `REDIS_URL` | Managed Redis provider (if used) |

## 11. Handling rules (non-negotiable)

1. **Never commit secrets.** `.gitignore` already excludes `.env*`; keep it that way. Never paste real values into docs, issues, or Slack.
2. **Frontend bundles are public.** Only `NEXT_PUBLIC_*` values may be referenced in client components.
3. **One source of truth in production:** the cloud secret manager → injected as env vars → the app reads `process.env`. Do not also bake secrets into images.
4. **Rotate** `JWT_SECRET` with care: rotation invalidates existing sessions (users re-login). Rotate DB/payment keys provider-side on suspicion of leak.
5. **Least-privilege DB user:** the app user should own the app schema — not the instance superuser.
6. When in doubt about a variable's exact behavior, read the code that consumes it and mark anything unverifiable as **NEEDS VERIFICATION** — do not guess.
