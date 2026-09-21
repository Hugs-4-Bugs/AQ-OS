import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  hashPassword,
  validateEmail,
  validatePasswordStrength,
  generateOTP,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  OTP_EXPIRY_SECONDS,
} from '@/lib/auth';
import { sendVerificationEmail, isEmailServiceConfigured } from '@/lib/email';
import { devOtpDelivery } from '@/lib/dev-auth';
import { withRateLimit } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
  // Rate limit: 5 auth requests per minute per IP to prevent bulk account creation
  const rateLimitResult = withRateLimit(request, 'auth');
  if (rateLimitResult) return rateLimitResult;

  try {
    const body = await request.json();
    const { name, email, password } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    if (typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Name must be at least 2 characters' },
        { status: 400 }
      );
    }

    if (typeof email !== 'string' || !validateEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password must be a string' },
        { status: 400 }
      );
    }

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { error: passwordCheck.errors.join('. ') },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Check for existing user ─────────────────────────────────
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      // USER REQUEST (2026-09-09): If the email is already registered (via ANY
      // method — Google, OTP, Magic Link, or email/password), tell the user
      // CLEARLY instead of pretending to send a verification email. This fixes
      // the confusing flow where signup with an existing email returned a
      // fake "check your inbox" message and no email ever arrived.
      return NextResponse.json(
        {
          error:
            'This email is already registered. Please log in instead — you can use Google, OTP, Magic Link, or your password (if you set one). Any login method on this platform works for a registered email.',
          emailRegistered: true,
          email: normalizedEmail,
        },
        { status: 409 }
      );
    }

    // ── Hash password ───────────────────────────────────────────
    const hashedPassword = await hashPassword(password);

    // ── Generate OTP for email verification ─────────────────────
    const verificationOtp = generateOTP();
    const verificationOtpExpiry = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    // ── Create user (ALWAYS requires email verification) ────────
    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: hashedPassword,
        role: 'owner',
        plan: 'free',
        authProvider: 'email',
        emailVerified: false,
        emailVerificationOtp: verificationOtp,
        emailVerificationOtpExpiry: verificationOtpExpiry,
        isTrial: true,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        settings: { create: {} },
        subscriptions: {
          create: {
            plan: 'free',
            status: 'trial',
            isTrial: true,
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
      include: { mfaConfig: { select: { isEnabled: true } } },
    });

    // ── Audit logging ───────────────────────────────────────────
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await logAuthEvent({
      userId: user.id,
      action: 'signup',
      details: `New account created for ${normalizedEmail}`,
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Send verification email (REAL Gmail SMTP delivery only) ───
    // No Ethereal / preview inbox fallback. The OTP is NEVER returned in
    // the response — the user must read it from their real email inbox.
    const emailConfigured = isEmailServiceConfigured();

    if (emailConfigured) {
      try {
        const result = await sendVerificationEmail(normalizedEmail, name.trim(), verificationOtp);
        console.log(
          `[Signup] Verification email sent: provider=${result.provider}, sent=${result.sent}, messageId=${result.messageId || 'n/a'}`,
        );
        if (result.sent) {
          await logAuthEvent({
            userId: user.id,
            action: 'email_verification_sent',
            details: 'Verification email sent after signup',
            ipAddress: ip,
            userAgent: ua,
          });
        } else {
          console.error('[Signup] Email delivery failed:', result.error);
        }
      } catch (emailError) {
        console.error('[Signup] Failed to send verification email:', emailError);
      }
    } else {
      console.error('[Signup] CRITICAL: No real email provider configured (SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY). User cannot verify their email.');
    }

    // DEV-ONLY: when no real email provider exists (sandbox/preview) surface
    // the generated verification code to the requesting client so the new
    // account can actually be verified and used. In production builds
    // devOtpDelivery() returns undefined and the response is unchanged.
    const devDelivery = emailConfigured ? undefined : devOtpDelivery(verificationOtp, 'verification code');

    return NextResponse.json(
      {
        message: 'Account created! Please check your email for a verification code.',
        requiresVerification: true,
        email: normalizedEmail,
        ...(devDelivery ? { devDelivery } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}