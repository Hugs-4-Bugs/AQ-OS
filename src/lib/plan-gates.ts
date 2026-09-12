// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Backend Plan Gates Middleware
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// Reusable wrappers for API routes that enforce plan, feature,
// credit, and team access requirements before allowing a handler
// to execute. Each gate authenticates first, then checks the
// requirement, and returns a structured error on failure.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, AuthError } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import {
  checkEntitlement,
  hasFeatureAccess,
  getPlanLevel,
  getUpgradeRequiredPlan,
  type PlanType,
  type FeatureKey,
} from '@/lib/entitlement-service';
import { checkCreditSufficiency, CREDIT_COSTS, type CreditAction } from '@/lib/credit-service';
import { logEntitlementEvent, logBillingEvent } from '@/lib/billing-audit';
import { db } from '@/lib/db';

// ===== TYPES =====

export interface CreditCheckResult {
  sufficient: boolean;
  balance: number;
  required: number;
  shortfall: number;
  action: string;
}

export interface BillingGateContext {
  user: AuthUser;
  plan: PlanType;
  creditInfo?: CreditCheckResult;
  feature?: FeatureKey;
}

type PlanLevel = 'free' | 'pro' | 'elite';

// ===== HELPER: STRUCTURED ERROR RESPONSES =====

function planRequiredResponse(required: PlanType, current: PlanType): NextResponse {
  return NextResponse.json(
    {
      error: 'Plan upgrade required',
      code: 'PLAN_REQUIRED',
      required,
      current,
      upgradeUrl: '/api/subscriptions/upgrade-preview',
    },
    { status: 403 }
  );
}

function featureRequiredResponse(
  feature: string,
  currentPlan: PlanType,
  requiredPlan: PlanType | null
): NextResponse {
  return NextResponse.json(
    {
      error: `Feature '${feature}' is not available on your plan`,
      code: 'FEATURE_REQUIRED',
      feature,
      currentPlan,
      requiredPlan: requiredPlan || 'elite',
      upgradeUrl: '/api/subscriptions/upgrade-preview',
    },
    { status: 403 }
  );
}

function insufficientCreditsResponse(
  required: number,
  available: number,
  action: string
): NextResponse {
  return NextResponse.json(
    {
      error: 'Insufficient credits',
      code: 'INSUFFICIENT_CREDITS',
      required,
      available,
      deficit: required - available,
      action,
    },
    { status: 402 }
  );
}

function teamAccessRequiredResponse(minimumRole: string): NextResponse {
  return NextResponse.json(
    {
      error: 'Team access denied',
      code: 'TEAM_ACCESS_REQUIRED',
      minimumRole,
      upgradeUrl: '/api/subscriptions/upgrade-preview',
    },
    { status: 403 }
  );
}

function authRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Authentication required', code: 'AUTH_REQUIRED' },
    { status: 401 }
  );
}

// ===== GATE FUNCTIONS =====

/**
 * Require minimum plan level.
 * Authenticates the user first, then checks if their plan meets
 * the required level (free < pro < elite).
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   return withPlan(request, 'pro', async (user) => {
 *     // Only pro and elite users reach here
 *     return NextResponse.json({ data: 'secret' });
 *   });
 * }
 */
