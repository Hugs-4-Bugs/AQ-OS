// ═══════════════════════════════════════════════════════════════════
// Test Helper: Create mock user objects for tests
// ═══════════════════════════════════════════════════════════════════

import type { AuthUser } from '@/lib/auth';

interface MockUserOptions {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  plan?: string;
  orgId?: string | null;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  avatarUrl?: string | null;
  authProvider?: string | null;
}

/**
 * Create a mock AuthUser object with sensible defaults.
 */
export function createMockUser(options: MockUserOptions = {}): AuthUser {
  return {
    id: options.id || 'test-user-id',
    email: options.email || 'test@example.com',
    name: options.name || 'Test User',
    role: options.role || 'owner',
    plan: options.plan || 'free',
    orgId: options.orgId ?? null,
    emailVerified: options.emailVerified ?? true,
    mfaEnabled: options.mfaEnabled ?? false,
    avatarUrl: options.avatarUrl ?? null,
    authProvider: options.authProvider ?? 'email',
  } as AuthUser;
}

/**
 * Create a mock admin user.
 */
export function createMockAdmin(options: MockUserOptions = {}): AuthUser {
  return createMockUser({
    id: 'admin-user-id',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'super_admin',
    plan: 'elite',
    ...options,
  });
}

/**
 * Create a mock viewer user.
 */
export function createMockViewer(options: MockUserOptions = {}): AuthUser {
  return createMockUser({
    id: 'viewer-user-id',
    email: 'viewer@example.com',
    name: 'Viewer User',
    role: 'viewer',
    plan: 'free',
    ...options,
  });
}

/**
 * Create a mock pro user.
 */
export function createMockProUser(options: MockUserOptions = {}): AuthUser {
  return createMockUser({
    id: 'pro-user-id',
    email: 'pro@example.com',
    name: 'Pro User',
    role: 'owner',
    plan: 'pro',
    ...options,
  });
}

/**
 * Create a mock elite user.
 */
export function createMockEliteUser(options: MockUserOptions = {}): AuthUser {
  return createMockUser({
    id: 'elite-user-id',
    email: 'elite@example.com',
    name: 'Elite User',
    role: 'owner',
    plan: 'elite',
    ...options,
  });
}

/**
 * Create a mock DB user record (Prisma shape).
 */
export function createMockDbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    password: '$2a$12$hashedpassword',
    role: 'owner',
    plan: 'free',
    credits: 50,
    creditsMonthly: 50,
    rolloverCredits: 0,
    orgId: null,
    emailVerified: true,
    avatar: null,
    authProvider: 'email',
    isTrial: false,
    trialEndsAt: null,
    isActive: true,
    deletedAt: null,
    otp: null,
    otpExpiresAt: null,
    otpAttemptCount: 0,
    otpLockedUntil: null,
    magicLinkToken: null,
    magicLinkExpiresAt: null,
    resetToken: null,
    resetTokenExpiresAt: null,
    loginAttemptCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    mfaConfig: null,
    subscriptions: [],
    ...overrides,
  };
}
