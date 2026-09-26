# GCP Monitoring — Cloud Logging, Cloud Monitoring, Alerts, OTel

AcquisitionOS arrives with its own observability surface (health endpoints, `/api/metrics`, OpenTelemetry hooks). GCP arrives with Cloud Logging and Cloud Monitoring. This page connects the two: what to watch, how to alert, and how to debug from logs when something breaks.

**Labels:** Cloud Logging is on by default; **alerting policies are `REQUIRED FOR CURRENT ACQUISITIONOS` in spirit** — an unmonitored production deploy is a bet you will lose. Dashboards, OTLP, and audit-log review are `OPTIONAL` hardening.

```bash
export PROJECT_ID="YOUR_PROJECT_ID"      # gcloud config get-value project
export REGION="us-central1"              # your deployment region
export SERVICE_NAME="acquisitionos"
export APP_DOMAIN="app.yourdomain.com"
```

---

## 1. What the app already gives you (no configuration)

| Surface | Where | Notes |
| --- | --- | --- |
| `GET /api/health` | unauthenticated; DB + memory + error counts | the only one to expose; use for uptime checks ([`backend.md`](./backend.md) §2) |
| `GET /api/health/detailed`, `/api/health/database` | richer diagnostics | keep internal — [`security.md`](./security.md) §9 |
| `GET /api/metrics` | Prometheus-format metrics | unauthenticated today — scrape from inside / protect at the LB (§6) |
| `/api/events/*` SSE | 15–30 s heartbeats | disconnect storms show up as client reconnect logs |
| OTEL env hooks | `OTEL_ENABLED`, `OTEL_EXPORTER`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` | §5 |

---

## 2. Cloud Logging — log-based metrics

**What:** turn log patterns into countable metrics Cloud Monitoring can alert on. **Why:** "5xx in the last 10 minutes" or "cron returned 401" are log facts, not platform metrics.

```bash
# What: counter metric for HTTP 5xx on the Cloud Run service
# Why: the base signal for every availability alert below
gcloud logging metrics create acquisitionos_5xx \
  --description="5xx responses from Cloud Run" \
  --log-filter='resource.type="cloud_run_revision"
    resource.labels.service_name="acquisitionos"
    httpRequest.status>=500'
# Expected output: Created [acquisitionos_5xx].

# Cron failures: the app returns 401 on a bad/missing Bearer header, 404 on wrong URI
gcloud logging metrics create acquisitionos_cron_fail \
  --description="Cron endpoint failures (401/404/5xx)" \
  --log-filter='resource.type="cloud_run_revision"
    resource.labels.service_name="acquisitionos"
    httpRequest.requestUrl:"/api/cron/"
    (httpRequest.status>=500 OR httpRequest.status=401 OR httpRequest.status=404)'

# SSE disconnects: SSE routes logging unusual closes (tune the pattern once you see real traffic)
gcloud logging metrics create acquisitionos_sse_disconnects \
  --description="Abnormal SSE connection ends on /api/events/*" \
  --log-filter='resource.type="cloud_run_revision"
    resource.labels.service_name="acquisitionos"
    httpRequest.requestUrl:"/api/events/"
    httpRequest.status>=400'
```

**Verify:** Cloud console → Logging → Log-based metrics shows your three metrics with rising counts after generating traffic; or `gcloud logging metrics list`.

---

## 3. Dashboards + uptime checks

**Uptime check** — `REQUIRED`: probe the real public URL from multiple Google regions so "down" is measured outside your own network.

```bash
# Console path is friendlier for the first one (Monitoring → Uptime checks → Create):
#   Target: HTTPS, host app.yourdomain.com, path /api/health, check every 5 min
#   Regions: tick at least 3 (e.g. us-central1, europe-west1, asia-east1)
# gcloud equivalent (verify current flag spelling with `gcloud monitoring uptime --help` — NEEDS VERIFICATION):
gcloud monitoring uptime create acquisitionos-health \
  --resource-type=uptime-url \
  --host="$APP_DOMAIN" --path="/api/health" --protocol=https --period=5
