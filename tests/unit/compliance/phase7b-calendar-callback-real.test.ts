// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 7B Real Calendar Callback Route Tests
//
// Route-level tests for /api/calendar/callback that exercise the actual
// successful OAuth persistence path AND every documented failure path.
//
// These tests use controlled mocks for exchangeCodeForTokens and
// getGoogleUserInfo, real database persistence (isolated per-worker
// SQLite), and behavioral assertions — NOT source-text inspection.
//
// Coverage (18 scenarios):
//   SUCCESS PATH:
//     1.  Valid Calendar-flow state is accepted.
//     2.  User identity comes from the signed state (not Google email).
//     3.  OAuth code exchange uses /api/calendar/callback redirect URI.
//     4.  Calendar scopes are validated.
//     5.  Third-party integration consent is checked before persistence.
//     6.  Google account information is retrieved successfully.
//     7.  Calendar token CREATE path persists encrypted credentials.
//     8.  Calendar token UPDATE path persists encrypted credentials.
//     9.  No EmailAccount is created by Calendar-only OAuth.
//     10. No gmailConnected flag or gmailEmail is activated.
//     11. Audit event is recorded only after successful connection.
//   FAILURE PATHS (no token persistence):
//     12. Invalid state → no persistence.
//     13. Wrong flow → no persistence.
//     14. Missing Calendar scope → no persistence.
//     15. Withdrawn consent → no persistence.
//     16. Google user-info failure → no persistence.
//     17. Token exchange failure → no persistence.
//     18. Database failure → no successful connection reported.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { encrypt, decrypt, isEncrypted } from '@/lib/encryption';
import { createSecureState, _resetConsumedNonces } from '@/lib/security/oauth-state';
import {
  getDefaultConsentState,
  applyConsentChange,
  serializeConsentData,
  deserializeConsentData,
} from '@/lib/compliance/consent-contract';

// ── Mocks for Google OAuth helpers ──────────────────────────────────
//
// We mock ONLY exchangeCodeForTokens and getGoogleUserInfo from
// @/lib/google-oauth. Everything else (createSecureState, validateSecureState,
// db, encryption, consent-enforcement) runs against real code so the test
// exercises the actual route behavior.

vi.mock('@/lib/google-oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/google-oauth')>();
  return {
    ...actual,
    exchangeCodeForTokens: vi.fn(),
    getGoogleUserInfo: vi.fn(),
  };
});

// Import the mocked functions (typed) for per-test configuration.
import { exchangeCodeForTokens, getGoogleUserInfo } from '@/lib/google-oauth';
const mockedExchange = exchangeCodeForTokens as unknown as ReturnType<typeof vi.fn>;
const mockedUserInfo = getGoogleUserInfo as unknown as ReturnType<typeof vi.fn>;

// ── Test fixtures ───────────────────────────────────────────────────

const PLAINTEXT_ACCESS_TOKEN = 'ya29.test-access-token-plaintext-abcdef123456';
const PLAINTEXT_REFRESH_TOKEN = '1//test-refresh-token-plaintext-ghijkl789012';
const CALENDAR_SCOPES = 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events';
const GOOGLE_EMAIL = 'test.google.account@example.com';

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

function makeTokenData(overrides: Partial<TokenData> = {}): TokenData {
  return {
    access_token: PLAINTEXT_ACCESS_TOKEN,
    refresh_token: PLAINTEXT_REFRESH_TOKEN,
    expires_in: 3600,
    scope: CALENDAR_SCOPES,
    ...overrides,
  };
}

function makeUserInfo(overrides: Partial<{ sub: string; email: string; email_verified: boolean; name?: string }> = {}) {
  return {
    sub: 'google-sub-123',
    email: GOOGLE_EMAIL,
    email_verified: true,
    name: 'Test Google User',
    ...overrides,
  };
}

