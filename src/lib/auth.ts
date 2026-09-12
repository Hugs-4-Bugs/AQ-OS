// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Centralized Authentication & Authorization Library
// Phase 3: Auth + Authorization + Session Security + RBAC
// ═══════════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// ===== CONSTANTS =====
// JWT_SECRET: In production, this MUST be set via environment variable.
// Uses a dev fallback for build-time and dev mode; runtime checks validate in production.
const JWT_SECRET = process.env.JWT_SECRET || 'acquisitionos-dev-secret-change-in-production';

/** Runtime guard: ensure JWT_SECRET is properly configured at request time */
function ensureJwtSecret(): void {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set in production.');
  }
}
const JWT_ACCESS_EXPIRY = '15m';
const JWT_REFRESH_EXPIRY = '30d';
const BCRYPT_ROUNDS = 12;
const OTP_EXPIRY_SECONDS = 600; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// ===== TYPES =====
export interface JwtPayload {
  sub: string;        // user ID
  email: string;
  role: string;
  plan: string;
  orgId: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  type: 'access' | 'refresh';
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  orgId: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  avatarUrl: string | null;
}

export type UserRole = 'super_admin' | 'owner' | 'admin' | 'member' | 'viewer';

export type AuthEventType =
  | 'signup'
  | 'signin'
  | 'signin_failed'
  | 'signout'
  | 'password_reset'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'mfa_verified'
  | 'magic_link_sent'
  | 'magic_link_used'
  | 'otp_login'
  | 'email_verification_sent'
  | 'email_verified'
  | 'session_revoked'
  | 'suspicious_login'
  | 'account_locked'
  | 'account_unlocked'
  | 'google_oauth_login'
  | 'refresh_token_rotated';

// ===== TOKEN FUNCTIONS =====

/** Generate a JWT access token (15 min) */
export function generateAccessToken(user: {
  id: string;
  email: string;
  role: string;
  plan: string;
  orgId: string | null;
  isTrial: boolean;
  trialEndsAt: Date | null;
}): string {
  ensureJwtSecret();
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt?.toISOString() || null,
      type: 'access',
    },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY, issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
}

/** Generate a JWT refresh token (30 days) */
export function generateRefreshToken(user: {
  id: string;
  email: string;
  role: string;
  plan: string;
  orgId: string | null;
  isTrial: boolean;
  trialEndsAt: Date | null;
}): string {
  ensureJwtSecret();
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt?.toISOString() || null,
      type: 'refresh',
    },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRY, issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
}

/** Verify a JWT token and return the payload */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'acquisitionos',
      audience: 'acquisitionos-api',
    }) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

/** Extract Bearer token from Authorization header */
export function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
}

// ===== COOKIE HELPERS =====

/** Set auth cookies on a response */
export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string
): NextResponse {
  response.cookies.set('access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60, // 15 minutes
  });

  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth', // Accessible to refresh + signout endpoints
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return response;
}

/** Clear auth cookies */
export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.set('access_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });

  response.cookies.set('refresh_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 0,
  });

  return response;
}

// ===== PASSWORD FUNCTIONS =====

/** Hash a password with bcrypt */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Verify a password against a hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    // Invalid hash format (e.g., timing-safe fake hash) — treat as non-match
    return false;
  }
}

/** Validate password strength */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (password.length > 128) errors.push('Password must be less than 128 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  if (!/[^A-Za-z0-9]/.test(password))
    errors.push('Password must contain at least one special character');
  return { valid: errors.length === 0, errors };
}

/** Validate email format */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ===== OTP FUNCTIONS =====

/** Generate a cryptographically secure 6-digit OTP */
export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/** Constant-time string comparison to prevent timing attacks */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  // If lengths differ, still compare bufB with itself to consume the same time,
  // then return false — this prevents leaking length information via timing
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufB, bufB);
    return false;
  }
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/** Check if OTP attempts are locked for a user */
export async function isOtpLocked(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { otpLockedUntil: true } });
  if (!user?.otpLockedUntil) return false;
  return new Date() < user.otpLockedUntil;
}

