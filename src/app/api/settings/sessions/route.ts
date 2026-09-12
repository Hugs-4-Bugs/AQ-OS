import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getUserActiveSessions } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const sessions = await getUserActiveSessions(authUser.id);

    // Identify current session from cookie
    const currentRefreshToken = request.cookies.get('refresh_token')?.value;

    return NextResponse.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        deviceInfo: session.deviceInfo,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastActive: session.updatedAt,
        expiresAt: session.expiresAt,
        isCurrent: session.refreshToken === currentRefreshToken,
      })),
    });
  } catch (error) {
    console.error('List sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}
