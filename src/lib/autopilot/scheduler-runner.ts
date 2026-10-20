// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Scheduler Runner
//
// Shared by POST /api/cron/autopilot-scheduler (CRON_SECRET protected).
// One tick:
//   1. Recover stuck runs / stuck autopilots (honest FAILED states).
//   2. Find ACTIVE autopilots whose nextRunAt is due.
//   3. For each: ATOMICALLY claim ACTIVE→RUNNING (updateMany count==1 —
//      two ticks can never start the same autopilot twice), run it,
//      then set status + nextRunAt.
//
// A run is started exactly once: the run row is claimed QUEUED→RUNNING
// inside executeAutopilotRun, and the AutopilotLead ledger unique
// constraint prevents any duplicate lead processing even if a retry
// ever raced past the claims.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { computeNextRun, executeAutopilotRun, recoverStuckAutopilotRuns } from './runner';

function safeParseArray(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch { return []; }
}

function safeParseObject(raw: string | null): Record<string, string> {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export interface SchedulerTickResult {
  recoveredRuns: number;
  recoveredAutopilots: number;
  dueCount: number;
  started: number;
  skippedInFlight: number;
  results: Array<{
    autopilotId: string;
    runId: string;
    status: 'COMPLETED' | 'FAILED';
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

    const run = await db.autopilotRun.create({
      data: {
        autopilotId: autopilot.id,
        userId: autopilot.userId,
        status: 'QUEUED',
        trigger: 'scheduler',
        config: JSON.stringify({
          niches: safeParseArray(autopilot.niches),
          geography: safeParseObject(autopilot.geography),
        }),
      },
    });

    started++;
    const outcome = await executeAutopilotRun(
      autopilot as unknown as Parameters<typeof executeAutopilotRun>[0],
      run.id,
      'scheduler'
    );

    // Schedule the next run; autopilot returns to ACTIVE (or FAILED).
    const nextRunAt = computeNextRun(autopilot.schedule) || new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.autopilotWorkflow.updateMany({
      where: { id: autopilot.id, status: 'RUNNING' },
      data: {
        status: outcome.status === 'FAILED' ? 'FAILED' : 'ACTIVE',
        lastRunAt: new Date(),
        nextRunAt,
        lastError: outcome.error ? outcome.error.substring(0, 2000) : null,
        runCount: { increment: 1 },
        totalDiscovered: { increment: outcome.discovered },
        totalSaved: { increment: outcome.saved },
        totalProcessed: { increment: outcome.processed },
        totalExecutions: { increment: outcome.executionsCreated },
      },
    });

    results.push({
      autopilotId: autopilot.id,
      runId: run.id,
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
