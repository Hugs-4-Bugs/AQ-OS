// ═══════════════════════════════════════════════════════════════════
// API Integration Tests: Auth Routes
// Tests signup, signin, OTP request, auth config endpoints
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock dependencies for auth routes ──────────────────────────

vi.mock('@/lib/db', () => {
  return {
    db: {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      userSession: {
        create: vi.fn(),
        deleteMany: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      loginHistory: {
        create: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      mfaConfig: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      subscription: {
        create: vi.fn(),
      },
    },
  };
});

// Use importOriginal to preserve all exports from @/lib/auth
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getAuthUser: vi.fn().mockResolvedValue(null),
    generateAccessToken: vi.fn().mockReturnValue('mock-access-token'),
    generateRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
    hashPassword: vi.fn().mockResolvedValue('$2a$12$hashedpassword'),
    verifyPassword: vi.fn().mockResolvedValue(false),
    validatePasswordStrength: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    validateEmail: vi.fn().mockReturnValue(true),
    generateOTP: vi.fn().mockReturnValue('123456'),
    secureCompare: vi.fn().mockReturnValue(false),
    createSession: vi.fn().mockResolvedValue(undefined),
    logAuthEvent: vi.fn().mockResolvedValue(undefined),
    setAuthCookies: vi.fn().mockReturnValue({}),
    clearAuthCookies: vi.fn().mockReturnValue({}),
    isAccountLocked: vi.fn().mockResolvedValue(false),
    recordLoginAttemptByEmail: vi.fn().mockResolvedValue('user-id'),
    recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
    isIpRateLimited: vi.fn().mockReturnValue(false),
    extractBearerToken: vi.fn().mockReturnValue(null),
  };
});

vi.mock('@/lib/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ sent: true, messageId: 'test-msg-id' }),
  sendOtpLoginEmail: vi.fn().mockResolvedValue({ sent: true, messageId: 'test-otp-id' }),
  sendSecurityAlertEmail: vi.fn().mockResolvedValue({ sent: true }),
  isEmailServiceConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn().mockResolvedValue(undefined),
  logBillingEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/observability/api-logger', () => ({
  withApiLogging: (handler: (request: NextRequest) => Promise<Response>) => handler,
  logApiRequest: vi.fn(),
  logApiResponse: vi.fn(),
}));

vi.mock('@/lib/observability/metrics-collector', () => ({
  metricsCollector: {
    observeHistogram: vi.fn(),
    incrementCounter: vi.fn(),
    setGauge: vi.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, validatePasswordStrength } from '@/lib/auth';

// Mock rate limiter (used by signup and signin routes)
vi.mock('@/lib/security/rate-limiter', () => ({
  withRateLimit: vi.fn().mockReturnValue(null),
  // P9 (Sep 2026): auth routes now key per-flow buckets by IP+email
  authRateKeySuffix: vi.fn().mockReturnValue(''),
  refundRateLimit: vi.fn(),
  RATE_LIMITERS: {
    auth: { limit: 5, windowSeconds: 60 },
    signin: { limit: 10, windowSeconds: 60 },
    otp: { limit: 5, windowSeconds: 60 },
    otp_verify: { limit: 10, windowSeconds: 60 },
    magic_link: { limit: 5, windowSeconds: 60 },
    refresh: { limit: 30, windowSeconds: 60 },
  },
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 5, remaining: 4, resetAt: Math.floor(Date.now() / 1000) + 60 }),
}));

// ── Auth Config Tests ──────────────────────────────────────────

describe('GET /api/auth/config', () => {
  let GET: () => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/auth/config/route');
    GET = mod.GET;
  });

  it('should return correct structure with all fields', async () => {
    // P7 FIX (Sep 2026): /api/auth/config was refactored to expose only
    // SAFE runtime-presence booleans — the old smtpConfigured/smtpStatus/
    // emailServiceAvailable/devMode fields (which leaked SMTP details and
    // a hardcoded googleAvailable=true) were removed. The new contract:
    //   { googleAvailable, googleConfigured, emailConfigured }
    const response = await GET();
    const body = await response.json();

    expect(body).toHaveProperty('googleAvailable');
    expect(body).toHaveProperty('googleConfigured');
    expect(body).toHaveProperty('emailConfigured');
    // Removed fields — must NOT appear in the response (verifies the
    // security-driven contract change, not just absence of assertion).
    expect(body).not.toHaveProperty('smtpConfigured');
    expect(body).not.toHaveProperty('smtpStatus');
    expect(body).not.toHaveProperty('emailServiceAvailable');
    expect(body).not.toHaveProperty('devMode');
  });

  it('should return googleAvailable as boolean', async () => {
    const response = await GET();
    const body = await response.json();

    expect(typeof body.googleAvailable).toBe('boolean');
  });

  it('should return emailConfigured as boolean (renamed from smtpConfigured)', async () => {
    // P7 FIX (Sep 2026): smtpConfigured was renamed to emailConfigured to
    // cover both SMTP and Resend providers (not just SMTP).
    const response = await GET();
    const body = await response.json();

    expect(typeof body.emailConfigured).toBe('boolean');
  });

  it('should not expose any secrets or sensitive smtp details in response', async () => {
    // P7 FIX (Sep 2026): the smtpStatus object was removed entirely — the
    // route now exposes ONLY safe booleans, never any smtp details. Verify
    // the response body contains no passwords, hosts, users, or tokens.
    const response = await GET();
    const body = await response.json();

    const bodyStr = JSON.stringify(body);
    // No password-like strings should appear anywhere in the response.
    expect(bodyStr).not.toMatch(/(password|passwd|secret|token|apiKey)/i);
    // No smtpStatus object (removed by P7 fix).
    expect(body.smtpStatus).toBeUndefined();
  });

  it('should not return devMode field (removed for security)', async () => {
    // Security hardening: the devMode flag was removed from /api/auth/config
    // because it leaked the runtime NODE_ENV state to anonymous callers.
    // The route now exposes only capability booleans, never environment state.
    const response = await GET();
    const body = await response.json();

    expect(body.devMode).toBeUndefined();
  });
});

