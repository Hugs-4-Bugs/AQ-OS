// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Plan Entitlement System
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logEntitlementEvent } from '@/lib/billing-audit';

// ===== TYPES =====

export type PlanType = 'free' | 'starter' | 'pro' | 'elite';

export type FeatureKey =
  | 'lead_discovery'
  | 'deep_analysis'
  | 'outreach_messages'
  | 'outreach_sequences'
  | 'sales_coaching'
  | 'proposal_generation'
  | 'competitor_analysis'
  | 'data_export'
  | 'gmail_integration'
  | 'whatsapp_integration'
  | 'telegram_access'
  | 'workflow_access'
  | 'autopilot_access'
  | 'api_access'
  | 'chatbot_access'
  | 'team_members'
  | 'white_label'
  | 'custom_integrations'
  | 'business_profiles';

export interface EntitlementConfig {
  limit: number | null; // null = unlimited
  enabled: boolean;
}

export type EntitlementsMap = Record<FeatureKey, EntitlementConfig>;

// ===== ENTITLEMENT CONFIGURATION =====
// Centralized plan entitlements — DO NOT hardcode in routes, use this config.

export const ENTITLEMENTS: Record<PlanType, EntitlementsMap> = {
  free: {
    lead_discovery:       { limit: 10,  enabled: true },
    deep_analysis:        { limit: 0,   enabled: false },
    outreach_messages:    { limit: 50,  enabled: true },
    outreach_sequences:   { limit: 0,   enabled: false },
    sales_coaching:       { limit: 0,   enabled: false },
    proposal_generation:  { limit: 0,   enabled: false },
    competitor_analysis:  { limit: 0,   enabled: false },
    data_export:          { limit: 0,   enabled: false },
    gmail_integration:    { limit: 0,   enabled: false },
    whatsapp_integration: { limit: 0,   enabled: false },
    telegram_access:      { limit: 0,   enabled: false },
    workflow_access:      { limit: 0,   enabled: false },
    api_access:           { limit: 0,   enabled: false },
    chatbot_access:       { limit: 0,   enabled: false },
    team_members:         { limit: 1,   enabled: true },
    white_label:          { limit: 0,   enabled: false },
    custom_integrations:  { limit: 0,   enabled: false },
    // Active Business Profiles (limit applies to ACTIVE profiles only):
    // free=1, starter=1, pro=3, elite=7 — enforced server-side in the
    // profile CRUD routes. Downgrade never deletes profiles; archived and
    // over-limit profiles are preserved read-only.
    business_profiles:    { limit: 1,   enabled: true },
    // Autopilot (niche-based automated client acquisition): Pro/Elite only.
    // limit = max ACTIVE+RUNNING autopilot workflows (3 for Pro, 7 for Elite).
    // Enforced server-side in /api/autopilot routes — UI hiding is NOT
    // enforcement. Downgrade (DISABLED) never deletes autopilot history.
    autopilot_access:     { limit: 0,   enabled: false },
  },
  // Starter — basic features only (final pricing/plan update, Sep 2026).
  // Same feature set as Free except the monthly lead limit is 25.
  starter: {
    lead_discovery:       { limit: 25,  enabled: true },
    deep_analysis:        { limit: 0,   enabled: false },
    outreach_messages:    { limit: 50,  enabled: true },
    outreach_sequences:   { limit: 0,   enabled: false },
    sales_coaching:       { limit: 0,   enabled: false },
    proposal_generation:  { limit: 0,   enabled: false },
    competitor_analysis:  { limit: 0,   enabled: false },
    data_export:          { limit: 0,   enabled: false },
    gmail_integration:    { limit: 0,   enabled: false },
    whatsapp_integration: { limit: 0,   enabled: false },
    telegram_access:      { limit: 0,   enabled: false },
    workflow_access:      { limit: 0,   enabled: false },
    api_access:           { limit: 0,   enabled: false },
    chatbot_access:       { limit: 0,   enabled: false },
    team_members:         { limit: 1,   enabled: true },
    white_label:          { limit: 0,   enabled: false },
    custom_integrations:  { limit: 0,   enabled: false },
    business_profiles:    { limit: 1,   enabled: true },
    autopilot_access:     { limit: 0,   enabled: false },
  },
  pro: {
    lead_discovery:       { limit: null, enabled: true },
    deep_analysis:        { limit: null, enabled: true },
    outreach_messages:    { limit: null, enabled: true },
    outreach_sequences:   { limit: null, enabled: true },
    sales_coaching:       { limit: null, enabled: true },
    proposal_generation:  { limit: null, enabled: true },
    competitor_analysis:  { limit: null, enabled: true },
    data_export:          { limit: null, enabled: true },
    gmail_integration:    { limit: null, enabled: true },
    whatsapp_integration: { limit: 0,   enabled: false },
    telegram_access:      { limit: 0,   enabled: false },
    workflow_access:      { limit: null, enabled: true },
    api_access:           { limit: null, enabled: true },
    chatbot_access:       { limit: null, enabled: true },
    team_members:         { limit: 3,   enabled: true },
    white_label:          { limit: 0,   enabled: false },
    custom_integrations:  { limit: 0,   enabled: false },
    business_profiles:    { limit: 3,   enabled: true },
    autopilot_access:     { limit: 3,   enabled: true },
  },
  elite: {
    lead_discovery:       { limit: null, enabled: true },
    deep_analysis:        { limit: null, enabled: true },
    outreach_messages:    { limit: null, enabled: true },
    outreach_sequences:   { limit: null, enabled: true },
    sales_coaching:       { limit: null, enabled: true },
    proposal_generation:  { limit: null, enabled: true },
    competitor_analysis:  { limit: null, enabled: true },
    data_export:          { limit: null, enabled: true },
    gmail_integration:    { limit: null, enabled: true },
    whatsapp_integration: { limit: null, enabled: true },
    telegram_access:      { limit: null, enabled: true },
    workflow_access:      { limit: null, enabled: true },
    api_access:           { limit: null, enabled: true },
    chatbot_access:       { limit: null, enabled: true },
    team_members:         { limit: 10,  enabled: true },
    white_label:          { limit: null, enabled: true },
    custom_integrations:  { limit: null, enabled: true },
    business_profiles:    { limit: 7,   enabled: true },
    autopilot_access:     { limit: 7,   enabled: true },
  },
};

