// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/subscriptions/current
// Returns current subscription status, plan info, trial info, and credit balance
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getSubscriptionStatus } from '@/lib/subscription-service';
import { checkTrialStatus } from '@/lib/trial-service';
import { getCreditBalance } from '@/lib/credit-service';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Get subscription status (includes plan details and trial info)
      const subStatus = await getSubscriptionStatus(user.id);

      // If user is on trial, also get detailed trial status
      let trialDetails: { isActive: boolean; isExpired: boolean; hasUsedTrial: boolean; daysRemaining: number } | null = null;
      if (subStatus.trialInfo.isTrial) {
        const result = await checkTrialStatus(user.id);
        trialDetails = {
          isActive: result.isActive,
          isExpired: result.isExpired,
          hasUsedTrial: result.hasUsedTrial,
          daysRemaining: result.daysRemaining,
        };
      }

      // Get credit balance breakdown
      const creditBalance = await getCreditBalance(user.id);

      // Fetch full subscription record to get billingCycle and creditsResetAt
      const fullSubscription = subStatus.subscription
        ? await db.subscription.findUnique({
            where: { id: subStatus.subscription.id },
            select: {
              billingCycle: true,
              creditsTotal: true,
              creditsUsed: true,
              creditsRemaining: true,
              creditsResetAt: true,
            },
          })
        : null;

      return NextResponse.json({
        subscription: subStatus.subscription
          ? {
              id: subStatus.subscription.id,
              plan: subStatus.subscription.plan,
              status: subStatus.subscription.status,
              currentPeriodStart: subStatus.subscription.currentPeriodStart?.toISOString() ?? null,
              currentPeriodEnd: subStatus.subscription.currentPeriodEnd?.toISOString() ?? null,
              cancelAtPeriodEnd: subStatus.subscription.cancelAtPeriodEnd,
              scheduledPlanChange: subStatus.subscription.scheduledPlanChange,
              billingCycle: fullSubscription?.billingCycle ?? 'monthly',
              creditsTotal: fullSubscription?.creditsTotal ?? subStatus.planDetails.creditsMonthly,
              creditsUsed: fullSubscription?.creditsUsed ?? 0,
              creditsRemaining: fullSubscription?.creditsRemaining ?? subStatus.planDetails.creditsRemaining,
              creditsResetAt: fullSubscription?.creditsResetAt?.toISOString() ?? null,
            }
          : null,
        planDetails: subStatus.planDetails,
        trialInfo: {
          ...subStatus.trialInfo,
          trialEndsAt: subStatus.trialInfo.trialEndsAt?.toISOString() ?? null,
          ...(trialDetails
            ? {
                isExpired: trialDetails.isExpired,
                hasUsedTrial: trialDetails.hasUsedTrial,
              }
            : {}),
        },
        creditBalance: {
          total: creditBalance.total,
          monthly: creditBalance.monthly,
          rollover: creditBalance.rollover,
          addons: creditBalance.addons,
          plan: creditBalance.plan,
          percentage:
            creditBalance.monthly > 0
              ? Math.round((creditBalance.total / creditBalance.monthly) * 100)
              : 0,
        },
      });
    } catch (error) {
      console.error('[API] Failed to get subscription status:', error);
      return NextResponse.json(
        { error: 'Failed to get subscription status' },
        { status: 500 }
      );
    }
  });
}
