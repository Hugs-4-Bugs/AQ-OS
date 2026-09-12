// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Magic Link Validator Service
// Phase 3 Remediation: Auth gaps and edge cases
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAuthEvent, secureCompare } from '@/lib/auth';

// ===== CONSTANTS =====

/** Magic link token expiry: 15 minutes */
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000;

/** Rate limit: max 5 magic link requests per hour per email */
const MAGIC_LINK_RATE_LIMIT = 5;

/** Rate limit window: 1 hour */
const MAGIC_LINK_RATE_WINDOW_MS = 60 * 60 * 1000;

/** Brute force detection: max 10 failed verification attempts per hour per email */
const MAGIC_LINK_BRUTE_FORCE_LIMIT = 10;

/** Brute force detection window: 1 hour */
const MAGIC_LINK_BRUTE_FORCE_WINDOW_MS = 60 * 60 * 1000;

// ===== TYPES =====

export interface MagicLinkValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: 'invalid_format' | 'expired' | 'already_used' | 'not_found';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date | null;
}

// ===== TOKEN FORMAT VALIDATION =====

/**
 * Validate the format of a magic link token.
 * Magic link tokens are 64-character hex strings (32 bytes).
 */
export function validateMagicLinkTokenFormat(token: string): {
  valid: boolean;
  error?: string;
} {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is required' };
  }

  if (token.length !== 64) {
    return { valid: false, error: 'Invalid token format' };
  }

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return { valid: false, error: 'Invalid token format' };
  }

  return { valid: true };
}

// ===== FULL TOKEN VALIDATION =====

/**
 * Validate a magic link token against the database.
 * Checks:
 * 1. Token format
 * 2. User exists with this token
 * 3. Token hasn't expired (15 minutes)
 * 4. Single-use enforcement (token is cleared after first use)
 */
export async function validateMagicLinkToken(params: {
  email: string;
  token: string;
  ip: string;
  userAgent: string;
}): Promise<MagicLinkValidationResult> {
  // ── Step 1: Validate format ───────────────────────────────────
  const formatCheck = validateMagicLinkTokenFormat(params.token);
  if (!formatCheck.valid) {
    return {
      valid: false,
      error: formatCheck.error,
      errorCode: 'invalid_format',
    };
  }

  // ── Step 2: Find user with this token ─────────────────────────
  const user = await db.user.findUnique({
    where: { email: params.email.toLowerCase().trim() },
    select: {
      id: true,
      email: true,
      magicLinkToken: true,
      magicLinkTokenExpiry: true,
      isActive: true,
    },
  });

  if (!user) {
    // Don't reveal whether user exists
    return {
      valid: false,
      error: 'Invalid or expired magic link',
      errorCode: 'not_found',
    };
  }

  // ── Step 3: Check if token is already used (null = already used) ──
  if (!user.magicLinkToken) {
    await logAuthEvent({
      userId: user.id,
      action: 'magic_link_used',
      details: 'Attempted to reuse already-consumed magic link token',
      ipAddress: params.ip,
      userAgent: params.userAgent,
      resource: 'auth',
    });

    return {
      valid: false,
      error: 'This magic link has already been used. Please request a new one.',
      errorCode: 'already_used',
    };
  }

  // ── Step 4: Compare tokens (constant-time) ────────────────────
  if (!secureCompare(user.magicLinkToken, params.token)) {
    // Log failed verification attempt for brute force detection
    await logMagicLinkVerificationFailure(user.id, params.ip, params.userAgent);

    return {
      valid: false,
      error: 'Invalid or expired magic link',
      errorCode: 'not_found',
    };
  }

  // ── Step 5: Check expiry (15 minutes max) ─────────────────────
  if (!user.magicLinkTokenExpiry) {
    return {
      valid: false,
      error: 'Invalid magic link',
      errorCode: 'expired',
    };
  }

  const now = new Date();
  const tokenAge = now.getTime() - user.magicLinkTokenExpiry.getTime() + MAGIC_LINK_EXPIRY_MS;

  if (now > user.magicLinkTokenExpiry) {
    // Token has expired — clear it
    await invalidateMagicLinkToken(user.id);

    await logAuthEvent({
      userId: user.id,
      action: 'magic_link_used',
      details: `Expired magic link attempted (token age: ${Math.round(tokenAge / 1000 / 60)}min)`,
      ipAddress: params.ip,
      userAgent: params.userAgent,
      resource: 'auth',
    });

    return {
      valid: false,
      error: 'Magic link has expired. Please request a new one.',
      errorCode: 'expired',
    };
  }

  // ── Step 6: Token is valid — invalidate immediately (single-use) ──
  await invalidateMagicLinkToken(user.id);

  return { valid: true };
}

// ===== RATE LIMITING =====

/**
 * Enforce rate limiting for magic link requests.
 * Max MAGIC_LINK_RATE_LIMIT requests per hour per email.
 */
export async function enforceMagicLinkRateLimit(email: string): Promise<RateLimitResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const windowStart = new Date(Date.now() - MAGIC_LINK_RATE_WINDOW_MS);

  // Count recent magic link requests for this email
  const recentRequests = await db.auditLog.count({
    where: {
      action: 'magic_link_sent',
      details: { contains: normalizedEmail },
      createdAt: { gt: windowStart },
    },
  });

  const remaining = Math.max(0, MAGIC_LINK_RATE_LIMIT - recentRequests);
  const resetAt =
    recentRequests >= MAGIC_LINK_RATE_LIMIT
      ? new Date(windowStart.getTime() + MAGIC_LINK_RATE_WINDOW_MS)
      : null;

  return {
    allowed: recentRequests < MAGIC_LINK_RATE_LIMIT,
    remaining,
    resetAt,
  };
}

// ===== BRUTE FORCE DETECTION =====

/**
 * Check if an email has too many failed magic link verification attempts.
 * This prevents brute-forcing of magic link tokens.
 */
export async function detectMagicLinkBruteForce(email: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true },
  });

  if (!user) return false;

  const windowStart = new Date(Date.now() - MAGIC_LINK_BRUTE_FORCE_WINDOW_MS);

  const failedAttempts = await db.auditLog.count({
    where: {
      userId: user.id,
      action: 'magic_link_verification_failed',
      createdAt: { gt: windowStart },
    },
  });

  return failedAttempts >= MAGIC_LINK_BRUTE_FORCE_LIMIT;
}

// ===== TOKEN INVALIDATION =====

/**
 * Invalidate a magic link token by clearing it from the user record.
 * This enforces single-use: once consumed, the token cannot be reused.
 */
export async function invalidateMagicLinkToken(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      magicLinkToken: null,
      magicLinkTokenExpiry: null,
    },
  });
}

// ===== HELPER: Log verification failure =====

/**
 * Log a failed magic link verification attempt for brute force tracking.
 */
async function logMagicLinkVerificationFailure(
  userId: string,
  ip: string,
  userAgent: string
): Promise<void> {
  await logAuthEvent({
    userId,
    action: 'magic_link_verification_failed',
    details: 'Failed magic link token verification',
    ipAddress: ip,
    userAgent,
    resource: 'auth',
  });
}
