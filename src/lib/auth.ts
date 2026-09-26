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
// Resolution order: JWT_SECRET → AUTH_SECRET → NEXTAUTH_SECRET. The dev
// fallback below is ONLY reachable when NODE_ENV !== 'production'; the
// ensureJwtSecret() runtime guard refuses to sign/verify with it in production.
const DEV_FALLBACK_JWT_SECRET = 'acquisitionos-dev-secret-change-in-production';
const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  DEV_FALLBACK_JWT_SECRET;

/** Runtime guard: never sign or verify JWTs with the dev fallback in production */
function ensureJwtSecret(): void {
  if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEV_FALLBACK_JWT_SECRET) {
    throw new Error(
      'FATAL: JWT_SECRET (or AUTH_SECRET) environment variable is not set in production. '
      + 'Refusing to sign/verify tokens with the insecure dev fallback secret.'
    );
  }
}
const JWT_ACCESS_EXPIRY = '15m';
const JWT_REFRESH_EXPIRY = '30d';
const BCRYPT_ROUNDS = 12;
const OTP_EXPIRY_SECONDS = 600; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// ===== SESSION LIFETIME POLICY (P5+P6, permanent fix Sep 2026) =====
// "Remember me for 30 days" = ABSOLUTE maximum lifetime, with a
// server-authoritative 48-hour INACTIVITY limit:
//   - Active users keep their session until the 30-day absolute ceiling.
//   - A session idle for > 48h is invalidated at the next refresh.
// Non-remembered sessions keep the app's normal 30-day session behavior.
// Access tokens stay short-lived (15m) — refresh is the only lifetime gate.
export const SESSION_IDLE_MAX_MS = 48 * 60 * 60 * 1000;      // 48 hours
export const SESSION_REMEMBER_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_ACTIVITY_WRITE_THROTTLE_MS = 5 * 60 * 1000; // avoid per-request writes

