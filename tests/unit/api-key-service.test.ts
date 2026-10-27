// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: API Key Service
// Phase 12: Testing
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock DB with vi.hoisted for proper hoisting
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    apiKey: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    apiKeyUsage: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => typeof fn === 'function' ? fn(mockDb) : fn),
  };
  return { mockDb };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import {
  generateRawKey,
  hashKey,
  getKeyPrefix,
  isValidKeyFormat,
  validateScopes,
  API_KEY_SCOPES,
} from '@/lib/api-key-service';

// ═══════════════════════════════════════════════════════════════════
// KEY GENERATION
// ═══════════════════════════════════════════════════════════════════

describe('Key Generation', () => {
  it('should generate a live key with aq_live_ prefix', () => {
    const key = generateRawKey('live');
    expect(key).toMatch(/^aq_live_[0-9a-f]{64}$/);
  });

  it('should generate a test key with aq_test_ prefix', () => {
    const key = generateRawKey('test');
    expect(key).toMatch(/^aq_test_[0-9a-f]{64}$/);
  });

  it('should generate unique keys on successive calls', () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateRawKey('live')));
    expect(keys.size).toBe(10);
  });

  it('should generate keys of correct total length', () => {
    const liveKey = generateRawKey('live');
    const testKey = generateRawKey('test');
    // "aq_live_" = 8 chars + 64 hex chars = 72 total
    expect(liveKey.length).toBe(72);
    expect(testKey.length).toBe(72);
  });
});

// ═══════════════════════════════════════════════════════════════════
// KEY HASHING
// ═══════════════════════════════════════════════════════════════════

