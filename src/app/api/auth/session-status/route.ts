// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/auth/session-status
//
// ISSUE 6 (True 10-minute inactivity timeout) — read-only endpoint
// that returns the authoritative secondsLeft for the current session.
//
// The admin client polls this endpoint every ~10 seconds to re-sync
// its countdown. Polling this endpoint does NOT update
// lastActivityAt — only POST /api/auth/activity does. This prevents
// background polling from extending the session.
//
// Returns:
//   - 200 { authenticated: true, secondsLeft, expiresAt, mfaVerified, role }
//   - 401 { authenticated: false, code: 'AUTH_REQUIRED' }
//   - 401 { authenticated: false, code: 'SESSION_EXPIRED_INACTIVITY' }
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { verifyToken, clearAuthCookies } from '@/lib/auth';
import { ADMIN_INACTIVITY_TIMEOUT_MS } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Maximum clock skew tolerated between client and server (ms). */
const MAX_CLOCK_SKEW_MS = 5 * 1000;

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('access_token')?.value;
    const refreshToken = cookieStore.get('refresh_token')?.value;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { authenticated: false, code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const payload = verifyToken(accessToken);
    if (!payload || payload.type !== 'access') {
      return NextResponse.json(
        { authenticated: false, code: 'ACCESS_TOKEN_EXPIRED' },
        { status: 401 }
      );
    }

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
      const response = NextResponse.json(
        { authenticated: false, code: 'SESSION_INVALID' },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    const now = Date.now();
    // FAIL-CLOSED: Missing, malformed, non-finite, or future lastActivityAt
    // means the session is invalid.
    if (!session.lastActivityAt) {
      const response = NextResponse.json(
        { authenticated: false, code: 'SESSION_INVALID_NO_ACTIVITY' },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }
    const lastActivityMs = new Date(session.lastActivityAt).getTime();
    if (!Number.isFinite(lastActivityMs) || lastActivityMs > now + MAX_CLOCK_SKEW_MS) {
      const response = NextResponse.json(
        { authenticated: false, code: 'SESSION_INVALID_NO_ACTIVITY' },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }
    const elapsed = now - lastActivityMs;

    // Reject expired sessions.
    if (elapsed > ADMIN_INACTIVITY_TIMEOUT_MS + MAX_CLOCK_SKEW_MS) {
      await db.userSession.update({
        where: { id: session.id },
        data: { isRevoked: true },
      }).catch(() => {});
      const response = NextResponse.json(
        {
          authenticated: false,
          code: 'SESSION_EXPIRED_INACTIVITY',
          expiredAt: new Date(lastActivityMs + ADMIN_INACTIVITY_TIMEOUT_MS).toISOString(),
        },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    // Honor absolute expiry.
    const absoluteExpiryMs = session.absoluteExpiresAt
      ? new Date(session.absoluteExpiresAt).getTime()
      : null;
    if (absoluteExpiryMs !== null && now > absoluteExpiryMs) {
      await db.userSession.update({
        where: { id: session.id },
        data: { isRevoked: true },
      }).catch(() => {});
      const response = NextResponse.json(
        { authenticated: false, code: 'SESSION_ABSOLUTE_EXPIRED' },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    if (session.expiresAt && now > new Date(session.expiresAt).getTime()) {
      const response = NextResponse.json(
        { authenticated: false, code: 'SESSION_TOKEN_EXPIRED' },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    const remainingMs = Math.max(0, ADMIN_INACTIVITY_TIMEOUT_MS - elapsed);
    const secondsLeft = Math.floor(remainingMs / 1000);

    // Include user role + MFA state for the client's info.
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: {
        role: true,
        mfaConfig: { select: { isEnabled: true } },
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      const response = NextResponse.json(
        { authenticated: false, code: 'USER_DISABLED' },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    return NextResponse.json({
      authenticated: true,
      secondsLeft,
      inactivityTimeoutSeconds: Math.floor(ADMIN_INACTIVITY_TIMEOUT_MS / 1000),
      lastActivityAt: new Date(lastActivityMs).toISOString(),
      absoluteExpiresAt: absoluteExpiryMs
        ? new Date(absoluteExpiryMs).toISOString()
        : null,
      serverTime: new Date(now).toISOString(),
      role: user.role,
      mfaVerified: !!user.mfaConfig?.isEnabled,
    });
  } catch (error) {
    console.error('[session-status] error:', error);
    return NextResponse.json(
      { authenticated: false, code: 'INTERNAL' },
      { status: 500 }
    );
  }
}
