// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/stripe-portal
// Create a Stripe Customer Portal session for self-service billing
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { createPortalSession } from '@/lib/stripe-portal-service';

interface PortalRequestBody {
  returnUrl?: string;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as PortalRequestBody;
      const { returnUrl } = body;

      const result = await createPortalSession({
        userId: user.id,
        returnUrl,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to create portal session' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        url: result.url,
        sessionId: result.sessionId,
      });
    } catch (error) {
      console.error('[API] Stripe portal error:', error);
      return NextResponse.json(
        { error: 'Failed to create Stripe customer portal session' },
        { status: 500 }
      );
    }
  });
}
