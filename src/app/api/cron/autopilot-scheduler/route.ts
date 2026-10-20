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
    return NextResponse.json({
      ok: true,
      ...result,
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
