import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  generateOTP,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  OTP_EXPIRY_SECONDS,
} from '@/lib/auth';
import { sendVerificationEmail, isEmailServiceConfigured } from '@/lib/email';
import { devOtpDelivery } from '@/lib/dev-auth';
import {
  checkRateLimit,
  rateLimitResponse,
  storeUnavailableResponse,
  getTrustedClientIP,
  isCooldownActive,
  recordRateLimitMetric,
} from '@/lib/security/distributed-rate-limiter';
import {
  RESEND_VERIFICATION_ACCOUNT_POLICY,
  COOLDOWNS,
} from '@/lib/security/rate-limit-policies';

export async function POST(request: NextRequest) {
  const clientIP = getTrustedClientIP(request);

  try {
    const body = await request.json();
    const { email } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Distributed rate limiting: account-based (prevents email
    //    flooding from one client hitting many accounts; previously only a
    //    per-account 60s cooldown existed) ──────────────────────────
    const accountResult = await checkRateLimit(
      { endpoint: 'resend_verification', accountIdentifier: normalizedEmail, dimension: 'account' },
      RESEND_VERIFICATION_ACCOUNT_POLICY
    );
    recordRateLimitMetric({ endpoint: 'resend_verification', accountIdentifier: normalizedEmail, dimension: 'account' }, accountResult);
    if (!accountResult.allowed) {
      if (!accountResult.storeAvailable && RESEND_VERIFICATION_ACCOUNT_POLICY.failClosed) {
        return storeUnavailableResponse('resend_verification');
      }
      return NextResponse.json({
        message: 'If an account exists and is not yet verified, a new verification code has been sent.',
      });
    }

    // ── Email dispatch cooldown: prevent duplicate verification emails within 60s ──
    const cooldownActive = await isCooldownActive(
      'verification_email',
      normalizedEmail,
      COOLDOWNS.VERIFICATION_EMAIL
    );
    if (cooldownActive) {
      return NextResponse.json(
        { error: 'A verification email was recently sent. Please wait before requesting another.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // ── Find user (return generic message regardless) ───────────
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json({
        message: 'If an account exists and is not yet verified, a new verification code has been sent.',
      });
    }

    // ── Already verified ────────────────────────────────────────
    if (user.emailVerified) {
      return NextResponse.json({
        message: 'If an account exists and is not yet verified, a new verification code has been sent.',
      });
    }

    // ── Rate limit (60s cooldown) ──────────────────────────────
    if (
      user.emailVerificationOtpExpiry &&
      new Date() < new Date(user.emailVerificationOtpExpiry.getTime() - (OTP_EXPIRY_SECONDS - 60) * 1000)
    ) {
      return NextResponse.json(
        { error: 'Please wait before requesting a new verification code.' },
        { status: 429 }
      );
    }

    // ── Generate new OTP ────────────────────────────────────────
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    await db.user.update({
      where: { id: user.id },
      data: {
        emailVerificationOtp: otp,
        emailVerificationOtpExpiry: otpExpiry,
      },
    });

    // ── Audit log ───────────────────────────────────────────────
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await logAuthEvent({
      userId: user.id,
      action: 'email_verification_sent',
      details: 'Verification OTP resent',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Send verification email (REAL Gmail SMTP only) ───────────
    // If SMTP delivery FAILS, return honest 503 (no fake "OTP sent" success).
    const emailConfigured = isEmailServiceConfigured();
    let devDelivery: ReturnType<typeof devOtpDelivery> = undefined;
    let emailDeliveryFailed = false;
    if (emailConfigured) {
      try {
        const result = await sendVerificationEmail(normalizedEmail, user.name || 'User', otp);
        console.log(
          `[Resend Verification] Email sent: provider=${result.provider}, sent=${result.sent}, messageId=${result.messageId || 'n/a'}`,
        );
        if (!result.sent) {
          console.error('[Resend Verification] Email delivery failed:', result.error);
          emailDeliveryFailed = true;
        }
      } catch (emailError) {
        console.error('[Resend Verification] Failed to send email:', emailError);
        emailDeliveryFailed = true;
      }
    } else {
      console.error('[Resend Verification] CRITICAL: No real email provider configured (SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY).');
      // DEV-ONLY: surface the generated verification code to the requesting
      // client so the flow can continue when no real provider exists. In
      // production builds this is always undefined.
      devDelivery = devOtpDelivery(otp, 'verification code');
    }

    // If SMTP was configured but delivery ACTUALLY failed, return honest 503
    if (emailDeliveryFailed) {
      return NextResponse.json(
        {
          error: 'EMAIL_DELIVERY_FAILED',
          message: 'A new verification code was generated, but we could not email it. Please check SMTP configuration and try again.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      message: 'If an account exists and is not yet verified, a new verification code has been sent.',
      ...(devDelivery ? { devDelivery } : {}),
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}