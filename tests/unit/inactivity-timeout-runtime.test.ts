// Runtime behavior tests for ISSUE-008 + ISSUE-007.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';

const mockState = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  sessions: new Map<string, unknown>(),
  userUpdateShouldThrow: false,
  createShouldThrow: false,
}));

vi.mock('@/lib/db', () => ({
  db: {
    userSession: {
      findFirst: vi.fn(async ({ where }: { where: { refreshToken?: string } }) => {
        const rt = where?.refreshToken; if (!rt) return null;
        return mockState.sessions.get(rt) ?? null;
      }),
      findUnique: vi.fn(async ({ where }: { where: { refreshToken?: string; id?: string } }) => {
        if (where?.refreshToken) return mockState.sessions.get(where.refreshToken) ?? null;
        if (where?.id) { for (const s of mockState.sessions.values()) { if ((s as { id?: string }).id === where.id) return s; } }
        return null;
      }),
      update: vi.fn(async () => { if (mockState.userUpdateShouldThrow) throw new Error('simulated DB write failure'); return {}; }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => { if (mockState.createShouldThrow) throw new Error('simulated create failure'); return {}; }),
    },
    user: { findUnique: vi.fn(async () => ({ id: 'u-admin', email: 'admin@test.local', name: 'Admin', role: 'super_admin', avatar: null, isActive: true, deletedAt: null, plan: 'pro', orgId: null, isTrial: false, trialEndsAt: null, emailVerified: true, mfaConfig: { isEnabled: true } })) },
    auditLog: { create: vi.fn() },
    loginHistory: { create: vi.fn(), count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    $disconnect: vi.fn(),
  },
}));
vi.mock('next/headers', () => ({ headers: () => new Headers(), cookies: async () => ({ get: (name: string) => { const v = mockState.cookies.get(name); return v !== undefined ? { value: v } : undefined; }, set: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/observability/metrics-collector', () => ({ metricsCollector: { observeHistogram: vi.fn(), incrementCounter: vi.fn() } }));
vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/security/distributed-rate-limiter', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100, resetAt: 0, limit: 100 }), rateLimitResponse: vi.fn(() => NextResponse.json({ error: 'rate limited' }, { status: 429 })), storeUnavailableResponse: vi.fn(() => NextResponse.json({ error: 'unavailable' }, { status: 503 })), getTrustedClientIP: () => '127.0.0.1', recordRateLimitMetric: vi.fn() }));

import { db } from '@/lib/db';
const TEST_SECRET = (process.env.JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) || 'acquisitionos-dev-secret-change-in-production';
function makeAccessToken(userId = 'u-admin', role = 'super_admin'): string { return jwt.sign({ sub: userId, email: 'admin@test.local', role, plan: 'pro', orgId: null, isTrial: false, trialEndsAt: null, type: 'access' }, TEST_SECRET, { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }); }
function makeRefreshToken(userId = 'u-admin'): string { return jwt.sign({ sub: userId, email: 'admin@test.local', role: 'super_admin', plan: 'pro', orgId: null, isTrial: false, trialEndsAt: null, type: 'refresh' }, TEST_SECRET, { expiresIn: '30d', issuer: 'acquisitionos', audience: 'acquisitionos-api' }); }
const ADMIN_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
function setCookies(access: string | null, refresh: string | null) { mockState.cookies.clear(); if (access) mockState.cookies.set('access_token', access); if (refresh) mockState.cookies.set('refresh_token', refresh); }
function makeSession(overrides: Partial<{ id: string; userId: string; refreshToken: string; rememberMe: boolean; lastActivityAt: Date | null; expiresAt: Date; absoluteExpiresAt: Date | null; isRevoked: boolean }> = {}) {
  const now = Date.now();
  return { id: 'sess-1', userId: 'u-admin', refreshToken: makeRefreshToken(), rememberMe: false, lastActivityAt: new Date(now - 60_000), expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000), absoluteExpiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000), isRevoked: false, createdAt: new Date(), ...overrides };
}
function seedSession(s: ReturnType<typeof makeSession>) { mockState.sessions.set(s.refreshToken, s); }
function lastCreateWithData(): { data: { lastActivityAt?: Date; expiresAt?: Date; absoluteExpiresAt?: Date | null; rememberMe?: boolean; isRevoked?: boolean } } | undefined {
  const calls = (db.userSession.create as unknown as { mock: { calls: unknown[] } }).mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) { const arg = calls[i] as [{ data?: { lastActivityAt?: Date } }]; if (arg[0]?.data?.lastActivityAt) return arg[0] as { data: { lastActivityAt?: Date; expiresAt?: Date; absoluteExpiresAt?: Date | null; rememberMe?: boolean; isRevoked?: boolean } }; }
  return undefined;
}
function countActivityWrites(): number {
  const calls = (db.userSession.update as unknown as { mock: { calls: unknown[] } }).mock.calls;
  return calls.filter((c) => { const arg = c as [{ data: { lastActivityAt?: Date; isRevoked?: boolean } }]; return arg[0]?.data?.lastActivityAt !== undefined; }).length;
}
beforeEach(() => { mockState.cookies.clear(); mockState.sessions.clear(); mockState.userUpdateShouldThrow = false; mockState.createShouldThrow = false; vi.clearAllMocks(); });

describe('ISSUE-008 runtime: createSession() timestamp preservation', () => {
  it('1. Fresh login initializes lastActivityAt to ~now', async () => { const { createSession } = await import('@/lib/auth'); const before = Date.now(); await createSession({ userId: 'u-1', refreshToken: 'rt-fresh-1' }); const after = Date.now(); const lc = lastCreateWithData(); expect(lc).toBeDefined(); const ts = lc!.data.lastActivityAt!.getTime(); expect(ts).toBeGreaterThanOrEqual(before); expect(ts).toBeLessThanOrEqual(after); });
  it('2. Fresh login retains default expiresAt + absoluteExpiresAt', async () => { const { createSession } = await import('@/lib/auth'); const before = Date.now(); await createSession({ userId: 'u-2', refreshToken: 'rt-fresh-2', rememberMe: true }); const lc = lastCreateWithData(); expect(lc).toBeDefined(); const td = 30 * 24 * 60 * 60 * 1000; expect(lc!.data.expiresAt!.getTime()).toBeGreaterThan(before + td - 60_000); expect(lc!.data.expiresAt!.getTime()).toBeLessThan(before + td + 60_000); expect(lc!.data.absoluteExpiresAt).toBeInstanceOf(Date); expect(lc!.data.rememberMe).toBe(true); expect(lc!.data.isRevoked).toBe(false); });
  it('3. Refresh rotation preserves lastActivityAt verbatim', async () => { const { createSession } = await import('@/lib/auth'); const old = new Date(Date.now() - 5 * 60 * 1000); await createSession({ userId: 'u-3', refreshToken: 'rt-rot-3', lastActivityAt: old }); const lc = lastCreateWithData(); expect(lc).toBeDefined(); expect(lc!.data.lastActivityAt!.getTime()).toBe(old.getTime()); });
  it('4. Refresh rotation preserves expiresAt verbatim', async () => { const { createSession } = await import('@/lib/auth'); const old = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); await createSession({ userId: 'u-4', refreshToken: 'rt-rot-4', expiresAt: old, lastActivityAt: new Date(Date.now() - 60_000) }); const lc = lastCreateWithData(); expect(lc).toBeDefined(); expect(lc!.data.expiresAt!.getTime()).toBe(old.getTime()); });
  it('5. Refresh rotation preserves absoluteExpiresAt (including null)', async () => { const { createSession } = await import('@/lib/auth'); const old = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); await createSession({ userId: 'u-5a', refreshToken: 'rt-5a', absoluteExpiresAt: old, lastActivityAt: new Date(Date.now() - 60_000) }); let lc = lastCreateWithData(); expect(lc).toBeDefined(); expect((lc!.data.absoluteExpiresAt as Date).getTime()).toBe(old.getTime()); await createSession({ userId: 'u-5b', refreshToken: 'rt-5b', absoluteExpiresAt: null, lastActivityAt: new Date(Date.now() - 60_000) }); lc = lastCreateWithData(); expect(lc).toBeDefined(); expect(lc!.data.absoluteExpiresAt).toBeNull(); });
  it('6. Refresh rotation preserves remember-me', async () => { const { createSession } = await import('@/lib/auth'); await createSession({ userId: 'u-6', refreshToken: 'rt-6', rememberMe: true, lastActivityAt: new Date(Date.now() - 60_000) }); const lc = lastCreateWithData(); expect(lc).toBeDefined(); expect(lc!.data.rememberMe).toBe(true); });
  it('18. Absolute expiry is not extended by refresh rotation', async () => { const { createSession } = await import('@/lib/auth'); const old = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); await createSession({ userId: 'u-18', refreshToken: 'rt-18', absoluteExpiresAt: old, lastActivityAt: new Date(Date.now() - 60_000) }); const lc = lastCreateWithData(); expect(lc).toBeDefined(); expect(lc!.data.absoluteExpiresAt!.getTime()).toBe(old.getTime()); expect(lc!.data.absoluteExpiresAt!.getTime()).toBeLessThan(Date.now() + 10 * 24 * 60 * 60 * 1000); });
});

