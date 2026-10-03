// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Client-Safe Plan Limit Constants
//
// Plan Eligibility Correction (Oct 2026):
//   • Autonomous workflows and the complete AI Business Growth Agent
//     automation are available EXCLUSIVELY to Pro and Elite subscribers.
//     Free and Starter subscribers have no access — enforced in the UI
//     (PlanGate) AND on the backend (workflow_access entitlement).
//   • Active business profiles / niches per plan:
//       Free 1 · Starter 1 · Pro 3 · Elite 7
//     The limits apply to PROFILES/NICHES, never to the number of leads
//     a workflow processes.
//
// This module is intentionally dependency-free (no `@/lib/db`, no server
// modules) so both client components and the server-side entitlement
// service can import the SAME single source of truth.
// ═══════════════════════════════════════════════════════════════════

export type PlanTier = 'free' | 'starter' | 'pro' | 'elite';

export const PLAN_TIER_ORDER: PlanTier[] = ['free', 'starter', 'pro', 'elite'];

/** Human-readable plan labels (matches subscription-store PLAN_DETAILS names). */
export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite',
};

/** Maximum number of ACTIVE (non-archived) business profiles / niches a
 * plan may hold. Enforcement is server-side (business-profiles POST);
 * the UI reads the same map for the usage meter and upgrade prompts. */
export const BUSINESS_PROFILE_LIMITS: Record<PlanTier, number> = {
  free: 1,
  starter: 1,
  pro: 3,
  elite: 7,
};

/** Minimum plan tier for autonomous workflows / AI Business Growth Agent
 * automation. Free and Starter are excluded entirely. Backed by the
 * `workflow_access` feature entitlement (enabled only for pro/elite). */
export const AUTOMATION_MIN_PLAN: PlanTier = 'pro';

/** Plan tiers whose `workflow_access` entitlement is enabled — the exact
 * list used by cron/trigger DB-level filters so queued or scheduled
 * automation can never run for Free/Starter users (Plan Eligibility
 * Correction). MUST stay in lockstep with ENTITLEMENTS in
 * entitlement-service.ts — enforced by tests/unit/plan-eligibility.test.ts. */
export const AUTOMATION_PLAN_TIERS: PlanTier[] = ['pro', 'elite'];

/** Normalizes any stored/legacy plan string to a known tier. Unknown or
 * missing values fail CLOSED to 'free' (most restrictive). */
export function toPlanTier(plan: string | null | undefined): PlanTier {
  const normalized = (plan ?? '').toLowerCase().trim();
  return (PLAN_TIER_ORDER as string[]).includes(normalized)
    ? (normalized as PlanTier)
    : 'free';
}

/** The lowest plan tier that raises the active-profile limit above the
 * given plan's limit — used for upgrade hints. Null when the plan is
 * already at the maximum (Elite). */
export function nextProfileLimitPlan(plan: PlanTier): PlanTier | null {
  const current = BUSINESS_PROFILE_LIMITS[plan] ?? BUSINESS_PROFILE_LIMITS.free;
  for (const tier of PLAN_TIER_ORDER) {
    if (BUSINESS_PROFILE_LIMITS[tier] > current) return tier;
  }
  return null;
}
