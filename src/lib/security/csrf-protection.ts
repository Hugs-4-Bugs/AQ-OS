// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — CSRF Protection
// Phase 14.3: Security Hardening
//
// Double-submit cookie pattern with crypto.randomBytes token generation,
// origin/referer validation, and exempt paths for webhooks and health.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ===== CONSTANTS =====

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_TOKEN_LENGTH = 32;

// Paths that are exempt from CSRF protection
const CSRF_EXEMPT_PATHS = [
  '/api/webhooks/',
  '/api/health/',
  '/api/metrics',
];

// State-changing methods that require CSRF protection
const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// ===== TOKEN GENERATION =====

/**
 * Generate a cryptographically secure CSRF token.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Generate a CSRF token and set it as a cookie on the response.
 * Returns the generated token.
 */
export function setCsrfCookie(response: NextResponse): string {
  const token = generateCsrfToken();

  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by JavaScript for double-submit
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return token;
}

// ===== CSRF VALIDATION =====

/**
 * Check if a path is exempt from CSRF protection.
 */
function isExemptPath(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some(exempt => pathname.startsWith(exempt));
}

/**
 * Validate the origin/referer header against the request.
 * Prevents CSRF by ensuring the request came from an allowed origin.
 */
function validateOriginReferer(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // If both are missing, this might be a non-browser client (e.g., curl, Postman)
  // Allow these to pass — they should use API keys or Bearer tokens
  if (!origin && !referer) {
    // Check for API authentication headers
    const authHeader = request.headers.get('authorization');
    const apiKey = request.headers.get('x-api-key');
    if (authHeader || apiKey) {
      return true;
    }
    // For browser requests without origin/referer, block in production
    return process.env.NODE_ENV !== 'production';
  }

  // Check origin
  if (origin) {
    const allowedOrigins = getAllowedOrigins();
    if (allowedOrigins.has(origin)) {
      return true;
    }
    // Check wildcard patterns
    for (const allowed of allowedOrigins) {
      if (allowed.startsWith('*.')) {
        const domain = allowed.slice(2);
        if (origin.endsWith(domain) || origin.endsWith(`.${domain}`)) {
          return true;
        }
      }
    }
    return false;
  }

  // Fallback to referer
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      const allowedOrigins = getAllowedOrigins();
      if (allowedOrigins.has(refererOrigin)) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Get allowed origins from environment.
 */
function getAllowedOrigins(): Set<string> {
  const envOrigins = process.env.ALLOWED_ORIGINS || '';
  const origins = envOrigins
    .split(',')
    .map(o => o.trim())
    .filter(o => o.length > 0);

  if (process.env.NODE_ENV !== 'production') {
    // Only add localhost if the app isn't running on a remote preview domain
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
    if (!appUrl || appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
      origins.push('http://localhost:3000');
      origins.push('http://127.0.0.1:3000');
    }
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.push(process.env.NEXT_PUBLIC_APP_URL);
  }

  return new Set(origins);
}

/**
 * Validate the double-submit cookie CSRF token.
 * The token in the cookie must match the token in the header.
 */
function validateDoubleSubmitToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(cookieToken, 'utf-8'),
      Buffer.from(headerToken, 'utf-8')
    );
  } catch {
    return false;
  }
}

// ===== CSRF MIDDLEWARE =====

/**
 * CSRF protection middleware for API routes.
 *
 * Validates state-changing requests using:
 * 1. Origin/Referer header validation
 * 2. Double-submit cookie pattern (X-CSRF-Token header matches csrf_token cookie)
 * 3. SameSite cookie enforcement (handled by cookie settings)
 *
 * Exempt paths: /api/webhooks/*, /api/health/*
 *
 * Usage:
 *   export async function POST(request: NextRequest) {
 *     const csrfError = withCsrfProtection(request);
 *     if (csrfError) return csrfError;
 *     // ... normal handler logic
 *   }
 */
export function withCsrfProtection(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  // Only protect state-changing methods
  if (!CSRF_PROTECTED_METHODS.has(request.method)) {
    return null;
  }

  // Skip exempt paths
  if (isExemptPath(pathname)) {
    return null;
  }

  // Method 1: Validate origin/referer
  if (validateOriginReferer(request)) {
    return null; // Origin is valid, allow the request
  }

  // Method 2: Double-submit cookie validation
  if (validateDoubleSubmitToken(request)) {
    return null; // CSRF token matches, allow the request
  }

  // Method 3: Check for X-Requested-With header (AJAX requests)
  const requestedWith = request.headers.get('X-Requested-With');
  if (requestedWith === 'XMLHttpRequest') {
    return null; // Custom header indicates intentional request, not CSRF
  }

  // Method 4: Check for Bearer token authentication
  // API clients using Bearer tokens are inherently CSRF-safe
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return null; // Bearer tokens can't be sent by browsers cross-origin
  }

  // All validation methods failed — reject
  return NextResponse.json(
    {
      error: 'CSRF validation failed',
      message: 'Missing or invalid CSRF token. Include X-CSRF-Token header or X-Requested-With header.',
    },
    { status: 403 }
  );
}

/**
 * Convenience function to generate a CSRF token endpoint.
 * Call this from an API route to provide tokens to the frontend.
 */
export function handleCsrfTokenRequest(request: NextRequest): NextResponse {
  const response = NextResponse.json({
    token: generateCsrfToken(),
  });

  setCsrfCookie(response);
  return response;
}