describe('ISSUE-008 runtime: refresh route preserves timestamps end-to-end', () => {
  it('7. Background refresh cannot reset inactivity', async () => { const oldA = new Date(Date.now() - 8 * 60 * 1000); const oldE = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000); const oldAbs = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000); const rt = makeRefreshToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: oldA, expiresAt: oldE, absoluteExpiresAt: oldAbs, rememberMe: true })); setCookies(null, rt); const { POST } = await import('@/app/api/auth/refresh/route'); const req = new NextRequest('http://localhost:3001/api/auth/refresh', { method: 'POST', headers: { cookie: `refresh_token=${rt}` } }); const res = await POST(req); expect(res.status).toBe(200); const lc = lastCreateWithData(); expect(lc).toBeDefined(); expect(lc!.data.lastActivityAt!.getTime()).toBe(oldA.getTime()); expect(lc!.data.expiresAt!.getTime()).toBe(oldE.getTime()); expect(lc!.data.absoluteExpiresAt!.getTime()).toBe(oldAbs.getTime()); expect(lc!.data.rememberMe).toBe(true); });
});

describe('ISSUE-008 runtime: activity endpoint', () => {
  it('8. Genuine user activity updates the timestamp', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date(Date.now() - 5 * 60 * 1000) })); setCookies(at, rt); const { POST } = await import('@/app/api/auth/activity/route'); const req = new NextRequest('http://localhost:3001/api/auth/activity', { method: 'POST', headers: { cookie: `access_token=${at}; refresh_token=${rt}` } }); const res = await POST(req); expect(res.status).toBe(200); expect(countActivityWrites()).toBeGreaterThan(0); expect((await res.json()).persisted).toBe(true); });
  it('14. Activity DB write failure returns 500 ACTIVITY_PERSIST_FAILED', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date(Date.now() - 5 * 60 * 1000) })); setCookies(at, rt); mockState.userUpdateShouldThrow = true; const { POST } = await import('@/app/api/auth/activity/route'); const req = new NextRequest('http://localhost:3001/api/auth/activity', { method: 'POST', headers: { cookie: `access_token=${at}; refresh_token=${rt}` } }); const res = await POST(req); expect(res.status).toBe(500); expect((await res.json()).code).toBe('ACTIVITY_PERSIST_FAILED'); });
  it('15. Failed persistence never reports persisted: true', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date(Date.now() - 5 * 60 * 1000) })); setCookies(at, rt); mockState.userUpdateShouldThrow = true; const { POST } = await import('@/app/api/auth/activity/route'); const req = new NextRequest('http://localhost:3001/api/auth/activity', { method: 'POST', headers: { cookie: `access_token=${at}; refresh_token=${rt}` } }); const res = await POST(req); const body = await res.json(); expect(body.persisted).not.toBe(true); expect(body.persisted).toBeUndefined(); });
});

