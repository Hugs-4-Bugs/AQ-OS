// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Remember-Me 30-day persistence
//
// Covers the 2026-09-29 fixes:
//  1. getSessionState: a remembered session is NO LONGER idle-expired
//     after 48h of inactivity — it stays valid until its 30-day absolute
//     ceiling unless revoked/expired (the "logged out after a weekend"
//     regression).
//  2. Revocation / hard expiry / missing-row states still authoritative.
//  3. silentRefresh: cross-tab serialization via Web Locks, throttle,
//     and authoritative-vs-infrastructure logout classification.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    userSession: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { getSessionState } from '@/lib/auth';
import { db } from '@/lib/db';

const mockFindFirst = () => vi.mocked(db.userSession.findFirst);

const DAY = 24 * 60 * 60 * 1000;

function sessionRow(overrides: Record<string, unknown>) {
  const now = Date.now();
  return {
    id: 'session-1',
    userId: 'user-1',
    refreshToken: 'rt-1',
    isRevoked: false,
    rememberMe: true,
    // defaults: created now, expires in 30d, active now
    expiresAt: new Date(now + 30 * DAY),
    absoluteExpiresAt: new Date(now + 30 * DAY),
    lastActivityAt: new Date(now),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSessionState — Remember Me 30-day persistence policy', () => {
  it('keeps a remembered session VALID after 48h+ of inactivity (was idle_expired)', async () => {
    mockFindFirst().mockResolvedValue(sessionRow({ lastActivityAt: new Date(Date.now() - 4 * DAY) }));
    const state = await getSessionState('rt-1');
    expect(state.state).toBe('valid');
    expect(state.session?.rememberMe).toBe(true);
  });

  it('keeps a remembered session valid after 29 days of inactivity (within absolute ceiling)', async () => {
    mockFindFirst().mockResolvedValue(
      sessionRow({
        lastActivityAt: new Date(Date.now() - 29 * DAY),
        expiresAt: new Date(Date.now() + 1 * DAY),
        absoluteExpiresAt: new Date(Date.now() + 1 * DAY),
      })
    );
    const state = await getSessionState('rt-1');
    expect(state.state).toBe('valid');
  });

  it('expires a remembered session at the 30-day absolute ceiling', async () => {
    mockFindFirst().mockResolvedValue(
      sessionRow({
        expiresAt: new Date(Date.now() + 31 * DAY),
        absoluteExpiresAt: new Date(Date.now() - 1 * DAY),
      })
    );
    const state = await getSessionState('rt-1');
    expect(state.state).toBe('expired');
  });

  it('expires a session past its expiresAt (regression)', async () => {
    mockFindFirst().mockResolvedValue(sessionRow({ expiresAt: new Date(Date.now() - 1000), absoluteExpiresAt: new Date(Date.now() - 1000) }));
    const state = await getSessionState('rt-1');
    expect(state.state).toBe('expired');
  });

  it('reports REVOKED for a revoked session (regression)', async () => {
    mockFindFirst().mockResolvedValue(sessionRow({ isRevoked: true }));
    const state = await getSessionState('rt-1');
    expect(state.state).toBe('revoked');
  });

  it('reports MISSING when the session row is gone (regression)', async () => {
    mockFindFirst().mockResolvedValue(null);
    const state = await getSessionState('rt-1');
    expect(state.state).toBe('missing');
  });

  it('non-remembered sessions behave unchanged (valid regardless of idle)', async () => {
    mockFindFirst().mockResolvedValue(sessionRow({ rememberMe: false, lastActivityAt: new Date(Date.now() - 20 * DAY) }));
    const state = await getSessionState('rt-1');
    expect(state.state).toBe('valid');
  });
});

// ═══════════════════════════════════════════════════════════════════
// silentRefresh — serialization + logout classification
// ═══════════════════════════════════════════════════════════════════

import { silentRefresh, isAuthoritativeLogout, REAL_LOGOUT_CODES } from '@/lib/silent-refresh';

const AUTH_USER = {
  id: 'user-1',
  email: 'u@test.local',
  name: 'U',
  role: 'owner',
  plan: 'free',
  orgId: null,
  emailVerified: true,
  mfaEnabled: false,
  avatarUrl: null,
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('isAuthoritativeLogout', () => {
  it('classifies authoritative codes on 401/403 as real logout', () => {
    for (const code of REAL_LOGOUT_CODES) {
      expect(isAuthoritativeLogout({ status: 401, code })).toBe(true);
    }
  });

  it('never treats 5xx / network / unknown codes as logout', () => {
    expect(isAuthoritativeLogout({ status: 503, code: 'INFRASTRUCTURE_ERROR' })).toBe(false);
    expect(isAuthoritativeLogout({ status: 0, code: 'NETWORK_ERROR' })).toBe(false);
    expect(isAuthoritativeLogout({ status: 401, code: 'SOME_FUTURE_CODE' })).toBe(false);
  });

  it('treats legacy 401 without code as authoritative logout', () => {
    expect(isAuthoritativeLogout({ status: 401, code: '' })).toBe(true);
  });
});

describe('silentRefresh', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let lockCalls: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    lockCalls = [];
    // jsdom has no Web Locks — emulate one so the lock path is exercised
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (_name: string, fn: () => Promise<unknown>) => {
          lockCalls.push(_name);
          return fn();
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // remove the locks shim
    delete (navigator as unknown as { locks?: unknown }).locks;
  });

  it('performs a forced refresh and returns the hydrated user', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { code: 'OK', user: AUTH_USER }));
    const result = await silentRefresh({ force: true });
    expect(result.ok).toBe(true);
    expect(result.user?.id).toBe('user-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/refresh');
    // cross-tab lock held while the request ran
    expect(lockCalls).toEqual(['aqos-auth-refresh']);
  });

  it('returns the error code from an authoritative rejection', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Session has been revoked', code: 'SESSION_REVOKED' }));
    const result = await silentRefresh({ force: true });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.code).toBe('SESSION_REVOKED');
    expect(isAuthoritativeLogout(result)).toBe(true);
  });

  it('never logs out on infrastructure failure (503)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { code: 'INFRASTRUCTURE_ERROR' }));
    const result = await silentRefresh({ force: true });
    expect(result.ok).toBe(false);
    expect(isAuthoritativeLogout(result)).toBe(false);
  });

  it('maps network failure to NETWORK_ERROR without throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await silentRefresh({ force: true });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.code).toBe('NETWORK_ERROR');
    expect(isAuthoritativeLogout(result)).toBe(false);
  });

  it('skips an unforced refresh shortly after a success (throttle), but honors force', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { code: 'OK', user: AUTH_USER }));
    await silentRefresh({ force: true }); // establishes lastSuccessAt
    fetchMock.mockClear();

    const throttled = await silentRefresh({ force: false });
    expect(throttled.ok).toBe(true);
    expect(throttled.code).toBe('RECENT');
    expect(fetchMock).not.toHaveBeenCalled();

    const forced = await silentRefresh({ force: true });
    expect(forced.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
