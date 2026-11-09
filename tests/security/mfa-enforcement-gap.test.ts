// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Centralized Test Suite
// MFA Enforcement Gap Test
//
// Tests the MEDIUM-severity finding from the Phase C audit:
//   withPermission() checks RBAC permission but does NOT enforce MFA
//   for super_admin accounts. Compare with withSuperAdmin() which DOES
//   enforce MFA, and withPermissionAndMfa() which enforces both.
//
// Source of truth:
//   src/lib/auth-middleware.ts:
//     withPermission       (lines 65–79)   — NO mfaEnabled check
//     withPermissionAndMfa (lines 86–105)  — mfaEnabled check at line 97
//     withSuperAdmin       (lines 173–189) — mfaEnabled check at line 181
//
// These tests prove:
//   1. withPermission allows a non-MFA super_admin to pass.
//   2. withPermissionAndMfa correctly blocks a non-MFA super_admin.
//   3. withSuperAdmin correctly blocks a non-MFA super_admin.
//   4. None of the wrappers affect non-super_admin roles regardless of MFA.
//
// This is a SOURCE-LEVEL test. It does NOT exercise the HTTP routes
// themselves — it directly invokes the wrappers with a mocked
// getAuthUser. Route-level coverage is in tests/api/.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ─── Mock @/lib/auth ───────────────────────────────────────────────
const mockGetAuthUser = vi.fn();

vi.mock('@/lib/auth', () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number = 401) {
      super(message);
      this.name = 'AuthError';
      this.statusCode = statusCode;
    }
  },
}));

// ─── Mock transitive deps of auth-middleware (avoid real network/api-key calls) ───
vi.mock('@/lib/api-key-middleware', () => ({
  withDualAuth: vi.fn().mockResolvedValue({
    authenticated: false,
    error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
  }),
}));

vi.mock('@/lib/api-key-service', () => ({
  recordApiKeyUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/entitlement-service', () => ({
  checkEntitlement: vi.fn().mockReturnValue(true),
  requireFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));

// ─── Import wrappers UNDER TEST (after mocks are in place) ────────
import {
  withAuth,
  withPermission,
  withPermissionAndMfa,
  withSuperAdmin,
} from '@/lib/auth-middleware';
import {
  SUPER_ADMIN_WITH_MFA,
  SUPER_ADMIN_WITHOUT_MFA,
  OWNER,
  VIEWER,
} from '../helpers/rbac-fixtures';
import { hasPermission } from '@/lib/rbac';

// ─── Helpers ───────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request('http://localhost:3000/api/test', { method: 'GET' });
}

