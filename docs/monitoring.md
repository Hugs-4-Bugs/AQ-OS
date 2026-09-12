# AcquisitionOS Monitoring & Observability Guide

## Architecture Overview

AcquisitionOS implements a comprehensive, built-in observability stack without external dependencies like Sentry, Datadog, or New Relic. All monitoring runs within the application process.

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    Observability Stack                    │
├──────────────┬──────────────┬───────────────────────────┤
│   Logger     │  API Monitor │    Alert Engine           │
│  (JSON)      │  (Metrics)   │    (Rules-based)          │
├──────────────┼──────────────┼───────────────────────────┤
│   Tracer     │  Metrics     │    Sentry (No-op)         │
│  (Spans)     │  Collector   │    (Fallback)             │
│              │  (Prometheus)│                            │
└──────────────┴──────────────┴───────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │  Dashboard  │
                    │  API + UI   │
                    └─────────────┘
```

### File Structure

```
src/lib/observability/
├── index.ts              # Barrel export
├── logger.ts             # Structured JSON logger
├── api-monitor.ts        # API performance monitoring
├── metrics-collector.ts  # Prometheus-compatible metrics
├── sentry.ts             # Sentry no-op fallback
├── alerts.ts             # Alert rules and engine
├── tracer.ts             # Request tracing and spans
└── middleware.ts         # API route monitoring middleware
```

## Available Metrics

### Counters
| Metric | Description |
|--------|-------------|
| `api_requests_total` | Total API requests by method, route, status |
| `credits_consumed_total` | Total credits consumed |
| `workflow_executions_total` | Total workflow executions |
| `ai_requests_total` | Total AI API requests |
| `ai_cost_total` | Total AI cost in USD |
| `payment_failures_total` | Total payment failures |
| `payment_success_total` | Total successful payments |
| `anomaly_alerts_total` | Total anomaly alerts triggered |
| `competitor_scans_total` | Total competitor scans |

### Histograms
| Metric | Description | Buckets |
|--------|-------------|---------|
| `api_request_duration_seconds` | API request duration | 5ms → 10s |
| `workflow_duration_seconds` | Workflow execution duration | 100ms → 10min |
| `db_query_duration_seconds` | Database query duration | 1ms → 1s |
| `redis_operation_duration_seconds` | Redis operation duration | 1ms → 500ms |

### Gauges
| Metric | Description |
|--------|-------------|
| `active_users` | Number of active users |
| `credits_remaining` | Credits remaining across all users |
| `queue_depth` | Current queue depth (running workflows) |
| `websocket_connections` | Current WebSocket connections |

## Alert Rules and Thresholds

| Rule | Severity | Threshold | Cooldown |
|------|----------|-----------|----------|
| High Error Rate | Critical | >5% error rate (min 10 requests) | 5 min |
| Slow Response Time | High | >2s average response time (min 5 requests) | 5 min |
| Database Connection Failure | Critical | >10% of requests are 5xx | 1 min |
| High Memory Usage | High | >85% heap usage | 5 min |
| Critical Memory Usage | Critical | >95% heap usage | 1 min |
| Credit System Anomaly | Medium | >1000 credits consumed per session | 10 min |
| API Latency Spike | High | >5s P95 response time | 3 min |
| Zero Request Volume | Low | 0 req/min (was previously active) | 10 min |

### Alert Lifecycle

1. **Evaluation**: Every 30 seconds, all rules are evaluated
2. **Firing**: If a rule's condition is met, an alert fires
3. **Cooldown**: The same alert won't re-fire during the cooldown period
4. **Resolution**: When the condition is no longer met, the alert resolves
5. **History**: All fired and resolved alerts are stored in memory

## Dashboard Access

The observability dashboard is accessible via:

1. **Settings Panel**: Navigate to Settings → Monitoring
2. **API Endpoint**: `GET /api/metrics/dashboard` (returns JSON)
3. **Prometheus Endpoint**: `GET /api/metrics` (Prometheus text format)

### Dashboard Sections

- **System Health**: CPU, memory, uptime, RSS
- **API Performance**: Request rates, error rates, response times, status codes
- **Database**: Query counts, slow queries, operation breakdown, connection pool
- **Business Metrics**: Active users, leads, deals, credits, workflows
- **Alerts**: Active alerts, alert history, severity breakdown
- **Recent Logs**: Last 30 log entries with level filtering
- **Traces**: Recent request traces with span details

### Auto-Refresh

The dashboard auto-refreshes every 30 seconds. Manual refresh is available via the Refresh button.

## Logging

### Log Levels

| Level | Use Case | Priority |
|-------|----------|----------|
| `debug` | Verbose debugging info | 0 |
| `info` | Normal operational messages | 1 |
| `warn` | Warning conditions | 2 |
| `error` | Error conditions | 3 |

### Configuration

- `LOG_LEVEL` environment variable: Set minimum log level (default: `debug` in dev, `info` in prod)
- In production, logs output as structured JSON to stdout/stderr
- In development, logs output in human-readable colored format

### Rate Limiting

Error logs are rate-limited to 10 occurrences per minute per error message to prevent log flooding.

### Log Buffer

The logger maintains an in-memory buffer of the last 500 log entries, accessible via the dashboard API.

## Request Tracing

### Trace ID Propagation

Every API request generates a trace ID that is:
1. Created from `X-Trace-Id` header or auto-generated
2. Propagated to all child spans
3. Included in log entries as context
4. Returned in response headers as `X-Trace-Id`

### Span Types

| Type | Usage | Example |
|------|-------|---------|
| HTTP | API requests | `HTTP GET /api/leads` |
| DB | Database queries | `db:SELECT`, `db:INSERT` |
| AI | AI operations | `ai:lead_analysis`, `ai:outreach_generation` |

### Using Tracing in Code

```typescript
import { traceAsync, startSpan, endSpan } from '@/lib/observability';

