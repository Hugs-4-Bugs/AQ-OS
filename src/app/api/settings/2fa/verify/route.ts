// AcquisitionOS — 2FA Verify Route (Settings)
// Completes the 2FA setup initiated by /api/settings/2fa/setup. Validates a
// 6-digit TOTP code against the pending secret, and if valid, marks MFA as
// enabled on the user's MfaConfig record.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getAuthUser,
  verifyTotpCode,
  logAuthEvent,
  getClientIp,
  getUserAgent,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'A 6-digit verification code is required' },
        { status: 400 }
      );
    }

    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: 'Code must be a 6-digit number' },
        { status: 400 }
      );
    }

    // ── Find the pending MFA config ──────────────────────────────
    const mfaConfig = await db.mfaConfig.findUnique({
      where: { userId: authUser.id },
    });

    if (!mfaConfig) {
      return NextResponse.json(
        { error: 'No pending 2FA setup found. Please initiate setup first.' },
        { status: 404 }
      );
    }

    if (mfaConfig.isEnabled) {
      return NextResponse.json(
        { error: '2FA is already enabled' },
        { status: 400 }
      );
    }

    if (!mfaConfig.secret) {
      return NextResponse.json(
        { error: '2FA setup incomplete. Please initiate setup again.' },
        { status: 400 }
      );
    }

    // ── Verify the TOTP code against the stored secret ────────────
    const isValid = verifyTotpCode(mfaConfig.secret, code);
    if (!isValid) {
      await logAuthEvent({
        userId: authUser.id,
        action: 'mfa_verify_failed',
        details: 'Invalid TOTP code submitted during 2FA setup verification',
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });

      return NextResponse.json(
        { error: 'Invalid verification code. Please try again.' },
        { status: 400 }
      );
    }

    // ── Enable MFA ───────────────────────────────────────────────
    await db.mfaConfig.update({
      where: { userId: authUser.id },
      data: {
        isEnabled: true,
        verifiedAt: new Date(),
      },
    });

    // ── Audit log ─────────────────────────────────────────────────
    await logAuthEvent({
      userId: authUser.id,
      action: 'mfa_enabled',
      details: '2FA enabled via /api/settings/2fa/verify — TOTP code verified',
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return NextResponse.json({
      message: 'Two-factor authentication enabled successfully.',
      enabled: true,
    });
  } catch (error) {
    console.error('2FA verify error:', error);
    return NextResponse.json(
      { error: 'Failed to verify 2FA code' },
      { status: 500 }
    );
  }
}
