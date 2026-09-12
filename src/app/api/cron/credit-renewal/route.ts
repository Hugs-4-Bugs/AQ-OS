// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/cron/credit-renewal
// Cron endpoint for processing all credit renewals.
// Must be called with Authorization: Bearer <CRON_SECRET>
// Calls processAllCreditRenewals() from subscription-service.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/observability/api-logger';
import { processEndOfPeriodSubscriptions as processAllCreditRenewals } from '@/lib/subscription-service';

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

    // Process all credit renewals
    const result = await processAllCreditRenewals();

    return NextResponse.json({
      success: true,
      checked: result.checked,
      expired: result.expired,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Credit renewal error:', error);
    return NextResponse.json(
      { error: 'Credit renewal processing failed', timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}, 'cron/credit-renewal');
