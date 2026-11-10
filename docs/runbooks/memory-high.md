# AcquisitionOS — Runbook: Memory Issues

**Alert names:** `HighMemoryUsage` (warning, >85%), `CriticalMemoryUsage` (critical, >95%)
**Source:** Prometheus rules in `deploy/prometheus/alerts.yml` AND in-app AlertEngine rules in `src/lib/observability/alerts.ts`

## What this alert means

The Node.js process is approaching its V8 heap limit. At >95% the process is at risk of an OOM kill.

## Diagnostic steps

1. **Check the Global Application Overview dashboard** (`acos-app-overview`) — look at "Heap Memory (bytes)". Confirm `process_heap_used_bytes` is approaching `process_heap_total_bytes`.
2. **Check the in-process AlertEngine** at `/api/metrics/dashboard` (super_admin).
3. **Identify the memory consumer.** Common causes: unbounded in-memory caches, long-lived workflow executions, long AI chat sessions.
4. **Check for a recent deploy.**

## Mitigation

### Immediate
- **Restart the app container** — `docker restart acos-app`. Only do this if you've confirmed it's a leak, not genuine load.
- **Reduce concurrent work** — set `AUTOPILOT_SCHEDULER_INTERVAL_MS` higher.

### Sustained
- **Enable heap profiling** — set `NODE_OPTIONS=--heap-prof` and restart.
- **File a bug** with the heap snapshot.

## Escalation

Critical memory alerts dispatched immediately to both Telegram and WhatsApp. Auto-escalation after 30 minutes.

## Recovery

Warning alert resolves when heap usage drops below 85% for one evaluation window. Critical resolves below 95%.

## False-positive considerations

- The heapTotal can grow in chunks — a fresh allocation can push the ratio over 95% momentarily before GC runs. The `for: 2m` clause on the critical alert filters this.
- Check `process_rss_bytes` in addition to heap — RSS includes memory not yet returned to the OS by V8's GC.
