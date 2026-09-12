// AcquisitionOS — MFA Verify Route
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  createSession,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  setAuthCookies,
  verifyPassword,
  verifyTotpCode,
} from '@/lib/auth';
import { withRateLimit } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
  // Rate limit: 5 auth requests per minute per IP to prevent MFA code brute-force
  const rateLimitResult = withRateLimit(request, 'mfa');
  if (rateLimitResult) return rateLimitResult;

  try {
    const body = await request.json();
    const { mfaSessionToken, code } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!mfaSessionToken || !code) {
      return NextResponse.json(
        { error: 'MFA session token and verification code are required' },
        { status: 400 }
      );
    }

    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: 'Code must be a 6-digit number' },
        { status: 400 }
      );
    }

    // ── Verify MFA session token ────────────────────────────────
    const payload = verifyToken(mfaSessionToken);
    if (!payload || payload.type !== 'access') {
      return NextResponse.json(
        { error: 'Invalid or expired MFA session token' },
        { status: 401 }
      );
    }

    // ── Find user ───────────────────────────────────────────────
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      include: { mfaConfig: true },
    });

    if (!user || !user.mfaConfig || !user.mfaConfig.isEnabled) {
      return NextResponse.json(
        { error: 'MFA is not enabled for this account' },
        { status: 400 }
      );
    }

    // ── Verify TOTP code ────────────────────────────────────────
    const isValidTotp = verifyTotpCode(user.mfaConfig.secret, code);

    if (!isValidTotp) {
      // Check backup codes
      const storedBackupCodes: string[] = JSON.parse(user.mfaConfig.backupCodes || '[]');
      let backupCodeIndex = -1;

      for (let i = 0; i < storedBackupCodes.length; i++) {
        const isMatch = await verifyPassword(code.toUpperCase(), storedBackupCodes[i]);
        if (isMatch) {
          backupCodeIndex = i;
          break;
        }
      }

      if (backupCodeIndex === -1) {
        await logAuthEvent({
          userId: user.id,
          action: 'signin_failed',
          details: 'Invalid MFA code',
          ipAddress: getClientIp(request),
          userAgent: getUserAgent(request),
        });

        return NextResponse.json(
          { error: 'Invalid verification code' },
          { status: 401 }
        );
      }

      // Remove used backup code
      storedBackupCodes.splice(backupCodeIndex, 1);
      await db.mfaConfig.update({
        where: { userId: user.id },
        data: { backupCodes: JSON.stringify(storedBackupCodes) },
      });

      // Warn if running low on backup codes
      if (storedBackupCodes.length <= 2) {
        await logAuthEvent({
          userId: user.id,
          action: 'mfa_verified',
          details: `MFA verified via backup code. ${storedBackupCodes.length} backup codes remaining.`,
          ipAddress: getClientIp(request),
          userAgent: getUserAgent(request),
        });
      }
    }

    // ── Generate tokens & complete login ────────────────────────
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt,
    });

    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt,
    });

    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    // ── Create session ──────────────────────────────────────────
    await createSession({
      userId: user.id,
      refreshToken,
      deviceInfo: ua.substring(0, 255),
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Update last login ───────────────────────────────────────
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // ── Audit log ───────────────────────────────────────────────
    await logAuthEvent({
      userId: user.id,
      action: 'mfa_verified',
      details: `MFA verified via ${isValidTotp ? 'TOTP' : 'backup code'}`,
      ipAddress: ip,
      userAgent: ua,
    });

    await logAuthEvent({
      userId: user.id,
      action: 'signin',
      details: 'Successful login (MFA completed)',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Build response ──────────────────────────────────────────
    const response = NextResponse.json({
      message: 'MFA verified. Signed in successfully.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan || 'free',
        orgId: user.orgId,
        emailVerified: user.emailVerified,
        mfaEnabled: true,
        avatarUrl: user.avatar,
      },
    });

    return setAuthCookies(response, accessToken, refreshToken);
  } catch (error) {
    console.error('MFA verify error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
