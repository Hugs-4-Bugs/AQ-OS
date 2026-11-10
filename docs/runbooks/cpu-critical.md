# AcquisitionOS — Runbook: Critical CPU Usage

**Alert name:** `CriticalCpuUsage`
**Severity:** critical
**Threshold:** CPU sustained above 90% for 5 minutes (per host)

## What this alert means

CPU is saturated. Request latency is almost certainly degrading and the host is at risk of becoming unresponsive. Immediate intervention required.

## Diagnostic steps

Same as `cpu-high.md`, but tighter time budget — you have 5 minutes before requests start timing out.

1. Open the Infrastructure dashboard (`acos-infrastructure`).
2. Cross-reference with the API Endpoints dashboard (`acos-api-endpoints`) — check whether p99 latency has crossed 5s.
3. Check the Global Application Overview (`acos-app-overview`) — has the active users / queue backlog / workflow count spiked?

## Immediate mitigation

### Triage (first 2 minutes)
1. **Identify the busiest endpoint** from the API Endpoints dashboard.
2. **Check for a stuck workflow.** Look at `total_queue_backlog` — if growing rapidly, workers may be stuck. Admin can pause workflows globally.

### Reduce load
- **Scale out** — add more app replicas immediately.
- **Throttle background work** — set `AUTOPILOT_SCHEDULER_DISABLED=1` and `ALERT_ENGINE_INTERVAL_MS=60000` until CPU recovers.
- **Enable degraded mode** — set `DEGRADED_MODE=true` to disable non-critical features.

### If a single tenant is consuming disproportionate resources
- The distributed rate limiter should already throttle them. If bypassing via session cookies, consider temporarily revoking sessions via `/api/admin/users/[id]`.

## Post-incident

1. **Capture evidence** — export a Grafana snapshot.
2. **File an incident report** including peak CPU, duration, affected endpoints, recovery time, root cause.
3. **Add a capacity-planning note** if traffic-driven.

## Escalation

Critical alerts dispatched to BOTH Telegram and WhatsApp immediately. Auto-escalation after 30 minutes if unacknowledged.
