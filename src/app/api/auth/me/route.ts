import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // getAuthUser handles both Bearer token and cookie auth
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
    console.error('Auth check error:', error);
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }
}
