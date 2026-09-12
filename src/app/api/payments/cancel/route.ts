// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/cancel
// Phase 5: Cancel subscription (sets cancelAtPeriodEnd=true)
//
// Auth: Required (withAuth)
// Body: { reason?: string }
// Returns: { success, cancelAtPeriodEnd, currentPeriodEnd }
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { cancelSubscriptionPayment } from '@/lib/payment-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';

interface CancelBody {
  reason?: string;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as CancelBody;
      const { reason } = body;

      const ipAddress = getClientIp(request);
      const userAgent = getUserAgent(request);

      // Delegate to payment-service
      const result = await cancelSubscriptionPayment({
        userId: user.id,
        reason,
        ipAddress,
        userAgent,
      });

      if (!result.success) {
        const status = result.error?.includes('No active subscription') ? 404 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }

      // Log the cancellation
      await logBillingEvent({
        userId: user.id,
        action: 'subscription_canceled',
        details: `Subscription cancellation requested${reason ? ` — Reason: ${reason}` : ''}`,
        ipAddress,
        userAgent,
        metadata: {
          cancelAtPeriodEnd: result.cancelAtPeriodEnd,
          currentPeriodEnd: result.currentPeriodEnd?.toISOString() ?? null,
          reason: reason || undefined,
        },
      });

      return NextResponse.json({
        success: result.success,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        currentPeriodEnd: result.currentPeriodEnd?.toISOString() ?? null,
      });
    } catch (error) {
      console.error('[API] Cancel subscription error:', error);
      return NextResponse.json(
        { error: 'Failed to cancel subscription' },
        { status: 500 }
      );
    }
  });
}
