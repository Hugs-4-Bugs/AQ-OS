// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Head Super Admin Entitlement Module
//
// The canonical Head Super Admin is permanently privileged with:
// - Elite plan
// - Unlimited credits (no deduction, no limit checks)
// - Unlimited AI usage
// - Full system access
// - No subscription/credit/expiration enforcement
//
// This is enforced SERVER-SIDE. All credit/usage gates must call
// isHeadSuperAdmin() and bypass limits if true.
//
// The designation is based on the user's email + role in the database,
// NOT on frontend state, cookies, or URL parameters.
// ═══════════════════════════════════════════════════════════════════

/** The canonical Head Super Admin email — the single root administrator. */
export const HEAD_SUPER_ADMIN_EMAIL = 'contact@prabhat.online';

/**
 * Check if a user (by email) is the canonical Head Super Admin.
 * This is a permanent, server-side designation that cannot be changed
 * by frontend state, API manipulation, or other admins.
 */
export function isHeadSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === HEAD_SUPER_ADMIN_EMAIL;
}

/**
 * Check if a user (by ID + email + role) is the canonical Head Super Admin.
 * Requires BOTH the correct email AND the super_admin role.
 */
export function isHeadSuperAdmin(params: { email: string | null; role: string | null }): boolean {
  return isHeadSuperAdminEmail(params.email) && params.role === 'super_admin';
}

/**
 * Get the entitlement override for a Head Super Admin.
 * Returns null for non-head-admin users (normal entitlement logic applies).
 */
export function getHeadAdminEntitlements(params: { email: string | null; role: string | null }): {
  plan: 'elite';
  credits: number; // Effectively unlimited — credit gates bypass entirely
  unlimited: true;
  bypassCreditChecks: true;
  bypassUsageLimits: true;
  bypassSubscriptionEnforcement: true;
} | null {
  if (!isHeadSuperAdmin(params)) return null;
  return {
    plan: 'elite',
    credits: Number.MAX_SAFE_INTEGER, // Gates should bypass entirely, not just check this
    unlimited: true,
    bypassCreditChecks: true,
    bypassUsageLimits: true,
    bypassSubscriptionEnforcement: true,
  };
}

/**
 * Determine if credit deduction should be skipped for this user.
 * Head Super Admin never has credits deducted.
 */
export function shouldBypassCreditDeduction(params: { email: string | null; role: string | null }): boolean {
  return isHeadSuperAdmin(params);
}

/**
 * Determine if usage limits should be bypassed for this user.
 * Head Super Admin has no usage limits.
 */
export function shouldBypassUsageLimits(params: { email: string | null; role: string | null }): boolean {
  return isHeadSuperAdmin(params);
}
