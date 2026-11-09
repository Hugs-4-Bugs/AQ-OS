// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — OTP Auth Flow Tests
//
// Verifies the OTP request and verify endpoints at the route-handler
// level using a mocked db + mocked email service + mocked rate limiter.
// These tests are NOT runtime HTTP tests — they invoke the route
// handlers directly.
//
// Source of truth:
//   src/app/api/auth/otp/request/route.ts
//   src/app/api/auth/otp/verify/route.ts
//   src/lib/auth.ts (OTP_EXPIRY_SECONDS=600, OTP_MAX_ATTEMPTS=5,
//                    LOCKOUT_MINUTES=15, incrementOtpAttempts,
//                    isOtpLocked, resetOtpAttempts)
//   src/lib/security/rate-limit-policies.ts:
//     OTP_REQUEST_ACCOUNT_POLICY (3/600s, fail-closed)
//     OTP_REQUEST_IP_POLICY (5/600s, fail-closed)
//     OTP_VERIFY_ACCOUNT_POLICY (5/600s, not fail-closed)
//     COOLDOWNS.OTP_EMAIL = 60
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Hoisted mocks (must be declared before vi.mock calls) ─────────
const dbMocks = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const authMocks = vi.hoisted(() => ({
  validateEmail: vi.fn(),
  generateOTP: vi.fn(),
  logAuthEvent: vi.fn(),
  getClientIp: vi.fn(),
  getUserAgent: vi.fn(),
  OTP_EXPIRY_SECONDS: 600,
  classifyAuthErrorCategory: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  createSession: vi.fn(),
  isAccountLocked: vi.fn(),
  recordLoginAttemptByEmail: vi.fn(),
  recordLoginAttempt: vi.fn(),
  setAuthCookies: vi.fn(),
  secureCompare: vi.fn(),
  incrementOtpAttempts: vi.fn(),
  resetOtpAttempts: vi.fn(),
  isOtpLocked: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  sendOtpLoginEmail: vi.fn(),
  isEmailServiceConfigured: vi.fn(),
}));

const devAuthMocks = vi.hoisted(() => ({
  devOtpDelivery: vi.fn(),
}));

const rateLimitMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  storeUnavailableResponse: vi.fn(),
  getTrustedClientIP: vi.fn(),
  isCooldownActive: vi.fn(),
  recordRateLimitMetric: vi.fn(),
}));

// ─── Mock installations ────────────────────────────────────────────
vi.mock('@/lib/db', () => ({ db: { user: dbMocks.user } }));

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

vi.mock('@/lib/email', () => emailMocks);
vi.mock('@/lib/dev-auth', () => devAuthMocks);

vi.mock('@/lib/security/distributed-rate-limiter', () => rateLimitMocks);

vi.mock('@/lib/security/rate-limit-policies', () => ({
  OTP_REQUEST_ACCOUNT_POLICY: { maxRequests: 3, windowSeconds: 600, failClosed: true },
  OTP_REQUEST_IP_POLICY: { maxRequests: 5, windowSeconds: 600, failClosed: true },
  OTP_VERIFY_ACCOUNT_POLICY: { maxRequests: 5, windowSeconds: 600, failClosed: false },
  COOLDOWNS: { OTP_EMAIL: 60, PASSWORD_RESET_EMAIL: 60, MAGIC_LINK_EMAIL: 60, VERIFICATION_EMAIL: 60 },
}));

// ─── Import routes AFTER mocks ─────────────────────────────────────
import * as otpRequestRoute from '@/app/api/auth/otp/request/route';
import * as otpVerifyRoute from '@/app/api/auth/otp/verify/route';

// ─── Helpers ───────────────────────────────────────────────────────

function makePostRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const DEFAULT_USER = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'owner',
  plan: 'pro',
  orgId: null,
  emailVerified: true,
  isActive: true,
  passwordHash: '$2a$12$hashedpassword',
  loginOtp: null,
  loginOtpExpiry: null,
  otpAttemptCount: 0,
  otpLockedUntil: null,
  mfaConfig: null,
};

