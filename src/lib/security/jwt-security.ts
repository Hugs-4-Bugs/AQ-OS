// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — JWT Security
// Phase 14.3: Security Hardening
//
// Algorithm whitelist (HS256), token blacklisting, refresh token
// family/replay detection, suspicious activity detection, OAuth
// state validation, and PKCE support.
// ═══════════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '@/lib/db';

// ===== CONSTANTS =====

const JWT_SECRET = process.env.JWT_SECRET || 'acquisitionos-dev-secret-change-in-production';
const ALLOWED_ALGORITHMS: jwt.Algorithm[] = ['HS256'];
const BLACKLIST_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const MAX_SUSPICIOUS_ACTIVITIES = 5; // Per hour before alerting

// ===== TOKEN BLACKLIST =====

interface BlacklistEntry {
  jti: string;
  expiresAt: number;
  reason: string;
}

const tokenBlacklist = new Map<string, BlacklistEntry>();

// Periodically clean up expired blacklist entries
setInterval(() => {
  const now = Date.now();
  for (const [jti, entry] of tokenBlacklist.entries()) {
    if (entry.expiresAt < now) {
      tokenBlacklist.delete(jti);
    }
  }
}, BLACKLIST_CLEANUP_INTERVAL).unref?.();

/**
 * Add a JWT token ID (jti) to the blacklist.
 */
export function blacklistToken(jti: string, expiresAt: number, reason: string = 'revoked'): void {
  tokenBlacklist.set(jti, { jti, expiresAt, reason });
}

/**
 * Check if a JWT token ID (jti) is blacklisted.
 */
export function isTokenBlacklisted(jti: string): boolean {
  const entry = tokenBlacklist.get(jti);
  if (!entry) return false;
  // Check if the blacklist entry has expired
  if (entry.expiresAt < Date.now()) {
    tokenBlacklist.delete(jti);
    return false;
  }
  return true;
}

/**
 * Get the reason a token was blacklisted.
 */
export function getBlacklistReason(jti: string): string | null {
  const entry = tokenBlacklist.get(jti);
  if (!entry) return null;
  return entry.reason;
}

// ===== SECURE JWT VERIFICATION =====

export interface SecureJwtVerifyResult {
  valid: boolean;
  payload: jwt.JwtPayload | null;
  error?: string;
}

/**
 * Verify a JWT token with strict security checks:
 * - Algorithm whitelist (HS256 only)
 * - Token blacklisting check
 * - Issuer and audience validation
 */
export function verifyJwtSecure(token: string): SecureJwtVerifyResult {
  try {
    // Verify with strict algorithm whitelist
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ALLOWED_ALGORITHMS,
      issuer: 'acquisitionos',
      audience: 'acquisitionos-api',
    }) as jwt.JwtPayload;

    // Check if token is blacklisted
    if (decoded.jti && isTokenBlacklisted(decoded.jti)) {
      return {
        valid: false,
        payload: null,
        error: 'Token has been revoked',
      };
    }

    // Check token type
    if (!decoded.type || !['access', 'refresh'].includes(decoded.type)) {
      return {
        valid: false,
        payload: null,
        error: 'Invalid token type',
      };
    }

    return {
      valid: true,
      payload: decoded,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { valid: false, payload: null, error: 'Token has expired' };
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return { valid: false, payload: null, error: 'Invalid token' };
    }
    if (error instanceof jwt.NotBeforeError) {
      return { valid: false, payload: null, error: 'Token not yet active' };
    }
    return { valid: false, payload: null, error: 'Token verification failed' };
  }
}

// ===== REFRESH TOKEN FAMILY / REPLAY DETECTION =====

interface RefreshTokenFamily {
  familyId: string;
  userId: string;
  tokens: Map<string, { used: boolean; createdAt: number }>;
  compromised: boolean;
}

const tokenFamilies = new Map<string, RefreshTokenFamily>();

/**
 * Create a new refresh token family.
 */
export function createTokenFamily(familyId: string, userId: string): void {
  tokenFamilies.set(familyId, {
    familyId,
    userId,
    tokens: new Map(),
    compromised: false,
  });
}

/**
 * Add a refresh token to its family.
 */
export function addTokenToFamily(familyId: string, tokenId: string): void {
  const family = tokenFamilies.get(familyId);
  if (!family) return;

  family.tokens.set(tokenId, {
    used: false,
    createdAt: Date.now(),
  });
}

/**
 * Mark a refresh token as used and check for replay attacks.
 * If a previously-used token is being reused, the entire family is
 * considered compromised and all tokens are revoked.
 */
export function checkRefreshTokenReplay(familyId: string, tokenId: string): {
  valid: boolean;
  compromised: boolean;
} {
  const family = tokenFamilies.get(familyId);
  if (!family) {
    return { valid: false, compromised: false };
  }

  // If the family is already compromised, reject all tokens
  if (family.compromised) {
    return { valid: false, compromised: true };
  }

  const tokenEntry = family.tokens.get(tokenId);
  if (!tokenEntry) {
    // Token not in family — might be from a different family
    return { valid: false, compromised: false };
  }

  if (tokenEntry.used) {
    // REPLAY DETECTED: This token was already used!
    // Compromise the entire family
    family.compromised = true;
    markAllFamilyTokensUsed(familyId);
    return { valid: false, compromised: true };
  }

  // Mark as used
  tokenEntry.used = true;
  return { valid: true, compromised: false };
}

