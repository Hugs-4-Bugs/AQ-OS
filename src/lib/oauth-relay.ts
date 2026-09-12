/**
 * Cross-Domain OAuth Relay — Short-lived signed JWT tokens
 *
 * When the app is deployed across multiple domains (e.g., preview domain
 * and production domain), Google OAuth can only redirect to ONE registered
 * redirect_uri. After auth completes on that canonical domain, we need to
 * relay the session back to the domain the user originally came from.
 *
 * Flow:
 * 1. User on domain A clicks "Sign in with Google"
 * 2. OAuth redirects to Google → Google redirects to canonical redirect_uri (domain B)
 * 3. Domain B exchanges code for tokens, creates session
 * 4. Domain B signs a short-lived JWT containing the tokens + origin (domain A)
 * 5. Domain B redirects to domain A's /api/auth/google/relay?token=<jwt>
 * 6. Domain A verifies the JWT, extracts tokens, sets cookies, redirects to /
 *
 * Security:
 * - JWT is signed with JWT_SECRET (same across all instances)
 * - JWT expires in 60 seconds
 * - JWT includes a nonce to prevent replay (stored in DB-checked set)
 * - The redirect happens immediately, so the token URL is replaced in history
 */

import jwt from 'jsonwebtoken';

const RELAY_SECRET = process.env.JWT_SECRET || process.env.RELAY_SECRET || 'acquisitionos-relay-dev-secret';
const RELAY_EXPIRY_SECONDS = 60;

export interface RelayTokenPayload {
  /** Type marker to distinguish from other JWTs */
  type: 'google_oauth_relay';
  /** The access token to set as a cookie */
  accessToken: string;
  /** The refresh token to set as a cookie */
  refreshToken: string;
  /** The origin domain that initiated the auth (for verification) */
  origin: string;
  /** Nonce for replay protection */
  nonce: string;
  /** When the token was issued */
  iat: number;
  /** When the token expires */
  exp: number;
}

/**
 * Create a short-lived signed JWT containing the auth tokens for relay.
 */
export function createRelayToken(
  accessToken: string,
  refreshToken: string,
  origin: string
): string {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return jwt.sign(
    {
      type: 'google_oauth_relay',
      accessToken,
      refreshToken,
      origin,
      nonce,
    },
    RELAY_SECRET,
    { expiresIn: RELAY_EXPIRY_SECONDS }
  );
}

/**
 * Verify a relay token and extract the payload.
 * Returns null if the token is invalid, expired, or has the wrong type.
 */
export function verifyRelayToken(token: string): RelayTokenPayload | null {
  try {
    const decoded = jwt.verify(token, RELAY_SECRET) as Record<string, unknown>;
    if (decoded.type !== 'google_oauth_relay') {
      console.error('[Relay] Invalid token type:', decoded.type);
      return null;
    }
    if (!decoded.accessToken || !decoded.refreshToken) {
      console.error('[Relay] Token missing required fields');
      return null;
    }
    return {
      type: 'google_oauth_relay',
      accessToken: decoded.accessToken as string,
      refreshToken: decoded.refreshToken as string,
      origin: decoded.origin as string,
      nonce: decoded.nonce as string,
      iat: decoded.iat as number,
      exp: decoded.exp as number,
    };
  } catch (err) {
    console.error('[Relay] Token verification failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Check if two URLs are on the same origin (scheme + host + port).
 */
export function isSameOrigin(url1: string, url2: string): boolean {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    return u1.origin === u2.origin;
  } catch {
    return false;
  }
}
