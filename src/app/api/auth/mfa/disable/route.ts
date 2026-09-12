// AcquisitionOS — MFA Disable Route
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireAuth,
  verifyPassword,
  verifyTotpCode,
  logAuthEvent,
  getClientIp,
  getUserAgent,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // ── Require authentication ──────────────────────────────────
    const authUser = await requireAuth(request);

    const body = await request.json();
    const { password, code } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!password) {
      return NextResponse.json(
        { error: 'Current password is required to disable MFA' },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: 'MFA verification code is required to disable MFA' },
        { status: 400 }
      );
    }

    // ── Verify password ─────────────────────────────────────────
    const user = await db.user.findUnique({
      where: { id: authUser.id },
      include: { mfaConfig: true },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'User not found or no password set' },
        { status: 400 }
      );
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // ── Check MFA is enabled ────────────────────────────────────
    if (!user.mfaConfig || !user.mfaConfig.isEnabled) {
      return NextResponse.json(
        { error: 'MFA is not enabled for this account' },
        { status: 400 }
      );
    }

    // ── Verify TOTP code ────────────────────────────────────────
    const isValidTotp = verifyTotpCode(user.mfaConfig.secret, code);

    if (!isValidTotp) {
      return NextResponse.json(
        { error: 'Invalid MFA code' },
        { status: 401 }
      );
    }

    // ── Disable MFA ─────────────────────────────────────────────
    await db.mfaConfig.update({
      where: { userId: authUser.id },
      data: {
        isEnabled: false,
        secret: '',
        backupCodes: '[]',
        verifiedAt: null,
      },
    });

    // ── Audit log ───────────────────────────────────────────────
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await logAuthEvent({
      userId: authUser.id,
      action: 'mfa_disabled',
      details: 'MFA disabled by user after password + TOTP verification',
      ipAddress: ip,
      userAgent: ua,
    });

    return NextResponse.json({
      message: 'MFA has been disabled successfully.',
    });
  } catch (error) {
    // Handle AuthError from requireAuth
    if (error instanceof Error && 'statusCode' in error) {
      const authError = error as { statusCode: number; message: string };
      return NextResponse.json(
        { error: authError.message },
        { status: authError.statusCode }
      );
    }

    console.error('MFA disable error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
