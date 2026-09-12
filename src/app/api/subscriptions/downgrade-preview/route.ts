// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/subscriptions/downgrade-preview
// Preview a downgrade: credits remaining, new allocation, features lost, effective date
// NO actual change is made — this is purely a preview
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getSubscriptionStatus } from '@/lib/subscription-service';
import {
  PLAN_CREDITS,
  type PlanType,
  isValidPlanChange,
  getPlanChangeDirection,
  comparePlans,
} from '@/lib/entitlement-service';
import { getCreditBalance } from '@/lib/credit-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';

interface DowngradePreviewBody {
  plan: PlanType;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as DowngradePreviewBody;
      const { plan } = body;

      // Validate target plan
      if (!plan || !['free', 'pro'].includes(plan)) {
        return NextResponse.json(
          { error: 'Invalid target plan for downgrade. Must be "free" or "pro".' },
          { status: 400 }
        );
      }

      const currentPlan = (user.plan || 'free') as PlanType;

      // Validate plan change direction
      if (!isValidPlanChange(currentPlan, plan)) {
        return NextResponse.json(
          { error: `Cannot change from ${currentPlan} to ${plan}. You are already on this plan.` },
          { status: 400 }
        );
      }

      const direction = getPlanChangeDirection(currentPlan, plan);
      if (direction !== 'downgrade') {
        return NextResponse.json(
          { error: 'This is not a downgrade. Use the upgrade preview endpoint instead.' },
          { status: 400 }
        );
      }

      // Get current subscription info
      const subStatus = await getSubscriptionStatus(user.id);
      const creditBalance = await getCreditBalance(user.id);

      // Current plan credits remaining
      const currentCreditsRemaining = creditBalance.total;

      // New plan credit allocation
      const newPlanCredits = PLAN_CREDITS[plan] || PLAN_CREDITS.free;

      // Credit adjustment: user will LOSE credits if downgrading
      const creditLoss = Math.max(0, currentCreditsRemaining - newPlanCredits);

      // Feature comparison
      const planComparison = comparePlans(currentPlan, plan);

      // Effective date: end of current billing period
      const effectiveDate =
        subStatus.subscription?.currentPeriodEnd?.toISOString() ?? null;

      // Log the preview event
      await logBillingEvent({
        userId: user.id,
        action: 'downgrade_scheduled',
        details: `Downgrade preview: ${currentPlan} → ${plan}`,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
        metadata: {
          fromPlan: currentPlan,
          toPlan: plan,
          creditLoss,
          featuresLost: planComparison.lost.length,
          effectiveDate,
        },
      });

      return NextResponse.json({
        preview: true, // Indicates this is a preview, no changes made
        currentPlan,
        targetPlan: plan,
        credits: {
          currentCreditsRemaining,
          newPlanCredits,
          creditLoss,
          rolloverCreditsPreserved: creditBalance.rollover, // Rollover credits are preserved
        },
        features: {
          lost: planComparison.lost,
          gained: planComparison.gained, // Should be empty for downgrades
          limitDecreases: planComparison.limitIncreases
            ? [] // comparePlans returns 'limitIncreases' but for downgrades, limits decrease
            : [],
        },
        effectiveDate, // null means immediate
        isScheduled: effectiveDate !== null, // Downgrades are scheduled for end of period
        subscription: subStatus.subscription
          ? {
              currentPeriodEnd: subStatus.subscription.currentPeriodEnd?.toISOString() ?? null,
              cancelAtPeriodEnd: subStatus.subscription.cancelAtPeriodEnd,
              scheduledPlanChange: subStatus.subscription.scheduledPlanChange,
            }
          : null,
        warning: planComparison.lost.length > 0
          ? `You will lose access to ${planComparison.lost.length} feature(s) after downgrade: ${planComparison.lost.join(', ')}`
          : null,
      });
    } catch (error) {
      console.error('[API] Failed to preview downgrade:', error);
      return NextResponse.json(
        { error: 'Failed to preview downgrade' },
        { status: 500 }
      );
    }
  });
}
