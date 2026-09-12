// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Authentication & Authorization
// Phase 12: Testing
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to create mock before vi.mock is hoisted
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    loginHistory: { create: vi.fn(), count: vi.fn() },
    userSession: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    mfaConfig: { findUnique: vi.fn() },
    subscription: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn((fn: any) => typeof fn === 'function' ? fn(mockDb) : fn),
  };
  return { mockDb };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn(),
  logSubscriptionEvent: vi.fn(),
  logBillingEvent: vi.fn(),
}));

import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  validateEmail,
  generateOTP,
  secureCompare,
  generateMagicLinkToken,
  generateTotpSecret,
  generateTotpUri,
  verifyTotpCode,
  generateBackupCodes,
  hasRole,
  isAdmin,
  isIpRateLimited,
  isOtpLocked,
  incrementOtpAttempts,
  resetOtpAttempts,
  createSession,
  revokeSession,
  revokeAllUserSessions,
  isSessionValid,
  isAccountLocked,
  AuthError,
  JWT_SECRET,
  OTP_MAX_ATTEMPTS,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_MINUTES,
  OTP_EXPIRY_SECONDS,
  BCRYPT_ROUNDS,
  getClientIp,
  getUserAgent,
  extractBearerToken,
} from '@/lib/auth';

import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  isAdminRole,
  getRolePermissions,
  canAccessTab,
  getAccessibleTabs,
} from '@/lib/rbac';

// ═══════════════════════════════════════════════════════════════════
// PASSWORD HASHING / VERIFICATION
// ═══════════════════════════════════════════════════════════════════