export async function withPlan(
  request: NextRequest,
  requiredPlan: PlanLevel,
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Step 1: Authenticate
    const user = await getAuthUser(request);
    if (!user) {
      return authRequiredResponse();
    }

    // Step 2: Check plan level
    const userPlan = (user.plan || 'free') as PlanType;
    const userLevel = getPlanLevel(userPlan);
    const requiredLevel = getPlanLevel(requiredPlan as PlanType);

    if (userLevel < requiredLevel) {
      // Step 3: Log audit event for denied access
      await logEntitlementEvent(user.id, 'feature_blocked', {
        feature: 'plan_gate',
        plan: userPlan,
        reason: `Plan level ${requiredPlan} required, user has ${userPlan}`,
        requiredPlan: requiredPlan,
      });

      // Step 4: Return structured error
      return planRequiredResponse(requiredPlan, userPlan);
    }

    // Step 5: Plan check passed — call handler
    return handler(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[PlanGate] withPlan error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Require specific feature access.
 * Authenticates the user, then checks if their plan has the
 * specified feature enabled.
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   return withFeature(request, 'deep_analysis', async (user) => {
 *     // Only users whose plan includes deep_analysis reach here
 *     return NextResponse.json({ analysis: '...' });
 *   });
 * }
 */
export async function withFeature(
  request: NextRequest,
  feature: string,
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Step 1: Authenticate
    const user = await getAuthUser(request);
    if (!user) {
      return authRequiredResponse();
    }

    // Step 2: Check feature access
    const userPlan = (user.plan || 'free') as PlanType;
    const featureKey = feature as FeatureKey;
    const hasAccess = hasFeatureAccess(userPlan, featureKey);

    if (!hasAccess) {
      // Step 3: Determine the upgrade plan needed
      const requiredPlan = getUpgradeRequiredPlan(userPlan, featureKey);

      // Step 4: Log audit event for denied access
      await logEntitlementEvent(user.id, 'feature_blocked', {
        feature,
        plan: userPlan,
        reason: `Feature '${feature}' is not available on the ${userPlan} plan`,
        requiredPlan: requiredPlan || undefined,
      });

      // Step 5: Return structured error
      return featureRequiredResponse(feature, userPlan, requiredPlan);
    }

    // Step 6: Feature check passed — call handler
    return handler(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[PlanGate] withFeature error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Require sufficient credits for an action.
 * Authenticates the user, then checks if they have enough credits
 * for the specified action. Does NOT deduct credits — that should
 * be done inside the handler after the check passes.
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   return withCredits(request, 'deep_analysis', async (user, creditInfo) => {
 *     // User has enough credits — deduct and proceed
 *     await deductCredits({ userId: user.id, action: 'deep_analysis', cost: creditInfo.required });
 *     return NextResponse.json({ result: '...' });
 *   });
 * }
 */
export async function withCredits(
  request: NextRequest,
  action: string,
  handler: (user: AuthUser, creditInfo: CreditCheckResult) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Step 1: Authenticate
    const user = await getAuthUser(request);
    if (!user) {
      return authRequiredResponse();
    }

    // Step 2: Determine credit cost for the action
    const creditAction = action as CreditAction;
    const cost = CREDIT_COSTS[creditAction] ?? 0;

    // If the action has no credit cost, allow through
    if (cost === 0) {
      return handler(user, {
        sufficient: true,
        balance: 0,
        required: 0,
        shortfall: 0,
        action,
      });
    }

    // Step 3: Check credit sufficiency
    const sufficiency = await checkCreditSufficiency(user.id, cost);

    const creditInfo: CreditCheckResult = {
      sufficient: sufficiency.sufficient,
      balance: sufficiency.balance,
      required: cost,
      shortfall: sufficiency.shortfall,
      action,
    };

    if (!sufficiency.sufficient) {
      // Step 4: Log audit event for denied access
      await logBillingEvent({
        userId: user.id,
        action: 'entitlement_denied',
        details: `Insufficient credits for action '${action}': need ${cost}, have ${sufficiency.balance}`,
        metadata: {
          action,
          required: cost,
          available: sufficiency.balance,
          shortfall: sufficiency.shortfall,
        },
      });

      // Step 5: Return structured error
      return insufficientCreditsResponse(cost, sufficiency.balance, action);
    }

    // Step 6: Credits check passed — call handler with credit info
    return handler(user, creditInfo);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[PlanGate] withCredits error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Require team access (org member with specific role).
 * Authenticates the user, then checks if they are a member of
 * an organization with at least the specified role.
 *
 * Role hierarchy: viewer < member < admin < owner
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   return withTeamAccess(request, 'admin', async (user) => {
 *     // Only org admins+ reach here
 *     return NextResponse.json({ teamData: '...' });
 *   });
 * }
 */
export async function withTeamAccess(
  request: NextRequest,
  minimumRole: string,
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Step 1: Authenticate
    const user = await getAuthUser(request);
    if (!user) {
      return authRequiredResponse();
    }

    // Step 2: Check if user has an organization
    if (!user.orgId) {
      await logBillingEvent({
        userId: user.id,
        action: 'entitlement_denied',
        details: `Team access required but user has no organization`,
        metadata: { minimumRole, reason: 'no_organization' },
      });

      return teamAccessRequiredResponse(minimumRole);
    }

    // Step 3: Check user's role in the organization
    const orgMember = await db.orgMember.findUnique({
      where: {
        orgId_userId: {
          orgId: user.orgId,
          userId: user.id,
        },
      },
      select: { role: true },
    });

    if (!orgMember) {
      await logBillingEvent({
        userId: user.id,
        action: 'entitlement_denied',
        details: `Team access required but user is not an org member`,
        metadata: { minimumRole, orgId: user.orgId, reason: 'not_member' },
      });

      return teamAccessRequiredResponse(minimumRole);
    }

    // Step 4: Check role level
    const ROLE_LEVELS: Record<string, number> = {
      viewer: 0,
      member: 1,
      admin: 2,
      owner: 3,
    };

    const userRoleLevel = ROLE_LEVELS[orgMember.role] ?? 0;
    const requiredRoleLevel = ROLE_LEVELS[minimumRole] ?? 0;

    if (userRoleLevel < requiredRoleLevel) {
      await logBillingEvent({
        userId: user.id,
        action: 'entitlement_denied',
        details: `Team access denied: required role '${minimumRole}', user has '${orgMember.role}'`,
        metadata: {
          minimumRole,
          actualRole: orgMember.role,
          orgId: user.orgId,
          reason: 'insufficient_role',
        },
      });

      return teamAccessRequiredResponse(minimumRole);
    }

    // Step 5: Team access check passed — call handler
    return handler(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[PlanGate] withTeamAccess error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Combined gate: auth + plan + feature + credits.
 * Performs all specified checks in sequence. If any check fails,
 * returns the appropriate error response. If all pass, calls the
 * handler with the user and billing context.
 *
 * Only the checks specified in `options` are performed —
 * omitted options are skipped.
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   return withBillingGate(
 *     request,
 *     { plan: 'pro', feature: 'deep_analysis', action: 'deep_analysis' },
 *     async (user, context) => {
 *       // User is authenticated, on pro+, has deep_analysis,
 *       // and has enough credits
 *       await deductCredits({ userId: user.id, action: 'deep_analysis', cost: context.creditInfo!.required });
 *       return NextResponse.json({ result: '...' });
 *     }
 *   );
 * }
 */
export async function withBillingGate(
  request: NextRequest,
  options: {
    plan?: string;
    feature?: string;
    action?: string;
    permission?: string;
  },
  handler: (user: AuthUser, context: BillingGateContext) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Step 1: Authenticate
    const user = await getAuthUser(request);
    if (!user) {
      return authRequiredResponse();
    }

    const userPlan = (user.plan || 'free') as PlanType;
    const context: BillingGateContext = {
      user,
      plan: userPlan,
    };

    // Step 2: Check plan level (if required)
    if (options.plan) {
      const requiredPlan = options.plan as PlanType;
      const userLevel = getPlanLevel(userPlan);
      const requiredLevel = getPlanLevel(requiredPlan);

      if (userLevel < requiredLevel) {
        await logEntitlementEvent(user.id, 'feature_blocked', {
          feature: 'billing_gate_plan',
          plan: userPlan,
          reason: `Plan ${requiredPlan} required, user has ${userPlan}`,
          requiredPlan: requiredPlan,
        });

        return planRequiredResponse(requiredPlan, userPlan);
      }
    }

    // Step 3: Check feature access (if required)
    if (options.feature) {
      const featureKey = options.feature as FeatureKey;
      const hasAccess = hasFeatureAccess(userPlan, featureKey);

      if (!hasAccess) {
        const requiredPlan = getUpgradeRequiredPlan(userPlan, featureKey);

        await logEntitlementEvent(user.id, 'feature_blocked', {
          feature: options.feature,
          plan: userPlan,
          reason: `Feature '${options.feature}' not available on ${userPlan} plan`,
          requiredPlan: requiredPlan || undefined,
        });

        return featureRequiredResponse(options.feature, userPlan, requiredPlan);
      }

      context.feature = featureKey;
    }

    // Step 4: Check credit sufficiency (if required)
    if (options.action) {
      const creditAction = options.action as CreditAction;
      const cost = CREDIT_COSTS[creditAction] ?? 0;

      if (cost > 0) {
        const sufficiency = await checkCreditSufficiency(user.id, cost);

        const creditInfo: CreditCheckResult = {
          sufficient: sufficiency.sufficient,
          balance: sufficiency.balance,
          required: cost,
          shortfall: sufficiency.shortfall,
          action: options.action,
        };

        context.creditInfo = creditInfo;

        if (!sufficiency.sufficient) {
          await logBillingEvent({
            userId: user.id,
            action: 'entitlement_denied',
            details: `Insufficient credits for '${options.action}': need ${cost}, have ${sufficiency.balance}`,
            metadata: {
              action: options.action,
              required: cost,
              available: sufficiency.balance,
              shortfall: sufficiency.shortfall,
            },
          });

          return insufficientCreditsResponse(cost, sufficiency.balance, options.action);
        }
      } else {
        // No cost for this action — allow through with zero info
        context.creditInfo = {
          sufficient: true,
          balance: 0,
          required: 0,
          shortfall: 0,
          action: options.action,
        };
      }
    }

    // Step 5: All checks passed — call handler with context
    return handler(user, context);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[PlanGate] withBillingGate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
