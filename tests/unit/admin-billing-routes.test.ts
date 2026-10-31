// ═══════════════════════════════════════════════════════════════════
// GENUINE ROUTE-LEVEL HTTP TESTS
//
// These tests invoke the REAL route handlers (GET/POST) imported from
// the actual Next.js route modules, using REAL NextRequest objects,
// REAL @/lib/auth-middleware (withPermission), and the REAL @/lib/rbac
// permission registry. Only @/lib/auth (getAuthUser) and the DB/service
// layer are mocked — the auth→permission→HTTP-status pipeline is real.
//
// Every test asserts an actual HTTP status code (200 / 403 / 401 / 400 /
// 404 / 500 / 503) returned by the route handler.
//
// Routes under test:
//   GET  /api/admin/billing                  → billing:read
//   GET  /api/admin/billing/webhooks         → billing:read
//   GET  /api/admin/billing/failed-payments  → billing:read
//   POST /api/admin/refund                   → billing.refund (super_admin ONLY)
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocked auth module — controllable getAuthUser ─────────────────────
// Real @/lib/rbac is NOT mocked. Real @/lib/auth-middleware is NOT mocked.
// The full pipeline request → getAuthUser → hasPermission → 401/403/handler
// is exercised end-to-end.
type MockedAuthModule = typeof import('@/lib/auth') & {
  __mockGetAuthUser: ReturnType<typeof vi.fn>;
};