describe('Key Hashing', () => {
  it('should produce a SHA-256 hash (64 hex chars)', () => {
    const key = generateRawKey('live');
    const hash = hashKey(key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should produce the same hash for the same key', () => {
    const key = generateRawKey('live');
    const hash1 = hashKey(key);
    const hash2 = hashKey(key);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different keys', () => {
    const key1 = generateRawKey('live');
    const key2 = generateRawKey('live');
    const hash1 = hashKey(key1);
    const hash2 = hashKey(key2);
    expect(hash1).not.toBe(hash2);
  });

  it('should not be reversible (hash is not the key)', () => {
    const key = generateRawKey('live');
    const hash = hashKey(key);
    expect(hash).not.toBe(key);
  });
});

// ═══════════════════════════════════════════════════════════════════
// KEY PREFIX EXTRACTION
// ═══════════════════════════════════════════════════════════════════

describe('Key Prefix Extraction', () => {
  it('should extract 12-char prefix from live key', () => {
    const key = generateRawKey('live');
    const prefix = getKeyPrefix(key);
    expect(prefix).toMatch(/^aq_live_[0-9a-f]{4}$/);
    expect(prefix.length).toBe(12);
  });

  it('should extract 12-char prefix from test key', () => {
    const key = generateRawKey('test');
    const prefix = getKeyPrefix(key);
    expect(prefix).toMatch(/^aq_test_[0-9a-f]{4}$/);
    expect(prefix.length).toBe(12);
  });
});

// ═══════════════════════════════════════════════════════════════════
// KEY FORMAT VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('Key Format Validation', () => {
  it('should accept valid live key format', () => {
    const key = generateRawKey('live');
    expect(isValidKeyFormat(key)).toBe(true);
  });

  it('should accept valid test key format', () => {
    const key = generateRawKey('test');
    expect(isValidKeyFormat(key)).toBe(true);
  });

  it('should reject key without proper prefix', () => {
    expect(isValidKeyFormat('sk_live_abcdef1234567890')).toBe(false);
    expect(isValidKeyFormat('random_key_string')).toBe(false);
  });

  it('should reject too-short keys', () => {
    expect(isValidKeyFormat('aq_live_abc')).toBe(false);
    expect(isValidKeyFormat('aq_test_short')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidKeyFormat('')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SCOPE VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('Scope Validation', () => {
  it('should accept valid scopes', () => {
    const result = validateScopes(['leads.read', 'leads.write', 'admin']);
    expect(result.valid).toBe(true);
    expect(result.invalid).toHaveLength(0);
  });

  it('should reject invalid scopes', () => {
    const result = validateScopes(['leads.read', 'invalid.scope', 'also.invalid']);
    expect(result.valid).toBe(false);
    expect(result.invalid).toContain('invalid.scope');
    expect(result.invalid).toContain('also.invalid');
  });

  it('should accept all defined API key scopes', () => {
    const result = validateScopes([...API_KEY_SCOPES]);
    expect(result.valid).toBe(true);
  });

  it('should handle empty scope list', () => {
    const result = validateScopes([]);
    expect(result.valid).toBe(true);
    expect(result.invalid).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// KEY VERIFICATION (DB-dependent)
// ═══════════════════════════════════════════════════════════════════

describe('Key Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject keys with invalid format', async () => {
    const { verifyApiKey } = await import('@/lib/api-key-service');
    const result = await verifyApiKey('invalid_key_format');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('invalid_key');
    }
  });

  it('should reject keys not found in database', async () => {
    const { verifyApiKey } = await import('@/lib/api-key-service');
    mockDb.apiKey.findFirst.mockResolvedValue(null);

    const key = generateRawKey('live');
    const result = await verifyApiKey(key);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('invalid_key');
    }
  });

  it('should reject revoked keys', async () => {
    const { verifyApiKey } = await import('@/lib/api-key-service');
    const key = generateRawKey('live');
    const keyHash = hashKey(key);

    mockDb.apiKey.findFirst.mockResolvedValue({
      id: 'key_1',
      userId: 'user_1',
      orgId: null,
      environment: 'live',
      scopes: 'leads.read,leads.write',
      status: 'revoked',
      isActive: false,
      expiresAt: null,
      rateLimitPerHour: 1000,
    });

    const result = await verifyApiKey(key);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('revoked');
    }
  });

  it('should reject disabled keys', async () => {
    const { verifyApiKey } = await import('@/lib/api-key-service');
    const key = generateRawKey('live');

    mockDb.apiKey.findFirst.mockResolvedValue({
      id: 'key_1',
      userId: 'user_1',
      orgId: null,
      environment: 'live',
      scopes: 'leads.read',
      status: 'disabled',
      isActive: false,
      expiresAt: null,
      rateLimitPerHour: 1000,
    });

    const result = await verifyApiKey(key);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('disabled');
    }
  });

  it('should NOT reject keys with past expiresAt (per user requirement - keys never auto-expire)', async () => {
    // PRODUCT POLICY (per user requirement, documented in api-key-service.ts):
    //   "Per user requirement, API keys must NEVER expire automatically."
    // The `expiresAt` field is stored for DISPLAY PURPOSES ONLY — even if
    // it is in the past, the key remains valid until manually revoked or
    // disabled by the owner. The cron job (expireApiKeys) is intentionally
    // a no-op. This test verifies that a key with `status:'active'` and a
    // past `expiresAt` is still accepted by verifyApiKey.
    const { verifyApiKey } = await import('@/lib/api-key-service');
    const key = generateRawKey('live');

    mockDb.apiKey.findFirst.mockResolvedValue({
      id: 'key_1',
      userId: 'user_1',
      orgId: null,
      environment: 'live',
      scopes: 'leads.read',
      status: 'active',
      isActive: true,
      expiresAt: new Date('2020-01-01'), // Past expiration — display only
      rateLimitPerHour: 1000,
    });
    mockDb.apiKey.update.mockResolvedValue({});

    const result = await verifyApiKey(key);
    expect(result.valid).toBe(true);
    // Note: verifyApiKey DOES call db.apiKey.update — but only to track
    // lastUsedAt (usage analytics). It does NOT mark the key as expired
    // because per user requirement, keys never auto-expire. The update
    // call uses `data: { lastUsedAt: new Date() }` — never `status: 'expired'`.
    // (We don't assert `not.toHaveBeenCalled()` because the lastUsedAt
    // tracking call is legitimate and unrelated to expiry.)
  });

  it('should accept a valid active key', async () => {
    const { verifyApiKey } = await import('@/lib/api-key-service');
    const key = generateRawKey('live');

    mockDb.apiKey.findFirst.mockResolvedValue({
      id: 'key_1',
      userId: 'user_1',
      orgId: null,
      environment: 'live',
      scopes: 'leads.read,leads.write',
      status: 'active',
      isActive: true,
      expiresAt: null,
      rateLimitPerHour: 1000,
    });
    mockDb.apiKeyUsage.count.mockResolvedValue(5);
    mockDb.apiKey.update.mockResolvedValue({});

    const result = await verifyApiKey(key);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.apiKey.id).toBe('key_1');
      expect(result.apiKey.scopes).toContain('leads.read');
      expect(result.apiKey.scopes).toContain('leads.write');
    }
  });

  it('should reject keys with insufficient scope', async () => {
    const { verifyApiKey } = await import('@/lib/api-key-service');
    const key = generateRawKey('live');

    mockDb.apiKey.findFirst.mockResolvedValue({
      id: 'key_1',
      userId: 'user_1',
      orgId: null,
      environment: 'live',
      scopes: 'leads.read',
      status: 'active',
      isActive: true,
      expiresAt: null,
      rateLimitPerHour: 1000,
    });
    mockDb.apiKeyUsage.count.mockResolvedValue(5);

    const result = await verifyApiKey(key, 'leads.write');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('scope_denied');
    }
  });

  it('should allow admin scope to bypass specific scope checks', async () => {
    const { verifyApiKey } = await import('@/lib/api-key-service');
    const key = generateRawKey('live');

    mockDb.apiKey.findFirst.mockResolvedValue({
      id: 'key_1',
      userId: 'user_1',
      orgId: null,
      environment: 'live',
      scopes: 'admin',
      status: 'active',
      isActive: true,
      expiresAt: null,
      rateLimitPerHour: 1000,
    });
    mockDb.apiKeyUsage.count.mockResolvedValue(5);
    mockDb.apiKey.update.mockResolvedValue({});

    const result = await verifyApiKey(key, 'leads.write');
    expect(result.valid).toBe(true);
  });

  it('should reject rate-limited keys', async () => {
    const { verifyApiKey } = await import('@/lib/api-key-service');
    const key = generateRawKey('live');

    mockDb.apiKey.findFirst.mockResolvedValue({
      id: 'key_1',
      userId: 'user_1',
      orgId: null,
      environment: 'live',
      scopes: 'leads.read',
      status: 'active',
      isActive: true,
      expiresAt: null,
      rateLimitPerHour: 100,
    });
    mockDb.apiKeyUsage.count.mockResolvedValue(100); // At limit

    const result = await verifyApiKey(key, 'leads.read');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('rate_limited');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// EXPIRE API KEYS (CRON)
// ═══════════════════════════════════════════════════════════════════

describe('expireApiKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be a no-op — keys never auto-expire (per user requirement)', async () => {
    // PRODUCT POLICY (per user requirement, documented in api-key-service.ts):
    //   "This function is intentionally a NO-OP — it returns {expired: 0, errors: 0}
    //    without touching any keys, regardless of their expiresAt value."
    // Keys are only deactivated via explicit user action (revoke/disable).
    // The cron endpoint remains functional (it verifies CRON_SECRET and
    // returns a valid response) so monitoring/cron infrastructure continues
    // to work without errors.
    const { expireApiKeys } = await import('@/lib/api-key-service');

    mockDb.apiKey.findMany.mockResolvedValue([
      { id: 'key_1', userId: 'user_1', name: 'Test Key', keyPrefix: 'aq_live_abcd' },
    ]);
    mockDb.apiKey.update.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});

    const result = await expireApiKeys();
    // No keys are touched — the function is a deliberate no-op.
    expect(result.expired).toBe(0);
    expect(result.errors).toBe(0);
    // CRITICAL: update is NEVER called (auto-expire is disabled).
    expect(mockDb.apiKey.update).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('should return 0 expired when no keys need expiration', async () => {
    const { expireApiKeys } = await import('@/lib/api-key-service');

    mockDb.apiKey.findMany.mockResolvedValue([]);

    const result = await expireApiKeys();
    expect(result.expired).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('should never error — no-op function does not touch any keys (per user requirement)', async () => {
    // PRODUCT POLICY: since expireApiKeys() is a deliberate no-op, it never
    // calls db.apiKey.update — therefore update failures cannot occur and
    // `errors` is always 0. This test confirms the no-op behavior holds even
    // when the underlying mock would have thrown.
    const { expireApiKeys } = await import('@/lib/api-key-service');

    mockDb.apiKey.findMany.mockResolvedValue([
      { id: 'key_1', userId: 'user_1', name: 'Key 1', keyPrefix: 'aq_live_abcd' },
      { id: 'key_2', userId: 'user_2', name: 'Key 2', keyPrefix: 'aq_live_efgh' },
    ]);
    // The mock rejection below is NEVER reached — expireApiKeys() is a no-op.
    mockDb.apiKey.update
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('DB error'));
    mockDb.auditLog.create.mockResolvedValue({});

    const result = await expireApiKeys();
    expect(result.expired).toBe(0);
    expect(result.errors).toBe(0);
    // CRITICAL: update is NEVER called, so the rejected mock never fires.
    expect(mockDb.apiKey.update).not.toHaveBeenCalled();
  });
});