// Plan hierarchy for comparison
const PLAN_LEVELS: Record<PlanType, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  elite: 3,
};

// Plan monthly credit allocations (final pricing/plan update, Sep 2026):
//   Free 50 · Starter 150 · Pro 750 · Elite 2,000
export const PLAN_CREDITS: Record<PlanType, number> = {
  free: 50,
  starter: 150,
  pro: 750,
  elite: 2000,
};

// ===== ENTITLEMENT QUERY FUNCTIONS =====

/**
 * Get all entitlements for a plan.
 * Returns a copy of the entitlement config for the given plan.
 */
export function getEntitlements(plan: PlanType): EntitlementsMap {
  const entitlements = ENTITLEMENTS[plan];
  if (!entitlements) {
    return ENTITLEMENTS.free;
  }
  // Return a deep copy to prevent mutation
  return JSON.parse(JSON.stringify(entitlements));
}

/**
 * Check if a plan has a specific feature enabled.
 * Returns false if the plan or feature doesn't exist.
 */
export function checkEntitlement(plan: PlanType, feature: FeatureKey): boolean {
  const entitlements = ENTITLEMENTS[plan];
  if (!entitlements) return false;
  const entitlement = entitlements[feature];
  return entitlement?.enabled ?? false;
}

/**
 * Get the limit for a feature on a given plan.
 * Returns null for unlimited, 0 for disabled features.
 */
export function getFeatureLimit(plan: PlanType, feature: FeatureKey): number | null {
  const entitlements = ENTITLEMENTS[plan];
  if (!entitlements) return 0;
  const entitlement = entitlements[feature];
  if (!entitlement || !entitlement.enabled) return 0;
  return entitlement.limit;
}

