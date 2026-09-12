// AcquisitionOS — 2FA Setup Route (Settings)
// Initiates TOTP-based two-factor authentication for the authenticated user.
// Generates a new TOTP secret, stores it as "pending" (isEnabled=false) until
// the user verifies it via /api/settings/2fa/verify, then returns the secret +
// otpauth URI so the frontend can render a QR code or manual entry link.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getAuthUser,
  generateTotpSecret,
  generateTotpUri,
  generateBackupCodes,
  hashPassword,
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

    // ── If MFA is already enabled, refuse to re-initiate ──────────
    const existing = await db.mfaConfig.findUnique({
      where: { userId: authUser.id },
    });

    if (existing?.isEnabled) {
      return NextResponse.json(
        { error: 'Two-factor authentication is already enabled. Disable it first to reconfigure.' },
        { status: 400 }
      );
    }

    // ── Generate fresh TOTP secret + backup codes ────────────────
    const secret = generateTotpSecret();
    const backupCodes = generateBackupCodes(8);
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => hashPassword(code))
    );

    // ── Store as PENDING (isEnabled=false) — verify route flips this on
    if (existing) {
      await db.mfaConfig.update({
        where: { userId: authUser.id },
        data: {
          secret,
          backupCodes: JSON.stringify(hashedBackupCodes),
          isEnabled: false,
          verifiedAt: null,
        },
      });
    } else {
      await db.mfaConfig.create({
        data: {
          userId: authUser.id,
          secret,
          backupCodes: JSON.stringify(hashedBackupCodes),
          isEnabled: false,
        },
      });
    }

    // ── Build the otpauth:// URI for authenticator apps / QR codes ──
    const qrCodeUrl = generateTotpUri({
      secret,
      label: authUser.email,
      issuer: 'AcquisitionOS',
    });

    // ── Audit log ─────────────────────────────────────────────────
    await logAuthEvent({
      userId: authUser.id,
      action: 'mfa_setup_initiated',
      details: '2FA setup initiated via /api/settings/2fa/setup — pending verification',
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return NextResponse.json({
      message: '2FA setup initiated. Verify with a 6-digit TOTP code to complete.',
      secret,
      qrCodeUrl,
      backupCodes, // shown once — user must store these safely
      pending: true,
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate 2FA setup' },
      { status: 500 }
    );
  }
}
