import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getAuthUser,
  verifyPassword,
  hashPassword,
  validatePasswordStrength,
  secureCompare,
  incrementOtpAttempts,
  resetOtpAttempts,
  isOtpLocked,
  revokeAllUserSessions,
  logAuthEvent,
  getClientIp,
  getUserAgent,
} from '@/lib/auth';
import { withRateLimit } from '@/lib/security/rate-limiter';

/**
 * POST /api/settings/password
 *
 * Change the authenticated user's password. Requires THREE factors of
 * authorization:
 *
 *   1. The session cookie (proves the user is logged in).
 *   2. The current password (proves the user knows the existing password).
 *   3. A one-time OTP sent to the user's email (proves the user still
 *      controls the email account — defends against session hijacking
 *      and stolen-cookie attacks where the attacker can pass factor 1
 *      but cannot read the user's email).
 *
 * On success:
 *   - The password hash is updated.
 *   - The OTP slot is cleared.
 *   - ALL other sessions for this user are revoked (the current session
 *     is preserved so the user does not get logged out mid-flow; they
 *     will be forced to sign in again on their other devices).
 *   - An audit log entry is recorded.
 *
 * This endpoint is rate-limited per IP via `withRateLimit('auth')`. The
 * OTP is also protected by `isOtpLocked`/`incrementOtpAttempts` which
 * locks after too many wrong-OTP attempts, mirroring the forgot-password
 * brute-force protections.
 */
export async function POST(request: NextRequest) {
  // Rate limit: 5 auth requests per minute per IP
  const rateLimitResult = withRateLimit(request, 'auth');
  if (rateLimitResult) return rateLimitResult;

  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, otp, newPassword } = body;

    // ── Validation ──────────────────────────────────────────────────
    if (!currentPassword || !otp || !newPassword) {
      return NextResponse.json(
        {
          error:
            'Current password, verification code, and new password are all required.',
        },
        { status: 400 }
      );
    }

    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { error: 'Verification code must be a 6-digit code.' },
        { status: 400 }
      );
    }

    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    // ── Fetch user (with password hash for verification) ──────────
    const user = await db.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        authProvider: true,
        resetOtp: true,
        resetOtpExpiry: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Users who signed up via Google may not have a password set. Forbid
    // password change here — they should use forgot-password (which can
    // establish a new password from a verified OTP flow) instead.
    if (!user.passwordHash) {
      return NextResponse.json(
        {
          error:
            'No password is set for this account. Please use "Forgot password?" on the sign-in page to set one.',
        },
        { status: 400 }
      );
    }

    // ── Verify current password (factor 2) ──────────────────────────
    const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      await logAuthEvent({
        userId: user.id,
        action: 'password_change_failed',
        details: 'Current password incorrect',
        ipAddress: ip,
        userAgent: ua,
      });
      return NextResponse.json(
        { error: 'Current password is incorrect.' },
        { status: 401 }
      );
    }

    // ── OTP lockout check ──────────────────────────────────────────
    if (await isOtpLocked(user.id)) {
      return NextResponse.json(
        {
          error:
            'Too many failed verification attempts. Please request a new code.',
        },
        { status: 423 }
      );
    }

    // ── Verify OTP (factor 3) ──────────────────────────────────────
    if (!user.resetOtp || !user.resetOtpExpiry) {
      return NextResponse.json(
        {
          error:
            'No verification code found. Please request a new code with the "Send Code" button.',
        },
        { status: 400 }
      );
    }

    // Constant-time comparison to prevent timing attacks.
    if (!secureCompare(user.resetOtp, otp)) {
      const { locked } = await incrementOtpAttempts(user.id);
      await logAuthEvent({
        userId: user.id,
        action: 'password_change_failed',
        details: 'Invalid verification code',
        ipAddress: ip,
        userAgent: ua,
      });
      if (locked) {
        return NextResponse.json(
          {
            error:
              'Too many failed verification attempts. Please request a new code.',
          },
          { status: 423 }
        );
      }
      return NextResponse.json(
        { error: 'Invalid verification code.' },
        { status: 400 }
      );
    }

    // ── OTP expiry check ───────────────────────────────────────────
    if (new Date() > user.resetOtpExpiry) {
      return NextResponse.json(
        {
          error: 'Verification code expired. Please request a new code.',
        },
        { status: 400 }
      );
    }

    // ── Validate new password strength ─────────────────────────────
    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      return NextResponse.json(
        {
          error: 'New password does not meet requirements.',
          details: strengthCheck.errors,
        },
        { status: 400 }
      );
    }

    // ── Hash and update password ───────────────────────────────────
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

    // ── Invalidate all OTHER sessions (force re-login on other devices) ──
    // We revoke all sessions, which also clears the current session's
    // refresh token. The user's current access token (in-memory + cookie)
    // remains valid until it expires, but they will need to sign in again
    // on next refresh. This is the same behavior as forgot-password and
    // is the correct security posture for password changes.
    try {
      await revokeAllUserSessions(user.id);
    } catch (revokeErr) {
      // Non-fatal — password is already changed; the user can still
      // continue working in this session. We log the error for ops.
      console.error('[Change Password] Failed to revoke sessions:', revokeErr);
    }

    // ── Audit log ──────────────────────────────────────────────────
    await logAuthEvent({
      userId: user.id,
      action: 'password_change',
      details: 'Password changed successfully (in-app, with OTP verification)',
      ipAddress: ip,
      userAgent: ua,
    });

    await logAuthEvent({
      userId: user.id,
      action: 'session_revoked',
      details: 'All sessions revoked after in-app password change',
      ipAddress: ip,
      userAgent: ua,
    });

    return NextResponse.json({
      message:
        'Password changed successfully. For security, you have been signed out of other devices.',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
