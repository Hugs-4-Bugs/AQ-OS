# Monitoring — Logs, Uptime, Alerts, Dashboards

What to watch when AcquisitionOS runs on Cloudflare, and how to know about problems **before your users tweet about them**. The app-side observability facts (health endpoints, OpenTelemetry vars) come from [`../01-architecture.md`](../01-architecture.md) §1 and §2; this page is the Cloudflare wiring.

**The monitoring stack in one table:**

| Layer | Tool | Label |
| --- | --- | --- |
| Live request/error logs | `wrangler tail` | `REQUIRED` (operator tooling) |
| Persisted platform logs | Workers Logs (`observability.enabled`) | `REQUIRED` |
| Uptime | External monitor on `GET /api/health` | `REQUIRED` |
| Alerting | Cloudflare Notifications + external alert channel | `RECOMMENDED` |
| Database metrics | Your Postgres provider's dashboard | `REQUIRED` (inherited) |
| App traces/metrics (OTLP) | OpenTelemetry vars → OTLP endpoint | `OPTIONAL` — `NEEDS VERIFICATION` on Workers |
| Log retention/export | Logpush to R2 | `OPTIONAL` |
| Account activity | Cloudflare Audit Logs | `RECOMMENDED` |

---

## 1. Enable Workers Logs (do this on day one)

**What:** Cloudflare's built-in, persisted, searchable logs for Workers — invocations, `console.*` output, and exceptions, visible in the dashboard and queryable via the API.

**Why:** `wrangler tail` only shows you what happens *while you watch*. Workers Logs keeps the last few days of history (retention depends on plan — `NEEDS VERIFICATION`), which is the difference between debugging yesterday's incident and shrugging at it.

**Command — add to `wrangler.jsonc` (top level):**

```jsonc
{
  // ... name, main, compatibility_date, ...
  "observability": {
    "enabled": true
  }
}
```

then `npx opennextjs-cloudflare deploy` (or `npx wrangler deploy`).

**Expected output:** the deploy summary accepts the key; dashboard → Workers & Pages → `acquisitionos` → **Logs** begins filling with events.

**How to verify:** trigger `curl -s https://app.yourdomain.com/api/health`, then open the Logs tab — the request appears with status 200. Filter by `status >= 500` to see only failures.

**Cost note:** Workers Logs has usage-based pricing beyond a free allowance on some plans — check the current terms (`NEEDS VERIFICATION`) at https://developers.cloudflare.com/workers/observability/logs/workers-logs/.

---

## 2. `wrangler tail` — the live debugging tool

**What:** streams every request and log line from the Worker to your terminal, in real time.

**Why:** the fastest feedback loop while deploying, testing, or troubleshooting — it is always step one in [`./troubleshooting.md`](./troubleshooting.md).

**Commands (useful filter shapes):**

```bash
npx wrangler tail --format pretty                          # everything, human-readable
npx wrangler tail --format json                            # machine-readable (pipe to jq)
npx wrangler tail --format pretty --status error           # only 4xx/5xx/exceptions
npx wrangler tail --format pretty --search "webhook"       # sampled search for a string
npx wrangler tail --format pretty --search "api/cron"      # cron dispatcher traffic
npx wrangler tail --name acquisitionos-staging             # the staging Worker
npx wrangler tail --name acquisitionos-cron                # the cron dispatcher Worker
npx wrangler tail --format pretty --sampling-rate 0.1      # 10% sampling on busy Workers
```

**Expected output:** one entry per request — method, URL, status, plus `console.log` lines and uncaught exceptions with stack traces (as far as the runtime can provide them).

**Verify:** run two terminals — one tailing, one `curl`-ing `/api/health`; the request appears within seconds. If nothing appears: observability disabled, wrong Worker name, or login issue ([`./troubleshooting.md`](./troubleshooting.md) "Logs unavailable").

---

## 3. External uptime checks on `/api/health`

**Label:** `REQUIRED FOR CURRENT ACQUISITIONOS`

**What:** an outside-the-platform monitor that `GET`s `https://app.yourdomain.com/api/health` every 1–5 minutes and alerts on failure. Workers has **no internal load balancer and no built-in probe** ([`backend.md`](./backend.md) §1) — external checks are the replacement.

**Options:**

