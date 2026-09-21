# GCP Secrets — Secret Manager for Every AcquisitionOS Variable

Everything the app reads at runtime comes from environment variables; on GCP, the variables that are **secrets** are stored in **Secret Manager** and injected into Cloud Run at deploy time. This page lists every variable from [`../../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) with its exact GCP handling, plus rotation and access-control rules.

---

## 1. Why Secret Manager (and how it works)

**What:** a regional-replicated store where each *secret* (a named container, e.g. `JWT_SECRET`) holds immutable *versions*; a version's payload is the value. Cloud Run references secrets by name and injects the payload as an environment variable when a revision starts.

**Why (for AcquisitionOS):** the app requires values like `JWT_SECRET` and `DATABASE_URL` that must (a) never enter Git or the container image, (b) be changeable without rebuilding, (c) be auditable (Secret Manager logs every access). The app's own validator (`src/lib/env-validation.ts`) treats `DATABASE_URL`, `JWT_SECRET`, and `NEXT_PUBLIC_APP_URL` as critical — their absence breaks production.

Concepts you need:

- `gcloud secrets create NAME` — creates the container (version 1 with `--data-file`).
- `gcloud secrets versions add NAME` — adds a **new** version; old versions remain (rollback!).
- `NAME:latest` — an alias to the newest version (what Cloud Run references).
- Access control = IAM on the secret (or project): `roles/secretmanager.secretAccessor`.

**Golden rule (from the handbook):** only `NEXT_PUBLIC_*` values are browser-safe. Everything else is server-side only.

---

## 2. Create, update, label — the commands

```bash
# Create from stdin (safe for any value, no shell history risk):
printf '%s' "YOUR_VALUE" | gcloud secrets create JWT_SECRET --data-file=-

# Update = add a new version (the old one stays retrievable):
printf '%s' "NEW_VALUE" | gcloud secrets versions add JWT_SECRET --data-file=-

# Generate-and-store in one step (JWT_SECRET, CRON_SECRET, ENCRYPTION_KEY):
openssl rand -hex 32 | gcloud secrets create CRON_SECRET --data-file=-

# Label for filtering/billing hygiene:
gcloud secrets update JWT_SECRET --update-labels=app=acquisitionos,env=production,class=critical

# Read a value back (audited; do this only when necessary):
gcloud secrets versions access latest --secret=JWT_SECRET

# List + inventory:
gcloud secrets list --filter="labels.app=acquisitionos"
```

Expected output: `Created secret [JWT_SECRET].` / `Created version [1].` Verify with `gcloud secrets versions list JWT_SECRET`.

---

## 3. Every AcquisitionOS variable on GCP

**Storage key:** **SECRET** = Secret Manager secret (name = env var name). **ENV** = plain `--set-env-vars` value (non-secret config). **BUILD** = must be present when the Docker image is built (`NEXT_PUBLIC_*` inlining — [`frontend.md`](./frontend.md)).

### 3.1 Critical — `REQUIRED FOR CURRENT ACQUISITIONOS`

| Variable | Storage | Value comes from |
| --- | --- | --- |
| `DATABASE_URL` | **SECRET** | Your Cloud SQL string with `connection_limit=10` ([`database.md`](./database.md) §4) |
| `DIRECT_URL` | **SECRET** | Direct connection string (migrations) |
| `JWT_SECRET` | **SECRET** | `openssl rand -hex 32` |
| `APP_PUBLIC_URL` | ENV | `https://app.yourdomain.com` |
| `NEXT_PUBLIC_APP_URL` | ENV **+ BUILD** | same value; must be baked at build time too |
| `AUTH_DEV_MODE` | (unset) | **Leave unset in production** — hard-gated off when `NODE_ENV=production` |
| `NODE_ENV` | (platform) | `production` — set in the Dockerfile |

### 3.2 Database

| Variable | Storage | Notes |
| --- | --- | --- |
| `DATABASE_URL` | **SECRET** | Pooled/limited runtime URL |
| `DIRECT_URL` | **SECRET** | Direct URL for `prisma db push` |

### 3.3 Email (`REQUIRED` for email auth — configure SMTP **or** Resend)

| Variable | Storage | Notes |
| --- | --- | --- |
| `SMTP_HOST`, `SMTP_PORT` | ENV | e.g. `smtp.gmail.com`, `587` |
| `SMTP_USER` | **SECRET** | semi-secret; simpler to keep it with the password |
| `SMTP_PASSWORD` | **SECRET** | Gmail App Password (16 chars) for `smtp.gmail.com` |
| `SMTP_FROM` (aliases `EMAIL_FROM`…) | ENV | sender address |
| `RESEND_API_KEY` | **SECRET** | only if using Resend instead of SMTP |

### 3.4 Payments (enable what you sell with)

| Variable | Storage | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | **SECRET** | `sk_...` from Stripe dashboard |
| `STRIPE_PUBLISHABLE_KEY` | ENV | public by design (`pk_...`) |
| `STRIPE_WEBHOOK_SECRET` | **SECRET** | `whsec_...` from the webhook registration |
| `RAZORPAY_KEY_ID` | ENV | semi-secret id |
| `RAZORPAY_KEY_SECRET` | **SECRET** | |
| `RAZORPAY_WEBHOOK_SECRET` | **SECRET** | |
| `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` | ENV | optional overrides |

### 3.5 Google integrations

| Variable | Storage | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | ENV | non-secret OAuth id |
| `GOOGLE_CLIENT_SECRET` | **SECRET** | `GOCSPX-...` |
| `GOOGLE_API_KEY` | **SECRET** | Calendar freeBusy |
| `GOOGLE_SEARCH_API_KEY` | **SECRET** | lead discovery (Google Custom Search) |
| `GOOGLE_SEARCH_ENGINE_ID` | ENV | engine id (non-secret) |
| `SERPAPI_KEY` | **SECRET** | alternative discovery provider |
| `GMAIL_PUBSUB_TOPIC` / `_SUBSCRIPTION` / `_WEBHOOK_URL` | ENV | `OPTIONAL` Gmail push mode |
| `GMAIL_CRON_API_KEY` | **SECRET** | protects `/api/gmail/jobs/process` |

### 3.6 AI (server-side only — never in client bundles)

| Variable | Storage | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`) | **SECRET** | **one provider key REQUIRED in external production** — the built-in z-ai provider reads no keys and its availability outside the GLM sandbox is `NEEDS VERIFICATION` |
| `OPENAI_MODEL` / `_BASE_URL` (per provider) | ENV | optional tuning |
| `AI_DEFAULT_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_TOKENS`, `AI_DEFAULT_TEMPERATURE`, `AI_*_CREDIT_COST`, `AI_*_CACHE_HOURS` | ENV | optional tuning with sane defaults |

### 3.7 Real-time, push, messaging (`OPTIONAL` features)

| Variable | Storage | Notes |
| --- | --- | --- |
| `REDIS_URL` | **SECRET** | Memorystore connection; absent = single-process SSE bus |
| `VAPID_PUBLIC_KEY` | ENV | browser push public key |
| `VAPID_PRIVATE_KEY` | **SECRET** | browser push private key |
| `TELEGRAM_BOT_TOKEN` | **SECRET** | Telegram channel |
| `TELEGRAM_WEBHOOK_URL` | ENV | optional override |

### 3.8 Observability & platform (`OPTIONAL`)

| Variable | Storage | Notes |
| --- | --- | --- |
| `OTEL_ENABLED`, `OTEL_EXPORTER`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` | ENV | OpenTelemetry export |
| `LOG_LEVEL` | ENV | `info` default |
| `ANALYTICS_CACHE_TTL`, `ENRICHMENT_TIMEOUT_MS` | ENV | optional tuning |
| `CRON_SECRET` | **SECRET** | REQUIRED — protects all `/api/cron/*` + billing endpoints |
| `ENCRYPTION_KEY` | **SECRET** | `src/lib/encryption.ts`; `openssl rand -hex 32` |

### 3.9 Branding (ENV, non-secret)

`COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_EMAIL`, `COMPANY_PHONE`, `COMPANY_GST_NUMBER`, `COMPANY_TAX_ID`, `PRODUCT_NAME`, `NEXT_PUBLIC_APP_VERSION` — review the placeholder defaults and override with your real details (invoice PDFs use them).

---

## 4. Injecting into Cloud Run (`--set-secrets`)

```bash
gcloud run deploy acquisitionos \
  --region="$REGION" --image="$IMAGE_URL" \
  # ...flags from manual-deployment.md step 11...
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,DIRECT_URL=DIRECT_URL:latest,JWT_SECRET=JWT_SECRET:latest,CRON_SECRET=CRON_SECRET:latest,SMTP_PASSWORD=SMTP_PASSWORD:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest
```

- The runtime service account needs `roles/secretmanager.secretAccessor` on these secrets (§5) — the deployer needs it too when running `--set-secrets`.
- A secret **update does not change a running revision**. New revision required:
  ```bash
  gcloud run services update acquisitionos --region="$REGION"   # re-resolves :latest into a new revision
  ```
- Verify: `gcloud run services describe acquisitionos --region="$REGION" --format=yaml | grep -A2 -i secret`; then `curl -s https://app.yourdomain.com/api/health`.

---

## 5. Access control — least privilege

1. **Runtime SA only:** `roles/secretmanager.secretAccessor` on the project (or, tighter, per secret) for `acquisitionos-runtime@...` — nobody else.
2. **Per-secret tightening (OPTIONAL, stronger):**
   ```bash
   gcloud secrets add-iam-policy-binding JWT_SECRET \
     --member="serviceAccount:acquisitionos-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```
3. Humans keep `secretmanager.viewer` (metadata) at most; *accessing* values is an audited, exceptional action.
4. CI deploy identities (Workload Identity Federation — [`terraform.md`](./terraform.md) §7) get `secretAccessor` **only if** the pipeline writes secret versions; otherwise not even that.
5. Audit: Secret Manager access logs appear in Cloud Logging (`protoPayload.methodName` contains `SecretManagerService`).

---

## 6. Rotation guidance

| Secret | Rotation effect | Procedure |
| --- | --- | --- |
| `JWT_SECRET` | **Invalidates all existing sessions** — users must log in again | Pick a low-traffic window; add new version; `gcloud run services update`; announce the forced re-login. Rotate only on suspicion or schedule |
| `CRON_SECRET` | Scheduler jobs must be updated in lockstep, or every cron run 401s | Update the secret version AND the Cloud Scheduler job headers together |
| DB password (`app_user`) | App errors while the old/new mismatch | Create new user or update password → update `DATABASE_URL`/`DIRECT_URL` versions → update service; keep a rollback version |
| `STRIPE_WEBHOOK_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Webhook signature failures while mismatched | Roll the secret in the provider dashboard, then update the Secret Manager version, then update the service |
| Provider API keys (AI, SMTP, Google) | Feature-specific failures | Rotate provider-side, update secret version, update service |

Always: add a **new version** (never delete the old one first), update the service, verify `/api/health` + the affected feature, only then retire the old version.

---

## 7. Never commit — the non-negotiable list

These must never appear in Git, issues, Slack, or docs (`.gitignore` already excludes `.env*`):

```text
.env, .env.local, .env.production (any .env*)
JWT_SECRET, CRON_SECRET, ENCRYPTION_KEY, DB passwords (any generated secret)
SMTP_PASSWORD / Gmail App Passwords, RESEND_API_KEY
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
GOOGLE_CLIENT_SECRET, GOOGLE_API_KEY, GOOGLE_SEARCH_API_KEY, SERPAPI_KEY
OPENAI_API_KEY / ANTHROPIC_API_KEY / OPENROUTER_API_KEY
GMAIL_CRON_API_KEY, TELEGRAM_BOT_TOKEN, VAPID_PRIVATE_KEY, REDIS_URL
Service-account JSON key files (you should not have any — use OIDC federation)
terraform.tfstate / plan files (they contain secret_data — see terraform.md §5)
```

If a secret ever lands in Git: rotate it immediately (treat as leaked) — do not just delete the file, history keeps it.

---

## 8. Official documentation

- Secret Manager overview — https://cloud.google.com/secret-manager/docs
- Create and access secrets — https://cloud.google.com/secret-manager/docs/creating-and-accessing-secrets
- Using secrets with Cloud Run — https://cloud.google.com/run/docs/configuring/secrets
- Access control (IAM roles) — https://cloud.google.com/secret-manager/docs/access-control
- Audit logging — https://cloud.google.com/secret-manager/docs/audit-logging
- Handbook env-var inventory — [`../../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md)
