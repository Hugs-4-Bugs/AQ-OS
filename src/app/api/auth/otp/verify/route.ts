import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  validateEmail,
  generateAccessToken,
  generateRefreshToken,
  createSession,
  isAccountLocked,
  recordLoginAttemptByEmail,
  recordLoginAttempt,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  setAuthCookies,
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
    const { email, otp } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!email || !otp) {
      return NextResponse.json(
        { error: 'Email and OTP are required' },
        { status: 400 }
      );
    }

    if (typeof email !== 'string' || !validateEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
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

    // ── Check account lockout ───────────────────────────────────
    if (await isAccountLocked(normalizedEmail)) {
      const user = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (user) {
        await logAuthEvent({
          userId: user.id,
          action: 'signin_failed',
          details: `Account locked during OTP login: ${normalizedEmail}`,
          ipAddress: ip,
          userAgent: ua,
        });
      }
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
      return NextResponse.json(
        { error: 'Invalid email or OTP' },
        { status: 401 }
      );
    }

    // ── Check OTP lockout ───────────────────────────────────────
    if (await isOtpLocked(user.id)) {
      return NextResponse.json(
        { error: 'Too many failed OTP attempts. Please request a new one.' },
        { status: 423 }
      );
    }

    // ── Verify OTP from user record (constant-time comparison) ──
    if (!user.loginOtp || !user.loginOtpExpiry) {
      return NextResponse.json(
        { error: 'No OTP found. Please request a new one.' },
        { status: 400 }
      );
    }

    if (!secureCompare(user.loginOtp, otp)) {
      // Record failed attempt for brute-force protection
      await recordLoginAttemptByEmail({
        email: normalizedEmail,
        ip,
        userAgent: ua,
        success: false,
        failReason: 'Invalid OTP login code',
      });

      const { locked } = await incrementOtpAttempts(user.id);

      await logAuthEvent({
        userId: user.id,
        action: 'signin_failed',
        details: 'Invalid OTP login code',
        ipAddress: ip,
        userAgent: ua,
      });

      if (locked) {
        return NextResponse.json(
          { error: 'Too many failed attempts. Please request a new OTP.' },
          { status: 423 }
        );
      }

      return NextResponse.json(
        { error: 'Invalid email or OTP' },
        { status: 401 }
      );
    }

    if (new Date() > user.loginOtpExpiry) {
      return NextResponse.json(
        { error: 'OTP expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // ── Clear OTP fields & reset attempts ───────────────────────
    await db.user.update({
      where: { id: user.id },
      data: {
        loginOtp: null,
        loginOtpExpiry: null,
      },
    });
    await resetOtpAttempts(user.id);

    // ── Check email verified status ─────────────────────────────
    if (!user.emailVerified) {
      // Anti-enumeration: don't reveal whether account exists or email verified status
      return NextResponse.json(
        { error: 'Invalid email or OTP' },
        { status: 401 }
      );
    }

    // ── Check if account is active ──────────────────────────────
    if (!user.isActive) {
      // Anti-enumeration: don't reveal that account exists but is deactivated
      return NextResponse.json(
        { error: 'Invalid email or OTP' },
        { status: 401 }
      );
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
    await recordLoginAttempt({
      userId: user.id,
      ip,
      userAgent: ua,
      success: true,
    });

    await logAuthEvent({
      userId: user.id,
      action: 'otp_login',
      details: 'Successful OTP login',
      ipAddress: ip,
      userAgent: ua,
    });

    await logAuthEvent({
      userId: user.id,
      action: 'signin',
      details: 'Successful login via OTP',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Build response ──────────────────────────────────────────
    const mfaEnabled = user.mfaConfig?.isEnabled ?? false;

    const response = NextResponse.json({
      message: 'Signed in successfully via OTP',
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
    console.error('OTP verify error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
