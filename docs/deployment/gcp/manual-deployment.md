# GCP Manual Deployment — Click-by-Click, Command-by-Command

This is the core walkthrough: deploy production AcquisitionOS on GCP by hand, understanding every command. Do it once manually even if you plan to use Terraform ([`terraform.md`](./terraform.md)) — the manual pass teaches you what each piece of infrastructure does.

**Conventions used below:**

- Every step follows **What → Why → Command → Expected output → Verify**.
- Placeholders like `YOUR_PROJECT_ID` are defined in Step 0; the note under each block says where the value comes from.
- `REQUIRED FOR CURRENT ACQUISITIONOS` marks steps the app genuinely needs. `OPTIONAL` steps are labeled and skippable.

---

## Step 0 — Set the shared environment variables

**What:** one shell block defining every value used later. **Why:** copy-paste safety — later commands reference `$PROJECT_ID` etc., so you never half-edit a command.

```bash
# ---- run this in the shell you deploy from ----
export PROJECT_ID="YOUR_PROJECT_ID"      # from prerequisites.md §3 (gcloud projects create)
export REGION="us-central1"              # prerequisites.md §9 (pick one region, keep it)
export APP_DOMAIN="app.yourdomain.com"   # your real domain from your registrar
export SA_NAME="acquisitionos-runtime"   # you choose: name of the runtime service account
export RUNTIME_SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export SERVICE_NAME="acquisitionos"      # you choose: Cloud Run service name
export REPO_NAME="acquisitionos"         # you choose: Artifact Registry repo name
export DB_INSTANCE="acquisitionos-pg"    # you choose: Cloud SQL instance name
export DB_NAME="acquisitionos"           # database name inside the instance
export DB_USER="app_user"                # application DB user (NOT the admin user)
export DB_PASSWORD="YOUR_DB_PASSWORD"    # generate: openssl rand -hex 24 (do NOT commit)
export CRON_SECRET="$(openssl rand -hex 32)"   # generated now; keep it safe (password manager)
export JWT_SECRET="$(openssl rand -hex 32)"    # generated now; keep it safe
export GIT_SHA="$(git rev-parse --short HEAD)" # image tag = the commit you deploy
export IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${GIT_SHA}"
```

Verify: `echo $PROJECT_ID $REGION $IMAGE_URL` prints your values.

> Store `CRON_SECRET`, `JWT_SECRET`, `DB_PASSWORD` in a password manager **now**. Step 10 uploads them to Secret Manager; the local variables are disposable afterwards.

---

## Step 1 — Confirm prerequisites

**What/Why:** every later step assumes these are true. **Where:** [`prerequisites.md`](./prerequisites.md).

```bash
gcloud auth list                 # your user is ACTIVE
gcloud config list               # project = YOUR_PROJECT_ID, region set
gcloud services list --enabled | grep -E "run|sqladmin|secretmanager|artifactregistry|scheduler"
```

Expected: all listed. If not, re-run the API-enable command from `prerequisites.md` §7.

---

## Step 2 — Enable the APIs

**What:** turn on each GCP product for this project. **Why:** an un-enabled API makes every dependent command fail with `PERMISSION_DENIED`.

```bash
gcloud services enable \
  run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com \
  artifactregistry.googleapis.com dns.googleapis.com cloudscheduler.googleapis.com \
  pubsub.googleapis.com cloudbuild.googleapis.com monitoring.googleapis.com \
  logging.googleapis.com iam.googleapis.com
```

Expected output: one `Operation ... finished successfully.` per API (or `already enabled`).

Verify: `gcloud services list --enabled` shows all eleven.

---

## Step 3 — Create the runtime service account + grant IAM roles

**What:** the *runtime service account* is the robot identity your container runs as; *you* (the deployer) need separate permissions to create resources.

**Why (for AcquisitionOS):** the container must read secrets and connect to Cloud SQL **as itself**, with least privilege — not with your admin user.

```bash
# 3a. Create the runtime service account
# What: a dedicated identity for the Cloud Run service.
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="AcquisitionOS runtime"
# Expected output: created service account [...]. 
# Verify: gcloud iam service-accounts list --filter="$SA_NAME"
```

