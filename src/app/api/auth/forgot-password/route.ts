import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  generateOTP,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  OTP_EXPIRY_SECONDS,
} from '@/lib/auth';
import { sendPasswordResetEmail, isEmailServiceConfigured } from '@/lib/email';
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
  FORGOT_PASSWORD_ACCOUNT_POLICY,
  FORGOT_PASSWORD_IP_POLICY,
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

    // ── Distributed rate limiting: IP + account dimensions ──────
    const ipResult = await checkRateLimit(
      { endpoint: 'forgot_password', ip: clientIP, dimension: 'ip' },
      FORGOT_PASSWORD_IP_POLICY
    );
    recordRateLimitMetric({ endpoint: 'forgot_password', ip: clientIP, dimension: 'ip' }, ipResult);
    if (!ipResult.allowed) {
      if (!ipResult.storeAvailable && FORGOT_PASSWORD_IP_POLICY.failClosed) {
        return storeUnavailableResponse('forgot_password');
      }
      return rateLimitResponse(ipResult, 'Too many password reset requests from this IP.');
    }

    const accountResult = await checkRateLimit(
      { endpoint: 'forgot_password', accountIdentifier: normalizedEmail, dimension: 'account' },
      FORGOT_PASSWORD_ACCOUNT_POLICY
    );
    recordRateLimitMetric({ endpoint: 'forgot_password', accountIdentifier: normalizedEmail, dimension: 'account' }, accountResult);
    if (!accountResult.allowed) {
      if (!accountResult.storeAvailable && FORGOT_PASSWORD_ACCOUNT_POLICY.failClosed) {
        return storeUnavailableResponse('forgot_password');
      }
      // Return same message as success to prevent account enumeration
      return NextResponse.json({
        message: 'If an account exists with this email, a reset code has been sent.',
      });
    }

    // ── Email dispatch cooldown: prevent duplicate emails within 60s ──
    const cooldownActive = await isCooldownActive(
      'password_reset_email',
      normalizedEmail,
      COOLDOWNS.PASSWORD_RESET_EMAIL
    );
    if (cooldownActive) {
      return NextResponse.json(
        { error: 'A reset code was recently sent. Please wait before requesting another.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // ── Find user (always return same message to prevent enumeration) ──
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json({
        message: 'If an account exists with this email, a reset code has been sent.',
      });
    }

    // ── Rate limit: don't allow resend if OTP is still fresh (< 60s old) ──
    if (
      user.resetOtpExpiry &&
      new Date() < new Date(user.resetOtpExpiry.getTime() - (OTP_EXPIRY_SECONDS - 60) * 1000)
    ) {
      return NextResponse.json(
        { error: 'Please wait before requesting a new reset code.' },
        { status: 429 }
      );
    }

    // ── Generate OTP & store on user record ─────────────────────
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    await db.user.update({
      where: { id: user.id },
      data: {
        resetOtp: otp,
        resetOtpExpiry: otpExpiry,
        otpAttemptCount: 0,
        otpLockedUntil: null,
      },
    });

    // ── Audit log ───────────────────────────────────────────────
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await logAuthEvent({
      userId: user.id,
      action: 'password_reset',
      details: 'Password reset OTP generated',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Send password reset OTP via email (REAL Gmail SMTP only) ──
    const emailConfigured = isEmailServiceConfigured();
    let devDelivery: ReturnType<typeof devOtpDelivery> = undefined;
    if (emailConfigured) {
      try {
        const result = await sendPasswordResetEmail(normalizedEmail, user.name || 'User', otp);
        console.log(
          `[Forgot Password] Email sent: provider=${result.provider}, sent=${result.sent}, messageId=${result.messageId || 'n/a'}`,
        );
      } catch (emailError) {
        console.error('[Forgot Password] Failed to send reset email:', emailError);
      }
    } else {
      console.error('[Forgot Password] CRITICAL: No real email provider configured (SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY). Reset OTP cannot be delivered.');
      // DEV-ONLY: surface the generated reset code to the requesting client so
      // the flow can continue when no real provider exists (sandbox/preview).
      // In production builds this is always undefined.
      devDelivery = devOtpDelivery(otp, 'reset code');
    }

    return NextResponse.json({
      message: 'If an account exists with this email, a reset code has been sent.',
      ...(devDelivery ? { devDelivery } : {}),
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}