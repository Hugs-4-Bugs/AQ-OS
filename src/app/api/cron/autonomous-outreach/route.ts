// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/cron/autonomous-outreach
// Cron job to process the autonomous outreach queue.
// Finds queued messages and dispatches them.
// Protected by a shared secret to prevent unauthorized invocation.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { autonomousOutreachService } from '@/lib/autonomous-outreach';

export async function POST(request: NextRequest) {
  // Verify cron auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Cron AutonomousOutreach] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await autonomousOutreachService.processOutreachQueue();

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AutonomousOutreach] Cron processing error:', error);
    return NextResponse.json(
      { error: 'Cron job failed' },
      { status: 500 }
    );
  }
}
