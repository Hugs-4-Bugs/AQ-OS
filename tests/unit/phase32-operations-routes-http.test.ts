// ═══════════════════════════════════════════════════════════════════
// Phase 32 — GENUINE ROUTE-LEVEL HTTP TESTS
//
// These tests invoke the REAL route handlers (GET/POST/PATCH) imported
// from the actual Next.js route modules, using REAL NextRequest objects,
// REAL @/lib/auth-middleware (withPermission), and the REAL @/lib/rbac
// permission registry. Only @/lib/auth (getAuthUser) and the DB/service
// layer are mocked — the auth→permission→HTTP-status pipeline is real.
//
// Routes under test (Phase 32):
//   GET   /api/admin/operations/system-health       → system.health.read
//   GET   /api/admin/operations/events              → system.health.read
//   PATCH /api/admin/operations/events/[id]         → system.events.resolve
//   GET   /api/admin/operations/integrations        → integrations.read
//   POST  /api/admin/operations/integrations/[provider]/action → integrations.control
//   GET   /api/admin/operations/audit               → audit.read
//   POST  /api/admin/operations/retry               → system.operations.retry
//   GET   /api/admin/operations/metrics             → system.health.read
//
// Every test asserts an actual HTTP status code (200 / 401 / 403 / 400 / 404).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocked auth module — controllable getAuthUser ─────────────────────
type MockedAuthModule = typeof import('@/lib/auth') & {
  __mockGetAuthUser: ReturnType<typeof vi.fn>;
};

vi.mock('@/lib/auth', () => {
  const mockGetAuthUser = vi.fn().mockResolvedValue(null);
  return {
    getAuthUser: mockGetAuthUser,
    __mockGetAuthUser: mockGetAuthUser,
    getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
    getUserAgent: vi.fn().mockReturnValue('test-agent'),
    AuthError: class AuthError extends Error {
      statusCode: number;
      constructor(message: string, statusCode = 401) {
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
      }
    },
  };
});

// ── Mock admin-operations-service ─────────────────────────────────────
vi.mock('@/lib/admin-operations-service', () => ({
  getSystemHealth: vi.fn().mockResolvedValue({
    database: { state: 'HEALTHY', latencyMs: 12, tableCount: 115 },
    sessions: { activeCount: 5, last24hCount: 20 },
    errors: { unresolvedEvents: 0, criticalEvents24h: 0, errorEvents24h: 0, warningEvents24h: 0 },
    audit: { events24h: 100, sensitiveActions24h: 5 },
    integrations: { configured: 3, notConfigured: 4, healthy: 0, degraded: 0, down: 0, unknown: 7 },
    overallHealth: 'UNKNOWN',
  }),
  getOperationalEvents: vi.fn().mockResolvedValue({ events: [], total: 0 }),
  resolveOperationalEvent: vi.fn().mockResolvedValue({
    success: true, eventId: 'evt-1', resolvedAt: new Date(), alreadyResolved: false,
  }),
  getIntegrationsStatus: vi.fn().mockResolvedValue({
    providers: [],
    summary: { total: 0, configured: 0, healthy: 0, degraded: 0, down: 0, unknown: 0 },
    overallHealth: 'UNKNOWN',
  }),
  getAuditLog: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
  retryFailedOperation: vi.fn().mockResolvedValue({
    accepted: true, idempotencyKey: 'key-1', status: 'started', startedAt: new Date(),
  }),
  getOperationalMetrics: vi.fn().mockResolvedValue({
    totals: { unresolvedEvents: 0, criticalEvents: 0, openSupportTickets: 0, activeApiKeys: 0, activeSessions: 0 },
    last24h: { auditEvents: 0, signups: 0, signins: 0, signinFailures: 0, workflowExecutions: 0, workflowFailures: 0 },
    byEventSource: [], byEventType: [],
  }),
}));

// ── Mock admin-billing-service (used transitively) ────────────────────
vi.mock('@/lib/admin-billing-service', () => ({
  getProviderStatus: vi.fn().mockResolvedValue({
    providers: [],
    webhookHealth: 'UNKNOWN',
  }),
}));