```

**Dashboard** — `OPTIONAL` but recommended (Monitoring → Dashboards → Add): one row of Cloud Run charts (request count, 5xx count, instance CPU, instance memory, request latency p95) and one row of Cloud SQL charts (connections, CPU, disk, memory — [`database.md`](./database.md) §7).

**Verify:** break something on purpose in staging (deploy a bad image) and watch the uptime check flip to failing. A check you have never seen fail is not a check.

---

## 4. Alerting policies — concrete starting set

**What:** notifications when the signals cross thresholds. **Why:** every row below corresponds to a real, common failure of this app.

Set up one notification channel first (Monitoring → Alerting → Notification channels → Email, or Slack/PagerDuty via their integrations). Then create policies in the console or via `gcloud alpha monitoring policies create` (`NEEDS VERIFICATION`: exact gcloud surface for alerting policies — the console is the reliable path for beginners).

| # | Policy | Condition (example) | Usually means |
| --- | --- | --- | --- |
| 1 | Health failing | uptime check failing ≥ 5 min | deploy gone bad, DB down, region issue — run [`troubleshooting.md`](./troubleshooting.md) triage |
| 2 | 5xx rate | `acquisitionos_5xx` > 10 in 10 min | app errors; correlate with deploys |
| 3 | Instance saturation | Cloud Run instance CPU > 80% or memory > 80% for 10 min | scale up/out — [`scaling.md`](./scaling.md) §2–3 |
| 4 | SQL connections | Cloud SQL connections > 80% of `max_connections` | connection budget exhausted — [`database.md`](./database.md) §8 |
| 5 | SQL CPU | Cloud SQL CPU > 80% for 10 min | slow queries / undersized tier — [`scaling.md`](./scaling.md) §8 |
| 6 | SQL disk | Disk utilization > 75% | enable storage auto-increase — [`database.md`](./database.md) §9 |
| 7 | Scheduler job failure | `acquisitionos_cron_fail` > 0 in 30 min, or Cloud Scheduler job state `DISABLED`/failed | header/URI wrong or scheduler disabled — [`troubleshooting.md`](./troubleshooting.md) §cron |
| 8 | Certificate expiry | Cloud Monitoring SSL cert metrics approaching expiry | managed certs auto-renew; if you see this, renewal is failing — [`dns-ssl.md`](./dns-ssl.md) §3 |

Alert philosophy: alert on **symptoms users feel** (1, 2, 4, 7) and treat capacity alerts (3, 5, 6) as warnings; every alert you ignore trains you to ignore alerts.

---

## 5. OpenTelemetry (OTLP) — traces and metrics export — `OPTIONAL`

**What the app has:** `src/instrumentation.ts` registers the OTel Node.js runtime; four env vars control it: `OTEL_ENABLED`, `OTEL_EXPORTER`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` (storage decisions: [`secrets.md`](./secrets.md) §3.8).

```bash
gcloud run services update "$SERVICE_NAME" --region="$REGION" \
  --update-env-vars=OTEL_ENABLED=true,OTEL_EXPORTER=otlp,OTEL_SERVICE_NAME=acquisitionos-prod,OTEL_EXPORTER_OTLP_ENDPOINT=https://OTLP_ENDPOINT_VALUE
# Expected output: revision [acquisitionos-000xx+1] ... deployed.
```

Where to point `OTEL_EXPORTER_OTLP_ENDPOINT` on GCP — three factual options:

1. **Google Cloud Managed Service for Prometheus / Cloud Trace** ingest endpoints: GCP exposes OTLP ingestion (e.g. under `telemetry.googleapis.com` / project-scoped endpoints), but the exact path, required auth headers (API key or service-account token), and protocol (HTTP vs gRPC) for a Cloud Run workload evolve with the platform — **`NEEDS VERIFICATION`: check the current "Configure OTLP ingestion" pages for Managed Service for Prometheus and Cloud Trace before relying on this**, and budget for the auth sidecar/token step.
2. **A small OTel Collector you run** on Cloud Run (or anywhere): point `OTEL_EXPORTER_OTLP_ENDPOINT` at it; the collector handles auth/export to GCP backends. Most robust choice today; the repo's `monitoring/` folder carries reference collector/Prometheus/Grafana configs.
3. **Skip OTLP initially**: Cloud Logging + `/api/metrics` + uptime checks cover the current operational needs; OTLP is the upgrade path.

Verify: deploy, trigger a few requests, and confirm the trace/metric destination shows `OTEL_SERVICE_NAME=acquisitionos-prod` data.

---

## 6. `/api/metrics` — the Prometheus endpoint

**What:** `GET /api/metrics` returns Prometheus-format metrics (verified in `src/app/api/metrics/route.ts`: request/process counters plus DB gauges like active users and remaining credits).

