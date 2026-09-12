// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/subscriptions/trial
// Returns trial status, days remaining, and features available during trial
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getTrialInfo } from '@/lib/trial-service';
import { getEntitlements, type PlanType } from '@/lib/entitlement-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const trialInfo = await getTrialInfo(user.id);

      // Get entitlements for the trial plan (pro)
      const trialPlan: PlanType = trialInfo.isActive ? trialInfo.plan : 'free';
      const entitlements = getEntitlements(trialPlan);

      // Features available during trial
      const availableFeatures = Object.entries(entitlements)
        .filter(([, config]) => config.enabled)
        .map(([feature]) => feature);

      return NextResponse.json({
        trial: {
          isActive: trialInfo.isActive,
          isExpired: trialInfo.isExpired,
          trialEndsAt: trialInfo.trialEndsAt?.toISOString() ?? null,
          startedAt: trialInfo.startedAt?.toISOString() ?? null,
          daysRemaining: trialInfo.daysRemaining,
          daysTotal: trialInfo.daysTotal,
          plan: trialInfo.plan,
          hasUsedTrial: trialInfo.hasUsedTrial,
        },
        features: {
          trialPlan,
          availableFeatures,
          featureCount: availableFeatures.length,
        },
      });
    } catch (error) {
      console.error('[API] Failed to get trial status:', error);
      return NextResponse.json(
        { error: 'Failed to get trial status' },
        { status: 500 }
      );
    }
  });
}
