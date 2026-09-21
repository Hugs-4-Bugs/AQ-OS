# GCP Troubleshooting — Symptom → Cause → Diagnosis → Fix → Prevention

Every entry below follows the same five fields. The facts used here (port 3000, `/api/health`, Bearer `CRON_SECRET`, pooled vs direct DB URLs, `NEXT_PUBLIC_*` build-time inlining, SSE heartbeats) are the verified application facts from [`../../01-architecture.md`](../01-architecture.md); the platform facts are from the sibling pages. If your symptom is not listed, start at §1 — most incidents route through it.

---

## 1. First 10 minutes: triage runbook

Run these five checks in order. They take minutes and either identify the problem or localize it to a layer.

```bash
export REGION="us-central1"                # your region
export SERVICE_NAME="acquisitionos"

# 1. HEALTH — is the app reporting itself healthy? (separates app-layer from edge-layer)
curl -s https://app.yourdomain.com/api/health
#   200 + "status":"ok"            → app is up; the problem is edge (DNS/TLS/LB) or a specific feature
#   200 but not ok                 → read the fields (database? memory?) → §5, §6
#   503 / timeout                  → container not serving → §6, §8

# 2. REVISIONS — what changed recently? (most incidents follow a deploy or config change)
gcloud run revisions list --service="$SERVICE_NAME" --region="$REGION" --limit=5
gcloud run services describe "$SERVICE_NAME" --region="$REGION" \
  --format='table(status.latestReadyRevisionName, status.latestCreatedRevisionName)'
#   latestReady ≠ latestCreated    → new revision failing readiness → §7, §6, §10

# 3. LOGS — read what the container says right now:
gcloud beta run services logs tail "$SERVICE_NAME" --region="$REGION"      # live tail (Ctrl-C to stop)
gcloud logging read 'resource.type="cloud_run_revision"
  resource.labels.service_name="acquisitionos" AND severity>=ERROR' --limit=20
#   crash loop / exit codes        → §6; Prisma connection errors → §5; auth 500s → §9

# 4. CLOUD SQL — is the database alive and accepting connections?
gcloud sql instances describe acquisitionos-pg \
  --format='value(state, databaseVersion, settings.ipConfiguration)'
#   RUNNABLE expected. Also check connections/CPU in Monitoring (monitoring.md §4 rows 4-6).

# 5. ROLLBACK DECISION — bad deploy in the last 2 h? Roll back FIRST (rollback.md §2), diagnose after.
gcloud run services update-traffic "$SERVICE_NAME" --region="$REGION" --to-revisions=PREV_REVISION=100
```

Then jump to the matching section below. Re-verify `/api/health` after every change — one variable at a time.

---

## 2. DNS not resolving

**Symptom:** `curl: (6) Could not resolve host: app.yourdomain.com`, or browser `DNS_PROBE_FINISHED_NXDOMAIN`.

**Cause:** registrar name servers not delegated to Cloud DNS; record missing/typo'd; record type illegal for the name (CNAME at apex); resolver TTL cache still holding an old answer.

**Diagnosis:**

```bash
dig +short NS yourdomain.com                      # registrar delegation — expect ns-cloud-*.googledomains.com.
dig +short app.yourdomain.com                     # public answer
gcloud dns record-sets list --zone=acquisitionos  # what Cloud DNS would serve
dig @ns-cloud-a1.googledomains.com app.yourdomain.com   # ask the authoritative server directly
```

If authoritative answers correctly but public `dig` does not, it is cache — wait the TTL ([`dns-ssl.md`](./dns-ssl.md) §5–6).

**Fix:** complete delegation at the registrar; create the missing record (`gcloud dns record-sets create ...`) with the exact type/target from the domain mapping or LB ([`dns-ssl.md`](./dns-ssl.md) §2–3); apex → A/AAAA only.

**Prevention:** one checklist for the cutover ([`dns-ssl.md`](./dns-ssl.md) §7); keep setup-phase TTL at 300 s.

