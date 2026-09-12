// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — CORS Configuration
// Phase 14.3: Security Hardening
//
// Strict CORS enforcement from ALLOWED_ORIGINS environment variable.
// Blocks null origins in production. Provides withCors() middleware.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

// ===== CONFIGURATION =====

/**
 * Parse allowed origins from environment variable.
 * ALLOWED_ORIGINS should be a comma-separated list of origins.
 * Example: https://app.example.com,https://admin.example.com
 */
function getAllowedOrigins(): Set<string> {
  const envOrigins = process.env.ALLOWED_ORIGINS || '';
  const origins = envOrigins
    .split(',')
    .map(o => o.trim())
    .filter(o => o.length > 0);

  // In development, allow localhost only if no remote preview URL is configured
  if (process.env.NODE_ENV !== 'production') {
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

// Cache the origins set (refresh on module reload)
let cachedOrigins: Set<string> | null = null;

function getOrigins(): Set<string> {
  if (!cachedOrigins) {
    cachedOrigins = getAllowedOrigins();
  }
  return cachedOrigins;
}

// ===== CORS METHODS & HEADERS =====

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'X-Request-ID',
  'X-User-Id',
  'X-User-Email',
  'X-User-Role',
  'X-User-Plan',
  'X-User-Org',
  'X-CSRF-Token',
  'Accept',
  'Origin',
];
const EXPOSED_HEADERS = [
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'X-Request-ID',
];
const MAX_AGE = 86400; // 24 hours

// ===== CORS VALIDATION =====

/**
 * Validate the origin of a request against allowed origins.
 * Returns the origin string if valid, null otherwise.
 */
export function validateOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Block null origins in production
  if (process.env.NODE_ENV === 'production') {
    if (origin === 'null' || origin === '') {
      return null;
    }
    if (!origin && !referer) {
      return null;
    }
  }

  // If no origin header (same-origin requests, server-to-server), allow
  if (!origin) {
    // Check referer as fallback
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
        if (getOrigins().has(refererOrigin)) {
          return refererOrigin;
        }
      } catch {
        return null;
      }
    }
    // No origin and no referer — could be a direct API call
    // Allow for non-browser clients but log in production
    return null;
  }

  // Check against allowed origins
  const allowedOrigins = getOrigins();
  if (allowedOrigins.has(origin)) {
    return origin;
  }

  // Check wildcard subdomain patterns
  for (const allowed of allowedOrigins) {
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2); // Remove *.
      if (origin.endsWith(domain) || origin.endsWith(`.${domain}`)) {
        return origin;
      }
    }
  }

  return null;
}

// ===== CORS MIDDLEWARE =====

/**
 * Apply CORS headers to a response.
 * Returns the modified response with CORS headers set.
 */
export function applyCorsHeaders(
  request: NextRequest,
  response: NextResponse,
  allowedOrigin?: string | null
): NextResponse {
  const origin = allowedOrigin ?? validateOrigin(request);

  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
    response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
    response.headers.set('Access-Control-Expose-Headers', EXPOSED_HEADERS.join(', '));
    response.headers.set('Access-Control-Max-Age', String(MAX_AGE));
  } else {
    // No CORS headers for disallowed origins
    response.headers.set('Access-Control-Allow-Origin', 'null');
  }

  return response;
}

/**
 * CORS middleware for API routes.
 * Handles preflight OPTIONS requests and adds CORS headers to all responses.
 *
 * Usage:
 *   export async function GET(request: NextRequest) {
 *     const corsResult = withCors(request);
 *     if (corsResult) return corsResult; // Preflight response
 *     // ... normal handler logic, then applyCorsHeaders to your response
 *   }
 */
export function withCors(request: NextRequest): NextResponse | null {
  const origin = validateOrigin(request);

  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    if (!origin) {
      return new NextResponse(null, { status: 403 });
    }

    const response = new NextResponse(null, { status: 204 });
    return applyCorsHeaders(request, response, origin);
  }

  // For non-OPTIONS requests, return null to continue processing
  // The caller should use applyCorsHeaders on their response
  return null;
}

/**
 * Full CORS wrapper that handles both preflight and adds headers
 * to the final response.
 *
 * Usage:
 *   export async function GET(request: NextRequest) {
 *     return withCorsHandler(request, async (req) => {
 *       // ... your handler logic
 *       return NextResponse.json({ data: 'hello' });
 *     });
 *   }
 */
export async function withCorsHandler(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  // Handle preflight
  const preflightResponse = withCors(request);
  if (preflightResponse) return preflightResponse;

  // Validate origin for non-preflight
  const origin = validateOrigin(request);

  // Execute the handler
  const response = await handler(request);

  // Apply CORS headers
  return applyCorsHeaders(request, response, origin);
}

/**
 * Get the list of currently allowed origins (for debugging).
 */
export function listAllowedOrigins(): string[] {
  return Array.from(getOrigins());
}

/**
 * Refresh the cached allowed origins (e.g., after env change).
 */
export function refreshAllowedOrigins(): void {
  cachedOrigins = null;
}
