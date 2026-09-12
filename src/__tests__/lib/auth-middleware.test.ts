// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Auth Middleware (src/lib/auth-middleware.ts)
// Tests withAuth, withPermission, withAdmin middleware wrappers
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock the auth module
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

// Mock the rbac module
vi.mock('@/lib/rbac', () => ({
  hasPermission: (role: string, permission: string) => {
    const adminRoles = ['super_admin', 'owner', 'admin'];
    if (permission === 'admin:access') return adminRoles.includes(role);
    if (role === 'viewer') {
      const viewerPerms = ['leads:read', 'pipeline:read', 'discover:read', 'assistant:read', 'insights:read', 'deals:read', 'competitors:read', 'settings:read'];
      return viewerPerms.includes(permission);
    }
    return true; // owner/member have most perms
  },
  hasAllPermissions: (role: string, permissions: string[]) => {
    return permissions.every((p) => {
      const adminRoles = ['super_admin', 'owner', 'admin'];
      if (p === 'admin:access') return adminRoles.includes(role);
      return true;
    });
  },
  isAdminRole: (role: string) => ['super_admin', 'owner', 'admin'].includes(role),
}));

// Mock entitlement-service
vi.mock('@/lib/entitlement-service', () => ({
  checkEntitlement: (plan: string, feature: string) => {
    if (plan === 'free' && feature === 'deep_analysis') return false;
    return true;
  },
  requireFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));

import { withAuth, withPermission, withAdmin } from '@/lib/auth-middleware';
import { createMockRequest, createUnauthenticatedRequest } from '../helpers/mock-request';
import { createMockUser } from '../helpers/mock-user';

describe('auth-middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── withAuth ──────────────────────────────────────────────────

  describe('withAuth', () => {
    it('should return 401 when no auth token is provided', async () => {
      mockGetAuthUser.mockResolvedValue(null);

      const request = createUnauthenticatedRequest();
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withAuth(request, handler);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Authentication required');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call handler when user is authenticated', async () => {
      const mockUser = createMockUser();
      mockGetAuthUser.mockResolvedValue(mockUser);

      const request = createMockRequest();
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withAuth(request, handler);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledWith(mockUser);
    });

    it('should handle AuthError with correct status code', async () => {
      const { AuthError } = await import('@/lib/auth');
      mockGetAuthUser.mockRejectedValue(new AuthError('Token expired', 401));

      const request = createUnauthenticatedRequest();
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withAuth(request, handler);

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected errors', async () => {
      mockGetAuthUser.mockRejectedValue(new Error('DB connection failed'));

      const request = createMockRequest();
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withAuth(request, handler);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Internal server error');
    });
  });

  // ── withPermission ────────────────────────────────────────────

  describe('withPermission', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetAuthUser.mockResolvedValue(null);

      const request = createUnauthenticatedRequest();
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withPermission(request, 'leads:read', handler);

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks the required permission', async () => {
      const viewerUser = createMockUser({ role: 'viewer' });
      mockGetAuthUser.mockResolvedValue(viewerUser);

      const request = createMockRequest({ role: 'viewer' });
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      // viewer doesn't have admin:access
      const response = await withPermission(request, 'admin:access', handler);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Insufficient permissions');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call handler when user has the required permission', async () => {
      const ownerUser = createMockUser({ role: 'owner' });
      mockGetAuthUser.mockResolvedValue(ownerUser);

      const request = createMockRequest({ role: 'owner' });
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withPermission(request, 'leads:read', handler);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledWith(ownerUser);
    });
  });

  // ── withAdmin ─────────────────────────────────────────────────

  describe('withAdmin', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetAuthUser.mockResolvedValue(null);

      const request = createUnauthenticatedRequest();
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withAdmin(request, handler);

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 403 for non-admin users', async () => {
      const viewerUser = createMockUser({ role: 'viewer' });
      mockGetAuthUser.mockResolvedValue(viewerUser);

      const request = createMockRequest({ role: 'viewer' });
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withAdmin(request, handler);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Admin access required');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call handler for super_admin role', async () => {
      const adminUser = createMockUser({ role: 'super_admin' });
      mockGetAuthUser.mockResolvedValue(adminUser);

      const request = createMockRequest({ role: 'super_admin' });
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withAdmin(request, handler);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledWith(adminUser);
    });

    it('should call handler for owner role', async () => {
      const ownerUser = createMockUser({ role: 'owner' });
      mockGetAuthUser.mockResolvedValue(ownerUser);

      const request = createMockRequest({ role: 'owner' });
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withAdmin(request, handler);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should call handler for admin role', async () => {
      const adminUser = createMockUser({ role: 'admin' });
      mockGetAuthUser.mockResolvedValue(adminUser);

      const request = createMockRequest({ role: 'admin' });
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

      const response = await withAdmin(request, handler);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });
  });
});
