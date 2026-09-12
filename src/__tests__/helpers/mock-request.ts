// ═══════════════════════════════════════════════════════════════════
// Test Helper: Create mock NextRequest objects with auth headers
// ═══════════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only-min-32-chars';

// Next.js extends/narrows the global RequestInit (signal, duplex, nextConfig),
// so use NextRequest's own init type for the object we pass to its constructor.
type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

interface MockRequestOptions {
  url?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  userId?: string;
  email?: string;
  role?: string;
  plan?: string;
  orgId?: string | null;
  authProvider?: string;
  isTrial?: boolean;
  useBearerToken?: boolean;
  useCookieToken?: boolean;
  useMiddlewareHeaders?: boolean;
}

/**
 * Create a mock NextRequest with auth headers, Bearer token, or cookie token.
 */
export function createMockRequest(options: MockRequestOptions = {}): NextRequest {
  const {
    url = 'http://localhost:3000/api/test',
    method = 'GET',
    body,
    headers: customHeaders = {},
    cookies = {},
    userId = 'test-user-id',
    email = 'test@example.com',
    role = 'owner',
    plan = 'free',
    orgId = null,
    authProvider = 'email',
    isTrial = false,
    useBearerToken = false,
    useCookieToken = false,
    useMiddlewareHeaders = true,
  } = options;

  const headers: Record<string, string> = { ...customHeaders };

  // Option 1: Middleware headers (fast path)
  if (useMiddlewareHeaders) {
    headers['x-user-id'] = userId;
    headers['x-user-email'] = email;
    headers['x-user-role'] = role;
    headers['x-user-plan'] = plan;
    headers['x-user-org'] = orgId || '';
    headers['x-user-auth-provider'] = authProvider || '';
  }

  // Option 2: Bearer token
  if (useBearerToken) {
    const token = jwt.sign(
      {
        sub: userId,
        email,
        role,
        plan,
        orgId,
        authProvider,
        isTrial,
        trialEndsAt: null,
        type: 'access',
      },
      JWT_SECRET,
      { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
    );
    headers['authorization'] = `Bearer ${token}`;
  }

  const init: NextRequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
    if (!headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
  }

  const request = new NextRequest(url, init);

  // Option 3: Cookie token
  if (useCookieToken) {
    const token = jwt.sign(
      {
        sub: userId,
        email,
        role,
        plan,
        orgId,
        authProvider,
        isTrial,
        trialEndsAt: null,
        type: 'access',
      },
      JWT_SECRET,
      { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
    );
    request.cookies.set('access_token', token);
  }

  // Set additional cookies
  for (const [key, value] of Object.entries(cookies)) {
    request.cookies.set(key, value);
  }

  return request;
}

/**
 * Create an unauthenticated mock request (no auth headers).
 */
export function createUnauthenticatedRequest(url: string = 'http://localhost:3000/api/test'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

/**
 * Create an admin mock request.
 */
export function createAdminRequest(options: Partial<MockRequestOptions> = {}): NextRequest {
  return createMockRequest({
    role: 'super_admin',
    plan: 'elite',
    ...options,
  });
}

/**
 * Create a request for a specific plan.
 */
export function createPlanRequest(plan: 'free' | 'pro' | 'elite', options: Partial<MockRequestOptions> = {}): NextRequest {
  return createMockRequest({
    plan,
    ...options,
  });
}
