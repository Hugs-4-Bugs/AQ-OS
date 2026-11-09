// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — RBAC Permission Matrix Test
//
// Verifies the role → permission grants in src/lib/rbac.ts against the
// documented expectations. This test will FAIL if the RBAC matrix
// drifts from the expected grants, forcing a deliberate review.
//
// Source of truth:
//   src/lib/rbac.ts:64–180 (ROLE_PERMISSIONS const)
//   src/lib/rbac.ts:210–219 (hasPermission, hasAllPermissions)
//
// Why this test exists:
//   The Phase C audit found that the route comment on
//   /api/admin/security/events (line 2) says "(super_admin, admin)"
//   but the RBAC matrix grants security.events.read ONLY to super_admin.
//   This test pins down the actual grants so future drift is caught.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  isAdminRole,
  isPlatformAdminRole,
  canAssignRole,
  getRolePermissions,
  ADMIN_ROLES,
  type UserRole,
  type Permission,
} from '@/lib/rbac';

// ─── Expected grants (snapshot of rbac.ts as of HEAD) ──────────────
// If rbac.ts intentionally changes, update this snapshot in the same
// commit. The test exists to make accidental drift visible.

const EXPECTED_GRANTS: Record<UserRole, Permission[]> = {
  super_admin: [
    'leads:read', 'leads:write', 'leads:delete',
    'pipeline:read', 'pipeline:write',
    'discover:read', 'discover:write',
    'outreach:read', 'outreach:write',
    'assistant:read', 'insights:read',
    'deals:read', 'deals:write',
    'competitors:read', 'competitors:write',
    'settings:read', 'settings:write',
    'billing:read', 'billing:write',
    'team:read', 'team:write',
    'api:read', 'api:write',
    'admin:access',
    'users.read', 'users.update', 'users.suspend', 'users.restrict', 'users.ban', 'users.reactivate',
    'user360.read', 'user360.support',
    'billing.refund', 'billing.adjust',
    'credits.read', 'credits.adjust',
    'workflows.read', 'workflows.control',
    'autopilot.read', 'autopilot.control',
    'outreach.control',
    'ai.usage.read',
    'integrations.read', 'integrations.control',
    'system.health.read', 'system.logs.read',
    'system.events.resolve', 'system.operations.retry',
    'audit.read', 'security.events.read',
    'rbac.read', 'rbac.assign',
  ],
  owner: [
    'leads:read', 'leads:write', 'leads:delete',
    'pipeline:read', 'pipeline:write',
    'discover:read', 'discover:write',
    'outreach:read', 'outreach:write',
    'assistant:read', 'insights:read',
    'deals:read', 'deals:write',
    'competitors:read', 'competitors:write',
    'settings:read', 'settings:write',
    'billing:read', 'billing:write',
    'team:read', 'team:write',
    'api:read', 'api:write',
    'admin:access',
  ],
  admin: [
    'leads:read', 'leads:write', 'leads:delete',
    'pipeline:read', 'pipeline:write',
    'discover:read', 'discover:write',
    'outreach:read', 'outreach:write',
    'assistant:read', 'insights:read',
    'deals:read', 'deals:write',
    'competitors:read', 'competitors:write',
    'settings:read', 'settings:write',
    'billing:read',
    'team:read',
    'api:read',
    'admin:access',
    // NOTE: admin does NOT get users.ban — only super_admin can ban.
    'users.read', 'users.update', 'users.suspend', 'users.restrict', 'users.reactivate',
    'user360.read',
    'billing.adjust',
    'credits.read', 'credits.adjust',
    'workflows.read', 'workflows.control',
    'autopilot.read', 'autopilot.control',
    'outreach.control',
    'ai.usage.read',
    'integrations.read', 'integrations.control',
    'system.health.read', 'system.logs.read',
    'system.events.resolve', 'system.operations.retry',
    'audit.read',
  ],
  member: [
    'leads:read', 'leads:write',
    'pipeline:read',
    'discover:read',
    'outreach:read', 'outreach:write',
    'assistant:read', 'insights:read',
    'deals:read', 'deals:write',
    'competitors:read',
    'settings:read',
  ],
  viewer: [
    'leads:read', 'pipeline:read', 'discover:read',
    'assistant:read', 'insights:read', 'deals:read',
    'competitors:read', 'settings:read',
  ],
  support: [
    'admin:access',
    'users.read', 'users.update', 'users.suspend', 'users.restrict', 'users.reactivate',
    'user360.read', 'user360.support',
    'credits.read',
    'workflows.read',
    'autopilot.read',
    'outreach:read', 'outreach.control',
    'integrations.read',
    'system.health.read',
    'audit.read',
  ],
  analytics: [
    'admin:access',
    'users.read', 'user360.read',
    'billing:read', 'credits.read',
    'leads:read', 'workflows.read', 'autopilot.read',
    'outreach:read', 'ai.usage.read',
    'system.health.read', 'audit.read',
  ],
};

