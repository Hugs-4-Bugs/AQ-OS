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

    const normalizedEmail = email.toLowerCase().trim();

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
    }

    return NextResponse.json({
      message: 'If an account exists with this email, a reset code has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}