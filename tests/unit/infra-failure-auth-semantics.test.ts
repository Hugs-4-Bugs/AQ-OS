// ═══════════════════════════════════════════════════════════════════
// Infra-failure semantics (P4/P11): a database outage must NEVER be
// reported as logout/anonymous/Free. Route-level tests with the DB
// mocked to throw Prisma P2021 (the exact historical sandbox failure).
// ═══════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('@/lib/db', () => ({
  db: {
    userSession: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    loginHistory: { create: vi.fn(), count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    subscription: { findFirst: vi.fn() },
    $disconnect: vi.fn(),
  },
}));
vi.mock('@/lib/observability/metrics-collector', () => ({
  metricsCollector: { observeHistogram: vi.fn(), incrementCounter: vi.fn() },
}));
vi.mock('@/lib/observability/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/security/rate-limiter', () => ({
  withRateLimit: vi.fn().mockReturnValue(null),
  refundRateLimit: vi.fn(),
  authRateKeySuffix: (e: string) => (e ? ':em:x' : ''),
  RATE_LIMITERS: {
    refresh: { limit: 30, windowSeconds: 60 },
    otp: { limit: 5, windowSeconds: 60 },
    auth: { limit: 5, windowSeconds: 60 },
  },
}));
// Email imports are lazy inside routes; mock to be safe
vi.mock('@/lib/email', () => ({
  sendOtpLoginEmail: vi.fn(),
  sendMagicLinkEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  isEmailServiceConfigured: vi.fn().mockReturnValue(true),
}));

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

const prismaError = Object.assign(
  new Error('unable to open the database file'),
  { code: 'P2021' }
);

// The auth lib resolves JWT_SECRET at module load: JWT_SECRET env → AUTH_SECRET
// → NEXTAUTH_SECRET → dev fallback (allowed when NODE_ENV !== 'production').
const TEST_SECRET =
  process.env.JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
    ? (process.env.JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET)
    : 'acquisitionos-dev-secret-change-in-production';

function refreshRequest(refreshToken: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    headers: { cookie: `refresh_token=${refreshToken}` },
  });
}

const USER = {
  id: 'u-1',
  email: 'pfx-e2e-20260924@test.local',
  role: 'owner',
  plan: 'pro',
  orgId: null,
  isTrial: false,
  trialEndsAt: null,
  isActive: true,
  deletedAt: null,
  name: 'PFE2E Test',
  emailVerified: true,
  avatar: null,
  passwordHash: '$2b$12$abcdefghijklmnopqrstuvABCDEF0123456789ghij',
  mfaConfig: null,
  lastLoginAt: new Date(),
};

async function loadRefreshRoute() {
  const mod = await import('@/app/api/auth/refresh/route');
  return mod.POST;
}

describe('P4: refresh converts infrastructure failure to 503 (NOT logout)', () => {
  beforeAll(() => {
    // userSession.findFirst throwing = DB unavailable at session lookup
    (db.userSession.findFirst as ReturnType<typeof vi.fn>).mockRejectedValue(prismaError);
  });

  it('returns 503 code=INFRASTRUCTURE_ERROR when the DB dies at session lookup', async () => {
    const POST = await loadRefreshRoute();
    const token = jwt.sign(
      { sub: USER.id, email: USER.email, role: USER.role, plan: USER.plan, orgId: null, isTrial: false, trialEndsAt: null, type: 'refresh' },
      TEST_SECRET,
      { expiresIn: '30d', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
    );
    const res = await POST(refreshRequest(token));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('INFRASTRUCTURE_ERROR');
  });

  it('never returns 401 for a DB failure (401 = real logout signal)', async () => {
    const POST = await loadRefreshRoute();
    const token = jwt.sign(
      { sub: USER.id, type: 'refresh' },
      TEST_SECRET,
      { expiresIn: '30d', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
    );
    const res = await POST(refreshRequest(token));
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(503);
  });
});

describe('P11: /api/auth/me + /api/subscriptions/current on DB failure', () => {
  it('/me returns 503 (not 401) when getAuthUser hits a DB error', async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(prismaError);
    const { GET } = await import('@/app/api/auth/me/route');
    const req = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { cookie: 'access_token=valid-but-db-down' },
    });
    // access_token isn't a valid JWT → verifyToken returns null → no DB call
    // via that path. Force the DB-failure path by using a VALID token.
    const token = jwt.sign(
      { sub: USER.id, email: USER.email, role: USER.role, plan: USER.plan, orgId: null, isTrial: false, trialEndsAt: null, type: 'access' },
      TEST_SECRET,
      { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
    );
    const res = await GET(new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { cookie: `access_token=${token}` },
    }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('INFRASTRUCTURE_ERROR');
  });

  it('/api/subscriptions/current returns 503 when the subscription store is down', async () => {
    vi.resetModules();
    vi.doMock('@/lib/auth-middleware', () => ({
      withAuth: (_req: unknown, handler: (u: unknown) => Promise<Response>) =>
        handler({ id: 'u-1', email: 'x', role: 'owner', plan: 'pro', orgId: null, emailVerified: true, mfaEnabled: false, avatarUrl: null }),
    }));
    vi.doMock('@/lib/subscription-service', () => ({
      getSubscriptionStatus: vi.fn().mockResolvedValue({
        subscription: null,
        planDetails: { plan: 'free', creditsMonthly: 50, creditsRemaining: 0 },
        trialInfo: { isTrial: false, trialEndsAt: null, daysRemaining: 0 },
        unavailable: true,
      }),
    }));
    vi.doMock('@/lib/trial-service', () => ({ checkTrialStatus: vi.fn() }));
    vi.doMock('@/lib/credit-service', () => ({
      getCreditBalance: vi.fn().mockResolvedValue({ total: 0, monthly: 0, rollover: 0, addons: 0, plan: 'free' }),
    }));
    const { GET } = await import('@/app/api/subscriptions/current/route');
    const res = await GET(new NextRequest('http://localhost:3000/api/subscriptions/current'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SUBSCRIPTION_TEMPORARILY_UNAVAILABLE');
    // CRITICAL: the 503 body must NOT carry a usable free-plan payload
    expect(body.subscription).toBeUndefined();
    expect(body.planDetails).toBeUndefined();
  });
});
