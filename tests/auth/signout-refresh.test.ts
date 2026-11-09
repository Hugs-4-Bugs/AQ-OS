// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Signout + Session Refresh Tests
//
// Verifies the signout endpoint (single-device + all-devices) and the
// refresh endpoint's session-state handling.
//
// Source of truth:
//   src/app/api/auth/signout/route.ts
//   src/app/api/auth/refresh/route.ts
//   src/lib/auth.ts: getSessionState, revokeSession, revokeAllUserSessions
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Hoisted mocks ─────────────────────────────────────────────────
const authMocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllUserSessions: vi.fn(),
  clearAuthCookies: vi.fn(),
  logAuthEvent: vi.fn(),
  getClientIp: vi.fn(),
  getUserAgent: vi.fn(),
  verifyToken: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  createSession: vi.fn(),
  getSessionState: vi.fn(),
  setAuthCookies: vi.fn(),
  classifyAuthErrorCategory: vi.fn(),
}));

const rateLimitMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  storeUnavailableResponse: vi.fn(),
  getTrustedClientIP: vi.fn(),
  recordRateLimitMetric: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
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

vi.mock('@/lib/db', () => ({ db: { user: dbMocks.user } }));

vi.mock('@/lib/security/distributed-rate-limiter', () => rateLimitMocks);

vi.mock('@/lib/security/rate-limit-policies', () => ({
  LOGIN_ATTEMPT_IP_POLICY: { maxRequests: 10, windowSeconds: 300, failClosed: false },
}));

// ─── Import routes AFTER mocks ─────────────────────────────────────
import * as signoutRoute from '@/app/api/auth/signout/route';
import * as refreshRoute from '@/app/api/auth/refresh/route';

// ─── Helpers ───────────────────────────────────────────────────────

function makePostRequest(url: string, body?: Record<string, unknown>): NextRequest {
  const req = new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}',
  });
  // Default: set a refresh_token cookie so signout can revoke it.
  // Tests that need NO refresh_token should clear it explicitly.
  req.cookies.set('refresh_token', 'old-refresh-token');
  return req;
}

const AUTH_USER = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test',
  role: 'owner',
  plan: 'pro',
  orgId: null,
  emailVerified: true,
  mfaEnabled: false,
  avatarUrl: null,
  authProvider: 'email',
};

// ─── Signout tests ─────────────────────────────────────────────────

describe('POST /api/auth/signout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getAuthUser.mockResolvedValue(AUTH_USER);
    authMocks.revokeSession.mockResolvedValue(undefined);
    authMocks.revokeAllUserSessions.mockResolvedValue(undefined);
    authMocks.clearAuthCookies.mockImplementation((r: Response) => r);
    authMocks.logAuthEvent.mockResolvedValue(undefined);
    authMocks.getClientIp.mockReturnValue('127.0.0.1');
    authMocks.getUserAgent.mockReturnValue('test-agent');
    authMocks.verifyToken.mockReturnValue({
      sub: 'user-1',
      type: 'refresh',
    });
  });

  it('revokes the single session when called without ?allDevices=true', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/signout');
    const res = await signoutRoute.POST(req);
    expect(res.status).toBe(200);
    expect(authMocks.revokeSession).toHaveBeenCalledOnce();
    expect(authMocks.revokeAllUserSessions).not.toHaveBeenCalled();
    expect(authMocks.clearAuthCookies).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body.message).toContain('Signed out successfully');
  });

  it('revokes ALL sessions when called with ?allDevices=true', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/signout?allDevices=true');
    const res = await signoutRoute.POST(req);
    expect(res.status).toBe(200);
    expect(authMocks.revokeAllUserSessions).toHaveBeenCalledWith('user-1');
    expect(authMocks.revokeSession).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.message).toContain('all devices');
  });

  it('still succeeds (200) and clears cookies even when there is no auth user', async () => {
    authMocks.getAuthUser.mockResolvedValue(null);
    const req = makePostRequest('http://localhost:3000/api/auth/signout');
    const res = await signoutRoute.POST(req);
    expect(res.status).toBe(200);
    expect(authMocks.clearAuthCookies).toHaveBeenCalledOnce();
    expect(authMocks.logAuthEvent).not.toHaveBeenCalled();
  });

  it('still succeeds (200) and clears cookies when revokeSession throws', async () => {
    authMocks.revokeSession.mockRejectedValue(new Error('DB down'));
    const req = makePostRequest('http://localhost:3000/api/auth/signout');
    const res = await signoutRoute.POST(req);
    expect(res.status).toBe(200);
    expect(authMocks.clearAuthCookies).toHaveBeenCalledOnce();
  });

  it('writes an audit log entry on successful signout', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/signout');
    await signoutRoute.POST(req);
    expect(authMocks.logAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'signout',
      }),
    );
  });

  it('writes a different audit message for allDevices signout', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/signout?allDevices=true');
    await signoutRoute.POST(req);
    expect(authMocks.logAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'signout',
        details: expect.stringContaining('all devices'),
      }),
    );
  });
});

