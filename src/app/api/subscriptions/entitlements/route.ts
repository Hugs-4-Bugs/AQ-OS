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
} from '@/lib/entitlement-service';
import { getEffectivePlan, isPlatformAdminWithFullAccess } from '@/lib/platform-admin-policy';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // ISSUE 8: Platform admins (super_admin, admin) always receive
      // elite-tier entitlements, regardless of their DB plan field.
      // This is the centralized policy — do not check plan/role inline
      // anywhere else.
      const plan = getEffectivePlan({ role: user.role, plan: user.plan });
      const isPlatformAdmin = isPlatformAdminWithFullAccess(user.role);

      // Get full entitlements for the (effective) plan
      const entitlements = getEntitlements(plan);

      // Get disabled features list
      const disabledFeatures = isPlatformAdmin ? [] : getDisabledFeatures(plan);

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
        // Surface the platform-admin flag so the frontend can hide
        // upgrade CTAs and trial banners without re-deriving the policy.
        isPlatformAdmin,
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
