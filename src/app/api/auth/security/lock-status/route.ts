// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Account Lock Status API Route
// GET: Get account lock status
// POST: Request unlock (sends verification email)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';

/**
 * GET /api/auth/security/lock-status
 * Get the current lock status for the authenticated user's account
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const { getLockStatus } = await import('@/lib/account-lock-service');
      const status = await getLockStatus(user.id);

      return NextResponse.json({
        isLocked: status.isLocked,
        lockedAt: status.lockedAt,
        lockedUntil: status.lockedUntil,
        lockReason: status.lockReason,
        lockedBy: status.lockedBy,
        consecutiveLockouts: status.consecutiveLockouts,
        nextUnlockAt: status.nextUnlockAt,
        canRequestUnlock: status.isLocked,
      });
    } catch (error) {
      console.error('Lock status GET error:', error);
      return NextResponse.json(
        { error: 'Failed to get lock status' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/auth/security/lock-status
 * Request an account unlock (sends verification email)
 *
 * Body:
 * - action: 'request_unlock' | 'verify_unlock'
 * - verificationCode?: string — OTP for verify_unlock action
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { action, verificationCode } = body;

      if (!action) {
        return NextResponse.json(
          { error: 'action is required' },
          { status: 400 }
        );
      }

      switch (action) {
        case 'request_unlock': {
          const { getLockStatus } = await import('@/lib/account-lock-service');
          const status = await getLockStatus(user.id);

          if (!status.isLocked) {
            return NextResponse.json(
              { error: 'Account is not locked' },
              { status: 400 }
            );
          }

          // Generate and send unlock verification code
          const { generateOTP, logAuthEvent } = await import('@/lib/auth');
          const otp = generateOTP();
          const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

          // Store the unlock OTP in the user's resetOtp field (repurposed for unlock)
          const { db } = await import('@/lib/db');
          await db.user.update({
            where: { id: user.id },
            data: {
              resetOtp: otp,
              resetOtpExpiry: otpExpiry,
            },
          });

          // Send verification email
          try {
            const { isEmailServiceConfigured } = await import('@/lib/email');
            const { shouldBypassEmail } = await import('@/lib/feature-flags');

            if (isEmailServiceConfigured() && !shouldBypassEmail()) {
              const { sendSecurityAlertEmail } = await import('@/lib/email');
              await sendSecurityAlertEmail(
                user.email,
                user.name || 'User',
                'Account unlock request — verification code',
                'system',
                `Verification code: ${otp}`
              );
            }
          } catch {
            // Non-blocking
          }

          await logAuthEvent({
            userId: user.id,
            action: 'account_unlocked',
            details: 'Unlock verification code requested',
            resource: 'auth',
          });

          return NextResponse.json({
            message: 'Verification code sent to your email. Use it to unlock your account.',
            expiryMinutes: 10,
          });
        }

        case 'verify_unlock': {
          if (!verificationCode) {
            return NextResponse.json(
              { error: 'verificationCode is required for verify_unlock action' },
              { status: 400 }
            );
          }

          // Verify the unlock code
          const { db } = await import('@/lib/db');
          const { secureCompare } = await import('@/lib/auth');

          const userData = await db.user.findUnique({
            where: { id: user.id },
            select: { resetOtp: true, resetOtpExpiry: true, isActive: true },
          });

          if (!userData) {
            return NextResponse.json(
              { error: 'User not found' },
              { status: 404 }
            );
          }

          // Check if there's a valid unlock code
          if (!userData.resetOtp || !userData.resetOtpExpiry) {
            return NextResponse.json(
              { error: 'No unlock request found. Please request a new verification code.' },
              { status: 400 }
            );
          }

          // Check expiry
          if (new Date() > userData.resetOtpExpiry) {
            return NextResponse.json(
              { error: 'Verification code has expired. Please request a new one.' },
              { status: 400 }
            );
          }

          // Verify code (constant-time comparison)
          if (!secureCompare(userData.resetOtp, verificationCode)) {
            return NextResponse.json(
              { error: 'Invalid verification code' },
              { status: 401 }
            );
          }

          // Unlock the account
          const { unlockAccount } = await import('@/lib/account-lock-service');
          const result = await unlockAccount({
            userId: user.id,
            unlockedBy: 'user',
            reason: 'Self-unlock via email verification',
          });

          // Clear the unlock code
          await db.user.update({
            where: { id: user.id },
            data: {
              resetOtp: null,
              resetOtpExpiry: null,
            },
          });

          if (result.success) {
            return NextResponse.json({
              message: 'Account unlocked successfully. You can now sign in.',
            });
          } else {
            return NextResponse.json(
              { error: result.message },
              { status: 500 }
            );
          }
        }

        default:
          return NextResponse.json(
            { error: `Invalid action. Must be 'request_unlock' or 'verify_unlock'` },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('Lock status POST error:', error);
      return NextResponse.json(
        { error: 'Failed to process unlock request' },
        { status: 500 }
      );
    }
  });
}
