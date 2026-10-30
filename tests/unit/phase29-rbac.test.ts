// Phase 29: RBAC + Security Tests
import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getRolePermissions,
  isAdminRole,
  isPlatformAdminRole,
  canAssignRole,
  ADMIN_ROLES,
  type UserRole,
  type Permission,
} from '@/lib/rbac';

describe('[Phase 29] RBAC — Role Permission Matrix', () => {
  describe('SUPER_ADMIN', () => {
    it('has all admin permissions', () => {
      expect(hasPermission('super_admin', 'users.read')).toBe(true);
      expect(hasPermission('super_admin', 'users.ban')).toBe(true);
      expect(hasPermission('super_admin', 'rbac.assign')).toBe(true);
      expect(hasPermission('super_admin', 'billing.refund')).toBe(true);
      expect(hasPermission('super_admin', 'security.events.read')).toBe(true);
    });

    it('has admin:access', () => {
      expect(hasPermission('super_admin', 'admin:access')).toBe(true);
    });
  });

  describe('SUPPORT role', () => {
    it('has support permissions but NOT RBAC or billing refund', () => {
      const role = 'support' as UserRole;
      expect(hasPermission(role, 'users.read')).toBe(true);
      expect(hasPermission(role, 'users.suspend')).toBe(true);
      expect(hasPermission(role, 'user360.read')).toBe(true);
      expect(hasPermission(role, 'user360.support')).toBe(true);
      expect(hasPermission(role, 'system.health.read')).toBe(true);
      expect(hasPermission(role, 'audit.read')).toBe(true);
      // NOT allowed
      expect(hasPermission(role, 'rbac.assign')).toBe(false);
      expect(hasPermission(role, 'billing.refund')).toBe(false);
      expect(hasPermission(role, 'users.ban')).toBe(false);
      expect(hasPermission(role, 'credits.adjust')).toBe(false);
    });

    it('has admin:access', () => {
      expect(hasPermission('support' as UserRole, 'admin:access')).toBe(true);
    });
  });

  describe('ANALYTICS role', () => {
    it('has read-only permissions but NO mutations', () => {
      const role = 'analytics' as UserRole;
      expect(hasPermission(role, 'users.read')).toBe(true);
      expect(hasPermission(role, 'user360.read')).toBe(true);
      expect(hasPermission(role, 'billing:read')).toBe(true);
      expect(hasPermission(role, 'ai.usage.read')).toBe(true);
      expect(hasPermission(role, 'system.health.read')).toBe(true);
      // NO mutations
      expect(hasPermission(role, 'users.suspend')).toBe(false);
      expect(hasPermission(role, 'users.ban')).toBe(false);
      expect(hasPermission(role, 'credits.adjust')).toBe(false);
      expect(hasPermission(role, 'billing.refund')).toBe(false);
      expect(hasPermission(role, 'rbac.assign')).toBe(false);
      expect(hasPermission(role, 'outreach.control')).toBe(false);
    });

    it('has admin:access', () => {
      expect(hasPermission('analytics' as UserRole, 'admin:access')).toBe(true);
    });
  });

  describe('Deny-by-default', () => {
    it('member role does NOT have admin permissions', () => {
      expect(hasPermission('member', 'users.read')).toBe(false);
      expect(hasPermission('member', 'users.ban')).toBe(false);
      expect(hasPermission('member', 'admin:access')).toBe(false);
      expect(hasPermission('member', 'rbac.assign')).toBe(false);
    });

    it('viewer role does NOT have admin permissions', () => {
      expect(hasPermission('viewer', 'users.read')).toBe(false);
      expect(hasPermission('viewer', 'admin:access')).toBe(false);
    });

    it('unknown role returns false for all permissions', () => {
      expect(hasPermission('unknown' as UserRole, 'users.read')).toBe(false);
      expect(hasPermission('unknown' as UserRole, 'admin:access')).toBe(false);
    });
  });
});

describe('[Phase 29] RBAC — Role Assignment', () => {
  it('super_admin can assign admin roles', () => {
    expect(canAssignRole('super_admin', 'admin')).toBe(true);
    expect(canAssignRole('super_admin', 'support')).toBe(true);
    expect(canAssignRole('super_admin', 'analytics')).toBe(true);
    expect(canAssignRole('super_admin', 'super_admin')).toBe(true);
  });

  it('non-super_admin CANNOT assign any roles', () => {
    expect(canAssignRole('admin', 'support')).toBe(false);
    expect(canAssignRole('support', 'analytics')).toBe(false);
    expect(canAssignRole('analytics', 'admin')).toBe(false);
    expect(canAssignRole('owner', 'admin')).toBe(false);
  });

  it('cannot assign owner role (org-level, set at signup)', () => {
    expect(canAssignRole('super_admin', 'owner')).toBe(false);
  });
});

describe('[Phase 29] RBAC — Platform Admin Detection', () => {
  it('identifies platform admin roles', () => {
    expect(isPlatformAdminRole('super_admin')).toBe(true);
    expect(isPlatformAdminRole('admin')).toBe(true);
    expect(isPlatformAdminRole('support')).toBe(true);
    expect(isPlatformAdminRole('analytics')).toBe(true);
  });

  it('rejects org-level roles as platform admin', () => {
    expect(isPlatformAdminRole('owner')).toBe(false);
    expect(isPlatformAdminRole('member')).toBe(false);
    expect(isPlatformAdminRole('viewer')).toBe(false);
  });
});

describe('[Phase 29] RBAC — Permission Helpers', () => {
  it('hasAllPermissions checks all permissions', () => {
    expect(hasAllPermissions('super_admin', ['users.read', 'users.ban', 'rbac.assign'])).toBe(true);
    expect(hasAllPermissions('support', ['users.read', 'users.suspend'])).toBe(true);
    expect(hasAllPermissions('support', ['users.read', 'users.ban'])).toBe(false); // no ban
  });

  it('hasAnyPermission checks any permission', () => {
    expect(hasAnyPermission('analytics', ['users.read', 'users.ban'])).toBe(true); // has read
    expect(hasAnyPermission('analytics', ['users.ban', 'credits.adjust'])).toBe(false); // has neither
  });

  it('getRolePermissions returns array for all roles', () => {
    for (const role of ADMIN_ROLES) {
      const perms = getRolePermissions(role as UserRole);
      expect(perms.length).toBeGreaterThan(0);
      expect(perms).toContain('admin:access');
    }
  });

  it('ADMIN_ROLES has exactly 4 roles', () => {
    expect(ADMIN_ROLES).toHaveLength(4);
    expect(ADMIN_ROLES).toEqual(['super_admin', 'admin', 'support', 'analytics']);
  });
});

describe('[Phase 29] RBAC — Secret Field Exclusion', () => {
  it('permission model does not include secret access permissions', () => {
    // There should never be a permission that grants access to raw secrets
    const allPerms = getRolePermissions('super_admin');
    expect(allPerms).not.toContain('secrets.read' as Permission);
    expect(allPerms).not.toContain('credentials.read' as Permission);
    expect(allPerms).not.toContain('tokens.read' as Permission);
  });
});
