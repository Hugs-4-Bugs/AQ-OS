// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Security Routes Authorization Test
//
// Verifies the actual authorization behavior of the 7 admin routes
// that use withPermission() (the MEDIUM-severity MFA enforcement gap
// surface from the Phase C audit):
//
//   /api/admin/rbac/roles              → rbac.read
//   /api/admin/security/audit          → audit.read
//   /api/admin/security/audit/:id      → audit.read
//   /api/admin/security/config-changes → audit.read
//   /api/admin/security/events         → security.events.read
//   /api/admin/security/role-changes   → rbac.read
//   /api/admin/security/suspicious-activity → security.events.read
//
// These tests invoke the actual route handlers (not just the wrappers)
// with a mocked getAuthUser and a mocked Prisma client. They verify:
//   - super_admin with MFA → 200
//   - super_admin without MFA → 200 (the gap)
//   - org owner → 403
//   - org admin → 200 for audit.read routes, 403 for the others
//   - unauthenticated → 401
//
// Source of truth:
//   src/app/api/admin/rbac/roles/route.ts
//   src/app/api/admin/security/audit/route.ts
//   src/app/api/admin/security/audit/[id]/route.ts
//   src/app/api/admin/security/config-changes/route.ts
//   src/app/api/admin/security/events/route.ts
//   src/app/api/admin/security/role-changes/route.ts
//   src/app/api/admin/security/suspicious-activity/route.ts
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

// ─── Mock @/lib/db (the routes use Prisma) ─────────────────────────
// vi.mock factories are hoisted — cannot reference outer let/const.
// Use vi.hoisted to declare the mocks in the hoist phase.
const dbMocks = vi.hoisted(() => ({
  auditLog: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}));
vi.mock('@/lib/db', () => ({
  db: {
    auditLog: dbMocks.auditLog,
    user: dbMocks.user,
  },
}));

// ─── Mock @/lib/security/audit-chain (used by suspicious-activity) ─
const auditChainMock = vi.hoisted(() => ({
  detectSuspiciousActivity: vi.fn(),
}));
vi.mock('@/lib/security/audit-chain', () => ({
  detectSuspiciousActivity: auditChainMock.detectSuspiciousActivity,
}));