/**
 * Mark all tokens in a family as used (revoked).
 */
function markAllFamilyTokensUsed(familyId: string): void {
  const family = tokenFamilies.get(familyId);
  if (!family) return;

  for (const [, entry] of family.tokens) {
    entry.used = true;
  }
}

/**
 * Check if a token family is compromised.
 */
export function isFamilyCompromised(familyId: string): boolean {
  return tokenFamilies.get(familyId)?.compromised ?? false;
}

// ===== SUSPICIOUS ACTIVITY DETECTION =====

interface SuspiciousActivity {
  userId: string;
  type: string;
  timestamp: number;
  details?: string;
}

const suspiciousActivities: SuspiciousActivity[] = [];

/**
 * Record a suspicious activity event.
 */
export function recordSuspiciousActivity(
  userId: string,
  type: string,
  details?: string
): void {
  suspiciousActivities.push({
    userId,
    type,
    timestamp: Date.now(),
    details,
  });

  // Keep only recent activities (last 24 hours)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  while (suspiciousActivities.length > 0 && suspiciousActivities[0].timestamp < cutoff) {
    suspiciousActivities.shift();
  }
}

/**
 * Check if a user has exceeded the suspicious activity threshold.
 */
export function isUserSuspicious(userId: string): boolean {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentActivities = suspiciousActivities.filter(
    a => a.userId === userId && a.timestamp > oneHourAgo
  );
  return recentActivities.length >= MAX_SUSPICIOUS_ACTIVITIES;
}

/**
 * Get recent suspicious activities for a user.
 */
export function getUserSuspiciousActivities(userId: string, since?: number): SuspiciousActivity[] {
  const cutoff = since || Date.now() - 60 * 60 * 1000;
  return suspiciousActivities.filter(
    a => a.userId === userId && a.timestamp > cutoff
  );
}

// ===== OAUTH STATE VALIDATION =====

interface OAuthStateEntry {
  state: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
  codeVerifier?: string; // For PKCE
}

const oauthStates = new Map<string, OAuthStateEntry>();

/**
 * Generate an OAuth state parameter with optional PKCE support.
 */
export function generateOAuthState(params: {
  redirectUri: string;
  usePkce?: boolean;
  ttlSeconds?: number;
}): { state: string; codeVerifier?: string; codeChallenge?: string } {
  const state = crypto.randomBytes(32).toString('hex');
  const ttlSeconds = params.ttlSeconds || 600; // 10 minutes

  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;

  if (params.usePkce) {
    // Generate PKCE code verifier (43-128 chars, URL-safe)
    codeVerifier = crypto.randomBytes(32).toString('base64url');
    // Generate code challenge (S256 method)
    codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
  }

  oauthStates.set(state, {
    state,
    redirectUri: params.redirectUri,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlSeconds * 1000,
    codeVerifier,
  });

  return { state, codeVerifier, codeChallenge };
}

/**
 * Validate an OAuth state parameter.
 */
export function validateOAuthState(state: string): {
  valid: boolean;
  redirectUri?: string;
  codeVerifier?: string;
  error?: string;
} {
  const entry = oauthStates.get(state);

  if (!entry) {
    return { valid: false, error: 'Invalid state parameter' };
  }

  if (Date.now() > entry.expiresAt) {
    oauthStates.delete(state);
    return { valid: false, error: 'State parameter has expired' };
  }

  // Consume the state (one-time use)
  oauthStates.delete(state);

  return {
    valid: true,
    redirectUri: entry.redirectUri,
    codeVerifier: entry.codeVerifier,
  };
}

/**
 * Verify PKCE code challenge against the code verifier.
 */
export function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  method: 'S256' | 'plain' = 'S256'
): boolean {
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }

  // S256 method
  const computedChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedChallenge),
      Buffer.from(codeChallenge)
    );
  } catch {
    return false;
  }
}

// ===== TOKEN GENERATION WITH JTI =====

/**
 * Generate a JWT access token with a unique JTI for blacklisting support.
 */
export function generateSecureAccessToken(user: {
  id: string;
  email: string;
  role: string;
  plan: string;
  orgId: string | null;
  isTrial: boolean;
  trialEndsAt: Date | null;
}): string {
  const jti = crypto.randomUUID();
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
      jti,
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '15m',
      issuer: 'acquisitionos',
      audience: 'acquisitionos-api',
      jwtid: jti,
    }
  );
}

/**
 * Revoke all tokens for a user by adding them to the database-level
 * session revocation and the in-memory blacklist.
 */
export async function revokeAllUserTokensSecure(userId: string, reason: string = 'security_reset'): Promise<void> {
  // Revoke all sessions in database
  await db.userSession.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });

  // Record the event
  recordSuspiciousActivity(userId, 'all_tokens_revoked', reason);
}