describe('ISSUE-008 runtime: admin guard read-only', () => {
  it('9. Admin guard reads do not update lastActivityAt', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date(Date.now() - 2 * 60 * 1000) })); setCookies(at, rt); const { getSuperAdminSession } = await import('@/lib/admin-guard'); const result = await getSuperAdminSession(); expect(result).not.toBeNull(); expect(result?.id).toBe('u-admin'); expect(countActivityWrites()).toBe(0); });
});

describe('ISSUE-008 runtime: session-status read-only', () => {
  it('10. Session-status polling does not update lastActivityAt', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date(Date.now() - 60_000) })); setCookies(at, rt); const { GET } = await import('@/app/api/auth/session-status/route'); const req = new NextRequest('http://localhost:3001/api/auth/session-status', { headers: { cookie: `access_token=${at}; refresh_token=${rt}` } }); const res = await GET(req); expect(res.status).toBe(200); expect(countActivityWrites()).toBe(0); });
});

describe('ISSUE-008 runtime: fail-closed + expiration (admin guard)', () => {
  it('11. Missing activity timestamp fails closed', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: null })); setCookies(at, rt); const { getSuperAdminSession } = await import('@/lib/admin-guard'); expect(await getSuperAdminSession()).toBeNull(); });
  it('12. Invalid/non-finite activity timestamp fails closed', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date('not-a-valid-date') })); setCookies(at, rt); const { getSuperAdminSession } = await import('@/lib/admin-guard'); expect(await getSuperAdminSession()).toBeNull(); });
  it('13. Future activity timestamp beyond clock skew fails closed', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date(Date.now() + 60_000) })); setCookies(at, rt); const { getSuperAdminSession } = await import('@/lib/admin-guard'); expect(await getSuperAdminSession()).toBeNull(); });
  it('16. Inactivity expiration works at the defined threshold', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date(Date.now() - (ADMIN_INACTIVITY_TIMEOUT_MS + 60_000)) })); setCookies(at, rt); const { getSuperAdminSession } = await import('@/lib/admin-guard'); expect(await getSuperAdminSession()).toBeNull(); });
});

