// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Reminders Cron Job
// GET /api/cron/meeting-reminders
//
// Processes overdue meeting reminders by sending email reminders
// to clients and users. Protected by CRON_SECRET header.
//
// Can be called by:
// - Vercel Cron (vercel.json schedule)
// - External scheduler (cron-job.org, AWS EventBridge, etc.)
// - Manual invocation for testing
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { processDueReminders } from '@/lib/meetings/meeting-reminders';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET — require it to be set, never accept via URL params
  if (!CRON_SECRET) {
    console.error('[Cron/MeetingReminders] CRON_SECRET not configured');
    return NextResponse.json(
      { error: 'Cron not configured' },
      { status: 500 }
    );
  }
  const providedSecret = request.headers.get('x-cron-secret')
    || request.headers.get('authorization')?.replace('Bearer ', '');

  if (providedSecret !== CRON_SECRET) {
    console.warn('[Cron/MeetingReminders] Unauthorized access attempt');
    return NextResponse.json(
      { error: 'Unauthorized — invalid or missing CRON_SECRET' },
      { status: 401 }
    );
  }

  console.log('[Cron/MeetingReminders] Starting reminder processing...');

  try {
    const result = await processDueReminders();

    console.log(
      `[Cron/MeetingReminders] Completed: processed=${result.processed}, ` +
      `sent=${result.sent}, failed=${result.failed}, skipped=${result.skipped}`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron/MeetingReminders] Fatal error:', message);

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        error: message,
      },
      { status: 500 }
    );
  }
}

// Also support POST for schedulers that use POST
export async function POST(request: NextRequest) {
  return GET(request);
}
