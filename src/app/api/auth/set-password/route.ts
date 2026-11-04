// ═══════════════════════════════════════════════════════════════════
import { withRateLimit } from '@/lib/security/rate-limiter';
// AcquisitionOS — Set Password via OTP Verification
//
// POST /api/auth/set-password
// Allows an authenticated user (with valid OTP) to set or reset their
// password. Used when:
//   - The user has no password (logged in via OTP/Google only)
//   - The user's password hash is corrupted/invalid
//   - The user forgot their password (reset flow)
//
// Flow:
//   1. User requests OTP via /api/auth/otp/request (existing)
//   2. User enters OTP + new password here
//   3. Server verifies OTP (single-use, expiry-checked)
//   4. Server hashes new password with bcrypt (12 rounds)
//   5. Server invalidates OTP (single-use)
//   6. Server logs security event
//   7. Server revokes existing sessions (for reset flow)
//
// Security:
//   - OTP must be valid and not expired
//   - OTP is invalidated after use (single-use)
//   - Password is hashed with bcrypt before storage
//   - Rate limited (otp_verify bucket)
//   - Security event logged in AuditLog
//   - Never logs the password
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  validateEmail,
  hashPassword,
  logAuthEvent,
  getClientIp,
  getUserAgent,
} from '@/lib/auth';


export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResult = withRateLimit(request, 'otp_verify');
  if (rateLimitResult) return rateLimitResult;

  try {
    const body = await request.json();
    const { email, otp, newPassword } = body;

    if (!email || !otp || !newPassword) {
      
      return NextResponse.json({ error: 'Email, OTP, and new password are required' }, { status: 400 });
    }

    if (!validateEmail(email)) {
      
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
      
      return NextResponse.json({ error: 'OTP must be a 6-digit code' }, { status: 400 });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await db.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired verification code.' }, { status: 400 });
    }

    // Verify OTP
    if (!user.loginOtp || !user.loginOtpExpiry) {
      return NextResponse.json({ error: 'Invalid or expired verification code.' }, { status: 400 });
    }

    if (new Date() > user.loginOtpExpiry) {
      return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 });
    }

    if (user.loginOtp !== otp) {
      return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user: set password + invalidate OTP
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        loginOtp: null,
        loginOtpExpiry: null,
        otpAttemptCount: 0,
        otpLockedUntil: null,
      },
    });

    // Revoke existing sessions (force re-login)
    await db.userSession.updateMany({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true },
    }).catch(() => {});

    // Audit log
    const ip = getClientIp(request);
    const ua = getUserAgent(request);
    await logAuthEvent({
      userId: user.id,
      action: 'password_set',
      details: 'Password set via OTP verification',
      ipAddress: ip,
      userAgent: ua,
    });

    return NextResponse.json({
      success: true,
      message: 'Password set successfully. Please log in with your new password.',
    });
  } catch (error) {
    console.error('Set password error:', error);
    
    return NextResponse.json({ error: 'Unable to set password right now.' }, { status: 500 });
  }
}
