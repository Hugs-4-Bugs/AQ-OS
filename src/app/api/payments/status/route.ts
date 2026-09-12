// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/status
// Get current payment status overview for the authenticated user
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getRecoveryStatus as getPaymentStatus } from '@/lib/payment-recovery-service';

// ===== HANDLER =====

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const status = await getPaymentStatus(user.id);

      return NextResponse.json(status);
    } catch (error) {
      console.error('[API] Payment status error:', error);
      return NextResponse.json(
        { error: 'Failed to get payment status' },
        { status: 500 }
      );
    }
  });
}
