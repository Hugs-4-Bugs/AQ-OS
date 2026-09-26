import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  validateEmail,
  generateMagicLinkToken,
  logAuthEvent,
  getClientIp,
  getUserAgent,
  classifyAuthErrorCategory,
} from '@/lib/auth';
import { sendMagicLinkEmail, isEmailServiceConfigured } from '@/lib/email';
import { devMagicLinkDelivery } from '@/lib/dev-auth';
import { withRateLimit, refundRateLimit, authRateKeySuffix } from '@/lib/security/rate-limiter';
import { getAppUrl } from '@/lib/app-url';

const MAGIC_LINK_EXPIRY_SECONDS = 15 * 60; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, rememberMe } = body;

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

    // ── Rate limit (P9): DEDICATED 'magic_link' bucket keyed by IP+email ──
    const rateLimitResult = withRateLimit(request, 'magic_link', {
      keySuffix: authRateKeySuffix(normalizedEmail),
    });
    if (rateLimitResult) return rateLimitResult;

    // P5: Remember-me travels WITH the link (the click is a fresh GET).
    const rememberMeFlag = rememberMe === true || rememberMe === 'true' || rememberMe === '1';

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
    const magicLinkUrl = `${baseUrl}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}${rememberMeFlag ? '&remember=1' : ''}`;

    // SECURITY: never log the full magic-link URL — it contains the login
    // token. Log only host diagnostics so delivery issues stay debuggable.
    console.warn(`[Magic Link Request] APP_URL env: ${APP_URL || 'NOT SET'}`);
    console.warn(`[Magic Link Request] BASE URL: ${baseUrl}`);
    console.warn(`[Magic Link Request] magic link generated (token withheld from logs)`);
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
      // P8: do NOT pretend an email was sent.
      refundRateLimit(request, 'magic_link', { keySuffix: authRateKeySuffix(normalizedEmail) });
      const devDelivery = devMagicLinkDelivery(magicLinkUrl);
      if (devDelivery) {
        // DEV-ONLY sandbox escape hatch (AUTH_DEV_MODE) — undefined in production.
        return NextResponse.json({
          message: 'Email delivery is not configured on this server. Development mode: your sign-in link was generated locally and can be opened below.',
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

    // If email delivery genuinely failed, surface a CLEAR failure (P8).
    if (!emailSent) {
      refundRateLimit(request, 'magic_link', { keySuffix: authRateKeySuffix(normalizedEmail) });
      return NextResponse.json(
        {
          error: 'We could not deliver your sign-in link right now due to a temporary email service issue. Please try again shortly.',
          code: 'EMAIL_DELIVERY_FAILED',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      message: 'If an account exists with this email, a magic link has been sent.',
    });
  } catch (error) {
    // SAFE error handling: generic message to the browser; stable category
    // code in the server log for diagnosability (no secrets, no stacks).
    console.error(`[Magic Link Request] 500 category=${classifyAuthErrorCategory(error)}`, error instanceof Error ? error.message : error);
    refundRateLimit(request, 'magic_link', {});
    return NextResponse.json(
      { error: 'Unable to send the sign-in link right now. Please try again in a moment.', code: 'INFRASTRUCTURE_ERROR' },
      { status: 503 }
    );
  }
}