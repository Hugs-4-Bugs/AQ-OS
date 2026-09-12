import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  hashPassword,
  validatePasswordStrength,
  revokeAllUserSessions,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  isAccountLocked,
  recordLoginAttemptByEmail,
  secureCompare,
  incrementOtpAttempts,
  resetOtpAttempts,
  isOtpLocked,
} from '@/lib/auth';
import { withRateLimit } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
  // Rate limit: 5 auth requests per minute per IP
  const rateLimitResult = withRateLimit(request, 'auth');
  if (rateLimitResult) return rateLimitResult;

  try {
    const body = await request.json();
    const { email, otp, newPassword } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!email || !otp || !newPassword) {
      return NextResponse.json(
        { error: 'Email, OTP, and new password are required' },
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
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    // ── Brute-force protection on reset OTP ─────────────────────
    if (await isAccountLocked(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please try again later.' },
        { status: 423 }
      );
    }

    // ── Validate password strength ──────────────────────────────
    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { error: passwordCheck.errors.join('. ') },
        { status: 400 }
      );
    }

    // ── Find user ───────────────────────────────────────────────
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    // ── Check OTP lockout ───────────────────────────────────────
    if (await isOtpLocked(user.id)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new reset code.' },
        { status: 423 }
      );
    }

    // ── Verify OTP from user record (constant-time comparison) ──
    if (!user.resetOtp || !user.resetOtpExpiry) {
      return NextResponse.json(
        { error: 'No reset code found. Please request a new one.' },
        { status: 400 }
      );
    }

    if (!secureCompare(user.resetOtp, otp)) {
      // Record failed attempt for brute-force protection
      await recordLoginAttemptByEmail({
        email: normalizedEmail,
        ip,
        userAgent: ua,
        success: false,
        failReason: 'Invalid reset OTP',
      });

      const { locked } = await incrementOtpAttempts(user.id);

      if (locked) {
        return NextResponse.json(
          { error: 'Too many failed attempts. Please request a new reset code.' },
          { status: 423 }
        );
      }

      return NextResponse.json(
        { error: 'Invalid reset code' },
        { status: 400 }
      );
    }

    if (new Date() > user.resetOtpExpiry) {
      return NextResponse.json(
        { error: 'Reset code expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // ── Hash & update password ──────────────────────────────────
    const hashedPassword = await hashPassword(newPassword);

    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        resetOtp: null,
        resetOtpExpiry: null,
        otpAttemptCount: 0,
        otpLockedUntil: null,
      },
    });

    // Reset OTP attempts
    await resetOtpAttempts(user.id);

    // ── Invalidate all sessions (force re-login) ────────────────
    await revokeAllUserSessions(user.id);

    // ── Audit log ───────────────────────────────────────────────
    await logAuthEvent({
      userId: user.id,
      action: 'password_reset',
      details: 'Password reset successfully via OTP',
      ipAddress: ip,
      userAgent: ua,
    });

    await logAuthEvent({
      userId: user.id,
      action: 'session_revoked',
      details: 'All sessions revoked after password reset',
      ipAddress: ip,
      userAgent: ua,
    });

    return NextResponse.json({
      message: 'Password reset successfully. Please sign in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
