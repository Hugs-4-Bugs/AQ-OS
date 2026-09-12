// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/retry
// Phase 5: Retry a failed payment
//
// Auth: Required (withAuth)
// Body: { failedOrderId: string }
// Returns: new order config (Razorpay or Stripe)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { retryPayment } from '@/lib/payment-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';

interface RetryPaymentBody {
  failedOrderId: string;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as RetryPaymentBody;
      const { failedOrderId } = body;

      if (!failedOrderId) {
        return NextResponse.json(
          { error: 'failedOrderId is required' },
          { status: 400 }
        );
      }

      const ipAddress = getClientIp(request);
      const userAgent = getUserAgent(request);

      // Delegate to payment-service
      const result = await retryPayment({
        userId: user.id,
        failedOrderId,
        ipAddress,
        userAgent,
      });

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404
          : result.error?.includes('not belong') ? 403
          : result.error?.includes('not in failed state') ? 400
          : result.error?.includes('Maximum retry') ? 429
          : 400;

        return NextResponse.json({ error: result.error }, { status });
      }

      // Log the retry
      await logBillingEvent({
        userId: user.id,
        action: 'payment_initiated',
        details: `Payment retry initiated for failed order ${failedOrderId}`,
        ipAddress,
        userAgent,
        metadata: {
          failedOrderId,
          newOrderId: result.newOrderId,
          provider: result.razorpayOrderId ? 'razorpay' : 'stripe',
        },
      });

      return NextResponse.json({
        success: true,
        newOrderId: result.newOrderId,
        // Razorpay config
        razorpayOrderId: result.razorpayOrderId,
        // Stripe config
        stripeSessionUrl: result.stripeSessionUrl,
      });
    } catch (error) {
      console.error('[API] Retry payment error:', error);
      return NextResponse.json(
        { error: 'Failed to retry payment' },
        { status: 500 }
      );
    }
  });
}