## 3. SSL not working

**Symptom:** browser `NET::ERR_CERT_AUTHORITY_INVALID` / `ERR_SSL_PROTOCOL_ERROR`; `curl` certificate errors; certificate stuck in `PROVISIONING`.

**Cause:** certificate not yet issued (DNS not propagated to the LB/mapping, or the DNS-authorization record missing/mis-copied); HTTP-only testing against an HTTPS-only endpoint; expired cert you manage yourself (do not — always Google-managed here).

**Diagnosis:**

```bash
gcloud certificate-manager certificates describe acquisitionos-cert --format='value(state)'
gcloud beta run domain-mappings describe --domain=app.yourdomain.com --region="$REGION" \
  --format='value(status.certificateStatus)'      # Path A
curl -vI https://app.yourdomain.com 2>&1 | grep -E "subject|issuer|SSL"
```

**Fix:** confirm DNS first ([§2](#2-dns-not-resolving)) — issuance waits on it. Add the exact DNS-authorization record if using that route ([`dns-ssl.md`](./dns-ssl.md) §3). Wait: issuance is minutes to a few hours. Do not roll back the app for a TLS problem.

**Prevention:** alert on certificate state/expiry ([`monitoring.md`](./monitoring.md) §4 row 8); go live via the LB path so certs are independent of app changes.

## 4. CORS failure

**Symptom:** browser console `blocked by CORS policy` on calls that used to work; `Access-Control-Allow-Origin` missing.

**Cause (counter-intuitive):** AcquisitionOS is **same-origin** (UI + API in one container, [`../../01-architecture.md`](../01-architecture.md) §1) — real cross-origin requests should never occur. Seeing CORS errors means the browser is calling a *different origin* than the page was served from: a hard-coded `http://localhost:3000` or `https://acquisition.space-z.ai` (the legacy fallback in `src/lib/app-url.ts`), an `api.` subdomain you introduced, or `http://` vs `https://` mismatch.

**Diagnosis:** in the browser Network tab compare the failing request's origin against the page's; then trace which mechanism built the URL ([`../../01-architecture.md`](../01-architecture.md) §2.2 priority list). Check `APP_PUBLIC_URL` on the running revision.

**Fix:** set `APP_PUBLIC_URL=https://app.yourdomain.com` (runtime) **and** rebuild the image with `NEXT_PUBLIC_APP_URL=https://app.yourdomain.com` (build-time) — [`backend.md`](./backend.md) §5; ensure the LB forwards `Host` + `X-Forwarded-Proto` ([`networking.md`](./networking.md) §6). If you truly split an `api.` subdomain, you must add explicit CORS support in the app — that is a code change, not a config change.

**Prevention:** keep one origin; the URL-variables checklist in [`dns-ssl.md`](./dns-ssl.md) §7.

## 5. Database connection failure

**Symptom:** `/api/health` reports database unhealthy; app 500s on every data route; logs show `Can't reach database server`, `password authentication failed`, or `Timed out fetching a new connection from the connection pool`.

**Cause (pick by error):** wrong/missing `sslmode=require` (Cloud SQL requires TLS); Auth Proxy not running or pointing at the wrong instance connection name; authorized networks empty on a public-IP instance *without* the proxy; wrong DB user/password; connection budget exhausted (every instance × `connection_limit` vs `max_connections`, [`database.md`](./database.md) §8).

**Diagnosis:**

```bash
gcloud sql instances describe acquisitionos-pg --format='value(state, databaseVersion)'
gcloud logging read 'resource.type="cloud_run_revision"
  resource.labels.service_name="acquisitionos" AND textPayload:"database"' --limit=10
# From your machine (proxy path) — proves credentials + instance are fine outside the app:
./cloud-sql-proxy YOUR_PROJECT_ID:us-central1:acquisitionos-pg &
psql "postgresql://app_user:PASSWORD@127.0.0.1:5432/acquisitionos?sslmode=disable" -c "select 1;"
```

**Fix:** restore `sslmode=require` on direct strings; restart the proxy (`--address 0.0.0.0 --port 5432 PROJECT:REGION:INSTANCE`); if bypassing the proxy on public IP, add your current IP to authorized networks *temporarily* (never `0.0.0.0/0`); reset `app_user`'s password if auth fails (`gcloud sql users set-password ...`); pool-exhaustion → lower `connection_limit`/instance count, tier up only per the budget formula ([`scaling.md`](./scaling.md) §5).

**Prevention:** `/api/health` + Cloud SQL connection alerts ([`monitoring.md`](./monitoring.md) §4 rows 1, 4); connection-budget math before every instance-count increase.

## 6. Container crash

**Symptom:** Cloud Run revision `CrashLoopBackoff`-like behavior; requests 503; logs end abruptly; `Container exited unexpectedly` / memory-limit kill messages in the revision.

**Cause:** OOM (container memory cap hit — usually a spike workload, not steady state); a missing env var making a startup code path throw; image built wrong (wrong port/probe assumptions).

**Diagnosis:** read the last 30 log lines before the exit (`gcloud logging read ... severity>=ERROR`); check `gcloud run services describe ... --format='value(spec.template.spec.containers[0].resources)'` for the current limit; reproduce the startup locally: `docker run -e JWT_SECRET=x -e DATABASE_URL=... IMAGE` and watch it fail identically.

**Fix:** OOM → raise `--memory=2Gi` (and review what allocates — [`scaling.md`](./scaling.md) §3); missing env → supply via `--set-env-vars` / `--set-secrets` (§9, §10) and start a new revision; local repro failing → fix the image/config before redeploying anywhere.

**Prevention:** lint + test + a staging deploy in CI ([`cicd.md`](./cicd.md) §3–4); memory alerting ([`monitoring.md`](./monitoring.md) §4 row 3).

## 7. Health check failure

**Symptom:** new revision never becomes ready (`status.latestReadyRevisionName` lags behind `latestCreated`); traffic stuck on the old revision; "readiness probe failed" events.

**Cause:** Cloud Run probes the container port; the revision serves nothing on it (wrong port — §8) or `/api/health` fails *because the DB connection is slow at cold start* (first Prisma connect through the proxy/VPC can take seconds; the health route checks the DB on every call).

**Diagnosis:** hit the failing revision directly via a tag: `gcloud run revisions add-tag ... tag=bad` then `curl https://TAG--HOST/api/health`; watch whether it answers 503-unready vs 200-late. Check whether the same image was ready before with identical DB settings.

**Fix:** fix the underlying cause (§5, §8) rather than disabling checks; if cold-DB-start latency is genuinely the issue, ensure `min-instances=1` (no cold starts for the serving instance) and that the DB is reachable before deploys.

**Prevention:** always smoke-test `/api/health` in CI before promoting ([`cicd.md`](./cicd.md) §4); keep `/api/health` fast and unauthenticated ([`backend.md`](./backend.md) §2).

## 8. Port mismatch

**Symptom:** every request 503 while logs show the app "started successfully"; container passes locally.

**Cause:** the container is listening on a port other than the service port 3000 — typically someone set `PORT=8080` in `--set-env-vars` (Cloud Run's conventional port) while this image hard-codes 3000 (`Dockerfile`: `ENV PORT=3000`, `EXPOSE 3000`, `CMD ["node","server.js"]`).

**Diagnosis:** `gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(spec.template.spec.containers[0].ports, spec.template.spec.containers[0].env)'`; run the image locally and `wget -qO- http://localhost:3000/api/health`.

**Fix:** remove the `PORT` override (deploy with `--port=3000` and no `PORT` env), redeploy. Never "fix" this by editing the Dockerfile port — 3000 is the app's contract.

**Prevention:** keep the deploy flags identical between CI and manual ([`cicd.md`](./cicd.md) §4 note); the very first deploy already proves the port ([`manual-deployment.md`](./manual-deployment.md) step 12).

## 9. Env var missing — the symptom map

**Symptom:** app runs, specific features fail in a patterned way. **Cause:** a variable absent or wrong on the running revision (it lives in Secret Manager / env, not the image). **Diagnosis:** `gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='yaml(spec.template.spec.containers[0].env)'` and compare against [`secrets.md`](./secrets.md) §3. **Prevention:** the §3 inventory is the checklist for every deploy.

| Missing / wrong variable | Observable symptom |
| --- | --- |
| `JWT_SECRET` | sign-in/refresh fails with auth 500s or invalid-token errors (no sessions can be signed/verified) |
| `DATABASE_URL` | `/api/health` unhealthy; every data route 500s (§5) |
| `SMTP_HOST` / `SMTP_PASSWORD` / `RESEND_API_KEY` | OTP/magic-link returns "Email delivery is not configured on the server" (verified string in `src/app/api/auth/otp/request/route.ts` etc.) |
| `APP_PUBLIC_URL` wrong | magic links / OAuth redirects point at the wrong host (legacy domain, `run.app`, or preview) — full resolution order in [`../../01-architecture.md`](../01-architecture.md) §2.2 |
| `NEXT_PUBLIC_APP_URL` (build-time) | client-side URLs wrong even when `APP_PUBLIC_URL` is right — needs a **rebuild** (§11) |
| `CRON_SECRET` or mismatch | scheduler runs return 401 (§17) |
| `STRIPE_WEBHOOK_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | webhooks rejected (§18) |
| AI provider key (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`) | AI features fail outside the GLM sandbox — availability there is `NEEDS VERIFICATION`; always set one fallback key ([`architecture.md`](./architecture.md) §6) |
| `AUTH_DEV_MODE` (set by mistake) | never set in prod — hard-gated off under `NODE_ENV=production`, but audit that it is absent ([`secrets.md`](./secrets.md) §3.1) |

**Fix:** update the secret (`gcloud secrets versions add NAME --data-file=-`), then `gcloud run services update` (new revision re-resolves `:latest`), re-verify.

## 10. Secret unavailable — `secretAccessor` role missing

**Symptom:** deploy fails with a Secret Manager permission error, or the new revision crashes at startup unable to read injected secrets.

**Cause:** the runtime SA lacks `roles/secretmanager.secretAccessor` on the secret (or the **deployer** SA lacks it when `--set-secrets` is executed from CI); the secret name/`PROJECT_NUMBER` typo'd in `--set-secrets`.

**Diagnosis:**

```bash
gcloud secrets get-iam-policy JWT_SECRET \
  --flatten="bindings[].members" --filter="bindings.members:acquisitionos-runtime@" \
  --format="table(bindings.role)"
# Expected: roles/secretmanager.secretAccessor. Absent → that is the bug.
gcloud secrets describe JWT_SECRET --format='value(name)'   # exists? right project?
```

**Fix:** `gcloud secrets add-iam-policy-binding JWT_SECRET --member="serviceAccount:acquisitionos-runtime@PROJECT_ID.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"`; for CI, grant the same role to the deployer SA ([`cicd.md`](./cicd.md) §2a). Redeploy.

**Prevention:** grant at secret creation time ([`secrets.md`](./secrets.md) §5); the WIF setup in [`cicd.md`](./cicd.md) §2 includes both sides of the role.

## 11. Deploy succeeds but the app is wrong

**Symptom:** Cloud Run reports success, health is fine, but behavior is stale or subtly wrong (old UI, old client URLs).

**Cause:** two classics: (a) `NEXT_PUBLIC_*` values are **inlined at build time** — updating the env var on Cloud Run changes nothing in already-built client JS; (b) a **stale image tag** — CI deployed `:latest`-style or a cached tag instead of the new SHA.

**Diagnosis:** check the running revision's image digest (`gcloud run services describe ... --format='value(status.latestCreatedRevisionName)'` + `gcloud run revisions describe REVISION ... --format='value(spec.containers[0].image)'`) against the SHA you meant; for (a), open the browser bundle and search for the old URL.

**Fix:** (a) rebuild the image with the new `NEXT_PUBLIC_APP_URL` build arg and deploy the new SHA ([`frontend.md`](./frontend.md)); (b) always deploy immutable `:sha` tags ([`cicd.md`](./cicd.md) §3) — never `:latest`.

**Prevention:** the build-time vs runtime table in [`backend.md`](./backend.md) §5; SHA-tag-only deploys.

## 12. Migrations fail

**Symptom:** `npx prisma db push` errors in CI or locally: `Error: PostgreSQL server closed the connection unexpectedly`, `Insufficient privileges`, `migration_lock`, or a hang on a table.

**Cause:** using the **pooled** `DATABASE_URL` instead of `DIRECT_URL` (poolers break DDL paths); proxy not tunneling (§5); `app_user` lacks ownership/DDL rights on the database; a stuck lock from a half-finished operation; connecting to the wrong instance/region.

**Diagnosis:** echo `DIRECT_URL` (masked host only!) and confirm it targets `acquisitionos-pg` directly; `gcloud sql operations list --instance=acquisitionos-pg` for overlapping operations; `SELECT pid, state, query FROM pg_stat_activity WHERE wait_event IS NOT NULL;` for locks.

**Fix:** export `DIRECT_URL` (direct, `sslmode=require` — [`../../04-database-production.md`](../04-database-production.md) §5) and re-run; grant `app_user` the intended DDL rights (least privilege: it owns only the app schema objects — [`database.md`](./database.md) §3); terminate the stuck PID or wait for the operation to finish. If the migration itself is destructive, stop — backups first ([`rollback.md`](./rollback.md) §3).

**Prevention:** one migration step per deploy, serialized ([`cicd.md`](./cicd.md) §5); pre-migration backup ([`backups.md`](./backups.md) §3).

## 13. Timeout — SSE and scheduler

**Symptom A:** live streams drop every ~30 s / bell stops updating until a manual refresh. **Cause A:** something in front of the app terminates idle connections faster than the 15–30 s heartbeat: the LB backend timeout default (30 s) or a proxy you added. **Diagnosis:** `gcloud compute backend-services describe acquisitionos-bes --global --format='value(timeout)'`. **Fix:** raise the backend timeout to ≥ 120 s (3600 recommended) and keep buffering off for `/api/events/*` ([`networking.md`](./networking.md) §5); keep `min-instances=1`. **Prevention:** the SSE settings table ([`architecture.md`](./architecture.md) §4) is part of LB setup, not an afterthought.

**Symptom B:** scheduled jobs run but report a deadline/cancellation on heavy endpoints. **Cause B:** Cloud Scheduler per-attempt deadline too short for the job. **Diagnosis:** `gcloud scheduler jobs describe cron-autonomous-outreach --location="$REGION" --format='value(attemptDeadline)'` + job logs in Cloud Run. **Fix:** raise `--attempt-deadline` (HTTP targets allow up to ~30 min — verify in the Scheduler docs) or break the work down / increase cadence. **Prevention:** load-test the heaviest cron (`autonomous-outreach`, `sdr-cycle`) once in staging.

## 14. Memory exhaustion — `next build` OOM

**Symptom:** build dies inside CI/Cloud Build: `Killed` / `heap out of memory` during `next build` — **not** at runtime.

**Cause:** the JS heap cap is below what Next 16 + this dependency tree needs.

**Fix:** the repo Dockerfile already sets `ENV NODE_OPTIONS="--max-old-space-size=4096"` — if you build outside that Dockerfile (CI, Cloud Build), replicate it; if the build machine itself is too small, raise the machine or build the image in Docker ([`../../03-docker.md`](../03-docker.md) §3 and its troubleshooting table).

**Prevention:** always build via the repo Dockerfile (one build path, no drift); rebuild memory expectations after major dependency bumps.

## 15. CPU exhaustion (runtime)

**Symptom:** latency p95 climbs, requests queue, instance CPU pinned at 100% (Monitoring → Cloud Run instance CPU); not OOM.

**Cause:** traffic above instance capacity; CPU throttling on (throttled instances starve SSE heartbeats too); a pathological request (giant export, runaway AI loop).

**Diagnosis:** correlate the start time with deploys/traffic; check whether it is one instance id or all (log grouping, [`monitoring.md`](./monitoring.md) §7 step 4); look for the request pattern in play.

**Fix:** confirm `--no-cpu-throttling` is set; scale vertically then horizontally ([`scaling.md`](./scaling.md) §2–3, respecting the Redis and connection-budget prerequisites); identify and cap the pathological request (rate limiting, [`security.md`](./security.md) §5).

**Prevention:** CPU/latency alerts ([`monitoring.md`](./monitoring.md) §4 row 3); load-test before launches.

## 16. Cold start

**Symptom:** first request after idle takes seconds; SSE clients reconnect with silence after quiet periods.

**Cause:** the service scaled to zero between requests (`--min-instances` unset) and a new instance had to boot.

**Diagnosis:** `gcloud run services describe ... --format='value(spec.template.spec.autoscaling)'` → `minInstances: 0`?; look for instance-start latency in request logs.

**Fix:** `--min-instances=1 --no-cpu-throttling` — `REQUIRED FOR CURRENT ACQUISITIONOS` ([`architecture.md`](./architecture.md) §4). That is the whole fix for the first instance; per-request cold starts inside scaled-out traffic are mitigated by concurrency tuning ([`scaling.md`](./scaling.md) §2).

**Prevention:** set min instances at creation ([`manual-deployment.md`](./manual-deployment.md) step 11) and verify after CI deploys (CI flags can silently differ — [`cicd.md`](./cicd.md) §4).

## 17. Background job not running (cron)

**Symptom:** sequences stop advancing, credits don't renew, outreach stalls — anything the 15 endpoints drive. The app has **no in-app scheduler**: unscheduled = never runs.

**Cause (ranked):** Cloud Scheduler job disabled or never created; **the OIDC trap** — job created with `--oidc-*` flags, whose ID token **overwrites** the `Authorization` header the endpoint checks, so every call 401s; `CRON_SECRET` mismatch between the job header and the app secret; wrong HTTP method (`payment-reconciliation` is GET, everything else POST); wrong URI (still `run.app` after a domain move, or a typo).

**Diagnosis:**

```bash
gcloud scheduler jobs list --location="$REGION" --format='table(name, schedule, state)'     # 15 jobs? ENABLED?
gcloud scheduler jobs describe cron-process-sequences --location="$REGION" \
  --format='value(httpTarget.headers, httpTarget.httpMethod, httpTarget.uri, oidcToken)'
#   headers must contain Authorization=Bearer <CRON_SECRET>; oidcToken must be EMPTY.
gcloud logging read 'resource.type="cloud_run_revision"
  httpRequest.requestUrl:"/api/cron/"' --limit=10 --format='table(httpRequest.status, httpRequest.requestUrl)'
#   401 → header/secret wrong; 404 → URI wrong; 405 → method wrong; nothing → scheduler not firing.
```

**Fix:** recreate/update the job with `--http-method` matching the table and `--headers="Authorization=Bearer ${CRON_SECRET}"` (never `--oidc-*`) — full command + 15-endpoint table in [`cicd.md`](./cicd.md) §8; rotate-mismatch → update the secret *and* all 15 headers atomically; domain move → `gcloud scheduler jobs update http ... --uri=https://app.yourdomain.com/...` ([`dns-ssl.md`](./dns-ssl.md) §7). `/api/gmail/jobs/process` uses `x-api-key=${GMAIL_CRON_API_KEY}` instead.

**Prevention:** a scheduler-failure alert ([`monitoring.md`](./monitoring.md) §4 row 7); the auth contract documented in one place ([`architecture.md`](./architecture.md) §5).

## 18. Webhook failure

**Symptom:** payments don't update entitlements; Gmail push silent; Telegram bot mute. Provider dashboards show failed deliveries.

**Cause:** signature-verification secret mismatch (`STRIPE_WEBHOOK_SECRET`/`RAZORPAY_WEBHOOK_SECRET` not the value from the *current* endpoint registration); response buffering in front of the route; URL not publicly reachable (ingress restricted to LB before the LB exists, or provider hitting `run.app` after ingress lockdown); provider sending GET or a retried POST your route treats differently.

**Diagnosis:**

```bash
gcloud logging read 'resource.type="cloud_run_revision"
  httpRequest.requestUrl:"/api/payments/webhook/"' --limit=10 \
  --format='table(timestamp, httpRequest.status, httpRequest.requestMethod)'
#   400/401/403 → signature/secret mismatch; 404 → wrong path; 503 → ingress/edge problem.
# Stripe CLI replay against staging is the clean reproduction:
#   stripe listen --forward-to https://staging.yourdomain.com/api/payments/webhook/stripe
```

**Fix:** re-register the webhook in the provider dashboard with the final public HTTPS URL (`https://app.yourdomain.com/api/payments/webhook/stripe` or `https://app.yourdomain.com/api/payments/webhook/razorpay`), copy the fresh `whsec_...` into Secret Manager, start a new revision; ensure ingress/LB allows the provider ([`backend.md`](./backend.md) §13); keep `/api/events/*`-style buffering settings away from webhook routes (they expect POST + raw body, no transformation).

**Prevention:** webhook URLs updated in the same cutover checklist as OAuth URIs ([`dns-ssl.md`](./dns-ssl.md) §7); test-event verification after every domain change ([`manual-deployment.md`](./manual-deployment.md) step 15).

## 19. Logs unavailable

**Symptom:** `gcloud logging read` returns nothing (or only platform entries), or permission-denied.

**Cause:** the reader identity lacks a logging-viewer role; wrong `--project`; wrong region filter for region-scoped views; logs older than the retention window.

**Diagnosis:** run with your own admin identity to separate role vs data (`gcloud logging read 'resource.type="cloud_run_revision"' --limit=1 --project="$PROJECT_ID"`); check `gcloud config get-value project`; confirm the service name spelling in `resource.labels.service_name`.

**Fix:** grant the reader `roles/logging.viewAccessor` (or `roles/logging.viewer` for project-wide); query the right project/region; platform request logs and app stdout both live under `resource.type="cloud_run_revision"`.

**Prevention:** the debugging commands in [`monitoring.md`](./monitoring.md) §7 use one tested identity; document it in the runbook.

---

## 20. Official documentation

- Cloud Run troubleshooting (revisions, errors, 503s) — https://cloud.google.com/run/docs/troubleshooting
- Cloud Run request logs — https://cloud.google.com/run/docs/logging
- Cloud SQL connection troubleshooting — https://cloud.google.com/sql/docs/postgres/connection-problems and https://cloud.google.com/sql/docs/postgres/sql-proxy#troubleshooting
- Cloud DNS troubleshooting — https://cloud.google.com/dns/docs/troubleshooting
- Certificate Manager troubleshooting — https://cloud.google.com/certificate-manager/docs/troubleshooting
- Cloud Scheduler troubleshooting — https://cloud.google.com/scheduler/docs/troubleshooting
- Prisma error reference — https://www.prisma.io/docs/orm/reference/error-reference
- Handbook: [`../../01-architecture.md`](../01-architecture.md) (facts source) · [`troubleshooting` triage](#1-first-10-minutes-triage-runbook) · [`rollback.md`](./rollback.md) · [`monitoring.md`](./monitoring.md)