// ── Auth Signup Tests ──────────────────────────────────────────

describe('POST /api/auth/signup', () => {
  let POST: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/auth/signup/route');
    POST = mod.POST;
  });

  it('should create user with correct defaults (plan=free, credits=50)', async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.user.create as ReturnType<typeof vi.fn>).mockImplementation((args: { data: Record<string, unknown> }) => ({
      id: 'new-user-id',
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    (db.subscription.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'sub-1' });

    const request = new NextRequest('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'newuser@test.com',
        password: 'TestPass123!',
        name: 'New User',
      }),
    });

    const response = await POST(request);

    expect(db.user.create).toHaveBeenCalled();
    const createCall = (db.user.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.plan).toBe('free');
    expect(createCall.data.credits).toBe(50);
    expect(createCall.data.creditsMonthly).toBe(50);
    expect(createCall.data.role).toBe('owner');
    expect(createCall.data.authProvider).toBe('email');
  });

  it('should reject duplicate email registration', async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'existing-user',
      email: 'existing@test.com',
    });

    const request = new NextRequest('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'existing@test.com',
        password: 'TestPass123!',
        name: 'Existing User',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('should reject weak passwords', async () => {
    (validatePasswordStrength as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      errors: ['Password must be at least 8 characters'],
    });

    const request = new NextRequest('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'newuser@test.com',
        password: 'weak',
        name: 'New User',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

// ── Auth Signin Tests ──────────────────────────────────────────

describe('POST /api/auth/signin', () => {
  let POST: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/auth/signin/route');
    POST = mod.POST;
  });

  it('should return 401 for wrong password', async () => {
    // FIX: the test mock previously used the OLD `password` field name; the
    // Prisma User schema uses `passwordHash`. Without `passwordHash`, the
    // production signin route treats the account as an OAuth-only account
    // (no password set) and returns 409 (Conflict) with `noPasswordSet: true`
    // — a deliberate UX path that points the user to OTP/Magic Link. Using
    // the correct `passwordHash` field name lets the route reach the actual
    // password verification step, where `verifyPassword` returns false and
    // the route correctly returns 401.
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test',
      passwordHash: '$2a$12$hashedpassword',
      role: 'owner',
      plan: 'free',
      orgId: null,
      emailVerified: true,
      isActive: true,
      mfaEnabled: false,
      lockedUntil: null,
      mfaConfig: null,
    });
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const request = new NextRequest('http://localhost:3000/api/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'test@test.com',
        password: 'WrongPassword123!',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});

// ── OTP Request Rate Limiting Tests ────────────────────────────

describe('POST /api/auth/otp/request', () => {
  let POST: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/auth/otp/request/route');
    POST = mod.POST;
  });

  it('should reject non-existent email gracefully (no enumeration)', async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/auth/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@test.com',
      }),
    });

    // Should still return success to prevent email enumeration
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
