// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — API Key Authentication Middleware
// Verifies Bearer aq_live_xxx / aq_test_xxx tokens
// Checks: hash, scope, expiration, revocation, rate limit
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, recordApiKeyUsage, type ApiKeyScope } from '@/lib/api-key-service';
export type { ApiKeyScope } from '@/lib/api-key-service';
import { getAuthUser } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import { withRateLimit } from '@/lib/security/rate-limiter';

interface ApiKeyAuthResult {
  authenticated: true;
  user: AuthUser;
  apiKeyInfo: {
    id: string;
    userId: string;
    orgId: string | null;
    environment: string;
    scopes: string[];
  };
}

/**
 * Authenticate a request using an API key (Bearer token).
 * Returns the auth result or an error response.
 *
 * Usage in API routes:
 * ```
 * const auth = await withApiKeyAuth(request, { requiredScope: 'leads.read' });
 * if (!auth.authenticated) return auth.error;
 * const { user, apiKeyInfo } = auth;
 * ```
 */
export async function withApiKeyAuth(
  request: NextRequest,
  options?: { requiredScope?: ApiKeyScope }
): Promise<
  | ApiKeyAuthResult
  | { authenticated: false; error: NextResponse }
> {
  // Extract Bearer token
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    // Not an API key request — fall through to session auth
    return { authenticated: false, error: NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 }) };
  }

  const rawKey = authHeader.substring(7);

  // Only process aq_live_ / aq_test_ prefixed keys
  if (!rawKey.startsWith('aq_live_') && !rawKey.startsWith('aq_test_')) {
    return { authenticated: false, error: NextResponse.json({ error: 'Invalid API key format' }, { status: 401 }) };
  }

  // Burst rate limit check (100 req/min per key)
  const burstLimit = withRateLimit(request, 'api_key_burst');
  if (burstLimit) {
    return { authenticated: false, error: burstLimit };
  }

  // Verify the key
  const startTime = Date.now();
  const verification = await verifyApiKey(rawKey, options?.requiredScope);

  if (!verification.valid) {
    const statusCode =
      verification.code === 'rate_limited' ? 429 :
      verification.code === 'scope_denied' ? 403 :
      401;

    return {
      authenticated: false,
      error: NextResponse.json(
        { error: verification.error, code: verification.code },
        { status: statusCode }
      ),
    };
  }

  // Look up the user for this API key
  const { db } = await import('@/lib/db');
  const user = await db.user.findUnique({
    where: { id: verification.apiKey.userId },
    include: {
      mfaConfig: { select: { isEnabled: true } },
      subscriptions: {
        where: { status: { in: ['active', 'trialing'] } },
        select: { plan: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!user) {
    return { authenticated: false, error: NextResponse.json({ error: 'User not found' }, { status: 401 }) };
  }

  const activeSubscription = user.subscriptions.find(
    (s) => s.status === 'active' || s.status === 'trialing'
  );
  const resolvedPlan = activeSubscription?.plan || user.plan || 'free';

  // Check if the user's plan allows API access
  const { hasFeatureAccess } = await import('@/lib/entitlement-service');
  if (!hasFeatureAccess(resolvedPlan as 'free' | 'pro' | 'elite', 'api_access')) {
    return {
      authenticated: false,
      error: NextResponse.json(
        { error: 'API access is not available on your current plan. Upgrade to Pro or Elite.', code: 'PLAN_REQUIRED' },
        { status: 403 }
      ),
    };
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name || '',
    role: user.role,
    plan: resolvedPlan,
    orgId: user.orgId,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaConfig?.isEnabled ?? false,
    avatarUrl: user.avatar,
  };

  // Record usage asynchronously (non-blocking)
  const responseTime = Date.now() - startTime;
  const endpoint = new URL(request.url).pathname;
  const method = request.method;
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') || null;

  // Fire-and-forget usage recording
  recordApiKeyUsage({
    apiKeyId: verification.apiKey.id,
    userId: verification.apiKey.userId,
    endpoint,
    method,
    statusCode: 200,
    responseTime,
    ipAddress: ipAddress || undefined,
  }).catch(() => {});

  return {
    authenticated: true,
    user: authUser,
    apiKeyInfo: {
      id: verification.apiKey.id,
      userId: verification.apiKey.userId,
      orgId: verification.apiKey.orgId,
      environment: verification.apiKey.environment,
      scopes: verification.apiKey.scopes,
    },
  };
}

/**
 * Dual auth: Accept either API key OR session cookie.
 * API key takes precedence if present.
 */
export async function withDualAuth(
  request: NextRequest,
  options?: { requiredScope?: ApiKeyScope }
): Promise<
  | { authenticated: true; user: AuthUser; apiKeyInfo?: ApiKeyAuthResult['apiKeyInfo'] }
  | { authenticated: false; error: NextResponse }
> {
  // Try API key first
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const rawKey = authHeader.substring(7);
    if (rawKey.startsWith('aq_live_') || rawKey.startsWith('aq_test_')) {
      const apiKeyResult = await withApiKeyAuth(request, options);
      if (apiKeyResult.authenticated) {
        return {
          authenticated: true,
          user: apiKeyResult.user,
          apiKeyInfo: apiKeyResult.apiKeyInfo,
        };
      }
      // API key was provided but invalid — return the error
      return { authenticated: false, error: apiKeyResult.error };
    }
  }

  // Fall back to session auth
  const sessionUser = await getAuthUser(request);
  if (!sessionUser) {
    return {
      authenticated: false,
      error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  return { authenticated: true, user: sessionUser };
}
