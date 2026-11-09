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
      // Audit the denial
      await logAuthorizationDenial(user, permission, request);
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    return handler(user);
  });
}

/**
 * Require specific permission AND MFA verification.
 * Use for sensitive mutations (role assignment, confirmation, etc.)
 * where a stolen access token must not grant privileged access without MFA.
 */
export async function withPermissionAndMfa(
  request: NextRequest,
  permission: Permission,
  handler: (user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  return withAuth(request, async (user) => {
    if (!hasPermission(user.role as UserRole, permission)) {
      await logAuthorizationDenial(user, permission, request);
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    // MFA enforcement: super_admin must have MFA enabled for sensitive operations
    if (user.role === 'super_admin' && !user.mfaEnabled) {
      return NextResponse.json(
        { error: 'MFA is mandatory for this operation. Enable MFA in Settings → Security.', code: 'MFA_REQUIRED' },
        { status: 403 }
      );
    }
    return handler(user);
  });
}

/**
 * Log an authorization denial for security audit.
 *
 * Uses trusted-proxy-aware IP extraction — never trusts arbitrary
 * X-Forwarded-For values from untrusted sources.
 *
 * SECURITY NOTES:
 * - Writes a durable tamper-evident AuditLog entry via recordSecurityEvent
 *   (dynamic import to avoid circular dependency with audit-chain).
 * - Also emits a console.warn for immediate operational visibility.
 * - Log fields are sanitized to prevent newline/control-character injection.
 * - Logging failures NEVER authorize a denied operation (fail-safe).
 * - Never logs passwords, tokens, OTPs, or sensitive request bodies.
 */
async function logAuthorizationDenial(
  user: AuthUser,
  permission: Permission,
  request: NextRequest
): Promise<void> {
  try {
    // INFRA-001: request.ip is unavailable in Next.js 16. Both Caddy
    // and nginx OVERWRITE X-Real-IP with the actual peer address.
    // X-Forwarded-For is appended (not overwritten) by nginx and is
    // spoofable. Prefer X-Real-IP; do NOT fall back to unverified XFF.
    const realIp = request.headers.get('x-real-ip');
    const clientIP = realIp ? realIp.trim() : 'unknown';

    // Sanitize all log fields to prevent log injection
    const sanitize = (s: string): string => s.replace(/[\r\n\t]/g, '').substring(0, 200);

    const path = sanitize(request.nextUrl?.pathname || 'unknown');
    const method = sanitize(request.method || 'unknown');
    const userId = sanitize(user.id || 'unknown');
    const perm = sanitize(String(permission));
    const ip = sanitize(clientIP);

    console.warn(`[AUTHZ_DENIED] user=${userId} perm=${perm} method=${method} path=${path} ip=${ip}`);

    // Write a durable tamper-evident AuditLog entry via dynamic import
    // (avoids circular dependency: audit-chain imports from auth, but
    // this dynamic import only runs at call-time, not at module-load time).
    try {
      const { recordSecurityEvent } = await import('@/lib/security/audit-chain');
      await recordSecurityEvent({
        actorId: user.id,
        securityEventType: 'authz_permission_denied',
        severity: 'MEDIUM',
        action: `authz_denied:${perm}`,
        resource: path,
        details: { permission: perm, method, path },
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        outcome: 'denied',
      });
    } catch {
      // Audit write failure is non-fatal — the console.warn above
      // already recorded the denial. Never block the 403 response.
    }
  } catch {
    // Logging failures must NEVER authorize a denied operation.
    // The denial has already been returned; this catch only prevents
    // an unhandled rejection from interfering with the response.
  }
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
    if (!user.mfaEnabled) {
      return NextResponse.json(
        { error: 'MFA is mandatory for super admin accounts. Enable MFA in Settings → Security before accessing admin features.', code: 'MFA_REQUIRED' },
        { status: 403 }
      );
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
    // INFRA-001: Use X-Real-IP (overwritten by proxy) not XFF (spoofable)
    const ipAddress = request.headers.get('x-real-ip')?.trim() || undefined;
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
    // INFRA-001: Use X-Real-IP (overwritten by proxy) not XFF (spoofable)
    const ipAddress = request.headers.get('x-real-ip')?.trim() || undefined;
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
