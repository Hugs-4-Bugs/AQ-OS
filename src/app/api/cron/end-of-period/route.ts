// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/cron/end-of-period
// Cron endpoint for processing end-of-period subscription tasks:
//   - Expire subscriptions with cancelAtPeriodEnd where period has ended
//   - Process scheduled plan changes at period end
// Must be called with Authorization: Bearer <CRON_SECRET>
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/observability/api-logger';
import { processEndOfPeriodSubscriptions } from '@/lib/subscription-service';

export const POST = withApiLogging(async (request: NextRequest) => {
  try {
    // Verify CRON_SECRET from Authorization header
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[Cron] CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Cron secret not configured on server' },
        { status: 500 }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized — invalid or missing cron secret' },
        { status: 401 }
      );
    }

    // Process end-of-period subscriptions
    const result = await processEndOfPeriodSubscriptions();

    return NextResponse.json({
      success: true,
      checked: result.checked,
      expired: result.expired,
      scheduledChangesProcessed: result.planChanged,
      errors: 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] End-of-period processing error:', error);
    return NextResponse.json(
      { error: 'End-of-period processing failed', timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}, 'cron/end-of-period');