// ─── Mock transitive deps of auth-middleware ───────────────────────
vi.mock('@/lib/api-key-middleware', () => ({
  withDualAuth: vi.fn().mockResolvedValue({
    authenticated: false,
    error: Response.json({ error: 'Authentication required' }, { status: 401 }),
  }),
}));
vi.mock('@/lib/api-key-service', () => ({
  recordApiKeyUsage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/entitlement-service', () => ({
  checkEntitlement: vi.fn().mockReturnValue(true),
  requireFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));

// ─── Import route handlers AFTER mocks are in place ────────────────
import * as rbacRolesRoute from '@/app/api/admin/rbac/roles/route';
import * as auditRoute from '@/app/api/admin/security/audit/route';
import * as auditIdRoute from '@/app/api/admin/security/audit/[id]/route';
import * as configChangesRoute from '@/app/api/admin/security/config-changes/route';
import * as eventsRoute from '@/app/api/admin/security/events/route';
import * as roleChangesRoute from '@/app/api/admin/security/role-changes/route';
import * as suspiciousActivityRoute from '@/app/api/admin/security/suspicious-activity/route';

import {
  SUPER_ADMIN_WITH_MFA,
  SUPER_ADMIN_WITHOUT_MFA,
  OWNER,
  ADMIN,
} from '../helpers/rbac-fixtures';

// ─── Helpers ───────────────────────────────────────────────────────

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makeGetRequestWithId(url: string, id: string): NextRequest {
  return new NextRequest(`${url}?id=${id}`, { method: 'GET' });
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('Admin security routes — authorization matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.auditLog.findMany.mockResolvedValue([]);
    dbMocks.auditLog.findUnique.mockResolvedValue(null);
    dbMocks.auditLog.count.mockResolvedValue(0);
    auditChainMock.detectSuspiciousActivity.mockResolvedValue([]);
  });

  // ─── /api/admin/rbac/roles (rbac.read) ─────────────────────────
  describe('GET /api/admin/rbac/roles — requires rbac.read', () => {
    const routePath = '/api/admin/rbac/roles';

    it('super_admin WITH MFA → 200', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITH_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await rbacRolesRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('super_admin WITHOUT MFA → 200 (GAP — withPermission does not enforce MFA)', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await rbacRolesRoute.GET(req);
      // ⚠️ This is the documented gap — 200 instead of 403 MFA_REQUIRED.
      expect(res.status).toBe(200);
    });

    it('org owner → 403 Insufficient permissions', async () => {
      mockGetAuthUser.mockResolvedValue(OWNER.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await rbacRolesRoute.GET(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Insufficient permissions');
    });

    it('org admin → 403 (admin lacks rbac.read)', async () => {
      mockGetAuthUser.mockResolvedValue(ADMIN.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await rbacRolesRoute.GET(req);
      expect(res.status).toBe(403);
    });

    it('unauthenticated → 401', async () => {
      mockGetAuthUser.mockResolvedValue(null);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await rbacRolesRoute.GET(req);
      expect(res.status).toBe(401);
    });
  });

  // ─── /api/admin/security/audit (audit.read) ────────────────────
  describe('GET /api/admin/security/audit — requires audit.read', () => {
    const routePath = '/api/admin/security/audit';

    it('super_admin WITH MFA → 200', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITH_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await auditRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('super_admin WITHOUT MFA → 200 (GAP)', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await auditRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('org admin → 200 (admin has audit.read)', async () => {
      mockGetAuthUser.mockResolvedValue(ADMIN.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await auditRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('org owner → 403 (owner lacks audit.read)', async () => {
      mockGetAuthUser.mockResolvedValue(OWNER.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await auditRoute.GET(req);
      expect(res.status).toBe(403);
    });

    it('unauthenticated → 401', async () => {
      mockGetAuthUser.mockResolvedValue(null);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await auditRoute.GET(req);
      expect(res.status).toBe(401);
    });

    it('returns entries + total in body', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITH_MFA.user);
      dbMocks.auditLog.findMany.mockResolvedValue([
        { id: 'log-1', action: 'test', userId: 'u1', createdAt: new Date() },
      ]);
      dbMocks.auditLog.count.mockResolvedValue(1);
      const req = makeGetRequest(`http://localhost:3000${routePath}?limit=10`);
      const res = await auditRoute.GET(req);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.entries).toHaveLength(1);
      expect(body.data.total).toBe(1);
    });
  });

  // ─── /api/admin/security/audit/:id (audit.read) ────────────────
  describe('GET /api/admin/security/audit/:id — requires audit.read', () => {
    const routePath = '/api/admin/security/audit';

    it('super_admin WITH MFA, valid id → 200 (or 404 if not found)', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITH_MFA.user);
      dbMocks.auditLog.findUnique.mockResolvedValue({
        id: 'log-1', action: 'test', userId: 'u1',
        createdAt: new Date(), outcome: 'success',
      });
      const req = makeGetRequest(`http://localhost:3000${routePath}/log-1`);
      const ctx = { params: Promise.resolve({ id: 'log-1' }) };
      const res = await auditIdRoute.GET(req, ctx);
      expect(res.status).toBe(200);
    });

    it('super_admin WITHOUT MFA → 200 (GAP — no MFA check)', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      dbMocks.auditLog.findUnique.mockResolvedValue(null);
      const req = makeGetRequest(`http://localhost:3000${routePath}/log-1`);
      const ctx = { params: Promise.resolve({ id: 'log-1' }) };
      const res = await auditIdRoute.GET(req, ctx);
      // Gap: returns 404 (audit entry not found) instead of 403 MFA_REQUIRED.
      expect(res.status).toBe(404);
    });

    it('rejects short ids (< 4 chars) with 400', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITH_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}/ab`);
      const ctx = { params: Promise.resolve({ id: 'ab' }) };
      const res = await auditIdRoute.GET(req, ctx);
      expect(res.status).toBe(400);
    });

    it('org owner → 403', async () => {
      mockGetAuthUser.mockResolvedValue(OWNER.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}/log-1`);
      const ctx = { params: Promise.resolve({ id: 'log-1' }) };
      const res = await auditIdRoute.GET(req, ctx);
      expect(res.status).toBe(403);
    });
  });

  // ─── /api/admin/security/config-changes (audit.read) ───────────
  describe('GET /api/admin/security/config-changes — requires audit.read', () => {
    const routePath = '/api/admin/security/config-changes';

    it('super_admin WITHOUT MFA → 200 (GAP)', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await configChangesRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('org admin → 200 (admin has audit.read)', async () => {
      mockGetAuthUser.mockResolvedValue(ADMIN.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await configChangesRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('org owner → 403', async () => {
      mockGetAuthUser.mockResolvedValue(OWNER.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await configChangesRoute.GET(req);
      expect(res.status).toBe(403);
    });
  });

  // ─── /api/admin/security/events (security.events.read) ─────────
  describe('GET /api/admin/security/events — requires security.events.read', () => {
    const routePath = '/api/admin/security/events';

    it('super_admin WITH MFA → 200', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITH_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await eventsRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('super_admin WITHOUT MFA → 200 (GAP)', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await eventsRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('org admin → 403 (admin lacks security.events.read)', async () => {
      // ⚠️ This is the comment-vs-RBAC discrepancy from the Phase C audit:
      //    the route comment says "(super_admin, admin)" but the RBAC
      //    matrix grants security.events.read ONLY to super_admin.
      mockGetAuthUser.mockResolvedValue(ADMIN.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await eventsRoute.GET(req);
      expect(res.status).toBe(403);
    });

    it('org owner → 403', async () => {
      mockGetAuthUser.mockResolvedValue(OWNER.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await eventsRoute.GET(req);
      expect(res.status).toBe(403);
    });

    it('unauthenticated → 401', async () => {
      mockGetAuthUser.mockResolvedValue(null);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await eventsRoute.GET(req);
      expect(res.status).toBe(401);
    });
  });

  // ─── /api/admin/security/role-changes (rbac.read) ──────────────
  describe('GET /api/admin/security/role-changes — requires rbac.read', () => {
    const routePath = '/api/admin/security/role-changes';

    it('super_admin WITH MFA → 200', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITH_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await roleChangesRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('super_admin WITHOUT MFA → 200 (GAP)', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await roleChangesRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('org admin → 403 (admin lacks rbac.read)', async () => {
      mockGetAuthUser.mockResolvedValue(ADMIN.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await roleChangesRoute.GET(req);
      expect(res.status).toBe(403);
    });

    it('org owner → 403', async () => {
      mockGetAuthUser.mockResolvedValue(OWNER.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await roleChangesRoute.GET(req);
      expect(res.status).toBe(403);
    });
  });

  // ─── /api/admin/security/suspicious-activity (security.events.read) ─
  describe('GET /api/admin/security/suspicious-activity — requires security.events.read', () => {
    const routePath = '/api/admin/security/suspicious-activity';

    it('super_admin WITH MFA → 200', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITH_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await suspiciousActivityRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('super_admin WITHOUT MFA → 200 (GAP)', async () => {
      mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_WITHOUT_MFA.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await suspiciousActivityRoute.GET(req);
      expect(res.status).toBe(200);
    });

    it('org admin → 403 (admin lacks security.events.read)', async () => {
      mockGetAuthUser.mockResolvedValue(ADMIN.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await suspiciousActivityRoute.GET(req);
      expect(res.status).toBe(403);
    });

    it('org owner → 403', async () => {
      mockGetAuthUser.mockResolvedValue(OWNER.user);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await suspiciousActivityRoute.GET(req);
      expect(res.status).toBe(403);
    });

    it('unauthenticated → 401', async () => {
      mockGetAuthUser.mockResolvedValue(null);
      const req = makeGetRequest(`http://localhost:3000${routePath}`);
      const res = await suspiciousActivityRoute.GET(req);
      expect(res.status).toBe(401);
    });
  });
});
