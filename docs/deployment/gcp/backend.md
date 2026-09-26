# GCP Backend Guide — the API Side of the Cloud Run Service

AcquisitionOS has **no separate backend service**. The same Cloud Run service described in [`frontend.md`](./frontend.md) serves the React UI *and* every `/api/**` route: REST, SSE streams, cron receivers, and webhooks. This page covers everything the API role needs on GCP: port and health checks, environment and secret injection, database connectivity, logging, autoscaling, timeouts, request limits, graceful shutdown, deployment strategy, and webhook registration.

> Facts below were verified against this repository (`Dockerfile`, `next.config.ts`, `src/app/api/**`). Where a GCP default could change, the page says so and points at the official doc. Companion pages: [`architecture.md`](./architecture.md) (the mapping), [`manual-deployment.md`](./manual-deployment.md) (the walkthrough), [`scaling.md`](./scaling.md), [`rollback.md`](./rollback.md), [`troubleshooting.md`](./troubleshooting.md).

**Placeholders used below** (set once, like in [`manual-deployment.md`](./manual-deployment.md) step 0):

```bash
export PROJECT_ID="YOUR_PROJECT_ID"      # gcloud projects list / prerequisites.md §3
export REGION="us-central1"              # the region you chose in prerequisites.md §9
export SERVICE_NAME="acquisitionos"      # Cloud Run service name from manual-deployment.md
export APP_DOMAIN="app.yourdomain.com"   # your production domain
```

---

## 1. The container, the port, the process — `REQUIRED FOR CURRENT ACQUISITIONOS`

**What:** one Node 20 container built from the repo `Dockerfile` (`output: 'standalone'`), listening on port **3000**.

**Why it matters on GCP:** Cloud Run must be told which port the container listens on. If the port Cloud Run sends traffic to does not match, every request fails with `503 Service Unavailable` even though the container itself is healthy.

```bash
# The repo Dockerfile already does the right things — verify, don't reconfigure:
#   ENV PORT=3000
#   EXPOSE 3000
#   CMD ["node", "server.js"]
gcloud run services describe "$SERVICE_NAME" --region="$REGION" \
  --format='value(spec.template.spec.containers[0].ports)'
# Expected output: 3000 (containerPort)
```

Notes:

- The container binds `0.0.0.0:3000` (standalone `server.js`) — nothing to change.
- Do **not** set a different `PORT` env var on Cloud Run; the image hard-codes the expectation of 3000. If you believe you need a different port, you are probably fighting a symptom — see [`troubleshooting.md`](./troubleshooting.md) §port.
- A wrong-port deployment looks like "deploy succeeded, all requests 503" — the classic first-day failure.

---

## 2. Health checks — liveness and readiness — `REQUIRED FOR CURRENT ACQUISITIONOS`

**What:** the app exposes three health endpoints (verified in `src/app/api/health/`):

| Endpoint | Auth | Use it for |
| --- | --- | --- |
| `GET /api/health` | **unauthenticated** | Cloud Run probes, LB health checks, uptime checks, CI verification. Checks DB connectivity (`db.user.count()`), heap memory, in-process error counts. |
| `GET /api/health/detailed` | **none — protect it** | Human debugging only. Keep off the public internet (see [`security.md`](./security.md) §9). |
| `GET /api/health/database` | **none — protect it** | Same — richer DB diagnostics. |

**Why:** Cloud Run needs a cheap, dependency-light endpoint it can probe frequently. `/api/health` is designed for exactly this and requires no auth header.

**Command (smoke test after every deploy):**

```bash
curl -s "https://$APP_DOMAIN/api/health"
# Expected output (shape): {"status":"ok","database":...,"memory":...,...}
# A failing database or exhausted memory degrades the status — grep it in CI:
curl -fsS "https://$APP_DOMAIN/api/health" | grep -q '"status":"ok"' && echo HEALTHY
```

**Verify:** HTTP 200 + `"status":"ok"`. Non-200 or missing status → [`troubleshooting.md`](./troubleshooting.md) §health-check.

Cloud Run works with the default probe behavior (it checks that the container accepts connections on the service port). If you want explicit startup/liveness probes against `/api/health`, Cloud Run supports them — confirm the current flag spelling with `gcloud run deploy --help` (`NEEDS VERIFICATION`: exact probe flag syntax changes between gcloud releases) before adding complexity.

