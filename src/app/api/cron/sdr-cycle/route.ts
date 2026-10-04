// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/cron/sdr-cycle
// Cron endpoint to run the SDR cycle for all users with
// autonomous mode enabled. Auth: Bearer acquisitionos-cron-dev
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { executeSDRCycle } from '@/lib/autonomous-sdr-pipeline';

export async function POST(request: NextRequest) {
  try {
    // Verify cron auth header
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[Cron SDR] CRON_SECRET not configured');
      return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
    }
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find all users with SDR enabled (autonomy mode = assisted or autonomous)
    const enabledUsers = await db.userSettings.findMany({
      where: {
        meetingAutonomyMode: { in: ['assisted', 'autonomous'] },
      },
      select: { userId: true },
    });

    if (enabledUsers.length === 0) {
      return NextResponse.json({
        usersProcessed: 0,
        results: [],
      });
    }

    // Execute SDR cycle for each enabled user
    const results: Array<{
      userId: string;
      success: boolean;
      cycleId?: string;
      error?: string;
    }> = [];

    for (const { userId } of enabledUsers) {
      try {
        const cycleResult = await executeSDRCycle(userId);
        results.push({
          userId,
          success: true,
          cycleId: cycleResult.cycleId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Cron SDR] Cycle failed for user ${userId}:`, message);
        results.push({
          userId,
          success: false,
          error: message,
        });
      }
    }

    return NextResponse.json({
      usersProcessed: enabledUsers.length,
      results,
    });
  } catch (error) {
    console.error('[Cron] SDR cycle error:', error);
    const message = error instanceof Error ? error.message : 'SDR cycle processing failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
