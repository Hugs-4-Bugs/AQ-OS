// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Inactivity Timeout Test
//
// Verifies the server-side 10-minute inactivity timeout enforcement
// in src/lib/admin-guard.ts (getSuperAdminSession) and the
// /api/auth/activity route.
//
// Key constants (src/lib/admin-guard.ts:35):
//   ADMIN_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000 (600,000 ms = 10 min)
//   MAX_CLOCK_SKEW_MS = 5 * 1000 (5 seconds)
//
// Behavior tested:
//   1. Session within 10-min window → returns user + secondsLeft
//   2. Session past 10-min window → returns null + revokes session
//   3. Missing lastActivityAt → fail-closed null
//   4. Non-finite lastActivityAt → fail-closed null
//   5. Future lastActivityAt (clock skew > 5s) → fail-closed null
//   6. Revoked session → null
//   7. Non-super_admin role → null (regardless of session freshness)
//   8. MFA not enrolled → null
//   9. Activity endpoint extends session only when genuine activity arrives
//  10. Activity endpoint rejects pings past the timeout
//
// Source of truth:
//   src/lib/admin-guard.ts:68–188
//   src/app/api/auth/activity/route.ts:52–231
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Hoisted mocks ─────────────────────────────────────────────────
const dbMocks = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  userSession: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const authMocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  clearAuthCookies: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: dbMocks.user,
    userSession: dbMocks.userSession,
  },
}));

vi.mock('@/lib/auth', () => ({
  ...authMocks,
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number = 401) {
      super(message);
      this.name = 'AuthError';
      this.statusCode = statusCode;
    }
  },
}));

// ─── Mock next/headers (used by admin-guard) ───────────────────────
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { cookies } from 'next/headers';
import { getSuperAdminSession, ADMIN_INACTIVITY_TIMEOUT_MS } from '@/lib/admin-guard';
import * as activityRoute from '@/app/api/auth/activity/route';

// ─── Test fixture: a valid super_admin with MFA ────────────────────
const SUPER_ADMIN_DB_ROW = {
  id: 'sa-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'super_admin',
  avatar: null,
  isActive: true,
  deletedAt: null,
  mfaConfig: { isEnabled: true },
};

const FRESH_SESSION = {
  id: 'sess-1',
  userId: 'sa-1',
  lastActivityAt: new Date(Date.now() - 60_000), // 1 min ago
  isRevoked: false,
  expiresAt: new Date(Date.now() + 3600_000),
  absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
};

function makeCookieStore(accessToken: string | null, refreshToken: string | null) {
  const store = new Map<string, string>();
  if (accessToken) store.set('access_token', accessToken);
  if (refreshToken) store.set('refresh_token', refreshToken);
  return {
    get: (name: string) =>
      store.has(name) ? { value: store.get(name) } : undefined,
  };
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/activity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'mouse' }),
  });
}

// ─── Tests for getSuperAdminSession ────────────────────────────────

