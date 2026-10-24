// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Scheduler Runner
//
// Shared by POST /api/cron/autopilot-scheduler (CRON_SECRET protected)
// and the in-process 5-minute heartbeat (instrumentation.ts).
// One tick:
//   1. Recover stuck runs / stuck autopilots (honest FAILED states).
//   2. Find ACTIVE autopilots whose nextRunAt is due.
//   3. For each: ATOMICALLY claim ACTIVE→RUNNING (updateMany count==1 —
//      two ticks can never start the same autopilot twice), then invoke
//      the SAME core runAutopilot service the manual route uses with a
//      deterministic slot runKey (Phase 18 convergence + replay
//      protection), then set the next slot.
//
// A run is started exactly once: the run row is claimed QUEUED→RUNNING
// inside executeAutopilotRun, the AutopilotLead ledger unique constraint
// prevents any duplicate lead processing, and the runKey unique index
// prevents any duplicate run for the same scheduled slot.
//
// Phase 22 — the next slot is computed by the canonical, timezone-aware
// schedule engine (anchored wall-clock grids, DST-safe; interval mode
// preserves the legacy Phase 18 arithmetic). A DISABLED schedule
// (schedule.enabled=false) is never fired even if a stale nextRunAt
// somehow remains.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { computeNextRun, recoverStuckAutopilotRuns, runAutopilot } from './runner';
import { computeNextRunAt, parsePersistedSchedule } from './schedule';

export interface SchedulerTickResult {
  recoveredRuns: number;
  recoveredAutopilots: number;
  dueCount: number;
  started: number;
  skippedInFlight: number;
  results: Array<{
    autopilotId: string;
    runId: string;
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
    nextRunAt: string;
    error?: string;
  }>;
}

