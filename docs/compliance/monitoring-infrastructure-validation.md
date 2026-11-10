# AcquisitionOS — Monitoring Infrastructure Security Validation

**Date:** 2026-11-10

## Security fixes applied in Milestone E

### 1. Grafana default password removed

**Before:** `GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:-acos-grafana-admin}`
— defaulted to the well-known insecure password `acos-grafana-admin` if env var was not set.

**After:** `GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD must be set — no insecure default}`
— if `GRAFANA_ADMIN_PASSWORD` is not set, Grafana fails to start with a clear error message. No insecure default.

**File:** `monitoring/docker-compose.monitoring.yml` line 82

### 2. Grafana port not exposed by default

**Before:** `ports: ["3001:3000"]` — Grafana was publicly accessible on host port 3001.

**After:** Port mapping commented out. Grafana is accessible only via the internal Docker `monitoring` network. Access via:
- Reverse proxy (nginx) with auth, OR
- SSH tunnel: `ssh -L 3001:localhost:3000 user@host`

For local dev, uncomment the ports block and set `GRAFANA_ADMIN_PASSWORD`.

**File:** `monitoring/docker-compose.monitoring.yml` lines 76-77

### 3. OTel Collector ports not exposed by default

**Before:** Ports 4317 (gRPC), 4318 (HTTP), 8888, 8889 were exposed to the host.

**After:** All ports commented out. The app pushes OTLP to the collector via the internal `monitoring` network only.

**File:** `monitoring/docker-compose.monitoring.yml` lines 113-121

### 4. Node exporter port not exposed

**Before:** Port 9100 exposed to host.

**After:** Port commented out. Prometheus scrapes via internal network.

**File:** `monitoring/docker-compose.monitoring.yml` lines 139-142

### 5. Redis exporter port not exposed

**Before:** Port 9121 exposed to host.

**After:** Port commented out. Prometheus scrapes via internal network.

**File:** `monitoring/docker-compose.monitoring.yml` lines 162-165

## Network topology

All monitoring services share the `monitoring` Docker network:
```
monitoring (bridge network)
├── prometheus      (scrapes targets via internal network)
├── alertmanager    (receives alerts from prometheus, sends webhook to app)
├── grafana         (queries prometheus via internal network)
├── otel-collector  (receives OTLP from app via internal network)
├── node-exporter   (scraped by prometheus via internal network)
└── redis-exporter  (scraped by prometheus via internal network)
```

The app container must be on the same Docker network (or a network that can route to `monitoring`) for:
- Prometheus to scrape `frontend:3000/api/metrics/scrape`
- Alertmanager to send webhooks to `frontend:3000/api/ops/alerts/webhook`
- App to push OTLP to `otel-collector:4318`

## Prometheus target reachability

All targets in `deploy/prometheus/prometheus.yml` use Docker service names:
- `frontend:3000` — app (must be on same network or routable)
- `node-exporter:9100` — internal
- `redis-exporter:9121` — internal
- `postgres-exporter:9187` — internal (if Postgres is used)
- `nginx-exporter:9113` — internal (if nginx is used)
- `realtime-service:3003` — internal
- `otel-collector:8888` — internal
- `alertmanager:9093` — internal
- `localhost:9090` — prometheus self

**External validation required:** run `docker compose -f monitoring/docker-compose.monitoring.yml up -d` in a non-production environment and verify all targets show as `UP` in Prometheus at `http://localhost:9090/targets`.

## Alert rule validation

21 alert rules across 9 groups in `deploy/prometheus/alerts.yml`:
- **CPU:** HighCpuUsage (>75% sustained 5m, warning), CriticalCpuUsage (>90% sustained 5m, critical)
- **Memory:** HighMemoryUsage (>85%, warning), CriticalMemoryUsage (>95%, critical)
- **Disk:** LowDiskSpace (>85%, warning), CriticalDiskSpace (>95%, critical)
- **API:** HighErrorRate (5xx >5%, critical), HighLatencyP95 (>2s, warning), CriticalLatencyP99 (>5s, critical)
- **App:** AppDown (no scrape for 3m, critical)
- **Database:** DatabaseSlowQuery (p95 >1s, warning), PostgresExporterDown (warning), PostgresConnectionPoolWarning (>70%, warning)
- **Redis:** RedisDown (critical), RedisHighMemory (>85%, warning)
- **Queue:** QueueBacklogGrowing (>100 for 15m, warning), QueueBacklogCritical (>500 for 5m, critical)
- **AI:** AICostSpike (>$10/hr, warning)
- **Security:** AuthEndpointFailures (>0.5 5xx/s, critical)
- **Monitoring:** MonitoringStale (no scrape for 1hr, warning)
- **Certificate:** CertificateExpiringSoon (<14d, warning)

**External validation required:** `promtool check rules deploy/prometheus/alerts.yml` (promtool not available in sandbox).

## Alertmanager config validation

`monitoring/alertmanager/alertmanager.yml`:
- Routes critical → webhook + email fallback
- Routes warning → webhook only
- Routes info → null (suppressed)
- `group_by: [alertname, severity, component]`
- `group_wait: 10s` (critical) / `60s` (warning)
- `repeat_interval: 1h` (critical) / `4h` (warning)
- Inhibition: critical suppresses warning for same alertname+component

**External validation required:** `amtool check-config monitoring/alertmanager/alertmanager.yml` (amtool not available in sandbox).

## Monitoring secrets

- `monitoring/secrets/` is gitignored (except `.gitkeep` and `*.example`)
- `monitoring/secrets/metrics_scrape_token` — must be populated with the same value as `METRICS_SCRAPE_TOKEN` env var on the app side. Generate with `openssl rand -hex 32`.
- No secrets are committed to the repository.

## CPU alert thresholds verification

- **Warning:** `(1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) by (instance)) * 100 > 75` for `5m` — fires when CPU is sustained above 75% for 5 minutes. ✅
- **Critical:** same expression `> 90` for `5m` — fires when CPU is sustained above 90% for 5 minutes. ✅
- Both use `for: 5m` to prevent single-scrape flapping. ✅
- Both have `runbook_url` annotations pointing to `docs/runbooks/`. ✅

## Platform metric availability

The alerts depend on `node_cpu_seconds_total`, `node_memory_MemAvailable_bytes`, `node_filesystem_avail_bytes` — all provided by `node-exporter`. If the hosting platform does not expose these metrics (e.g. serverless platforms like Vercel/AWS Lambda), the CPU/memory/disk alerts will not fire. In that case:
- Use platform-native metrics (e.g. AWS CloudWatch for ECS, Vercel metrics API)
- The `process_heap_used_bytes` and `process_rss_bytes` gauges from the app's `/api/metrics/scrape` endpoint work regardless of platform (they come from `process.memoryUsage()`).

**Hosting platform note:** the current deployment is a Next.js standalone monolith (per `Dockerfile`). If deployed on a container platform (Docker, ECS, k8s), node-exporter works. If deployed on serverless (Vercel, AWS Lambda), node-exporter is not applicable — use platform metrics instead.
