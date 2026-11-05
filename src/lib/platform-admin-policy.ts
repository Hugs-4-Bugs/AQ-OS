// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Platform Admin Entitlement Policy
//
// ISSUE 8 (Super-admin/admin entitlements):
//
// Centralized policy that grants platform-level administrators full
// feature access WITHOUT fabricating subscriptions or altering
// customer billing records. The policy is enforced consistently by
// frontend and backend through a single helper.
//
// POLICY:
//   - super_admin: permanent platform-level access, no trial, no plan
//     restrictions, no credit checks, no usage limits. Effective plan
//     is 'elite'.
//   - admin: full access to existing features under the explicit
//     platform-admin policy. Effective plan is 'elite'. No RBAC
//     assignment (only super_admin can assign roles).
//   - support / analytics: read-only platform roles — they DO NOT get
//     the bypass. Their existing RBAC permissions (audit.read,
//     system.health.read, etc.) still apply.
//   - Ordinary users (owner / admin / member / viewer / read_only):
//     Their actual subscription and trial restrictions are preserved
//     — they get NO bypass.
//
// USAGE:
//   - Backend: `getEffectivePlan(user)` returns the plan used for
//     entitlement and feature-gate checks.
//   - Backend: `bypassEntitlementChecks(user)` returns true when the
//     user should skip plan/feature/credit gates entirely.
//   - Frontend: `isAdminRole(role)` returns true for super_admin/admin
//     only (used by trial banner and feature gating UI).
//
// SECURITY: This policy is based on the user's DB-stored role, which
// is set ONLY through the RBAC assignment flow (super_admin only).
// Frontend state, cookies, or URL parameters cannot change the role.
// ═══════════════════════════════════════════════════════════════════

import type { PlanType } from '@/lib/entitlement-service';
import type { UserRole } from '@/lib/rbac';

/**
 * Roles that receive the platform-admin entitlement bypass.
 * ONLY `super_admin` and `admin` get full feature access.
 * `support` and `analytics` are platform roles but read-only — they
 * do NOT get the bypass; their existing RBAC permissions still apply.
 */
const FULL_BYPASS_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'super_admin',
  'admin',
]);

/**
 * Returns true if the given role grants platform-admin full feature
 * access (super_admin or admin only).
 *
 * This is the frontend/backend single source of truth for "is this
 * user a platform admin with full feature access?".
 */
export function isPlatformAdminWithFullAccess(role: string | null | undefined): role is 'super_admin' | 'admin' {
  if (!role) return false;
  return FULL_BYPASS_ROLES.has(role as UserRole);
}

/**
 * Alias kept for clarity at call sites that work with the AuthUser
 * shape. Returns true for super_admin/admin roles.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return isPlatformAdminWithFullAccess(role);
}

/**
 * Returns the effective plan used for entitlement/feature-gate checks.
 * Platform admins (super_admin, admin) always receive 'elite'.
 * Ordinary users receive their actual plan from the DB.
 */
export function getEffectivePlan(params: {
  role: string | null | undefined;
  plan: string | null | undefined;
}): PlanType {
  if (isPlatformAdminWithFullAccess(params.role)) {
    return 'elite';
  }
  // Fall back to 'free' if the plan is missing or invalid — this
  // matches the existing behavior in entitlement-service.ts.
  const plan = params.plan as PlanType;
  if (plan === 'free' || plan === 'starter' || plan === 'pro' || plan === 'elite') {
    return plan;
  }
  return 'free';
}

/**
 * Returns true when the user should bypass plan/feature/credit gates
 * entirely. Platform admins bypass all ordinary subscription checks
 * (plan level, feature access, credit sufficiency).
 *
 * NOTE: This does NOT bypass RBAC permission checks (withPermission),
 * tenant isolation, or MFA enforcement. Those are separate concerns
 * and remain enforced for everyone.
 */
export function bypassEntitlementChecks(role: string | null | undefined): boolean {
  return isPlatformAdminWithFullAccess(role);
}

/**
 * Returns true when the user should bypass credit deduction.
 * Platform admins never have credits deducted.
 */
export function bypassCreditDeduction(role: string | null | undefined): boolean {
  return isPlatformAdminWithFullAccess(role);
}

/**
 * Returns true when the user should bypass usage limits (e.g., daily
 * outreach caps, lead discovery caps).
 */
export function bypassUsageLimits(role: string | null | undefined): boolean {
  return isPlatformAdminWithFullAccess(role);
}

/**
 * Returns true when subscription enforcement (trial expiration, plan
 * downgrade, etc.) should be skipped for this user.
 */
export function bypassSubscriptionEnforcement(role: string | null | undefined): boolean {
  return isPlatformAdminWithFullAccess(role);
}

/**
 * Convenience: build a complete entitlement override object for the
 * platform-admin policy. Returns null for ordinary users.
 */
export function getPlatformAdminEntitlementOverride(
  role: string | null | undefined
): {
  plan: 'elite';
  credits: number;
  unlimited: true;
  bypassCreditChecks: true;
  bypassUsageLimits: true;
  bypassSubscriptionEnforcement: true;
} | null {
  if (!isPlatformAdminWithFullAccess(role)) return null;
  return {
    plan: 'elite',
    credits: Number.MAX_SAFE_INTEGER,
    unlimited: true,
    bypassCreditChecks: true,
    bypassUsageLimits: true,
    bypassSubscriptionEnforcement: true,
  };
}
