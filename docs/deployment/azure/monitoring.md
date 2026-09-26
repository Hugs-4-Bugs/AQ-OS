# Monitoring on Azure — Log Analytics, Application Insights, Alerts

The app already emits what you need: console logs (stdout/stderr), health endpoints, `/api/metrics`, and OpenTelemetry signals via the `OTEL_*` variables. Azure's job is to collect them and to **wake you up when something breaks**. Setup order: Log Analytics (already wired, §1–2) → optional Application Insights (§3) → alerts + action groups (§4–5) → uptime tests (§6) → dashboards (§7) → cost visibility (§8) → audit trails (§9).

---

## 1. What is already collecting

**What:** every Container Apps environment logs to a **Log Analytics workspace** — you created it in [`manual-deployment.md`](./manual-deployment.md) §5 (`log-acquisitionos`) — and Azure records platform metrics for the app and the database automatically.

**Why start here:** before any extra service, you can already answer "what did the app log at 14:03?" and "was the DB's CPU spiking then?" — the two questions every incident starts with.

```bash
# stream live logs
az containerapp logs show -n "$APP" -g "$RG" --follow
# open the workspace query editor (KQL)
az monitor log-analytics workspace show -g "$RG" -n "$LAW" --query customerId -o tsv
```

**Verify:** Portal → Log Analytics workspace `log-acquisitionos` → **Logs** → run a trivial query (`ContainerAppConsoleLogs_CL | take 10`) and see app lines.

---

## 2. KQL queries you will actually use

**Where:** Portal → the Log Analytics workspace → **Logs**. Table/column names below follow the common Container Apps schema; if a column name differs in your workspace, pick the real one from the schema pane (names vary slightly by schema version — NEEDS VERIFICATION per workspace; the logic transfers unchanged).

**Recent errors from the app:**

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "acquisitionos-api"
| where Level_s in ("Error", "Critical") or Log_s has "error"
| project TimeGenerated, Level_s, ContainerAppName_s, Log_s
| order by TimeGenerated desc
```

**Cron outcomes** (each scheduler fire logs the endpoint + status; join with the Function App side of [`cicd.md`](./cicd.md) §8):

```kusto
ContainerAppConsoleLogs_CL
| where Log_s has "/api/cron" or Log_s has "/api/payments/process-billing" or Log_s has "/api/feedback/retry-emails"
| project TimeGenerated, Log_s
| order by TimeGenerated desc
```

**SSE disconnect/reconnect signals** (illustrative grep — the app's exact log strings for stream lifecycle are NEEDS VERIFICATION; check one stream's lines in your workspace first, then pin the query):

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "acquisitionos-api"
| where Log_s has "events" or Log_s has "realtime"
| where TimeGenerated > ago(1h)
| summarize count() by bin(TimeGenerated, 5m)
```

A spike of disconnect-shaped lines just after a deploy is *normal* (replicas recycle; clients replay via `Last-Event-ID` — [`backend.md`](./backend.md) §12). A steady trickle all day is an edge/timeout problem — [`troubleshooting.md`](./troubleshooting.md) §Timeout.

**Log-based alert tip:** any query above can become an alert rule (**New alert rule** from the Logs blade) — e.g. "more than N Error lines in 5 minutes".

---

## 3. Application Insights — the OTEL wiring

**What:** Application Insights (App Insights) is Azure's APM store for traces/metrics/requests. AcquisitionOS exports OpenTelemetry signals itself (`src/instrumentation.ts` registers the Node runtime), so the app-side knobs are just the four variables from [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §8: `OTEL_ENABLED`, `OTEL_EXPORTER`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`.

**Two supported wirings — pick one:**

