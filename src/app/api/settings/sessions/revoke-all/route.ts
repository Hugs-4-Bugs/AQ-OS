import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';
import { db } from '@/lib/db';

// POST /api/settings/sessions/revoke-all
// Revokes ALL active UserSession records for the authenticated user EXCEPT the
// current session (identified by the refresh_token cookie or, as a fallback,
// the currentRefreshToken field supplied in the request body).
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Prefer the HTTP-only refresh_token cookie (the frontend cannot read it,
    // but the server can — and that is the secure way to identify the current
    // session). Fall back to a request-body field for backwards compatibility.
    const currentRefreshToken =
      request.cookies.get('refresh_token')?.value ||
      (await request.json().catch(() => ({}))).currentRefreshToken;

    if (!currentRefreshToken) {
      return NextResponse.json(
        { error: 'Current refresh token is required' },
        { status: 400 }
      );
    }

    // Revoke all sessions except the current one
    const result = await db.userSession.updateMany({
      where: {
        userId: authUser.id,
        isRevoked: false,
        refreshToken: { not: currentRefreshToken },
      },
      data: { isRevoked: true },
    });

    // Log the event
    await logAuthEvent({
      userId: authUser.id,
      action: 'session_revoked',
      details: `Revoked ${result.count} session(s) via /api/settings/sessions/revoke-all`,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return NextResponse.json({
      message: `Revoked ${result.count} session(s)`,
      revokedCount: result.count,
    });
  } catch (error) {
    console.error('Revoke all sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke sessions' },
      { status: 500 }
    );
  }
}
