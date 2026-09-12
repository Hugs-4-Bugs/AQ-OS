import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  logAuthEvent,
  getClientIp,
  getUserAgent,
  secureCompare,
  incrementOtpAttempts,
  resetOtpAttempts,
  isOtpLocked,
  OTP_EXPIRY_SECONDS,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!email || !otp) {
      return NextResponse.json(
        { error: 'Email and OTP are required' },
        { status: 400 }
      );
    }

    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { error: 'OTP must be a 6-digit code' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Find user ───────────────────────────────────────────────
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or verification code' },
        { status: 400 }
      );
    }

    // ── Already verified ────────────────────────────────────────
    if (user.emailVerified) {
      return NextResponse.json(
        { error: 'Email is already verified' },
        { status: 400 }
      );
    }

    // ── Check OTP lockout ───────────────────────────────────────
    if (await isOtpLocked(user.id)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new verification code.' },
        { status: 423 }
      );
    }

    // ── Check OTP from user record ──────────────────────────────
    if (!user.emailVerificationOtp || !user.emailVerificationOtpExpiry) {
      return NextResponse.json(
        { error: 'No verification code found. Please request a new one.' },
        { status: 400 }
      );
    }

    // Use constant-time comparison to prevent timing attacks
    if (!secureCompare(user.emailVerificationOtp, otp)) {
      const { locked } = await incrementOtpAttempts(user.id);
      if (locked) {
        return NextResponse.json(
          { error: 'Too many failed attempts. Please request a new verification code.' },
          { status: 423 }
        );
      }
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    if (new Date() > user.emailVerificationOtpExpiry) {
      return NextResponse.json(
        { error: 'Verification code expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // ── Mark email as verified & clear OTP ──────────────────────
    await db.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationOtp: null,
        emailVerificationOtpExpiry: null,
        otpAttemptCount: 0,
        otpLockedUntil: null,
      },
    });

    // Reset OTP attempts
    await resetOtpAttempts(user.id);

    // ── Audit log ───────────────────────────────────────────────
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await logAuthEvent({
      userId: user.id,
      action: 'email_verified',
      details: 'Email verified successfully via OTP',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Send welcome email (non-blocking) ───────────────────────
    try {
      const { sendWelcomeEmail, isEmailServiceConfigured } = await import('@/lib/email');
      if (isEmailServiceConfigured()) {
        await sendWelcomeEmail(user.email, user.name || 'User');
      }
    } catch {
      // Never block the main flow
    }

    return NextResponse.json({
      message: 'Email verified successfully',
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
