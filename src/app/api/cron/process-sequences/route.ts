// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/cron/process-sequences
// Cron endpoint that processes pending sequence steps across all users.
// Auth: Bearer acquisitionos-cron-dev
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { processSequenceSteps } from '@/lib/sequence-execution-engine';

export async function POST(request: NextRequest) {
  try {
    // Verify cron auth header
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[Cron ProcessSequences] CRON_SECRET not configured');
      return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
    }
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Process all pending sequence steps (no userId = process all users)
    const result = await processSequenceSteps();

    return NextResponse.json({
      processed: result.totalProcessed,
      sent: result.sent,
      failed: result.failed,
      completed: result.completed,
    });
  } catch (error) {
    console.error('[Cron] Process sequences error:', error);
    const message = error instanceof Error ? error.message : 'Sequence processing failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