// ─── Tests ─────────────────────────────────────────────────────────

describe('OTP request flow — /api/auth/otp/request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults: rate limits pass, cooldown not active, email configured.
    rateLimitMocks.checkRateLimit.mockResolvedValue({
      allowed: true, limit: 5, remaining: 5, retryAfterSeconds: 0,
      resetAt: Date.now() + 600_000, category: 'otp_request', storeAvailable: true,
    });
    rateLimitMocks.isCooldownActive.mockResolvedValue(false);
    rateLimitMocks.getTrustedClientIP.mockReturnValue('127.0.0.1');
    authMocks.validateEmail.mockReturnValue(true);
    authMocks.generateOTP.mockReturnValue('123456');
    authMocks.getClientIp.mockReturnValue('127.0.0.1');
    authMocks.getUserAgent.mockReturnValue('test-agent');
    authMocks.logAuthEvent.mockResolvedValue(undefined);
    authMocks.classifyAuthErrorCategory.mockReturnValue('unknown');
    emailMocks.isEmailServiceConfigured.mockReturnValue(true);
    emailMocks.sendOtpLoginEmail.mockResolvedValue({
      sent: true, provider: 'smtp', messageId: 'msg-1', error: undefined,
    });
    devAuthMocks.devOtpDelivery.mockReturnValue(null);
    dbMocks.user.findUnique.mockResolvedValue({ ...DEFAULT_USER });
    dbMocks.user.update.mockResolvedValue({ ...DEFAULT_USER });
  });

  it('returns 200 and a non-enumerable success message for a valid existing user', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {
      email: 'test@example.com',
    });
    const res = await otpRequestRoute.POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain('If an account exists');
    // OTP value must NEVER be in the response body (anti-enumeration).
    expect(body.otp).toBeUndefined();
    expect(body.devDelivery).toBeUndefined();
  });

  it('returns the SAME 200 message for a non-existent email (anti-enumeration)', async () => {
    dbMocks.user.findUnique.mockResolvedValue(null);
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {
      email: 'nobody@example.com',
    });
    const res = await otpRequestRoute.POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain('If an account exists');
    // No DB write should have occurred (no user to update).
    expect(dbMocks.user.update).not.toHaveBeenCalled();
  });

  it('returns 400 when email is missing', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {});
    const res = await otpRequestRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Email is required');
  });

  it('returns 400 when email format is invalid', async () => {
    authMocks.validateEmail.mockReturnValue(false);
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {
      email: 'not-an-email',
    });
    const res = await otpRequestRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid email format');
  });

  it('returns 429 when the email cooldown is active (< 60s since last OTP)', async () => {
    rateLimitMocks.isCooldownActive.mockResolvedValue(true);
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {
      email: 'test@example.com',
    });
    const res = await otpRequestRoute.POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('An OTP was recently sent');
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('returns 429 when account rate limit exceeded (3/600s)', async () => {
    rateLimitMocks.checkRateLimit
      .mockResolvedValueOnce({ // IP check passes
        allowed: true, limit: 5, remaining: 4, retryAfterSeconds: 0,
        resetAt: Date.now() + 600_000, category: 'otp_request', storeAvailable: true,
      })
      .mockResolvedValueOnce({ // Account check fails
        allowed: false, limit: 3, remaining: 0, retryAfterSeconds: 600,
        resetAt: Date.now() + 600_000, category: 'otp_request', storeAvailable: true,
      });
    rateLimitMocks.rateLimitResponse.mockReturnValue(
      new Response(JSON.stringify({ error: 'Too many OTP requests for this account.' }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'Retry-After': '600' },
      }),
    );
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {
      email: 'test@example.com',
    });
    const res = await otpRequestRoute.POST(req);
    expect(res.status).toBe(429);
  });

  it('returns 503 when Redis is unavailable AND policy is fail-closed', async () => {
    rateLimitMocks.checkRateLimit.mockResolvedValue({
      allowed: false, limit: 3, remaining: 0, retryAfterSeconds: 600,
      resetAt: Date.now() + 600_000, category: 'otp_request',
      storeAvailable: false, // Redis down
    });
    rateLimitMocks.storeUnavailableResponse.mockReturnValue(
      new Response(JSON.stringify({
        error: 'Rate limit service temporarily unavailable.',
        code: 'RATE_LIMIT_STORE_UNAVAILABLE',
      }), { status: 503 }),
    );
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {
      email: 'test@example.com',
    });
    const res = await otpRequestRoute.POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMIT_STORE_UNAVAILABLE');
  });

  it('returns 503 EMAIL_NOT_CONFIGURED when email service is down', async () => {
    emailMocks.isEmailServiceConfigured.mockReturnValue(false);
    devAuthMocks.devOtpDelivery.mockReturnValue(null); // not in dev mode
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {
      email: 'test@example.com',
    });
    const res = await otpRequestRoute.POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('EMAIL_NOT_CONFIGURED');
  });

  it('returns 503 EMAIL_DELIVERY_FAILED when sendOtpLoginEmail fails', async () => {
    emailMocks.sendOtpLoginEmail.mockResolvedValue({
      sent: false, provider: 'smtp', messageId: null, error: 'SMTP timeout',
    });
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {
      email: 'test@example.com',
    });
    const res = await otpRequestRoute.POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('EMAIL_DELIVERY_FAILED');
  });

  it('writes OTP + expiry + reset attempt counters on successful request', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {
      email: 'test@example.com',
    });
    await otpRequestRoute.POST(req);
    expect(dbMocks.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          loginOtp: '123456',
          otpAttemptCount: 0,
          otpLockedUntil: null,
        }),
      }),
    );
  });

  it('returns 429 "Please wait before requesting a new OTP" when previous OTP is still fresh', async () => {
    // The route checks user.loginOtpExpiry and if (now < expiry - (EXPIRY - 60)*1000)
    // → i.e. the OTP has more than 60s of life left.
    const freshExpiry = new Date(Date.now() + 590 * 1000); // 9min50s from now
    dbMocks.user.findUnique.mockResolvedValue({
      ...DEFAULT_USER,
      loginOtpExpiry: freshExpiry,
    });
    const req = makePostRequest('http://localhost:3000/api/auth/otp/request', {
      email: 'test@example.com',
    });
    const res = await otpRequestRoute.POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Please wait before requesting a new OTP');
  });
});

