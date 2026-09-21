// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — API Key Service
// Complete production API key management: generation, hashing,
// verification, scope validation, rate limiting, audit logging
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { db } from '@/lib/db';
import { createNotificationOnce } from '@/lib/notification-service';

// ===== CONSTANTS =====
const KEY_PREFIX_LIVE = 'aq_live_';
const KEY_PREFIX_TEST = 'aq_test_';
const KEY_RANDOM_BYTES = 32; // 64 hex chars after prefix
const KEY_HASH_ALGORITHM = 'sha256';
// Plan-based key limits: Free=1, Pro=5, Elite=unlimited
const PLAN_KEY_LIMITS: Record<string, number> = {
  free: 1,
  pro: 5,
  elite: 50,
};

// Plan-based lead creation limits per month (enforced on POST /api/leads
// when the request is authenticated via an API key — not session).
// Free plan keys: 50 leads/month, basic features only.
// Pro plan keys:  500 leads/month, all pro features.
// Elite plan keys: 2000 leads/month, all features.
export const PLAN_LEAD_LIMITS_PER_MONTH: Record<string, number> = {
  free: 50,
  pro: 500,
  elite: 2000,
};

// Plan-based hourly request rate limits applied to every newly created key.
// Mirrors the plan tier so Free keys cannot hammer the API at Pro throughput.
export const PLAN_RATE_LIMITS_PER_HOUR: Record<string, number> = {
  free: 50,
  pro: 500,
  elite: 2000,
};


