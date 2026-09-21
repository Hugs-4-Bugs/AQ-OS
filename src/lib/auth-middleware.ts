// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — API Route Authentication & Authorization Middleware
// Phase 3: Auth + Authorization + Session Security + RBAC
// Extended: Dual Auth (JWT OR API Key) with scope-to-permission mapping
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, AuthError } from '@/lib/auth';
import { hasPermission, hasAllPermissions, isAdminRole, type Permission, type UserRole } from '@/lib/rbac';
import type { AuthUser } from '@/lib/auth';
import { withDualAuth, type ApiKeyScope } from '@/lib/api-key-middleware';
import { recordApiKeyUsage } from '@/lib/api-key-service';

// ===== SCOPE → PERMISSION MAPPING =====
// Maps API key scopes to RBAC permissions for dual auth.
// API key with 'admin' scope maps to ALL permissions.

const SCOPE_TO_PERMISSION: Record<string, Permission[]> = {
  'leads.read':        ['leads:read'],
  'leads.write':       ['leads:read', 'leads:write'],
  'workflows.read':    ['pipeline:read'],
  'workflows.write':   ['pipeline:read', 'pipeline:write'],
  'ai.read':           ['assistant:read'],
  'ai.write':          ['assistant:read', 'discover:write'],
  'billing.read':      ['billing:read'],
  'analytics.read':    ['insights:read'],
  'competitors.read':  ['competitors:read'],
  'competitors.write': ['competitors:read', 'competitors:write'],
  'messages.read':     ['outreach:read'],
  'messages.write':    ['outreach:read', 'outreach:write'],
  'admin':             ['admin:access'], // admin scope grants all
};

/** Check if API key scopes satisfy a required RBAC permission */
function scopesSatisfyPermission(scopes: string[], permission: Permission): boolean {
  // Admin scope grants everything
  if (scopes.includes('admin')) return true;
  for (const scope of scopes) {
    const mappedPerms = SCOPE_TO_PERMISSION[scope];
    if (mappedPerms?.includes(permission)) return true;
  }
  return false;
}

/** Require authentication — returns user or error response */
export async function withAuth(
  request: NextRequest,
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return handler(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Auth middleware error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Require specific permission */
export async function withPermission(
  request: NextRequest,
  permission: Permission,
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  return withAuth(request, async (user) => {
    if (!hasPermission(user.role as UserRole, permission)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    return handler(user);
  });
}

/** Require admin role */
export async function withAdmin(
  request: NextRequest,
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  return withAuth(request, async (user) => {
    if (!isAdminRole(user.role as UserRole)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return handler(user);
  });
}

/**
 * Require the PLATFORM super_admin role.
 * ACCOUNT ISOLATION: org-level `owner`/`admin` roles are tenant-scoped —
 * they must never reach platform-wide endpoints (DB backup/restore,
 * global audit dumps, cross-tenant refunds, retention deletion, source
 * download, platform billing analytics). Use this instead of withAdmin
 * for any endpoint that operates across ALL tenants.
 */
export async function withSuperAdmin(
  request: NextRequest,
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  return withAuth(request, async (user) => {
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }
    return handler(user);
  });
}

/** Require ALL specified permissions */
export async function withAllPermissions(
  request: NextRequest,
  permissions: Permission[],
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  return withAuth(request, async (user) => {
    if (!hasAllPermissions(user.role as UserRole, permissions)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    return handler(user);
  });
}

// ===== DUAL AUTH MIDDLEWARE (JWT OR API KEY) =====

/** Dual auth + require specific RBAC permission.
 *  Accepts either session/JWT auth OR API key auth.
 *  API key auth maps scopes to RBAC permissions.
 */
export async function withDualAuthPermission(
  request: NextRequest,
  permission: Permission,
  handler: (user: AuthUser, apiKeyInfo?: { id: string; userId: string; orgId: string | null; environment: string; scopes: string[] }) => Promise<NextResponse>
): Promise<NextResponse> {
  // Try dual auth (API key first, then session)
  const authResult = await withDualAuth(request);
  if (!authResult.authenticated) {
    return authResult.error;
  }

  const { user, apiKeyInfo } = authResult;

  // If authenticated via API key, check scope-based permission
  if (apiKeyInfo) {
    if (!scopesSatisfyPermission(apiKeyInfo.scopes, permission)) {
      return NextResponse.json(
        { error: `Insufficient scope for permission '${permission}'`, code: 'SCOPE_DENIED' },
        { status: 403 }
      );
    }
    // Record usage asynchronously
    const endpoint = new URL(request.url).pathname;
    const method = request.method;
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    recordApiKeyUsage({
      apiKeyId: apiKeyInfo.id,
      userId: apiKeyInfo.userId,
      endpoint,
      method,
      statusCode: 200,
      ipAddress,
    }).catch(() => {});
    return handler(user, apiKeyInfo);
  }

  // Session auth — check RBAC permission normally
  if (!hasPermission(user.role as UserRole, permission)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  return handler(user);
}

/** Dual auth (JWT OR API key) — no permission check required.
 *  API key with any valid scope is accepted.
 */
export async function withDualAuthOnly(
  request: NextRequest,
  handler: (user: AuthUser, apiKeyInfo?: { id: string; userId: string; orgId: string | null; environment: string; scopes: string[] }) => Promise<NextResponse>
): Promise<NextResponse> {
  const authResult = await withDualAuth(request);
  if (!authResult.authenticated) {
    return authResult.error;
  }

  const { user, apiKeyInfo } = authResult;

  // Record usage for API key requests
  if (apiKeyInfo) {
    const endpoint = new URL(request.url).pathname;
    const method = request.method;
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    recordApiKeyUsage({
      apiKeyId: apiKeyInfo.id,
      userId: apiKeyInfo.userId,
      endpoint,
      method,
      statusCode: 200,
      ipAddress,
    }).catch(() => {});
  }

  return handler(user, apiKeyInfo);
}

// ===== BILLING MIDDLEWARE SHORTHANDS =====

/** Require billing:read permission — for viewing billing/subscription info */
export async function withBillingRead(
  request: NextRequest,
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  return withPermission(request, 'billing:read', handler);
}

/** Require billing:write permission — for modifying billing/subscription info */
export async function withBillingWrite(
  request: NextRequest,
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  return withPermission(request, 'billing:write', handler);
}
