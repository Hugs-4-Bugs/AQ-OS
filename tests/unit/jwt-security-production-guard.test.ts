// SECURITY-001: Production guard for jwt-security.ts dev fallback JWT secret.
//
// These tests verify that:
//   1. Production + missing all supported secrets → signing THROWS (not soft-fail).
//   2. Production + missing all supported secrets → verification THROWS (not soft-fail).
//   3. Production + dev fallback explicitly configured → rejected.
//   4. Production + valid JWT_SECRET → signing and verification work.
//   5. Production + valid alternative secret (AUTH_SECRET/NEXTAUTH_SECRET) → works.
//   6. Development + no configured secret → existing fallback behavior works.
//   7. Development + configured secret → works.
//   8. Invalid token → existing invalid-token behavior intact (no guard interference).
//   9. Guard error is NOT swallowed by verifyJwtSecure's catch block.
//
// Module-level constants (JWT_SECRET, DEV_FALLBACK) are resolved at import time,
// so each test uses vi.resetModules() + vi.stubEnv() + dynamic import() to get
// a fresh module evaluation with the correct environment.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock db — jwt-security.ts imports @/lib/db for revokeAllUserTokensSecure.
vi.mock('@/lib/db', () => ({
  db: {
    userSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

const DEV_FALLBACK = 'acquisitionos-dev-secret-change-in-production';
const VALID_PROD_SECRET = 'a-real-production-secret-that-is-long-enough-32chars';

/** Dynamic import helper: resets modules, stubs env, then imports jwt-security fresh. */
async function importFresh(
  env: Record<string, string | undefined>,
): Promise<typeof import('@/lib/security/jwt-security')> {
  vi.resetModules();
  // Clear all secret-related env vars first.
  vi.stubEnv('JWT_SECRET', '');
  vi.stubEnv('AUTH_SECRET', '');
  vi.stubEnv('NEXTAUTH_SECRET', '');
  // Apply the requested env.
  for (const [k, v] of Object.entries(env)) {
    vi.stubEnv(k, v ?? '');
  }
  return await import('@/lib/security/jwt-security');
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  // Restore env to test defaults (vitest.setup.ts sets JWT_SECRET).
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('SECURITY-001: Production guard — signing (generateSecureAccessToken)', () => {
  it('1. Production + missing all secrets → signing THROWS', async () => {
    const mod = await importFresh({ NODE_ENV: 'production' });
    expect(() =>
      mod.generateSecureAccessToken({
        id: 'u1', email: 't@t.com', role: 'owner', plan: 'pro',
        orgId: null, isTrial: false, trialEndsAt: null,
      }),
    ).toThrow(/FATAL.*JWT_SECRET/);
  });

  it('3a. Production + dev fallback explicitly as JWT_SECRET → THROWS', async () => {
    const mod = await importFresh({ NODE_ENV: 'production', JWT_SECRET: DEV_FALLBACK });
    expect(() =>
      mod.generateSecureAccessToken({
        id: 'u1', email: 't@t.com', role: 'owner', plan: 'pro',
        orgId: null, isTrial: false, trialEndsAt: null,
      }),
    ).toThrow(/FATAL.*JWT_SECRET/);
  });

  it('4a. Production + valid JWT_SECRET → signing works', async () => {
    const mod = await importFresh({ NODE_ENV: 'production', JWT_SECRET: VALID_PROD_SECRET });
    const token = mod.generateSecureAccessToken({
      id: 'u1', email: 't@t.com', role: 'owner', plan: 'pro',
      orgId: null, isTrial: false, trialEndsAt: null,
    });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('5a. Production + AUTH_SECRET (not JWT_SECRET) → signing works', async () => {
    const mod = await importFresh({ NODE_ENV: 'production', AUTH_SECRET: VALID_PROD_SECRET });
    const token = mod.generateSecureAccessToken({
      id: 'u1', email: 't@t.com', role: 'owner', plan: 'pro',
      orgId: null, isTrial: false, trialEndsAt: null,
    });
    expect(typeof token).toBe('string');
    // Verify the token was signed with AUTH_SECRET, not the dev fallback.
    const decoded = jwt.verify(token, VALID_PROD_SECRET, {
      issuer: 'acquisitionos', audience: 'acquisitionos-api',
    }) as jwt.JwtPayload;
    expect(decoded.sub).toBe('u1');
  });

  it('5b. Production + NEXTAUTH_SECRET (not JWT_SECRET/AUTH_SECRET) → signing works', async () => {
    const mod = await importFresh({ NODE_ENV: 'production', NEXTAUTH_SECRET: VALID_PROD_SECRET });
    const token = mod.generateSecureAccessToken({
      id: 'u1', email: 't@t.com', role: 'owner', plan: 'pro',
      orgId: null, isTrial: false, trialEndsAt: null,
    });
    expect(typeof token).toBe('string');
    const decoded = jwt.verify(token, VALID_PROD_SECRET, {
      issuer: 'acquisitionos', audience: 'acquisitionos-api',
    }) as jwt.JwtPayload;
    expect(decoded.sub).toBe('u1');
  });

  it('6a. Development + no configured secret → fallback works', async () => {
    const mod = await importFresh({ NODE_ENV: 'development' });
    const token = mod.generateSecureAccessToken({
      id: 'u1', email: 't@t.com', role: 'owner', plan: 'pro',
      orgId: null, isTrial: false, trialEndsAt: null,
    });
    expect(typeof token).toBe('string');
    // Verify with the dev fallback to confirm it was used.
    const decoded = jwt.verify(token, DEV_FALLBACK, {
      issuer: 'acquisitionos', audience: 'acquisitionos-api',
    }) as jwt.JwtPayload;
    expect(decoded.sub).toBe('u1');
  });

  it('7a. Development + configured secret → works', async () => {
    const mod = await importFresh({ NODE_ENV: 'development', JWT_SECRET: VALID_PROD_SECRET });
    const token = mod.generateSecureAccessToken({
      id: 'u1', email: 't@t.com', role: 'owner', plan: 'pro',
      orgId: null, isTrial: false, trialEndsAt: null,
    });
    const decoded = jwt.verify(token, VALID_PROD_SECRET, {
      issuer: 'acquisitionos', audience: 'acquisitionos-api',
    }) as jwt.JwtPayload;
    expect(decoded.sub).toBe('u1');
  });
});

describe('SECURITY-001: Production guard — verification (verifyJwtSecure)', () => {
  it('2. Production + missing all secrets → verification THROWS (not soft-fail)', async () => {
    const mod = await importFresh({ NODE_ENV: 'production' });
    // A token signed with the dev fallback — in production this must THROW,
    // not return { valid: false }.
    const token = jwt.sign(
      { sub: 'u1', type: 'access' },
      DEV_FALLBACK,
      { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'acquisitionos-api' },
    );
    expect(() => mod.verifyJwtSecure(token)).toThrow(/FATAL.*JWT_SECRET/);
  });

  it('3b. Production + dev fallback explicitly as JWT_SECRET → verification THROWS', async () => {
    const mod = await importFresh({ NODE_ENV: 'production', JWT_SECRET: DEV_FALLBACK });
    const token = jwt.sign(
      { sub: 'u1', type: 'access' },
      DEV_FALLBACK,
      { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'acquisitionos-api' },
    );
    expect(() => mod.verifyJwtSecure(token)).toThrow(/FATAL.*JWT_SECRET/);
  });

  it('4b. Production + valid JWT_SECRET → verification works', async () => {
    const mod = await importFresh({ NODE_ENV: 'production', JWT_SECRET: VALID_PROD_SECRET });
    const token = jwt.sign(
      { sub: 'u1', type: 'access' },
      VALID_PROD_SECRET,
      { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'acquisitionos-api' },
    );
    const result = mod.verifyJwtSecure(token);
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe('u1');
  });

  it('5c. Production + AUTH_SECRET → verification works', async () => {
    const mod = await importFresh({ NODE_ENV: 'production', AUTH_SECRET: VALID_PROD_SECRET });
    const token = jwt.sign(
      { sub: 'u1', type: 'access' },
      VALID_PROD_SECRET,
      { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'acquisitionos-api' },
    );
    const result = mod.verifyJwtSecure(token);
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe('u1');
  });

  it('6b. Development + no configured secret → verification works (fallback)', async () => {
    const mod = await importFresh({ NODE_ENV: 'development' });
    const token = jwt.sign(
      { sub: 'u1', type: 'access' },
      DEV_FALLBACK,
      { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'acquisitionos-api' },
    );
    const result = mod.verifyJwtSecure(token);
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe('u1');
  });

  it('7b. Development + configured secret → verification works', async () => {
    const mod = await importFresh({ NODE_ENV: 'development', JWT_SECRET: VALID_PROD_SECRET });
    const token = jwt.sign(
      { sub: 'u1', type: 'access' },
      VALID_PROD_SECRET,
      { algorithm: 'HS256', issuer: 'acquisitionos', audience: 'acquisitionos-api' },
    );
    const result = mod.verifyJwtSecure(token);
    expect(result.valid).toBe(true);
  });

  it('8. Development + invalid token → existing invalid-token behavior intact', async () => {
    const mod = await importFresh({ NODE_ENV: 'development', JWT_SECRET: VALID_PROD_SECRET });
    const result = mod.verifyJwtSecure('invalid.token.string');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('9. Guard error is NOT swallowed — verifyJwtSecure throws, not returns', async () => {
    // This is the critical test: the guard must throw OUTSIDE the try/catch
    // so it is NOT converted into { valid: false, error: '...' }.
    const mod = await importFresh({ NODE_ENV: 'production' });
    let threw = false;
    let returned = false;
    try {
      const result = mod.verifyJwtSecure('any-token-string');
      // If we get here, the guard did NOT throw — it was swallowed.
      returned = true;
      // Even if the result says invalid, this is a FAIL because the guard
      // should have thrown, not returned.
      expect(result.valid).toBe(false); // This will pass but we want the throw
    } catch (e) {
      threw = true;
      expect((e as Error).message).toMatch(/FATAL.*JWT_SECRET/);
    }
    expect(threw).toBe(true);
    expect(returned).toBe(false);
  });
});
