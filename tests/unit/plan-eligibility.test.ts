/**
 * Plan Eligibility Correction — entitlement configuration + gate semantics
 *
 * Covers:
 *  - workflow_access (autonomous workflows / AI Business Growth Agent
 *    automation) is enabled EXCLUSIVELY for Pro and Elite;
 *  - business_profiles active-profile limits: Free 1 · Starter 1 · Pro 3 ·
 *    Elite 7 (limits apply to profiles/niches, never to leads);
 *  - AUTOMATION_PLAN_TIERS stays in lockstep with the ENTITLEMENTS config
 *    (the cron/trigger DB filters rely on it);
 *  - checkPlanEntitlement denies Free/Starter automation with a structured
 *    403 PLAN_REQUIRED response and allows Pro/Elite;
 *  - pricing/credit allocations are untouched by this correction.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/billing-audit', () => ({
  logEntitlementEvent: vi.fn().mockResolvedValue(undefined),
  logBillingEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
  ENTITLEMENTS,
  PLAN_CREDITS,
  checkEntitlement,
  getFeatureLimit,
  canPerformAction,
  getUpgradeRequiredPlan,
  comparePlans,
  type PlanType,
} from '@/lib/entitlement-service';
import {
  BUSINESS_PROFILE_LIMITS,
  AUTOMATION_PLAN_TIERS,
  PLAN_TIER_LABELS,
  nextProfileLimitPlan,
  toPlanTier,
} from '@/lib/plan-feature-limits';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';

const ALL_PLANS: PlanType[] = ['free', 'starter', 'pro', 'elite'];

describe('workflow_access eligibility (autonomous workflows / agent automation)', () => {
  it('is disabled for Free and Starter', () => {
    expect(checkEntitlement('free', 'workflow_access')).toBe(false);
    expect(checkEntitlement('starter', 'workflow_access')).toBe(false);
  });

  it('is enabled for Pro and Elite', () => {
    expect(checkEntitlement('pro', 'workflow_access')).toBe(true);
    expect(checkEntitlement('elite', 'workflow_access')).toBe(true);
  });

  it('the minimum plan required for automation is Pro', () => {
    expect(getUpgradeRequiredPlan('free', 'workflow_access')).toBe('pro');
    expect(getUpgradeRequiredPlan('starter', 'workflow_access')).toBe('pro');
    // Semantics: the next plan ABOVE the current one that enables the feature
    // (the checkPlanEntitlement deny path only calls this for users who lack it).
    expect(getUpgradeRequiredPlan('pro', 'workflow_access')).toBe('elite');
  });

  it('Free → Pro upgrade gains workflow_access (upgrade surfaces show it)', () => {
    expect(comparePlans('free', 'pro').gained).toContain('workflow_access');
    expect(comparePlans('starter', 'pro').gained).toContain('workflow_access');
  });
});

describe('business_profiles limits (active profiles/niches per plan)', () => {
  it('caps are Free 1 · Starter 1 · Pro 3 · Elite 7', () => {
    expect(BUSINESS_PROFILE_LIMITS).toEqual({ free: 1, starter: 1, pro: 3, elite: 7 });
  });

  it('profile creation is enabled on every plan and mirrors the limits map', () => {
    for (const plan of ALL_PLANS) {
      expect(checkEntitlement(plan, 'business_profiles')).toBe(true);
      expect(getFeatureLimit(plan, 'business_profiles')).toBe(BUSINESS_PROFILE_LIMITS[plan]);
    }
  });

  it('canPerformAction blocks at the cap and allows below it', () => {
    const atLimit = canPerformAction('pro', 'business_profiles', 3);
    expect(atLimit.allowed).toBe(false);
    expect(atLimit.reason).toContain('3');

    const below = canPerformAction('pro', 'business_profiles', 2);
    expect(below.allowed).toBe(true);
    expect(below.limit).toBe(3);
  });

  it('upgrade hints point to the next tier with a HIGHER limit (not the next tier blindly)', () => {
    expect(nextProfileLimitPlan('free')).toBe('pro'); // Starter has the same limit (1)
    expect(nextProfileLimitPlan('starter')).toBe('pro');
    expect(nextProfileLimitPlan('pro')).toBe('elite');
    expect(nextProfileLimitPlan('elite')).toBeNull();
  });
});

describe('AUTOMATION_PLAN_TIERS lockstep with ENTITLEMENTS', () => {
  it('equals exactly the plans whose workflow_access is enabled', () => {
    const derived = ALL_PLANS.filter((p) => ENTITLEMENTS[p].workflow_access.enabled);
    expect(AUTOMATION_PLAN_TIERS).toEqual(derived);
  });
});

describe('checkPlanEntitlement gate semantics', () => {
  it('denies Free/Starter automation with 403 PLAN_REQUIRED pointing at Pro', async () => {
    for (const plan of ['free', 'starter'] as PlanType[]) {
      const result = await checkPlanEntitlement('user-1', plan, 'workflow_access');
      expect(result.allowed).toBe(false);
      expect(result.requiredPlan).toBe('pro');
      expect(result.response).toBeDefined();
      expect(result.response!.status).toBe(403);
      const body = await result.response!.json();
      expect(body.code).toBe('PLAN_REQUIRED');
      expect(body.feature).toBe('workflow_access');
      expect(body.requiredPlan).toBe('pro');
    }
  });

  it('allows Pro/Elite automation without a denial response', async () => {
    for (const plan of ['pro', 'elite'] as PlanType[]) {
      const result = await checkPlanEntitlement('user-1', plan, 'workflow_access');
      expect(result.allowed).toBe(true);
      expect(result.response).toBeUndefined();
    }
  });

  it('sequence automation follows outreach_sequences (Pro/Elite only)', async () => {
    expect(checkEntitlement('free', 'outreach_sequences')).toBe(false);
    expect(checkEntitlement('starter', 'outreach_sequences')).toBe(false);
    const denied = await checkPlanEntitlement('user-1', 'starter', 'outreach_sequences');
    expect(denied.allowed).toBe(false);
    const allowed = await checkPlanEntitlement('user-1', 'pro', 'outreach_sequences');
    expect(allowed.allowed).toBe(true);
  });
});

describe('plan normalization (fail-closed)', () => {
  it('toPlanTier normalizes known values case-insensitively', () => {
    expect(toPlanTier('PRO')).toBe('pro');
    expect(toPlanTier(' Elite ')).toBe('elite');
    expect(toPlanTier('Starter')).toBe('starter');
  });

  it('unknown or missing plans fail closed to Free', () => {
    expect(toPlanTier('enterprise')).toBe('free');
    expect(toPlanTier('gold')).toBe('free');
    expect(toPlanTier('')).toBe('free');
    expect(toPlanTier(null)).toBe('free');
    expect(toPlanTier(undefined)).toBe('free');
  });

  it('plan labels stay human-readable', () => {
    expect(PLAN_TIER_LABELS.free).toBe('Free');
    expect(PLAN_TIER_LABELS.starter).toBe('Starter');
    expect(PLAN_TIER_LABELS.pro).toBe('Pro');
    expect(PLAN_TIER_LABELS.elite).toBe('Elite');
  });
});

describe('pricing untouched by the correction (guard rails)', () => {
  it('monthly credit allocations are unchanged', () => {
    expect(PLAN_CREDITS).toEqual({ free: 50, starter: 150, pro: 750, elite: 2000 });
  });

  it('lead_discovery limits keep their per-plan values', () => {
    expect(getFeatureLimit('free', 'lead_discovery')).toBe(10);
    expect(getFeatureLimit('starter', 'lead_discovery')).toBe(25);
    expect(getFeatureLimit('pro', 'lead_discovery')).toBeNull();
    expect(getFeatureLimit('elite', 'lead_discovery')).toBeNull();
  });
});