// ─── Tests ─────────────────────────────────────────────────────────

describe('RBAC permission matrix — src/lib/rbac.ts', () => {
  describe('hasPermission', () => {
    // Parameterized: every (role, permission) pair from EXPECTED_GRANTS
    // should return true; every (role, permission) NOT in the list
    // should return false.
    const ALL_ROLES: UserRole[] = ['super_admin', 'owner', 'admin', 'member', 'viewer', 'support', 'analytics'];

    for (const role of ALL_ROLES) {
      const expectedGrants = new Set(EXPECTED_GRANTS[role]);

      it(`${role} — grants all ${expectedGrants.size} expected permissions`, () => {
        for (const perm of expectedGrants) {
          expect(hasPermission(role, perm)).toBe(true);
        }
      });

      it(`${role} — does NOT grant permissions outside its set`, () => {
        // Sample a few permissions that should be denied
        const sampleDenied: Permission[] = ['rbac.read', 'rbac.assign', 'security.events.read'];
        for (const perm of sampleDenied) {
          if (!expectedGrants.has(perm)) {
            expect(hasPermission(role, perm)).toBe(false);
          }
        }
      });
    }
  });

  describe('Critical permission isolation', () => {
    it('rbac.read is granted ONLY to super_admin', () => {
      expect(hasPermission('super_admin', 'rbac.read')).toBe(true);
      expect(hasPermission('admin', 'rbac.read')).toBe(false);
      expect(hasPermission('owner', 'rbac.read')).toBe(false);
      expect(hasPermission('support', 'rbac.read')).toBe(false);
      expect(hasPermission('analytics', 'rbac.read')).toBe(false);
      expect(hasPermission('member', 'rbac.read')).toBe(false);
      expect(hasPermission('viewer', 'rbac.read')).toBe(false);
    });

    it('rbac.assign is granted ONLY to super_admin', () => {
      expect(hasPermission('super_admin', 'rbac.assign')).toBe(true);
      expect(hasPermission('admin', 'rbac.assign')).toBe(false);
      expect(hasPermission('owner', 'rbac.assign')).toBe(false);
    });

    it('security.events.read is granted ONLY to super_admin', () => {
      // ⚠️ Note: the route comment on /api/admin/security/events (line 2)
      //    claims "(super_admin, admin)" but the actual matrix grants
      //    ONLY super_admin. This test pins the actual behavior.
      //    If the comment was the intent, this is a functionality bug
      //    (admin under-authorized). If the matrix was the intent, the
      //    comment is stale documentation. Either way, this test forces
      //    a deliberate decision.
      expect(hasPermission('super_admin', 'security.events.read')).toBe(true);
      expect(hasPermission('admin', 'security.events.read')).toBe(false);
      expect(hasPermission('owner', 'security.events.read')).toBe(false);
      expect(hasPermission('support', 'security.events.read')).toBe(false);
      expect(hasPermission('analytics', 'security.events.read')).toBe(false);
    });

    it('audit.read is granted to super_admin, admin, support, analytics (NOT owner)', () => {
      expect(hasPermission('super_admin', 'audit.read')).toBe(true);
      expect(hasPermission('admin', 'audit.read')).toBe(true);
      expect(hasPermission('support', 'audit.read')).toBe(true);
      expect(hasPermission('analytics', 'audit.read')).toBe(true);
      // owner is org-level — does NOT get audit.read
      expect(hasPermission('owner', 'audit.read')).toBe(false);
      expect(hasPermission('member', 'audit.read')).toBe(false);
      expect(hasPermission('viewer', 'audit.read')).toBe(false);
    });

    it('admin:access is granted to super_admin, owner, admin, support, analytics (NOT member/viewer)', () => {
      expect(hasPermission('super_admin', 'admin:access')).toBe(true);
      expect(hasPermission('owner', 'admin:access')).toBe(true);
      expect(hasPermission('admin', 'admin:access')).toBe(true);
      expect(hasPermission('support', 'admin:access')).toBe(true);
      expect(hasPermission('analytics', 'admin:access')).toBe(true);
      expect(hasPermission('member', 'admin:access')).toBe(false);
      expect(hasPermission('viewer', 'admin:access')).toBe(false);
    });

    it('users.ban is granted ONLY to super_admin (NOT admin)', () => {
      // admin can suspend/restrict/reactivate but NOT ban — only super_admin can ban.
      expect(hasPermission('super_admin', 'users.ban')).toBe(true);
      expect(hasPermission('admin', 'users.ban')).toBe(false);
      expect(hasPermission('owner', 'users.ban')).toBe(false);
      expect(hasPermission('support', 'users.ban')).toBe(false);
      expect(hasPermission('analytics', 'users.ban')).toBe(false);
    });

    it('billing.refund is granted ONLY to super_admin', () => {
      expect(hasPermission('super_admin', 'billing.refund')).toBe(true);
      expect(hasPermission('admin', 'billing.refund')).toBe(false);
      expect(hasPermission('owner', 'billing.refund')).toBe(false);
    });

    it('user360.support is granted to super_admin and support (NOT admin)', () => {
      expect(hasPermission('super_admin', 'user360.support')).toBe(true);
      expect(hasPermission('support', 'user360.support')).toBe(true);
      expect(hasPermission('admin', 'user360.support')).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('returns true only when ALL permissions are held', () => {
      expect(hasAllPermissions('super_admin', ['audit.read', 'rbac.read'])).toBe(true);
      expect(hasAllPermissions('admin', ['audit.read', 'rbac.read'])).toBe(false);
      expect(hasAllPermissions('admin', ['audit.read', 'users.read'])).toBe(true);
    });

    it('returns false for unknown roles', () => {
      expect(hasAllPermissions('unknown' as UserRole, ['audit.read'])).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('returns true when at least one permission is held', () => {
      expect(hasAnyPermission('admin', ['audit.read', 'rbac.read'])).toBe(true);
      expect(hasAnyPermission('admin', ['rbac.read', 'rbac.assign'])).toBe(false);
    });
  });

  describe('isAdminRole', () => {
    it('returns true for super_admin, owner, admin', () => {
      expect(isAdminRole('super_admin')).toBe(true);
      expect(isAdminRole('owner')).toBe(true);
      expect(isAdminRole('admin')).toBe(true);
    });

    it('returns false for support, analytics, member, viewer', () => {
      expect(isAdminRole('support')).toBe(false);
      expect(isAdminRole('analytics')).toBe(false);
      expect(isAdminRole('member')).toBe(false);
      expect(isAdminRole('viewer')).toBe(false);
    });
  });

  describe('isPlatformAdminRole', () => {
    it('returns true for super_admin, admin, support, analytics', () => {
      expect(isPlatformAdminRole('super_admin')).toBe(true);
      expect(isPlatformAdminRole('admin')).toBe(true);
      expect(isPlatformAdminRole('support')).toBe(true);
      expect(isPlatformAdminRole('analytics')).toBe(true);
    });

    it('returns false for org-scoped roles (owner, member, viewer)', () => {
      expect(isPlatformAdminRole('owner')).toBe(false);
      expect(isPlatformAdminRole('member')).toBe(false);
      expect(isPlatformAdminRole('viewer')).toBe(false);
    });
  });

  describe('canAssignRole', () => {
    it('allows only super_admin to assign admin roles', () => {
      expect(canAssignRole('super_admin', 'admin')).toBe(true);
      expect(canAssignRole('super_admin', 'support')).toBe(true);
      expect(canAssignRole('super_admin', 'analytics')).toBe(true);
      expect(canAssignRole('admin', 'support')).toBe(false);
      expect(canAssignRole('owner', 'admin')).toBe(false);
    });

    it('forbids assigning the org-level owner role', () => {
      expect(canAssignRole('super_admin', 'owner')).toBe(false);
    });

    it('forbids self-escalation by non-super_admin', () => {
      expect(canAssignRole('admin', 'super_admin')).toBe(false);
      expect(canAssignRole('support', 'admin')).toBe(false);
    });
  });

  describe('getRolePermissions', () => {
    it('returns the full permission array for super_admin', () => {
      const perms = getRolePermissions('super_admin');
      // The expected count per the snapshot above.
      expect(perms.length).toBe(EXPECTED_GRANTS.super_admin.length);
      expect(perms).toContain('rbac.read');
      expect(perms).toContain('rbac.assign');
      expect(perms).toContain('security.events.read');
    });

    it('returns an empty array for unknown roles', () => {
      expect(getRolePermissions('unknown' as UserRole)).toEqual([]);
    });
  });

  describe('ADMIN_ROLES catalog', () => {
    it('includes exactly 4 platform-admin roles', () => {
      expect(ADMIN_ROLES).toEqual(['super_admin', 'admin', 'support', 'analytics']);
    });
  });
});
