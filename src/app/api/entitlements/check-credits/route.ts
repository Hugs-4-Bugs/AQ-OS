// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Credit Check API Route
// Checks if the authenticated user has enough credits for a
// specific action without deducting them.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';
import { checkCreditSufficiency, CREDIT_COSTS, type CreditAction } from '@/lib/credit-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { action } = body as { action: string };

      if (!action) {
        return NextResponse.json(
          { error: 'Action is required', code: 'MISSING_ACTION' },
          { status: 400 }
        );
      }

      const creditAction = action as CreditAction;
      const cost = CREDIT_COSTS[creditAction];

      if (cost === undefined) {
        return NextResponse.json(
          { error: `Unknown action: ${action}`, code: 'UNKNOWN_ACTION' },
          { status: 400 }
        );
      }

      const sufficiency = await checkCreditSufficiency(user.id, cost);

      return NextResponse.json({
        action,
        cost,
        balance: sufficiency.balance,
        sufficient: sufficiency.sufficient,
        shortfall: sufficiency.shortfall,
      });
    } catch (error) {
      console.error('[CreditCheckAPI] Error checking credits:', error);
      return NextResponse.json(
        { error: 'Failed to check credits' },
        { status: 500 }
      );
    }
  });
}