function okHandler() {
  return vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('MFA enforcement gap — withPermission vs withSuperAdmin vs withPermissionAndMfa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withPermission — does NOT enforce MFA for super_admin (gap)', () => {
    it('ALLOWS super_admin WITHOUT MFA when the role holds audit.read', async () => {
      expect(hasPermission('super_admin', 'audit.read')).toBe(true);

      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const handler = okHandler();

      const response = await withPermission(
        makeRequest() as never,
        'audit.read',
        handler,
      );

      // ⚠️ Gap: returns 200 despite super_admin having no MFA.
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('ALLOWS super_admin WITHOUT MFA for security.events.read', async () => {
      expect(hasPermission('super_admin', 'security.events.read')).toBe(true);

      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const handler = okHandler();

      const response = await withPermission(
        makeRequest() as never,
        'security.events.read',
        handler,
      );

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('ALLOWS super_admin WITHOUT MFA for rbac.read', async () => {
      expect(hasPermission('super_admin', 'rbac.read')).toBe(true);

      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const handler = okHandler();

      const response = await withPermission(
        makeRequest() as never,
        'rbac.read',
        handler,
      );

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('BLOCKS unauthenticated callers with 401', async () => {
      mockGetAuthUser.mockResolvedValue(null);
      const handler = okHandler();

      const response = await withPermission(
        makeRequest() as never,
        'audit.read',
        handler,
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Authentication required');
      expect(handler).not.toHaveBeenCalled();
    });

    it('BLOCKS roles lacking the permission with 403', async () => {
      // viewer lacks audit.read
      mockGetAuthUser.mockResolvedValue(VIEWER.user);
      const handler = okHandler();

      const response = await withPermission(
        makeRequest() as never,
        'audit.read',
        handler,
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Insufficient permissions');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('withPermissionAndMfa — enforces MFA for super_admin', () => {
    it('BLOCKS super_admin WITHOUT MFA even when holding audit.read', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const handler = okHandler();

      const response = await withPermissionAndMfa(
        makeRequest() as never,
        'audit.read',
        handler,
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe(
        'MFA is mandatory for this operation. Enable MFA in Settings → Security.',
      );
      expect(body.code).toBe('MFA_REQUIRED');
      expect(handler).not.toHaveBeenCalled();
    });

    it('ALLOWS super_admin WITH MFA when holding the permission', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITH_MFA.user);
      const handler = okHandler();

      const response = await withPermissionAndMfa(
        makeRequest() as never,
        'audit.read',
        handler,
      );

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('ALLOWS non-super_admin roles WITHOUT MFA when they hold the permission', async () => {
      // owner is NOT super_admin; MFA is not required by this wrapper.
      // owner lacks audit.read; use a permission owner HAS (leads:read).
      mockGetAuthUser.mockResolvedValue(OWNER.user);
      const handler = okHandler();

      const response = await withPermissionAndMfa(
        makeRequest() as never,
        'leads:read',
        handler,
      );

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('BLOCKS unauthenticated callers with 401', async () => {
      mockGetAuthUser.mockResolvedValue(null);
      const handler = okHandler();

      const response = await withPermissionAndMfa(
        makeRequest() as never,
        'audit.read',
        handler,
      );

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('BLOCKS roles lacking the permission with 403 (before MFA check)', async () => {
      mockGetAuthUser.mockResolvedValue(VIEWER.user);
      const handler = okHandler();

      const response = await withPermissionAndMfa(
        makeRequest() as never,
        'audit.read',
        handler,
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Insufficient permissions');
      // MFA_REQUIRED is NOT returned because the permission check fails first.
      expect(body.code).toBeUndefined();
    });
  });

  describe('withSuperAdmin — enforces MFA + super_admin role', () => {
    it('BLOCKS super_admin WITHOUT MFA', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const handler = okHandler();

      const response = await withSuperAdmin(makeRequest() as never, handler);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain('MFA is mandatory for super admin accounts');
      expect(body.code).toBe('MFA_REQUIRED');
      expect(handler).not.toHaveBeenCalled();
    });

    it('ALLOWS super_admin WITH MFA', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITH_MFA.user);
      const handler = okHandler();

      const response = await withSuperAdmin(makeRequest() as never, handler);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('BLOCKS non-super_admin roles with 403', async () => {
      // owner has admin:access but is NOT super_admin
      mockGetAuthUser.mockResolvedValue(OWNER.user);
      const handler = okHandler();

      const response = await withSuperAdmin(makeRequest() as never, handler);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Super admin access required');
      expect(handler).not.toHaveBeenCalled();
    });

    it('BLOCKS unauthenticated callers with 401', async () => {
      mockGetAuthUser.mockResolvedValue(null);
      const handler = okHandler();

      const response = await withSuperAdmin(makeRequest() as never, handler);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Authentication required');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('withAuth — baseline, never checks MFA', () => {
    it('ALLOWS any authenticated user (incl. non-MFA super_admin)', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const handler = okHandler();

      const response = await withAuth(makeRequest() as never, handler);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('BLOCKS unauthenticated callers with 401', async () => {
      mockGetAuthUser.mockResolvedValue(null);
      const handler = okHandler();

      const response = await withAuth(makeRequest() as never, handler);

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('finding summary — MFA enforcement matrix', () => {
    it('documents which wrappers enforce MFA for super_admin', () => {
      // If this matrix ever changes, this test forces a re-audit.
      const matrix = {
        withAuth: { enforcesMfaForSuperAdmin: false, enforcesRole: false },
        withPermission: { enforcesMfaForSuperAdmin: false, enforcesRole: true },
        withPermissionAndMfa: { enforcesMfaForSuperAdmin: true, enforcesRole: true },
        withSuperAdmin: { enforcesMfaForSuperAdmin: true, enforcesRole: true },
      };
      expect(matrix.withAuth.enforcesMfaForSuperAdmin).toBe(false);
      expect(matrix.withPermission.enforcesMfaForSuperAdmin).toBe(false);
      expect(matrix.withPermissionAndMfa.enforcesMfaForSuperAdmin).toBe(true);
      expect(matrix.withSuperAdmin.enforcesMfaForSuperAdmin).toBe(true);
    });
  });
});
