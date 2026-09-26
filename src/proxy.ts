// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Next.js Proxy for Route Protection + CSRF + Security
// Phase 3: Auth + Authorization + Session Security + RBAC
//
// Uses `jose` (Edge Runtime compatible) instead of `jsonwebtoken`
// to verify JWTs — Node.js-only modules are not available in
// Next.js proxy which runs in the Edge Runtime.
//
// SECURITY NOTE (hardening pass): PUBLIC_ROUTES previously contained
// '/' which — with prefix matching — made EVERY request public and
// silently disabled JWT verification, CSRF, the admin gate and user
// header injection. The list now contains only genuinely public API
// surfaces; page routes still pass through (the SPA handles its own
// auth via /api/auth/me).
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Must match the secret used in auth.ts. In production the secret is
// mandatory — the proxy fails closed instead of falling back to the
// publicly-known dev value.
const DEV_FALLBACK_SECRET = 'acquisitionos-dev-secret-change-in-production';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === DEV_FALLBACK_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      // Fail closed: refuse to run the protection layer on a known/dev secret.
      throw new Error('FATAL: JWT_SECRET is missing or set to the public dev fallback value in production.');
    }
    return DEV_FALLBACK_SECRET;
  }
  return secret;
}

// Routes that don't require authentication (exact prefixes).
// Every entry here is protected by its OWN server-side mechanism
// (route-level auth, provider signature verification, or CRON_SECRET).
const PUBLIC_ROUTES = [
  // Auth flows (self-gated: rate limiting + per-account lockouts)
  '/api/auth/signin',
  '/api/auth/signup',
  '/api/auth/verify-email',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/refresh',
  '/api/auth/mfa/verify',
  '/api/auth/magic-link',
  '/api/auth/google',
  '/api/auth/callback/',  // Google OAuth callback
  '/api/auth/otp',
  '/api/auth/resend-verification',
  '/api/auth/config',           // public login-method discovery
  '/api/auth/email-diagnostic', // CRON_SECRET-gated inside the route
  // Health probes (load balancers / uptime monitors)
  '/api/health',
  // Cron endpoints (CRON_SECRET Bearer auth inside each route)
  '/api/cron/',
  '/api/meetings/reminders/process', // external scheduler, CRON_SECRET inside
  // Provider webhooks (signature verification inside each route)
  '/api/payments/webhook/stripe',
  '/api/payments/webhook/razorpay',
  '/api/whatsapp/meta/webhook',
  '/api/whatsapp/twilio/webhook',
  '/api/telegram/webhook',
  '/api/calendar/webhook',
  '/api/gmail/pubsub/webhook',
  '/api/workflows/webhook/',   // per-workflow HMAC secret inside the route
  // Email-client-facing endpoints (opened from mail apps — no cookies)
  '/api/email/tracking/',
  '/api/gmail/tracking/',
  '/api/gmail/unsubscribe',
  // Token-bearing public surfaces (token IS the credential)
  '/api/team/invite/',         // GET by invitation token (POST re-checks auth)
  '/api/analytics/share/',     // shared dashboard access tokens
  // Payment return/verification shims and public catalog
  '/api/payments/stripe-success',
  '/api/payments/verify-session',
  '/api/payments/provider-status',
  '/api/payments/credit-addons',
  // Anonymous crash reporting (rate-limited inside the route)
  '/api/feedback/crash',
];

// State-changing HTTP methods that require CSRF protection
const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// Security headers to apply to all responses
const isDev = process.env.NODE_ENV === 'development';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': isDev ? 'SAMEORIGIN' : 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https: ws: wss:; frame-ancestors 'self' *.space-z.ai http://localhost:* http://127.0.0.1:*"
      : "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https:; frame-ancestors 'none'",
};

// HSTS is only meaningful (and only safe) on HTTPS production traffic.
if (!isDev) {
  SECURITY_HEADERS['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
}

// Routes that require admin role at the edge (route handlers re-verify
// authorization independently — this is defense in depth only)
const ADMIN_ROUTES = [
  '/api/admin/',
];

// Client-supplied identity headers are never trusted: they are stripped
// from every inbound request and (for authenticated API calls) replaced
// with values derived from the verified JWT.
const IDENTITY_HEADERS = ['x-user-id', 'x-user-email', 'x-user-role', 'x-user-plan', 'x-user-org'];

interface MiddlewareJwtPayload {
  sub: string;
  email: string;
  role: string;
  plan: string;
  orgId: string | null;
  type: 'access' | 'refresh' | 'mfa';
}

/** Strip client-supplied identity headers so they can never be spoofed downstream */
function sanitizeHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const header of IDENTITY_HEADERS) {
    headers.delete(header);
  }
  return headers;
}