// Automatic span wrapping
const result = await traceAsync('process-leads', async () => {
  // your code
});

// Manual span control
const span = startSpan('custom-operation', { 'custom.tag': 'value' });
try {
  // your code
  endSpan(span, 'ok');
} catch {
  endSpan(span, 'error');
}
```

## API Route Monitoring

### Using the Middleware

```typescript
import { withMonitoring } from '@/lib/observability';

// Wrap your route handler
export const GET = withMonitoring(async (request) => {
  // your handler
  return NextResponse.json({ data: 'example' });
}, '/api/your-route');
```

### Response Headers

Monitored routes add these headers:
- `X-Trace-Id`: The trace ID for this request
- `X-Response-Time`: Request processing time in milliseconds

## Database Monitoring

### Slow Query Detection

Queries exceeding 100ms are automatically:
- Logged with a warning
- Recorded in the slow query buffer (last 50)
- Tracked in the metrics collector histogram

### Query Statistics

The following statistics are tracked:
- Total query count
- Slow query count
- Average query time
- Query breakdown by operation type (SELECT, INSERT, UPDATE, DELETE)
- Per-operation average time

## Troubleshooting

### Dashboard Shows No Data

1. Verify the dev server is running
2. Check `/api/health/detailed` returns `healthy`
3. Ensure the observability modules are imported at startup

### High Memory Usage Alert

1. Check the memory card in the dashboard
2. Review recent log entries for memory-related warnings
3. Restart the application if memory doesn't stabilize

### Slow Queries

1. Check the Database section in the dashboard
2. Review recent slow queries
3. Consider adding database indexes for frequently queried fields
4. Use `db.$queryRaw` sparingly — prefer Prisma's built-in query builder

### Missing Metrics

1. Ensure `metrics-collector.ts` is imported in the routes you want to monitor
2. Check that the Prometheus endpoint (`/api/metrics`) returns data
3. Verify metrics are being recorded by checking `getMetrics()` output

### Alert Not Firing

1. Check that the alert engine has started (it starts automatically)
2. Verify the condition threshold is being met
3. Check cooldown period — alerts won't re-fire during cooldown
4. Review alert history in the dashboard for previous firings
