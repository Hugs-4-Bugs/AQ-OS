import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthUser,
  revokeSession,
  revokeAllUserSessions,
  clearAuthCookies,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  verifyToken,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const ua = getUserAgent(request);
    const allDevices = request.nextUrl.searchParams.get('allDevices') === 'true';

    // ── Get authenticated user (optional — signout always succeeds) ──
    const authUser = await getAuthUser(request);

    if (allDevices && authUser) {
      // ── Revoke ALL sessions for the user (logout all devices) ──
      await revokeAllUserSessions(authUser.id);
    } else {
      // ── Revoke the session via refresh token cookie (single device) ──
      const refreshToken = request.cookies.get('refresh_token')?.value;
      if (refreshToken) {
        // Verify the refresh token belongs to a valid session before revoking
        const payload = verifyToken(refreshToken);
        if (payload && payload.type === 'refresh') {
          await revokeSession(refreshToken);
        }
      }
    }

    // ── Audit log ───────────────────────────────────────────────
    if (authUser) {
      await logAuthEvent({
        userId: authUser.id,
        action: 'signout',
        details: allDevices ? 'User signed out all devices' : 'User signed out',
        ipAddress: ip,
        userAgent: ua,
      });
    }

    // ── Clear cookies ───────────────────────────────────────────
    const response = NextResponse.json({
      message: allDevices ? 'Signed out all devices successfully' : 'Signed out successfully',
    });

    return clearAuthCookies(response);
  } catch (error) {
    console.error('Signout error:', error);
    // Still clear cookies even if revocation fails
    const response = NextResponse.json({
      message: 'Signed out successfully',
    });
    return clearAuthCookies(response);
  }
}
