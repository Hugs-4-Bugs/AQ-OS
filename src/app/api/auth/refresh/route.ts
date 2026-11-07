import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  createSession,
  revokeSession,
  getSessionState,
  setAuthCookies,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  classifyAuthErrorCategory,
} from '@/lib/auth';
import {
  checkRateLimit,
  rateLimitResponse,
  storeUnavailableResponse,
  getTrustedClientIP,
  recordRateLimitMetric,
} from '@/lib/security/distributed-rate-limiter';
import { LOGIN_ATTEMPT_IP_POLICY } from '@/lib/security/rate-limit-policies';

// ── P4 (permanent fix Sep 2026): refresh must DISTINGUISH ───────────
//   A. valid session            → rotate tokens, 200
//   B. expired session          → 401 code=SESSION_EXPIRED (real logout)
//   C. explicitly revoked       → 401 code=SESSION_REVOKED (real logout)
//   D. session row missing      → 401 code=SESSION_EXPIRED
//   E. DB/runtime unavailable   → 503 code=INFRASTRUCTURE_ERROR (NO logout)
//   F. invalid refresh token    → 401 code=INVALID_TOKEN
// A temporary database failure must never be reported as "logged out".
export async function POST(request: NextRequest) {
  const clientIP = getTrustedClientIP(request);

  // Distributed rate limiting: IP-based refresh attempt limit
  const ipResult = await checkRateLimit(
    { endpoint: 'refresh', ip: clientIP, dimension: 'ip' },
    LOGIN_ATTEMPT_IP_POLICY
  );
  recordRateLimitMetric({ endpoint: 'refresh', ip: clientIP, dimension: 'ip' }, ipResult);
  if (!ipResult.allowed) {
    if (!ipResult.storeAvailable && LOGIN_ATTEMPT_IP_POLICY.failClosed) {
      return storeUnavailableResponse('refresh');
    }
    return rateLimitResponse(ipResult, 'Too many refresh requests.');
  }

  // ── Extract refresh token from cookie ───────────────────────────
  const refreshToken = request.cookies.get('refresh_token')?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { error: 'No refresh token provided', code: 'NO_TOKEN' },
      { status: 401 }
    );
  }

  // ── Verify JWT ──────────────────────────────────────────────────
  const payload = verifyToken(refreshToken);
  if (!payload || payload.type !== 'refresh') {
    return NextResponse.json(
      { error: 'Invalid refresh token', code: 'INVALID_TOKEN' },
      { status: 401 }
    );
  }

  // ── Resolve session state (DB errors → 503, never 401) ──────────
  let sessionState: Awaited<ReturnType<typeof getSessionState>>;
  try {
    sessionState = await getSessionState(refreshToken);
  } catch (error) {
    // E. infrastructure failure — the client must NOT log the user out
    console.error(
      `[Auth Refresh] 503 category=${classifyAuthErrorCategory(error)}`,
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        error: 'Session service temporarily unavailable. Your session is preserved.',
        code: 'INFRASTRUCTURE_ERROR',
      },
      { status: 503 }
    );
  }

  // ── B/C/D. authoritative session-invalid states → 401 (real logout) ──
  if (sessionState.state !== 'valid' || !sessionState.session) {
    const codeMap: Record<string, string> = {
      expired: 'SESSION_EXPIRED',
      idle_expired: 'SESSION_IDLE_EXPIRED',
      revoked: 'SESSION_REVOKED',
      missing: 'SESSION_EXPIRED',
    };
    // Best-effort revoke for expired/idle sessions (cleanup, non-fatal)
    if (sessionState.state === 'expired' || sessionState.state === 'idle_expired') {
      try {
        await revokeSession(refreshToken);
      } catch { /* non-fatal */ }
    }
    return NextResponse.json(
      {
        error:
          sessionState.state === 'revoked'
            ? 'Session has been revoked'
            : sessionState.state === 'idle_expired'
              ? 'Session expired after 48 hours of inactivity'
              : 'Session has expired',
        code: codeMap[sessionState.state] || 'SESSION_EXPIRED',
      },
      { status: 401 }
    );
  }

  const session = sessionState.session;

  // ── Find user ───────────────────────────────────────────────────
  let user: Awaited<ReturnType<typeof db.user.findUnique>> = null;
  try {
    user = await db.user.findUnique({
      where: { id: payload.sub },
      include: { mfaConfig: { select: { isEnabled: true } } },
    });
  } catch (error) {
    console.error(
      `[Auth Refresh] 503 category=${classifyAuthErrorCategory(error)}`,
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        error: 'Session service temporarily unavailable. Your session is preserved.',
        code: 'INFRASTRUCTURE_ERROR',
      },
      { status: 503 }
    );
  }

  if (!user || !user.isActive) {
    return NextResponse.json(
      { error: 'User not found or deactivated', code: 'USER_UNAVAILABLE' },
      { status: 401 }
    );
  }

  try {
    // ── ISSUE 8: Token refresh must NOT update lastActivityAt. ──
    // Refreshing an access token is a background operation, not
    // genuine user activity. The inactivity timeout must measure
    // real user input (mouse, keyboard, touch) via POST /api/auth/activity.
    // Previously, touchSessionActivity() was called here, which
    // extended the session on every 14-minute token refresh.

    // ── Revoke old session (token rotation) ──────────────────────
    await revokeSession(refreshToken);

    // ── Generate new token pair ──────────────────────────────────
    const newAccessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt,
    });

    const newRefreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt,
    });

    // ── Create new session (preserving the previous session's timestamps) ──
    // ISSUE-008: Token rotation must NOT reset the inactivity window, the
    // refresh-token TTL, or the absolute expiry ceiling. We forward the
    // previous session's lastActivityAt, expiresAt, and absoluteExpiresAt
    // to createSession() so the new session row inherits them verbatim.
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await createSession({
      userId: user.id,
      refreshToken: newRefreshToken,
      deviceInfo: ua.substring(0, 255),
      ipAddress: ip,
      userAgent: ua,
      rememberMe: session.rememberMe,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    });

    // ── Audit log ────────────────────────────────────────────────
    await logAuthEvent({
      userId: user.id,
      action: 'refresh_token_rotated',
      details: 'Refresh token rotated successfully',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Build response ───────────────────────────────────────────
    const response = NextResponse.json({
      message: 'Token refreshed successfully',
      code: 'OK',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan || 'free',
        orgId: user.orgId,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaConfig?.isEnabled ?? false,
        avatarUrl: user.avatar,
      },
    });

    // persist=false only when the session is a non-remembered browser
    // session — remembered sessions keep the 30-day persistent cookie.
    return setAuthCookies(response, newAccessToken, newRefreshToken, {
      persist: session.rememberMe,
    });
  } catch (error) {
    // Rotation/write failures are infrastructure errors → 503 (no logout).
    console.error(
      `[Auth Refresh] 503 category=${classifyAuthErrorCategory(error)}`,
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        error: 'Session service temporarily unavailable. Your session is preserved.',
        code: 'INFRASTRUCTURE_ERROR',
      },
      { status: 503 }
    );
  }
}
