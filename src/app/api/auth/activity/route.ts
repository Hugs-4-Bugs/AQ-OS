// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/auth/activity
//
// ISSUE 6 (True 10-minute inactivity timeout) — server-side activity
// heartbeat. The admin client sends a POST to this endpoint when the
// user produces GENUINE activity (mouse click, keyboard input, touch,
// pointer press). The server:
//
//   1. Authenticates the request via the access_token cookie.
//   2. Resolves the active UserSession via the refresh_token cookie.
//   3. Validates the session is not already revoked/expired.
//   4. Updates UserSession.lastActivityAt — but THROTTLED to one write
//      per ACTIVITY_WRITE_THROTTLE_MS to avoid DB write amplification.
//   5. Returns the authoritative secondsLeft and absoluteExpiresAt so
//      the client can re-sync its countdown.
//
// CRITICAL: This endpoint MUST NOT extend an expired session. If the
// elapsed time since lastActivityAt already exceeds the timeout, the
// session is rejected with 401 and the refresh_token cookie is
// revoked. This prevents stale tabs from extending expired sessions
// by sending periodic pings.
//
// The endpoint is also protected against silent background polling
// extending sessions: if the client sends a ping without a valid
// access token, it is rejected. Token refresh alone (which rotates
// the access token but does not call this endpoint) does NOT update
// lastActivityAt.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { verifyToken, clearAuthCookies } from '@/lib/auth';
import { ADMIN_INACTIVITY_TIMEOUT_MS } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Server-side write throttle — one DB write per session per 30s. */
const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000;

/** Maximum clock skew tolerated between client and server (ms). */
const MAX_CLOCK_SKEW_MS = 5 * 1000;

interface ActivityRequestBody {
  /** Client monotonic timestamp (ms since page load) — ignored on server. */
  clientTimestamp?: number;
  /** Activity source: 'mouse' | 'keyboard' | 'touch' | 'pointer' — for telemetry only. */
  source?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('access_token')?.value;
    const refreshToken = cookieStore.get('refresh_token')?.value;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    // Verify the access token — must be a valid, non-expired JWT.
    const payload = verifyToken(accessToken);
    if (!payload || payload.type !== 'access') {
      // Access token expired — client should call /api/auth/refresh first.
      // We do NOT update lastActivityAt here.
      return NextResponse.json(
        { error: 'Access token expired', code: 'ACCESS_TOKEN_EXPIRED' },
        { status: 401 }
      );
    }

    // Resolve the UserSession via the refresh_token cookie.
    const session = await db.userSession.findUnique({
      where: { refreshToken },
      select: {
        id: true,
        userId: true,
        lastActivityAt: true,
        absoluteExpiresAt: true,
        expiresAt: true,
        isRevoked: true,
      },
    });

    if (!session || session.isRevoked || session.userId !== payload.sub) {
      // Session is invalid — clear cookies and force re-auth.
      const response = NextResponse.json(
        { error: 'Session invalid', code: 'SESSION_INVALID' },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    const now = Date.now();
    // FAIL-CLOSED: Missing lastActivityAt means the session is invalid.
    if (!session.lastActivityAt) {
      const response = NextResponse.json(
        { error: 'Session invalid — no activity record', code: 'SESSION_INVALID_NO_ACTIVITY' },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }
    const lastActivityMs = new Date(session.lastActivityAt).getTime();
    const elapsed = now - lastActivityMs;

    // ── REJECT expired sessions (do NOT extend) ───────────────────
    // If the session has been inactive beyond the timeout, this ping is
    // coming from a stale tab. Revoke the session and return 401.
    if (elapsed > ADMIN_INACTIVITY_TIMEOUT_MS + MAX_CLOCK_SKEW_MS) {
      await db.userSession.update({
        where: { id: session.id },
        data: { isRevoked: true },
      }).catch(() => {});
      const response = NextResponse.json(
        {
          error: 'Session expired due to inactivity',
          code: 'SESSION_EXPIRED_INACTIVITY',
          expiredAt: new Date(lastActivityMs + ADMIN_INACTIVITY_TIMEOUT_MS).toISOString(),
        },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    // ── Honor absolute session expiry (remember-me ceiling) ──────
    const absoluteExpiryMs = session.absoluteExpiresAt
      ? new Date(session.absoluteExpiresAt).getTime()
      : null;
    if (absoluteExpiryMs !== null && now > absoluteExpiryMs) {
      await db.userSession.update({
        where: { id: session.id },
        data: { isRevoked: true },
      }).catch(() => {});
      const response = NextResponse.json(
        {
          error: 'Session reached absolute expiry',
          code: 'SESSION_ABSOLUTE_EXPIRED',
        },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    // Honor session expiresAt (refresh token TTL).
    if (session.expiresAt && now > new Date(session.expiresAt).getTime()) {
      const response = NextResponse.json(
        { error: 'Session token expired', code: 'SESSION_TOKEN_EXPIRED' },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    // ── Throttled lastActivityAt update ───────────────────────────
    // Only write to the DB if the last write was more than
    // ACTIVITY_WRITE_THROTTLE_MS ago. This prevents one DB write per
    // mouse click while still keeping the activity timestamp fresh
    // enough for the 10-minute timeout (worst-case drift: 30s).
    let updated = false;
    if (elapsed > ACTIVITY_WRITE_THROTTLE_MS) {
      await db.userSession.update({
        where: { id: session.id },
        data: { lastActivityAt: new Date(now) },
      }).catch(() => {});
      updated = true;
    }

    // Compute the authoritative secondsLeft.
    const effectiveLastActivity = updated ? now : lastActivityMs;
    const remainingMs = Math.max(
      0,
      ADMIN_INACTIVITY_TIMEOUT_MS - (now - effectiveLastActivity)
    );
    const secondsLeft = Math.floor(remainingMs / 1000);

    let body: ActivityRequestBody = {};
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === 'object') {
        body = parsed as ActivityRequestBody;
      }
    } catch {
      // Body is optional — ignore parse errors.
    }

    return NextResponse.json({
      ok: true,
      secondsLeft,
      updatedAt: new Date(now).toISOString(),
      // Echo back the absolute ceiling so the client can stop counting
      // down past it.
      absoluteExpiresAt: absoluteExpiryMs
        ? new Date(absoluteExpiryMs).toISOString()
        : null,
      serverTime: new Date(now).toISOString(),
      source: typeof body.source === 'string' ? body.source : null,
      persisted: updated,
    });
  } catch (error) {
    console.error('[activity] error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL' },
      { status: 500 }
    );
  }
}

// GET is intentionally not implemented — use /api/auth/session-status for reads.
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