describe('ISSUE-008 runtime: fail-closed + expiration (activity endpoint)', () => {
  it('11b. Missing activity timestamp fails closed (activity route)', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: null })); setCookies(at, rt); const { POST } = await import('@/app/api/auth/activity/route'); const req = new NextRequest('http://localhost:3001/api/auth/activity', { method: 'POST', headers: { cookie: `access_token=${at}; refresh_token=${rt}` } }); const res = await POST(req); expect(res.status).toBe(401); expect((await res.json()).code).toBe('SESSION_INVALID_NO_ACTIVITY'); });
  it('12b. Invalid/non-finite activity timestamp fails closed (activity route)', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date('invalid') })); setCookies(at, rt); const { POST } = await import('@/app/api/auth/activity/route'); const req = new NextRequest('http://localhost:3001/api/auth/activity', { method: 'POST', headers: { cookie: `access_token=${at}; refresh_token=${rt}` } }); const res = await POST(req); expect(res.status).toBe(401); expect((await res.json()).code).toBe('SESSION_INVALID_NO_ACTIVITY'); });
  it('13b. Future activity timestamp beyond clock skew fails closed (activity route)', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date(Date.now() + 60_000) })); setCookies(at, rt); const { POST } = await import('@/app/api/auth/activity/route'); const req = new NextRequest('http://localhost:3001/api/auth/activity', { method: 'POST', headers: { cookie: `access_token=${at}; refresh_token=${rt}` } }); const res = await POST(req); expect(res.status).toBe(401); expect((await res.json()).code).toBe('SESSION_INVALID_NO_ACTIVITY'); });
  it('17. Expired sessions cannot be revived by stale activity requests', async () => { const rt = makeRefreshToken(); const at = makeAccessToken(); seedSession(makeSession({ refreshToken: rt, lastActivityAt: new Date(Date.now() - (ADMIN_INACTIVITY_TIMEOUT_MS + 60_000)) })); setCookies(at, rt); const { POST } = await import('@/app/api/auth/activity/route'); const req = new NextRequest('http://localhost:3001/api/auth/activity', { method: 'POST', headers: { cookie: `access_token=${at}; refresh_token=${rt}` } }); const res = await POST(req); expect(res.status).toBe(401); expect((await res.json()).code).toBe('SESSION_EXPIRED_INACTIVITY'); const calls = (db.userSession.update as unknown as { mock: { calls: unknown[] } }).mock.calls; expect(calls.filter((c) => { const arg = c as [{ data: { isRevoked?: boolean } }]; return arg[0]?.data?.isRevoked === true; }).length).toBeGreaterThan(0); });
});

describe('ISSUE-007 runtime: AgentsTab lazy import resolves and renders', () => {
  it('19. dynamic import resolves to a valid default React component', async () => { const mod = await import('@/components/dashboard/agents-tab'); expect(mod.default).toBeDefined(); expect(typeof mod.default).toBe('function'); expect(mod.default.name).toBe('AgentsTab'); });
  it('19b. React.lazy wrapper resolves', async () => { const React = await import('react'); const AgentsTab = React.lazy(async () => { const m = await import('@/components/dashboard/agents-tab'); if (!m.default || typeof m.default !== 'function') throw new Error('invalid'); return m as unknown as { default: React.ComponentType<unknown> }; }); expect(AgentsTab).toBeDefined(); expect((AgentsTab as unknown as { $$typeof: symbol }).$$typeof).toBeDefined(); });
});