// ─── Refresh tests ─────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMocks.checkRateLimit.mockResolvedValue({
      allowed: true, limit: 10, remaining: 10, retryAfterSeconds: 0,
      resetAt: Date.now() + 300_000, category: 'refresh', storeAvailable: true,
    });
    rateLimitMocks.getTrustedClientIP.mockReturnValue('127.0.0.1');
    rateLimitMocks.recordRateLimitMetric.mockReturnValue(undefined);
    authMocks.verifyToken.mockReturnValue({
      sub: 'user-1',
      type: 'refresh',
    });
    authMocks.getSessionState.mockResolvedValue({
      state: 'valid',
      session: {
        id: 'sess-1',
        userId: 'user-1',
        rememberMe: false,
        lastActivityAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 3600_000),
        absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
      },
    });
    authMocks.revokeSession.mockResolvedValue(undefined);
    authMocks.generateAccessToken.mockReturnValue('new-access-token');
    authMocks.generateRefreshToken.mockReturnValue('new-refresh-token');
    authMocks.createSession.mockResolvedValue(undefined);
    authMocks.setAuthCookies.mockImplementation((r: Response) => r);
    authMocks.logAuthEvent.mockResolvedValue(undefined);
    authMocks.getClientIp.mockReturnValue('127.0.0.1');
    authMocks.getUserAgent.mockReturnValue('test-agent');
    authMocks.classifyAuthErrorCategory.mockReturnValue('unknown');
    dbMocks.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      role: 'owner',
      plan: 'pro',
      orgId: null,
      isActive: true,
      deletedAt: null,
      mfaConfig: { isEnabled: false },
    });
  });

  it('rotates tokens and returns 200 when session is valid', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    // refresh reads refresh_token from cookie
    req.cookies.set('refresh_token', 'old-refresh-token');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe('OK');
    expect(body.user.email).toBe('test@example.com');
    expect(authMocks.revokeSession).toHaveBeenCalledWith('old-refresh-token');
    expect(authMocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: 'new-refresh-token',
        lastActivityAt: expect.any(Date), // inherited from prev session
      }),
    );
  });

  it('returns 401 NO_TOKEN when refresh_token cookie is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    // Explicitly NO refresh_token cookie set.
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('NO_TOKEN');
  });

  it('returns 401 INVALID_TOKEN when JWT verification fails', async () => {
    authMocks.verifyToken.mockReturnValue(null);
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'invalid-token');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('INVALID_TOKEN');
  });

  it('returns 401 INVALID_TOKEN when token type is not "refresh"', async () => {
    authMocks.verifyToken.mockReturnValue({
      sub: 'user-1',
      type: 'access', // wrong type
    });
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'access-token-misused');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('INVALID_TOKEN');
  });

  it('returns 401 SESSION_EXPIRED when session state is "expired"', async () => {
    authMocks.getSessionState.mockResolvedValue({ state: 'expired', session: null });
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'old-refresh-token');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('SESSION_EXPIRED');
  });

  it('returns 401 SESSION_REVOKED when session state is "revoked"', async () => {
    authMocks.getSessionState.mockResolvedValue({ state: 'revoked', session: null });
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'old-refresh-token');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('SESSION_REVOKED');
  });

  it('returns 401 SESSION_IDLE_EXPIRED when session state is "idle_expired"', async () => {
    authMocks.getSessionState.mockResolvedValue({ state: 'idle_expired', session: null });
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'old-refresh-token');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('SESSION_IDLE_EXPIRED');
  });

  it('returns 503 INFRASTRUCTURE_ERROR when getSessionState throws (not 401)', async () => {
    // Critical: a database outage must NOT log the user out.
    authMocks.getSessionState.mockRejectedValue(new Error('DB connection failed'));
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'old-refresh-token');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('INFRASTRUCTURE_ERROR');
    expect(body.error).toContain('session is preserved');
  });

  it('returns 503 INFRASTRUCTURE_ERROR when user lookup throws (not 401)', async () => {
    authMocks.getSessionState.mockResolvedValue({
      state: 'valid',
      session: {
        id: 'sess-1', userId: 'user-1', rememberMe: false,
        lastActivityAt: new Date(), expiresAt: new Date(Date.now() + 3600_000),
        absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
      },
    });
    dbMocks.user.findUnique.mockRejectedValue(new Error('DB down'));
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'old-refresh-token');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('INFRASTRUCTURE_ERROR');
  });

  it('returns 401 USER_UNAVAILABLE when user is not found', async () => {
    dbMocks.user.findUnique.mockResolvedValue(null);
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'old-refresh-token');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('USER_UNAVAILABLE');
  });

  it('returns 401 USER_UNAVAILABLE when user is deactivated', async () => {
    dbMocks.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: false,
      deletedAt: null,
      mfaConfig: { isEnabled: false },
    });
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'old-refresh-token');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('USER_UNAVAILABLE');
  });

  it('preserves lastActivityAt from the previous session (does NOT reset inactivity window)', async () => {
    // ISSUE-008 fix: token rotation must NOT extend the inactivity window.
    const prevLastActivity = new Date(Date.now() - 120_000); // 2 min ago
    authMocks.getSessionState.mockResolvedValue({
      state: 'valid',
      session: {
        id: 'sess-1', userId: 'user-1', rememberMe: false,
        lastActivityAt: prevLastActivity,
        expiresAt: new Date(Date.now() + 3600_000),
        absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
      },
    });
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'old-refresh-token');
    await refreshRoute.POST(req);
    expect(authMocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        lastActivityAt: prevLastActivity, // inherited, NOT new Date()
      }),
    );
  });

  it('returns 429 when refresh IP rate limit is exceeded', async () => {
    rateLimitMocks.checkRateLimit.mockResolvedValue({
      allowed: false, limit: 10, remaining: 0, retryAfterSeconds: 300,
      resetAt: Date.now() + 300_000, category: 'refresh', storeAvailable: true,
    });
    rateLimitMocks.rateLimitResponse.mockReturnValue(
      new Response(JSON.stringify({ error: 'Too many refresh requests.' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const req = makePostRequest('http://localhost:3000/api/auth/refresh');
    req.cookies.set('refresh_token', 'old-refresh-token');
    const res = await refreshRoute.POST(req);
    expect(res.status).toBe(429);
  });
});