/**
 * Boolean check for feature access (enabled AND not at limit 0).
 */
export function hasFeatureAccess(plan: PlanType, feature: FeatureKey): boolean {
  return checkEntitlement(plan, feature);
}

/**
 * Get numeric plan level for comparison.
 * free=0, starter=1, pro=2, elite=3
 */
export function getPlanLevel(plan: PlanType): number {
  return PLAN_LEVELS[plan] ?? 0;
}

/**
 * Check if user can perform an action considering their plan limits and current usage.
 * Returns { allowed, reason, limit, used } object.
 */
export function canPerformAction(
  plan: PlanType,
  action: FeatureKey,
  currentUsage?: number
): { allowed: boolean; reason?: string; limit: number | null; used: number } {
  const entitlement = ENTITLEMENTS[plan]?.[action];

  if (!entitlement) {
    return { allowed: false, reason: 'Feature not found', limit: 0, used: currentUsage ?? 0 };
  }

  if (!entitlement.enabled) {
    return {
      allowed: false,
      reason: `Feature '${action}' is not available on the ${plan} plan`,
      limit: 0,
      used: currentUsage ?? 0,
    };
  }

  // If limit is null, it's unlimited
  if (entitlement.limit === null) {
    return { allowed: true, limit: null, used: currentUsage ?? 0 };
  }

  const used = currentUsage ?? 0;
  if (used >= entitlement.limit) {
    return {
      allowed: false,
      reason: `Usage limit reached for '${action}' on the ${plan} plan (${entitlement.limit})`,
      limit: entitlement.limit,
      used,
    };
  }

  return { allowed: true, limit: entitlement.limit, used };
}

/**
 * Get the minimum plan needed for a feature.
 * Walks up the plan hierarchy to find the first plan that has the feature enabled.
 */
export function getUpgradeRequiredPlan(currentPlan: PlanType, feature: FeatureKey): PlanType | null {
  const planOrder: PlanType[] = ['free', 'starter', 'pro', 'elite'];

  for (const plan of planOrder) {
    if (PLAN_LEVELS[plan] > PLAN_LEVELS[currentPlan] && checkEntitlement(plan, feature)) {
      return plan;
    }
  }

  // Feature might not be available on any plan
  return null;
}

/**
 * Get all features that are disabled for a given plan.
 */
export function getDisabledFeatures(plan: PlanType): FeatureKey[] {
  const entitlements = ENTITLEMENTS[plan];
  if (!entitlements) return [];

  return (Object.keys(entitlements) as FeatureKey[]).filter(
    (feature) => !entitlements[feature].enabled
  );
}

/**
 * Get all features that are enabled for a given plan.
 */
export function getEnabledFeatures(plan: PlanType): FeatureKey[] {
  const entitlements = ENTITLEMENTS[plan];
  if (!entitlements) return [];

  return (Object.keys(entitlements) as FeatureKey[]).filter(
    (feature) => entitlements[feature].enabled
  );
}

/**
 * Compare two plans and return the differences in entitlements.
 * Useful for showing upgrade comparisons.
 */
export function comparePlans(basePlan: PlanType, targetPlan: PlanType): {
  gained: FeatureKey[];
  lost: FeatureKey[];
  limitIncreases: Array<{ feature: FeatureKey; from: number | null; to: number | null }>;
} {
  const baseEntitlements = ENTITLEMENTS[basePlan];
  const targetEntitlements = ENTITLEMENTS[targetPlan];

  const gained: FeatureKey[] = [];
  const lost: FeatureKey[] = [];
  const limitIncreases: Array<{ feature: FeatureKey; from: number | null; to: number | null }> = [];

  const allFeatures = new Set<FeatureKey>([
    ...(Object.keys(baseEntitlements) as FeatureKey[]),
    ...(Object.keys(targetEntitlements) as FeatureKey[]),
  ]);

  for (const feature of allFeatures) {
    const base = baseEntitlements[feature];
    const target = targetEntitlements[feature];

    if (!base?.enabled && target?.enabled) {
      gained.push(feature);
    } else if (base?.enabled && !target?.enabled) {
      lost.push(feature);
    } else if (base?.enabled && target?.enabled) {
      // Both enabled — check if limit increased
      if (target.limit === null && base.limit !== null) {
        limitIncreases.push({ feature, from: base.limit, to: null });
      } else if (typeof target.limit === 'number' && typeof base.limit === 'number' && target.limit > base.limit) {
        limitIncreases.push({ feature, from: base.limit, to: target.limit });
      }
    }
  }

  return { gained, lost, limitIncreases };
}

