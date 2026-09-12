// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — API Keys Routes
// GET  /api/settings/api-keys       — List user's API keys
// POST /api/settings/api-keys       — Create a new API key
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createApiKey, listApiKeys, API_KEY_SCOPES, type ApiKeyScope } from '@/lib/api-key-service';
import { hasFeatureAccess, getFeatureLimit, type PlanType } from '@/lib/entitlement-service';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const apiKeys = await listApiKeys(authUser.id);

    // Include plan info for UI (key limits, api_access)
    const userPlan = (authUser.plan || 'free') as PlanType;
    const apiAccessEnabled = hasFeatureAccess(userPlan, 'api_access');
    const keyLimit = getFeatureLimit(userPlan, 'api_access');

    return NextResponse.json({
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        environment: key.environment,
        scopes: key.scopes.split(','),
        status: key.status,
        isActive: key.isActive,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        rateLimitPerHour: key.rateLimitPerHour,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      })),
      plan: {
        current: userPlan,
        apiAccessEnabled,
        keyLimit,
        keyCount: apiKeys.filter((k) => k.status !== 'revoked').length,
      },
    });
  } catch (error) {
    console.error('List API keys error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { name, environment, scopes, expiresAt, rateLimitPerHour } = body;

    // Check api_access feature based on plan
    const userPlan = (authUser.plan || 'free') as PlanType;
    if (!hasFeatureAccess(userPlan, 'api_access')) {
      return NextResponse.json(
        { error: 'API access is not available on your current plan. Upgrade to Pro or Elite to create API keys.', code: 'PLAN_REQUIRED', requiredPlan: 'pro', currentPlan: userPlan },
        { status: 403 }
      );
    }

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'API key name is required' }, { status: 400 });
    }
    if (name.length > 50) {
      return NextResponse.json({ error: 'API key name must be 50 characters or less' }, { status: 400 });
    }

    // Validate environment
    const env = environment === 'test' ? 'test' : 'live';

    // Validate scopes
    const keyScopes: ApiKeyScope[] = Array.isArray(scopes) && scopes.length > 0
      ? scopes.filter((s: string) => API_KEY_SCOPES.includes(s as ApiKeyScope))
      : ['leads.read'];

    if (keyScopes.length === 0) {
      return NextResponse.json({ error: 'At least one scope is required' }, { status: 400 });
    }

    // Validate expiration
    let expiry: Date | undefined;
    if (expiresAt) {
      expiry = new Date(expiresAt);
      if (isNaN(expiry.getTime()) || expiry <= new Date()) {
        return NextResponse.json({ error: 'Invalid expiration date' }, { status: 400 });
      }
    }

    // Create the key
    const result = await createApiKey({
      userId: authUser.id,
      orgId: authUser.orgId || undefined,
      name: name.trim(),
      environment: env,
      scopes: keyScopes,
      expiresAt: expiry,
      rateLimitPerHour: rateLimitPerHour && rateLimitPerHour > 0 ? rateLimitPerHour : 1000,
    });

    // Return the raw key ONLY ONCE — it cannot be retrieved again
    return NextResponse.json(
      {
        apiKey: {
          id: result.id,
          name: result.name,
          keyPrefix: result.keyPrefix,
          environment: result.environment,
          scopes: result.scopes,
          status: result.status,
          expiresAt: result.expiresAt,
          createdAt: result.createdAt,
          key: result.rawKey, // SHOWN ONLY ONCE
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create API key error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create API key';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
