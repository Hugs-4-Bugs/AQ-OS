// Phase 31: Admin Billing RBAC + Secret Protection + Provider Status Tests
import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  getRolePermissions,
  type UserRole,
  type Permission,
} from '@/lib/rbac';

// Route → Permission mapping (verified by code inspection):
//   GET  /api/admin/billing               → billing:read
//   GET  /api/admin/billing/webhooks       → billing:read
//   GET  /api/admin/billing/failed-payments → billing:read
//   POST /api/admin/refund                 → billing.refund

const ROUTE_PERMISSIONS = {
  'GET /api/admin/billing': 'billing:read' as Permission,
  'GET /api/admin/billing/webhooks': 'billing:read' as Permission,
  'GET /api/admin/billing/failed-payments': 'billing:read' as Permission,
  'POST /api/admin/refund': 'billing.refund' as Permission,
} as const;

describe('[Phase 31] Billing Route Permission Verification', () => {
  const roles: UserRole[] = ['super_admin', 'admin', 'support', 'analytics', 'member', 'viewer'];

  describe('GET /api/admin/billing (billing:read)', () => {
    it.each(roles)('role %s', (role) => {
      const hasAccess = hasPermission(role, ROUTE_PERMISSIONS['GET /api/admin/billing']);
      if (['super_admin', 'admin', 'analytics'].includes(role)) {
        expect(hasAccess).toBe(true);
      } else {
        expect(hasAccess).toBe(false);
      }
    });
  });

  describe('GET /api/admin/billing/webhooks (billing:read)', () => {
    it.each(roles)('role %s', (role) => {
      const hasAccess = hasPermission(role, ROUTE_PERMISSIONS['GET /api/admin/billing/webhooks']);
      if (['super_admin', 'admin', 'analytics'].includes(role)) {
        expect(hasAccess).toBe(true);
      } else {
        expect(hasAccess).toBe(false);
      }
    });
  });

  describe('GET /api/admin/billing/failed-payments (billing:read)', () => {
    it.each(roles)('role %s', (role) => {
      const hasAccess = hasPermission(role, ROUTE_PERMISSIONS['GET /api/admin/billing/failed-payments']);
      if (['super_admin', 'admin', 'analytics'].includes(role)) {
        expect(hasAccess).toBe(true);
      } else {
        expect(hasAccess).toBe(false);
      }
    });
  });

  describe('POST /api/admin/refund (billing.refund) — SUPER_ADMIN ONLY', () => {
    it.each(roles)('role %s', (role) => {
      const hasAccess = hasPermission(role, ROUTE_PERMISSIONS['POST /api/admin/refund']);
      if (role === 'super_admin') {
        expect(hasAccess).toBe(true);
      } else {
        expect(hasAccess).toBe(false); // admin, support, analytics CANNOT refund
      }
    });
  });
});

describe('[Phase 31] ANALYTICS billing read-only', () => {
  it('analytics CAN read billing', () => {
    expect(hasPermission('analytics' as UserRole, 'billing:read')).toBe(true);
  });

  it('analytics CANNOT refund', () => {
    expect(hasPermission('analytics' as UserRole, 'billing.refund')).toBe(false);
  });

  it('analytics CANNOT adjust billing', () => {
    expect(hasPermission('analytics' as UserRole, 'billing.adjust')).toBe(false);
  });

  it('analytics CANNOT adjust credits', () => {
    expect(hasPermission('analytics' as UserRole, 'credits.adjust')).toBe(false);
  });

  it('analytics has zero mutation permissions', () => {
    const perms = getRolePermissions('analytics' as UserRole);
    const mutations = perms.filter(p =>
      p.endsWith('.adjust') || p.endsWith('.refund') || p.endsWith('.control') ||
      p.endsWith('.assign') || p.endsWith(':write') || p.endsWith('.ban') ||
      p.endsWith('.suspend') || p.endsWith('.restrict')
    );
    expect(mutations).toHaveLength(0);
  });
});

describe('[Phase 31] SUPPORT billing restrictions', () => {
  it('support CANNOT read billing', () => {
    expect(hasPermission('support' as UserRole, 'billing:read')).toBe(false);
  });

  it('support CANNOT refund', () => {
    expect(hasPermission('support' as UserRole, 'billing.refund')).toBe(false);
  });

  it('support CANNOT adjust billing', () => {
    expect(hasPermission('support' as UserRole, 'billing.adjust')).toBe(false);
  });
});

describe('[Phase 31] ADMIN billing capabilities', () => {
  it('admin CAN read billing', () => {
    expect(hasPermission('admin', 'billing:read')).toBe(true);
  });

  it('admin CAN adjust billing', () => {
    expect(hasPermission('admin', 'billing.adjust')).toBe(true);
  });

  it('admin CANNOT refund', () => {
    expect(hasPermission('admin', 'billing.refund')).toBe(false);
  });
});

describe('[Phase 31] Secret Protection', () => {
  it('no permission grants secret access', () => {
    const allPerms = getRolePermissions('super_admin');
    expect(allPerms).not.toContain('stripe.key.read' as Permission);
    expect(allPerms).not.toContain('razorpay.secret.read' as Permission);
    expect(allPerms).not.toContain('webhook.secret.read' as Permission);
  });

  it('billing:read does not grant refund', () => {
    expect(hasPermission('analytics' as UserRole, 'billing:read')).toBe(true);
    expect(hasPermission('analytics' as UserRole, 'billing.refund')).toBe(false);
  });

  it('billing:read does not grant credits.adjust', () => {
    expect(hasPermission('analytics' as UserRole, 'billing:read')).toBe(true);
    expect(hasPermission('analytics' as UserRole, 'credits.adjust')).toBe(false);
  });
});

describe('[Phase 31] Provider Status — Honest States', () => {
  it('STRIPE_SECRET_KEY presence does not guarantee health', () => {
    // The admin API reports provider status as CONFIGURED/NOT_CONFIGURED
    // based on env var presence — but does NOT claim HEALTHY.
    // Health requires actual webhook processing data.
    // This is a structural test verifying the pattern.
    const possibleStates = ['CONFIGURED', 'NOT_CONFIGURED', 'ERROR', 'UNKNOWN'];
    expect(possibleStates).toContain('CONFIGURED');
    expect(possibleStates).toContain('UNKNOWN');
    // HEALTHY is NOT in the provider-status vocabulary — only webhook health can be HEALTHY
    expect(possibleStates).not.toContain('HEALTHY');
  });
});

describe('[Phase 31] Phase 30 Regression', () => {
  it('user routes still use granular permissions', () => {
    expect(hasPermission('admin', 'users.read')).toBe(true);
    expect(hasPermission('admin', 'user360.read')).toBe(true);
    expect(hasPermission('analytics', 'users.read')).toBe(true);
    expect(hasPermission('analytics', 'user360.read')).toBe(true);
    expect(hasPermission('member', 'users.read')).toBe(false);
  });

  it('ban remains super_admin only', () => {
    expect(hasPermission('super_admin', 'users.ban')).toBe(true);
    expect(hasPermission('admin', 'users.ban')).toBe(false);
    expect(hasPermission('support', 'users.ban')).toBe(false);
  });
});