/** Increment OTP attempt count and lock if exceeded max */
export async function incrementOtpAttempts(userId: string): Promise<{ locked: boolean; attempts: number }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { otpAttemptCount: true } });
  const newCount = (user?.otpAttemptCount ?? 0) + 1;
  const locked = newCount >= OTP_MAX_ATTEMPTS;
  const lockUntil = locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

  await db.user.update({
    where: { id: userId },
    data: {
      otpAttemptCount: newCount,
      otpLockedUntil: lockUntil,
    },
  });

  return { locked, attempts: newCount };
}

/** Reset OTP attempt count after successful verification */
export async function resetOtpAttempts(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { otpAttemptCount: 0, otpLockedUntil: null },
  });
}

/** Generate a secure token for magic links */
export function generateMagicLinkToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ===== SESSION MANAGEMENT =====

/** Create a new user session in the database */
export async function createSession(params: {
  userId: string;
  refreshToken: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  // Pre-emptively delete any existing session with the same refreshToken
  // to avoid P2002 unique constraint errors on race conditions or re-logins.
  try {
    await db.userSession.deleteMany({
      where: { refreshToken: params.refreshToken },
    });
  } catch {
    // Ignore errors — the session may not exist
  }

  try {
    await db.userSession.create({
      data: {
        userId: params.userId,
        refreshToken: params.refreshToken,
        deviceInfo: params.deviceInfo || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        expiresAt,
        isRevoked: false,
      },
    });
  } catch (error: unknown) {
    // Handle P2002 (unique constraint violation) gracefully.
    // This can still happen in a race condition where another request
    // inserted the same refreshToken between our deleteMany and create.
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      // Delete the conflicting session and retry once
      await db.userSession.deleteMany({
        where: { refreshToken: params.refreshToken },
      });

      await db.userSession.create({
        data: {
          userId: params.userId,
          refreshToken: params.refreshToken,
          deviceInfo: params.deviceInfo || null,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
          expiresAt,
          isRevoked: false,
        },
      });
    } else {
      throw error;
    }
  }
}

/** Revoke a specific session by refresh token */
export async function revokeSession(refreshToken: string): Promise<void> {
  await db.userSession.updateMany({
    where: { refreshToken },
    data: { isRevoked: true },
  });
}

/** Revoke all sessions for a user */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.userSession.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });
}

/** Check if a refresh token is valid (not revoked) */
export async function isSessionValid(refreshToken: string): Promise<boolean> {
  const session = await db.userSession.findFirst({
    where: { refreshToken, isRevoked: false, expiresAt: { gt: new Date() } },
  });
  return !!session;
}

/** Get all active sessions for a user */
export async function getUserActiveSessions(userId: string) {
  return db.userSession.findMany({
    where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
}

// ===== LOGIN HISTORY =====

/** Record a login attempt — requires a valid userId (FK constraint) */
export async function recordLoginAttempt(params: {
  userId: string;
  ip: string;
  userAgent: string;
  country?: string;
  city?: string;
  success: boolean;
  failReason?: string;
}): Promise<void> {
  await db.loginHistory.create({
    data: {
      userId: params.userId,
      ip: params.ip || null,
      userAgent: params.userAgent || null,
      country: params.country || null,
      city: params.city || null,
      success: params.success,
      failReason: params.failReason || null,
    },
  });
}

/**
 * Record a login attempt by email — looks up user first.
 * Returns the userId if found, or null if user doesn't exist.
 */
export async function recordLoginAttemptByEmail(params: {
  email: string;
  ip: string;
  userAgent: string;
  country?: string;
  success: boolean;
  failReason?: string;
}): Promise<string | null> {
  const user = await db.user.findUnique({ where: { email: params.email } });
  if (!user) return null;

  await db.loginHistory.create({
    data: {
      userId: user.id,
      ip: params.ip || null,
      userAgent: params.userAgent || null,
      country: params.country || null,
      success: params.success,
      failReason: params.failReason || null,
    },
  });

  return user.id;
}

// ===== BRUTE FORCE PROTECTION =====

/** Check if an account is temporarily locked */
export async function isAccountLocked(email: string): Promise<boolean> {
  const recentFailedAttempts = await db.loginHistory.count({
    where: {
      success: false,
      createdAt: { gt: new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000) },
      user: { email },
    },
  });
  return recentFailedAttempts >= MAX_LOGIN_ATTEMPTS;
}

/** Check if an IP has too many failed attempts */
export function isIpRateLimited(failedAttempts: number): boolean {
  return failedAttempts >= MAX_LOGIN_ATTEMPTS;
}

// ===== MFA / TOTP FUNCTIONS =====

const TOTP_PERIOD = 30; // seconds per time step
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // allow ±1 time step for clock drift

// Base32 alphabet (RFC 4648)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode a buffer as Base32 string */
function base32Encode(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    result += BASE32_CHARS[parseInt(bits.substring(i, i + 5), 2)];
  }
  return result;
}