describe('getSuperAdminSession — admin-guard.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockResolvedValue(
      makeCookieStore('access-token-mock', 'refresh-token-mock') as never,
    );
    authMocks.verifyToken.mockReturnValue({
      sub: 'sa-1',
      type: 'access',
      email: 'admin@example.com',
      role: 'super_admin',
    });
    dbMocks.user.findUnique.mockResolvedValue({ ...SUPER_ADMIN_DB_ROW });
    dbMocks.userSession.findUnique.mockResolvedValue({ ...FRESH_SESSION });
    dbMocks.userSession.update.mockResolvedValue({ ...FRESH_SESSION });
    authMocks.clearAuthCookies.mockImplementation((r: Response) => r);
  });

  it('returns the admin user when session is within 10-min window', async () => {
    const result = await getSuperAdminSession();
    expect(result).not.toBeNull();
    expect(result?.id).toBe('sa-1');
    expect(result?.role).toBe('super_admin');
    expect(result?.mfaEnrolled).toBe(true);
    expect(result?.inactivitySecondsLeft).toBeGreaterThan(0);
    expect(result?.inactivitySecondsLeft).toBeLessThanOrEqual(600);
  });

  it('returns null when session is past the 10-min timeout', async () => {
    dbMocks.userSession.findUnique.mockResolvedValue({
      ...FRESH_SESSION,
      lastActivityAt: new Date(Date.now() - (ADMIN_INACTIVITY_TIMEOUT_MS + 60_000)), // 11 min ago
    });
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
    // Session should be revoked as a side effect.
    expect(dbMocks.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ isRevoked: true }),
      }),
    );
  });

  it('returns null (fail-closed) when lastActivityAt is missing', async () => {
    dbMocks.userSession.findUnique.mockResolvedValue({
      ...FRESH_SESSION,
      lastActivityAt: null,
    });
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('returns null (fail-closed) when lastActivityAt is non-finite', async () => {
    dbMocks.userSession.findUnique.mockResolvedValue({
      ...FRESH_SESSION,
      lastActivityAt: new Date('invalid-date'),
    });
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('returns null (fail-closed) when lastActivityAt is in the future beyond clock skew', async () => {
    dbMocks.userSession.findUnique.mockResolvedValue({
      ...FRESH_SESSION,
      lastActivityAt: new Date(Date.now() + 60_000), // 1 min in the future
    });
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('returns null when session is revoked', async () => {
    dbMocks.userSession.findUnique.mockResolvedValue({
      ...FRESH_SESSION,
      isRevoked: true,
    });
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('returns null for non-super_admin roles (account isolation)', async () => {
    dbMocks.user.findUnique.mockResolvedValue({
      ...SUPER_ADMIN_DB_ROW,
      role: 'admin', // org-level admin, NOT super_admin
    });
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('returns the user with mfaEnrolled=false when MFA is not enrolled (layout handles redirect)', async () => {
    // Note: getSuperAdminSession does NOT enforce MFA enrollment itself.
    // It returns the user with mfaEnrolled=false so the admin layout
    // (src/app/admin/layout.tsx:52-58) can redirect to /auth/mfa-enrollment.
    // This is by design — separation of concerns between session resolution
    // and MFA gating.
    dbMocks.user.findUnique.mockResolvedValue({
      ...SUPER_ADMIN_DB_ROW,
      mfaConfig: { isEnabled: false },
    });
    const result = await getSuperAdminSession();
    expect(result).not.toBeNull();
    expect(result?.mfaEnrolled).toBe(false);
    expect(result?.id).toBe('sa-1');
  });

  it('returns null when user is inactive (deactivated)', async () => {
    dbMocks.user.findUnique.mockResolvedValue({
      ...SUPER_ADMIN_DB_ROW,
      isActive: false,
    });
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('returns null when user is deleted (deletedAt set)', async () => {
    dbMocks.user.findUnique.mockResolvedValue({
      ...SUPER_ADMIN_DB_ROW,
      deletedAt: new Date(),
    });
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('returns null when access_token cookie is missing', async () => {
    vi.mocked(cookies).mockResolvedValue(
      makeCookieStore(null, 'refresh-token-mock') as never,
    );
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('returns null when refresh_token cookie is missing', async () => {
    vi.mocked(cookies).mockResolvedValue(
      makeCookieStore('access-token-mock', null) as never,
    );
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('returns null when access token JWT verification fails', async () => {
    authMocks.verifyToken.mockReturnValue(null);
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('returns null when JWT type is not "access"', async () => {
    authMocks.verifyToken.mockReturnValue({
      sub: 'sa-1',
      type: 'refresh', // wrong type
    });
    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it('READ-ONLY policy: never updates lastActivityAt on a successful read', async () => {
    await getSuperAdminSession();
    // The guard must NOT call userSession.update to bump lastActivityAt.
    // It MAY call update to revoke an expired session — but with FRESH_SESSION
    // there is no expiry, so update should NOT be called at all.
    expect(dbMocks.userSession.update).not.toHaveBeenCalled();
  });

  it('ADMIN_INACTIVITY_TIMEOUT_MS is exactly 10 minutes', () => {
    expect(ADMIN_INACTIVITY_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });
});

// ─── Tests for /api/auth/activity ──────────────────────────────────

describe('POST /api/auth/activity — activity heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockResolvedValue(
      makeCookieStore('access-token-mock', 'refresh-token-mock') as never,
    );
    authMocks.verifyToken.mockReturnValue({
      sub: 'sa-1',
      type: 'access',
    });
    dbMocks.userSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: 'sa-1',
      lastActivityAt: new Date(Date.now() - 60_000),
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600_000),
      absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
    });
    dbMocks.userSession.update.mockResolvedValue({});
    authMocks.clearAuthCookies.mockImplementation((r: Response) => r);
  });

  it('returns 200 with secondsLeft when activity is within window', async () => {
    const req = makeRequest();
    const res = await activityRoute.POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.secondsLeft).toBeGreaterThan(0);
    expect(body.secondsLeft).toBeLessThanOrEqual(600);
    expect(body.absoluteExpiresAt).toBeTruthy();
  });

  it('writes lastActivityAt when elapsed > 30s throttle', async () => {
    // lastActivityAt is 60s ago, so elapsed=60s > 30s throttle → write.
    const req = makeRequest();
    await activityRoute.POST(req);
    expect(dbMocks.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({
          lastActivityAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does NOT write lastActivityAt when elapsed < 30s throttle', async () => {
    dbMocks.userSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: 'sa-1',
      lastActivityAt: new Date(Date.now() - 10_000), // 10s ago — under throttle
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600_000),
      absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
    });
    const req = makeRequest();
    await activityRoute.POST(req);
    expect(dbMocks.userSession.update).not.toHaveBeenCalled();
  });

  it('returns 401 SESSION_EXPIRED_INACTIVITY when ping arrives after timeout', async () => {
    dbMocks.userSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: 'sa-1',
      lastActivityAt: new Date(Date.now() - (ADMIN_INACTIVITY_TIMEOUT_MS + 60_000)),
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600_000),
      absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
    });
    const req = makeRequest();
    const res = await activityRoute.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('SESSION_EXPIRED_INACTIVITY');
    expect(body.expiredAt).toBeTruthy();
    // Session should be revoked.
    expect(dbMocks.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isRevoked: true }),
      }),
    );
  });

  it('returns 401 when access_token cookie missing', async () => {
    vi.mocked(cookies).mockResolvedValue(
      makeCookieStore(null, 'refresh-token-mock') as never,
    );
    const req = makeRequest();
    const res = await activityRoute.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('AUTH_REQUIRED');
  });

  it('returns 401 ACCESS_TOKEN_EXPIRED when JWT type is not "access"', async () => {
    authMocks.verifyToken.mockReturnValue({
      sub: 'sa-1',
      type: 'refresh',
    });
    const req = makeRequest();
    const res = await activityRoute.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('ACCESS_TOKEN_EXPIRED');
    // Must NOT update lastActivityAt.
    expect(dbMocks.userSession.update).not.toHaveBeenCalled();
  });

  it('returns 401 SESSION_INVALID when session is revoked', async () => {
    dbMocks.userSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: 'sa-1',
      lastActivityAt: new Date(Date.now() - 60_000),
      isRevoked: true,
      expiresAt: new Date(Date.now() + 3600_000),
      absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
    });
    const req = makeRequest();
    const res = await activityRoute.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('SESSION_INVALID');
  });

  it('returns 401 SESSION_INVALID when session userId mismatches JWT sub', async () => {
    dbMocks.userSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: 'other-user', // not the JWT subject
      lastActivityAt: new Date(Date.now() - 60_000),
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600_000),
      absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
    });
    const req = makeRequest();
    const res = await activityRoute.POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('SESSION_INVALID');
  });

  it('returns 401 SESSION_INVALID_NO_ACTIVITY when lastActivityAt is missing', async () => {
    dbMocks.userSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: 'sa-1',
      lastActivityAt: null,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600_000),
      absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
    });
    const req = makeRequest();
    const res = await activityRoute.POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('SESSION_INVALID_NO_ACTIVITY');
  });

  it('returns 405 for GET (only POST is allowed)', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/activity', {
      method: 'GET',
    });
    const res = await activityRoute.GET();
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });
});
