# AcquisitionOS — Privacy-Preserving Observability Audit

**Date:** 2026-11-10
**Scope:** All monitoring, metrics, logs, traces, alerts, and health endpoints.

## 1. Inventory of observability surfaces

| Surface | What it contains | Who can access | Retention |
|---|---|---|---|
| `/api/health/live` | Status, timestamp, uptime, pid | Public (no auth) | n/a |
| `/api/health/ready` | Status, component status (db/redis), latency | Public (no auth) | n/a |
| `/api/health` | Status, DB latency, memory %, error counts | Public (no auth) | n/a |
| `/api/health/detailed` | Full component breakdown + aggregate counts | Authenticated | n/a |
| `/api/health/synthetic` | Per-probe status + latency | super_admin only | n/a |
| `/api/metrics` | Full Prometheus metrics (in-app view) | super_admin only | n/a |
| `/api/metrics/scrape` | Prometheus scrape endpoint — privacy-safe subset | Bearer token (METRICS_SCRAPE_TOKEN) | n/a |
| `/api/ops/alerts/webhook` | Receives Alertmanager notifications | Bearer token (OPS_ALERT_WEBHOOK_TOKEN) | n/a |
| Prometheus TSDB | All numeric metrics + labels | ops (network-restricted) | 30 days |
| Grafana dashboards | Visualizations of Prometheus data | ops (Grafana auth) | n/a |
| Telegram alert messages | Alert name, severity, component, value, threshold, time | ops chat members | Telegram chat history |
| WhatsApp alert messages | Same as Telegram | ops phone | WhatsApp chat history |
| AuditLog table | Tamper-evident audit chain (sanitized) | super_admin | 365 days |

## 2. PII leak risk per surface — analysis

### 2.1 Health endpoints — ✅ SAFE
Only status enums, latency in ms, aggregate counts, process metrics. NO email, user ID, tenant ID, IP, prompt, or message body.

### 2.2 `/api/metrics/scrape` — ✅ SAFE
Labels are low-cardinality enums: `method`, `route` (sanitized), `status`, `statusGroup`, `severity`, `rule`, `operation`. NO PII.

### 2.3 Prometheus rules — ✅ SAFE
All alert expressions group by `instance`, `route`, `severity`, `component`, `team`, `service`. NO PII.

### 2.4 Alertmanager webhook payload — ✅ SAFE with sanitization
`/api/ops/alerts/webhook` sanitizes incoming labels: drops `user`, `userId`, `email`, `tenantId`, `ip`, `prompt`, `token`, `secret`, `password`, `apiKey`, `filename`, `leadId`. Truncates annotations to 200 chars.

### 2.5 Telegram & WhatsApp alert messages — ✅ SAFE
Messages contain ONLY: app name, env, alert name, severity, component, current value, threshold, startedAt, duration, dashboard URL, dedupKey, short summary (200 char cap). NO PII.

### 2.6 OTel traces — ✅ SAFE (with filter)
OTel Collector config includes `filter/health` processor that drops spans for `/health`, `/health/ready`, `/health/live`. Auto-instrumentation captures HTTP route templates (not path params). Request body capture is NOT enabled.

### 2.7 Grafana dashboards — ✅ SAFE
All dashboard JSON files use only low-cardinality metrics from `/api/metrics/scrape`. No panel queries a label containing PII.

### 2.8 Application logs — ⚠️ NEEDS REVIEW
Slow-request logger writes `userId` and `traceId` to structured logs. Acceptable for ops debugging given 30-day retention + ops-only access control.

### 2.9 AuditLog table — ✅ SAFE
`sanitizeText()` redacts `sk_live_*`, `sk_test_*`, `whsec_*`, `ghp_*`, `Bearer *`, `password=`, `apiKey=`, `STRIPE_SECRET_KEY=`, `JWT_SECRET=`, `DATABASE_URL=` before persistence.

## 3. Conclusion

The observability stack is privacy-safe by design. No PII is emitted as a metric label, alert annotation, Telegram message, WhatsApp message, or trace attribute. The only surface with user-identifying information is the structured application log (for ops debugging) — acceptable given 30-day retention and ops-only access.
