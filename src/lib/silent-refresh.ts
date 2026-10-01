// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Silent token refresh (client, shared)
//
// WHY (2026-09-29, "Remember me does not persist" RCA):
// Every /api/auth/refresh call ROTATES the refresh token (revoke old
// session row → create new). Two concurrent refresh calls that share the
// same pre-rotation cookie (multi-tab 14-min intervals, tab-focus
// refreshes, double-mounted init effects) race: the loser reads a
// now-REVOKED session and receives 401 SESSION_REVOKED, which logs the
// user out. This module serializes all silent refreshes through the
// Web Locks API so only ONE refresh is ever in flight per browser —
// the follower always sends the freshly-rotated cookie.
//
// SECURITY: no credential values are stored or logged here. The server
// keeps its strict single-use rotation semantics; revocation, logout and
// absolute expiry are untouched.
// ═══════════════════════════════════════════════════════════════════

export type SilentRefreshCode =
  | 'OK'
  | 'RECENT' // a refresh succeeded moments ago — skipped intentionally
  | 'NETWORK_ERROR'
  | (string & {});

export interface SilentRefreshResult {
  ok: boolean;
  /** HTTP status; 0 = skipped/throttled or network failure. */
  status: number;
  /** Machine-readable code from the refresh endpoint (or local code). */
  code: SilentRefreshCode;
  /** Hydrated user payload on success (when the endpoint returned one). */
  user?: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    plan: string;
    orgId: string | null;
    emailVerified: boolean;
    mfaEnabled: boolean;
    avatarUrl: string | null;
  } | null;
}

/** Codes from /api/auth/refresh that mean REAL, authoritative logout. */
export const REAL_LOGOUT_CODES: ReadonlySet<string> = new Set([
  'NO_TOKEN',
  'INVALID_TOKEN',
  'SESSION_EXPIRED',
  'SESSION_IDLE_EXPIRED', // legacy code — retained for old-session safety
  'SESSION_REVOKED',
  'USER_UNAVAILABLE',
]);

/** Only an authoritative server answer may clear the signed-in state. */
export function isAuthoritativeLogout(
  result: Pick<SilentRefreshResult, 'status' | 'code'>
): boolean {
  if (result.status !== 401 && result.status !== 403) return false;
  // Legacy servers answered 401 without a code — treat as authoritative.
  if (!result.code) return true;
  return REAL_LOGOUT_CODES.has(result.code);
}

const REFRESH_LOCK_NAME = 'aqos-auth-refresh';
const REFRESH_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes
let lastSuccessAt = 0;

/** True when a refresh succeeded recently and another is unnecessary. */
export function isRefreshThrottled(): boolean {
  return Date.now() - lastSuccessAt < REFRESH_THROTTLE_MS;
}

/** Run fn while holding the cross-tab refresh lock (Web Locks API). */
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { locks?: LockManagerLike }).locks
      : undefined;
  if (locks && typeof locks.request === 'function') {
    return locks.request(REFRESH_LOCK_NAME, fn);
  }
  // Older browsers: no cross-tab serialization available — same as before.
  return fn();
}

interface LockManagerLike {
  request<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * Perform one silent refresh, serialized across all tabs of this browser.
 *
 * force=false (tab-focus / page-restore callers): skips entirely when a
 * refresh succeeded within the last 10 minutes (code 'RECENT', ok=true).
 * force=true (keep-alive interval callers): always performs the request —
 * the access token must not be allowed to expire between intervals.
 */
export async function silentRefresh(options?: { force?: boolean }): Promise<SilentRefreshResult> {
  const force = options?.force === true;
  if (!force && isRefreshThrottled()) {
    return { ok: true, status: 0, code: 'RECENT' };
  }

  try {
    return await withRefreshLock(async () => {
      // Re-check the throttle inside the lock: another tab may have just
      // finished a successful refresh while we waited for the lock.
      if (!force && isRefreshThrottled()) {
        return { ok: true, status: 0, code: 'RECENT' as const };
      }

      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      let code: string = '';
      let user: SilentRefreshResult['user'];
      try {
        const data = await res.json();
        code = data?.code || '';
        user = data?.user;
      } catch {
        // non-JSON body — classify by status below
      }

      if (res.ok) {
        lastSuccessAt = Date.now();
        return { ok: true, status: res.status, code: code || 'OK', user };
      }
      return { ok: false, status: res.status, code };
    });
  } catch {
    // Network failure — NEVER a logout; callers retry via their own loop.
    return { ok: false, status: 0, code: 'NETWORK_ERROR' };
  }
}