---

## 3. Environment variables and Secret Manager injection — `REQUIRED FOR CURRENT ACQUISITIONOS`

**What:** the API reads its configuration from environment variables; secrets arrive as env vars injected by Cloud Run from Secret Manager.

**Why:** secrets never live in the image or in Git. Cloud Run resolves each `--set-secrets` entry into an env var at revision start; the runtime service account needs `roles/secretmanager.secretAccessor` ([`secrets.md`](./secrets.md) §5).

```bash
gcloud run deploy "$SERVICE_NAME" --region="$REGION" \
  --image="$IMAGE_URL" \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,DIRECT_URL=DIRECT_URL:latest,JWT_SECRET=JWT_SECRET:latest,CRON_SECRET=CRON_SECRET:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest,RAZORPAY_WEBHOOK_SECRET=RAZORPAY_WEBHOOK_SECRET:latest
# Expected output: Deploying ... Service [acquisitionos] revision [acquisitionos-000xx] has deployed (100% traffic).
```

The complete variable inventory with the SECRET vs ENV vs BUILD decision for every name is [`secrets.md`](./secrets.md) §3 (and the handbook-wide list in [`../../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md)). Two variables deserve special attention on the API side:

- `AUTH_DEV_MODE` — **must be unset in production.** It is hard-gated off when `NODE_ENV=production`, but never set it anywhere.
- `APP_PUBLIC_URL` (runtime, plain ENV) vs `NEXT_PUBLIC_APP_URL` (build-time, baked into client JS) — see §5.

---

## 4. Database connectivity + Prisma pooling — `REQUIRED FOR CURRENT ACQUISITIONOS`

**What:** the app connects to Cloud SQL PostgreSQL via Prisma 6, using two connection strings:

| Variable | Used for | Shape |
| --- | --- | --- |
| `DATABASE_URL` | the running app (pooled, limited) | `postgresql://app_user:...@HOST:5432/acquisitionos?sslmode=require&connection_limit=10&pool_timeout=20` |
| `DIRECT_URL` | migrations / `prisma db push` | `postgresql://app_user:...@HOST:5432/acquisitionos?sslmode=require` |

**Why `connection_limit`:** every Cloud Run instance keeps its own Prisma pool. `instances × connection_limit` must stay below the instance's `max_connections` — the formula and alert threshold live in [`database.md`](./database.md) §8. This becomes the binding constraint the moment you scale out (see [`scaling.md`](./scaling.md) §5).

Two connectivity paths (full comparison: [`database.md`](./database.md) §4):

1. **Public IP + Cloud SQL Auth Proxy** (locally, in CI) or direct SSL connection — simplest start.
2. **Private IP + VPC access from Cloud Run** (Direct VPC egress or Serverless VPC Access connector) — `OPTIONAL` hardening; [`networking.md`](./networking.md) §2.

```bash
# Verify what the running service actually uses:
gcloud run services describe "$SERVICE_NAME" --region="$REGION" \
  --format='yaml(spec.template.spec.containers[0].env)' | grep -E "name: (DATABASE_URL|DIRECT_URL)"
# Symptom of an exhausted pool: "Timed out fetching a new connection from the connection pool"
#   → read the formula in database.md §8 before raising --max-instances.
```

Prisma is generated into the standalone build (`prisma generate` runs at image build time) — there is **no** runtime generate step on Cloud Run.

---

## 5. API URL configuration — `APP_PUBLIC_URL` vs `NEXT_PUBLIC_APP_URL`

**What:** URLs the API produces (magic links, OAuth redirect targets, webhook-visible links) come from `src/lib/app-url.ts`, which resolves in this priority order: forwarded headers → `APP_PUBLIC_URL` → `NEXT_PUBLIC_APP_URL` → legacy fallback (full list: [`../../01-architecture.md`](../01-architecture.md) §2.2).

**Why this section exists in backend.md:** auth flows (OTP email, magic link, Google OAuth) are API behavior. If the URL resolution is wrong, sign-in breaks in confusing ways.

| Variable | Set when | Where on GCP |
| --- | --- | --- |
| `APP_PUBLIC_URL` | **runtime** — change it and start a new revision | `--set-env-vars` on Cloud Run |
| `NEXT_PUBLIC_APP_URL` | **build time** — inlined into client JS | Docker build args; **rebuild the image** when it changes |

```bash
gcloud run services update "$SERVICE_NAME" --region="$REGION" \
  --update-env-vars=APP_PUBLIC_URL=https://$APP_DOMAIN
# Expected output: revision [acquisitionos-000xx+1] ... deploying (0% → 100% traffic).
```

The GCP LB forwards `Host` + `X-Forwarded-Proto` natively (see [`networking.md`](./networking.md) §6), which is what `app-url.ts` wants. Still set `APP_PUBLIC_URL` explicitly so the app never falls back to the hard-coded legacy domain.

**CORS is not needed** for the standard deployment: the UI and the API share one origin (`app.yourdomain.com`), so the browser never makes a cross-origin request to your own API. CORS only becomes relevant if you deliberately split an `api.` subdomain or want third-party browser clients — in that case allow the specific origin explicitly (and re-read [`../../01-architecture.md`](../01-architecture.md) §1: one unit, two roles). If you see CORS errors on the same origin, you are actually seeing a proxy/URL problem — [`troubleshooting.md`](./troubleshooting.md) §CORS.

---

## 6. Logging — structured output to Cloud Logging — `REQUIRED` (logging), `OPTIONAL` (tuning)

**What:** everything the API writes to stdout/stderr is automatically captured by Cloud Logging as structured request + application logs.

**Why:** Cloud Run gives you request logs (status, latency, instance ID) and stdout logs for free; the only app-side knob is `LOG_LEVEL` (ENV; default `info` — [`secrets.md`](./secrets.md) §3.8).

```bash
# Tail recent errors from the service:
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name='"$SERVICE_NAME"' AND severity>=ERROR' \
  --limit=20 --format='table(timestamp,textPayload)'
# Expected output: a table of recent error lines (or empty — good).
```

- Keep logs **structured where the app already is** (JSON lines) — Cloud Logging indexes JSON payloads into fields, which makes log-based metrics possible ([`monitoring.md`](./monitoring.md) §2).
- `LOG_LEVEL=debug` in production is a temporary measure only; it is noisy and can leak more detail than intended into logs.
- For traces/metrics beyond logs, the app supports OpenTelemetry — [`monitoring.md`](./monitoring.md) §5.

---

## 7. Autoscaling — instances and concurrency

**What:** Cloud Run scales from `--min-instances` to `--max-instances`, placing up to `--concurrency` concurrent requests on each instance.

**Why AcquisitionOS cares:** SSE (`/api/events/*`) holds a connection open per client for the life of the stream. That changes the math: an instance serving 50 SSE clients is "busy" at 50 concurrency even at idle CPU.

```bash
gcloud run services update "$SERVICE_NAME" --region="$REGION" \
  --min-instances=1 --max-instances=5 --concurrency=80 --no-cpu-throttling
# Expected output: revision [acquisitionos-000xx+1] ... has deployed (100% traffic).
```

| Setting | Recommended | Reason |
| --- | --- | --- |
| `--min-instances` | **1** — `REQUIRED` for current AcquisitionOS | Never scale to zero: SSE clients would be disconnected on every scale-down, and the first request pays the cold start. |
| `--max-instances` | start **3–5**; raise deliberately | Each new instance adds a Prisma pool to the DB budget ([`database.md`](./database.md) §8) and fragments SSE fan-out until Redis exists ([`scaling.md`](./scaling.md) §6). |
| `--concurrency` | keep default **80** initially | Lower it (e.g. 40–50) only if stream-heavy usage starves other requests — see [`scaling.md`](./scaling.md) §2. |
| CPU allocation | always allocated (`--no-cpu-throttling`) | SSE requests are idle between 15–30 s heartbeats; throttled CPU starves them ([`architecture.md`](./architecture.md) §4). |

Verify: `gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='yaml(spec.template.spec)' | grep -E "minInstances|maxInstances|containerConcurrency"`.

---

## 8. CPU and memory

**What:** per-instance vertical size. **Why:** too small = OOM kills and CPU throttling symptoms; too large = paying for idle.

- **Start:** 1 vCPU, **1 GiB** memory (`--cpu=1 --memory=1Gi`). 512 MiB is the floor for a Next.js standalone server but leaves little headroom with 53+ Prisma models, AI calls, and SSE bookkeeping in one process.
- **Scale after metrics, not fear:** watch Cloud Monitoring instance CPU/memory utilization ([`monitoring.md`](./monitoring.md) §4); sustained >80% is the signal to move to 2 GiB / 2 vCPU ([`scaling.md`](./scaling.md) §3).
- Build-time OOM (`next build` killed) is a different problem with a different fix (`NODE_OPTIONS=--max-old-space-size=4096` — already in the repo `Dockerfile`; see [`troubleshooting.md`](./troubleshooting.md) §build-oom).

---

## 9. Timeouts — request, SSE, and scheduler

**What:** how long a single request may run.

| Concern | Value | Where |
| --- | --- | --- |
| Cloud Run request timeout | **3600 s** (the service maximum) — `REQUIRED` for SSE | `gcloud run deploy --timeout=3600` |
| SSE streams | heartbeats every 15–30 s; clients reconnect + replay via `/api/realtime/recover` | app-side, already implemented |
| LB backend timeout (Path B) | ≥ 120 s, set 3600 to match | [`networking.md`](./networking.md) §5 |
| Cloud Scheduler attempt deadline | per-attempt cap (HTTP targets allow up to ~30 min — verify in the Scheduler docs) | `gcloud scheduler jobs update http JOB --attempt-deadline=...` |

**Why 3600:** SSE connections are long-lived by design; a short request timeout mid-stream kills the connection. Clients reconnect and replay (`Last-Event-ID`), but avoiding pointless resets is cheaper. Cron endpoints (`/api/cron/*`) are normally fast (seconds); the scheduler attempt deadline only matters for heavy jobs like `autonomous-outreach` or `sdr-cycle` — tune upward only if logs show truncation.

---

## 10. Request and body limits

- **Cloud Run request size limit: 32 MiB** (platform default; verify in the Cloud Run quotas docs). Uploads larger than that must not go through the app — and in general `public/` uploads are ephemeral anyway ([`../../01-architecture.md`](../01-architecture.md) §2.5; GCS path in [`architecture.md`](./architecture.md) §1 row 12).
- The API's own JSON parsing has its practical limits in route handlers; oversized payloads return `413` from the platform. If you add file-heavy features, plan direct-to-GCS uploads (`OPTIONAL` — `FUTURE/ALTERNATIVE` for current AcquisitionOS).
- SSE responses are streamed; the platform does not buffer them. Keep the LB path buffer-free for `/api/events/*` ([`networking.md`](./networking.md) §5).

---

## 11. Graceful shutdown — SIGTERM and draining

**What:** when Cloud Run scales down an instance or starts a new revision, it sends `SIGTERM` and allows in-flight requests a short drain window before killing the container.

**Why AcquisitionOS survives this well:** SSE clients reconnect automatically and replay missed events via `Last-Event-ID` → `/api/realtime/recover`; HTTP requests that fail during drain are retried by Stripe/Pub/Sub/webhook senders (their own retry policies), and scheduler jobs are retried by Cloud Scheduler.

Practical rules:

- Do not run "critical work only at shutdown" handlers — the drain window is short (`NEEDS VERIFICATION`: current default grace period in the Cloud Run container lifecycle docs; do not build anything that depends on its exact length).
- Long-running cron jobs should be idempotent (the endpoints are designed for repeat calls) — a scale-down during a job is safe to retry.
- If you ever observe requests failing exactly during deploys, that is drain behavior — schedule deploys off-peak and check [`rollback.md`](./rollback.md) for instant traffic-based reversion.

---

## 12. Deployment strategy — revisions and traffic splitting

**What:** every deploy creates an immutable **revision**. Revisions can receive traffic in splits or via named tags.

**Why:** this is your free canary and your instant rollback ([`rollback.md`](./rollback.md) §2).

```bash
# Canary: send 10% of traffic to the new revision
gcloud run services update-traffic "$SERVICE_NAME" --region="$REGION" --to-latest --traffic=10
#   output: traffic split updated (latest: 10%, previous: 90%)
# Watch errors in Cloud Run request logs; then promote:
gcloud run services update-traffic "$SERVICE_NAME" --region="$REGION" --to-latest

# Tag a revision for testing without affecting users:
gcloud run revisions add-tag --region="$REGION" revision=acquisitionos-000xx tag=pre --service="$SERVICE_NAME"
#   then: curl -H "X-Cloud-Run-Tag: pre" https://acquisitionos-XXXX-uc.a.run.app
```

Reminder: a secret **update** does not touch a running revision — create a new revision after rotating secrets ([`secrets.md`](./secrets.md) §4).

---

## 13. Webhook registration — exact paths and requirements

**What:** external systems call your API unauthenticated-by-users; each route verifies its own signature. `REQUIRED` for the payment path; `OPTIONAL` for Gmail push and Telegram.

All three require a **public HTTPS URL** — that is `https://app.yourdomain.com/...` once your domain is live ([`dns-ssl.md`](./dns-ssl.md)); the `run.app` URL works only for testing.

### 13.1 Payments — `POST /api/payments/webhook/stripe` (Stripe) · `/api/payments/webhook/razorpay` (Razorpay)

```text
Stripe:   https://app.yourdomain.com/api/payments/webhook/stripe   (secret: STRIPE_WEBHOOK_SECRET, whsec_...)
Razorpay: https://app.yourdomain.com/api/payments/webhook/razorpay   (secret: RAZORPAY_WEBHOOK_SECRET)
```

- Each provider has its **own path** (verified: `src/app/api/payments/webhook/stripe/route.ts` and `src/app/api/payments/webhook/razorpay/route.ts`; there is no single shared `/api/payments/webhook` route). Register the matching URL per provider.
- Signature verification uses the webhook secret from the provider dashboard — if it mismatches, the route rejects the event and Razorpay logs `Webhook verification is not configured` (that string is in `src/lib/razorpay-service.ts`) when the secret is missing entirely.
- Register the URL in the Stripe/Razorpay dashboards **after** the domain + TLS work ([`manual-deployment.md`](./manual-deployment.md) step 15). Redeploys do not change the URL.
- Test with a real event (Stripe CLI / dashboard "send test event") and confirm a 200 in Cloud Run request logs.

### 13.2 Gmail push — `POST /api/gmail/pubsub/webhook` — `OPTIONAL`

- Pub/Sub push subscription → `https://app.yourdomain.com/api/gmail/pubsub/webhook`; env wiring `GMAIL_PUBSUB_TOPIC` / `GMAIL_PUBSUB_SUBSCRIPTION` / `GMAIL_PUBSUB_WEBHOOK_URL` ([`secrets.md`](./secrets.md) §3.5).
- The push request must be able to reach the public endpoint (ingress setting must allow it — if you restricted ingress to the LB, the push goes through the LB like any other HTTPS request).
- Without push, fall back to scheduling `/api/cron/process-gmail-replies` (below). `NEEDS VERIFICATION`: what exact verification the route applies to Pub/Sub messages — check `src/app/api/gmail/pubsub/webhook/route.ts` before exposing it.

### 13.3 Telegram — `POST /api/telegram/webhook` — `OPTIONAL`

- Register with the Telegram Bot API (`setWebhook`) pointing at the public HTTPS URL; `TELEGRAM_BOT_TOKEN` is the shared secret the route validates against ([`secrets.md`](./secrets.md) §3.7).
- Telegram requires a valid TLS certificate — the Google-managed cert satisfies this.

### 13.4 The trap that is NOT a webhook: cron endpoints

`/api/cron/*` endpoints look like webhooks but are called by **you** (Cloud Scheduler), not by a third party. They require `Authorization: Bearer <CRON_SECRET>` and must not use Scheduler's OIDC flags (the OIDC token would overwrite the Authorization header — [`architecture.md`](./architecture.md) §5). Full job table: [`cicd.md`](./cicd.md) §8.

---

## 14. Official documentation

- Cloud Run (container lifecycle, timeouts, revisions, traffic) — https://cloud.google.com/run/docs
- Cloud Run request/limits & quotas — https://cloud.google.com/run/quotas
- Cloud SQL Auth Proxy — https://cloud.google.com/sql/docs/postgres/sql-proxy
- Prisma connection management (`connection_limit`) — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/postgresql
- Secret Manager — https://cloud.google.com/secret-manager/docs
- Cloud Scheduler HTTP targets — https://cloud.google.com/scheduler/docs/http-targets
- Pub/Sub push subscriptions — https://cloud.google.com/pubsub/docs/push
- Handbook: [`../../01-architecture.md`](../01-architecture.md) · [`../../03-docker.md`](../03-docker.md) · [`../../04-database-production.md`](../04-database-production.md)
