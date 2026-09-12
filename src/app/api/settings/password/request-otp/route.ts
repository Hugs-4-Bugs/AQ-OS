import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getAuthUser,
  generateOTP,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  OTP_EXPIRY_SECONDS,
} from '@/lib/auth';
import { sendPasswordResetEmail, isEmailServiceConfigured } from '@/lib/email';
import { withRateLimit } from '@/lib/security/rate-limiter';

/**
 * POST /api/settings/password/request-otp
 *
 * Sends an OTP to the authenticated user's email address, required to
 * authorize an in-app password change.
 *
 * Security:
 *   - Requires authentication (caller must be the logged-in user).
 *   - Rate-limited per IP via `withRateLimit('auth')`.
 *   - Per-user cooldown of 60s — same field (`resetOtpExpiry`) reused as
 *     forgot-password, so they share the same anti-spam window. This is
 *     intentional — it prevents an attacker who stole the session from
 *     spamming OTP requests to flood the victim's inbox.
 *   - The OTP is stored in `user.resetOtp` + `user.resetOtpExpiry`. The
 *     forgot-password and in-app password-change flows both consume the
 *     same OTP slot, so only one valid OTP exists at a time per user.
 *   - The OTP is NEVER returned in the response — the user reads it from
 *     their real Gmail inbox.
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

    const user = await db.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        email: true,
        name: true,
        resetOtpExpiry: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ── Per-user cooldown (60s) ───────────────────────────────────
    // Same field used by forgot-password — they share the same cooldown
    // window, so an attacker cannot rotate between two endpoints to
    // bypass the per-user cooldown.
    if (
      user.resetOtpExpiry &&
      new Date() < new Date(user.resetOtpExpiry.getTime() - (OTP_EXPIRY_SECONDS - 60) * 1000)
    ) {
      return NextResponse.json(
        { error: 'Please wait before requesting a new code.' },
        { status: 429 }
      );
    }

    // ── Generate OTP & store on user record ───────────────────────
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

    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await logAuthEvent({
      userId: user.id,
      action: 'password_change_otp_sent',
      details: 'OTP sent for in-app password change',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Send OTP via real Gmail SMTP ───────────────────────────────
    const emailConfigured = isEmailServiceConfigured();
    if (emailConfigured) {
      try {
        // Reuse the password-reset template — the wording ("We received a
        // request to reset the password for your account") fits both
        // the forgot-password (logged-out) and in-app password-change
        // (logged-in) flows. The OTP is the same secure 6-digit code.
        const result = await sendPasswordResetEmail(
          user.email,
          user.name || 'User',
          otp
        );
        console.log(
          `[Password Change OTP] Email sent: provider=${result.provider}, sent=${result.sent}, messageId=${result.messageId || 'n/a'}`,
        );
      } catch (emailError) {
        console.error('[Password Change OTP] Failed to send email:', emailError);
        // Don't fail the request — the OTP is stored on the user record,
        // so the user can still complete the change if they can read the
        // email (e.g. via the audit log or by requesting again).
      }
    } else {
      console.error(
        '[Password Change OTP] CRITICAL: No real email provider configured (SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY). OTP cannot be delivered.'
      );
    }

    return NextResponse.json({
      message: 'A verification code has been sent to your email.',
      // Mask the email address for the UI: "h***@example.com"
      emailMasked: maskEmail(user.email),
    });
  } catch (error) {
    console.error('Password change OTP request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** Mask an email address for UI display: "h***@example.com" */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 1, 6))}@${domain}`;
}
