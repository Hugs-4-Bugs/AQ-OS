# AcquisitionOS — Load, Spike, Stress & Failure Test Plan

**Environment:** explicitly approved non-production environment only.
**Tool:** k6 by Grafana Labs.

## 1. SLOs, SLIs, error budgets

### Service-level indicators (SLIs)

| SLI | Definition | Source metric |
|---|---|---|
| Availability | Fraction of HTTP requests returning non-5xx | `1 - sum(rate(api_requests_total{status=~"5.."}[5m])) / sum(rate(api_requests_total[5m]))` |
| Latency p95 | 95th-percentile API response time | `histogram_quantile(0.95, ...)` |
| Latency p99 | 99th-percentile API response time | `histogram_quantile(0.99, ...)` |
| Queue drain time | Time for `total_queue_backlog` to drop from peak to <50 | Manual observation |

### Service-level objectives (SLOs)

| SLO | Target | Window |
|---|---|---|
| Availability | ≥ 99.5% | 30-day rolling |
| p95 latency | ≤ 800 ms | 5-min window |
| p99 latency | ≤ 2.5 s | 5-min window |
| Queue drain time | ≤ 10 min from peak | per spike |

### Error budget
- Availability 99.5% over 30 days = 3.6 hours of allowed downtime.
- Fast burn: 2% budget in 1 hour → page immediately.
- Slow burn: 10% budget in 6 hours → ticket.

### RTO / RPO

| Objective | Target |
|---|---|
| RTO (recovery time) | ≤ 1 hour for P1, ≤ 4 hours for P2 |
| RPO (recovery point) | ≤ 1 hour for P1, ≤ 24 hours for P2 |

## 2. Test scenarios

### Scenario A — Normal load (baseline)
- **VUs:** 50, **Duration:** 10 min, **Ramp:** 2 min
- **k6 script:** `scripts/load-tests/a-normal-load.js`
- **Pass:** Availability ≥99.9%, p95 ≤500ms, p99 ≤1.5s, no 5xx, no memory growth >50MB

### Scenario B — Gradually increasing load
- **Stages:** 100 → 200 → 400 → 800 VUs (each 3 min)
- **k6 script:** `scripts/load-tests/b-ramp-up.js`
- **Pass:** Identify VU count at which p95 crosses 800ms and 5xx rate exceeds 1%

### Scenario C — Sudden traffic spike
- **Stages:** 50 VUs (2 min baseline) → 500 VUs (2 min spike, 0s ramp) → 50 VUs (5 min recovery)
- **k6 script:** `scripts/load-tests/c-spike.js`
- **Pass:** ≤5% 5xx during spike, p99 ≤8s, recovery to baseline p95 within 2 min, no OOM kills

### Scenario D — Sustained high load (soak)
- **VUs:** 200, **Duration:** 1 hour
- **k6 script:** `scripts/load-tests/d-soak.js`
- **Pass:** Memory growth ≤100MB over the hour, no 5xx, p95 at minute 60 within 20% of p95 at minute 5

### Scenario E — Queue buildup
- **VUs:** 10 calling POST /api/workflows/[id]/execute for 5 min, pre-condition: 100 test workflows
- **Pass:** `total_queue_backlog` peaks ≤200, drains to <50 within 5 min, no dead-lettered executions

### Scenario F — Slow database
- **Method:** Inject latency via `SLOW_QUERY_INJECTION_MS=500`
- **Pass:** p95 ≤3s, no timeouts on /api/health/ready, DB-slow-query alert fires

### Scenario G — Database connection exhaustion
- **Method:** `DATABASE_POOL_SIZE=2`
- **Pass:** App returns 503 (not 500), no connection leaks, no hung requests

### Scenario H — Redis failure
- **Method:** `docker stop acos-redis`
- **Pass:** App remains available (Redis optional), no 5xx, recovery within 30s after restart

### Scenario I — AI provider timeout
- **Method:** `AI_LOCAL_ENDPOINT=http://localhost:9999` (connection refused)
- **Pass:** Circuit breaker opens after 5 failures, BreakerOpenError short-circuits, other endpoints remain functional

### Scenario J — External integration outage
- **Method:** Block outbound to api.stripe.com, api.resend.com, graph.facebook.com
- **Pass:** Payment API returns clear error, email queue backs up safely, WhatsApp failures logged + retried

### Scenario K — Worker failure
- **Method:** `docker kill acos-app; docker start acos-app` mid-workflow
- **Pass:** recoverExpiredLeases() reclaims stuck execution, no permanent stuck state, no double-execution

### Scenario L — Monitoring / alert-delivery failure
- **Method:** `docker stop acos-alertmanager`
- **Pass:** In-app AlertEngine still fires, ops-alerting dispatcher delivers to Telegram + WhatsApp independently

## 3. Test identities

All load tests use dedicated test identities — NEVER real user accounts.
- `loadtest-user-1@example.com` through `loadtest-user-50@example.com`
- Created via `/api/auth/signup` in a setup stage
- Each gets a `free` plan with 50 credits
- Deleted via `scripts/cleanup-test-data.ts` after each test run

## 4. Test data isolation

- All test users have `orgId = null` (single-user mode)
- Test leads use `businessName startsWith 'TEST '`
- Tests run against `DATABASE_URL=file:./test-load.db` (reset between runs)

## 5. Approval and scheduling

- All scenarios require explicit approval from the engineering lead
- Scenarios A–E may run during business hours in staging
- Scenarios F–L (failure injection) must run off-hours
- NEVER run any scenario against production

## 6. Pass/fail reporting

Each test run produces a markdown report at `scripts/load-tests/results/<scenario>-<timestamp>.md` with:
- Test parameters, pass/fail per criterion, SLO compliance, anomalies, recommendations
