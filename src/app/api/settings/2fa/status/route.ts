// AcquisitionOS — 2FA Status Route (Settings)
// Returns the current 2FA state for the authenticated user, so the frontend
// Security tab can render the correct UI (enable vs. disable vs. pending).
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const mfaConfig = await db.mfaConfig.findUnique({
      where: { userId: authUser.id },
      select: {
        isEnabled: true,
        verifiedAt: true,
        createdAt: true,
      },
    });

    const enabled = !!mfaConfig?.isEnabled;
    // "pending" = a secret was generated but never verified/enabled
    const pending = !enabled && !!mfaConfig && !!mfaConfig.verifiedAt === false && mfaConfig.createdAt !== undefined;

    return NextResponse.json({
      enabled,
      pending,
      verifiedAt: mfaConfig?.verifiedAt ?? null,
      // authUser.mfaEnabled is set by mapUserToAuthUser based on MfaConfig.isEnabled
      // — re-surface it here for client convenience.
      userMfaEnabled: enabled,
    });
  } catch (error) {
    console.error('2FA status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch 2FA status' },
      { status: 500 }
    );
  }
}
