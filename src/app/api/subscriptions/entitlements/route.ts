// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/subscriptions/entitlements
// Returns entitlements, disabled features, and plan level for the current plan
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getEntitlements,
  getDisabledFeatures,
  getPlanLevel,
  type PlanType,
} from '@/lib/entitlement-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const plan = (user.plan || 'free') as PlanType;

      // Get full entitlements for the plan
      const entitlements = getEntitlements(plan);

      // Get disabled features list
      const disabledFeatures = getDisabledFeatures(plan);

      // Get plan level
      const planLevel = getPlanLevel(plan);

      return NextResponse.json({
        plan,
        planLevel,
        entitlements,
        disabledFeatures,
        totalFeatures: Object.keys(entitlements).length,
        enabledFeaturesCount:
          Object.values(entitlements).filter((e) => e.enabled).length,
        disabledFeaturesCount: disabledFeatures.length,
      });
    } catch (error) {
      console.error('[API] Failed to get entitlements:', error);
      return NextResponse.json(
        { error: 'Failed to get entitlements' },
        { status: 500 }
      );
    }
  });
}
