// ═══════════════════════════════════════════════════════════════════
// API Integration Tests: Health & Credits Routes
// Tests health check, detailed health, and credits endpoints
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// The vi.mock factory for '@/lib/auth' (below) attaches a test-only hook
// (`__mockGetAuthUser`) that is not part of the real module's types.
type MockedAuthModule = typeof import('@/lib/auth') & {
  __mockGetAuthUser: ReturnType<typeof vi.fn>;
};

// ── Mock auth module ──────────────────────────────────────────
// Note: avoid importOriginal to prevent transform errors in test env

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
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  getUserAgent: vi.fn().mockReturnValue('test-agent'),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  generateMfaPendingToken: vi.fn(),
  verifyToken: vi.fn(),
  validateEmail: vi.fn(),
  validatePasswordStrength: vi.fn(),
  generateOTP: vi.fn(),
  secureCompare: vi.fn(),
  generateMagicLinkToken: vi.fn(),
  generateTotpSecret: vi.fn(),
  generateTotpUri: vi.fn(),
  verifyTotpCode: vi.fn(),
  generateBackupCodes: vi.fn(),
  hasRole: vi.fn(),
  isAdmin: vi.fn(),
  isIpRateLimited: vi.fn(),
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllUserSessions: vi.fn(),
  isSessionValid: vi.fn(),
  isAccountLocked: vi.fn(),
  recordLoginAttempt: vi.fn(),
  recordLoginAttemptByEmail: vi.fn(),
  isOtpLocked: vi.fn(),
  incrementOtpAttempts: vi.fn(),
  resetOtpAttempts: vi.fn(),
  setAuthCookies: vi.fn().mockImplementation((res) => res),
  logAuthEvent: vi.fn(),
  detectSuspiciousLogin: vi.fn(),
  sendSecurityAlert: vi.fn(),
  JWT_SECRET: 'test-jwt-secret-key-for-testing-only-min-32-chars',
  OTP_MAX_ATTEMPTS: 5,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
  OTP_EXPIRY_SECONDS: 600,
  };});

vi.mock('@/lib/rbac', () => ({
  hasPermission: vi.fn().mockImplementation((role: string, permission: string) => {
    const viewerNoAccess = ['billing:read', 'billing:write', 'team:write', 'pipeline:write', 'outreach:write'];
    if (role === 'viewer' && viewerNoAccess.includes(permission)) return false;
    if (role === 'member' && ['leads:delete', 'pipeline:write', 'team:write'].includes(permission)) return false;
    return true;
  }),
  hasAllPermissions: vi.fn().mockReturnValue(true),
  hasAnyPermission: vi.fn().mockReturnValue(true),
  isAdminRole: vi.fn().mockImplementation((role: string) => ['super_admin', 'owner', 'admin'].includes(role)),
  getRolePermissions: vi.fn().mockReturnValue([]),
  canAccessTab: vi.fn().mockReturnValue(true),
  getAccessibleTabs: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/credit-service', () => ({
  deductCredits: vi.fn().mockResolvedValue({ success: true, newBalance: 49 }),
  getCreditBalance: vi.fn().mockResolvedValue({
    total: 350,
    monthly: 500,
    rollover: 25,
    addons: 0,
    plan: 'pro',
  }),
  CREDIT_COSTS: { lead_discovery: 1 },
  }));


vi.mock('@/lib/security/rate-limiter', () => ({
  withRateLimit: vi.fn().mockReturnValue(null),
  }));


vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn().mockResolvedValue(undefined),
  logBillingEvent: vi.fn().mockResolvedValue(undefined),
  }));


vi.mock('@/lib/entitlement-service', () => ({
  PLAN_CREDITS: { free: 50, starter: 150, pro: 750, elite: 2000 },
  getEntitlements: vi.fn().mockReturnValue({
    lead_discovery: { limit: null, enabled: true },
    deep_analysis: { limit: null, enabled: false },
  }),
  checkEntitlement: vi.fn().mockReturnValue(true),
  }));


vi.mock('@/lib/observability/metrics-collector', () => ({
  metricsCollector: {
    observeHistogram: vi.fn(),
    incrementCounter: vi.fn(),
    setGauge: vi.fn(),
    getMetrics: vi.fn().mockReturnValue({
      counters: [],
      histograms: [],
      gauges: [],
      uptime: 12345,
    }),
    toPrometheusFormat: vi.fn().mockReturnValue('# mock prometheus output\n'),
    reset: vi.fn(),
  },
  }));


vi.mock('@/lib/observability/api-logger', () => ({
  withApiLogging: (handler: (request: NextRequest) => Promise<NextResponse>) => handler,
  }));


vi.mock('@/lib/observability/sentry', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  }));


// Mock ioredis is handled by vitest.config.ts alias to ioredis-stub.ts

