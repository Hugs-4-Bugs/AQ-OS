// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Entitlements API Route
// Returns plan entitlements, enabled/disabled features, and
// plan comparison data for the authenticated user.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';
import {
  getEntitlements,
  getEnabledFeatures,
  getDisabledFeatures,
  getUpgradeRequiredPlan,
  type PlanType,
  type FeatureKey,
  type EntitlementsMap,
} from '@/lib/entitlement-service';
import { getCreditBalance } from '@/lib/credit-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const plan = (user.plan || 'free') as PlanType;
      const entitlements = getEntitlements(plan);
      const enabledFeatures = getEnabledFeatures(plan);
      const disabledFeatures = getDisabledFeatures(plan);
      const creditBalance = await getCreditBalance(user.id);

      // Build upgrade hints for disabled features
      const upgradeHints: Record<string, PlanType | null> = {};
      for (const feature of disabledFeatures) {
        upgradeHints[feature] = getUpgradeRequiredPlan(plan, feature);
      }

      return NextResponse.json({
        plan,
        entitlements,
        enabledFeatures,
        disabledFeatures,
        upgradeHints,
        credits: creditBalance,
      });
    } catch (error) {
      console.error('[EntitlementsAPI] Error fetching entitlements:', error);
      return NextResponse.json(
        { error: 'Failed to fetch entitlements' },
        { status: 500 }
      );
    }
  });
}
