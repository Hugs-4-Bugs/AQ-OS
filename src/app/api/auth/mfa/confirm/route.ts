// AcquisitionOS — MFA Confirm Route
// Completes MFA setup by verifying the user can generate valid TOTP codes
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireAuth,
  verifyTotpCode,
  logAuthEvent,
  getClientIp,
  getUserAgent,
} from '@/lib/auth';
import {
  checkRateLimit,
  rateLimitResponse,
  storeUnavailableResponse,
  getTrustedClientIP,
  recordRateLimitMetric,
} from '@/lib/security/distributed-rate-limiter';
import { MFA_CONFIRM_ACCOUNT_POLICY } from '@/lib/security/rate-limit-policies';

export async function POST(request: NextRequest) {
  const clientIP = getTrustedClientIP(request);

  try {
    const authUser = await requireAuth(request);

    // ── Distributed rate limiting: account-based (prevents brute-force
    //    on the TOTP confirmation code during setup completion) ────
    const accountResult = await checkRateLimit(
      { endpoint: 'mfa_confirm', accountIdentifier: authUser.id, dimension: 'account' },
      MFA_CONFIRM_ACCOUNT_POLICY
    );
    recordRateLimitMetric({ endpoint: 'mfa_confirm', accountIdentifier: authUser.id, dimension: 'account' }, accountResult);
    if (!accountResult.allowed) {
      if (!accountResult.storeAvailable && MFA_CONFIRM_ACCOUNT_POLICY.failClosed) {
        return storeUnavailableResponse('mfa_confirm');
      }
      return rateLimitResponse(accountResult, 'Too many MFA confirmation attempts.');
    }
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'TOTP code is required' },
        { status: 400 }
      );
    }

    // Find the MFA config (should exist but be disabled)
    const mfaConfig = await db.mfaConfig.findUnique({
      where: { userId: authUser.id },
    });

    if (!mfaConfig) {
      return NextResponse.json(
        { error: 'MFA setup not found. Please initiate MFA setup first.' },
        { status: 404 }
      );
    }

    if (mfaConfig.isEnabled) {
      return NextResponse.json(
        { error: 'MFA is already enabled' },
        { status: 400 }
      );
    }

    if (!mfaConfig.secret) {
      return NextResponse.json(
        { error: 'MFA setup incomplete. Please initiate MFA setup first.' },
        { status: 400 }
      );
    }

    // Verify the TOTP code
    const isValid = verifyTotpCode(mfaConfig.secret, code);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid TOTP code. Please try again.' },
        { status: 400 }
      );
    }

    // Enable MFA
    await db.mfaConfig.update({
      where: { userId: authUser.id },
      data: {
        isEnabled: true,
        verifiedAt: new Date(),
      },
    });

    // Audit log
    const ip = getClientIp(request);
    const ua = getUserAgent(request);
    await logAuthEvent({
      userId: authUser.id,
      action: 'mfa_enabled',
      details: 'MFA setup completed and enabled via TOTP verification',
      ipAddress: ip,
      userAgent: ua,
    });

    return NextResponse.json({
      message: 'MFA has been enabled successfully. You will need to enter a TOTP code on future logins.',
      enabled: true,
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      const authError = error as { statusCode: number; message: string };
      return NextResponse.json(
        { error: authError.message },
        { status: authError.statusCode }
      );
    }

    console.error('MFA confirm error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
