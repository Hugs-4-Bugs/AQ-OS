# AcquisitionOS — Runbook: Queue Backlog

**Alert names:**
- `QueueBacklogGrowing` (warning, >100 queued/waiting for 15m)
- `QueueBacklogCritical` (critical, >500 queued/waiting for 5m)

## What this means

Workflow executions are accumulating in `queued` / `waiting` / `pending` state faster than the in-process heartbeat in `src/instrumentation.ts` can claim and run them.

## Diagnostic steps

1. **Check the queue depth trend.** Grafana → Global Application Overview → "Workflow Queue Depth".
2. **Check what's stuck.**
   ```sh
   curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/admin/operations/overview | jq '.queue'
   ```
3. **Check the heartbeat is running.** App container logs should contain `[autopilot-heartbeat] tick:` entries every 5 minutes.
4. **Check for stuck leases.** Autopilot runs use lease-based claiming. The heartbeat's `recoverExpiredLeases()` should reclaim these.
5. **Check for dead-lettered executions.**
   ```sql
   SELECT COUNT(*) FROM WorkflowExecution WHERE deadLettered = true;
   ```

## Mitigation

### Backlog growing
- **Increase heartbeat frequency** — set `AUTOPILOT_SCHEDULER_INTERVAL_MS=60000` (1 min).
- **Scale horizontally** — add more app replicas. Atomic ACTIVE→RUNNING claim makes this safe.

### Workers completely stuck
- **Trigger the cron endpoint externally**:
  ```sh
  curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
    http://localhost:3000/api/cron/workflow-scheduler
  ```
- **Restart the app container** — `docker restart acos-app`.

### Dead-letter overflow
- **Replay individual executions** via `POST /api/workflows/dead-letter/[executionId]` (super_admin).
- **Purge if obsolete** via `DELETE /api/workflows/dead-letter` (super_admin, with audit).

## Escalation

Critical (>500 backlog for 5 min) → Telegram + WhatsApp immediately. Auto-escalation after 30 min.

## Recovery

Backlog drops below 100 → warning resolves. Below 50 → critical resolves.

## False-positive considerations

- A large bulk workflow (e.g. processing 1000 leads in a single autopilot run) can legitimately push backlog above 100. Check whether a bulk operation was recently triggered.
