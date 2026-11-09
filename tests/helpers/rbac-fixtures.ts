// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — RBAC Test Fixtures
//
// Deterministic, role-specific test identities for the centralized
// test suite. Each fixture corresponds to a role defined in
// src/lib/rbac.ts (UserRole union) and carries the EXACT permission
// set granted by ROLE_PERMISSIONS in that file.
//
// These fixtures are MOCK identities — they do NOT correspond to real
// database rows and never touch production data. Tests that need a
// persisted user row should use the createTestUser() factory in
// tests/helpers/test-utils.ts against an isolated SQLite test DB.
//
// IMPORTANT: Do not weaken assertions to make tests pass. If a
// fixture's expected permission set disagrees with src/lib/rbac.ts,
// the source of truth is rbac.ts — update the fixture, not the test
// expectation, AND report the discrepancy in the test report.
// ═══════════════════════════════════════════════════════════════════

import type { AuthUser } from '@/lib/auth';
import type { UserRole, Permission } from '@/lib/rbac';
import { getRolePermissions } from '@/lib/rbac';

// ─── Mock identity shape ───────────────────────────────────────────
// AuthUser is the runtime shape returned by getAuthUser(). Tests that
// exercise withAuth/withPermission/withSuperAdmin should pass these
// fixtures to mockGetAuthUser.mockResolvedValue(...).

export interface RoleFixture {
  role: UserRole;
  user: AuthUser;
  /** All permissions granted to this role per ROLE_PERMISSIONS. */
  permissions: Permission[];
  /** Human-readable label for assertion messages. */
  label: string;
}

// ─── Identity builders ─────────────────────────────────────────────

function makeAuthUser(
  role: UserRole,
  overrides: Partial<AuthUser> = {},
): AuthUser {
  const idMap: Record<UserRole, string> = {
    super_admin: 'fixture-super-admin',
    owner: 'fixture-owner',
    admin: 'fixture-admin',
    member: 'fixture-member',
    viewer: 'fixture-viewer',
    support: 'fixture-support',
    analytics: 'fixture-analytics',
  };
  return {
    id: idMap[role],
    email: `${role}@fixture.test`,
    name: `Fixture ${role}`,
    role,
    plan: role === 'super_admin' ? 'elite' : 'pro',
    orgId: role === 'super_admin' ? null : 'fixture-org-1',
    emailVerified: true,
    mfaEnabled: role === 'super_admin', // super_admin defaults to MFA-enabled
    avatarUrl: null,
    authProvider: 'email',
    ...overrides,
  } as AuthUser;
}

function makeRoleFixture(
  role: UserRole,
  overrides: Partial<AuthUser> = {},
): RoleFixture {
  // getRolePermissions returns Array.from(ROLE_PERMISSIONS[role] || [])
  // — we use the public API rather than reaching into the private const.
  const permissions = getRolePermissions(role);
  return {
    role,
    user: makeAuthUser(role, overrides),
    permissions,
    label: `role=${role}`,
  };
}

// ─── Role-specific fixtures ────────────────────────────────────────

export const SUPER_ADMIN_WITH_MFA: RoleFixture = makeRoleFixture('super_admin', {
  mfaEnabled: true,
});

export const SUPER_ADMIN_WITHOUT_MFA: RoleFixture = makeRoleFixture('super_admin', {
  mfaEnabled: false,
});

export const OWNER: RoleFixture = makeRoleFixture('owner');
export const ADMIN: RoleFixture = makeRoleFixture('admin');
export const MEMBER: RoleFixture = makeRoleFixture('member');
export const VIEWER: RoleFixture = makeRoleFixture('viewer');
export const SUPPORT: RoleFixture = makeRoleFixture('support');
export const ANALYTICS: RoleFixture = makeRoleFixture('analytics');

// ─── Convenience: all fixtures for parameterized tests ─────────────

export const ALL_ROLE_FIXTURES: RoleFixture[] = [
  SUPER_ADMIN_WITH_MFA,
  OWNER,
  ADMIN,
  MEMBER,
  VIEWER,
  SUPPORT,
  ANALYTICS,
];

// ─── Permission lookup helper ──────────────────────────────────────

/**
 * Returns true if the given role has the given permission per the
 * rbac.ts ROLE_PERMISSIONS matrix. Use this in tests to assert
 * expected vs actual authorization outcomes.
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.has(permission) : false;
}

/**
 * Returns the list of roles (per rbac.ts) that hold the given
 * permission. Useful for "expected 200" parameterized assertions.
 */
export function rolesWithPermission(permission: Permission): UserRole[] {
  return ALL_ROLE_FIXTURES
    .filter((f) => f.permissions.includes(permission))
    .map((f) => f.role);
}

/**
 * Returns the list of roles (per rbac.ts) that DO NOT hold the given
 * permission. Useful for "expected 403" parameterized assertions.
 */
export function rolesWithoutPermission(permission: Permission): UserRole[] {
  return ALL_ROLE_FIXTURES
    .filter((f) => !f.permissions.includes(permission))
    .map((f) => f.role);
}
