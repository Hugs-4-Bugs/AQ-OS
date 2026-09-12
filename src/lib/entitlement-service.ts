// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Plan Entitlement System
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logEntitlementEvent } from '@/lib/billing-audit';

// ===== TYPES =====

export type PlanType = 'free' | 'pro' | 'elite';

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
  | 'api_access'
  | 'chatbot_access'
  | 'team_members'
  | 'white_label'
  | 'custom_integrations';

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
  },
};

// Plan hierarchy for comparison
const PLAN_LEVELS: Record<PlanType, number> = {
  free: 0,
  pro: 1,
  elite: 2,
};

// Plan monthly credit allocations
export const PLAN_CREDITS: Record<PlanType, number> = {
  free: 50,
  pro: 500,
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
 * free=0, pro=1, elite=2
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
  const planOrder: PlanType[] = ['free', 'pro', 'elite'];

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

  const plans: PlanType[] = ['free', 'pro', 'elite'];

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
