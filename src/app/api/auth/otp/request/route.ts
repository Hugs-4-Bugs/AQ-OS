import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  validateEmail,
  generateOTP,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  OTP_EXPIRY_SECONDS,
} from '@/lib/auth';
import { sendOtpLoginEmail, isEmailServiceConfigured } from '@/lib/email';
import { withRateLimit } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
  // Rate limit: 5 auth requests per minute per IP
  const rateLimitResult = withRateLimit(request, 'auth');
  if (rateLimitResult) return rateLimitResult;

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

    if (!validateEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Find user (return same message regardless of existence) ──
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json({
        message: 'If an account exists with this email, an OTP has been sent.',
      });
    }

    // ── Rate limit: don't allow new OTP if previous one is still fresh (< 60s old) ──
    if (
      user.loginOtpExpiry &&
      new Date() < new Date(user.loginOtpExpiry.getTime() - (OTP_EXPIRY_SECONDS - 60) * 1000)
    ) {
      return NextResponse.json(
        { error: 'Please wait before requesting a new OTP.' },
        { status: 429 }
      );
    }

    // ── Generate OTP & store on user record ─────────────────────
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    await db.user.update({
      where: { id: user.id },
      data: {
        loginOtp: otp,
        loginOtpExpiry: otpExpiry,
        otpAttemptCount: 0,
        otpLockedUntil: null,
      },
    });

    // ── Audit log ───────────────────────────────────────────────
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await logAuthEvent({
      userId: user.id,
      action: 'otp_login',
      details: 'OTP login code generated',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Send OTP via email (REAL Gmail SMTP delivery only) ─────
    // No Ethereal / preview inbox fallback. If delivery fails, the user
    // sees a clear error message.
    const emailConfigured = isEmailServiceConfigured();

    if (!emailConfigured) {
      console.error('[OTP Request] CRITICAL: No real email provider configured (SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY).');
      return NextResponse.json({
        message: 'If an account exists with this email, an OTP has been sent.',
        deliveryIssue: true,
        deliveryMessage: 'Email delivery is not configured on the server. Please contact support.',
      });
    }

    let emailSent = false;
    let emailError: string | undefined;
    try {
      const result = await sendOtpLoginEmail(normalizedEmail, user.name || 'User', otp);
      emailSent = result.sent;
      emailError = result.error;
      if (result.sent) {
        console.log(`OTP email result: success — provider=${result.provider}, messageId=${result.messageId || 'n/a'}`);
      } else {
        console.log(`OTP email result: failed — ${result.error || 'unknown error'}`);
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error(`OTP email result: failed — ${emailError}`);
    }

    // If email delivery genuinely failed, surface a clear error.
    if (!emailSent) {
      return NextResponse.json({
        message: 'If an account exists with this email, an OTP has been sent.',
        deliveryIssue: true,
        deliveryMessage:
          'We could not deliver your OTP right now due to a temporary email service issue. Please try again later, or contact support if the problem persists.',
      });
    }

    return NextResponse.json({
      message: 'If an account exists with this email, an OTP has been sent.',
    });
  } catch (error) {
    console.error('OTP request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}