/**
 * Check if a plan upgrade is valid (following hierarchy).
 */
export function isValidPlanChange(fromPlan: PlanType, toPlan: PlanType): boolean {
  return PLAN_LEVELS[fromPlan] !== PLAN_LEVELS[toPlan];
}

/**
 * Determine if a plan change is an upgrade or downgrade.
 */
export function getPlanChangeDirection(
  fromPlan: PlanType,
  toPlan: PlanType
): 'upgrade' | 'downgrade' | 'same' {
  const fromLevel = PLAN_LEVELS[fromPlan];
  const toLevel = PLAN_LEVELS[toPlan];

  if (toLevel > fromLevel) return 'upgrade';
  if (toLevel < fromLevel) return 'downgrade';
  return 'same';
}

/**
 * Check feature access and log an entitlement denied event if blocked.
 * Use this in API routes as a gate.
 */
export async function requireFeatureAccess(
  userId: string,
  plan: PlanType,
  feature: FeatureKey,
  currentUsage?: number
): Promise<{ allowed: boolean; reason?: string; requiredPlan?: PlanType }> {
  const result = canPerformAction(plan, feature, currentUsage);

  if (!result.allowed) {
    const requiredPlan = getUpgradeRequiredPlan(plan, feature);

    await logEntitlementEvent(userId, 'feature_blocked', {
      feature,
      plan,
      reason: result.reason || 'Access denied',
      requiredPlan: requiredPlan || undefined,
    });

    return {
      allowed: false,
      reason: result.reason,
      requiredPlan: requiredPlan || undefined,
    };
  }

  return { allowed: true };
}

// ===== DATABASE SEEDING =====

/**
 * Seed the PlanEntitlement table from the ENTITLEMENTS config.
 * Upserts each entitlement record.
 * Can be called during app initialization or migration.
 */
export async function seedPlanEntitlements(): Promise<{ seeded: number; errors: number }> {
  let seeded = 0;
  let errors = 0;

  const plans: PlanType[] = ['free', 'starter', 'pro', 'elite'];

  for (const plan of plans) {
    const entitlements = ENTITLEMENTS[plan];
    for (const [feature, config] of Object.entries(entitlements)) {
      try {
        await db.planEntitlement.upsert({
          where: {
            plan_feature: { plan, feature },
          },
          create: {
            plan,
            feature,
            limit: config.limit,
            enabled: config.enabled,
          },
          update: {
            limit: config.limit,
            enabled: config.enabled,
          },
        });
        seeded++;
      } catch (error) {
        console.error(`[EntitlementService] Failed to seed ${plan}/${feature}:`, error);
        errors++;
      }
    }
  }

  return { seeded, errors };
}

/**
 * Get entitlements from the database (PlanEntitlement table).
 * Falls back to in-memory config if DB query fails.
 */