// ===== TYPES =====
export interface JwtPayload {
  sub: string;        // user ID
  email: string;
  role: string;
  plan: string;
  orgId: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  type: 'access' | 'refresh' | 'mfa';
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

/**
 * Generate a short-lived MFA session token.
 *
 * SECURITY: this token carries `type: 'mfa'` and is ONLY accepted by
 * /api/auth/mfa/verify to complete TOTP verification. Unlike a full
 * access token it cannot be used on any other API (proxy.ts and
 * getAuthUser both require type === 'access').
 */
export function generateMfaSessionToken(user: {
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
      type: 'mfa',
    },
    JWT_SECRET,
    { expiresIn: '5m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
}

/** Verify a JWT token and return the payload */
export function verifyToken(token: string): JwtPayload | null {
  try {
    ensureJwtSecret();
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

/**
 * Set auth cookies on a response.
 *
 * opts.persist (default TRUE — preserves the app's current behavior for
 * every existing caller): refresh_token is a persistent cookie with a
 * 30-day maxAge, so the session survives browser restarts.
 * opts.persist = false ("Remember me" UNCHECKED): refresh_token is a
 * BROWSER-SESSION cookie (no maxAge) — it disappears when the browser
 * closes, which is the conventional non-remembered behavior.
 * The access_token cookie is unchanged (15 minutes).
 */
export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  opts?: { persist?: boolean }
): NextResponse {
  const persist = opts?.persist !== false;

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
    ...(persist ? { maxAge: 30 * 24 * 60 * 60 } : {}), // 30d when remembered; session cookie otherwise
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

/**
 * Create a new user session in the database.
 *
 * rememberMe (P5): the session row records the user's choice and a hard
 * 30-day absoluteExpiresAt ceiling. lastActivityAt starts at creation time
 * and is advanced by touchSessionActivity (server-authoritative, P6).
 */
export async function createSession(params: {
  userId: string;
  refreshToken: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
  rememberMe?: boolean;
}): Promise<void> {
  const now = Date.now();
  // 30-day expiry for BOTH modes: for remembered sessions this IS the
  // absolute ceiling; for non-remembered sessions this is the normal
  // server-side lifetime (unchanged from current behavior).
  const expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000);
  const rememberMe = !!params.rememberMe;

  const data = {
    userId: params.userId,
    refreshToken: params.refreshToken,
    deviceInfo: params.deviceInfo || null,
    ipAddress: params.ipAddress || null,
    userAgent: params.userAgent || null,
    expiresAt,
    isRevoked: false,
    rememberMe,
    lastActivityAt: new Date(now),
    absoluteExpiresAt: new Date(now + SESSION_REMEMBER_ABSOLUTE_MS),
  };

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
    await db.userSession.create({ data });
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

      await db.userSession.create({ data });
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

// ===== SESSION STATE (P4/P5/P6 — infrastructure-aware) =====

export type UserSessionState =
  | 'valid'
  | 'missing'
  | 'revoked'
  | 'expired'
  | 'idle_expired';

/**
 * Resolve the exact state of a refresh-token session.
 *
 * Unlike isSessionValid (boolean), this DISTINGUISHES:
 *   valid        — session row exists, not revoked, not expired
 *   missing      — no row (e.g. the sessions table was rebuilt)
 *   revoked      — explicit logout/revocation
 *   expired      — past expiresAt (absolute 30-day ceiling)
 *   idle_expired — remembered session idle beyond the 48h inactivity limit
 *
 * DATABASE/INFRASTRUCTURE ERRORS THROW — callers convert them to 503 so a
 * temporary database outage is NEVER reported to the client as "logged out".
 */
export async function getSessionState(refreshToken: string): Promise<{
  state: UserSessionState;
  session: {
    id: string;
    userId: string;
    rememberMe: boolean;
    lastActivityAt: Date;
    expiresAt: Date;
    absoluteExpiresAt: Date | null;
  } | null;
}> {
  const session = await db.userSession.findFirst({
    where: { refreshToken },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) return { state: 'missing', session: null };
  if (session.isRevoked) return { state: 'revoked', session: null };

  const now = new Date();
  if (session.expiresAt <= now) return { state: 'expired', session: null };

  // Hard absolute ceiling (P5): 30 days regardless of activity.
  const absolute = session.absoluteExpiresAt ?? session.expiresAt;
  if (absolute <= now) return { state: 'expired', session: null };

  // Server-authoritative idle limit (P6): remembered sessions die after
  // 48h WITHOUT authenticated activity. Non-remembered sessions keep the
  // app's normal behavior (no idle rule).
  if (
    session.rememberMe &&
    now.getTime() - new Date(session.lastActivityAt).getTime() > SESSION_IDLE_MAX_MS
  ) {
    return { state: 'idle_expired', session: null };
  }

  return {
    state: 'valid',
    session: {
      id: session.id,
      userId: session.userId,
      rememberMe: session.rememberMe,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    },
  };
}

/**
 * Advance lastActivityAt for a session (P6 activity tracking).
 * Called from the token-refresh endpoint (natural low-traffic hook:
 * at most every 14 minutes per client + on tab focus) — never from a
 * browser heartbeat. Throttled so repeated refreshes within 5 minutes
 * do not write.
 */
export async function touchSessionActivity(sessionId: string): Promise<void> {
  try {
    const session = await db.userSession.findUnique({
      where: { id: sessionId },
      select: { lastActivityAt: true },
    });
    if (!session) return;
    if (Date.now() - new Date(session.lastActivityAt).getTime() < SESSION_ACTIVITY_WRITE_THROTTLE_MS) {
      return; // recent write — skip (reduces SQLite write pressure)
    }
    await db.userSession.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    });
  } catch (error) {
    // Activity tracking must never break authentication. Database failures
    // here are non-fatal — the session itself was already validated.
    console.warn('[Auth] touchSessionActivity failed (non-fatal):', error instanceof Error ? error.message : error);
  }
}

/**
 * Read the client-declared "Remember me for 30 days" choice.
 * The auth pages set a SHORT-LIVED (10 min) non-sensitive cookie when the
 * checkbox is checked, so every login channel (password, OTP, magic link,
 * Google, MFA) carries the choice through its own round-trip. Forging the
 * cookie only changes session LIFETIME POLICY (max 30d absolute + 48h idle)
 * — never privileges — so it is not a security boundary.
 */
export function readRememberMeCookie(request: NextRequest): boolean {
  return request.cookies.get('aqos_remember_me')?.value === '1';
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
  // ── P11 (error semantics): infrastructure failures are NOT "anonymous" ──
  // A database outage must surface as 503 (temporarily unavailable), never
  // as a silent 401 that client code maps to logged-out / Free.
  let bearerToken: string | null = null;
  let accessTokenCookie: string | undefined;
  try {
    bearerToken = extractBearerToken(request);
    accessTokenCookie = request.cookies.get('access_token')?.value;

    const resolveFromToken = async (token: string): Promise<AuthUser | null> => {
      const payload = verifyToken(token);
      if (!payload || payload.type !== 'access') return null;
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
      // SECURITY: deactivated/deleted accounts must never authenticate,
      // even with a still-valid (≤15 min) access token.
      if (user && user.isActive && !user.deletedAt) {
        return await mapUserToAuthUser(user);
      }
      return null;
    };

    if (bearerToken) {
      const user = await resolveFromToken(bearerToken);
      if (user) return user;
    }

    if (accessTokenCookie) {
      const user = await resolveFromToken(accessTokenCookie);
      if (user) return user;
    }

    return null;
  } catch (error) {
    if (classifyAuthErrorCategory(error) === 'database') {
      throw new AuthError('Authentication service temporarily unavailable', 503);
    }
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
  // Mask PII (email) in server logs; IP retained for security forensics only.
  const maskedEmail = params.email.length > 3
    ? `${params.email.slice(0, 2)}***${params.email.slice(params.email.indexOf('@') > 0 ? params.email.indexOf('@') : 2)}`
    : '***';
  console.log(`[SECURITY ALERT] ${params.event} for ${maskedEmail} from IP ${params.ip}`);

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

// ===== SAFE ERROR CLASSIFICATION (auth routes) =====

/**
 * Classify an unexpected auth-route error into a SAFE diagnostic category
 * for server logs. NEVER returns or logs secret values, stack traces, or
 * raw provider messages — only a short category code, so the real root
 * cause stays diagnosable in dev.log while the browser sees a generic,
 * safe message.
 *
 * Categories (stable strings, safe to expose in logs):
 *   database   — Prisma/SQLite unavailable (e.g. db file missing/corrupt)
 *   validation — malformed request body
 *   unexpected — anything else (full error still logged server-side above)
 */
export function classifyAuthErrorCategory(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message || '';
    if (
      /P1\d{3}|P2\d{3}|prisma/i.test(msg) ||
      /unable to open the database file|SQLITE_|database file|Can't reach database/i.test(msg)
    ) {
      return 'database';
    }
    if (/body|json|unexpected token/i.test(msg)) {
      return 'validation';
    }
  }
  return 'unexpected';
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
