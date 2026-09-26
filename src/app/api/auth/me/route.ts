import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, AuthError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // getAuthUser handles both Bearer token and cookie auth.
    // P11: a database/infrastructure failure throws AuthError(503) —
    // it must be surfaced as 503, NEVER mapped to a 401 "logged out".
    const authUser = await getAuthUser(request);

    if (!authUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        role: authUser.role,
        plan: authUser.plan,
        orgId: authUser.orgId,
        emailVerified: authUser.emailVerified,
        mfaEnabled: authUser.mfaEnabled,
        avatarUrl: authUser.avatarUrl,
      },
    });
  } catch (error) {
    if (error instanceof AuthError && error.statusCode === 503) {
      return NextResponse.json(
        { error: 'Authentication service temporarily unavailable. Your session is preserved.', code: 'INFRASTRUCTURE_ERROR' },
        { status: 503 }
      );
    }
    console.error('Auth check error:', error);
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }
}
