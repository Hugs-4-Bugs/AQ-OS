// AcquisitionOS — 2FA Disable Route (Settings)
// Disables two-factor authentication for the authenticated user. Requires the
// user's current password AND a valid 6-digit TOTP code (or backup code) to
// prevent unauthorized disabling of MFA.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getAuthUser,
  verifyPassword,
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
    const { password, code } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Current password is required to disable 2FA' },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: 'A 6-digit TOTP code is required to disable 2FA' },
        { status: 400 }
      );
    }

    // ── Fetch user + MFA config ──────────────────────────────────
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

    if (!user.mfaConfig || !user.mfaConfig.isEnabled) {
      return NextResponse.json(
        { error: 'Two-factor authentication is not enabled' },
        { status: 400 }
      );
    }

    // ── Verify password ──────────────────────────────────────────
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // ── Verify TOTP code ─────────────────────────────────────────
    const isValidTotp = verifyTotpCode(user.mfaConfig.secret, code);

    if (!isValidTotp) {
      // Try backup codes (stored as bcrypt hashes in JSON array)
      const storedBackupCodes: string[] = JSON.parse(user.mfaConfig.backupCodes || '[]');
      let backupIndex = -1;
      for (let i = 0; i < storedBackupCodes.length; i++) {
        const isMatch = await verifyPassword(code.toUpperCase(), storedBackupCodes[i]);
        if (isMatch) {
          backupIndex = i;
          break;
        }
      }

      if (backupIndex === -1) {
        return NextResponse.json(
          { error: 'Invalid TOTP code' },
          { status: 401 }
        );
      }

      // Remove the used backup code
      storedBackupCodes.splice(backupIndex, 1);
    }

    // ── Disable MFA ──────────────────────────────────────────────
    await db.mfaConfig.update({
      where: { userId: authUser.id },
      data: {
        isEnabled: false,
        secret: '',
        backupCodes: '[]',
        verifiedAt: null,
      },
    });

    // ── Audit log ─────────────────────────────────────────────────
    await logAuthEvent({
      userId: authUser.id,
      action: 'mfa_disabled',
      details: '2FA disabled via /api/settings/2fa/disable (password + TOTP verified)',
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return NextResponse.json({
      message: 'Two-factor authentication disabled successfully.',
      enabled: false,
    });
  } catch (error) {
    console.error('2FA disable error:', error);
    return NextResponse.json(
      { error: 'Failed to disable 2FA' },
      { status: 500 }
    );
  }
}