describe('Password Hashing & Verification', () => {
  it('should hash a password and verify it correctly', async () => {
    const password = 'MySecure!Pass1';
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2b$')).toBe(true);
    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject wrong password during verification', async () => {
    const hash = await hashPassword('CorrectPass1!');
    const isValid = await verifyPassword('WrongPass1!', hash);
    expect(isValid).toBe(false);
  });

  it('should produce different hashes for the same password (salt)', async () => {
    const password = 'SamePass123!';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2);
  });

  it('should use BCRYPT_ROUNDS=12 for hashing', () => {
    expect(BCRYPT_ROUNDS).toBe(12);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PASSWORD STRENGTH VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('Password Strength Validation', () => {
  it('should accept a strong password', () => {
    const result = validatePasswordStrength('MyStr0ng!Pass');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject password shorter than 8 characters', () => {
    const result = validatePasswordStrength('Ab1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
  });

  it('should reject password longer than 128 characters', () => {
    const longPass = 'A'.repeat(129) + '1a!';
    const result = validatePasswordStrength(longPass);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be less than 128 characters');
  });

  it('should reject password without uppercase letter', () => {
    const result = validatePasswordStrength('lowercase1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('should reject password without lowercase letter', () => {
    const result = validatePasswordStrength('UPPERCASE1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('should reject password without number', () => {
    const result = validatePasswordStrength('NoNumber!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number');
  });

  it('should reject password without special character', () => {
    const result = validatePasswordStrength('NoSpecial1A');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one special character');
  });

  it('should collect multiple errors at once', () => {
    const result = validatePasswordStrength('abc');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// JWT TOKEN CREATION / VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('JWT Token Creation & Validation', () => {
  const testUser = {
    id: 'user_jwt_test',
    email: 'jwt@test.com',
    role: 'owner',
    plan: 'pro',
    orgId: null,
    isTrial: false,
    trialEndsAt: null,
  };

  it('should generate a valid access token', () => {
    const token = generateAccessToken(testUser);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('should generate a valid refresh token', () => {
    const token = generateRefreshToken(testUser);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('should verify a valid access token and return correct payload', () => {
    const token = generateAccessToken(testUser);
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe(testUser.id);
    expect(payload!.email).toBe(testUser.email);
    expect(payload!.role).toBe(testUser.role);
    expect(payload!.type).toBe('access');
  });

  it('should verify a valid refresh token with type=refresh', () => {
    const token = generateRefreshToken(testUser);
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.type).toBe('refresh');
  });

  it('should reject an invalid token', () => {
    const payload = verifyToken('invalid.token.here');
    expect(payload).toBeNull();
  });

  it('should reject a tampered token', () => {
    const token = generateAccessToken(testUser);
    const tampered = token.slice(0, -5) + 'XXXXX';
    const payload = verifyToken(tampered);
    expect(payload).toBeNull();
  });

  it('should include trial info in token payload', () => {
    const trialUser = { ...testUser, isTrial: true, trialEndsAt: new Date('2025-12-31') };
    const token = generateAccessToken(trialUser);
    const payload = verifyToken(token);
    expect(payload!.isTrial).toBe(true);
    expect(payload!.trialEndsAt).toBe(trialUser.trialEndsAt.toISOString());
  });

  it('should include orgId in token payload when present', () => {
    const orgUser = { ...testUser, orgId: 'org_123' };
    const token = generateAccessToken(orgUser);
    const payload = verifyToken(token);
    expect(payload!.orgId).toBe('org_123');
  });
});

// ═══════════════════════════════════════════════════════════════════
// EMAIL VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('Email Validation', () => {
  it('should accept valid email addresses', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('test.user@domain.co')).toBe(true);
    expect(validateEmail('user+tag@company.org')).toBe(true);
  });

  it('should reject invalid email addresses', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('no-at-sign')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// OTP GENERATION
// ═══════════════════════════════════════════════════════════════════

describe('OTP Generation', () => {
  it('should generate a 6-digit OTP', () => {
    const otp = generateOTP();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('should generate different OTPs on successive calls (uniqueness)', () => {
    const otps = new Set(Array.from({ length: 20 }, () => generateOTP()));
    expect(otps.size).toBeGreaterThan(15);
  });

  it('OTP should be between 100000 and 999999', () => {
    for (let i = 0; i < 50; i++) {
      const otp = generateOTP();
      const num = parseInt(otp, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThanOrEqual(999999);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECURE COMPARE (TIMING-SAFE)
// ═══════════════════════════════════════════════════════════════════

describe('secureCompare', () => {
  it('should return true for identical strings', () => {
    expect(secureCompare('123456', '123456')).toBe(true);
  });

  it('should return false for different strings of same length', () => {
    expect(secureCompare('123456', '654321')).toBe(false);
  });

  it('should return false for strings of different lengths', () => {
    expect(secureCompare('abc', 'abcd')).toBe(false);
  });

  it('should return true for two empty strings', () => {
    expect(secureCompare('', '')).toBe(true);
  });

  it('should handle non-string inputs gracefully', () => {
    expect(secureCompare(null as unknown as string, 'test')).toBe(false);
    expect(secureCompare(undefined as unknown as string, 'test')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MAGIC LINK TOKENS
// ═══════════════════════════════════════════════════════════════════

describe('Magic Link Tokens', () => {
  it('should generate a 64-char hex token', () => {
    const token = generateMagicLinkToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should generate unique tokens', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateMagicLinkToken()));
    expect(tokens.size).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MFA / TOTP
// ═══════════════════════════════════════════════════════════════════

describe('MFA / TOTP Functions', () => {
  it('should generate a base32 TOTP secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThan(10);
  });

  it('should generate valid otpauth URI', () => {
    const uri = generateTotpUri({
      secret: 'JBSWY3DPEHPK3PXP',
      label: 'user@example.com',
      issuer: 'AcquisitionOS',
    });
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=AcquisitionOS');
  });

  it('should reject non-6-digit TOTP codes', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, 'abcdef')).toBe(false);
    expect(verifyTotpCode(secret, '12345')).toBe(false);
    expect(verifyTotpCode(secret, '1234567')).toBe(false);
  });

  it('should generate backup codes with correct format', () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    codes.forEach(code => {
      expect(code).toMatch(/^[0-9A-F]{8}$/);
    });
  });

  it('should generate custom number of backup codes', () => {
    const codes = generateBackupCodes(12);
    expect(codes).toHaveLength(12);
  });
});

// ═══════════════════════════════════════════════════════════════════
// OTP LOCKOUT MECHANISM (DB-dependent)
// ═══════════════════════════════════════════════════════════════════

describe('OTP Lockout Mechanism', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect when user is OTP locked', async () => {
    const futureDate = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    mockDb.user.findUnique.mockResolvedValue({ otpLockedUntil: futureDate });
    const locked = await isOtpLocked('user_1');
    expect(locked).toBe(true);
  });

  it('should detect when user is NOT OTP locked', async () => {
    mockDb.user.findUnique.mockResolvedValue({ otpLockedUntil: null });
    const locked = await isOtpLocked('user_1');
    expect(locked).toBe(false);
  });

  it('should detect expired lockout', async () => {
    const pastDate = new Date(Date.now() - 1000);
    mockDb.user.findUnique.mockResolvedValue({ otpLockedUntil: pastDate });
    const locked = await isOtpLocked('user_1');
    expect(locked).toBe(false);
  });

  it('should increment OTP attempts and lock after max', async () => {
    mockDb.user.findUnique.mockResolvedValue({ otpAttemptCount: OTP_MAX_ATTEMPTS - 1 });
    mockDb.user.update.mockResolvedValue({});
    const result = await incrementOtpAttempts('user_1');
    expect(result.locked).toBe(true);
    expect(result.attempts).toBe(OTP_MAX_ATTEMPTS);
  });

  it('should not lock before max attempts', async () => {
    mockDb.user.findUnique.mockResolvedValue({ otpAttemptCount: 1 });
    mockDb.user.update.mockResolvedValue({});
    const result = await incrementOtpAttempts('user_1');
    expect(result.locked).toBe(false);
    expect(result.attempts).toBe(2);
  });

  it('should reset OTP attempts', async () => {
    mockDb.user.update.mockResolvedValue({});
    await resetOtpAttempts('user_1');
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { otpAttemptCount: 0, otpLockedUntil: null },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a session', async () => {
    mockDb.userSession.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.userSession.create.mockResolvedValue({});
    await createSession({
      userId: 'user_1',
      refreshToken: 'rt_123',
      deviceInfo: 'Chrome/Mac',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    });
    expect(mockDb.userSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_1',
          refreshToken: 'rt_123',
          isRevoked: false,
        }),
      })
    );
  });

  it('should revoke a specific session', async () => {
    mockDb.userSession.updateMany.mockResolvedValue({ count: 1 });
    await revokeSession('rt_123');
    expect(mockDb.userSession.updateMany).toHaveBeenCalledWith({
      where: { refreshToken: 'rt_123' },
      data: { isRevoked: true },
    });
  });

  it('should revoke all user sessions', async () => {
    mockDb.userSession.updateMany.mockResolvedValue({ count: 3 });
    await revokeAllUserSessions('user_1');
    expect(mockDb.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isRevoked: false },
      data: { isRevoked: true },
    });
  });

  it('should validate an active session', async () => {
    mockDb.userSession.findFirst.mockResolvedValue({ id: 'sess_1', isRevoked: false });
    const valid = await isSessionValid('rt_123');
    expect(valid).toBe(true);
  });

  it('should detect a revoked session', async () => {
    mockDb.userSession.findFirst.mockResolvedValue(null);
    const valid = await isSessionValid('rt_revoked');
    expect(valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// RBAC ROLE PERMISSIONS
// ═══════════════════════════════════════════════════════════════════

describe('RBAC Role Permissions', () => {
  it('super_admin should have all permissions', () => {
    const perms = getRolePermissions('super_admin');
    expect(perms).toContain('leads:read');
    expect(perms).toContain('leads:write');
    expect(perms).toContain('leads:delete');
    expect(perms).toContain('admin:access');
    expect(perms).toContain('billing:write');
  });

  it('owner should have almost all permissions', () => {
    const perms = getRolePermissions('owner');
    expect(perms).toContain('leads:delete');
    expect(perms).toContain('admin:access');
    expect(perms.length).toBeGreaterThan(15);
  });

  it('admin should have write access but not billing:write', () => {
    expect(hasPermission('admin', 'leads:write')).toBe(true);
    expect(hasPermission('admin', 'billing:write')).toBe(false);
    expect(hasPermission('admin', 'team:write')).toBe(false);
  });

  it('member should have limited write access', () => {
    expect(hasPermission('member', 'leads:write')).toBe(true);
    expect(hasPermission('member', 'outreach:write')).toBe(true);
    expect(hasPermission('member', 'leads:delete')).toBe(false);
    expect(hasPermission('member', 'pipeline:write')).toBe(false);
  });

  it('viewer should have only read access', () => {
    expect(hasPermission('viewer', 'leads:read')).toBe(true);
    expect(hasPermission('viewer', 'insights:read')).toBe(true);
    expect(hasPermission('viewer', 'leads:write')).toBe(false);
    expect(hasPermission('viewer', 'competitors:write')).toBe(false);
  });

  it('hasAllPermissions should require all permissions', () => {
    expect(hasAllPermissions('admin', ['leads:read', 'leads:write'])).toBe(true);
    expect(hasAllPermissions('admin', ['leads:read', 'billing:write'])).toBe(false);
  });

  it('hasAnyPermission should require any one permission', () => {
    expect(hasAnyPermission('member', ['billing:write', 'leads:write'])).toBe(true);
    expect(hasAnyPermission('viewer', ['billing:write', 'leads:write'])).toBe(false);
  });

  it('isAdminRole should identify admin-level roles', () => {
    expect(isAdminRole('super_admin')).toBe(true);
    expect(isAdminRole('owner')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('member')).toBe(false);
    expect(isAdminRole('viewer')).toBe(false);
  });

  it('hasRole helper should check user role membership', () => {
    const adminUser = { id: '1', email: 'a@b.com', name: 'A', role: 'admin', plan: 'pro', orgId: null, emailVerified: true, mfaEnabled: false, avatarUrl: null };
    expect(hasRole(adminUser, 'admin', 'owner')).toBe(true);
    expect(hasRole(adminUser, 'viewer')).toBe(false);
  });

  it('isAdmin helper should check admin-level access', () => {
    const ownerUser = { id: '1', email: 'a@b.com', name: 'A', role: 'owner', plan: 'pro', orgId: null, emailVerified: true, mfaEnabled: false, avatarUrl: null };
    const memberUser = { id: '2', email: 'b@b.com', name: 'B', role: 'member', plan: 'free', orgId: null, emailVerified: true, mfaEnabled: false, avatarUrl: null };
    expect(isAdmin(ownerUser)).toBe(true);
    expect(isAdmin(memberUser)).toBe(false);
  });

  it('canAccessTab should check tab permissions', () => {
    expect(canAccessTab('viewer', 'leads')).toBe(true);
    expect(canAccessTab('viewer', 'outreach')).toBe(false);
    expect(canAccessTab('member', 'outreach')).toBe(true);
  });

  it('getAccessibleTabs should return correct tabs for each role', () => {
    const viewerTabs = getAccessibleTabs('viewer');
    expect(viewerTabs).toContain('leads');
    expect(viewerTabs).toContain('insights');
    expect(viewerTabs).not.toContain('outreach');

    const memberTabs = getAccessibleTabs('member');
    expect(memberTabs).toContain('outreach');
  });
});

// ═══════════════════════════════════════════════════════════════════
// BRUTE FORCE PROTECTION
// ═══════════════════════════════════════════════════════════════════

describe('Brute Force Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should rate limit IPs with too many failures', () => {
    expect(isIpRateLimited(MAX_LOGIN_ATTEMPTS)).toBe(true);
    expect(isIpRateLimited(MAX_LOGIN_ATTEMPTS - 1)).toBe(false);
    expect(isIpRateLimited(0)).toBe(false);
  });

  it('should detect locked accounts via login history', async () => {
    mockDb.loginHistory.count.mockResolvedValue(MAX_LOGIN_ATTEMPTS);
    const locked = await isAccountLocked('locked@test.com');
    expect(locked).toBe(true);
  });

  it('should detect unlocked accounts', async () => {
    mockDb.loginHistory.count.mockResolvedValue(2);
    const locked = await isAccountLocked('open@test.com');
    expect(locked).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// REQUEST HELPERS
// ═══════════════════════════════════════════════════════════════════

describe('Request Helpers', () => {
  it('should extract IP from x-forwarded-for header', () => {
    const req = { headers: { get: (name: string) => name === 'x-forwarded-for' ? '1.2.3.4, 5.6.7.8' : null } } as any;
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('should fall back to x-real-ip header', () => {
    const req = { headers: { get: (name: string) => name === 'x-real-ip' ? '9.8.7.6' : null } } as any;
    expect(getClientIp(req)).toBe('9.8.7.6');
  });

  it('should return "unknown" when no IP headers', () => {
    const req = { headers: { get: () => null } } as any;
    expect(getClientIp(req)).toBe('unknown');
  });

  it('should extract user agent', () => {
    const req = { headers: { get: (name: string) => name === 'user-agent' ? 'Mozilla/5.0' : null } } as any;
    expect(getUserAgent(req)).toBe('Mozilla/5.0');
  });

  it('should return "unknown" when no user agent', () => {
    const req = { headers: { get: () => null } } as any;
    expect(getUserAgent(req)).toBe('unknown');
  });

  it('should extract Bearer token from Authorization header', () => {
    const req = { headers: { get: (name: string) => name === 'authorization' ? 'Bearer mytoken123' : null } } as any;
    expect(extractBearerToken(req)).toBe('mytoken123');
  });

  it('should return null when no Bearer token', () => {
    const req = { headers: { get: () => null } } as any;
    expect(extractBearerToken(req)).toBeNull();
  });

  it('should return null for non-Bearer Authorization', () => {
    const req = { headers: { get: (name: string) => name === 'authorization' ? 'Basic abc123' : null } } as any;
    expect(extractBearerToken(req)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// AUTH ERROR CLASS
// ═══════════════════════════════════════════════════════════════════

describe('AuthError', () => {
  it('should create an AuthError with message and status code', () => {
    const error = new AuthError('Not authenticated', 401);
    expect(error.message).toBe('Not authenticated');
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe('AuthError');
    expect(error instanceof Error).toBe(true);
  });

  it('should default to 401 status code', () => {
    const error = new AuthError('Test');
    expect(error.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('Auth Constants', () => {
  it('should have correct OTP_EXPIRY_SECONDS', () => {
    expect(OTP_EXPIRY_SECONDS).toBe(600);
  });

  it('should have correct OTP_MAX_ATTEMPTS', () => {
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });

  it('should have correct MAX_LOGIN_ATTEMPTS', () => {
    expect(MAX_LOGIN_ATTEMPTS).toBe(5);
  });

  it('should have correct LOCKOUT_MINUTES', () => {
    expect(LOCKOUT_MINUTES).toBe(15);
  });

  it('should have JWT_SECRET set', () => {
    expect(JWT_SECRET).toBeDefined();
    expect(JWT_SECRET.length).toBeGreaterThan(0);
  });
});
