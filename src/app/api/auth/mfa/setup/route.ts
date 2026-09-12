// AcquisitionOS — MFA Setup Route
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireAuth,
  generateTotpSecret,
  generateTotpUri,
  generateBackupCodes,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  hashPassword,
  verifyPassword,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // ── Require authentication ──────────────────────────────────
    const authUser = await requireAuth(request);

    // ── Validate current password ───────────────────────────────
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Current password is required to enable MFA' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: authUser.id },
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

    // ── Check if MFA is already enabled ─────────────────────────
    const existingConfig = await db.mfaConfig.findUnique({
      where: { userId: authUser.id },
    });

    if (existingConfig?.isEnabled) {
      return NextResponse.json(
        { error: 'MFA is already enabled for this account' },
        { status: 400 }
      );
    }

    // ── Generate TOTP secret ────────────────────────────────────
    const secret = generateTotpSecret();
    const backupCodes = generateBackupCodes(8);

    // Hash backup codes for storage (we return plaintext once)
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => hashPassword(code))
    );

    // ── Store MFA config (not yet enabled — must verify first) ──
    if (existingConfig) {
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

    // ── Generate QR code URL ────────────────────────────────────
    const qrCodeUrl = generateTotpUri({
      secret,
      label: authUser.email,
      issuer: 'AcquisitionOS',
    });

    // ── Audit log ───────────────────────────────────────────────
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await logAuthEvent({
      userId: authUser.id,
      action: 'mfa_enabled',
      details: 'MFA setup initiated — awaiting TOTP verification',
      ipAddress: ip,
      userAgent: ua,
    });

    return NextResponse.json({
      message: 'MFA setup initiated. Verify with a TOTP code to complete setup.',
      secret,
      qrCodeUrl,
      backupCodes, // Only shown once — client must store these
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

    console.error('MFA setup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
