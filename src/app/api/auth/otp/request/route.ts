import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  validateEmail,
  generateOTP,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  OTP_EXPIRY_SECONDS,
  classifyAuthErrorCategory,
} from '@/lib/auth';
import { sendOtpLoginEmail, isEmailServiceConfigured } from '@/lib/email';
import { devOtpDelivery } from '@/lib/dev-auth';
import { withRateLimit, refundRateLimit, authRateKeySuffix } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
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

    // ── Rate limit (P9): DEDICATED 'otp' bucket keyed by IP+email ──
    // No longer shares the 5/min 'auth' bucket with magic-link/refresh/
    // signin, so a magic-link user behind the same gateway can no longer
    // exhaust the OTP quota (and vice versa).
    const rateLimitResult = withRateLimit(request, 'otp', {
      keySuffix: authRateKeySuffix(normalizedEmail),
    });
    if (rateLimitResult) return rateLimitResult;

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
      // P8: do NOT pretend an email was sent. When the runtime genuinely
      // lost its email configuration, fail CLEARLY with 503 so the client
      // shows an error instead of "check your inbox".
      refundRateLimit(request, 'otp', { keySuffix: authRateKeySuffix(normalizedEmail) });
      const devDelivery = devOtpDelivery(otp, 'login code');
      if (devDelivery) {
        // DEV-ONLY sandbox escape hatch (AUTH_DEV_MODE) — undefined in production.
        return NextResponse.json({
          message: 'Email delivery is not configured on this server. Development mode: your login code is shown below so you can continue.',
          deliveryIssue: false,
          ...(devDelivery ? { devDelivery } : {}),
        });
      }
      return NextResponse.json(
        {
          error: 'Email delivery is temporarily unavailable (the server has no mail provider configured). Please contact support.',
          code: 'EMAIL_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    let emailSent = false;
    let emailError: string | undefined;
    let emailProvider: string | undefined;
    let emailMessageId: string | undefined;
    try {
      const result = await sendOtpLoginEmail(normalizedEmail, user.name || 'User', otp);
      emailSent = result.sent;
      emailError = result.error;
      emailProvider = result.provider;
      emailMessageId = result.messageId;
      if (result.sent) {
        console.log(`OTP email result: success — provider=${result.provider}, messageId=${result.messageId || 'n/a'}`);
      } else {
        console.log(`OTP email result: failed — ${result.error || 'unknown error'}`);
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error(`OTP email result: failed — ${emailError}`);
    }

    // ── Safe delivery diagnostics (SECURITY: the OTP itself is NEVER
    // logged — only recipient DOMAIN, provider, status, message id and a
    // coarse failure category, so delivery issues stay debuggable without
    // exposing credentials, codes, or full PII) ────────────────────────
    {
      const recipientDomain = normalizedEmail.split('@')[1] || 'unknown';
      const failureCategory = !emailSent
        ? /535|invalid|auth/i.test(emailError || '')
          ? 'smtp_auth'
          : /quota|daily limit|5\.4\.5/i.test(emailError || '')
            ? 'provider_quota'
            : /timeout|connect|network|fetch|socket/i.test(emailError || '')
              ? 'network'
              : 'unknown'
        : 'none';
      console.log(
        `[OTP Delivery] recipientDomain=${recipientDomain} provider=${emailProvider || 'none'} ` +
        `attempted=true sent=${emailSent} messageId=${emailMessageId || 'n/a'} failureCategory=${failureCategory}`
      );
    }

    // If email delivery genuinely failed, surface a CLEAR failure — the
    // user must not be told to check an inbox that will stay empty (P8).
    if (!emailSent) {
      // Delivery failure is a server-side/provider problem, not abuse —
      // refund the slot so the user's legitimate retry is not 429-blocked.
      refundRateLimit(request, 'otp', { keySuffix: authRateKeySuffix(normalizedEmail) });
      return NextResponse.json(
        {
          error: 'We could not deliver your login code right now due to a temporary email service issue. Please try again shortly.',
          code: 'EMAIL_DELIVERY_FAILED',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      message: 'If an account exists with this email, an OTP has been sent.',
    });
  } catch (error) {
    // SAFE error handling: the browser gets a generic, non-sensitive message;
    // the server log carries a stable category code so the real root cause
    // (e.g. database unavailable, SMTP down) stays diagnosable in dev.log.
    // P9: infrastructure failures refund the rate-limit slot so an outage
    // cannot lock the user out with 429s once the service recovers.
    console.error(`[OTP Request] 500 category=${classifyAuthErrorCategory(error)}`, error instanceof Error ? error.message : error);
    refundRateLimit(request, 'otp', {});
    return NextResponse.json(
      { error: 'Unable to send the login code right now. Please try again in a moment.', code: 'INFRASTRUCTURE_ERROR' },
      { status: 503 }
    );
  }
}