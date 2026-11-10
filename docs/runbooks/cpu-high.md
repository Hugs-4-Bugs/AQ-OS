# AcquisitionOS — Runbook: High CPU Usage

**Alert name:** `HighCpuUsage`
**Severity:** warning
**Threshold:** CPU sustained above 75% for 5 minutes (per host)
**Source:** Prometheus rule in `deploy/prometheus/alerts.yml`

## What this alert means

One or more hosts running AcquisitionOS are spending more than 75% of CPU time on non-idle tasks for at least 5 minutes. Left unchecked it can lead to request queuing, latency spikes, and eventual request timeouts.

## Diagnostic steps

1. **Identify which host is affected.** Open the Infrastructure dashboard in Grafana (`acos-infrastructure`) and look at the "CPU Usage (%) by host" panel.
2. **Identify the consuming process.** SSH onto the host (or `docker exec` into the container) and run `top -b -n 1 | head -20` or `docker stats --no-stream`.
3. **Check for correlated signals.** Look at the Global Application Overview dashboard — API Request Rate, Queue Backlog, Workflow Queue Depth.
4. **Check for a deploy or migration.** Look at the Deployment Health dashboard and the audit log under `/admin/operations`.

## Mitigation

### If traffic-driven (genuine load)
- **Scale horizontally** — add app replicas behind the load balancer.
- **Enable autoscaling** if supported (k8s HPA, ECS Service auto-scaling, EC2 ASG).
- **Verify the rate limiter is engaged** — check per-tenant rate limit policies in `src/lib/security/rate-limit-policies.ts`.

### If workflow-driven (background work)
- **Throttle autopilot concurrency** — set `AUTOPILOT_SCHEDULER_INTERVAL_MS` higher (e.g. 600000).
- **Reduce per-tick processing bounds** in the heartbeat in `src/instrumentation.ts`.
- **Pause non-critical autonomous workflows** — admin can pause via `/api/workflows/[id]/pause`.

### If runaway process (bug)
- **Restart the app container** — `docker restart acos-app`.
- **Capture a heap snapshot** before restart.
- **File an incident** and attach the Grafana snapshot.

## Escalation

If CPU stays above 90% for 5 minutes (`CriticalCpuUsage`), the on-call engineer must respond within 15 minutes. Auto-escalation after 30 minutes via `checkEscalation()` in `src/lib/observability/ops-alerting/dispatcher.ts`.

## Recovery condition

The alert auto-resolves when CPU drops below 75% for one full evaluation window (5 minutes). A `recovery` severity notification is dispatched.

## False-positive considerations

- **Single-scrape blips are filtered** by the `for: 5m` clause.
- **Brief deploy spikes** under 5 min won't fire this alert.
