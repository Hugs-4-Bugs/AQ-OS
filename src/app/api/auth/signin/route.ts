import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  createSession,
  isAccountLocked,
  recordLoginAttemptByEmail,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  setAuthCookies,
  detectSuspiciousLogin,
  sendSecurityAlert,
  generateOTP,
  OTP_EXPIRY_SECONDS,
} from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';
import { withRateLimit } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
  // Rate limit: 5 auth requests per minute per IP
  const rateLimitResult = withRateLimit(request, 'auth');
  if (rateLimitResult) return rateLimitResult;

  try {
    const body = await request.json();
    const { email, password } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    // ── Check account lockout ───────────────────────────────────
    if (await isAccountLocked(normalizedEmail)) {
      await logAuthEvent({
        userId: 'unknown',
        action: 'signin_failed',
        details: `Account locked: ${normalizedEmail}`,
        ipAddress: ip,
        userAgent: ua,
      });
      return NextResponse.json(
        { error: 'Account temporarily locked due to too many failed attempts. Please try again later.' },
        { status: 423 }
      );
    }

    // ── Find user ───────────────────────────────────────────────
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      include: { mfaConfig: true },
    });

    if (!user) {
      // Constant-time delay to match bcrypt verification timing
      // This prevents timing attacks that reveal whether an email is registered
      await verifyPassword(password, '$2b$12$abcdefghijklmnopqrstuvABCDEF0123456789ghij');

      await recordLoginAttemptByEmail({
        email: normalizedEmail,
        ip,
        userAgent: ua,
        success: false,
        failReason: 'User not found',
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // ── Check OAuth-only accounts ───────────────────────────────
    // USER REQUEST (2026-09-09): If the email IS registered (e.g. via Google,
    // OTP or Magic Link) but has no password set, tell the user clearly and
    // point them to the other login methods. Any registered email can log in
    // via ANY method available on the platform — the only condition is that
    // the email is registered.
    if (!user.passwordHash) {
      // Constant-time delay to match bcrypt timing
      await verifyPassword(password, '$2b$12$abcdefghijklmnopqrstuvABCDEF0123456789ghij');

      await recordLoginAttemptByEmail({
        email: normalizedEmail,
        ip,
        userAgent: ua,
        success: false,
        failReason: 'Account has no password set (registered via Google/OTP/Magic Link)',
      });
      return NextResponse.json(
        {
          error:
            'This email is registered but has no password set (it was registered via Google / OTP / Magic Link). Please continue with Google, or use OTP or Magic Link login — or set a password via "Forgot Password".',
          noPasswordSet: true,
          email: normalizedEmail,
          suggestedMethods: ['google', 'otp', 'magic-link', 'forgot-password'],
        },
        { status: 409 }
      );
    }

    // ── Verify password ─────────────────────────────────────────
    const validPassword = await verifyPassword(password, user.passwordHash || '');
    if (!validPassword) {
      try {
        await recordLoginAttemptByEmail({
          email: normalizedEmail,
          ip,
          userAgent: ua,
          success: false,
          failReason: 'Invalid password',
        });
      } catch {
        // Never block login due to audit logging failure
      }
      try {
        await logAuthEvent({
          userId: user.id,
          action: 'signin_failed',
          details: 'Invalid password',
          ipAddress: ip,
          userAgent: ua,
        });
      } catch {
        // Never block login due to audit logging failure
      }
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // ── Check email verification ────────────────────────────────
    if (!user.emailVerified) {
      // USER REQUEST (2026-09-09): Be explicit that the email needs
      // verification, and auto-send a FRESH verification code (throttled to
      // one per 60s) so the user isn't stuck waiting for an email that may
      // never have arrived. This directly fixes "user not receiving the
      // account verification mail".
      let verificationResent = false;
      try {
        const otpStillFresh =
          user.emailVerificationOtpExpiry &&
          new Date() <
            new Date(
              user.emailVerificationOtpExpiry.getTime() - (OTP_EXPIRY_SECONDS - 60) * 1000
            );

        if (!otpStillFresh) {
          const verificationOtp = generateOTP();
          const verificationOtpExpiry = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);
          await db.user.update({
            where: { id: user.id },
            data: {
              emailVerificationOtp: verificationOtp,
              emailVerificationOtpExpiry: verificationOtpExpiry,
            },
          });
          const result = await sendVerificationEmail(
            user.email,
            user.name || 'User',
            verificationOtp
          );
          verificationResent = result.sent;
          console.log(
            `[Signin] Unverified account — fresh verification code ${verificationResent ? 'SENT' : 'FAILED to send'}: ${user.email}`,
          );
        } else {
          console.log(
            `[Signin] Unverified account — previous code still fresh, not resending: ${user.email}`,
          );
        }
      } catch (resendErr) {
        console.error('[Signin] Verification resend failed:', resendErr);
      }

      await logAuthEvent({
        userId: user.id,
        action: 'signin_blocked_unverified',
        details: `Sign-in blocked — email not verified${verificationResent ? ' (fresh code sent)' : ''}`,
        ipAddress: ip,
        userAgent: ua,
      }).catch(() => {
        // Never block the response due to audit logging
      });

      return NextResponse.json(
        {
          error: verificationResent
            ? 'Please verify your email first — a fresh verification code has just been sent to your inbox (check your spam folder too).'
            : 'Please verify your email first — use the verification code we emailed you (it is still valid).',
          emailNotVerified: true,
          email: normalizedEmail,
          verificationResent,
        },
        { status: 403 }
      );
    }

    // ── Check if account is active ──────────────────────────────
    if (!user.isActive) {
      // Generic: don't reveal that account exists but is deactivated
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // ── Check MFA ───────────────────────────────────────────────
    const mfaEnabled = user.mfaConfig?.isEnabled ?? false;
    if (mfaEnabled) {
      // Generate a temporary MFA session token (short-lived access token)
      const mfaSessionToken = generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan,
        orgId: user.orgId,
        isTrial: user.isTrial,
        trialEndsAt: user.trialEndsAt,
      });

      try {
        await recordLoginAttemptByEmail({
          email: normalizedEmail,
          ip,
          userAgent: ua,
          success: true,
        });
        await logAuthEvent({
          userId: user.id,
          action: 'signin',
          details: 'MFA required — awaiting TOTP verification',
          ipAddress: ip,
          userAgent: ua,
        });
      } catch {
        // Audit logging should never block login
      }

      return NextResponse.json({
        mfaRequired: true,
        mfaSessionToken,
        message: 'MFA verification required',
      });
    }

    // ── Generate tokens ─────────────────────────────────────────
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt,
    });

    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt,
    });

    // ── Create session ──────────────────────────────────────────
    await createSession({
      userId: user.id,
      refreshToken,
      deviceInfo: ua.substring(0, 255),
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Update last login ───────────────────────────────────────
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // ── Record successful login & audit ─────────────────────────
    try {
      await recordLoginAttemptByEmail({
        email: normalizedEmail,
        ip,
        userAgent: ua,
        success: true,
      });
      await logAuthEvent({
        userId: user.id,
        action: 'signin',
        details: 'Successful login',
        ipAddress: ip,
        userAgent: ua,
      });
    } catch {
      // Audit logging should never block login
    }

    // ── Suspicious login detection ──────────────────────────────
    try {
      const isSuspicious = await detectSuspiciousLogin({
        userId: user.id,
        ip,
        userAgent: ua,
      });

      if (isSuspicious) {
        // Fire and forget — don't block the login flow
        sendSecurityAlert({
          userId: user.id,
          email: user.email,
          name: user.name || 'User',
          event: 'Login from new device or location',
          ip,
          userAgent: ua,
        }).catch(() => {
          // Silently fail — never block login
        });
      }
    } catch {
      // Never block login due to suspicious detection failure
    }

    // ── Build response ──────────────────────────────────────────
    const response = NextResponse.json({
      message: 'Signed in successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan || 'free',
        orgId: user.orgId,
        emailVerified: user.emailVerified,
        mfaEnabled,
        avatarUrl: user.avatar,
      },
    });

    return setAuthCookies(response, accessToken, refreshToken);
  } catch (error) {
    console.error('Signin error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
