// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Scheduler Cron Route
// POST /api/cron/autopilot-scheduler
//
// The server-side heartbeat for scheduled Autopilot runs:
//   1. Stuck-run recovery (runs/autopilots stuck in RUNNING → FAILED).
//   2. Fires ACTIVE autopilots whose nextRunAt is due — each claimed
//      ATOMICALLY (ACTIVE→RUNNING, updateMany count==1) so two ticks
//      can never start the same autopilot twice.
//
// Protected by CRON_SECRET (same pattern as /api/cron/workflow-scheduler).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { runAutopilotSchedulerTick } from '@/lib/autopilot/scheduler-runner';

export async function POST(request: NextRequest) {
  // ── Auth: shared cron secret (Bearer), same pattern as the other cron routes ──
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
    const result = await runAutopilotSchedulerTick();

    // Phase 26 — also tick the agent scheduler + event dispatcher (same
    // pattern as the instrumentation.ts heartbeat — all three ticks run
    // in the SAME cron call, NO second scheduler). Without this, production
    // environments that use external cron (instead of the in-process
    // heartbeat) would never process agent events or scheduled agent runs.
    let agentSchedulerResult: Record<string, unknown> | undefined;
    try {
      const { runAgentSchedulerTick } = await import('@/lib/ai/agent-scheduler');
      agentSchedulerResult = await runAgentSchedulerTick();
    } catch (err) {
      console.error('[AutopilotScheduler] agent scheduler tick failed (non-fatal):', err);
    }
    let eventDispatcherResult: Record<string, unknown> | undefined;
    try {
      const { processPendingEvents } = await import('@/lib/ai/agent-event-dispatcher');
      eventDispatcherResult = await processPendingEvents();
    } catch (err) {
      console.error('[AutopilotScheduler] event dispatcher tick failed (non-fatal):', err);
    }
    // Phase 26 D §8 — expire stale approvals (same proactive sweep as
    // the heartbeat — ensures production with external cron also cleans
    // up stale approvals).
    try {
      const { expireStaleApprovals } = await import('@/lib/ai/approval-escalation');
      await expireStaleApprovals();
    } catch (err) {
      console.error('[AutopilotScheduler] approval expiry sweep failed (non-fatal):', err);
    }
    // Phase 26 D §7 — check for due follow-up reminders (same as heartbeat).
    try {
      const { checkDueFollowUps } = await import('@/lib/ai/agent-event-dispatcher');
      await checkDueFollowUps();
    } catch (err) {
      console.error('[AutopilotScheduler] follow-up check failed (non-fatal):', err);
    }
    // Phase 26 D §7 — periodic pipeline sweep (same as heartbeat).
    try {
      const { runPipelineSweep } = await import('@/lib/ai/agent-continuation');
      await runPipelineSweep();
    } catch (err) {
      console.error('[AutopilotScheduler] pipeline sweep failed (non-fatal):', err);
    }

    return NextResponse.json({
      ok: true,
      ...result,
      agentScheduler: agentSchedulerResult,
      eventDispatcher: eventDispatcherResult,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[AutopilotScheduler] tick error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Scheduler tick failed' },
      { status: 500 }
    );
  }
}