describe('OTP verify flow — /api/auth/otp/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMocks.checkRateLimit.mockResolvedValue({
      allowed: true, limit: 5, remaining: 5, retryAfterSeconds: 0,
      resetAt: Date.now() + 600_000, category: 'otp_verify', storeAvailable: true,
    });
    rateLimitMocks.getTrustedClientIP.mockReturnValue('127.0.0.1');
    authMocks.validateEmail.mockReturnValue(true);
    authMocks.getClientIp.mockReturnValue('127.0.0.1');
    authMocks.getUserAgent.mockReturnValue('test-agent');
    authMocks.logAuthEvent.mockResolvedValue(undefined);
    authMocks.classifyAuthErrorCategory.mockReturnValue('unknown');
    authMocks.isAccountLocked.mockResolvedValue(false);
    authMocks.isOtpLocked.mockResolvedValue(false);
    authMocks.secureCompare.mockReturnValue(true);
    authMocks.incrementOtpAttempts.mockResolvedValue({ locked: false, attempts: 1 });
    authMocks.resetOtpAttempts.mockResolvedValue(undefined);
    authMocks.generateAccessToken.mockReturnValue('access-token-mock');
    authMocks.generateRefreshToken.mockReturnValue('refresh-token-mock');
    authMocks.createSession.mockResolvedValue(undefined);
    authMocks.recordLoginAttemptByEmail.mockResolvedValue(undefined);
    authMocks.recordLoginAttempt.mockResolvedValue(undefined);
    authMocks.setAuthCookies.mockImplementation((response: Response) => response);
    dbMocks.user.findUnique.mockResolvedValue({
      ...DEFAULT_USER,
      loginOtp: '123456',
      loginOtpExpiry: new Date(Date.now() + 300 * 1000), // 5 min from now
    });
    dbMocks.user.update.mockResolvedValue({ ...DEFAULT_USER });
  });

  it('returns 200 and signed-in user when OTP is correct', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
      otp: '123456',
    });
    const res = await otpVerifyRoute.POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain('Signed in successfully via OTP');
    expect(body.user.email).toBe('test@example.com');
    expect(body.user.mfaEnabled).toBe(false);
  });

  it('returns 400 when OTP is missing', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
    });
    const res = await otpVerifyRoute.POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when OTP is not a 6-digit string', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
      otp: '12345', // 5 digits
    });
    const res = await otpVerifyRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('6-digit');
  });

  it('returns 401 when OTP is incorrect', async () => {
    authMocks.secureCompare.mockReturnValue(false);
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
      otp: '999999',
    });
    const res = await otpVerifyRoute.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid email or OTP');
    expect(authMocks.incrementOtpAttempts).toHaveBeenCalledWith('user-1');
  });

  it('returns 423 when OTP attempts are exhausted (locked)', async () => {
    authMocks.secureCompare.mockReturnValue(false);
    authMocks.incrementOtpAttempts.mockResolvedValue({ locked: true, attempts: 5 });
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
      otp: '999999',
    });
    const res = await otpVerifyRoute.POST(req);
    expect(res.status).toBe(423);
    const body = await res.json();
    expect(body.error).toContain('Too many failed attempts');
  });

  it('returns 400 when OTP is correct but expired', async () => {
    dbMocks.user.findUnique.mockResolvedValue({
      ...DEFAULT_USER,
      loginOtp: '123456',
      loginOtpExpiry: new Date(Date.now() - 1000), // expired 1s ago
    });
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
      otp: '123456',
    });
    const res = await otpVerifyRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('OTP expired');
  });

  it('returns 423 when account is locked', async () => {
    authMocks.isAccountLocked.mockResolvedValue(true);
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
      otp: '123456',
    });
    const res = await otpVerifyRoute.POST(req);
    expect(res.status).toBe(423);
    const body = await res.json();
    expect(body.error).toContain('Account temporarily locked');
  });

  it('returns 423 when OTP path is locked', async () => {
    authMocks.isOtpLocked.mockResolvedValue(true);
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
      otp: '123456',
    });
    const res = await otpVerifyRoute.POST(req);
    expect(res.status).toBe(423);
    const body = await res.json();
    expect(body.error).toContain('Too many failed OTP attempts');
  });

  it('returns 401 with anti-enumeration message when email is unverified', async () => {
    dbMocks.user.findUnique.mockResolvedValue({
      ...DEFAULT_USER,
      emailVerified: false,
      loginOtp: '123456',
      loginOtpExpiry: new Date(Date.now() + 300 * 1000),
    });
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
      otp: '123456',
    });
    const res = await otpVerifyRoute.POST(req);
    // Anti-enumeration: same 401 message as wrong OTP
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid email or OTP');
  });

  it('returns 401 with anti-enumeration message when account is inactive', async () => {
    dbMocks.user.findUnique.mockResolvedValue({
      ...DEFAULT_USER,
      isActive: false,
      loginOtp: '123456',
      loginOtpExpiry: new Date(Date.now() + 300 * 1000),
    });
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
      otp: '123456',
    });
    const res = await otpVerifyRoute.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid email or OTP');
  });

  it('clears OTP fields on successful verification (prevents reuse)', async () => {
    const req = makePostRequest('http://localhost:3000/api/auth/otp/verify', {
      email: 'test@example.com',
      otp: '123456',
    });
    await otpVerifyRoute.POST(req);
    expect(dbMocks.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          loginOtp: null,
          loginOtpExpiry: null,
        }),
      }),
    );
    expect(authMocks.resetOtpAttempts).toHaveBeenCalledWith('user-1');
  });
});
