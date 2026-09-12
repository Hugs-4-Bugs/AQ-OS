// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/refund
// Initiate a refund for a payment (full or partial)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { initiateRefund } from '@/lib/refund-service';

interface RefundRequestBody {
  paymentOrderId: string;
  refundType: 'full' | 'partial';
  amount?: number;
  reason?: string;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as RefundRequestBody;
      const { paymentOrderId, refundType = 'full', amount, reason } = body;

      // Validate required fields
      if (!paymentOrderId) {
        return NextResponse.json(
          { error: 'Payment order ID is required' },
          { status: 400 }
        );
      }

      // Validate refund type
      if (!['full', 'partial'].includes(refundType)) {
        return NextResponse.json(
          { error: 'Refund type must be "full" or "partial"' },
          { status: 400 }
        );
      }

      // Partial refund requires amount
      if (refundType === 'partial' && (!amount || amount <= 0)) {
        return NextResponse.json(
          { error: 'Partial refund requires a positive amount' },
          { status: 400 }
        );
      }

      const result = await initiateRefund({
        paymentOrderId,
        userId: user.id,
        refundType,
        amount: refundType === 'partial' ? amount : undefined,
        reason,
        initiatedBy: user.email,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Refund initiation failed' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
        creditsReversed: result.creditsReversed,
        status: result.status,
      });
    } catch (error) {
      console.error('[API] Refund error:', error);
      return NextResponse.json(
        { error: 'Failed to process refund request' },
        { status: 500 }
      );
    }
  });
}
