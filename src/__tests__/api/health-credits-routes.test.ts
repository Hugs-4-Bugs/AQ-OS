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
  PLAN_CREDITS: { free: 50, pro: 500, elite: 2000 },
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
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('services');
  });

  it('should return status as ok, degraded, or error', async () => {
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const body = await response.json();

    expect(['ok', 'degraded', 'error']).toContain(body.status);
  });

  it('should include services with db and redis status', async () => {
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const body = await response.json();

    expect(body.services).toHaveProperty('db');
    expect(body.services).toHaveProperty('redis');
    expect(['ok', 'error']).toContain(body.services.db);
    expect(['ok', 'error']).toContain(body.services.redis);
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

  it('should require admin authentication', async () => {
    const { __mockGetAuthUser } = (await import('@/lib/auth')) as MockedAuthModule;
    __mockGetAuthUser.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/health/detailed');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 403 for non-admin users', async () => {
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

    expect(response.status).toBe(403);
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