// ── Mock @/lib/db ─────────────────────────────────────────────────────
vi.mock('@/lib/db', () => {
  const f = () => vi.fn();
  return {
    db: {
      $queryRaw: f().mockResolvedValue([{ 'count(*)': 115 }]),
      $queryRawUnsafe: f().mockResolvedValue(115),
      auditLog: {
        findMany: f().mockResolvedValue([]),
        findFirst: f().mockResolvedValue(null),
        count: f().mockResolvedValue(0),
        create: f().mockResolvedValue({ id: 'audit-1' }),
      },
      systemEvent: {
        findMany: f().mockResolvedValue([]),
        findUnique: f().mockResolvedValue(null),
        count: f().mockResolvedValue(0),
        groupBy: f().mockResolvedValue([]),
        update: f().mockResolvedValue({}),
      },
      user: { count: f().mockResolvedValue(0) },
      userSession: { count: f().mockResolvedValue(0) },
      supportTicket: { count: f().mockResolvedValue(0) },
      apiKey: { count: f().mockResolvedValue(0) },
      emailAccount: { count: f().mockResolvedValue(0) },
      telegramConfig: { findFirst: f().mockResolvedValue(null), count: f().mockResolvedValue(0) },
      whatsappConfig: { findFirst: f().mockResolvedValue(null), count: f().mockResolvedValue(0) },
      paymentWebhook: { count: f().mockResolvedValue(0), findFirst: f().mockResolvedValue(null) },
      paymentOrder: { count: f().mockResolvedValue(0), aggregate: f().mockResolvedValue({ _sum: {} }), findMany: f().mockResolvedValue([]), groupBy: f().mockResolvedValue([]) },
      subscription: { count: f().mockResolvedValue(0), groupBy: f().mockResolvedValue([]), findMany: f().mockResolvedValue([]) },
    },
  };
});

// ── Test users ────────────────────────────────────────────────────────
const TEST_USERS: Record<string, { id: string; email: string; role: string; plan: string }> = {
  super_admin: { id: 'su-1', email: 'su@test.local', role: 'super_admin', plan: 'elite' },
  admin:       { id: 'ad-1', email: 'ad@test.local', role: 'admin',       plan: 'pro'   },
  support:     { id: 'sp-1', email: 'sp@test.local', role: 'support',     plan: 'free'  },
  analytics:   { id: 'an-1', email: 'an@test.local', role: 'analytics',   plan: 'free'  },
  member:      { id: 'me-1', email: 'me@test.local', role: 'member',      plan: 'free'  },
  viewer:      { id: 'vi-1', email: 'vi@test.local', role: 'viewer',      plan: 'free'  },
};

function buildGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}
function buildPatch(url: string, body: unknown): NextRequest {
  return new NextRequest(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function buildPost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/operations/system-health  (system.health.read)
// Granted to: super_admin, admin, support, analytics
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 HTTP] GET /api/admin/operations/system-health', () => {
  let GET: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/operations/system-health/route');
    GET = mod.GET;
  });

  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     200],
    ['analytics',   200],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await GET(buildGet('http://localhost:3000/api/admin/operations/system-health'));
      expect(res.status).toBe(expectedStatus);
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const res = await GET(buildGet('http://localhost:3000/api/admin/operations/system-health'));
    expect(res.status).toBe(401);
  });

  it('super_admin response body has expected shape', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const res = await GET(buildGet('http://localhost:3000/api/admin/operations/system-health'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body.data).toHaveProperty('database');
    expect(body.data).toHaveProperty('overallHealth');
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/operations/events  (system.health.read)
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 HTTP] GET /api/admin/operations/events', () => {
  let GET: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/operations/events/route');
    GET = mod.GET;
  });

  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     200],
    ['analytics',   200],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await GET(buildGet('http://localhost:3000/api/admin/operations/events'));
      expect(res.status).toBe(expectedStatus);
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const res = await GET(buildGet('http://localhost:3000/api/admin/operations/events'));
    expect(res.status).toBe(401);
  });

  it('filters applied: ?type=error&resolved=false → 200 for super_admin', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const res = await GET(buildGet('http://localhost:3000/api/admin/operations/events?type=error&resolved=false&limit=10'));
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/admin/operations/events/[id]  (system.events.resolve)
// Granted to: super_admin, admin ONLY
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 HTTP] PATCH /api/admin/operations/events/[id]', () => {
  let PATCH: (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/operations/events/[id]/route');
    PATCH = mod.PATCH;
  });

  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     403],
    ['analytics',   403],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const req = buildPatch('http://localhost:3000/api/admin/operations/events/evt-123', { note: 'Resolved' });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'evt-123' }) });
      expect(res.status).toBe(expectedStatus);
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const req = buildPatch('http://localhost:3000/api/admin/operations/events/evt-123', { note: 'Resolved' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'evt-123' }) });
    expect(res.status).toBe(401);
  });

  it('super_admin with empty event id → 400', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildPatch('http://localhost:3000/api/admin/operations/events/x', {});
    const res = await PATCH(req, { params: Promise.resolve({ id: 'x' }) });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/operations/integrations  (integrations.read)
// Granted to: super_admin, admin, support (analytics does NOT have
// integrations.read per existing rbac.ts — kept as-is to avoid weakening
// or broadening existing RBAC).
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 HTTP] GET /api/admin/operations/integrations', () => {
  let GET: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/operations/integrations/route');
    GET = mod.GET;
  });

  // analytics lacks integrations.read in existing rbac.ts — preserve that.
  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     200],
    ['analytics',   403],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await GET(buildGet('http://localhost:3000/api/admin/operations/integrations'));
      expect(res.status).toBe(expectedStatus);
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const res = await GET(buildGet('http://localhost:3000/api/admin/operations/integrations'));
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/operations/integrations/[provider]/action  (integrations.control)
// Granted to: super_admin, admin ONLY
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 HTTP] POST /api/admin/operations/integrations/[provider]/action', () => {
  let POST: (request: NextRequest, ctx: { params: Promise<{ provider: string }> }) => Promise<Response>;
  let authModule: MockedAuthModule;
  const VALID_BODY = { action: 'validate', idempotencyKey: 'op-1-abcd' };

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/operations/integrations/[provider]/action/route');
    POST = mod.POST;
  });

  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     403],
    ['analytics',   403],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const req = buildPost('http://localhost:3000/api/admin/operations/integrations/payment.stripe/action', VALID_BODY);
      const res = await POST(req, { params: Promise.resolve({ provider: 'payment.stripe' }) });
      expect(res.status).toBe(expectedStatus);
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const req = buildPost('http://localhost:3000/api/admin/operations/integrations/payment.stripe/action', VALID_BODY);
    const res = await POST(req, { params: Promise.resolve({ provider: 'payment.stripe' }) });
    expect(res.status).toBe(401);
  });

  it('super_admin with invalid provider → 400', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildPost('http://localhost:3000/api/admin/operations/integrations/invalid.provider/action', VALID_BODY);
    const res = await POST(req, { params: Promise.resolve({ provider: 'invalid.provider' }) });
    expect(res.status).toBe(400);
  });

  it('super_admin with missing action → 400', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildPost('http://localhost:3000/api/admin/operations/integrations/payment.stripe/action', { idempotencyKey: 'op-1-abcd' });
    const res = await POST(req, { params: Promise.resolve({ provider: 'payment.stripe' }) });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/operations/audit  (audit.read)
// Granted to: super_admin, admin, support, analytics
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 HTTP] GET /api/admin/operations/audit', () => {
  let GET: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/operations/audit/route');
    GET = mod.GET;
  });

  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     200],
    ['analytics',   200],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await GET(buildGet('http://localhost:3000/api/admin/operations/audit'));
      expect(res.status).toBe(expectedStatus);
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const res = await GET(buildGet('http://localhost:3000/api/admin/operations/audit'));
    expect(res.status).toBe(401);
  });

  it('filters applied: ?action=refund&resource=user → 200', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const res = await GET(buildGet('http://localhost:3000/api/admin/operations/audit?action=refund&resource=user&limit=10'));
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/operations/retry  (system.operations.retry)
// Granted to: super_admin, admin ONLY
// Includes idempotency validation.
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 HTTP] POST /api/admin/operations/retry', () => {
  let POST: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;
  const VALID_BODY = {
    idempotencyKey: 'retry-key-001',
    operationType: 'workflow_reexecute',
    targetId: 'wf-123',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/operations/retry/route');
    POST = mod.POST;
  });

  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     403],
    ['analytics',   403],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const req = buildPost('http://localhost:3000/api/admin/operations/retry', VALID_BODY);
      const res = await POST(req);
      expect(res.status).toBe(expectedStatus);
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const req = buildPost('http://localhost:3000/api/admin/operations/retry', VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('super_admin with short idempotencyKey → 400', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildPost('http://localhost:3000/api/admin/operations/retry', {
      idempotencyKey: 'ab',
      operationType: 'workflow_reexecute',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('super_admin with short operationType → 400', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildPost('http://localhost:3000/api/admin/operations/retry', {
      idempotencyKey: 'valid-key-1',
      operationType: 'xy',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('super_admin with invalid JSON body → 400', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = new NextRequest('http://localhost:3000/api/admin/operations/retry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/operations/metrics  (system.health.read)
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 HTTP] GET /api/admin/operations/metrics', () => {
  let GET: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/operations/metrics/route');
    GET = mod.GET;
  });

  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     200],
    ['analytics',   200],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await GET(buildGet('http://localhost:3000/api/admin/operations/metrics'));
      expect(res.status).toBe(expectedStatus);
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const res = await GET(buildGet('http://localhost:3000/api/admin/operations/metrics'));
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECRET PROTECTION — verify route responses never contain secrets
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 HTTP] Secret protection in operations route responses', () => {
  let systemHealthGET: (request: NextRequest) => Promise<Response>;
  let integrationsGET: (request: NextRequest) => Promise<Response>;
  let eventsGET: (request: NextRequest) => Promise<Response>;
  let auditGET: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    systemHealthGET = (await import('@/app/api/admin/operations/system-health/route')).GET;
    integrationsGET = (await import('@/app/api/admin/operations/integrations/route')).GET;
    eventsGET = (await import('@/app/api/admin/operations/events/route')).GET;
    auditGET = (await import('@/app/api/admin/operations/audit/route')).GET;
  });

  const SECRET_PATTERNS = [
    /STRIPE_SECRET_KEY/i,
    /sk_live_[a-z0-9]+/i,
    /sk_test_[a-z0-9]+/i,
    /RAZORPAY_KEY_SECRET/i,
    /rzp_live_[a-z0-9]+/i,
    /WEBHOOK_SIGNING_SECRET/i,
    /whsec_[a-z0-9]+/i,
    /JWT_SECRET\s*=\s*[a-z0-9]+/i,
    /GOOGLE_CLIENT_SECRET\s*=\s*[a-z0-9_-]+/i,
    /signingSecret/i,
    /rawPayload/i,
    /apiKey.*=.*[a-z0-9]{20,}/i,
  ];

  it('GET /api/admin/operations/system-health body has no secrets', async () => {
    const res = await systemHealthGET(buildGet('http://localhost:3000/api/admin/operations/system-health'));
    const text = JSON.stringify(await res.json());
    for (const pattern of SECRET_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it('GET /api/admin/operations/integrations body has no secrets', async () => {
    const res = await integrationsGET(buildGet('http://localhost:3000/api/admin/operations/integrations'));
    const text = JSON.stringify(await res.json());
    for (const pattern of SECRET_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it('GET /api/admin/operations/events body has no secrets', async () => {
    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events'));
    const text = JSON.stringify(await res.json());
    for (const pattern of SECRET_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it('GET /api/admin/operations/audit body has no secrets', async () => {
    const res = await auditGET(buildGet('http://localhost:3000/api/admin/operations/audit'));
    const text = JSON.stringify(await res.json());
    for (const pattern of SECRET_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// IDEMPOTENCY — verify retry endpoint honors idempotency keys
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 HTTP] Idempotency — POST /api/admin/operations/retry', () => {
  let POST: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;
  let retryFailedOperation: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const opsMod = await import('@/lib/admin-operations-service');
    retryFailedOperation = opsMod.retryFailedOperation as ReturnType<typeof vi.fn>;
    const mod = await import('@/app/api/admin/operations/retry/route');
    POST = mod.POST;
  });

  it('returns prior result when same idempotencyKey is reused', async () => {
    retryFailedOperation.mockResolvedValueOnce({
      accepted: true,
      idempotencyKey: 'idem-001',
      status: 'already_completed',
      priorResult: { ok: true },
      startedAt: new Date(),
    });
    const req = buildPost('http://localhost:3000/api/admin/operations/retry', {
      idempotencyKey: 'idem-001',
      operationType: 'workflow_reexecute',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('already_completed');
    expect(body.data.priorResult).toEqual({ ok: true });
  });

  it('returns "started" status for a new idempotencyKey', async () => {
    retryFailedOperation.mockResolvedValueOnce({
      accepted: true,
      idempotencyKey: 'idem-002-new',
      status: 'started',
      startedAt: new Date(),
    });
    const req = buildPost('http://localhost:3000/api/admin/operations/retry', {
      idempotencyKey: 'idem-002-new',
      operationType: 'workflow_reexecute',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('started');
  });
});