const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ===== VALID API KEY SCOPES =====
export const API_KEY_SCOPES = [
  'leads.read',
  'leads.write',
  'workflows.read',
  'workflows.write',
  'ai.read',
  'ai.write',
  'billing.read',
  'analytics.read',
  'competitors.read',
  'competitors.write',
  'messages.read',
  'messages.write',
  'admin',
  'custom',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// Plan-based scope gating — "permissions must match subscription limits".
// Free plan keys: basic features only (lead read/CRUD + analytics).
// Pro plan keys:  all standard scopes, no admin.
// Elite plan keys: every scope including admin.
export const PLAN_ALLOWED_SCOPES: Record<string, ReadonlySet<string>> = {
  free: new Set(['leads.read', 'leads.write', 'analytics.read']),
  pro: new Set([
    'leads.read', 'leads.write', 'workflows.read', 'workflows.write',
    'ai.read', 'ai.write', 'billing.read', 'analytics.read',
    'competitors.read', 'competitors.write', 'messages.read', 'messages.write',
    'custom',
  ]),
  elite: new Set([...API_KEY_SCOPES]),
};

/**
 * Validate the requested scopes against the plan the key owner is on.
 * Throws with a clear upgrade message when a plan tries to use scopes it
 * does not pay for.
 */
function assertScopesAllowedForPlan(scopes: string[], plan: string): void {
  const allowed = PLAN_ALLOWED_SCOPES[plan] ?? PLAN_ALLOWED_SCOPES.free;
  const denied = scopes.filter((s) => !allowed.has(s));
  if (denied.length > 0) {
    throw new Error(
      `Scope(s) not available on the ${plan} plan: ${denied.join(', ')}. Upgrade your plan to use them.`
    );
  }
}


// ===== TYPES =====
export interface CreateApiKeyParams {
  userId: string;
  orgId?: string;
  name: string;
  environment: 'live' | 'test';
  scopes: ApiKeyScope[];
  expiresAt?: Date;
  rateLimitPerHour?: number;
}

export interface ApiKeyVerificationResult {
  valid: true;
  apiKey: {
    id: string;
    userId: string;
    orgId: string | null;
    environment: string;
    scopes: string[];
    status: string;
    rateLimitPerHour: number;
  };
}

export interface ApiKeyVerificationError {
  valid: false;
  error: string;
  code: 'invalid_key' | 'revoked' | 'expired' | 'disabled' | 'scope_denied' | 'rate_limited';
}

export type ApiKeyVerification = ApiKeyVerificationResult | ApiKeyVerificationError;

// ===== KEY GENERATION =====

/** Generate a secure API key with the correct prefix */
export function generateRawKey(environment: 'live' | 'test'): string {
  const prefix = environment === 'live' ? KEY_PREFIX_LIVE : KEY_PREFIX_TEST;
  const randomPart = crypto.randomBytes(KEY_RANDOM_BYTES).toString('hex');
  return `${prefix}${randomPart}`;
}

/** Hash an API key using SHA-256 — store ONLY this, never plaintext */
export function hashKey(rawKey: string): string {
  return crypto.createHash(KEY_HASH_ALGORITHM).update(rawKey).digest('hex');
}

/** Extract the prefix (first 8 chars) for display/identification */
export function getKeyPrefix(rawKey: string): string {
  return rawKey.substring(0, 12); // "aq_live_XXXX" or "aq_test_XXXX"
}

/** Validate that a raw key has the correct format */
export function isValidKeyFormat(rawKey: string): boolean {
  return (
    (rawKey.startsWith(KEY_PREFIX_LIVE) || rawKey.startsWith(KEY_PREFIX_TEST)) &&
    rawKey.length > 20
  );
}

/** Validate scope list */
export function validateScopes(scopes: string[]): { valid: boolean; invalid: string[] } {
  const validScopes = new Set<string>(API_KEY_SCOPES);
  const invalid = scopes.filter((s) => !validScopes.has(s as ApiKeyScope));
  return { valid: invalid.length === 0, invalid };
}

// ===== KEY CREATION =====

/**
 * Create a new API key. Returns the raw key ONCE — it cannot be retrieved again.
 * Only the hash is stored in the database.
 */
export async function createApiKey(params: CreateApiKeyParams): Promise<{
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
  scopes: string[];
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
  /** The raw key — shown only once, never stored */
  rawKey: string;
}> {
  // Enforce plan-based key limits
  const existingCount = await db.apiKey.count({
    where: { userId: params.userId, status: { not: 'revoked' } },
  });

  // Look up user's plan
  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: { plan: true, subscriptions: { where: { status: { in: ['active', 'trialing'] } }, select: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  const resolvedPlan = user?.subscriptions?.[0]?.plan || user?.plan || 'free';
  const maxKeys = PLAN_KEY_LIMITS[resolvedPlan] ?? 1;

  if (existingCount >= maxKeys) {
    throw new Error(`Maximum of ${maxKeys} API keys allowed on the ${resolvedPlan} plan. Upgrade for more keys.`);
  }

  // Validate scopes
  const scopeValidation = validateScopes(params.scopes);
  if (!scopeValidation.valid) {
    throw new Error(`Invalid scopes: ${scopeValidation.invalid.join(', ')}`);
  }

  // FIX 15: gate premium scopes by subscription plan (free = basic only)
  assertScopesAllowedForPlan(params.scopes, resolvedPlan);

  // Generate key
  const rawKey = generateRawKey(params.environment);
  const keyPrefix = getKeyPrefix(rawKey);
  const keyHash = hashKey(rawKey);

  // Store in database — only hash, never plaintext
  const apiKey = await db.apiKey.create({
    data: {
      userId: params.userId,
      orgId: params.orgId || null,
      name: params.name,
      keyPrefix,
      keyHash,
      environment: params.environment,
      scopes: params.scopes.join(','),
      status: 'active',
      isActive: true,
      expiresAt: params.expiresAt || null,
      // FIX 15: rate limit by plan tier unless the caller explicitly
      // requested a (lower) limit. Free=50, Pro=500, Elite=2000 req/hour.
      rateLimitPerHour:
        params.rateLimitPerHour ??
        PLAN_RATE_LIMITS_PER_HOUR[resolvedPlan] ??
        1000,
    },
  });

  // Audit log
  await logApiKeyEvent({
    userId: params.userId,
    action: 'api_key_created',
    apiKeyId: apiKey.id,
    details: `Created API key "${params.name}" (${params.environment}, scopes: ${params.scopes.join(', ')})`,
  });

  // User-facing notification (deduped per key).
  await createNotificationOnce({
    userId: params.userId,
    type: 'api_key_created',
    title: 'API key created',
    message: `API key "${params.name}" (${params.environment}) is ready to use. Store it securely — it cannot be viewed again.`,
    actionUrl: '/business-ai/settings',
    metadata: { apiKeyId: apiKey.id, environment: params.environment },
    dedupeKey: `apikey:${apiKey.id}:created`,
  }).catch(() => {
    // Never fail key creation because of a notification problem
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    environment: apiKey.environment,
    scopes: params.scopes,
    status: apiKey.status,
    expiresAt: apiKey.expiresAt,
    createdAt: apiKey.createdAt,
    rawKey, // Returned only once
  };
}

// ===== KEY VERIFICATION =====

/**
 * Verify an API key from a Bearer token.
 * Checks: hash match, status, expiration, scope, rate limit.
 */
export async function verifyApiKey(
  rawKey: string,
  requiredScope?: ApiKeyScope
): Promise<ApiKeyVerification> {
  if (!isValidKeyFormat(rawKey)) {
    return { valid: false, error: 'Invalid API key format', code: 'invalid_key' };
  }

  const keyHash = hashKey(rawKey);

  // Look up by hash
  const apiKey = await db.apiKey.findFirst({
    where: { keyHash },
    select: {
      id: true,
      userId: true,
      orgId: true,
      environment: true,
      scopes: true,
      status: true,
      isActive: true,
      expiresAt: true,
      rateLimitPerHour: true,
    },
  });

  if (!apiKey) {
    return { valid: false, error: 'Invalid API key', code: 'invalid_key' };
  }

  // Check status
  if (apiKey.status === 'revoked') {
    return { valid: false, error: 'API key has been revoked', code: 'revoked' };
  }

  if (apiKey.status === 'disabled' || !apiKey.isActive) {
    return { valid: false, error: 'API key is disabled', code: 'disabled' };
  }

  // NOTE: Per user requirement, API keys must NEVER auto-expire.
  // The expiration date is stored for display purposes only — even if
  // expiresAt is in the past, the key remains valid until manually
  // revoked or disabled by the owner.
  // (Previous auto-expire logic removed to ensure keys are permanent.)

  // Check scope
  if (requiredScope) {
    const scopes = apiKey.scopes.split(',');
    if (!scopes.includes(requiredScope) && !scopes.includes('admin')) {
      return { valid: false, error: `Insufficient scope: ${requiredScope}`, code: 'scope_denied' };
    }
  }

  // Rate limit check
  const isRateLimited = await checkRateLimit(apiKey.id, apiKey.rateLimitPerHour);
  if (isRateLimited) {
    return { valid: false, error: 'Rate limit exceeded', code: 'rate_limited' };
  }

  // Update last used
  await db.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  const scopes = apiKey.scopes.split(',');

  return {
    valid: true,
    apiKey: {
      id: apiKey.id,
      userId: apiKey.userId,
      orgId: apiKey.orgId,
      environment: apiKey.environment,
      scopes,
      status: apiKey.status,
      rateLimitPerHour: apiKey.rateLimitPerHour,
    },
  };
}

// ===== RATE LIMITING =====

/**
 * Check if an API key has exceeded its rate limit.
 * Uses ApiKeyUsage table for tracking within the current hour window.
 */
async function checkRateLimit(apiKeyId: string, limitPerHour: number): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  const usageCount = await db.apiKeyUsage.count({
    where: {
      apiKeyId,
      createdAt: { gte: windowStart },
    },
  });

  return usageCount >= limitPerHour;
}

/**
 * Record API key usage for rate limiting and analytics.
 */
export async function recordApiKeyUsage(params: {
  apiKeyId: string;
  userId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime?: number;
  ipAddress?: string;
}): Promise<void> {
  try {
    await db.apiKeyUsage.create({
      data: {
        apiKeyId: params.apiKeyId,
        userId: params.userId,
        endpoint: params.endpoint,
        method: params.method,
        statusCode: params.statusCode,
        responseTime: params.responseTime || null,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch {
    // Never block the main flow due to usage logging failure
  }
}

// ===== PER-MONTH LEAD LIMIT ENFORCEMENT =====

/**
 * Count how many successful (status 201) POST /api/leads requests have been
 * made by this API key in the last 30 days.
 *
 * Used by the leads POST route to enforce plan-based per-month lead creation
 * limits (Free 50/mo, Pro 500/mo, Elite 2000/mo) when the request is
 * authenticated via an API key.
 */
export async function countLeadsCreatedByApiKeyLast30Days(apiKeyId: string): Promise<number> {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return await db.apiKeyUsage.count({
      where: {
        apiKeyId,
        endpoint: '/api/leads',
        method: 'POST',
        statusCode: 201,
        createdAt: { gte: since },
      },
    });
  } catch {
    // On counting failure, allow the request (fail-open) — the per-hour
    // rate limit still applies as a backstop.
    return 0;
  }
}

/**
 * Check whether an API key is still within its per-month lead creation
 * limit based on the key owner's plan. Returns the limit, current count,
 * and whether the request should be allowed.
 */
export async function checkApiKeyLeadLimit(
  apiKeyId: string,
  plan: string
): Promise<{ allowed: boolean; limit: number; used: number; remaining: number }> {
  const limit = PLAN_LEAD_LIMITS_PER_MONTH[plan] ?? PLAN_LEAD_LIMITS_PER_MONTH.free;
  const used = await countLeadsCreatedByApiKeyLast30Days(apiKeyId);
  const remaining = Math.max(0, limit - used);
  return {
    allowed: used < limit,
    limit,
    used,
    remaining,
  };
}

// ===== KEY OPERATIONS =====

/** List all API keys for a user */
export async function listApiKeys(userId: string) {
  return db.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      environment: true,
      scopes: true,
      status: true,
      isActive: true,
      lastUsedAt: true,
      expiresAt: true,
      rateLimitPerHour: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Revoke an API key */
export async function revokeApiKey(userId: string, apiKeyId: string): Promise<void> {
  const apiKey = await db.apiKey.findFirst({
    where: { id: apiKeyId, userId },
  });

  if (!apiKey) {
    throw new Error('API key not found');
  }

  await db.apiKey.update({
    where: { id: apiKeyId },
    data: { status: 'revoked', isActive: false, revokedAt: new Date() },
  });

  await logApiKeyEvent({
    userId,
    action: 'api_key_revoked',
    apiKeyId,
    details: `Revoked API key "${apiKey.name}" (${apiKey.keyPrefix})`,
  });

  // User-facing notification (deduped per key — a key can only be revoked once).
  await createNotificationOnce({
    userId,
    type: 'api_key_revoked',
    title: 'API key revoked',
    message: `API key "${apiKey.name}" was revoked. Requests using it will no longer be accepted.`,
    actionUrl: '/business-ai/settings',
    metadata: { apiKeyId, environment: apiKey.environment },
    dedupeKey: `apikey:${apiKeyId}:revoked`,
  }).catch(() => {
    // Never fail revocation because of a notification problem
  });
}

/** Delete an API key permanently */
export async function deleteApiKey(userId: string, apiKeyId: string): Promise<void> {
  const apiKey = await db.apiKey.findFirst({
    where: { id: apiKeyId, userId },
  });

  if (!apiKey) {
    throw new Error('API key not found');
  }

  await db.apiKey.delete({
    where: { id: apiKeyId },
  });

  await logApiKeyEvent({
    userId,
    action: 'api_key_deleted',
    apiKeyId,
    details: `Deleted API key "${apiKey.name}" (${apiKey.keyPrefix})`,
  });
}

/** Enable a disabled API key */
export async function enableApiKey(userId: string, apiKeyId: string): Promise<void> {
  const apiKey = await db.apiKey.findFirst({
    where: { id: apiKeyId, userId },
  });

  if (!apiKey) throw new Error('API key not found');
  if (apiKey.status === 'revoked') throw new Error('Cannot enable a revoked key');
  if (apiKey.status === 'expired') throw new Error('Cannot enable an expired key');

  await db.apiKey.update({
    where: { id: apiKeyId },
    data: { status: 'active', isActive: true },
  });

  await logApiKeyEvent({
    userId,
    action: 'api_key_enabled',
    apiKeyId,
    details: `Enabled API key "${apiKey.name}"`,
  });
}

/** Disable an API key */
export async function disableApiKey(userId: string, apiKeyId: string): Promise<void> {
  const apiKey = await db.apiKey.findFirst({
    where: { id: apiKeyId, userId },
  });

  if (!apiKey) throw new Error('API key not found');

  await db.apiKey.update({
    where: { id: apiKeyId },
    data: { status: 'disabled', isActive: false },
  });

  await logApiKeyEvent({
    userId,
    action: 'api_key_disabled',
    apiKeyId,
    details: `Disabled API key "${apiKey.name}"`,
  });
}

/** Rotate an API key — old key invalidated, new key issued */
export async function rotateApiKey(
  userId: string,
  apiKeyId: string
): Promise<{
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
  rawKey: string;
}> {
  const oldKey = await db.apiKey.findFirst({
    where: { id: apiKeyId, userId },
  });

  if (!oldKey) throw new Error('API key not found');
  if (oldKey.status === 'revoked') throw new Error('Cannot rotate a revoked key');

  // Generate new key
  const rawKey = generateRawKey(oldKey.environment as 'live' | 'test');
  const keyPrefix = getKeyPrefix(rawKey);
  const keyHash = hashKey(rawKey);

  // Invalidate old key
  await db.apiKey.update({
    where: { id: apiKeyId },
    data: { status: 'revoked', isActive: false, revokedAt: new Date() },
  });

  // Create new key with same settings
  const newKey = await db.apiKey.create({
    data: {
      userId: oldKey.userId,
      orgId: oldKey.orgId,
      name: `${oldKey.name} (rotated)`,
      keyPrefix,
      keyHash,
      environment: oldKey.environment,
      scopes: oldKey.scopes,
      status: 'active',
      isActive: true,
      expiresAt: oldKey.expiresAt,
      rateLimitPerHour: oldKey.rateLimitPerHour,
    },
  });

  await logApiKeyEvent({
    userId,
    action: 'api_key_rotated',
    apiKeyId: newKey.id,
    details: `Rotated API key "${oldKey.name}" → new key "${newKey.name}" (${newKey.keyPrefix})`,
  });

  return {
    id: newKey.id,
    name: newKey.name,
    keyPrefix: newKey.keyPrefix,
    environment: newKey.environment,
    rawKey, // Shown only once
  };
}

/** Get API key usage stats */
export async function getApiKeyUsageStats(apiKeyId: string, userId: string) {
  const apiKey = await db.apiKey.findFirst({
    where: { id: apiKeyId, userId },
  });

  if (!apiKey) throw new Error('API key not found');

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [usage24h, usage7d, usage30d, recentUsage] = await Promise.all([
    db.apiKeyUsage.count({ where: { apiKeyId, createdAt: { gte: last24h } } }),
    db.apiKeyUsage.count({ where: { apiKeyId, createdAt: { gte: last7d } } }),
    db.apiKeyUsage.count({ where: { apiKeyId, createdAt: { gte: last30d } } }),
    db.apiKeyUsage.findMany({
      where: { apiKeyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return {
    usage24h,
    usage7d,
    usage30d,
    rateLimitPerHour: apiKey.rateLimitPerHour,
    recentUsage,
  };
}

// ===== COMPREHENSIVE USAGE ANALYTICS =====

/** Get comprehensive analytics for all API keys of a user */
export async function getApiKeyAnalytics(userId: string) {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const apiKeys = await db.apiKey.findMany({
    where: { userId },
    select: { id: true, name: true, keyPrefix: true, environment: true, status: true, scopes: true, rateLimitPerHour: true, lastUsedAt: true },
  });

  const keyIds = apiKeys.map((k) => k.id);

  // Total requests across all keys
  const [total24h, total7d, total30d, errorCount24h, errorCount7d] = await Promise.all([
    db.apiKeyUsage.count({ where: { apiKeyId: { in: keyIds }, createdAt: { gte: last24h } } }),
    db.apiKeyUsage.count({ where: { apiKeyId: { in: keyIds }, createdAt: { gte: last7d } } }),
    db.apiKeyUsage.count({ where: { apiKeyId: { in: keyIds }, createdAt: { gte: last30d } } }),
    db.apiKeyUsage.count({ where: { apiKeyId: { in: keyIds }, createdAt: { gte: last24h }, statusCode: { gte: 400 } } }),
    db.apiKeyUsage.count({ where: { apiKeyId: { in: keyIds }, createdAt: { gte: last7d }, statusCode: { gte: 400 } } }),
  ]);

  // Endpoint usage breakdown
  const endpointUsage = await db.apiKeyUsage.groupBy({
    by: ['endpoint'],
    where: { apiKeyId: { in: keyIds }, createdAt: { gte: last30d } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 20,
  });

  // Method breakdown
  const methodUsage = await db.apiKeyUsage.groupBy({
    by: ['method'],
    where: { apiKeyId: { in: keyIds }, createdAt: { gte: last30d } },
    _count: { id: true },
  });

  // Status code breakdown
  const statusBreakdown = await db.apiKeyUsage.groupBy({
    by: ['statusCode'],
    where: { apiKeyId: { in: keyIds }, createdAt: { gte: last7d } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  // Average response time
  const recentWithResponseTime = await db.apiKeyUsage.findMany({
    where: { apiKeyId: { in: keyIds }, responseTime: { not: null }, createdAt: { gte: last7d } },
    select: { responseTime: true },
    take: 500,
  });
  const avgResponseTime = recentWithResponseTime.length > 0
    ? Math.round(recentWithResponseTime.reduce((sum, r) => sum + (r.responseTime || 0), 0) / recentWithResponseTime.length)
    : 0;

  // Daily usage for the last 14 days
  const dailyUsage: { date: string; requests: number; errors: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [reqs, errs] = await Promise.all([
      db.apiKeyUsage.count({ where: { apiKeyId: { in: keyIds }, createdAt: { gte: dayStart, lt: dayEnd } } }),
      db.apiKeyUsage.count({ where: { apiKeyId: { in: keyIds }, createdAt: { gte: dayStart, lt: dayEnd }, statusCode: { gte: 400 } } }),
    ]);

    dailyUsage.push({
      date: dayStart.toISOString().split('T')[0],
      requests: reqs,
      errors: errs,
    });
  }

  // Per-key stats
  const perKeyStats = await Promise.all(
    apiKeys.map(async (key) => {
      const [key24h, key7d, key30d] = await Promise.all([
        db.apiKeyUsage.count({ where: { apiKeyId: key.id, createdAt: { gte: last24h } } }),
        db.apiKeyUsage.count({ where: { apiKeyId: key.id, createdAt: { gte: last7d } } }),
        db.apiKeyUsage.count({ where: { apiKeyId: key.id, createdAt: { gte: last30d } } }),
      ]);
      return {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        environment: key.environment,
        status: key.status,
        lastUsedAt: key.lastUsedAt,
        usage24h: key24h,
        usage7d: key7d,
        usage30d: key30d,
        rateLimitPerHour: key.rateLimitPerHour,
      };
    })
  );

  return {
    summary: {
      totalKeys: apiKeys.length,
      activeKeys: apiKeys.filter((k) => k.status === 'active').length,
      requests24h: total24h,
      requests7d: total7d,
      requests30d: total30d,
      errors24h: errorCount24h,
      errors7d: errorCount7d,
      avgResponseTime,
      errorRate24h: total24h > 0 ? Math.round((errorCount24h / total24h) * 100) : 0,
      errorRate7d: total7d > 0 ? Math.round((errorCount7d / total7d) * 100) : 0,
    },
    endpointUsage: endpointUsage.map((e) => ({ endpoint: e.endpoint, count: e._count.id })),
    methodUsage: methodUsage.map((m) => ({ method: m.method, count: m._count.id })),
    statusBreakdown: statusBreakdown.map((s) => ({ statusCode: s.statusCode, count: s._count.id })),
    dailyUsage,
    perKeyStats,
  };
}

// ===== EXPIRATION CRON =====

/**
 * Disable all expired API keys and log audit events.
 * Called by the cron endpoint or scheduled job.
 *
 * IMPORTANT: Per user requirement, API keys must NEVER expire automatically.
 * This function is intentionally a NO-OP — it returns {expired: 0, errors: 0}
 * without touching any keys, regardless of their expiresAt value.
 *
 * Keys can still be manually revoked or disabled by the user via the UI,
 * but the cron job will never auto-expire them. This ensures keys remain
 * valid permanently unless explicitly revoked by the owner.
 *
 * The cron endpoint remains functional (it still verifies CRON_SECRET and
 * returns a valid response) so existing monitoring/cron infrastructure
 * continues to work without errors.
 */
export async function expireApiKeys(): Promise<{ expired: number; errors: number }> {
  // Permanently disabled — API keys never auto-expire.
  // Keys are only deactivated via explicit user action (revoke/disable).
  return { expired: 0, errors: 0 };
}

/**
 * The original expiration logic, preserved but unused.
 * Kept for reference in case auto-expiration is ever re-enabled.
 * To re-enable: replace expireApiKeys() body with the contents of this function.
 */
async function _expireApiKeysOriginal(): Promise<{ expired: number; errors: number }> {
  let expired = 0;
  let errors = 0;

  try {
    const now = new Date();
    // Find all active keys that have expired
    const expiredKeys = await db.apiKey.findMany({
      where: {
        status: 'active',
        isActive: true,
        expiresAt: { not: null, lt: now },
      },
      select: { id: true, userId: true, name: true, keyPrefix: true },
    });

    for (const key of expiredKeys) {
      try {
        await db.apiKey.update({
          where: { id: key.id },
          data: { status: 'expired', isActive: false },
        });

        await logApiKeyEvent({
          userId: key.userId,
          action: 'api_key_expired',
          apiKeyId: key.id,
          details: `API key "${key.name}" (${key.keyPrefix}) expired automatically`,
        });

        expired++;
      } catch {
        errors++;
      }
    }
  } catch (e) {
    console.error('[ApiKeyService] Expire cron error:', e);
    errors++;
  }

  return { expired, errors };
}

// ===== AUDIT LOGGING =====

async function logApiKeyEvent(params: {
  userId: string;
  action: string;
  apiKeyId: string;
  details: string;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        details: params.details,
        resource: 'api_key',
        resourceId: params.apiKeyId,
      },
    });
  } catch {
    // Never block main flow due to audit logging failure
  }
}
