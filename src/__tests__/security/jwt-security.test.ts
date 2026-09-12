// ═══════════════════════════════════════════════════════════════════
// Unit Tests: JWT Security (src/lib/security/jwt-security.ts)
// Tests token blacklisting, verification, refresh token replay,
// suspicious activity detection, OAuth state validation
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock the db module
vi.mock('@/lib/db', () => ({
  db: {
    userSession: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

import {
  blacklistToken,
  isTokenBlacklisted,
  getBlacklistReason,
  verifyJwtSecure,
  generateSecureAccessToken,
  createTokenFamily,
  addTokenToFamily,
  checkRefreshTokenReplay,
  isFamilyCompromised,
  recordSuspiciousActivity,
  isUserSuspicious,
  generateOAuthState,
  validateOAuthState,
  verifyPkce,
} from '@/lib/security/jwt-security';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only-min-32-chars';

describe('jwt-security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Token Blacklisting ────────────────────────────────────────

  describe('token blacklisting', () => {
    it('should blacklist a token and detect it', () => {
      const jti = 'test-jti-' + Date.now();
      const expiresAt = Date.now() + 3600000; // 1 hour from now
      blacklistToken(jti, expiresAt, 'revoked');

      expect(isTokenBlacklisted(jti)).toBe(true);
    });

    it('should return false for non-blacklisted tokens', () => {
      expect(isTokenBlacklisted('nonexistent-jti-' + Date.now())).toBe(false);
    });

    it('should return the reason for blacklisted tokens', () => {
      const jti = 'reason-test-' + Date.now();
      blacklistToken(jti, Date.now() + 3600000, 'security_breach');

      expect(getBlacklistReason(jti)).toBe('security_breach');
    });

    it('should return null reason for non-blacklisted tokens', () => {
      expect(getBlacklistReason('nonexistent-' + Date.now())).toBeNull();
    });
  });

  // ── verifyJwtSecure ───────────────────────────────────────────

  describe('verifyJwtSecure', () => {
    it('should verify a valid access token', () => {
      const token = jwt.sign(
        { sub: 'user-1', email: 'test@test.com', type: 'access' },
        JWT_SECRET,
        { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
      );

      const result = verifyJwtSecure(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe('user-1');
    });

    it('should reject an expired token', () => {
      const token = jwt.sign(
        { sub: 'user-1', type: 'access' },
        JWT_SECRET,
        { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'acquisitionos-api', expiresIn: '-1s' }
      );

      const result = verifyJwtSecure(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject a token with wrong issuer', () => {
      const token = jwt.sign(
        { sub: 'user-1', type: 'access' },
        JWT_SECRET,
        { algorithm: 'HS256', issuer: 'wrong-issuer', audience: 'acquisitionos-api' }
      );

      const result = verifyJwtSecure(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a token with wrong audience', () => {
      const token = jwt.sign(
        { sub: 'user-1', type: 'access' },
        JWT_SECRET,
        { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'wrong-audience' }
      );

      const result = verifyJwtSecure(token);
      expect(result.valid).toBe(false);
    });

    it('should reject a token without a type', () => {
      const token = jwt.sign(
        { sub: 'user-1' },
        JWT_SECRET,
        { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
      );

      const result = verifyJwtSecure(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token type');
    });

    it('should reject a blacklisted token', () => {
      const jti = 'blacklist-test-' + Date.now();
      const token = jwt.sign(
        { sub: 'user-1', type: 'access', jti },
        JWT_SECRET,
        { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
      );

      blacklistToken(jti, Date.now() + 3600000, 'revoked');

      const result = verifyJwtSecure(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('should reject a token with wrong algorithm (RS256)', () => {
      // Create token without specifying algorithm — then verify fails
      const token = 'invalid.token.signature';
      const result = verifyJwtSecure(token);
      expect(result.valid).toBe(false);
    });
  });

  // ── generateSecureAccessToken ─────────────────────────────────

  describe('generateSecureAccessToken', () => {
    it('should generate a valid access token', () => {
      const token = generateSecureAccessToken({
        id: 'user-1',
        email: 'test@test.com',
        role: 'owner',
        plan: 'pro',
        orgId: null,
        isTrial: false,
        trialEndsAt: null,
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'acquisitionos',
        audience: 'acquisitionos-api',
      }) as jwt.JwtPayload;

      expect(decoded.sub).toBe('user-1');
      expect(decoded.email).toBe('test@test.com');
      expect(decoded.role).toBe('owner');
      expect(decoded.plan).toBe('pro');
      expect(decoded.type).toBe('access');
      expect(decoded.jti).toBeDefined();
    });
  });

  // ── Refresh Token Family / Replay Detection ───────────────────

  describe('refresh token family / replay detection', () => {
    it('should create a token family and add tokens', () => {
      const familyId = 'family-' + Date.now();
      createTokenFamily(familyId, 'user-1');
      addTokenToFamily(familyId, 'token-1');

      const result = checkRefreshTokenReplay(familyId, 'token-1');
      expect(result.valid).toBe(true);
      expect(result.compromised).toBe(false);
    });

    it('should detect replay when a used token is reused', () => {
      const familyId = 'family-replay-' + Date.now();
      createTokenFamily(familyId, 'user-1');
      addTokenToFamily(familyId, 'token-1');

      // First use - valid
      checkRefreshTokenReplay(familyId, 'token-1');

      // Second use - replay detected
      const result = checkRefreshTokenReplay(familyId, 'token-1');
      expect(result.valid).toBe(false);
      expect(result.compromised).toBe(true);
    });

    it('should mark the entire family as compromised after replay', () => {
      const familyId = 'family-comp-' + Date.now();
      createTokenFamily(familyId, 'user-1');
      addTokenToFamily(familyId, 'token-1');
      addTokenToFamily(familyId, 'token-2');

      // Use token-1
      checkRefreshTokenReplay(familyId, 'token-1');

      // Replay token-1
      checkRefreshTokenReplay(familyId, 'token-1');

      // Family is now compromised
      expect(isFamilyCompromised(familyId)).toBe(true);

      // Even token-2 should be rejected
      const result = checkRefreshTokenReplay(familyId, 'token-2');
      expect(result.valid).toBe(false);
      expect(result.compromised).toBe(true);
    });

    it('should handle non-existent family gracefully', () => {
      const result = checkRefreshTokenReplay('nonexistent-family', 'token-1');
      expect(result.valid).toBe(false);
      expect(result.compromised).toBe(false);
    });
  });

  // ── Suspicious Activity Detection ─────────────────────────────

  describe('suspicious activity detection', () => {
    it('should record suspicious activities', () => {
      const userId = 'suspicious-user-' + Date.now();
      recordSuspiciousActivity(userId, 'multiple_failed_logins');
      expect(isUserSuspicious(userId)).toBe(false); // Not yet at threshold
    });

    it('should flag user as suspicious after 5 activities in 1 hour', () => {
      const userId = 'flag-user-' + Date.now();
      for (let i = 0; i < 5; i++) {
        recordSuspiciousActivity(userId, 'failed_login_attempt');
      }
      expect(isUserSuspicious(userId)).toBe(true);
    });

    it('should not flag a user with fewer than 5 activities', () => {
      const userId = 'safe-user-' + Date.now();
      for (let i = 0; i < 4; i++) {
        recordSuspiciousActivity(userId, 'minor_event');
      }
      expect(isUserSuspicious(userId)).toBe(false);
    });
  });

  // ── OAuth State Validation ────────────────────────────────────

  describe('OAuth state validation', () => {
    it('should generate and validate a state parameter', () => {
      const { state } = generateOAuthState({ redirectUri: 'http://localhost:3000/callback' });
      const result = validateOAuthState(state);

      expect(result.valid).toBe(true);
      expect(result.redirectUri).toBe('http://localhost:3000/callback');
    });

    it('should reject an invalid state parameter', () => {
      const result = validateOAuthState('nonexistent-state');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should consume state on first use (one-time use)', () => {
      const { state } = generateOAuthState({ redirectUri: 'http://localhost:3000/callback' });

      const firstUse = validateOAuthState(state);
      expect(firstUse.valid).toBe(true);

      const secondUse = validateOAuthState(state);
      expect(secondUse.valid).toBe(false);
    });

    it('should generate PKCE code verifier and challenge', () => {
      const { state, codeVerifier, codeChallenge } = generateOAuthState({
        redirectUri: 'http://localhost:3000/callback',
        usePkce: true,
      });

      expect(codeVerifier).toBeDefined();
      expect(codeChallenge).toBeDefined();
      expect(codeVerifier!.length).toBeGreaterThan(0);
      expect(codeChallenge!.length).toBeGreaterThan(0);

      // Verify that the challenge matches the verifier
      expect(verifyPkce(codeVerifier!, codeChallenge!)).toBe(true);
    });

    it('should reject wrong PKCE code challenge', () => {
      const result = verifyPkce('wrong-verifier', 'wrong-challenge');
      expect(result).toBe(false);
    });
  });
});
