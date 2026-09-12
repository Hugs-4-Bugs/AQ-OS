import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  createSession,
  revokeSession,
  isSessionValid,
  setAuthCookies,
  logAuthEvent,
  getClientIp,
  getUserAgent,
} from '@/lib/auth';
import { withRateLimit } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
  try {
    // Rate limit refresh token rotation to prevent abuse
    const rateLimitResult = withRateLimit(request, 'auth');
    if (rateLimitResult) return rateLimitResult;
    // ── Extract refresh token from cookie ───────────────────────
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token provided' },
        { status: 401 }
      );
    }

    // ── Verify JWT ──────────────────────────────────────────────
    const payload = verifyToken(refreshToken);
    if (!payload || payload.type !== 'refresh') {
      return NextResponse.json(
        { error: 'Invalid refresh token' },
        { status: 401 }
      );
    }

    // ── Check session is still valid (not revoked) ──────────────
    const sessionValid = await isSessionValid(refreshToken);
    if (!sessionValid) {
      return NextResponse.json(
        { error: 'Session has been revoked' },
        { status: 401 }
      );
    }

    // ── Find user ───────────────────────────────────────────────
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      include: { mfaConfig: { select: { isEnabled: true } } },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'User not found or deactivated' },
        { status: 401 }
      );
    }

    // ── Revoke old session (token rotation) ─────────────────────
    await revokeSession(refreshToken);

    // ── Generate new token pair ─────────────────────────────────
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

    // ── Create new session ──────────────────────────────────────
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await createSession({
      userId: user.id,
      refreshToken: newRefreshToken,
      deviceInfo: ua.substring(0, 255),
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Audit log ───────────────────────────────────────────────
    await logAuthEvent({
      userId: user.id,
      action: 'refresh_token_rotated',
      details: 'Refresh token rotated successfully',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Build response ──────────────────────────────────────────
    const response = NextResponse.json({
      message: 'Token refreshed successfully',
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

    return setAuthCookies(response, newAccessToken, newRefreshToken);
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