- It is **unauthenticated today** — do not expose it on the public internet. Scrape it from inside the platform (a collector or scheduled job) or restrict it at the LB alongside `/api/health/detailed` and `/api/auth/debug` ([`security.md`](./security.md) §9).
- A cheap first use: a scheduled job (or a periodic `curl` via Cloud Scheduler + Cloud Run job) that POSTs a snapshot into logs, giving you metric history without new infrastructure. `FUTURE/ALTERNATIVE` — Managed Prometheus scraping is the durable answer.

---

## 7. Log-based debugging workflow

The workflow when an alert fires — commands you will actually run:

```bash
# 1. Recent errors, oldest→newest, readable:
gcloud logging read 'resource.type="cloud_run_revision"
  resource.labels.service_name="acquisitionos"
  severity>=ERROR' --limit=50 --format='table(timestamp, severity, textPayload)'

# 2. Everything for one request (use the trace/request id from step 1):
gcloud logging read 'resource.type="cloud_run_revision"
  httpRequest.requestUrl:"/api/payments/webhook/"' --limit=20

# 3. Live tail while reproducing (writes to your terminal until Ctrl-C):
gcloud beta run services logs tail "$SERVICE_NAME" --region="$REGION"

# 4. Which instance is misbehaving? Group by instance id:
gcloud logging read 'resource.type="cloud_run_revision"
  resource.labels.service_name="acquisitionos"' --limit=200 \
  --format='value(resource.labels.instance_id)' | sort | uniq -c | sort -rn | head
```

- Request logs (`httpRequest.*`) come from the platform; application `console.*` lines appear as `textPayload` or structured JSON — filter accordingly.
- The full symptom-indexed workflow is [`troubleshooting.md`](./troubleshooting.md) §1 (first 10 minutes).

---

## 8. Cloud Audit Logs — who changed what — `OPTIONAL` but recommended reading

**What:** GCP's built-in admin-activity trail: IAM policy changes, secret create/update/destroy, Cloud Run deploys, SQL config changes.

- **Admin Activity** audit logs are always on and free.
- **Data Access** logs (e.g. who *read* a secret version) must be enabled per service (IAM & Admin → Audit Logs → Secret Manager → Data Read) — they bill at logging rates; enable for Secret Manager, skip for chatty services initially.

```bash
gcloud logging read 'logName:"cloudaudit.googleapis.com%2Factivity"
  resource.type="iam_role" OR resource.type="cloud_run_revision"' --limit=20 \
  --format='table(timestamp, protoPayload.methodName, protoPayload.authenticationInfo.principalEmail)'
# Expected output: recent admin actions with the principal that performed them.
```

Pair with the app's own audit log (`src/app/api/audit/` exists in-repo) for user-level activity. Security review cadence: [`security.md`](./security.md) §10.

---

## 9. Checklist

```text
[ ] Uptime check on https://app.yourdomain.com/api/health from 3+ regions
[ ] Log-based metrics created: acquisitionos_5xx, acquisitionos_cron_fail, acquisitionos_sse_disconnects
[ ] Notification channel configured (email at minimum)
[ ] Policies 1-2-4-7 from §4 created and TESTED (force a failure in staging)
[ ] /api/health/detailed, /api/health/database, /api/auth/debug, /api/metrics NOT publicly reachable
[ ] LOG_LEVEL left at default (info); debug only temporarily
[ ] (OPTIONAL) OTLP endpoint chosen and verified end to end
[ ] (OPTIONAL) Data Access audit logs enabled for Secret Manager
```

---

## 10. Official documentation

- Cloud Logging — https://cloud.google.com/logging/docs
- Log-based metrics — https://cloud.google.com/logging/docs/logs-based-metrics
- Cloud Monitoring uptime checks — https://cloud.google.com/monitoring/uptime-checks
- Alerting policies — https://cloud.google.com/monitoring/alerts
- Cloud Run request logs & monitoring — https://cloud.google.com/run/docs/monitoring
- Managed Service for Prometheus (OTLP ingestion) — https://cloud.google.com/stackdriver/docs/managed-prometheus
- Cloud Trace OTLP — https://cloud.google.com/trace/docs/otel
- Cloud Audit Logs — https://cloud.google.com/logging/docs/audit
- Handbook: [`../../01-architecture.md`](../01-architecture.md) §3 (observability stack) · [`backend.md`](./backend.md) · [`backups.md`](./backups.md)