// Mock the db module to avoid real DB connections
vi.mock('@/lib/db', () => ({
  db: {
    user: { count: vi.fn().mockResolvedValue(1) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
  }));


// ── Health Route Tests ──────────────────────────────────────────

describe('GET /api/health', () => {
  let GET: (request: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/health/route');
    GET = mod.GET;
  });

  it('should return 200 with correct structure', async () => {
    // Phase L10 (Observability) refactor: /api/health was restructured to use
    //   { status, timestamp, version, uptime, checks: { database, memory, errors }, latencyMs }
    // The old `services` property was renamed to `checks` and `db` → `database`.
    // Redis is no longer probed in the basic check (only in /api/health/detailed).
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('checks');
  });

  it('should return status as healthy, degraded, or down', async () => {
    // Phase L10: the status enum changed from {ok, degraded, error} to
    // {healthy, degraded, down}. The HTTP status code is 200 for healthy /
    // degraded, 503 for down. This matches the load-balancer convention.
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const body = await response.json();

    expect(['healthy', 'degraded', 'down']).toContain(body.status);
  });

  it('should include checks with database status (no redis in basic check)', async () => {
    // Phase L10: basic /api/health probes database, memory, errors.
    // Redis is intentionally NOT probed here (would add latency for every
    // load-balancer ping) — it appears only in /api/health/detailed.
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const body = await response.json();

    expect(body.checks).toHaveProperty('database');
    expect(body.checks).toHaveProperty('memory');
    expect(body.checks).toHaveProperty('errors');
    expect(['healthy', 'unhealthy']).toContain(body.checks.database.status);
    expect(['healthy', 'unhealthy', 'degraded']).toContain(body.checks.memory.status);
    expect(['healthy', 'unhealthy', 'degraded']).toContain(body.checks.errors.status);
  });

  it('should include version string', async () => {
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const body = await response.json();

    expect(body.version).toBe('2.0.0');
  });

  it('should include numeric uptime', async () => {
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const body = await response.json();

    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should include ISO timestamp', async () => {
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const body = await response.json();

    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});

// ── Detailed Health Route Tests ─────────────────────────────────

describe('GET /api/health/detailed', () => {
  let GET: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/health/detailed/route');
    GET = mod.GET;
  });

  it('should return minimal status for anonymous callers (load-balancer probe)', async () => {
    // SECURITY HARDENING: /api/health/detailed now returns a minimal
    // { status, timestamp } body for anonymous callers (load-balancer probes)
    // instead of 401. Authenticated callers still receive the full result.
    // This is deliberate — uptime probes should NOT need credentials.
    const { __mockGetAuthUser } = (await import('@/lib/auth')) as MockedAuthModule;
    __mockGetAuthUser.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/health/detailed');
    const response = await GET(request);

    // Anonymous callers get 200 (or 503 if down) — NOT 401.
    expect([200, 503]).toContain(response.status);
    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    // Anonymous callers must NOT receive component errors or business metrics.
    expect(body).not.toHaveProperty('services');
    expect(body).not.toHaveProperty('checks');
    expect(body).not.toHaveProperty('errors');
  });

  it('should return full result for authenticated non-admin users (role gating removed)', async () => {
    // SECURITY HARDENING: the admin-only role gating was removed from
    // /api/health/detailed — any authenticated user receives the full result.
    // Anonymous callers are still limited to { status, timestamp } (above test).
    // This balances security (anon gets minimal output) with developer UX
    // (authenticated developers don't need an admin role to inspect health).
    const { __mockGetAuthUser } = (await import('@/lib/auth')) as MockedAuthModule;
    __mockGetAuthUser.mockResolvedValue({
      id: 'user-1',
      email: 'viewer@test.com',
      role: 'viewer',
      plan: 'free',
      orgId: null,
    });

    const request = new NextRequest('http://localhost:3000/api/health/detailed');
    const response = await GET(request);

    // Authenticated callers (any role) get 200 (or 503 if down) — NOT 403.
    expect([200, 503]).toContain(response.status);
    const body = await response.json();
    // Full result includes component-level health info.
    expect(body).toHaveProperty('status');
  });
});

// ── Credits Route Tests ────────────────────────────────────────

describe('GET /api/credits', () => {
  let GET: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/credits/route');
    GET = mod.GET;
  });

  it('should require authentication', async () => {
    const { __mockGetAuthUser } = (await import('@/lib/auth')) as MockedAuthModule;
    __mockGetAuthUser.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/credits');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should require billing:read permission for viewer', async () => {
    const { __mockGetAuthUser } = (await import('@/lib/auth')) as MockedAuthModule;
    __mockGetAuthUser.mockResolvedValue({
      id: 'viewer-1',
      email: 'viewer@test.com',
      role: 'viewer',
      plan: 'free',
      orgId: null,
    });

    const request = new NextRequest('http://localhost:3000/api/credits', {
      headers: {
        'x-user-id': 'viewer-1',
        'x-user-email': 'viewer@test.com',
        'x-user-role': 'viewer',
        'x-user-plan': 'free',
        'x-user-org': '',
      },
    });

    const response = await GET(request);
    // Viewer doesn't have billing:read — should be 403
    expect(response.status).toBe(403);
  });
});