export async function getEntitlementsFromDB(plan: PlanType): Promise<EntitlementsMap> {
  try {
    const records = await db.planEntitlement.findMany({
      where: { plan },
    });

    if (records.length === 0) {
      return getEntitlements(plan);
    }

    const result: Partial<EntitlementsMap> = {};
    for (const record of records) {
      result[record.feature as FeatureKey] = {
        limit: record.limit,
        enabled: record.enabled,
      };
    }

    // Fill in any missing features from the in-memory config
    const defaults = ENTITLEMENTS[plan];
    for (const [feature, config] of Object.entries(defaults)) {
      if (!result[feature as FeatureKey]) {
        result[feature as FeatureKey] = config;
      }
    }

    return result as EntitlementsMap;
  } catch (error) {
    console.error('[EntitlementService] DB query failed, using in-memory config:', error);
    return getEntitlements(plan);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 23 — Canonical user-resolved entitlement contract.
//
// getUserEntitlements(userId) is the single server-side entry point that
// resolves a user's CURRENT plan (mirroring the auth.ts:824-827 plan
// resolution: active subscription's plan → user.plan → 'free') and
// returns the structured entitlement summary that every Autopilot /
// profile / workflow gate consumes.
//
// The function is intentionally side-effect-free (no logging, no writes)
// so it is safe to call from the scheduler tick, the manual-run path,
// and any API route that needs a one-shot snapshot.
//
// It DOES count current usage (ACTIVE+RUNNING autopilots, ACTIVE
// business profiles) in parallel — that count is read-only and bounded
// by the user's own rows. If a downstream caller needs the count too,
// reusing the snapshot avoids an extra round-trip.
// ═══════════════════════════════════════════════════════════════════

/**
 * Normalize a raw plan string from the DB (User.plan or Subscription.plan)
 * to a canonical PlanType. Unknown / missing plans map to 'free' — this is
 * a SAFE-DENY: an unrecognized plan value (e.g. legacy 'enterprise') never
 * gains Autopilot access. Mirrors autopilot/service.ts:normalizePlan — the
 * function is duplicated here to keep entitlement-service.ts free of
 * circular imports (service.ts imports FROM entitlement-service).
 */
function normalizePlan(plan?: string | null): PlanType {
  const p = (plan || 'free').toLowerCase();
  if (p === 'free' || p === 'starter' || p === 'pro' || p === 'elite') return p;
  return 'free';
}

export interface UserEntitlementAutopilot {
  /** True iff plan is pro or elite (the only plans with autopilot_access.enabled). */
  allowed: boolean;
  /** Plan-defined max ACTIVE+RUNNING autopilots. 0 when not allowed. */
  limit: number;
  /** CURRENT count of ACTIVE+RUNNING autopilots for this user (live). */
  used: number;
  /** True iff the user has more active autopilots than the current plan
   *  allows — only possible after a downgrade; configurations are PRESERVED
   *  (never auto-deleted) but the scheduler will not fire the surplus. */
  overLimit: boolean;
}

export interface UserEntitlementProfiles {
  /** Plan-defined max ACTIVE business profiles. */
  limit: number;
  /** CURRENT count of ACTIVE business profiles for this user (live). */
  used: number;
  /** True iff the user has more active profiles than the current plan
   *  allows — only possible after a downgrade; profiles are PRESERVED
   *  (never auto-deleted) but new creation/activation is blocked. */
  overLimit: boolean;
}

export interface UserEntitlementSummary {
  userId: string;
  /** Canonical resolved plan (active subscription's plan → user.plan → 'free'). */
  plan: PlanType;
  /** Numeric plan level (free=0, starter=1, pro=2, elite=3) for ordering. */
  planLevel: number;
  /** Whether Autopilot autonomous functionality is allowed for this plan. */
  autopilot: UserEntitlementAutopilot;
  /** Business Profile limits + current usage. */
  profiles: UserEntitlementProfiles;
  /** Whether the user's plan may use WorkflowDefinition (workflow_access feature). */
  workflow: { eligible: boolean; limit: number | null };
  /** Monthly credit allocation for the user's plan (informational). */
  credits: { monthlyAllocation: number };
  /**
   * 'db' — user row was found and the plan was resolved from DB.
   * 'fallback' — user row not found; returned a safe-deny 'free' summary
   *              so unknown userIds can never gain access.
   */
  source: 'db' | 'fallback';
}

/**
 * Resolve the canonical entitlement summary for a user. This is the
 * single server-side authority that every Autopilot / profile / workflow
 * gate should consult — never trust a client-supplied plan or a stale
 * cached value.
 *
 * Resolution order (mirrors auth.ts mapUserToAuthUser):
 *   1. active/trialing subscription's plan
 *   2. user.plan column
 *   3. 'free' (safe-deny)
 *
 * Usage counts (autopilots + profiles) are queried IN PARALLEL — the
 * snapshot is a consistent read of "what is the user's plan + how many
 * active things do they have RIGHT NOW".
 */
export async function getUserEntitlements(
  userId: string
): Promise<UserEntitlementSummary> {
  // Load user + their active subscription in one query (the same shape
  // auth.ts uses to resolve AuthUser.plan at request time).
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      plan: true,
      subscriptions: {
        where: { status: { in: ['active', 'trialing'] } },
        select: { plan: true, status: true },
        // take:1 + orderBy:updatedAt desc — if more than one sub is
        // somehow active, the most recently updated wins (matches auth.ts).
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!user) {
    // Unknown user — safe-deny to a 'free' summary with zero usage.
    return {
      userId,
      plan: 'free',
      planLevel: PLAN_LEVELS.free,
      autopilot: { allowed: false, limit: 0, used: 0, overLimit: false },
      profiles: { limit: ENTITLEMENTS.free.business_profiles.limit ?? 0, used: 0, overLimit: false },
      workflow: { eligible: false, limit: 0 },
      credits: { monthlyAllocation: PLAN_CREDITS.free },
      source: 'fallback',
    };
  }

  const activeSub = user.subscriptions[0];
  const resolvedPlan = normalizePlan(activeSub?.plan || user.plan || 'free');
  const ent = getEntitlements(resolvedPlan);

  // Parallel usage counts — bounded, scoped to this user's rows only.
  const [autopilotUsed, profileUsed] = await Promise.all([
    db.autopilotWorkflow.count({
      where: { userId, status: { in: ['ACTIVE', 'RUNNING'] } },
    }),
    db.businessProfile.count({
      where: { userId, status: 'active' },
    }),
  ]);

  const autopilotLimit = ent.autopilot_access.limit ?? 0;
  const profileLimit = ent.business_profiles.limit ?? 0;

  return {
    userId,
    plan: resolvedPlan,
    planLevel: PLAN_LEVELS[resolvedPlan] ?? 0,
    autopilot: {
      allowed: !!ent.autopilot_access.enabled && autopilotLimit > 0,
      limit: autopilotLimit,
      used: autopilotUsed,
      overLimit: autopilotUsed > autopilotLimit,
    },
    profiles: {
      limit: profileLimit,
      used: profileUsed,
      overLimit: profileUsed > profileLimit,
    },
    workflow: {
      eligible: !!ent.workflow_access.enabled,
      limit: ent.workflow_access.limit,
    },
    credits: { monthlyAllocation: PLAN_CREDITS[resolvedPlan] ?? 0 },
    source: 'db',
  };
}

/**
 * Phase 23 — quick boolean: is the given plan eligible for Autopilot?
 * Used by the scheduler tick (where the full summary is overkill — the
 * scheduler only needs a yes/no before claiming ACTIVE→RUNNING).
 */
export function isAutopilotPlanEligible(plan: PlanType): boolean {
  const ent = ENTITLEMENTS[plan]?.autopilot_access;
  return !!ent?.enabled && (ent.limit ?? 0) > 0;
}

/**
 * Phase 23 — resolve a user's plan via the canonical resolution chain
 * (active sub → user.plan → 'free') WITHOUT counting usage. Used by
 * code paths that only need the plan (e.g. the scheduler's per-tick
 * user-plan cache) and want to avoid the two count queries.
 */
export async function resolveUserPlan(
  userId: string
): Promise<{ plan: PlanType; source: 'db' | 'fallback' }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      subscriptions: {
        where: { status: { in: ['active', 'trialing'] } },
        select: { plan: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!user) return { plan: 'free', source: 'fallback' };
  const activeSub = user.subscriptions[0];
  return { plan: normalizePlan(activeSub?.plan || user.plan || 'free'), source: 'db' };
}