/** Decode a Base32 string to a buffer */
function base32Decode(str: string): Buffer {
  const cleaned = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of cleaned) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Generate a TOTP secret as Base32 string */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** Generate an otpauth:// URI for QR code generation */
export function generateTotpUri(params: {
  secret: string;
  label: string;
  issuer: string;
}): string {
  const encodedLabel = encodeURIComponent(params.label);
  const encodedIssuer = encodeURIComponent(params.issuer);
  return `otpauth://totp/${encodedIssuer}:${encodedLabel}?secret=${params.secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/** Calculate TOTP code for a given secret and time */
function calculateTotp(secret: string, time: number): string {
  const timeStep = Math.floor(time / TOTP_PERIOD);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(0, 0);
  timeBuffer.writeUInt32BE(timeStep, 4);

  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuffer);
  const hmacResult = hmac.digest();

  // Dynamic truncation
  const offset = hmacResult[hmacResult.length - 1] & 0x0f;
  const code =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  return (code % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, '0');
}

/** Verify a TOTP code against a secret with clock drift tolerance */
export function verifyTotpCode(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;

  const now = Math.floor(Date.now() / 1000);
  // Check current time step and ±window steps
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const checkTime = now + i * TOTP_PERIOD;
    const expected = calculateTotp(secret, checkTime);
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

/** Generate backup codes for MFA recovery */
export function generateBackupCodes(count: number = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
}

/** Check if a user has MFA enabled */
export async function isMfaEnabled(userId: string): Promise<boolean> {
  const mfaConfig = await db.mfaConfig.findUnique({ where: { userId } });
  return mfaConfig?.isEnabled ?? false;
}

// ===== AUDIT LOGGING =====

/**
 * Log an authentication event.
 * Requires a valid userId (FK constraint on AuditLog).
 * Silently fails if logging errors — never blocks the main flow.
 */
export async function logAuthEvent(params: {
  userId: string;
  action: AuthEventType | string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        details: params.details || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        resource: params.resource || 'auth',
        resourceId: params.resourceId || null,
      },
    });
  } catch (error) {
    // Never fail the main flow due to audit logging failure
    console.error('Audit log error:', error);
  }
}

// ===== AUTH HELPER FOR API ROUTES =====

/**
 * Map a Prisma User record to an AuthUser.
 * Handles field name differences (e.g., `avatar` → `avatarUrl`)
 * and resolves MFA status from the MfaConfig relation.
 * Resolves plan from the active subscription if available, falling back
 * to the User.plan field, and ultimately to 'free'.
 */
async function mapUserToAuthUser(
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    plan: string;
    orgId: string | null;
    emailVerified: boolean;
    avatar: string | null;
    mfaConfig: { isEnabled: boolean } | null;
    subscriptions: { plan: string; status: string }[];
  }
): Promise<AuthUser> {
  // Resolve the plan from the active subscription (trialing or active),
  // falling back to the User.plan field, then to 'free'.
  const activeSubscription = user.subscriptions.find(
    (s) => s.status === 'active' || s.status === 'trialing'
  );
  const resolvedPlan = activeSubscription?.plan || user.plan || 'free';

  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    role: user.role,
    plan: resolvedPlan,
    orgId: user.orgId,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaConfig?.isEnabled ?? false,
    avatarUrl: user.avatar,
  };
}

/** Get the authenticated user from a request, or null */
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  try {
    // Try Bearer token first
    const bearerToken = extractBearerToken(request);
    if (bearerToken) {
      const payload = verifyToken(bearerToken);
      if (payload && payload.type === 'access') {
        const user = await db.user.findUnique({
          where: { id: payload.sub },
          include: {
            mfaConfig: { select: { isEnabled: true } },
            subscriptions: {
              where: { status: { in: ['active', 'trialing'] } },
              select: { plan: true, status: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
        if (user) {
          return await mapUserToAuthUser(user);
        }
      }
    }

    // Try access_token cookie
    const accessTokenCookie = request.cookies.get('access_token')?.value;
    if (accessTokenCookie) {
      const payload = verifyToken(accessTokenCookie);
      if (payload && payload.type === 'access') {
        const user = await db.user.findUnique({
          where: { id: payload.sub },
          include: {
            mfaConfig: { select: { isEnabled: true } },
            subscriptions: {
              where: { status: { in: ['active', 'trialing'] } },
              select: { plan: true, status: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
        if (user) {
          return await mapUserToAuthUser(user);
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Require authentication — returns user or throws a 401 response */
export async function requireAuth(request: NextRequest): Promise<AuthUser> {
  const user = await getAuthUser(request);
  if (!user) {
    throw new AuthError('Authentication required', 401);
  }
  return user;
}

/** Check if a user has a specific role */
export function hasRole(user: AuthUser, ...roles: UserRole[]): boolean {
  return roles.includes(user.role as UserRole);
}

/** Check if a user has admin-level access (owner, admin, super_admin) */
export function isAdmin(user: AuthUser): boolean {
  return ['super_admin', 'owner', 'admin'].includes(user.role);
}

// ===== CUSTOM AUTH ERROR =====

export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

// ===== REQUEST INFO HELPERS =====

/** Extract IP address from request */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

/** Extract user agent from request */
export function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || 'unknown';
}

// ===== SUSPICIOUS LOGIN DETECTION =====

/**
 * Detect if a login is from a new IP or device compared to the user's
 * recent login history. Returns true if the login looks suspicious.
 */
export async function detectSuspiciousLogin(params: {
  userId: string;
  ip: string;
  userAgent: string;
}): Promise<boolean> {
  // Get recent login history for this user (last 30 days)
  const recentLogins = await db.loginHistory.findMany({
    where: {
      userId: params.userId,
      success: true,
      createdAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Check for new IP
  const knownIps = new Set(recentLogins.map(l => l.ip).filter(Boolean));
  const isNewIp = !knownIps.has(params.ip) && knownIps.size > 0;

  // Check for new device (user agent)
  const knownUserAgents = new Set(recentLogins.map(l => l.userAgent).filter(Boolean));
  const isNewDevice = !knownUserAgents.has(params.userAgent) && knownUserAgents.size > 0;

  return isNewIp || isNewDevice;
}

/**
 * Send a security alert to the user about a suspicious login.
 * In production, this would send an email. For now, it logs and
 * records the event in the audit log.
 */
export async function sendSecurityAlert(params: {
  userId: string;
  email: string;
  name: string;
  event: string;
  ip: string;
  userAgent: string;
}): Promise<void> {
  // In production, send an email to the user
  console.log(`[SECURITY ALERT] ${params.event} for ${params.email} from IP ${params.ip}`);

  // Send security alert email (non-blocking)
  try {
    const { sendSecurityAlertEmail, isEmailServiceConfigured } = await import('./email');
    if (isEmailServiceConfigured()) {
      await sendSecurityAlertEmail(params.email, params.name, params.event, params.ip, params.userAgent);
    }
  } catch {
    // Never block the main flow
  }

  await logAuthEvent({
    userId: params.userId,
    action: 'suspicious_login',
    details: `${params.event} from IP ${params.ip}`,
    ipAddress: params.ip,
    userAgent: params.userAgent,
  });
}

// ===== EXPORT CONSTANTS =====

export {
  JWT_SECRET,
  JWT_ACCESS_EXPIRY,
  JWT_REFRESH_EXPIRY,
  BCRYPT_ROUNDS,
  OTP_EXPIRY_SECONDS,
  OTP_MAX_ATTEMPTS,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_MINUTES,
};
