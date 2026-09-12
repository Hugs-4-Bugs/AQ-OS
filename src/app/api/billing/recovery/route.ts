// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET/POST /api/billing/recovery
// Get payment recovery status or trigger manual recovery
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getRecoveryStatus, triggerManualRecovery, processFailedPayments } from '@/lib/payment-recovery-service';

// GET: Get payment recovery status
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const runProcessing = searchParams.get('process') === 'true';

      // Optionally run the dunning processor (admin only)
      if (runProcessing && ['owner', 'admin', 'super_admin'].includes(user.role)) {
        const processingResult = await processFailedPayments();
        return NextResponse.json({
          success: true,
          processingResult,
          recoveryStatus: await getRecoveryStatus(user.id),
        });
      }

      // Get recovery status for the current user
      const result = await getRecoveryStatus(user.id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to get recovery status' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        status: result.status,
      });
    } catch (error) {
      console.error('[API] Billing recovery GET error:', error);
      return NextResponse.json(
        { error: 'Failed to get payment recovery status' },
        { status: 500 }
      );
    }
  });
}

// POST: Trigger manual recovery for a payment
interface RecoveryRequestBody {
  paymentOrderId: string;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as RecoveryRequestBody;
      const { paymentOrderId } = body;

      if (!paymentOrderId) {
        return NextResponse.json(
          { error: 'Payment order ID is required' },
          { status: 400 }
        );
      }

      const result = await triggerManualRecovery(paymentOrderId, user.id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Manual recovery failed' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error('[API] Billing recovery POST error:', error);
      return NextResponse.json(
        { error: 'Failed to trigger manual recovery' },
        { status: 500 }
      );
    }
  });
}
