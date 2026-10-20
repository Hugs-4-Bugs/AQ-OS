// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Scheduler Cron Route
// POST /api/cron/workflow-scheduler
//
// The server-side heartbeat for scheduled workflow automation:
//   1. Restart recovery — executions/jobs stuck in 'running' after a process
//      restart or timeout are marked failed (honest state, no zombie runs).
//   2. Scheduled triggers — fires active scheduled workflows whose wall-clock
//      time (in the workflow's timezone) matches within the catch-up window.
//
// Execution itself is fully server-side and browser-independent. Protected
// by CRON_SECRET (same pattern as the other /api/cron routes).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processScheduledTriggers } from '@/lib/workflow-triggers';

/** Executions stuck in 'running' longer than this are recovered as failed. */
const STUCK_EXECUTION_MS = 60 * 60 * 1000; // 60 minutes
/** Discovery jobs stuck longer than this are recovered as failed. */
const STUCK_DISCOVERY_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function POST(request: NextRequest) {
  // ── Auth: shared cron secret (Bearer), same pattern as /api/cron/expire-api-keys ──
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    // ── 1. Restart/timeout recovery: stuck workflow executions ──
    const stuckBefore = new Date(startedAt - STUCK_EXECUTION_MS);
    const recoveredExecutions = await db.workflowExecution.updateMany({
      where: { status: 'running', startedAt: { lt: stuckBefore } },
      data: {
        status: 'failed',
        error:
          'Recovered by scheduler: execution was stuck in running for over 60 minutes (process restart or timeout). Re-run the workflow if needed.',
      },
    });

    // ── 2. Restart/timeout recovery: stuck discovery jobs ──
    const stuckDiscoveryBefore = new Date(startedAt - STUCK_DISCOVERY_MS);
    const recoveredDiscoveryJobs = await db.discoveryJob.updateMany({
      where: { status: { in: ['pending', 'running'] }, createdAt: { lt: stuckDiscoveryBefore } },
      data: {
        status: 'failed',
        errorMessage:
          'Recovered by scheduler: discovery job was stuck for over 2 hours (process restart or timeout). Start a new discovery to continue.',
      },
    });

    // ── 3. Fire scheduled workflows (timezone-aware, catch-up policy) ──
    const firedExecutionIds = await processScheduledTriggers();

    return NextResponse.json({
      success: true,
      recoveredExecutions: recoveredExecutions.count,
      recoveredDiscoveryJobs: recoveredDiscoveryJobs.count,
      firedExecutionIds,
      firedCount: firedExecutionIds.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[WorkflowSchedulerCron] Failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Scheduler failed' },
      { status: 500 }
    );
  }
}
