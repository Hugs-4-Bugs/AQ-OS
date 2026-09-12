# AcquisitionOS — Monitoring Guide

Complete monitoring and observability documentation for AcquisitionOS. Covers metrics, dashboards, alerts, log aggregation, and capacity planning.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Metrics Reference](#2-metrics-reference)
3. [Dashboards](#3-dashboards)
4. [Alert Reference](#4-alert-reference)
5. [Log Aggregation](#5-log-aggregation)
6. [Custom Metrics](#6-custom-metrics)
7. [Debugging Performance](#7-debugging-performance)
8. [Capacity Planning](#8-capacity-planning)

---

## 1. Architecture

### Observability Stack

```
┌──────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                              │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Next.js  │  │ FastAPI  │  │ Celery   │  │  WebSocket   │    │
│  │ Frontend │  │ Backend  │  │ Workers  │  │   Service    │    │
│  │ :3000    │  │ :8000    │  │          │  │   :3003      │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘    │
│       │              │             │                │             │
│       └──────────┬───┴─────────────┴────────────────┘             │
│                  │                                                │
│                  ▼                                                │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              OpenTelemetry Collector (:4317/4318)          │   │
│  │  • Receives traces, metrics, logs from all services       │   │
│  │  • Processes, filters, and routes data                    │   │
│  └──────────┬────────────────────────────┬───────────────────┘   │
│             │                            │                        │
└─────────────┼────────────────────────────┼────────────────────────┘
              │                            │
              ▼                            ▼
┌──────────────────────┐     ┌──────────────────────────────────┐
│   Prometheus (:9090) │     │          Grafana (:3001)          │
│   • Scrapes metrics  │────▶│  • Dashboards                    │
│   • Evaluates alerts │     │  • Alert visualization           │
│   • Stores time-     │     │  • Data exploration              │
│     series data      │     └──────────────────────────────────┘
│   • 30-day retention │
└──────────┬───────────┘     ┌──────────────────────────────────┐
           │                 │       Alertmanager                │
           └────────────────▶│  • Deduplication                  │
                             │  • Grouping                       │
                             │  • Routing (Slack, PagerDuty,     │
                             │    Email)                         │
                             └──────────────────────────────────┘
```

### Monitoring Stack Components

| Component | Image | Port | Purpose |
|---|---|---|---|
| Prometheus | `prom/prometheus:latest` | 9090 | Metrics collection and alerting |
| Grafana | `grafana/grafana:latest` | 3001 | Dashboard and visualization |
| OTel Collector | `otel/opentelemetry-collector` | 4317/4318 | Telemetry collection and routing |
| Node Exporter | `prom/node-exporter` | 9100 | System metrics (CPU, RAM, disk) |
| Redis Exporter | `oliver006/redis_exporter` | 9121 | Redis metrics |
| PostgreSQL Exporter | `prometheuscommunity/postgres-exporter` | 9187 | PostgreSQL metrics |
| Alertmanager | `prom/alertmanager` | 9093 | Alert routing and deduplication |

### Configuration Files

| File | Purpose |
|---|---|
| `monitoring/docker-compose.monitoring.yml` | Monitoring stack Docker Compose |
| `monitoring/prometheus/prometheus.yml` | Prometheus scrape configuration |
| `monitoring/prometheus/alerts.yml` | 16 alert rules across 5 groups |
| `monitoring/grafana/datasources.yml` | Grafana datasource provisioning |
| `monitoring/grafana/dashboards/app-overview.json` | Application dashboard |
| `monitoring/grafana/dashboards/infrastructure.json` | Infrastructure dashboard |
| `monitoring/opentelemetry/otel-collector-config.yml` | OTel Collector config |

---

## 2. Metrics Reference

### Application Metrics

| Metric | Type | Labels | Description | Threshold |
|---|---|---|---|---|
| `http_requests_total` | Counter | `method`, `path`, `status`, `service` | Total HTTP requests | — |
| `http_request_duration_seconds` | Histogram | `method`, `path`, `service` | Request latency | P95 >2s warning, P99 >5s critical |
| `http_active_connections` | Gauge | `service` | Current active connections | — |
| `websocket_connections_active` | Gauge | — | Active WebSocket connections | — |
| `websocket_messages_total` | Counter | `direction`, `event_type` | WebSocket messages | — |

### Authentication Metrics

| Metric | Type | Labels | Description | Threshold |
|---|---|---|---|---|
| `auth_login_attempts_total` | Counter | `method`, `success` | Login attempts | >100 failures/min → brute force |
| `auth_signup_total` | Counter | `method`, `success` | Signup attempts | — |
| `auth_token_refresh_total` | Counter | `success` | Token refresh attempts | — |
| `auth_mfa_verifications_total` | Counter | `success` | MFA verification attempts | — |
| `auth_locked_accounts` | Gauge | — | Currently locked accounts | — |

### Database Metrics

| Metric | Type | Labels | Description | Threshold |
|---|---|---|---|---|
| `db_connection_pool_usage` | Gauge | — | Connection pool usage ratio | >0.9 warning, >0.95 critical |
| `db_query_duration_seconds` | Histogram | `operation`, `table` | Query duration | Mean >100ms → investigate |
| `db_active_connections` | Gauge | — | Active database connections | — |
| `db_slow_queries_total` | Counter | `operation` | Queries >1 second | >10/min → investigate |
| `pg_stat_database_size_bytes` | Gauge | `database` | Database size | — |
| `pg_stat_replication_lag_seconds` | Gauge | — | Replication lag | >60s → investigate |

### Redis Metrics

| Metric | Type | Labels | Description | Threshold |
|---|---|---|---|---|
| `redis_memory_used_bytes` | Gauge | — | Memory used | >85% of max → warning |
| `redis_memory_max_bytes` | Gauge | — | Max memory configured | — |
| `redis_connected_clients` | Gauge | — | Connected clients | — |
| `redis_commands_processed_total` | Counter | — | Commands processed | — |
| `redis_keyspace_hits_total` | Counter | — | Cache hits | Hit rate <80% → investigate |
| `redis_keyspace_misses_total` | Counter | — | Cache misses | — |
| `redis_connection_errors_total` | Counter | — | Connection errors | >10 in 5 min → critical |
| `redis_evicted_keys_total` | Counter | — | Keys evicted (memory pressure) | — |
| `redis_pubsub_channels` | Gauge | — | Active Pub/Sub channels | — |

### Celery Metrics

| Metric | Type | Labels | Description | Threshold |
|---|---|---|---|---|
| `celery_queue_length` | Gauge | `queue_name` | Pending tasks in queue | >1000 warning, >5000 critical |
| `celery_workers_active` | Gauge | — | Active worker count | <1 → critical |
| `celery_task_total` | Counter | `task_name`, `status` | Total tasks processed | — |
| `celery_task_failed_total` | Counter | `task_name` | Failed tasks | Failure rate >10% → warning |
| `celery_task_duration_seconds` | Histogram | `task_name` | Task execution duration | — |

### Business Metrics

| Metric | Type | Labels | Description | Threshold |
|---|---|---|---|---|
| `credits_deducted_total` | Counter | `action`, `plan` | Credits deducted | — |
| `credits_purchased_total` | Counter | `plan` | Credits purchased | — |
| `subscriptions_active` | Gauge | `plan`, `status` | Active subscriptions | — |
| `payments_processed_total` | Counter | `provider`, `status` | Payments processed | Failure rate >5% → alert |
| `leads_discovered_total` | Counter | `source` | Leads discovered | — |
| `leads_scored_total` | Counter | — | Leads scored | — |
| `emails_sent_total` | Counter | `channel`, `status` | Emails/messages sent | Bounce rate >10% → alert |
| `workflows_executed_total` | Counter | `trigger_type`, `status` | Workflows executed | — |
| `ai_api_calls_total` | Counter | `feature`, `provider` | AI API calls made | — |
| `ai_api_cost_dollars` | Gauge | `feature`, `provider` | AI API cost | — |

### Infrastructure Metrics

| Metric | Type | Labels | Description | Threshold |
|---|---|---|---|---|
| `node_cpu_seconds_total` | Counter | `mode` | CPU time in each mode | Idle <15% for 15 min → warning |
| `node_memory_MemAvailable_bytes` | Gauge | — | Available memory | <15% → warning |
| `node_filesystem_avail_bytes` | Gauge | `mountpoint` | Available disk space | <20% → warning, <10% → critical |
| `node_filesystem_size_bytes` | Gauge | `mountpoint` | Total disk space | — |
| `node_network_transmit_bytes_total` | Counter | `device` | Network bytes transmitted | — |
| `node_network_receive_bytes_total` | Counter | `device` | Network bytes received | — |

---

## 3. Dashboards

### Accessing Grafana

1. **URL**: `https://grafana.acquisitionos.com` (production) or `http://localhost:3001` (development)
2. **Default credentials**: `admin / admin` — **Change immediately on first login**
3. **Datasources**: Auto-provisioned from `monitoring/grafana/datasources.yml`

### App Overview Dashboard

**File**: `monitoring/grafana/dashboards/app-overview.json`

**Panels**:

| Panel | Metric | Visualization | Description |
|---|---|---|---|
| Request Rate | `rate(http_requests_total[5m])` | Time series | Requests per second by status code |
| Error Rate | `5xx / total * 100` | Gauge + Time series | Percentage of 5xx errors |
| Latency P50/P95/P99 | `histogram_quantile()` | Time series | Request latency percentiles |
| Active Users | `count(active sessions)` | Stat | Currently active users |
| API Endpoint Breakdown | `rate(http_requests_total[5m]) by path` | Table | Request rate per endpoint |
| Top Error Endpoints | `rate(http_requests_total{status=~"5.."}[5m])` | Bar chart | Endpoints with most errors |
| WebSocket Connections | `websocket_connections_active` | Stat + Time series | Active WS connections |
| Credits Usage | `rate(credits_deducted_total[1h])` | Time series | Credits consumption rate |
| AI API Calls | `rate(ai_api_calls_total[5m])` | Time series | AI API call rate |

**Interpretation Guide**:
- **Error rate spiking** → Check specific endpoints in the breakdown panel, correlate with deployments
- **Latency increasing** → Check if it's all endpoints or specific ones (may be DB or external API)
- **Request rate dropping** → May indicate upstream issues or DNS problems

### Infrastructure Dashboard

**File**: `monitoring/grafana/dashboards/infrastructure.json`

**Panels**:

| Panel | Metric | Visualization | Description |
|---|---|---|---|
| CPU Usage | `100 - idle * 100` | Time series | CPU usage per core |
| Memory Usage | `1 - available/total` | Gauge + Time series | Memory utilization |
| Disk Usage | `1 - avail/total` | Gauge per mount | Disk space per filesystem |
| Network I/O | `rate(transmit/receive)` | Time series | Network throughput |
| PostgreSQL Connections | `db_active_connections` | Time series | Active DB connections |
| PostgreSQL Size | `pg_stat_database_size_bytes` | Stat | Database size |
| Redis Memory | `redis_memory_used_bytes` | Time series | Redis memory usage |
| Redis Keyspace | `keyspace_hits / (hits + misses)` | Gauge | Cache hit rate |
| Celery Queue Length | `celery_queue_length` | Time series | Tasks pending per queue |
| Celery Workers | `celery_workers_active` | Stat | Active worker count |

### Creating a Custom Dashboard

1. Open Grafana → Dashboards → New Dashboard
2. Add panels with PromQL queries (see [Metrics Reference](#2-metrics-reference))
3. Set appropriate time range (default: last 1 hour)
4. Set auto-refresh interval (30 seconds for real-time, 5 minutes for overview)
5. Save and share with the team

---

## 4. Alert Reference

### Application Alerts

#### HighErrorRate

| Field | Value |
|---|---|
| **Condition** | `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05` for 5 min |
| **Severity** | Critical |
| **Impact** | >5% of requests failing — users experiencing errors |
| **Response** | 1. Check Grafana App Overview dashboard 2. Identify failing endpoints 3. Check recent deployments 4. Restart services or rollback |

#### ElevatedErrorRate

| Field | Value |
|---|---|
| **Condition** | Error rate >2% for 10 min |
| **Severity** | Warning |
| **Impact** | Some users experiencing errors |
| **Response** | 1. Monitor error rate trend 2. Check if isolated to specific endpoints 3. Review Sentry for new error groups |

#### HighLatencyP95

| Field | Value |
|---|---|
| **Condition** | `histogram_quantile(0.95, ...) > 2.0` for 5 min |
| **Severity** | Warning |
| **Impact** | 5% of requests taking >2 seconds |
| **Response** | 1. Check if specific endpoints are slow 2. Check database query performance 3. Check external API response times 4. Scale up if needed |

#### HighLatencyP99

| Field | Value |
|---|---|
| **Condition** | `histogram_quantile(0.99, ...) > 5.0` for 5 min |
| **Severity** | Critical |
| **Impact** | 1% of requests taking >5 seconds — very poor UX |
| **Response** | 1. Immediate investigation required 2. Check for resource exhaustion 3. Scale up frontend instances 4. Check for long-running AI requests |

#### APIEndpointDown

| Field | Value |
|---|---|
| **Condition** | `up{job=~"fastapi-backend|nextjs-app"} == 0` for 2 min |
| **Severity** | Critical |
| **Impact** | Service completely unavailable |
| **Response** | 1. SSH to server, `docker compose ps` 2. Check container logs 3. Restart failed containers 4. Check if Docker daemon is running |

### Database Alerts

#### DatabaseConnectionPoolExhaustion

| Field | Value |
|---|---|
| **Condition** | `db_connection_pool_usage > 0.9` for 5 min |
| **Severity** | Warning |
| **Impact** | Connection pool near capacity, some queries may fail |
| **Response** | 1. Check active queries: `SELECT * FROM pg_stat_activity;` 2. Identify long-running queries 3. Kill stuck queries if needed 4. Consider increasing pool size |

#### DatabaseConnectionPoolExhausted

| Field | Value |
|---|---|
| **Condition** | `db_connection_pool_usage > 0.95` for 2 min |
| **Severity** | Critical |
| **Impact** | Connection pool exhausted — new queries rejected |
| **Response** | 1. Kill idle connections immediately 2. Restart application to reset pool 3. Investigate connection leak |

### Redis Alerts

#### RedisDown

| Field | Value |
|---|---|
| **Condition** | `up{job="redis"} == 0` for 2 min |
| **Severity** | Critical |
| **Impact** | No cache, no sessions, no task queue — widespread impact |
| **Response** | 1. `docker compose restart redis` 2. Check disk space (Redis may fail to write RDB) 3. Check memory limits 4. If persistent failure, restore from RDB backup |

#### RedisConnectionFailures

| Field | Value |
|---|---|
| **Condition** | `increase(redis_connection_errors_total[5m]) > 10` |
| **Severity** | Critical |
| **Impact** | Application having trouble connecting to Redis |
| **Response** | 1. Check Redis password matches in `.env` 2. Check `maxclients` configuration 3. Restart Redis |

#### RedisMemoryUsageHigh

| Field | Value |
|---|---|
| **Condition** | `redis_memory_used_bytes / redis_memory_max_bytes > 0.85` for 10 min |
| **Severity** | Warning |
| **Impact** | Redis may start evicting keys, increased cache misses |
| **Response** | 1. Check which keys are using memory: `redis-cli --bigkeys` 2. Clear unnecessary cache keys 3. Increase `maxmemory` if needed |

### Celery Alerts

#### CeleryQueueBacklog

| Field | Value |
|---|---|
| **Condition** | `celery_queue_length > 1000` for 10 min |
| **Severity** | Warning |
| **Impact** | Background tasks delayed, emails/notifications may be slow |
| **Response** | 1. Scale up Celery workers 2. Check Flower for stuck tasks 3. Identify which queue is backlogged |

#### CeleryQueueBacklogCritical

| Field | Value |
|---|---|
| **Condition** | `celery_queue_length > 5000` for 15 min |
| **Severity** | Critical |
| **Impact** | Severe task backlog, payments may not process |
| **Response** | 1. Scale workers to 4+ 2. Check for failed tasks blocking queue 3. Consider purging low-priority queues |

#### CeleryWorkerDown

| Field | Value |
|---|---|
| **Condition** | `celery_workers_active < 1` for 5 min |
| **Severity** | Critical |
| **Impact** | No background processing — emails, billing, workflows stopped |
| **Response** | 1. `docker compose restart celery-worker` 2. Check worker logs for crash cause 3. Verify Redis connectivity |

### Infrastructure Alerts

#### DiskSpaceWarning / DiskSpaceCritical

| Field | Value |
|---|---|
| **Condition** | Available disk <20% (warning) / <10% (critical) |
| **Impact** | Risk of disk full → services crash |
| **Response** | 1. Clean old logs: `find /var/log -name "*.log" -mtime +7 -delete` 2. Clean old backups beyond retention 3. Clean Docker: `docker system prune -af` 4. Expand disk if needed |

#### MemoryPressureWarning / MemoryPressureCritical

| Field | Value |
|---|---|
| **Condition** | Memory usage >85% (warning) / >95% (critical) |
| **Impact** | OOM kills may occur, services become unstable |
| **Response** | 1. Identify memory-hungry processes: `ps aux --sort=-%mem | head -20` 2. Restart heaviest service 3. Scale up or add RAM 4. Check for memory leaks in application |

#### HighCPUUsage

| Field | Value |
|---|---|
| **Condition** | CPU >85% for 15 min |
| **Severity** | Warning |
| **Impact** | Performance degradation |
| **Response** | 1. Identify CPU-heavy processes: `top` 2. Scale up instances 3. Check for infinite loops or heavy computations 4. Optimize hot code paths |

---

## 5. Log Aggregation

### Accessing Application Logs

```bash
# Docker Compose logs (primary method)
docker compose logs frontend --tail=100 -f
docker compose logs backend --tail=100 -f
docker compose logs celery-worker --tail=100 -f

# Specific service logs
docker compose logs redis --tail=50
docker compose logs postgres --tail=50

# Filter by time
docker compose logs frontend --since 1h
docker compose logs frontend --since "2024-01-15T10:00:00"

# Search logs
docker compose logs frontend | rg "ERROR"
docker compose logs backend | rg "traceback" -i
```

### Log Levels

| Level | Usage | Example |
|---|---|---|
| `error` | Unexpected failures requiring attention | Database connection lost, payment processing failed |
| `warn` | Potential issues that don't break functionality | High memory usage, slow query, rate limit approaching |
| `info` | Normal operational events | User login, payment processed, workflow triggered |
| `debug` | Detailed diagnostic information | Request/response bodies, query details |

### Structured Logging

Application logs follow a structured format:

```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "info",
  "service": "frontend",
  "method": "POST",
  "path": "/api/leads",
  "status": 201,
  "duration_ms": 234,
  "userId": "usr_abc123",
  "requestId": "req_xyz789"
}
```

### Loki (Log Aggregation)

If Loki is deployed (optional):

1. **Access**: Grafana → Explore → Loki datasource
2. **Query examples**:
   ```logql
   # All errors from frontend
   {service="frontend"} |= "error" | json | level="error"

   # Slow requests
   {service="frontend"} | json | duration_ms > 1000

   # Payment-related logs
   {service="backend"} |= "payment"

   # Specific user's activity
   {service="frontend"} | json | userId="usr_abc123"
   ```

---

## 6. Custom Metrics

### Adding a New Metric

#### Step 1: Define the Metric

In `src/lib/observability/metrics-collector.ts`:

```typescript
// Counter — for tracking counts (requests, events)
const myCounter = new Counter({
  name: 'acquisitionos_custom_events_total',
  help: 'Total custom events processed',
  labelNames: ['event_type', 'source'],
});

// Histogram — for tracking distributions (latency, sizes)
const myHistogram = new Histogram({
  name: 'acquisitionos_custom_duration_seconds',
  help: 'Duration of custom operations',
  labelNames: ['operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

// Gauge — for tracking current values (queue depth, connections)
const myGauge = new Gauge({
  name: 'acquisitionos_custom_active_jobs',
  help: 'Currently active custom jobs',
  labelNames: ['job_type'],
});
```

#### Step 2: Instrument the Code

```typescript
// Increment a counter
myCounter.inc({ event_type: 'lead_discovered', source: 'web_search' });

// Observe a duration
const end = myHistogram.startTimer({ operation: 'ai_scoring' });
try {
  await performScoring(lead);
} finally {
  end(); // Records the duration
}

// Set a gauge value
myGauge.set({ job_type: 'discovery' }, activeJobs.length);
```

#### Step 3: Expose via Metrics Endpoint

The `/api/metrics` endpoint automatically exposes all registered metrics. No additional configuration needed if using the Prometheus client.

#### Step 4: Add Prometheus Scrape Config

In `monitoring/prometheus/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'acquisitionos-frontend'
    metrics_path: /api/metrics
    static_configs:
      - targets: ['frontend:3000']
```

#### Step 5: Add Grafana Dashboard Panel

1. Open Grafana → Dashboard → Edit
2. Add Panel → Query: `rate(acquisitionos_custom_events_total[5m])`
3. Configure visualization and thresholds
4. Save dashboard

#### Step 6: Add Alert (if needed)

In `monitoring/prometheus/alerts.yml`:

```yaml
- alert: CustomEventRateAnomaly
  expr: rate(acquisitionos_custom_events_total[5m]) > 100
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Custom event rate anomaly detected"
    description: "Event rate is {{ $value }}/s, which exceeds the 100/s threshold."
```

### Metric Naming Convention

| Pattern | Example | Usage |
|---|---|---|
| `acquisitionos_<name>_total` | `acquisitionos_payments_processed_total` | Counters (cumulative) |
| `acquisitionos_<name>_seconds` | `acquisitionos_request_duration_seconds` | Histograms (time) |
| `acquisitionos_<name>_bytes` | `acquisitionos_response_size_bytes` | Histograms (size) |
| `acquisitionos_<name>` | `acquisitionos_active_connections` | Gauges (current value) |

---

## 7. Debugging Performance

### Step-by-Step Performance Investigation

#### Step 1: Identify the Problem

```
What is slow?  → API responses? Page loads? Background jobs?
When is it slow? → Always? Peak hours? After deployment?
How slow? → 2x slower? 10x? Complete timeout?
```

#### Step 2: Check the Dashboard

1. Open Grafana → App Overview
2. Check error rate — is it elevated?
3. Check latency P50/P95/P99 — where is the bottleneck?
4. Check if it's all endpoints or specific ones

#### Step 3: Database Investigation

```bash
# Check for slow queries
docker compose exec postgres psql -U postgres -c "
  SELECT query, calls, total_exec_time, mean_exec_time, max_exec_time
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 20;
"

# Check for locks
docker compose exec postgres psql -U postgres -c "
  SELECT locktype, relation::regclass, mode, pid, query, query_start
  FROM pg_locks l
  JOIN pg_stat_activity a ON l.pid = a.pid
  WHERE NOT l.granted;
"

# Check for idle transactions
docker compose exec postgres psql -U postgres -c "
  SELECT pid, state, query, query_start
  FROM pg_stat_activity
  WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')
  AND query_start < now() - interval '5 minutes';
"

# Check table sizes
docker compose exec postgres psql -U postgres -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 20;
"
```

#### Step 4: Redis Investigation

```bash
# Check memory usage
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO memory

# Check slow log
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" SLOWLOG GET 20

# Check key count by pattern
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" --scan --pattern "acos:*" | \
  awk -F: '{print $1":"$2}' | sort | uniq -c | sort -rn | head -20

# Check client list
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" CLIENT LIST
```

#### Step 5: Application Investigation

```bash
# Check Node.js memory
docker compose exec frontend node -e "console.log(process.memoryUsage())"

# Check event loop lag
# Look for "EVENT_LOOP_LAG" in application metrics

# Check for memory leaks
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"

# Profile CPU (if extreme)
docker compose exec frontend node --prof app.js
```

#### Step 6: Network Investigation

```bash
# Check DNS resolution
time nslookup api.stripe.com

# Check external API latency
time curl -s -o /dev/null https://api.stripe.com/v1/balance \
  -H "Authorization: Bearer $STRIPE_SECRET_KEY"

# Check inter-service connectivity
docker compose exec frontend curl -s -o /dev/null -w "%{http_code} %{time_total}s" \
  http://backend:8000/health
```

### Common Performance Issues

| Symptom | Likely Cause | Fix |
|---|---|---|
| Slow API responses | Missing DB index | Add index, check query plan |
| High memory usage | Memory leak in app | Restart, investigate heap |
| Growing queue depth | Insufficient workers | Scale up Celery workers |
| Cache miss rate high | Cache TTL too short | Increase TTL, check eviction |
| Slow page loads | Large bundle size | Code splitting, lazy loading |
| Intermittent 502s | Nginx timeout | Increase proxy timeout |
| High DB connections | Connection leak | Fix code, reduce pool size |

---

## 8. Capacity Planning

### Reading Metrics for Planning

#### Current Capacity

```bash
# Check current resource usage
docker stats --no-stream

# Check database size growth
docker compose exec postgres psql -U postgres -c "
  SELECT date_trunc('day', now()) as day,
         pg_size_pretty(pg_database_size('acquisitionos')) as db_size;
"

# Check growth rate (compare with previous weeks)
# In Grafana: Infrastructure Dashboard → Database Size panel
```

#### Growth Projections

| Metric | Current | Growth Rate | 3-Month Projection | 6-Month Projection |
|---|---|---|---|---|
| Users | — | ~10%/month | 1.3x current | 1.8x current |
| Database size | — | ~5%/month | 1.16x current | 1.35x current |
| API requests/min | — | ~8%/month | 1.26x current | 1.6x current |
| Storage (S3) | — | ~3%/month | 1.09x current | 1.19x current |

#### Scaling Thresholds

| Resource | Current | Warning | Scale Up | Action |
|---|---|---|---|---|
| CPU | — | 60% sustained | 70% sustained | Add instance or upgrade |
| RAM | — | 70% sustained | 80% sustained | Add RAM or upgrade |
| Disk | — | 70% used | 80% used | Expand disk or clean up |
| DB Connections | — | 60% of pool | 80% of pool | Increase pool or optimize |
| Redis Memory | — | 70% of max | 80% of max | Increase maxmemory or clean |
| Celery Queue | — | 500 sustained | 1000 sustained | Add workers |

### Capacity Checklist (Monthly)

1. [ ] Review CPU/memory trends in Grafana
2. [ ] Check database size and growth rate
3. [ ] Verify backup storage has room for 30 more days
4. [ ] Check S3 storage usage and costs
5. [ ] Review Celery queue depth trends
6. [ ] Verify Redis memory is not approaching limits
7. [ ] Check if any services need vertical or horizontal scaling
8. [ ] Review AI API cost trends
9. [ ] Verify SSL certificate expiration dates
10. [ ] Test backup restoration

### Cost Optimization

| Area | Optimization | Savings |
|---|---|---|
| Compute | Right-size instances based on actual usage | 20-40% |
| Database | Use read replicas for heavy read workloads | 15-30% |
| Redis | Reduce TTL for less-critical cache entries | 10-20% |
| S3 | Use S3 Glacier for old backups | 60-80% |
| AI API | Cache AI responses, use cheaper models for simple tasks | 20-50% |
| Monitoring | Reduce Prometheus retention for non-critical metrics | 10-15% |