vi.mock('@/lib/auth', () => {
  const mockGetAuthUser = vi.fn().mockResolvedValue(null);
  return {
    getAuthUser: mockGetAuthUser,
    __mockGetAuthUser: mockGetAuthUser,
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

// Mock requireConfirmation — enforces confirmation on refund
vi.mock('@/lib/security/require-confirmation', () => ({
  requireConfirmation: vi.fn().mockResolvedValue({
    valid: true,
    confirmationId: 'mock-confirmation-id',
    requestId: 'mock-request-id',
  }),
}));

// ── Mock admin-billing-service (handler body stubs) ───────────────────
vi.mock('@/lib/admin-billing-service', () => ({
  getBillingOverview: vi.fn().mockResolvedValue({
    totalActive: 0,
    byPlan: [],
    revenue: { currentMonth: 0, lastMonth: 0, percentChange: 0 },
    failedPayments: 0,
    pastDue: 0,
    trials: 0,
    churnRate: 0,
  }),
  getWebhookMonitoring: vi.fn().mockResolvedValue({
    webhooks: [],
    total: 0,
    processedCount: 0,
    failedCount: 0,
    pendingCount: 0,
    avgProcessingTime: null,
  }),
  getFailedPaymentLogs: vi.fn().mockResolvedValue({ payments: [], total: 0 }),
  getInvoiceTracking: vi.fn().mockResolvedValue({ invoices: [], total: 0 }),
  getSubscriptionMetrics: vi.fn().mockResolvedValue({
    newSubscriptions: [],
    churned: [],
    upgrades: 0,
    downgrades: 0,
    distribution: [],
  }),
  getRevenueByPeriod: vi.fn().mockResolvedValue({
    periods: [],
    total: 0,
    byPlan: [],
    byCurrency: [],
    gstTotal: 0,
    refundsTotal: 0,
  }),
  getSubscriptionList: vi.fn().mockResolvedValue({ subscriptions: [], total: 0 }),
  getPaymentList: vi.fn().mockResolvedValue({ payments: [], total: 0 }),
  getRefundHistory: vi.fn().mockResolvedValue({ refunds: [], total: 0 }),
  getCreditsOverview: vi.fn().mockResolvedValue({ totalBalance: 0, recentEntries: [], total: 0 }),
  getAIUsageOverview: vi.fn().mockResolvedValue({ totals: { invocations: 0, tokens: 0 }, byProvider: [], byModel: [], recent: [], total: 0 }),
  getBillingEvents: vi.fn().mockResolvedValue({ events: [], total: 0 }),
  getProviderStatus: vi.fn().mockResolvedValue({ providers: [], webhookHealth: 'UNKNOWN' }),
}));

// ── Mock @/lib/db (used by direct-route handlers) ─────────────────────
vi.mock('@/lib/db', () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const groupBy = vi.fn().mockResolvedValue([]);
  const findFirst = vi.fn().mockResolvedValue(null);
  const findUnique = vi.fn().mockResolvedValue(null);
  const update = vi.fn().mockResolvedValue({});
  const create = vi.fn().mockResolvedValue({});
  return {
    db: {
      paymentOrder: { findMany, count, groupBy, findFirst, findUnique, update },
      subscription: { findMany, count, groupBy, findFirst, findUnique, update },
      paymentWebhook: { findMany, count, findUnique, update },
      invoice: { findUnique, update, findMany, count },
      user: { findUnique, update, findMany, count },
      creditsLedger: { create, findMany, count, aggregate: vi.fn().mockResolvedValue({ _sum: { credits: 0 } }), groupBy },
      modelInvocation: { count, aggregate: vi.fn().mockResolvedValue({ _sum: { tokensUsed: 0 } }), groupBy, findMany },
      auditLog: { findMany, count },
      notification: { create },
    },
  };
});

// ── Mock stripe (used by /api/admin/refund) ───────────────────────────
// Use a class-based mock so `new Stripe(key)` correctly returns an instance
// with the refunds.create method (vi.fn().mockImplementation has subtle
// behavior with `new` — a class mock is unambiguous).
vi.mock('stripe', () => {
  const RefundsCreate = vi.fn().mockResolvedValue({
    id: 're_test_12345',
    amount: 5000,
    currency: 'usd',
    status: 'succeeded',
  });
  class StripeMock {
    refunds = { create: RefundsCreate };
    constructor(_apiKey: string) {}
  }
  return { default: StripeMock };
});

// ── Mock billing audit + email + entitlement service ─────────────────
vi.mock('@/lib/billing-audit', () => ({
  logPaymentEvent: vi.fn().mockResolvedValue(undefined),
  logBillingEvent: vi.fn().mockResolvedValue(undefined),
  logCreditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/payment-failure-utils', () => ({
  sendRefundNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/entitlement-service', () => ({
  PLAN_CREDITS: { free: 50, starter: 150, pro: 750, elite: 2000 },
}));

// ── Test users (one per role) ─────────────────────────────────────────
const TEST_USERS: Record<string, { id: string; email: string; role: string; plan: string }> = {
  super_admin: { id: 'su-1', email: 'su@test.local', role: 'super_admin', plan: 'elite' },
  admin:       { id: 'ad-1', email: 'ad@test.local', role: 'admin',       plan: 'pro'   },
  support:     { id: 'sp-1', email: 'sp@test.local', role: 'support',     plan: 'free'  },
  analytics:   { id: 'an-1', email: 'an@test.local', role: 'analytics',   plan: 'free'  },
  member:      { id: 'me-1', email: 'me@test.local', role: 'member',      plan: 'free'  },
  viewer:      { id: 'vi-1', email: 'vi@test.local', role: 'viewer',      plan: 'free'  },
};

// ── Helpers ───────────────────────────────────────────────────────────
function buildGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function buildPost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/billing  (action dispatch — billing:read required)
// ═══════════════════════════════════════════════════════════════════
describe('GET /api/admin/billing', () => {
  let GET: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/billing/route');
    GET = mod.GET;
  });

  // Role × expected status matrix (billing:read granted to super_admin, admin, analytics)
  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     403],
    ['analytics',   200],
    ['member',      403],
    ['viewer',      403],
  ];

  // Test every action the route dispatches to — verify each gets the SAME RBAC gate.
  const ACTIONS = ['overview', 'webhooks', 'failed-payments', 'invoices', 'metrics'];

  for (const action of ACTIONS) {
    describe(`?action=${action}`, () => {
      for (const [role, expectedStatus] of CASES) {
        it(`role=${role} → ${expectedStatus}`, async () => {
          authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
          const req = buildGet(`http://localhost:3000/api/admin/billing?action=${action}`);
          const res = await GET(req);
          expect(res.status).toBe(expectedStatus);
        });
      }
    });
  }

  // Revenue requires startDate/endDate — for allowed roles, missing params → 400 (still proves route ran)
  describe('?action=revenue (missing dates)', () => {
    it('super_admin → 400 (handler reached, validation kicked in)', async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
      const req = buildGet('http://localhost:3000/api/admin/billing?action=revenue');
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
    it('viewer → 403 (RBAC gate fires before validation)', async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.viewer);
      const req = buildGet('http://localhost:3000/api/admin/billing?action=revenue');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });
  });

  // Unknown action — allowed role gets 400 from default switch case
  it('?action=nonexistent → 400 for super_admin (default branch)', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildGet('http://localhost:3000/api/admin/billing?action=nonexistent');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  // Unauthenticated
  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const req = buildGet('http://localhost:3000/api/admin/billing?action=overview');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/billing/webhooks  (billing:read required)
// ═══════════════════════════════════════════════════════════════════
describe('GET /api/admin/billing/webhooks', () => {
  let GET: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/billing/webhooks/route');
    GET = mod.GET;
  });

  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     403],
    ['analytics',   200],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const req = buildGet('http://localhost:3000/api/admin/billing/webhooks');
      const res = await GET(req);
      expect(res.status).toBe(expectedStatus);
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const req = buildGet('http://localhost:3000/api/admin/billing/webhooks');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  // Verify the handler actually returns JSON with the expected shape on success
  it('super_admin response body contains webhooks array + stats', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildGet('http://localhost:3000/api/admin/billing/webhooks');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('webhooks');
    expect(body).toHaveProperty('stats');
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/billing/failed-payments  (billing:read required)
// ═══════════════════════════════════════════════════════════════════
describe('GET /api/admin/billing/failed-payments', () => {
  let GET: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/billing/failed-payments/route');
    GET = mod.GET;
  });

  const CASES: Array<[string, number]> = [
    ['super_admin', 200],
    ['admin',       200],
    ['support',     403],
    ['analytics',   200],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const req = buildGet('http://localhost:3000/api/admin/billing/failed-payments');
      const res = await GET(req);
      expect(res.status).toBe(expectedStatus);
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const req = buildGet('http://localhost:3000/api/admin/billing/failed-payments');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('super_admin response body contains failedOrders + total', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildGet('http://localhost:3000/api/admin/billing/failed-payments');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('failedOrders');
    expect(body).toHaveProperty('total');
  });
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/refund  (billing.refund — super_admin ONLY)
// ═══════════════════════════════════════════════════════════════════
describe('POST /api/admin/refund', () => {
  let POST: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;
  const VALID_BODY = {
    userId: 'user-123',
    paymentIntentId: 'pi_test_123',
    amount: 5000,
    reason: 'Customer complaint — duplicate charge',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/refund/route');
    POST = mod.POST;
  });

  // Role × expected status matrix (billing.refund granted to super_admin ONLY)
  const CASES: Array<[string, number]> = [
    ['super_admin', 200], // allowed — handler runs, stubbed stripe returns success
    ['admin',       403], // billing.refund NOT granted to admin
    ['support',     403],
    ['analytics',   403],
    ['member',      403],
    ['viewer',      403],
  ];

  for (const [role, expectedStatus] of CASES) {
    it(`role=${role} → ${expectedStatus}`, async () => {
      // For super_admin, the handler will try to look up the user + payment order
      // AND will check process.env.STRIPE_SECRET_KEY before issuing the refund.
      // Set the env var + stub DB lookups so the refund path returns 200.
      let prevStripeKey: string | undefined;
      if (role === 'super_admin') {
        prevStripeKey = process.env.STRIPE_SECRET_KEY;
        process.env.STRIPE_SECRET_KEY = 'sk_test_phase31_http_route_test_key';
        const db = (await import('@/lib/db')).db;
        (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'user-123', email: 'cust@test.local', name: 'Customer',
        });
        (db.paymentOrder.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'po-1',
          userId: 'user-123',
          amount: 50,
          currency: 'USD',
          plan: 'pro',
          status: 'completed',
          provider: 'stripe',
          providerPaymentId: 'pi_test_123',
        });
        (db.paymentOrder.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
        (db.invoice.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (db.subscription.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (db.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
        (db.creditsLedger.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
        (db.notification.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      }
      try {
        authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
        const req = buildPost('http://localhost:3000/api/admin/refund', VALID_BODY);
        const res = await POST(req);
        expect(res.status).toBe(expectedStatus);
      } finally {
        if (prevStripeKey === undefined) {
          delete process.env.STRIPE_SECRET_KEY;
        } else {
          process.env.STRIPE_SECRET_KEY = prevStripeKey;
        }
      }
    });
  }

  it('unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const req = buildPost('http://localhost:3000/api/admin/refund', VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // Validation: super_admin but missing userId → 400
  it('super_admin with missing userId → 400', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildPost('http://localhost:3000/api/admin/refund', {
      paymentIntentId: 'pi_test',
      reason: 'test',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Validation: super_admin but user not found → 404
  it('super_admin, valid body, user not found → 404', async () => {
    const db = (await import('@/lib/db')).db;
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildPost('http://localhost:3000/api/admin/refund', VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  // Idempotency: already-refunded order → 409
  it('super_admin, order already refunded → 409', async () => {
    const db = (await import('@/lib/db')).db;
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-123', email: 'cust@test.local', name: 'Customer',
    });
    (db.paymentOrder.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'po-1',
      userId: 'user-123',
      amount: 50,
      currency: 'USD',
      plan: 'pro',
      status: 'refunded', // already refunded
      provider: 'stripe',
      providerPaymentId: 'pi_test_123',
    });
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const req = buildPost('http://localhost:3000/api/admin/refund', VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  // Refund path with no Stripe key configured → 503
  it('super_admin, Stripe not configured → 503', async () => {
    const db = (await import('@/lib/db')).db;
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-123', email: 'cust@test.local', name: 'Customer',
    });
    (db.paymentOrder.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'po-1',
      userId: 'user-123',
      amount: 50,
      currency: 'USD',
      plan: 'pro',
      status: 'completed',
      provider: 'stripe',
      providerPaymentId: 'pi_test_123',
    });
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const prev = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const req = buildPost('http://localhost:3000/api/admin/refund', VALID_BODY);
      const res = await POST(req);
      expect(res.status).toBe(503);
    } finally {
      if (prev) process.env.STRIPE_SECRET_KEY = prev;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECRET PROTECTION — verify route responses never contain secrets
// (these are still real HTTP route invocations)
// ═══════════════════════════════════════════════════════════════════
describe('Secret protection in route responses', () => {
  let billingGET: (request: NextRequest) => Promise<Response>;
  let webhooksGET: (request: NextRequest) => Promise<Response>;
  let failedGET: (request: NextRequest) => Promise<Response>;
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    billingGET = (await import('@/app/api/admin/billing/route')).GET;
    webhooksGET = (await import('@/app/api/admin/billing/webhooks/route')).GET;
    failedGET = (await import('@/app/api/admin/billing/failed-payments/route')).GET;
  });

  const SECRET_PATTERNS = [
    /STRIPE_SECRET_KEY/i,
    /sk_live_[a-z0-9]+/i,
    /sk_test_[a-z0-9]+/i,
    /RAZORPAY_KEY_SECRET/i,
    /rzp_live_[a-z0-9]+/i,
    /WEBHOOK_SIGNING_SECRET/i,
    /whsec_[a-z0-9]+/i,
    /signingSecret/i,
    /rawPayload/i,
  ];

  it('GET /api/admin/billing?action=overview body has no secrets', async () => {
    const res = await billingGET(buildGet('http://localhost:3000/api/admin/billing?action=overview'));
    const text = JSON.stringify(await res.json());
    for (const pattern of SECRET_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it('GET /api/admin/billing/webhooks body has no secrets', async () => {
    const res = await webhooksGET(buildGet('http://localhost:3000/api/admin/billing/webhooks'));
    const text = JSON.stringify(await res.json());
    for (const pattern of SECRET_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it('GET /api/admin/billing/failed-payments body has no secrets', async () => {
    const res = await failedGET(buildGet('http://localhost:3000/api/admin/billing/failed-payments'));
    const text = JSON.stringify(await res.json());
    for (const pattern of SECRET_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });
});
