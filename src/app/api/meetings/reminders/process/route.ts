// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Process Meeting Reminders (Cron)
// POST /api/meetings/reminders/process — Process upcoming meeting reminders
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/observability/api-logger';
import { processMeetingReminders } from '@/lib/meeting-orchestration-service';

// SECURITY HARDENING: no hardcoded fallback — fail closed when unset.
const CRON_AUTH_TOKEN = process.env.CRON_AUTH_TOKEN || process.env.CRON_SECRET;

export const POST = withApiLogging(async (request: NextRequest) => {
  try {
    // Validate cron auth header
    if (!CRON_AUTH_TOKEN) {
      console.error('[Meeting Reminders API] CRON_AUTH_TOKEN/CRON_SECRET is not configured — rejecting request');
      return NextResponse.json(
        { error: 'Cron authentication not configured.' },
        { status: 500 }
      );
    }
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${CRON_AUTH_TOKEN}`) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid or missing cron auth token.' },
        { status: 401 }
      );
    }

    const result = await processMeetingReminders();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Meeting Reminders API] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to process meeting reminders' },
      { status: 500 }
    );
  }
}, 'meetings/reminders/process');
