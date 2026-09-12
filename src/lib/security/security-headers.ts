// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Security Headers Middleware
// Phase 14.3: Security Hardening
//
// CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
// Permissions-Policy, HSTS, and X-Request-ID for request tracing.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ===== SECURITY HEADERS CONFIGURATION =====

interface SecurityHeadersConfig {
  contentSecurityPolicy: string;
  xFrameOptions: string;
  xContentTypeOptions: string;
  referrerPolicy: string;
  permissionsPolicy: string;
  hsts: string;
  xXssProtection: string;
  crossOriginOpenerPolicy: string;
  crossOriginEmbedderPolicy: string;
  crossOriginResourcePolicy: string;
}

/**
 * Get security headers configuration based on environment.
 */
function getSecurityHeadersConfig(): SecurityHeadersConfig {
  const isProduction = process.env.NODE_ENV === 'production';

  // In development, allow iframe embedding for the preview panel (space-z.ai)
  const frameAncestors = isProduction
    ? "frame-ancestors 'none'"
    : "frame-ancestors 'self' *.space-z.ai http://localhost:* http://127.0.0.1:*";

  return {
    contentSecurityPolicy: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires unsafe-eval/inline
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' https://fonts.gstatic.com",
      isProduction ? "connect-src 'self' https:" : "connect-src 'self' https: ws: wss:",
      frameAncestors,
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      isProduction ? "upgrade-insecure-requests" : "",
    ].filter(Boolean).join('; '),

    xFrameOptions: isProduction ? 'DENY' : 'SAMEORIGIN',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
    ].join(', '),

    hsts: isProduction
      ? 'max-age=31536000; includeSubDomains; preload'
      : 'max-age=0',

    xXssProtection: '1; mode=block',
    crossOriginOpenerPolicy: 'same-origin',
    crossOriginEmbedderPolicy: 'credentialless',
    crossOriginResourcePolicy: 'same-origin',
  };
}

// ===== REQUEST ID =====

/**
 * Generate a unique request ID for tracing.
 */
function generateRequestId(): string {
  return crypto.randomUUID();
}

// ===== SECURITY HEADERS MIDDLEWARE =====

/**
 * Apply security headers to a NextResponse object.
 */
export function applySecurityHeaders(response: NextResponse, requestId?: string): NextResponse {
  const config = getSecurityHeadersConfig();

  // Content Security Policy
  response.headers.set('Content-Security-Policy', config.contentSecurityPolicy);

  // Prevent clickjacking
  response.headers.set('X-Frame-Options', config.xFrameOptions);

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', config.xContentTypeOptions);

  // Referrer policy
  response.headers.set('Referrer-Policy', config.referrerPolicy);

  // Permissions policy
  response.headers.set('Permissions-Policy', config.permissionsPolicy);

  // HSTS (only in production with HTTPS)
  response.headers.set('Strict-Transport-Security', config.hsts);

  // XSS Protection (legacy but still useful)
  response.headers.set('X-XSS-Protection', config.xXssProtection);

  // Cross-origin policies
  response.headers.set('Cross-Origin-Opener-Policy', config.crossOriginOpenerPolicy);
  response.headers.set('Cross-Origin-Embedder-Policy', config.crossOriginEmbedderPolicy);
  response.headers.set('Cross-Origin-Resource-Policy', config.crossOriginResourcePolicy);

  // Request ID for tracing
  const rid = requestId || generateRequestId();
  response.headers.set('X-Request-ID', rid);

  // Cache control for API responses
  if (!response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }

  return response;
}

/**
 * Security headers middleware for API routes.
 * Creates a new response with security headers, or applies them to an existing response.
 *
 * Usage:
 *   export async function GET(request: NextRequest) {
 *     const secHeaders = withSecurityHeaders(request);
 *     // ... your handler logic
 *     return secHeaders.apply(NextResponse.json({ data: 'hello' }));
 *   }
 *
 * Or simpler:
 *   return withSecurityHeaders(request).wrap(NextResponse.json({ data: 'hello' }));
 */
export function withSecurityHeaders(request: NextRequest): {
  /** Apply security headers to a response */
  apply: (response: NextResponse) => NextResponse;
  /** Get the request ID for this request */
  getRequestId: () => string;
  /** Wrap a response with security headers (alias for apply) */
  wrap: (response: NextResponse) => NextResponse;
} {
  // Check for existing request ID from upstream (e.g., load balancer)
  const existingId = request.headers.get('X-Request-ID');
  const requestId = existingId || generateRequestId();

  return {
    apply: (response: NextResponse) => applySecurityHeaders(response, requestId),
    getRequestId: () => requestId,
    wrap: (response: NextResponse) => applySecurityHeaders(response, requestId),
  };
}

/**
 * Get the current CSP header value for debugging or reporting.
 */
export function getCspHeader(): string {
  return getSecurityHeadersConfig().contentSecurityPolicy;
}

/**
 * Create a CSP report-only header (for testing new CSP rules).
 */
export function getCspReportOnlyHeader(reportUri: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    `report-uri ${reportUri}`,
  ].join('; ');
}
