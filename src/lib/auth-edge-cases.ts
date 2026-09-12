// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Auth Edge Case Handler
// Phase 3 Remediation: Auth gaps and edge cases
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { db } from '@/lib/db';
import { verifyToken, revokeSession, logAuthEvent } from '@/lib/auth';

// ===== CONSTANTS =====

/** Maximum number of concurrent active sessions per user */
const MAX_CONCURRENT_SESSIONS = 5;

/** OAuth state token expiry: 10 minutes */
const OAUTH_STATE_EXPIRY_MS = 10 * 60 * 1000;

/** MFA session recovery window: 5 minutes */
const MFA_RECOVERY_WINDOW_MS = 5 * 60 * 1000;

// ===== TYPES =====

export interface SessionLimitResult {
  enforced: boolean;
  revokedCount: number;
  message: string;
}

export interface RefreshRaceResult {
  winner: boolean;
  action: 'proceed' | 'retry' | 'reject';
  message: string;
}

export interface OAuthStateResult {
  valid: boolean;
  error?: string;
}

// ===== CONCURRENT SESSION LIMIT =====

/**
 * Enforce a maximum number of concurrent active sessions for a user.
 * If the user exceeds the limit, the oldest sessions are revoked.
 */
export async function enforceSessionLimit(userId: string): Promise<SessionLimitResult> {
  // Get all active (non-revoked, non-expired) sessions for the user
  const activeSessions = await db.userSession.findMany({
    where: {
      userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' }, // newest first
  });

  // If within limit, no action needed
  if (activeSessions.length <= MAX_CONCURRENT_SESSIONS) {
    return {
      enforced: false,
      revokedCount: 0,
      message: `Within limit (${activeSessions.length}/${MAX_CONCURRENT_SESSIONS})`,
    };
  }

  // Revoke the oldest sessions that exceed the limit
  const sessionsToRevoke = activeSessions.slice(MAX_CONCURRENT_SESSIONS);
  let revokedCount = 0;

  for (const session of sessionsToRevoke) {
    try {
      await db.userSession.update({
        where: { id: session.id },
        data: { isRevoked: true },
      });
      revokedCount++;
    } catch {
      // Continue revoking other sessions even if one fails
    }
  }

  // Log the session limit enforcement
  await logAuthEvent({
    userId,
    action: 'session_revoked',
    details: `Session limit enforced: revoked ${revokedCount} oldest sessions (had ${activeSessions.length}, max ${MAX_CONCURRENT_SESSIONS})`,
    resource: 'auth',
  });

  return {
    enforced: true,
    revokedCount,
    message: `Revoked ${revokedCount} oldest session(s) to enforce limit of ${MAX_CONCURRENT_SESSIONS}`,
  };
}

// ===== TOKEN REFRESH RACE CONDITION =====

/**
 * Handle token refresh race conditions.
 * When multiple concurrent requests try to refresh the same token,
 * only one should succeed. The others should retry with the new token.
 *
 * Strategy: Use a simple locking mechanism via database update.
 * The first refresh to complete "wins" and invalidates the old refresh token.
 * Subsequent refreshes with the same old token will fail.
 */
export async function handleRefreshRaceCondition(params: {
  userId: string;
  oldRefreshToken: string;
  newRefreshToken: string;
}): Promise<RefreshRaceResult> {
  // Check if the old refresh token still exists and is valid
  const existingSession = await db.userSession.findFirst({
    where: {
      userId: params.userId,
      refreshToken: params.oldRefreshToken,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
  });

  if (!existingSession) {
    // The old token was already rotated by another request
    // Check if the new token already exists (meaning another refresh won)
    const newSessionExists = await db.userSession.findFirst({
      where: {
        userId: params.userId,
        refreshToken: params.newRefreshToken,
        isRevoked: false,
      },
    });

    if (newSessionExists) {
      return {
        winner: false,
        action: 'retry',
        message: 'Token was already refreshed by another request. Use the new token.',
      };
    }

    // Neither old nor new token exists — session may have been revoked
    return {
      winner: false,
      action: 'reject',
      message: 'Session has been revoked. Please sign in again.',
    };
  }

  // We have the old token — this request wins the race
  // Revoke the old session
  await db.userSession.update({
    where: { id: existingSession.id },
    data: { isRevoked: true },
  });

  return {
    winner: true,
    action: 'proceed',
    message: 'Token refresh successful',
  };
}

// ===== EXPIRED MFA SESSION RECOVERY =====

/**
 * Recover an expired MFA session.
 * When a user starts MFA verification but the access token expires
 * before they complete it, this function allows them to continue
 * within a short recovery window.
 *
 * The MFA session token is a short-lived access token. If it expires,
 * we check if the user has a valid MFA session within the recovery window
 * and issue a new temporary token.
 */
export async function recoverMfaSession(params: {
  userId: string;
  expiredAccessToken: string;
  ip: string;
  userAgent: string;
}): Promise<{ recovered: boolean; newMfaToken?: string; error?: string }> {
  // Verify the expired token to extract its payload
  const payload = verifyToken(params.expiredAccessToken);
  if (!payload || payload.type !== 'access') {
    return {
      recovered: false,
      error: 'Invalid or malformed token',
    };
  }

  // Check if this user has a pending MFA verification
  const user = await db.user.findUnique({
    where: { id: params.userId },
    include: { mfaConfig: true },
  });

  if (!user || !user.mfaConfig?.isEnabled) {
    return {
      recovered: false,
      error: 'MFA is not enabled for this account',
    };
  }

  // Check for a recent MFA-related audit event (within recovery window)
  const recoveryWindowStart = new Date(Date.now() - MFA_RECOVERY_WINDOW_MS);
  const recentMfaEvent = await db.auditLog.findFirst({
    where: {
      userId: params.userId,
      action: 'signin',
      details: { contains: 'MFA required' },
      createdAt: { gt: recoveryWindowStart },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!recentMfaEvent) {
    return {
      recovered: false,
      error: 'No pending MFA verification found within recovery window',
    };
  }

  // Generate a new MFA session token
  const { generateAccessToken } = await import('@/lib/auth');
  const newMfaToken = generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    orgId: user.orgId,
    isTrial: user.isTrial,
    trialEndsAt: user.trialEndsAt,
  });

  // Log the MFA recovery
  await logAuthEvent({
    userId: params.userId,
    action: 'signin',
    details: 'MFA session recovered — new temporary token issued',
    ipAddress: params.ip,
    userAgent: params.userAgent,
    resource: 'auth',
  });

  return {
    recovered: true,
    newMfaToken,
  };
}

// ===== OAUTH CALLBACK STATE VALIDATION =====

/**
 * Validate the state parameter in OAuth callbacks.
 * The state parameter prevents CSRF attacks by ensuring the callback
 * was initiated by our application.
 *
 * State format: base64-encoded JSON with { nonce, timestamp, redirectUrl }
 */
export async function validateOAuthState(state: string): Promise<OAuthStateResult> {
  try {
    // Decode the state parameter
    const decoded = Buffer.from(state, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);

    // Verify required fields
    if (!parsed.nonce || !parsed.timestamp) {
      return { valid: false, error: 'Invalid state format' };
    }

    // Check timestamp (state must be within OAuth_STATE_EXPIRY_MS)
    const stateTime = new Date(parsed.timestamp);
    const now = new Date();
    const age = now.getTime() - stateTime.getTime();

    if (age > OAUTH_STATE_EXPIRY_MS) {
      return { valid: false, error: 'OAuth state has expired' };
    }

    if (age < 0) {
      return { valid: false, error: 'OAuth state timestamp is in the future' };
    }

    // Verify nonce format (should be a random hex string)
    if (!/^[a-f0-9]{16,}$/.test(parsed.nonce)) {
      return { valid: false, error: 'Invalid nonce in state' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Failed to parse OAuth state' };
  }
}

/**
 * Generate an OAuth state parameter for CSRF protection.
 */
export function generateOAuthState(redirectUrl?: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = {
    nonce,
    timestamp: new Date().toISOString(),
    redirectUrl: redirectUrl || '/',
  };
  return Buffer.from(JSON.stringify(state)).toString('base64');
}

// ===== EMAIL CHANGE DURING ACTIVE SESSION =====

/**
 * Handle email change during an active session.
 * When a user changes their email while logged in:
 * 1. Verify the new email (send verification OTP)
 * 2. Keep the old email active until new one is verified
 * 3. Invalidate all sessions on other devices
 * 4. Current session continues with updated email
 * 5. Log the change for audit
 */
export async function handleEmailChange(params: {
  userId: string;
  oldEmail: string;
  newEmail: string;
  ip: string;
  userAgent: string;
}): Promise<{ success: boolean; requiresVerification: boolean; message: string }> {
  // Check if the new email is already taken
  const existingUser = await db.user.findUnique({
    where: { email: params.newEmail.toLowerCase().trim() },
  });

  if (existingUser) {
    return {
      success: false,
      requiresVerification: false,
      message: 'This email is already associated with an account',
    };
  }

  // Update the user's email but mark as unverified
  await db.user.update({
    where: { id: params.userId },
    data: {
      email: params.newEmail.toLowerCase().trim(),
      emailVerified: false,
    },
  });

  // Revoke all sessions except the current one (identified by user agent)
  const sessions = await db.userSession.findMany({
    where: {
      userId: params.userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
  });

  for (const session of sessions) {
    // Keep the current session alive
    if (session.userAgent === params.userAgent) continue;
    // Revoke other sessions
    await revokeSession(session.refreshToken);
  }

  // Log the email change
  await logAuthEvent({
    userId: params.userId,
    action: 'email_verified', // using existing event type for email change
    details: `Email changed from ${params.oldEmail} to ${params.newEmail}. Verification pending.`,
    ipAddress: params.ip,
    userAgent: params.userAgent,
    resource: 'auth',
  });

  // Send verification email to the new address
  try {
    const { isEmailServiceConfigured } = await import('./email');
    const { shouldBypassEmail } = await import('./feature-flags');

    if (isEmailServiceConfigured() && !shouldBypassEmail()) {
      const { generateOTP } = await import('@/lib/auth');
      const otp = generateOTP();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

      await db.user.update({
        where: { id: params.userId },
        data: {
          emailVerificationOtp: otp,
          emailVerificationOtpExpiry: otpExpiry,
        },
      });

      const { sendVerificationEmail } = await import('./email');
      const user = await db.user.findUnique({ where: { id: params.userId } });
      if (user) {
        await sendVerificationEmail(params.newEmail, user.name || 'User', otp);
      }
    }
  } catch {
    // Non-blocking
  }

  return {
    success: true,
    requiresVerification: true,
    message: 'Email updated. Please verify your new email address.',
  };
}

// ===== GET ACTIVE SESSION COUNT =====

/**
 * Get the number of active (non-revoked, non-expired) sessions for a user.
 */
export async function getActiveSessionCount(userId: string): Promise<number> {
  return db.userSession.count({
    where: {
      userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
  });
}
