import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  validateEmail,
  generateMagicLinkToken,
  logAuthEvent,
  getClientIp,
  getUserAgent,
} from '@/lib/auth';
import { sendMagicLinkEmail, isEmailServiceConfigured } from '@/lib/email';
import { withRateLimit } from '@/lib/security/rate-limiter';
import { getAppUrl } from '@/lib/app-url';

const MAGIC_LINK_EXPIRY_SECONDS = 15 * 60; // 15 minutes

export async function POST(request: NextRequest) {
  // Rate limit: 5 auth requests per minute per IP
  const rateLimitResult = withRateLimit(request, 'auth');
  if (rateLimitResult) return rateLimitResult;

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

    // ── Find user (return same message regardless of existence) ──
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json({
        message: 'If an account exists with this email, a magic link has been sent.',
      });
    }

    // ── Rate limit: don't allow new magic link if previous one is still fresh (< 60s old) ──
    if (
      user.magicLinkTokenExpiry &&
      new Date() < new Date(user.magicLinkTokenExpiry.getTime() - (MAGIC_LINK_EXPIRY_SECONDS - 60) * 1000)
    ) {
      return NextResponse.json(
        { error: 'Please wait before requesting a new magic link.' },
        { status: 429 }
      );
    }

    // ── Generate magic link token & store on user record ─────────
    const token = generateMagicLinkToken();
    const tokenExpiry = new Date(Date.now() + MAGIC_LINK_EXPIRY_SECONDS * 1000);

    await db.user.update({
      where: { id: user.id },
      data: {
        magicLinkToken: token,
        magicLinkTokenExpiry: tokenExpiry,
      },
    });

    // ── Build the magic link URL ────────────────────────────────
    // FIX (2026-09-09): Always use APP_URL from environment so the
    // magic link email contains the public preview URL the user
    // actually clicked "Send magic link" from — not localhost:3000
    // (which is what new URL(request.url).origin would yield because
    // the server binds to 0.0.0.0) and not the FC internal hostname.
    //
    // We validate APP_URL is a PUBLIC https URL (rejects localhost,
    // 127.0.0.1, 0.0.0.0, private RFC1918 ranges, and cloud-internal
    // hostnames like *.fcapp.run / *.aliyuncs.com). If APP_URL is
    // missing or points at an internal host, we fall back to
    // getAppUrl(request) which derives the public origin from
    // x-forwarded-host / Origin / Referer headers.
    const APP_URL = process.env.APP_URL;
    const isPublicAppUrl = (url: string | undefined): url is string => {
      if (!url || !/^https?:\/\//.test(url)) return false;
      try {
        const u = new URL(url);
        const h = u.hostname.toLowerCase();
        if (
          h === 'localhost' ||
          h.startsWith('127.') ||
          h.startsWith('0.0.0.0') ||
          h.startsWith('10.') ||
          h.startsWith('192.168.') ||
          h.startsWith('172.') ||
          h.includes('.fcapp.run') ||
          h.includes('.aliyuncs.com') ||
          h.includes('.functioncompute.com')
        ) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    };
    const baseUrl = isPublicAppUrl(APP_URL)
      ? APP_URL.replace(/\/+$/, '')
      : getAppUrl(request);
    const magicLinkUrl = `${baseUrl}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`;

    // CRITICAL LOG: Shows the EXACT URL that will be emailed to the user.
    console.warn(`[Magic Link Request] APP_URL env: ${APP_URL || 'NOT SET'}`);
    console.warn(`[Magic Link Request] BASE URL: ${baseUrl}`);
    console.warn(`[Magic Link Request] FULL MAGIC LINK URL: ${magicLinkUrl}`);
    console.warn(`[Magic Link Request] request.host header: ${request.headers.get('host') || 'NONE'}`);
    console.warn(`[Magic Link Request] x-forwarded-host: ${request.headers.get('x-forwarded-host') || 'NONE'}`);
    console.warn(`[Magic Link Request] origin header: ${request.headers.get('origin') || 'NONE'}`);

    // ── Audit log ───────────────────────────────────────────────
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    await logAuthEvent({
      userId: user.id,
      action: 'magic_link_sent',
      details: 'Magic link token generated',
      ipAddress: ip,
      userAgent: ua,
    });

    // ── Send magic link via email (REAL Gmail SMTP delivery only) ──
    // No Ethereal / preview inbox fallback. If delivery fails, the user
    // sees a clear error message.
    const emailConfigured = isEmailServiceConfigured();

    if (!emailConfigured) {
      console.error('[Magic Link] CRITICAL: No real email provider configured (SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY).');
      return NextResponse.json({
        message: 'If an account exists with this email, a magic link has been sent.',
        deliveryIssue: true,
        deliveryMessage: 'Email delivery is not configured on the server. Please contact support.',
      });
    }

    let emailSent = false;
    try {
      const result = await sendMagicLinkEmail(normalizedEmail, user.name || 'User', magicLinkUrl);
      emailSent = result.sent;
      if (result.sent) {
        console.log(`Magic link email result: success — provider=${result.provider}, messageId=${result.messageId || 'n/a'}`);
      } else {
        console.log(`Magic link email result: failed — ${result.error || 'unknown error'}`);
      }
    } catch (err) {
      console.error(`Magic link email result: failed — ${err instanceof Error ? err.message : String(err)}`);
    }

    // If email delivery genuinely failed, surface a clear error.
    if (!emailSent) {
      return NextResponse.json({
        message: 'If an account exists with this email, a magic link has been sent.',
        deliveryIssue: true,
        deliveryMessage:
          'We could not deliver your magic link right now due to a temporary email service issue. Please try again later, or contact support if the problem persists.',
      });
    }

    return NextResponse.json({
      message: 'If an account exists with this email, a magic link has been sent.',
    });
  } catch (error) {
    console.error('Magic link request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}