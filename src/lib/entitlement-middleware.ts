// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Backend Entitlement Enforcement Middleware
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// Provides reusable middleware functions for enforcing plan-based access
// control in API routes. Must be called AFTER authentication middleware
// (withAuth/withDualAuth) so that the user and their plan are resolved.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { canPerformAction, type FeatureKey, type PlanType, getUpgradeRequiredPlan, hasFeatureAccess } from '@/lib/entitlement-service';
import { db } from '@/lib/db';

/**
 * Middleware to check if a user's plan allows access to a specific feature.
 * Must be called AFTER authentication middleware (withAuth/withDualAuth).
 *
 * Usage:
 * ```
 * return withAuth(request, async (user) => {
 *   const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'deep_analysis');
 *   if (!entitlementCheck.allowed) return entitlementCheck.response!;
 *   // ... proceed with handler
 * });
 * ```
 */
export async function checkPlanEntitlement(
  userId: string,
  plan: string,
  feature: FeatureKey,
  currentUsage?: number
): Promise<{ allowed: boolean; response?: NextResponse; reason?: string; requiredPlan?: string }> {
  const planType = (plan || 'free') as PlanType;

  // Check if feature is enabled for this plan
  if (!hasFeatureAccess(planType, feature)) {
    const requiredPlan = getUpgradeRequiredPlan(planType, feature);

    return {
      allowed: false,
      reason: `Feature '${feature}' requires ${requiredPlan || 'a higher'} plan`,
      requiredPlan: requiredPlan || undefined,
      response: NextResponse.json(
        {
          error: `This feature requires a ${requiredPlan || 'higher'} plan. Please upgrade.`,
          code: 'PLAN_REQUIRED',
          feature,
          requiredPlan: requiredPlan || undefined,
        },
        { status: 403 }
      ),
    };
  }

  // Check usage limits
  const usageCheck = canPerformAction(planType, feature, currentUsage);
  if (!usageCheck.allowed) {
    return {
      allowed: false,
      reason: usageCheck.reason,
      response: NextResponse.json(
        {
          error: usageCheck.reason,
          code: 'USAGE_LIMIT_EXCEEDED',
          feature,
          limit: usageCheck.limit,
          used: usageCheck.used,
        },
        { status: 429 }
      ),
    };
  }

  return { allowed: true };
}

/**
 * Get current usage count for a feature from the database.
 * Used to provide currentUsage to checkPlanEntitlement for limit enforcement.
 */
export async function getFeatureUsage(userId: string, feature: FeatureKey): Promise<number> {
  // Map features to database queries
  switch (feature) {
    case 'lead_discovery': {
      const count = await db.lead.count({ where: { userId } });
      return count;
    }
    case 'outreach_messages': {
      const count = await db.outreachMessage.count({ where: { userId } });
      return count;
    }
    case 'team_members': {
      const orgMember = await db.orgMember.findFirst({
        where: { userId },
        include: { organization: { include: { members: true } } },
      });
      return orgMember?.organization?.members?.length ?? 1;
    }
    default:
      return 0;
  }
}