async function createTestUser(email?: string) {
  return db.user.create({
    data: {
      email: email || `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name: 'Test User',
      passwordHash: '$2a$12$testhash',
      plan: 'free',
      isActive: true,
      emailVerified: true,
    },
  });
}

async function grantConsent(userId: string) {
  const settings = await db.userSettings.findUnique({ where: { userId } });
  const { state, history } = settings
    ? deserializeConsentData(settings.notificationPreferences)
    : { state: getDefaultConsentState(), history: [] as never[] };
  const { newState, historyEntry } = applyConsentChange(state, 'third_party_integrations', 'grant', 'api');
  const newHistory = [...history, historyEntry];
  if (settings) {
    await db.userSettings.update({
      where: { userId },
      data: { notificationPreferences: serializeConsentData(newState, newHistory) },
    });
  } else {
    await db.userSettings.create({
      data: { userId, notificationPreferences: serializeConsentData(newState, newHistory) },
    });
  }
}

async function withdrawConsent(userId: string) {
  // First grant, then withdraw — so consent state exists but is withdrawn.
  await grantConsent(userId);
  const settings = await db.userSettings.findUnique({ where: { userId } });
  if (!settings) return;
  const { state, history } = deserializeConsentData(settings.notificationPreferences);
  const { newState, historyEntry } = applyConsentChange(state, 'third_party_integrations', 'withdraw', 'api');
  const newHistory = [...history, historyEntry];
  await db.userSettings.update({
    where: { userId },
    data: { notificationPreferences: serializeConsentData(newState, newHistory) },
  });
}

function buildCallbackRequest(code: string, state: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/calendar/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    { method: 'GET' }
  );
}

// ── SUCCESS PATH TESTS ──────────────────────────────────────────────

describe('Phase 7B Real Calendar Callback — Success path', () => {
  let user: { id: string; email: string };

  beforeEach(async () => {
    _resetConsumedNonces();
    mockedExchange.mockReset();
    mockedUserInfo.mockReset();
    // Default successful mocks
    mockedExchange.mockResolvedValue(makeTokenData());
    mockedUserInfo.mockResolvedValue(makeUserInfo());

    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    await grantConsent(u.id);
    user = { id: u.id, email: u.email };
  });

  afterEach(async () => {
    await db.googleCalendarToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.emailAccount.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { action: 'oauth_state_consumed' } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    _resetConsumedNonces();
  });

  it('1. Valid Calendar-flow state is accepted and persists a Calendar token', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(user.id, 'google', 'calendar');
    const res = await GET(buildCallbackRequest('valid-code', state));

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('calendar_connected=true');

    // Token persisted
    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(1);
    expect(tokens[0].status).toBe('active');
    expect(tokens[0].isConnected).toBe(true);
  });

  it('2. User identity comes from the signed state, NOT the Google email', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    // Google returns a DIFFERENT email than the test user's app email
    mockedUserInfo.mockResolvedValue(makeUserInfo({ email: 'different.google.account@example.com' }));

    const state = createSecureState(user.id, 'google', 'calendar');
    await GET(buildCallbackRequest('valid-code', state));

    // The Calendar token must be saved against user.id (from signed state),
    // NOT against any user matching the Google email.
    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(1);
    expect(tokens[0].userId).toBe(user.id);
    expect(tokens[0].calendarEmail).toBe('different.google.account@example.com');

    // No new user should have been created with the Google email
    const googleEmailUser = await db.user.findUnique({ where: { email: 'different.google.account@example.com' } });
    expect(googleEmailUser).toBeNull();
  });

  it('3. OAuth code exchange uses /api/calendar/callback redirect URI', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(user.id, 'google', 'calendar');
    await GET(buildCallbackRequest('valid-code', state));

    expect(mockedExchange).toHaveBeenCalledTimes(1);
    const callArgs = mockedExchange.mock.calls[0];
    // Signature: exchangeCodeForTokens(code, origin, redirectUriPath)
    expect(callArgs[0]).toBe('valid-code');
    expect(callArgs[2]).toBe('/api/calendar/callback');
  });

  it('4. Calendar scopes are validated before persistence', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    // Mock returns scopes WITHOUT calendar
    mockedExchange.mockResolvedValue(makeTokenData({ scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly' }));

    const state = createSecureState(user.id, 'google', 'calendar');
    const res = await GET(buildCallbackRequest('valid-code', state));

    const location = res.headers.get('location') || '';
    expect(location).toContain('calendar_error');
    expect(location).toContain('Calendar');

    // No token persisted
    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);
  });

  it('5. Third-party integration consent is checked before persistence', async () => {
    // Withdraw consent that was granted in beforeEach
    await withdrawConsent(user.id);

    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(user.id, 'google', 'calendar');
    const res = await GET(buildCallbackRequest('valid-code', state));

    const location = res.headers.get('location') || '';
    expect(location).toContain('calendar_error');
    expect(location).toContain('consent');

    // No token persisted
    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);
  });

  it('6. Google account information is retrieved successfully', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(user.id, 'google', 'calendar');
    await GET(buildCallbackRequest('valid-code', state));

    expect(mockedUserInfo).toHaveBeenCalledTimes(1);
    // getGoogleUserInfo is called with the access token from tokenData
    expect(mockedUserInfo.mock.calls[0][0]).toBe(PLAINTEXT_ACCESS_TOKEN);
  });

  it('7. CREATE path persists ENCRYPTED credentials (no plaintext in DB)', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(user.id, 'google', 'calendar');
    await GET(buildCallbackRequest('valid-code', state));

    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(1);
    const stored = tokens[0];

    // CRITICAL: Stored tokens must be encrypted, not plaintext
    expect(stored.accessToken).not.toBe(PLAINTEXT_ACCESS_TOKEN);
    expect(isEncrypted(stored.accessToken)).toBe(true);
    expect(stored.refreshToken).not.toBe(PLAINTEXT_REFRESH_TOKEN);
    expect(isEncrypted(stored.refreshToken)).toBe(true);

    // Decryption returns the original plaintext values
    expect(decrypt(stored.accessToken)).toBe(PLAINTEXT_ACCESS_TOKEN);
    expect(decrypt(stored.refreshToken)).toBe(PLAINTEXT_REFRESH_TOKEN);

    // Plaintext credentials must NEVER appear in the stored record
    expect(stored.accessToken).not.toContain(PLAINTEXT_ACCESS_TOKEN);
    expect(stored.refreshToken).not.toContain(PLAINTEXT_REFRESH_TOKEN);
  });

  it('8. UPDATE path persists ENCRYPTED credentials and preserves refresh token', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');

    // First callback — creates the token
    const state1 = createSecureState(user.id, 'google', 'calendar');
    await GET(buildCallbackRequest('valid-code', state1));

    // Verify create happened
    const afterCreate = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(afterCreate.length).toBe(1);

    // Second callback — Google returns a NEW access token but NO refresh token
    // (common case: refresh tokens are only issued on first consent with prompt=consent)
    const NEW_ACCESS_TOKEN = 'ya29.new-access-token-second-callback-zzz';
    mockedExchange.mockResolvedValue(makeTokenData({
      access_token: NEW_ACCESS_TOKEN,
      refresh_token: undefined, // No new refresh token
    }));

    const state2 = createSecureState(user.id, 'google', 'calendar');
    await GET(buildCallbackRequest('valid-code-2', state2));

    // Verify update happened (still only one record, updated)
    const afterUpdate = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(afterUpdate.length).toBe(1);
    const stored = afterUpdate[0];

    // New access token is encrypted
    expect(stored.accessToken).not.toBe(NEW_ACCESS_TOKEN);
    expect(isEncrypted(stored.accessToken)).toBe(true);
    expect(decrypt(stored.accessToken)).toBe(NEW_ACCESS_TOKEN);

    // Existing refresh token is PRESERVED (still encrypted, still decrypts to original)
    expect(isEncrypted(stored.refreshToken)).toBe(true);
    expect(decrypt(stored.refreshToken)).toBe(PLAINTEXT_REFRESH_TOKEN);
  });

  it('9. No EmailAccount is created by Calendar-only OAuth', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(user.id, 'google', 'calendar');
    await GET(buildCallbackRequest('valid-code', state));

    const emailAccounts = await db.emailAccount.findMany({ where: { userId: user.id } });
    expect(emailAccounts.length).toBe(0);
  });

  it('10. No gmailConnected flag or gmailEmail is activated', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(user.id, 'google', 'calendar');
    await GET(buildCallbackRequest('valid-code', state));

    const settings = await db.userSettings.findUnique({ where: { userId: user.id } });
    expect(settings).toBeTruthy();
    expect(settings!.gmailConnected).toBe(false);
    expect(settings!.gmailEmail).toBeNull();
  });

  it('11. Audit event is recorded only after successful connection', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');

    // Count audit logs before
    const beforeCount = await db.auditLog.count({
      where: { userId: user.id, action: 'calendar_connected' },
    });
    expect(beforeCount).toBe(0);

    const state = createSecureState(user.id, 'google', 'calendar');
    await GET(buildCallbackRequest('valid-code', state));

    // After successful connection, audit event exists
    const auditEvents = await db.auditLog.findMany({
      where: { userId: user.id, action: 'calendar_connected' },
    });
    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].resource).toBe('calendar');
  });
});

// ── FAILURE PATH TESTS — no token persistence ──────────────────────

describe('Phase 7B Real Calendar Callback — Failure paths (no persistence)', () => {
  let user: { id: string; email: string };

  beforeEach(async () => {
    _resetConsumedNonces();
    mockedExchange.mockReset();
    mockedUserInfo.mockReset();
    mockedExchange.mockResolvedValue(makeTokenData());
    mockedUserInfo.mockResolvedValue(makeUserInfo());

    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    await grantConsent(u.id);
    user = { id: u.id, email: u.email };
  });

  afterEach(async () => {
    await db.googleCalendarToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.emailAccount.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { action: 'oauth_state_consumed' } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    _resetConsumedNonces();
  });

  it('12. Invalid state causes no token persistence', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const res = await GET(buildCallbackRequest('valid-code', 'invalid.tampered'));

    const location = res.headers.get('location') || '';
    expect(location).toContain('calendar_error');

    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);

    // No audit event for calendar_connected
    const auditEvents = await db.auditLog.findMany({
      where: { userId: user.id, action: 'calendar_connected' },
    });
    expect(auditEvents.length).toBe(0);
  });

  it('13. Wrong flow (integration state used for calendar) causes no token persistence', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    const integrationState = createSecureState(user.id, 'google', 'integration');
    const res = await GET(buildCallbackRequest('valid-code', integrationState));

    const location = res.headers.get('location') || '';
    expect(location).toContain('calendar_error');
    expect(location).toContain('mismatch');

    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);
  });

  it('14. Missing Calendar scope causes no token persistence', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    mockedExchange.mockResolvedValue(makeTokenData({
      scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
    }));

    const state = createSecureState(user.id, 'google', 'calendar');
    const res = await GET(buildCallbackRequest('valid-code', state));

    const location = res.headers.get('location') || '';
    expect(location).toContain('calendar_error');

    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);
  });

  it('15. Withdrawn consent causes no token persistence', async () => {
    await withdrawConsent(user.id);
    const { GET } = await import('@/app/api/calendar/callback/route');
    const state = createSecureState(user.id, 'google', 'calendar');
    const res = await GET(buildCallbackRequest('valid-code', state));

    const location = res.headers.get('location') || '';
    expect(location).toContain('calendar_error');
    expect(location).toContain('consent');

    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);
  });

  it('16. Google user-info failure causes no token persistence', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    mockedUserInfo.mockRejectedValue(new Error('Google userinfo endpoint unavailable'));

    const state = createSecureState(user.id, 'google', 'calendar');
    const res = await GET(buildCallbackRequest('valid-code', state));

    const location = res.headers.get('location') || '';
    expect(location).toContain('calendar_error');

    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);

    // No audit event for calendar_connected
    const auditEvents = await db.auditLog.findMany({
      where: { userId: user.id, action: 'calendar_connected' },
    });
    expect(auditEvents.length).toBe(0);
  });

  it('17. Token exchange failure causes no token persistence', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    mockedExchange.mockRejectedValue(new Error('Token exchange failed: invalid_grant'));

    const state = createSecureState(user.id, 'google', 'calendar');
    const res = await GET(buildCallbackRequest('valid-code', state));

    const location = res.headers.get('location') || '';
    expect(location).toContain('calendar_error');

    const tokens = await db.googleCalendarToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);
  });

  it('18. Database failure does not report a successful connection', async () => {
    const { GET } = await import('@/app/api/calendar/callback/route');
    // Spy on db.googleCalendarToken.create and force it to throw
    const createSpy = vi.spyOn(db.googleCalendarToken, 'create').mockRejectedValueOnce(
      new Error('Simulated DB write failure')
    );

    const state = createSecureState(user.id, 'google', 'calendar');
    const res = await GET(buildCallbackRequest('valid-code', state));

    const location = res.headers.get('location') || '';
    // Must NOT report success
    expect(location).not.toContain('calendar_connected=true');
    expect(location).toContain('calendar_error');

    // No audit event for calendar_connected (connection failed)
    const auditEvents = await db.auditLog.findMany({
      where: { userId: user.id, action: 'calendar_connected' },
    });
    expect(auditEvents.length).toBe(0);

    createSpy.mockRestore();
  });
});

// ── Encryption compatibility tests ──────────────────────────────────

describe('Phase 7B Calendar Callback — Encryption/decryption compatibility', () => {
  it('encrypt() then decrypt() returns the original token values', () => {
    const original = 'ya29.aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(isEncrypted(encrypted)).toBe(true);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('isEncrypted() detects encrypted format and rejects plaintext', () => {
    const encrypted = encrypt('some-secret-value');
    expect(isEncrypted(encrypted)).toBe(true);
    expect(isEncrypted('plaintext-token-without-colons')).toBe(false);
    expect(isEncrypted('')).toBe(false);
  });

  it('decrypt() handles legacy plaintext tokens (backward compatibility)', () => {
    // Pre-fix records may have plaintext tokens stored.
    // decrypt() must return them as-is (not throw, not return garbage).
    const legacyPlaintext = 'legacy-ya29-token-without-encryption-format';
    expect(decrypt(legacyPlaintext)).toBe(legacyPlaintext);
  });

  it('encrypting an already-encrypted value does NOT double-encrypt (via encryptCredential logic)', () => {
    // The route's encryptCredential helper checks isEncrypted() first.
    // Simulate that logic here to verify no double-encryption.
    const original = 'test-token-for-double-encryption-check';
    const encryptedOnce = encrypt(original);
    // Apply the same logic as encryptCredential:
    const encryptedTwice = isEncrypted(encryptedOnce) ? encryptedOnce : encrypt(encryptedOnce);
    expect(encryptedTwice).toBe(encryptedOnce); // Same value — no double encryption
    expect(decrypt(encryptedTwice)).toBe(original); // Still decrypts to original
  });
});

// ── Calendar token refresh path (encrypted refresh token) ───────────

describe('Phase 7B Calendar Callback — Token refresh with encrypted refresh token', () => {
  let user: { id: string; email: string };

  beforeEach(async () => {
    _resetConsumedNonces();
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email };

    // Insert an encrypted Calendar token directly (simulating a successful prior connection)
    await db.googleCalendarToken.create({
      data: {
        userId: user.id,
        calendarEmail: GOOGLE_EMAIL,
        accessToken: encrypt(PLAINTEXT_ACCESS_TOKEN),
        refreshToken: encrypt(PLAINTEXT_REFRESH_TOKEN),
        tokenExpiry: new Date(Date.now() - 1000), // Expired → triggers refresh
        scope: CALENDAR_SCOPES,
        status: 'active',
        isConnected: true,
      },
    });
  });

  afterEach(async () => {
    await db.googleCalendarToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('getValidCalendarAccessToken decrypts the stored refresh token and refreshes via Google', async () => {
    // Mock refreshGoogleToken to return a new access token
    const { getValidCalendarAccessToken } = await import('@/lib/google-oauth');
    // refreshGoogleToken is NOT mocked (we only mocked exchangeCodeForTokens + getGoogleUserInfo)
    // So we need to mock the global fetch to handle Google's token endpoint
    const originalFetch = globalThis.fetch;
    const NEW_ACCESS_TOKEN = 'ya29.refreshed-access-token-new-value';
    globalThis.fetch = vi.fn().mockImplementation((_url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof _url === 'string' ? _url : (_url instanceof URL ? _url.toString() : (_url as Request).url);
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        const body = init?.body;
        // Body may be a string OR a URLSearchParams object
        let bodyStr = '';
        if (typeof body === 'string') bodyStr = body;
        else if (body instanceof URLSearchParams) bodyStr = body.toString();
        else if (body instanceof FormData) bodyStr = 'formdata';
        if (bodyStr.includes('grant_type=refresh_token')) {
          // Refresh token request — verify the decrypted refresh token is in the body
          expect(bodyStr).toContain(encodeURIComponent(PLAINTEXT_REFRESH_TOKEN));
          return Promise.resolve(new Response(JSON.stringify({
            access_token: NEW_ACCESS_TOKEN,
            expires_in: 3600,
            token_type: 'Bearer',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
      }
      // Fall through to original fetch for unrelated requests
      return originalFetch(_url as string, init);
    }) as typeof globalThis.fetch;

    try {
      const result = await getValidCalendarAccessToken(user.id);
      expect(result.accessToken).toBe(NEW_ACCESS_TOKEN);

      // Verify the new access token was persisted encrypted
      const stored = await db.googleCalendarToken.findFirst({ where: { userId: user.id } });
      expect(stored).toBeTruthy();
      expect(stored!.accessToken).not.toBe(NEW_ACCESS_TOKEN);
      expect(isEncrypted(stored!.accessToken)).toBe(true);
      expect(decrypt(stored!.accessToken)).toBe(NEW_ACCESS_TOKEN);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