/** Apply security headers to a response */
function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/** Validate CSRF protection for state-changing requests */
function validateCsrf(request: NextRequest): boolean {
  // If the request has a valid access_token cookie, same-site cookies
  // provide CSRF protection (SameSite=Strict)
  const accessToken = request.cookies.get('access_token')?.value;
  if (accessToken) {
    return true;
  }

  // Any Authorization header (API key OR Bearer JWT) is CSRF-immune:
  // cross-site request forgery cannot forge attacker-chosen headers.
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return true;
  }

  // For legacy API clients without an Authorization header, require a
  // custom header to prove the request is intentional (not CSRF)
  const requestedWith = request.headers.get('X-Requested-With');
  if (requestedWith === 'XMLHttpRequest') {
    return true;
  }

  // No CSRF protection — reject
  return false;
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sanitizedHeaders = sanitizeHeaders(request);

  // ── CSRF protection for state-changing API methods ────────────
  if (CSRF_PROTECTED_METHODS.has(request.method) && pathname.startsWith('/api/')) {
    // Public auth routes have their own rate limiting and abuse guards
    if (!isPublicRoute(pathname) && !validateCsrf(request)) {
      const response = NextResponse.json(
        { error: 'CSRF validation failed. Include access_token cookie, Authorization header, or X-Requested-With header.' },
        { status: 403 }
      );
      return applySecurityHeaders(response);
    }
  }

  // ── Allow public routes (headers still sanitized + secured) ───
  if (isPublicRoute(pathname)) {
    const response = NextResponse.next({ request: { headers: sanitizedHeaders } });
    return applySecurityHeaders(response);
  }

  // ── Only protect /api/ routes ─────────────────────────────────
  // (the main app is a client-rendered SPA; page routes pass through)
  if (!pathname.startsWith('/api/')) {
    const response = NextResponse.next({ request: { headers: sanitizedHeaders } });
    return applySecurityHeaders(response);
  }

  // ── Production secret guard (fail closed) ─────────────────────
  let secretKey: Uint8Array;
  try {
    secretKey = new TextEncoder().encode(getJwtSecret());
  } catch (error) {
    console.error('[proxy]', error instanceof Error ? error.message : 'JWT secret guard failed');
    const response = NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    return applySecurityHeaders(response);
  }

  // ── Try to get auth token from cookie or Authorization header ─
  const accessToken = request.cookies.get('access_token')?.value ||
                      request.headers.get('authorization')?.replace('Bearer ', '');

  if (!accessToken) {
    const response = NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return applySecurityHeaders(response);
  }

  // ── API Key Bearer token: let route handlers verify ───────────
  if (accessToken.startsWith('aq_live_') || accessToken.startsWith('aq_test_')) {
    const response = NextResponse.next({ request: { headers: sanitizedHeaders } });
    return applySecurityHeaders(response);
  }

  // ── Verify JWT using jose (Edge Runtime compatible) ───────────
  try {
    const { payload } = await jwtVerify<MiddlewareJwtPayload>(accessToken, secretKey, {
      issuer: 'acquisitionos',
      audience: 'acquisitionos-api',
    });

    // Only post-MFA access tokens grant API access. Refresh tokens and
    // pending-MFA tokens are rejected at the edge.
    if (!payload || payload.type !== 'access') {
      const response = NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
      return applySecurityHeaders(response);
    }

    // ── Add user info to request headers for downstream use ─────
    const requestHeaders = new Headers(sanitizedHeaders);
    requestHeaders.set('x-user-id', payload.sub);
    requestHeaders.set('x-user-email', payload.email);
    requestHeaders.set('x-user-role', payload.role);
    requestHeaders.set('x-user-plan', payload.plan);
    requestHeaders.set('x-user-org', payload.orgId || '');

    // ── Admin route protection (defense in depth) ────────────────
    if (ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
      const role = payload.role;
      if (!['super_admin', 'owner', 'admin'].includes(role)) {
        const response = NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        return applySecurityHeaders(response);
      }
    }

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    return applySecurityHeaders(response);
  } catch {
    const response = NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    return applySecurityHeaders(response);
  }
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