```bash
# 3b. Grant the runtime SA its least-privilege roles
# secretAccessor: the container reads its Secret Manager secrets.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/secretmanager.secretAccessor"

# cloudsql.client: unix-socket connections to Cloud SQL (Step 11).
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/cloudsql.client"

# artifactregistry.reader: Cloud Run pulls the image as this identity.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/artifactregistry.reader"

# iam.serviceAccountUser: lets the deployer deploy services AS this SA.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="user:YOUR_GCP_EMAIL" --role="roles/iam.serviceAccountUser"
```

```bash
# 3c. Grant YOUR user the deployer roles (least privilege for deploys)
# Replace YOUR_GCP_EMAIL with the account from `gcloud auth list`.
for ROLE in roles/run.admin roles/artifactregistry.writer roles/secretmanager.secretAccessor roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="user:YOUR_GCP_EMAIL" --role="$ROLE"
done
```

Expected output: an updated IAM policy binding table after each command (`roles/iam.serviceAccountUser` is granted on the SA, the rest on the project).

Verify: `gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" --format="table(bindings.role)" | grep -E "run.admin|artifactregistry|secretmanager|cloudsql.client"` shows your user.

Where values come from: `YOUR_GCP_EMAIL` = the `ACCOUNT` column of `gcloud auth list`. Role descriptions: [`prerequisites.md`](./prerequisites.md) §6; deeper least-privilege discussion in [`security.md`](./security.md).

---

## Step 4 — (skip to Step 5 if not building locally) — prepare the repo for Docker builds

`REQUIRED FOR CURRENT ACQUISITIONOS` before the first build: the repository **currently lacks two files** its own `Dockerfile` depends on (see [`../../03-docker.md`](../03-docker.md) §3):

1. `.npmrc` at repo root containing `legacy-peer-deps=true` (otherwise `npm ci` fails with `ERESOLVE` — `next-auth@4` vs `nodemailer@8` peer conflict).
2. `.dockerignore` at repo root (otherwise `COPY . .` ships your local `.env`/node_modules into the build context).

Both contain no secrets and are safe to commit. Verify: `ls -la .npmrc .dockerignore` inside the repo before building.

---

## Step 5 — Create the Artifact Registry repository

**What:** a private Docker registry inside your project. **Why:** Cloud Run pulls the AcquisitionOS image from here; keeping it in-region keeps pulls fast and traffic free.

```bash
# What: create a Docker-format repository named $REPO_NAME in $REGION.
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --description="AcquisitionOS container images"
# Expected output: Create request issued ... done.
# Verify: gcloud artifacts repositories list
```

---

## Step 6 — Build the image

**What:** produce the container from the repo's multi-stage `Dockerfile` (see [`../../03-docker.md`](../03-docker.md) §2 for the block-by-block explanation).

```bash
cd /path/to/acquisitionos            # the repository root

# What: build with two tags — the immutable Git SHA and the moving "latest".
# Why: deploys reference the SHA (auditability); "latest" is only a convenience pointer.
docker build -t "$SERVICE_NAME:$GIT_SHA" -t "$SERVICE_NAME:latest" .
# Expected output (after 3-10 min): naming to ... acquisitionos:<sha>
# If it fails at COPY .npmrc or ERESOLVE → Step 4 was skipped. If "Killed" → memory; see ../../03-docker.md §4.
```

Optional (recommended): scan before pushing — `trivy image "$SERVICE_NAME:$GIT_SHA"`.

Verify: `docker images | grep $SERVICE_NAME` shows both tags.