1. **OTLP endpoint (uses the app's existing exporter).** Create an App Insights resource with *connection string*; Azure Monitor exposes an OTLP ingestion endpoint for OpenTelemetry SDKs. Set:
   ```bash
   az monitor app-insights component create -g "$RG" --app appi-acquisitionos --location "$AZ_LOCATION"
   az containerapp update -n "$APP" -g "$RG" --set-env-vars \
     OTEL_ENABLED=true \
     OTEL_EXPORTER=otlp \
     OTEL_SERVICE_NAME=acquisitionos \
     OTEL_EXPORTER_OTLP_ENDPOINT="https://REGION.otlp.monitor.azure.com"   # placeholder - NEEDS VERIFICATION
   ```
   The **exact endpoint URL format and authentication header for Azure Monitor's OTLP ingestion are NEEDS VERIFICATION** (current guidance: enable the OpenTelemetry exporter in App Insights and copy the endpoint + key/connection-string handling from its "Getting started" page — https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable). If the endpoint proves awkward, option 2 is zero-friction.
2. **Connection-string style integration.** Provide the App Insights **connection string** to the environment and let the Azure Monitor OpenTelemetry pipeline capture signals (the app's generic OTLP vars then matter less). If you instead rely on Container Apps auto-instrumentation for Node.js: availability for Node is NEEDS VERIFICATION (it is a documented, stable feature for Java; check the current docs before counting on it for this app).

**Why bother at all:** distributed traces make slow requests debuggable (which Prisma query, which outbound AI call); plain logs answer "what" but not "where in the request". OPTIONAL for launch — Log Analytics + health alerts carry a small production fine ([`architecture.md`](./architecture.md) §1 labels App Insights OPTIONAL).

**Verify:** Portal → `appi-acquisitionos` → **Live Metrics**/**Transaction search** shows traffic after a few logins; `/api/health` still 200 (the exporter must not break requests).

---

## 4. Alerts that matter on day one

**What/Why:** alerts are the difference between "the bell stopped at 14:02" and "a user told you at 15:30". Each rule = metric + threshold + window + **action group** (§5). Metric names below are the ones in the portal pickers; exact spellings vary slightly (NEEDS VERIFICATION per the metrics reference — same caveat as [`database.md`](./database.md) §14).

**App-level (Container App):**

```bash
# HTTP 5xx rate - needs request metrics; if Requests/5xx are not exposed per revision,
# derive from App Insights failed requests, or use the KQL-based alert (§2)
az monitor metrics alert create -g "$RG" -n app-replicas-high \
  --scopes "$(az containerapp show -n "$APP" -g "$RG" --query id -o tsv)" \
  --condition "avg Replicas > 4" --window-size 15m --evaluation-frequency 5m \
  --action YOUR_ACTION_GROUP        # near max-replicas 5: load or a retry storm
az monitor metrics alert create -g "$RG" -n app-restarts \
  --scopes "$(az containerapp show -n "$APP" -g "$RG" --query id -o tsv)" \
  --condition "total RestartCount > 0" --window-size 15m --evaluation-frequency 5m \
  --action YOUR_ACTION_GROUP        # OOM or crash-looping revision
```

- **Health probe failing** — the most direct signal: an App Insights availability test on `/api/health` (§6) failing 2× in a row, or a KQL alert on probe/liveness log lines. This catches "ingress up, app dead".
- **HTTP 5xx rate** — any sustained 5xx (from App Insights `requests | where resultCode startswith "5"` if wired, else KQL alert on error logs).
- **CPU / memory** — `Usage nano cores` sustained > 80 % of the per-replica allocation, and `Working set bytes` > 80 % of the memory cap (OOM risk — [`backend.md`](./backend.md) §9).

**PostgreSQL Flexible Server** (mirrors [`database.md`](./database.md) §14 — set these on day one):

```bash
az monitor metrics alert create -g "$RG" -n pg-connections-high \
  --scopes "$(az postgres flexible-server show -g "$RG" -n "$PG" --query id -o tsv)" \
  --condition "avg connections_active > 80" --window-size 5m --evaluation-frequency 1m \
  --action YOUR_ACTION_GROUP
```

| Metric | Condition | Meaning |
| --- | --- | --- |
| `connections_active` | > 80 % of the connection budget ([`database.md`](./database.md) §12) | Pool leak, too many replicas, or undersized tier |
| `cpu_percent` | avg > 80 % for 10 min | Slow queries before users notice |
| `storage_percent` | > 75 % | Autogrow is a cushion, not a plan |
| `connections_failed` | any sustained | Auth/firewall/TLS problem ([`troubleshooting.md`](./troubleshooting.md) §Database) |
| deadlocks | > 0 sustained | Contention — see [`../04-database-production.md`](../04-database-production.md) §8 |

**Verify:** fire a test alert by temporarily setting a threshold to `0` — you must receive the email/SMS within minutes, then set it back.

---

## 5. Action groups (who gets woken up)

**What:** an action group binds alert results to delivery channels — email first, SMS/push for severity.

```bash
az monitor action-group create -g "$RG" -n ag-acquisitionos \
  --short-name acqos \
  --action email admin email-ops@example.com \
  --action sms admin "+1-YOUR-PHONE"
```

**Expected output:** JSON with the group's `id`; reference that id in every alert rule (`--action ...` accepts the group name/id).

**Why both channels:** email alone is where on-call goes to die; SMS (or the mobile-app push action) is what actually wakes you. Route by severity: warnings → email, health-probe-failing / DB-down → SMS.

**Verify:** the test alert in §4 arrives on **every** channel configured.

---

## 6. Uptime / synthetic checks

**What:** an external probe that hits `GET https://app.yourdomain.com/api/health` from outside your stack, on a schedule.

Two Azure options:

- **Application Insights availability tests** (standard tests): Portal → App Insights → **Availability** → *Add Standard test* → URL `/api/health`, frequency 5 min, 2+ test locations. No Front Door required. (This is also the "health probe failing" alert source, §4.)
- **Front Door health probes** — only if you run the OPTIONAL edge: point the origin group's probe at `/api/health` ([`networking.md`](./networking.md) §6). Note what it proves: *Front Door's view of the origin* — it does not replace an external end-to-end test of your own domain.

**Why `/api/health` and nothing else:** it is the only unauthenticated health endpoint; `/api/health/detailed` + `/api/health/database` must stay out of public probes (they leak diagnostics — [`backend.md`](./backend.md) §2, [`security.md`](./security.md) §9).

**Verify:** the availability test shows green pings; pause the app (scale to 0 in staging) and confirm the alert fires.

---

## 7. Dashboards and workbooks

**What:** one screen with the five tiles you glance at: app replicas/CPU/memory, HTTP 5xx, DB connections/CPU/storage, availability test status, recent Error log count.

- **Azure dashboard (fastest):** Portal → Dashboard → pin each metric chart from the resource's **Metrics** pane.
- **Workbook (shareable, parameterized):** Portal → Monitor → **Workbooks** → create one with the KQL queries of §2 as chart tiles — handy as the team's single link.
- Self-hosted Grafana over the Log Analytics datasource is FUTURE/ALTERNATIVE — the repo's `monitoring/` folder documents a Prometheus+Grafana reference, but nothing in the app requires it.

**Verify:** a teammate opens the dashboard link and answers "is anything on fire?" in under 30 seconds.

---

## 8. Cost-visible monitoring

**What:** budgets + cost alerts so monitoring (and the app) never surprises the invoice. Created in [`prerequisites.md`](./prerequisites.md) §3: a budget on the subscription/resource group with alerts at **50/80/100 %**.

Recap + monitoring-specific costs to watch:

| Cost item | Typical driver | Watch it |
| --- | --- | --- |
| Log Analytics ingestion | chatty `LOG_LEVEL=debug` left on in prod | Workspace → Usage; keep `info` ([`backend.md`](./backend.md) §7) |
| App Insights | high trace volume | Sampling is the lever (app-side OTEL config) |
| Availability tests | frequency × locations | 5 min × 2 locations is plenty ([`../01-architecture.md`](../01-architecture.md) §2.3 heartbeats ≠ uptime checks) |
| Alert rules / action groups | cheap | Not a real line item at this scale |

**Verify:** Cost Management → Alerts shows the budget rules; a deliberately inflated threshold test reaches your inbox.

---

## 9. Audit trails (who did what)

**What:** two separate audit surfaces, both searchable:

1. **Activity Log** — control-plane events per resource: role assignments, Container App revisions, firewall-rule changes, DB restarts. Portal → Activity Log; export to Log Analytics for retention beyond 90 days.
2. **Key Vault diagnostics** — data-plane: *who read which secret, when*. Enable diagnostic settings to the same workspace:
   ```bash
   az monitor diagnostic-settings create \
     --name kv-audit --resource "$(az keyvault show -n "$KV" --query id -o tsv)" \
     --workspace "$(az monitor log-analytics workspace show -g "$RG" -n "$LAW" --query customerId -o tsv)" \
     --logs '[{"category":"AuditEvent","enabled":true}]'
   ```
   (Category names per Key Vault logging docs; `KeyVaultData`/`AuditEvent` naming varies by API version — NEEDS VERIFICATION per docs.)

**Why:** an unexplained revision change or a spike of secret reads is exactly what you grep during an incident (and [`security.md`](./security.md) §8 leans on it).

**Verify:** read one secret by hand, then query the workspace for the event — it appears within minutes.

---

## 10. Monitoring checklist

```text
[ ] Log Analytics wired (environment creation); trivial KQL query returns app logs
[ ] KQL queries saved: errors, cron outcomes, SSE-signal count
[ ] App Insights created (OPTIONAL); OTEL_* wired and verified via Live Metrics - or consciously deferred
[ ] Alerts: health/availability failing, 5xx rate, replicas near max, restart count, CPU/memory
[ ] DB alerts: connections_active, cpu_percent, storage_percent, connections_failed
[ ] Action group with email + SMS; test alert received on every channel
[ ] Availability test on /api/health from 2+ locations
[ ] Dashboard/workbook assembled and shared
[ ] Budget alerts 50/80/100% (prerequisites.md §3); Log ingestion volume sane
[ ] Activity Log + Key Vault diagnostics flowing to the workspace
```

## 11. Official Documentation

- Container Apps monitoring — https://learn.microsoft.com/azure/container-apps/observability
- Log Analytics / KQL — https://learn.microsoft.com/azure/azure-monitor/logs/log-analytics-tutorial
- Application Insights OpenTelemetry (endpoint + auth) — https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable
- Availability (standard) tests — https://learn.microsoft.com/azure/azure-monitor/app/availability
- Metric alerts + action groups — https://learn.microsoft.com/azure/azure-monitor/alerts/
- Key Vault logging — https://learn.microsoft.com/azure/key-vault/general/logging
- PostgreSQL Flexible Server monitoring — https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-monitoring
