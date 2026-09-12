// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — /api/credits
// GET — Return credit balance breakdown, warning status, plan entitlements
// POST — Deduct credits using credit-service (atomic, idempotent, audited)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { deductCredits, getCreditBalance, CREDIT_COSTS, type CreditAction } from '@/lib/credit-service';
import { getEntitlements, type PlanType } from '@/lib/entitlement-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';

// GET /api/credits — return credit balance with breakdown, warning status, and plan entitlements
export async function GET(request: NextRequest) {
  return withPermission(request, 'billing:read', async (user) => {
    try {
      // Get detailed credit balance from credit-service
      const creditBalance = await getCreditBalance(user.id);

      // Determine credit warning status
      let creditWarning: 'ok' | 'low' | 'zero' = 'ok';
      if (creditBalance.total <= 0) {
        creditWarning = 'zero';
      } else if (creditBalance.total <= creditBalance.monthly * 0.2) {
        creditWarning = 'low';
      }

      // Get plan entitlements for credit actions
      const plan = (user.plan || 'free') as PlanType;
      const entitlements = getEntitlements(plan);

      // Build credit action entitlements (only actions that have a credit cost)
      const creditActionEntitlements: Record<
        string,
        { cost: number; enabled: boolean; limit: number | null }
      > = {};
      for (const [action, cost] of Object.entries(CREDIT_COSTS)) {
        const featureKey = action as keyof typeof entitlements;
        const entitlement = entitlements[featureKey];
        creditActionEntitlements[action] = {
          cost,
          enabled: entitlement?.enabled ?? false,
          limit: entitlement?.limit ?? null,
        };
      }

      return NextResponse.json({
        credits: creditBalance.total,
        creditsMonthly: creditBalance.monthly,
        rolloverCredits: creditBalance.rollover,
        addonCredits: creditBalance.addons,
        plan: creditBalance.plan,
        isTrial: user.plan !== 'free' && creditWarning !== 'zero',
        creditWarning,
        percentage:
          creditBalance.monthly > 0
            ? Math.round((creditBalance.total / creditBalance.monthly) * 100)
            : 0,
        creditActionEntitlements,
      });
    } catch (error) {
      console.error('[API] Failed to fetch credits:', error);
      return NextResponse.json(
        { error: 'Failed to fetch credits' },
        { status: 500 }
      );
    }
  });
}

// POST /api/credits — deduct credits for an action using credit-service
interface DeductCreditsBody {
  action: string;
  idempotencyKey?: string;
  referenceId?: string;
}

export async function POST(request: NextRequest) {
  return withPermission(request, 'billing:write', async (user) => {
    try {
      const body = (await request.json()) as DeductCreditsBody;
      const { action, idempotencyKey, referenceId } = body;

      // Validate action
      if (!action) {
        return NextResponse.json(
          { error: 'Action is required.' },
          { status: 400 }
        );
      }

      const validActions = Object.keys(CREDIT_COSTS) as CreditAction[];
      const isValidAction = validActions.includes(action as CreditAction);
      if (!isValidAction) {
        return NextResponse.json(
          {
            error: 'Invalid action.',
            validActions,
          },
          { status: 400 }
        );
      }

      const cost = CREDIT_COSTS[action as CreditAction];

      // Use credit-service for atomic, idempotent deduction with audit logging
      const result = await deductCredits({
        userId: user.id,
        action,
        cost,
        referenceId,
        idempotencyKey,
      });

      if (!result.success) {
        // Determine appropriate status code
        const isInsufficient =
          result.error?.includes('Insufficient credits') ?? false;
        return NextResponse.json(
          {
            error: result.error || 'Failed to deduct credits',
            ...(isInsufficient
              ? { required: cost, available: result.newBalance }
              : {}),
          },
          { status: isInsufficient ? 402 : 400 }
        );
      }

      // Check for credit warning (below 20% of monthly allocation)
      const creditBalance = await getCreditBalance(user.id);
      const isLowCredits =
        creditBalance.total > 0 &&
        creditBalance.total <= creditBalance.monthly * 0.2;
      const isZeroCredits = creditBalance.total <= 0;

      if (isLowCredits || isZeroCredits) {
        await logBillingEvent({
          userId: user.id,
          action: isZeroCredits ? 'credit_zero' : 'credit_warning',
          details: `Credit ${isZeroCredits ? 'zero' : 'low'} after ${action} deduction`,
          ipAddress: getClientIp(request),
          userAgent: getUserAgent(request),
          metadata: {
            action,
            cost,
            remainingCredits: result.newBalance,
          },
        });
      }

      return NextResponse.json({
        success: true,
        credits: result.newBalance,
        deducted: cost,
        action,
        alreadyProcessed: result.alreadyProcessed ?? false,
        ledgerEntryId: result.ledgerEntryId,
        creditWarning: isZeroCredits
          ? 'zero'
          : isLowCredits
            ? 'low'
            : 'ok',
        percentage:
          creditBalance.monthly > 0
            ? Math.round((result.newBalance / creditBalance.monthly) * 100)
            : 0,
      });
    } catch (error) {
      console.error('[API] Failed to deduct credits:', error);
      return NextResponse.json(
        { error: 'Failed to deduct credits' },
        { status: 500 }
      );
    }
  });
}