> Build-time note: if `APP_DOMAIN` is final, bake it in now — `NEXT_PUBLIC_APP_URL` is inlined at build time (`docker build --build-arg`… the repo's Dockerfile has no ARG for it; simplest is to set it via `.env.production.local` **before** the build or rebuild when it changes — see [`frontend.md`](./frontend.md)).

---

## Step 7 — Push the image

```bash
# What: point docker's credential helper at Artifact Registry, tag, push.
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker tag "$SERVICE_NAME:$GIT_SHA" "$IMAGE_URL"
docker push "$IMAGE_URL"
# Expected output: digest: sha256:... (long layers list first)
```

Verify: `gcloud artifacts docker images list "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"` lists your tag.

---

## Step 8 — Create the Cloud SQL PostgreSQL instance

**What:** a managed PostgreSQL 16 server. **Why:** production must run PostgreSQL via Prisma (`prisma/schema.production.prisma`) — the dev SQLite file is never deployed.

```bash
# What: create the instance (2 vCPU / 8 GB; smallest sensible production tier).
gcloud sql instances create "$DB_INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-8192 \
  --region="$REGION" \
  --storage-size=20GB \
  --storage-auto-increase \
  --backup-start-time=07:00 \
  --enable-point-in-time-recovery \
  --retained-backups-count=30 \
  --availability-type=ZONAL
# Expected output: Creating Cloud SQL instance ... done. (~5 minutes)
# Verify: gcloud sql instances list
```

Flag-by-flag:

| Flag | Meaning | Alternative |
| --- | --- | --- |
| `--database-version=POSTGRES_16` | engine + major version | 14/15 also supported by the app (14+ required) |
| `--tier=db-custom-2-8192` | 2 vCPU, 8 GB RAM | `db-g1-small` for staging/cheap start; scale up later (`gcloud sql instances patch`) |
| `--storage-auto-increase` | disk grows automatically | alert at 75% anyway ([`monitoring.md`](./monitoring.md)) |
| `--backup-start-time=07:00` | daily automated backup window (UTC) | pick your low-traffic hour |
| `--enable-point-in-time-recovery` + `--retained-backups-count=30` | PITR — restore to any second within the window | see [`../../04-database-production.md`](../04-database-production.md) §7 |
| `--availability-type=ZONAL` | single zone (cheaper) | `REGIONAL` = high availability, ~2x cost — [`database.md`](./database.md) §5 |

Enforce TLS (so DB credentials are never sent in plaintext) and note the connection name:

```bash
gcloud sql instances patch "$DB_INSTANCE" --require-ssl
export DB_CONN_NAME="$(gcloud sql instances describe "$DB_INSTANCE" --format='value(connectionName)')"
echo "$DB_CONN_NAME"    # looks like: YOUR_PROJECT_ID:us-central1:acquisitionos-pg — used in steps 9 & 11
```

Networking choice (default here: **no public exposure needed** — Step 11 connects via unix socket; alternatives compared in [`database.md`](./database.md) §4).

---

## Step 9 — Create the database and the application user (least privilege)

```bash
# What: create the database and a dedicated app user.
gcloud sql databases create "$DB_NAME" --instance="$DB_INSTANCE"
gcloud sql users create "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD"
# Expected output: Created database [acquisitionos]. / Created user [app_user].
# Verify: gcloud sql databases list --instance="$DB_INSTANCE"; gcloud sql users list --instance="$DB_INSTANCE"
```

**Why a separate user:** the `postgres` admin user should never be used by the app. Grant `app_user` only what it needs (this mirrors [`../../04-database-production.md`](../04-database-production.md) §2):

> The SQL below needs a database connection — run it **after** Step 9b installs the Cloud SQL Auth Proxy (it tunnels your local `psql` to Cloud SQL).

```bash
# What: connect once as admin (via the Auth Proxy) and apply least-privilege grants.
PGPASSWORD="YOUR_ADMIN_PASSWORD" psql -h 127.0.0.1 -U postgres -d "$DB_NAME" <<'SQL'
CREATE ROLE app_user WITH LOGIN PASSWORD 'YOUR_DB_PASSWORD';
GRANT CONNECT ON DATABASE acquisitionos TO app_user;
\c acquisitionos
GRANT USAGE, CREATE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
GRANT USAGE, CREATE ON ALL SEQUENCES IN SCHEMA public TO app_user;
SQL
```

> If you skipped admin-side SQL (a fresh instance already created `app_user`), the grants above are still the correct end state — run them once.

---

## Step 9b — Install the Cloud SQL Auth Proxy and push the schema

**What:** the **Cloud SQL Auth Proxy** is a small local binary that opens a TLS tunnel to Cloud SQL using your gcloud identity. **Why (for AcquisitionOS):** `npx prisma db push` must run from a machine that has the repo and the schema — the container image does not auto-migrate at boot.

```bash
# What: install the proxy via gcloud's managed component (alternative: download a pinned
# binary — see the official install page linked in database.md).
gcloud components install cloud-sql-proxy
# What: start the tunnel in the background, mapped to localhost:5432.
./cloud-sql-proxy "$DB_CONN_NAME" --port 5432
# Expected output: "... listening on 127.0.0.1:5432"
```

Now push the schema from the repository root:

```bash
cd /path/to/acquisitionos
export DIRECT_URL="postgresql://app_user:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?sslmode=disable"
# sslmode=disable is correct ONLY through the local proxy (the proxy encrypts the leg to Cloud SQL).
npx prisma db push --schema=prisma/schema.production.prisma
# Expected output: "The database is now in sync with your schema" (creates 53+ tables).
```

Why `DIRECT_URL`: Prisma uses `directUrl` from `schema.production.prisma` for migrations; the runtime `DATABASE_URL` may carry pool/limit parameters. Full explanation: [`../../04-database-production.md`](../04-database-production.md) §3–5.

Verify:

```bash
psql "postgresql://app_user:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}" -c '\dt' | head -20   # tables exist
```

Keep the proxy running only while migrating; stop it (`Ctrl+C` / `kill`) afterwards.

---

## Step 10 — Create Secret Manager secrets

**What:** Secret Manager stores each sensitive value as a *secret* containing *versions*. **Why:** secrets must reach the container as environment variables injected at deploy — never baked into the image or committed to Git.

Secret IDs below deliberately match the env var names the app reads. (Minimum required set; the complete grouped inventory lives in [`secrets.md`](./secrets.md).)

```bash
# Helper: create a secret from stdin. Usage: create_secret NAME "value"
create_secret() { printf '%s' "$2" | gcloud secrets create "$1" --data-file=-; }

# --- Database (runtime URL uses the Cloud Run unix-socket path; see Step 11) ---
create_secret DATABASE_URL "postgresql://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${DB_CONN_NAME}&connection_limit=10"
create_secret DIRECT_URL   "postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}"

# --- Critical auth secrets (generated in Step 0) ---
create_secret JWT_SECRET  "$JWT_SECRET"
create_secret CRON_SECRET "$CRON_SECRET"
```

Expected output: `Created secret [NAME].` per line.

Verify: `gcloud secrets list` shows them; `gcloud secrets versions list DATABASE_URL` shows version 1.

Add the `OPTIONAL` provider secrets the same way when ready (values from provider dashboards — never real values in docs/Git):

```bash
# Email (one of SMTP_PASSWORD or RESEND_API_KEY is REQUIRED for email auth)
create_secret SMTP_PASSWORD "YOUR_SMTP_APP_PASSWORD"    # Gmail: 16-char App Password
create_secret RESEND_API_KEY "YOUR_RESEND_KEY"          # alternative provider
# Payments (REQUIRED if billing features are used)
create_secret STRIPE_SECRET_KEY "YOUR_STRIPE_SK"
create_secret STRIPE_WEBHOOK_SECRET "YOUR_STRIPE_WHSEC"
# Google (REQUIRED for Google sign-in / Gmail / Calendar)
create_secret GOOGLE_CLIENT_SECRET "YOUR_GOOGLE_CLIENT_SECRET"
# AI (one provider key REQUIRED in production — see ../../01-architecture.md §2.6)
create_secret OPENAI_API_KEY "YOUR_OPENAI_KEY"
```

Labels for organization: `gcloud secrets update JWT_SECRET --update-labels=env=production,app=acquisitionos`.

---

## Step 11 — Deploy to Cloud Run

**What:** create the service that runs your image. **Why:** this one service IS AcquisitionOS — UI, API, SSE, and webhook receivers in one process.

```bash
# REQUIRED FOR CURRENT ACQUISITIONOS — flag map below.
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE_URL" \
  --region="$REGION" \
  --service-account="$RUNTIME_SA" \
  --port=3000 \
  --cpu=1 --memory=1Gi \
  --min-instances=1 \
  --no-cpu-throttling \
  --timeout=3600 \
  --max-instances=3 \
  --ingress=all \
  --add-cloudsql-instances="$DB_CONN_NAME" \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,DIRECT_URL=DIRECT_URL:latest,JWT_SECRET=JWT_SECRET:latest,CRON_SECRET=CRON_SECRET:latest \
  --set-env-vars=APP_PUBLIC_URL=https://${APP_DOMAIN},NEXT_PUBLIC_APP_URL=https://${APP_DOMAIN},LOG_LEVEL=info

# Expected output: "Allow unauthenticated invocations? [y/N]" → y  (the app does its own auth)
# then: Service [acquisitionos] revision [acquisitionos-00001] has been deployed and is
#       serving 100 percent of traffic.  Service URL: https://acquisitionos-xxxx-uc.a.run.app
export SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')"
echo "$SERVICE_URL"
```

Flag map (why each flag exists):

| Flag | Why |
| --- | --- |
| `--port=3000` | The standalone Next.js server listens on 3000 (Dockerfile `EXPOSE`). |
| `--cpu=1 --memory=1Gi` | Sane start; raise memory if you see restarts under load. |
| `--min-instances=1` | SSE requirement — never scale to zero ([`architecture.md`](./architecture.md) §4). |
| `--no-cpu-throttling` | CPU always allocated — SSE requests idle between heartbeats; throttled CPU starves them. |
| `--timeout=3600` | Cloud Run max request timeout; keeps `/api/events` streams alive. |
| `--max-instances=3` | Bounds DB connections: `3 × connection_limit=10 = 30 < max_connections`. [`database.md`](./database.md) §8. |
| `--ingress=all` | Public HTTPS URL (simple start). With the load balancer later: `--ingress=internal-and-cloud-load-balancing` ([`networking.md`](./networking.md)). |
| `--add-cloudsql-instances` | Mounts the Cloud SQL unix socket at `/cloudsql/...` — used inside `DATABASE_URL`'s `host=` parameter. Needs `roles/cloudsql.client` on the runtime SA. |
| `--set-secrets` | Injects Secret Manager values as env vars. |
| `--set-env-vars` | Non-secret config. `NEXT_PUBLIC_APP_URL` also matters at build time — [`frontend.md`](./frontend.md). |

Ingress note: `--ingress=all` with the app's own auth is correct for the simple start. When you add the load balancer (optional), re-deploy with `--ingress=internal-and-cloud-load-balancing` so traffic must enter via the LB.

More env vars (SMTP host/port/from, `STRIPE_SUCCESS_URL`, branding, `OTEL_*`) — full inventory and which are secrets: [`../../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md), [`secrets.md`](./secrets.md).

---

## Step 12 — Smoke test

```bash
# What: hit the health endpoint (unauthenticated, checks DB + memory + errors).
curl -i "$SERVICE_URL/api/health"
# Expected output: HTTP/2 200 and a JSON body; "database" reports healthy.
```

Verify in the browser: open `$SERVICE_URL` — the UI loads. Any 502/503: `gcloud run services logs read "$SERVICE_NAME" --region="$REGION" --limit=50` and [`troubleshooting.md`](./troubleshooting.md).

---

## Step 13 — Schedule the cron endpoints with Cloud Scheduler

**What:** 15 HTTP jobs that `POST` to the app's maintenance endpoints. **Why:** the app has **no in-app scheduler** — background work only happens when these are called. `REQUIRED FOR CURRENT ACQUISITIONOS`.

**Auth contract (verified in the code):** each endpoint compares the `Authorization` header to `Bearer ${CRON_SECRET}` and returns 401 otherwise. Therefore the jobs carry the secret header explicitly. **Do not use the `--oidc-*` flags for these jobs** — Scheduler would overwrite the `Authorization` header with its own OIDC token and every run would 401 (see [`architecture.md`](./architecture.md) §5).

```bash
# What: create one scheduler job. Repeat per endpoint (table below).
# --headers takes KEY=VALUE pairs; the whole command runs once per endpoint.
gcloud scheduler jobs create http cron-expire-api-keys \
  --location="$REGION" \
  --schedule="*/30 * * * *" \
  --uri="${SERVICE_URL}/api/cron/expire-api-keys" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}"
# Expected output: create request issued ... done.
```

> Before the custom domain exists (Step 14), use `$SERVICE_URL` in `--uri`; after DNS is live, re-point jobs at `https://$APP_DOMAIN` (delete + recreate, or `gcloud scheduler jobs update http ... --uri=...`).

The complete set (cadences from [`../../01-architecture.md`](../01-architecture.md) §2.4; tune to your usage):

| Scheduler job | URI path | Method | Schedule (cron) |
| --- | --- | --- | --- |
| `cron-expire-api-keys` | `/api/cron/expire-api-keys` | POST | `*/30 * * * *` (every 15–30 min) |
| `cron-hot-lead-scan` | `/api/cron/hot-lead-scan` | POST | `*/30 * * * *` (every 15–60 min) |
| `cron-process-sequences` | `/api/cron/process-sequences` | POST | `*/10 * * * *` (every 5–15 min) |
| `cron-sequence-processing` | `/api/cron/sequence-processing` | POST | `*/10 * * * *` |
| `cron-meeting-reminders` | `/api/cron/meeting-reminders` | POST | `*/10 * * * *` |
| `cron-autonomous-outreach` | `/api/cron/autonomous-outreach` | POST | `*/30 * * * *` (every 15–60 min) |
| `cron-sdr-cycle` | `/api/cron/sdr-cycle` | POST | `*/30 * * * *` |
| `cron-process-gmail-replies` | `/api/cron/process-gmail-replies` | POST | `*/10 * * * *` (skip if Gmail Pub/Sub push is configured) |
| `cron-credit-renewal` | `/api/cron/credit-renewal` | POST | `0 3 * * *` (daily off-peak) |
| `cron-end-of-period` | `/api/cron/end-of-period` | POST | `0 3 * * *` |
| `cron-renew-subscriptions` | `/api/cron/renew-subscriptions` | POST | `0 3 * * *` |
| `cron-payment-reconciliation` | `/api/cron/payment-reconciliation` | **GET** | `0 4 * * *` |
| `cron-process-billing` | `/api/payments/process-billing` | POST | `0 4 * * *` |
| `cron-retry-emails` | `/api/feedback/retry-emails` | POST | `*/30 * * * *` (suggested; no handbook default) |
| `cron-gmail-jobs` | `/api/gmail/jobs/process` | POST | `*/10 * * * *` — add `--headers=x-api-key=${GMAIL_CRON_API_KEY}` instead of the Authorization header |

Verify: `gcloud scheduler jobs list --location="$REGION"` lists 15 jobs; after the first scheduled run, `gcloud run services logs read "$SERVICE_NAME" --region="$REGION"` shows the request with status 200 (401 = header wrong; 404 = wrong URI).

---

## Step 14 — Custom domain + managed TLS certificate

**What:** point `app.yourdomain.com` at the service with a Google-managed certificate. **Why:** OAuth redirect URIs, webhooks, and cookies (`secure` in production) all require a stable HTTPS domain.

**Two paths** (details and the load-balancer path: [`networking.md`](./networking.md), [`dns-ssl.md`](./dns-ssl.md)):

**Path A (simplest) — Cloud Run domain mapping:**

```bash
# What: claim the domain and auto-provision a managed certificate.
gcloud beta run domain-mappings create --service="$SERVICE_NAME" \
  --domain="$APP_DOMAIN" --region="$REGION"
# Expected output: a table of DNS records to create.
```

Then create those records — in Cloud DNS (below) or at your registrar:

```bash
# What: a managed DNS zone (skip if your DNS stays at the registrar — just add the records there).
gcloud dns managed-zones create acquisitionos --dns-name="yourdomain.com." \
  --description="AcquisitionOS" --visibility=public
# Add the record set the mapping output told you (usually A/AAAA for the mapping IPs, CNAME for www).
```

Certificate state moves `Provisioning → Active` once DNS resolves (minutes to a few hours). Verify: `gcloud beta run domain-mappings describe --domain="$APP_DOMAIN" --region="$REGION"`.

**Path B (recommended for production) — global external Application Load Balancer + serverless NEG + Certificate Manager:** fixed anycast IPs, WAF/Cloud Armor option, LB timeout raised for SSE. Full click-path: [`networking.md`](./networking.md). When the LB is in front, redeploy with `--ingress=internal-and-cloud-load-balancing` and point the scheduler `--uri` values at the new domain.

After DNS is live:

```bash
dig "$APP_DOMAIN" +short                        # resolves
curl -s "$SERVICE_URL/api/health" | head -c 300 # still 200
curl -I "https://${APP_DOMAIN}"                 # 200/307 + valid certificate
```

Also now (re)deploy with the final `APP_PUBLIC_URL`/`NEXT_PUBLIC_APP_URL` if the domain changed after Step 11 (rebuild the image so `NEXT_PUBLIC_APP_URL` is re-inlined — [`frontend.md`](./frontend.md)).

---

## Step 15 — Register webhooks and OAuth redirect URIs

**Why:** inbound integrations must know your public HTTPS domain. All values are placeholders — use real dashboard values.

| Integration | Register where | URL |
| --- | --- | --- |
| Stripe webhook | Stripe Dashboard → Developers → Webhooks | `https://app.yourdomain.com/api/payments/webhook/stripe` (+ copy the signing secret into the `STRIPE_WEBHOOK_SECRET` secret version) |
| Razorpay webhook | Razorpay Dashboard → Webhooks | same URL (Razorpay mode) |
| Google OAuth | Google Cloud Console → APIs & Services → Credentials → your OAuth client | Authorized redirect URI: `https://app.yourdomain.com/api/auth/google/callback` (verify the exact path in `src/app/api/auth/google/`) |
| Gmail Pub/Sub push (`OPTIONAL`) | Pub/Sub subscription push config | `https://app.yourdomain.com/api/gmail/pubsub/webhook` |
| Telegram bot (`OPTIONAL`) | set via bot API | `https://app.yourdomain.com/api/...` (verify route in `src/app/api/`) |

Email deliverability: publish SPF for the sending domain (see [`../../06-dns-and-domains.md`](../06-dns-and-domains.md) §4) and send one OTP email to confirm before go-live.

---

## Step 16 — Final verification list

```text
[ ] curl -i $SERVICE_URL/api/health → HTTP 200, database healthy
[ ] UI loads at https://app.yourdomain.com with a valid certificate
[ ] Sign-up + sign-in works: OTP email, magic link, Google OAuth all function
[ ] Notifications bell shows a live SSE event (open two browsers, trigger a notification)
[ ] One real workflow runs end to end; discovery returns results (search keys set)
[ ] AI feature responds (a fallback provider key is configured)
[ ] Stripe test event → POST /api/payments/webhook/stripe → 200, entitlements update
[ ] gcloud scheduler jobs list → 15 jobs; Cloud Run request logs show 200s (no 401/404)
[ ] Cloud SQL: backups + PITR enabled (gcloud sql instances describe --format="value(settings.backupConfiguration)")
[ ] Budget alerts active; /api/health uptime alert configured (monitoring.md)
```

Next steps: CI/CD ([`../../05-cicd.md`](../05-cicd.md) + `cicd.md`), Terraform for reproducibility ([`terraform.md`](./terraform.md)), monitoring/backups/security/scaling/rollback pages in this folder.

---

## Official documentation

- Cloud Run deploy + settings — https://cloud.google.com/run/docs/deploying
- Cloud Run: connect to Cloud SQL — https://cloud.google.com/sql/docs/postgres/connect-run
- Cloud SQL Auth Proxy — https://cloud.google.com/sql/docs/postgres/sql-proxy
- Cloud Scheduler HTTP targets — https://cloud.google.com/scheduler/docs/http-targets
- Secret Manager — https://cloud.google.com/secret-manager/docs
- Cloud DNS — https://cloud.google.com/dns/docs
- Artifact Registry quickstart (Docker) — https://cloud.google.com/artifact-registry/docs/docker/quickstart
- Domain mappings (Cloud Run) — https://cloud.google.com/run/docs/mapping-custom-domains