| Option | Notes |
| --- | --- |
| Third-party uptime monitors (UptimeRobot, Better Stack, Checkly, cron-job.org, ...) | The straightforward baseline. Free tiers are fine to start. Check from **multiple regions** if you want edge-coverage confidence. Assert on HTTP 200 *and* a sane JSON body, not just TCP. |
| Cloudflare Health Monitors | Part of the **Load Balancing** product (monitors probe pools/origins). Pointing one at a Worker-only hostname is an unusual shape — fit and behavior on this platform are `NEEDS VERIFICATION` (https://developers.cloudflare.com/load-balancing/health-checks/). Do not buy Load Balancing just for this; use a third-party monitor. |
| The cron dispatcher Worker | Not a monitor — it *does* fetch cron URLs and logs non-200s, which gives you incidental signal. Never treat it as your uptime check. |

**Command (Checkly-style CLI example; adapt to your provider):**

```bash
# concept: create a check hitting /api/health every 1 min from >=2 regions,
# alerting after 2 consecutive failures (avoid single-blip pages)
curl -s https://app.yourdomain.com/api/health -o /dev/null -w "%{http_code}\n"   # expect 200
```

**Expected output:** `200`. **Verify the monitor:** deliberately break something in staging (disable the Worker), confirm the alert arrives, re-enable. Also monitor `https://staging.yourdomain.com/api/health` at a laxer cadence.

---

## 4. Alerting: Cloudflare Notifications + external channels

**What:** two complementary alert sources:

1. **Cloudflare Notifications** (dash → Notifications): product-scoped alerts delivered to email/webhook integrations. Workers-related alert types (e.g. error-rate alerts) exist in some form, but availability by plan and the exact list of Workers alert types are **`NEEDS VERIFICATION`** (https://developers.cloudflare.com/notifications/). "Origin 5xx" style alerts are **NOT APPLICABLE** here — there is no origin behind the Worker; request failures are Worker errors (1101/1102/limits — see [`./troubleshooting.md`](./troubleshooting.md)).
2. **External alerting on the uptime check + logs:** your uptime provider's alerting (email/Slack/PagerDuty webhook) is the reliable, platform-independent baseline. For error-rate paging, a scheduled job (or your log platform, if you export) that queries Workers Logs / Logpush output and alerts on spikes works without depending on Cloudflare alert features.

**Recommended minimum set:**

| Alert | Condition | Channel |
| --- | --- | --- |
| App down | `/api/health` fails 2× in a row | PagerDuty/Slack via uptime provider |
| App degraded | `/api/health` 200 but slow (>2 s) consistently | Slack |
| Errors spiking | 5xx/error rate from Workers Logs above threshold | Slack/email |
| DB pressure | Provider CPU/connections/storage alerts (§5) | Provider's alerting → Slack/email |
| Bill/abuse anomalies | Cloudflare account notifications | Email |

**Verify:** fire a test notification from each source; confirm it reaches the human channel you actually watch.

---

## 5. Database monitoring — inherited from the Postgres provider

**What:** Cloudflare sees only "Hyperdrive talked to the database". Query latency, CPU, connection count, storage, replication lag, and backup health all live in **your provider's console** (Neon, Supabase, RDS, Cloud SQL, ...).

**Why it matters most here:** the external Postgres is the first bottleneck of the whole deployment ([`./scaling.md`](./scaling.md) §2). Watch: CPU %, active connections vs `max_connections` (Hyperdrive keeps this a small constant — [`database.md`](./database.md) §8), storage growth, and slow-query logs.

**Command (spot-check from your machine):**

```bash
psql "$DIRECT_URL" -c "select count(*) from pg_stat_activity where state = 'active';"
```

**Expected output:** a small number. **Verify:** enable the provider's alerting (CPU > 80%, connections > 80% of max, storage > 80%) and route it to the same channels as §4. Backup/PITR status checks are part of [`./backups.md`](./backups.md).

---

## 6. OTLP export from the app — `OPTIONAL`, `NEEDS VERIFICATION` on Workers

**What:** the app ships OpenTelemetry support via env vars ([`../01-architecture.md`](../01-architecture.md) §1; full inventory in [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md)):

| Var | Example value | Storage |
| --- | --- | --- |
| `OTEL_ENABLED` | `true` | `vars` |
| `OTEL_EXPORTER` | `otlp` | `vars` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | your collector URL (HTTPS) | `vars` (or secret if it carries credentials) |
| `OTEL_SERVICE_NAME` | `acquisitionos` | `vars` |
| `LOG_LEVEL` | `info` (or `debug` temporarily) | `vars` |

**The honest caveat:** `instrumentation.ts` registers on the Node.js runtime; on Workers (via the OpenNext adapter) the OTLP exporter's behavior — whether traces/metrics flow at all, and how — is **`NEEDS VERIFICATION`** per [`./architecture.md`](./architecture.md) §2 and [`secrets.md`](./secrets.md) §3. Test it explicitly in staging: set the vars, exercise a few routes, and check your OTLP backend for arriving data. If traces do not flow, the **supported fallback is Workers Logs + Logpush** (below) plus provider-side DB metrics — that combination covers the operational baseline.

**Verify:** dashboard Logs show `LOG_LEVEL` behavior; OTLP backend (if working) shows `acquisitionos` as a service name.

---

## 7. Logpush to R2 — `OPTIONAL`

**What:** Cloudflare can push Workers trace/log data to a destination (e.g. an R2 bucket you already own) for long retention and offline analysis.

**Why:** Workers Logs retention is short-ish; if you need weeks of history (audits, incident archaeology), Logpush → R2 → your query tool is the Cloudflare-native path. Availability/shape of Workers Logpush has been evolving — `NEEDS VERIFICATION` (https://developers.cloudflare.com/logs/ or the Workers observability docs).

**Sketch:** create an R2 bucket (`acquisitionos-logs`) → dashboard or API → Logpush job for the Workers dataset → query with `wrangler r2 object get` or point Athena-like tooling at it. **Verify:** objects land within the promised interval after some traffic.

---

## 8. Dashboard sketch (what to look at each morning)

```text
┌────────────────────────────────────────────────────────────────────┐
│ AcquisitionOS on Cloudflare — daily glance                          │
├──────────────────────────────┬─────────────────────────────────────┤
│ Uptime (external monitor)    │ /api/health 30-day: 99.9%? alerts?  │
│ Worker (dash → Metrics)      │ requests, errors %, CPU p50/p99     │
│ Workers Logs                 │ filter status>=500 over 24h: trend? │
│ Postgres provider            │ CPU, connections, storage, slow q.  │
│ Cron dispatcher (Logs)       │ last runs: all 200s? skipped?       │
│ Cloudflare Security          │ WAF events: only the noisy rule?    │
└──────────────────────────────┴─────────────────────────────────────┘
```

Dashboard → Workers & Pages → `acquisitionos` → **Metrics** shows requests, error rate, and CPU time percentiles — the closest thing to an app health graph on this platform. There is no built-in custom dashboard builder for Workers metrics today (`NEEDS VERIFICATION`); external monitors + Grafana-on-logpush fill that gap if needed.

---

## 9. Cloudflare Audit Logs

**What:** an account-level trail of *configuration* changes — deploys (who/what created versions), secret creation events (names, not values), Hyperdrive changes, DNS edits, WAF changes, token creation.

**Why:** answers "who changed what" after an incident or a surprise deploy — complementary to application logs, which show requests, not operators.

**Command (dashboard):** dash → Manage Account → **Audit Logs**; filter by account and time. API: `curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/audit_logs?per_page=20"`.

**Expected output:** entries like `workers.deploy` / `worker secret created` with actor + timestamp. **Verify:** make a trivial change (e.g. add a `vars` entry and deploy), find it in the audit log.

---

## 10. Official Documentation

- Workers Logs — https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- `wrangler tail` — https://developers.cloudflare.com/workers/wrangler/commands/#tail (and https://developers.cloudflare.com/workers/observability/logs/real-time-logs/)
- Workers Metrics (dashboard) — https://developers.cloudflare.com/workers/observability/metrics-and-analytics/
- Cloudflare Notifications — https://developers.cloudflare.com/notifications/
- Logpush — https://developers.cloudflare.com/logs/
- Load Balancing Health Monitors (context for why they are NOT the Worker probe) — https://developers.cloudflare.com/load-balancing/health-checks/
- Audit Logs — https://developers.cloudflare.com/fundamentals/account/account-audit-logs/
- OpenTelemetry in the app — [`../01-architecture.md`](../01-architecture.md) §1, [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md)