export async function runAutopilotSchedulerTick(): Promise<SchedulerTickResult> {
  const recovery = await recoverStuckAutopilotRuns();

  const now = new Date();
  const due = await db.autopilotWorkflow.findMany({
    where: { status: 'ACTIVE', nextRunAt: { lte: now, not: null } },
    orderBy: { nextRunAt: 'asc' },
    take: 10, // bounded work per tick — correctness over volume
  });

  const results: SchedulerTickResult['results'] = [];
  let started = 0;
  let skippedInFlight = 0;

  for (const autopilot of due) {
    // ── Phase 22 — disabled schedules are never fired (defense in
    // depth: the due query already requires a non-null nextRunAt, which
    // a disabled schedule does not have; this guard also covers a
    // stale nextRunAt left by an interrupted disable). ──
    const scheduleConfig = parsePersistedSchedule(autopilot.schedule);
    if (!scheduleConfig.enabled) {
      skippedInFlight++;
      continue;
    }

    // ── Atomic claim: only one tick can flip ACTIVE→RUNNING. ──
    const claimed = await db.autopilotWorkflow.updateMany({
      where: { id: autopilot.id, status: 'ACTIVE' },
      data: { status: 'RUNNING' },
    });
    if (claimed.count !== 1) {
      skippedInFlight++;
      continue; // another tick/worker got it — never double-run
    }

    // Open-run guard: an unfinished previous run blocks a new one.
    const openRun = await db.autopilotRun.findFirst({
      where: { autopilotId: autopilot.id, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true },
    });
    if (openRun) {
      skippedInFlight++;
      // Release the claim — previous run still owns this autopilot.
      await db.autopilotWorkflow.updateMany({
        where: { id: autopilot.id, status: 'RUNNING' },
        data: { status: 'ACTIVE' },
      });
      continue;
    }

    // Phase 18 — deterministic runKey: the due slot's identity. A replayed
    // tick (or a racing duplicate tick) for the SAME slot converges on the
    // SAME run row via the runKey unique index — never a second run.
    const slotRunKey = `scheduled:${autopilot.id}:${autopilot.nextRunAt ? autopilot.nextRunAt.getTime() : 'now'}`;
    const existingSlotRun = await db.autopilotRun.findUnique({
      where: { runKey: slotRunKey },
      select: { id: true },
    }).catch(() => null);
    if (existingSlotRun) {
      skippedInFlight++;
      // Release the claim — the slot's run already exists.
      await db.autopilotWorkflow.updateMany({
        where: { id: autopilot.id, status: 'RUNNING' },
        data: { status: 'ACTIVE' },
      });
      // Phase 22 — self-healing recovery: advance nextRunAt PAST the
      // already-handled slot. Without this, a crashed-then-recovered run
      // (claim taken, run row created, process died before the post-run
      // nextRunAt update) would reappear as due on EVERY tick forever —
      // the runKey check prevents duplicate runs, but the schedule would
      // never advance again. Advancing from the slot instant keeps the
      // occurrence grid exact (anchored grids stay on the wall clock).
      const replayNextRunAt = computeNextRunAt(scheduleConfig, autopilot.nextRunAt ?? new Date());
      await db.autopilotWorkflow.update({
        where: { id: autopilot.id },
        data: { nextRunAt: replayNextRunAt },
      }).catch(() => {});
      continue;
    }

    // Phase 18 — the scheduler and the manual route CONVERGE on the same
    // core service (runAutopilot): claim, run-row creation with runKey,
    // execution, and autopilot finalization all live in ONE place. The
    // scheduler's pre-claimed ACTIVE→RUNNING state is accepted by
    // runAutopilot's 'scheduler' trigger path; a duplicate slot racing
    // past the pre-check above is caught by the runKey unique index
    // inside runAutopilot (returned as duplicate: true).
    const result = await runAutopilot(autopilot.id, autopilot.userId, 'scheduler', {
      runKey: slotRunKey,
    });
    if (!result.ok || !result.runId) {
      // State conflict / in-flight guard — release the claim honestly.
      skippedInFlight++;
      await db.autopilotWorkflow.updateMany({
        where: { id: autopilot.id, status: 'RUNNING' },
        data: { status: 'ACTIVE' },
      });
      continue;
    }
    if (result.duplicate) {
      // Replayed slot — already handled by an earlier tick.
      skippedInFlight++;
      continue;
    }

    started++;
    console.warn(
      `[autopilot-scheduler] started scheduled run: autopilot=${autopilot.id} run=${result.runId} slot=${slotRunKey}`
    );
    const outcome = result.outcome;
    if (!outcome) {
      // runAutopilot reported a run without an outcome (should not happen
      // for non-duplicate runs) — fall back to the run row's own state.
      const runRow = await db.autopilotRun.findUnique({
        where: { id: result.runId },
        select: { status: true, discovered: true, saved: true, processed: true, executionsCreated: true, error: true },
      });
      results.push({
        autopilotId: autopilot.id,
        runId: result.runId,
        status: (runRow?.status as 'COMPLETED' | 'FAILED' | 'CANCELLED') || 'FAILED',
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        ...(runRow?.error ? { error: runRow.error } : {}),
      });
      continue;
    }

    // Schedule the next run; the autopilot row itself was already
    // finalized by runAutopilot (RUNNING → ACTIVE/FAILED), so this update
    // is NOT status-guarded — nextRunAt must land either way.
    // Phase 22 — canonical, timezone-aware computation from the persisted
    // schedule config (anchored wall-clock grids / legacy interval mode).
    // A run failure therefore NEVER destroys the schedule: the next
    // occurrence is always computed and persisted.
    const nextRunAt = computeNextRunAt(scheduleConfig) || computeNextRun(autopilot.schedule) || new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.autopilotWorkflow.update({
      where: { id: autopilot.id },
      data: { nextRunAt },
    }).catch(() => {});
    console.warn(
      `[autopilot-scheduler] next run scheduled: autopilot=${autopilot.id} at ${nextRunAt.toISOString()} (${scheduleConfig.timezone}) status=${outcome.status}`
    );

    results.push({
      autopilotId: autopilot.id,
      runId: result.runId,
      status: outcome.status,
      nextRunAt: nextRunAt.toISOString(),
      ...(outcome.error ? { error: outcome.error } : {}),
    });
  }

  return {
    recoveredRuns: recovery.recoveredRuns,
    recoveredAutopilots: recovery.recoveredAutopilots,
    dueCount: due.length,
    started,
    skippedInFlight,
    results,
  };
}
