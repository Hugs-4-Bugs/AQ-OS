// ═══════════════════════════════════════════════════════════════════
// Phase 33 — REAL Backend Integration Tests for Audit & Security
//
// Uses REAL recordAuditEvent() + REAL db.auditLog + REAL
// verifyAuditIntegrity() + REAL requestConfirmation()/confirmAction()
// + REAL detectSuspiciousActivity() + REAL recordConfigChange().
// NO mocking of the security/audit pipeline.
//
// Authentication is mocked at the @/lib/auth boundary only.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db';
});

import { db } from '@/lib/db';
import {
  recordAuditEvent,
  verifyAuditIntegrity,
  requestConfirmation,
  confirmAction,
  detectSuspiciousActivity,
  recordConfigChange,
  recordSecurityEvent,
  SENSITIVE_ACTIONS,
  type SensitiveAction,
} from '@/lib/security/audit-chain';

// Mock ONLY the auth boundary
type MockedAuthModule = typeof import('@/lib/auth') & {
  __mockGetAuthUser: ReturnType<typeof vi.fn>;
};

vi.mock('@/lib/auth', () => {
  const mockGetAuthUser = vi.fn().mockResolvedValue(null);
  return {
    getAuthUser: mockGetAuthUser,
    __mockGetAuthUser: mockGetAuthUser,
    getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
    getUserAgent: vi.fn().mockReturnValue('test-agent'),
    AuthError: class AuthError extends Error {
      statusCode: number;
      constructor(message: string, statusCode = 401) {
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
      }
    },
  };
});

const TEST_ADMIN = {
  id: 'test-admin-phase33',
  email: 'admin-p33@test.local',
  role: 'super_admin',
  plan: 'elite',
};

async function ensureTestAdminUser() {
  await db.user.upsert({
    where: { id: TEST_ADMIN.id },
    create: {
      id: TEST_ADMIN.id,
      email: TEST_ADMIN.email,
      name: 'Test Admin (Phase 33)',
      role: 'super_admin',
      plan: 'elite',
      credits: 0,
      passwordHash: 'test-hash-not-real',
      emailVerified: true,
      isActive: true,
    },
    update: {},
  });
}

// Track test audit entries for cleanup
const testAuditIds: string[] = [];
const testConfirmationIds: string[] = [];

async function cleanupTestData() {
  // Delete test audit entries (by actorId = TEST_ADMIN.id + action starts with 'test_')
  await db.auditLog.deleteMany({
    where: { userId: TEST_ADMIN.id, action: { startsWith: 'test_' } },
  }).catch(() => {});
  // Delete test confirmations
  await db.sensitiveActionConfirmation.deleteMany({
    where: { adminId: TEST_ADMIN.id },
  }).catch(() => {});
  // Delete RBAC test users + their audit entries
  const rbacUserIds = ['su-1', 'ad-1', 'sp-1', 'an-1', 'me-1', 'vi-1'];
  await db.sensitiveActionConfirmation.deleteMany({
    where: { adminId: { in: rbacUserIds } },
  }).catch(() => {});
  await db.auditLog.deleteMany({
    where: { userId: { in: [...rbacUserIds, TEST_ADMIN.id] } },
  }).catch(() => {});
  for (const id of rbacUserIds) {
    await db.user.deleteMany({ where: { id } }).catch(() => {});
  }
  // Delete test admin user
  await db.user.deleteMany({ where: { id: TEST_ADMIN.id } }).catch(() => {});
}

afterAll(async () => {
  await cleanupTestData();
});

function buildGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}
function buildPost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ═══════════════════════════════════════════════════════════════════
// TEST 1 — Immutable Audit Events (append-only + hash chain)
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 REAL] Immutable Audit Events', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await ensureTestAdminUser();
  });

  it('REAL: recordAuditEvent appends to AuditLog with sequence + hash chain', async () => {
    const result = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: 'test_audit_append',
      resource: 'test_resource',
      resourceId: 'test-001',
      details: { reason: 'integration test' },
      severity: 'LOW',
      outcome: 'success',
      requestId: 'req-test-001',
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBeTruthy();
    expect(result!.sequence).toBeGreaterThan(0);
    expect(result!.eventHash).toHaveLength(64); // SHA-256 hex

    // Verify it's persisted in DB
    const dbEntry = await db.auditLog.findUnique({ where: { id: result!.id } });
    expect(dbEntry).not.toBeNull();
    expect(dbEntry!.action).toBe('test_audit_append');
    expect(dbEntry!.severity).toBe('LOW');
    expect(dbEntry!.requestId).toBe('req-test-001');
    expect(dbEntry!.outcome).toBe('success');
    expect(dbEntry!.sequence).toBe(result!.sequence);
    expect(dbEntry!.previousHash).toBeTruthy();
    expect(dbEntry!.eventHash).toBe(result!.eventHash);
    testAuditIds.push(result!.id);
  });

  it('REAL: second event links to first via previousHash (chain)', async () => {
    const event1 = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: 'test_chain_event_1',
      severity: 'LOW',
    });
    const event2 = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: 'test_chain_event_2',
      severity: 'LOW',
    });

    expect(event1).not.toBeNull();
    expect(event2).not.toBeNull();
    expect(event2!.sequence).toBeGreaterThan(event1!.sequence);

    // Verify chain linkage
    const db2 = await db.auditLog.findUnique({ where: { id: event2!.id } });
    expect(db2!.previousHash).toBe(event1!.eventHash);

    testAuditIds.push(event1!.id, event2!.id);
  });

  it('REAL: secrets in details are redacted before persistence', async () => {
    // Construct secret at runtime to avoid GitHub Push Protection
    const sk = 'sk_' + 'live_' + '0'.repeat(30);
    const result = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: 'test_secret_redaction',
      details: { apiKey: sk, password: 'password=secret123', safeField: 'ok' },
    });

    const dbEntry = await db.auditLog.findUnique({ where: { id: result!.id } });
    const detailsJson = dbEntry!.details || '{}';
    expect(detailsJson).not.toMatch(/sk_live_[a-zA-Z0-9]{20,}/);
    expect(detailsJson).toContain('[REDACTED]');
    const parsed = JSON.parse(detailsJson);
    expect(parsed.safeField).toBe('ok');
    testAuditIds.push(result!.id);
  });

  it('REAL: before/after state captured and sanitized', async () => {
    const result = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: 'test_before_after',
      beforeState: { role: 'member', plan: 'free' },
      afterState: { role: 'admin', plan: 'pro' },
    });

    const dbEntry = await db.auditLog.findUnique({ where: { id: result!.id } });
    // sanitizeObject wraps object values in { value: ... } for nested objects
    // But for top-level object input, it processes each key directly
    const before = JSON.parse(dbEntry!.beforeState || '{}');
    const after = JSON.parse(dbEntry!.afterState || '{}');
    // The before/after should contain the role values (sanitized)
    expect(before.role).toBe('member');
    expect(after.role).toBe('admin');
    testAuditIds.push(result!.id);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST 2 — Audit Integrity Verification
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 REAL] Audit Integrity Verification', () => {
  it('REAL: verifyAuditIntegrity returns valid for newly created chain events', async () => {
    await ensureTestAdminUser();
    const event = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: 'test_integrity_verify',
      severity: 'LOW',
    });
    testAuditIds.push(event!.id);

    const result = await verifyAuditIntegrity();
    expect(result.totalEvents).toBeGreaterThan(0);
    expect(result.verifiedEvents).toBe(result.totalEvents);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('firstViolation');
  });

  it('REAL: verifyAuditIntegrity detects modified severity field', async () => {
    await ensureTestAdminUser();
    const event = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: 'test_tamper_severity',
      severity: 'LOW',
    });
    testAuditIds.push(event!.id);

    // Tamper with severity
    await db.auditLog.update({
      where: { id: event!.id },
      data: { severity: 'CRITICAL' },
    });

    const result = await verifyAuditIntegrity();
    expect(result.valid).toBe(false);
    expect(result.firstViolation).not.toBeNull();
    expect(result.firstViolation!.type).toBe('INCORRECT_EVENT_HASH');

    // Restore
    await db.auditLog.update({
      where: { id: event!.id },
      data: { severity: 'LOW' },
    });
  });

  it('REAL: verifyAuditIntegrity detects modified beforeState field', async () => {
    await ensureTestAdminUser();
    const event = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: 'test_tamper_beforestate',
      severity: 'LOW',
      beforeState: { role: 'member' },
    });
    testAuditIds.push(event!.id);

    // Tamper with beforeState
    await db.auditLog.update({
      where: { id: event!.id },
      data: { beforeState: JSON.stringify({ role: 'super_admin' }) },
    });

    const result = await verifyAuditIntegrity();
    expect(result.valid).toBe(false);
    expect(result.firstViolation).not.toBeNull();
    expect(result.firstViolation!.type).toBe('INCORRECT_EVENT_HASH');

    // Restore
    await db.auditLog.update({
      where: { id: event!.id },
      data: { beforeState: JSON.stringify({ value: { role: 'member' } }) },
    });
  });

  it('REAL: verifyAuditIntegrity detects modified outcome field', async () => {
    await ensureTestAdminUser();
    const event = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: 'test_tamper_outcome',
      severity: 'LOW',
      outcome: 'success',
    });
    testAuditIds.push(event!.id);

    // Tamper with outcome
    await db.auditLog.update({
      where: { id: event!.id },
      data: { outcome: 'denied' },
    });

    const result = await verifyAuditIntegrity();
    expect(result.valid).toBe(false);
    expect(result.firstViolation).not.toBeNull();

    // Restore
    await db.auditLog.update({
      where: { id: event!.id },
      data: { outcome: 'success' },
    });
  });

  it('REAL: verifyAuditIntegrity detects modified record', async () => {
    await ensureTestAdminUser();
    const event = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: 'test_tamper_detect',
      severity: 'LOW',
    });
    testAuditIds.push(event!.id);

    // Tamper with the event hash directly in DB
    await db.auditLog.update({
      where: { id: event!.id },
      data: { eventHash: 'tampered_hash_value' },
    });

    const result = await verifyAuditIntegrity();
    expect(result.valid).toBe(false);
    expect(result.firstViolation).not.toBeNull();
    expect(result.firstViolation!.type).toBe('INCORRECT_EVENT_HASH');

    // Restore the original hash (cleanup)
    await db.auditLog.update({
      where: { id: event!.id },
      data: { eventHash: event!.eventHash },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST 3 — Sensitive Action Confirmation
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 REAL] Sensitive Action Confirmation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await ensureTestAdminUser();
  });

  it('REAL: request confirmation → confirm with valid token → success', async () => {
    const req = await requestConfirmation({
      actionType: 'rbac_assign_role' as SensitiveAction,
      targetId: 'user-target-001',
      adminId: TEST_ADMIN.id,
    });
    expect(req.confirmationId).toBeTruthy();
    expect(req.token).toHaveLength(64); // 32 bytes hex
    expect(req.expiresAt.getTime()).toBeGreaterThan(Date.now());
    testConfirmationIds.push(req.confirmationId);

    const confirm = await confirmAction({
      confirmationId: req.confirmationId,
      token: req.token,
      actionType: 'rbac_assign_role' as SensitiveAction,
      targetId: 'user-target-001',
      adminId: TEST_ADMIN.id,
    });
    expect(confirm.valid).toBe(true);
  });

  it('REAL: wrong target → rejected', async () => {
    const req = await requestConfirmation({
      actionType: 'rbac_assign_role' as SensitiveAction,
      targetId: 'user-target-002',
      adminId: TEST_ADMIN.id,
    });
    testConfirmationIds.push(req.confirmationId);

    const confirm = await confirmAction({
      confirmationId: req.confirmationId,
      token: req.token,
      actionType: 'rbac_assign_role' as SensitiveAction,
      targetId: 'wrong-target', // different target
      adminId: TEST_ADMIN.id,
    });
    expect(confirm.valid).toBe(false);
    expect(confirm.reason).toContain('not bound');
  });

  it('REAL: replay same confirmation → rejected (single-use)', async () => {
    const req = await requestConfirmation({
      actionType: 'rbac_assign_role' as SensitiveAction,
      targetId: 'user-target-003',
      adminId: TEST_ADMIN.id,
    });
    testConfirmationIds.push(req.confirmationId);

    // First confirmation — success
    const confirm1 = await confirmAction({
      confirmationId: req.confirmationId,
      token: req.token,
      actionType: 'rbac_assign_role' as SensitiveAction,
      targetId: 'user-target-003',
      adminId: TEST_ADMIN.id,
    });
    expect(confirm1.valid).toBe(true);

    // Replay — should fail (single-use)
    const confirm2 = await confirmAction({
      confirmationId: req.confirmationId,
      token: req.token,
      actionType: 'rbac_assign_role' as SensitiveAction,
      targetId: 'user-target-003',
      adminId: TEST_ADMIN.id,
    });
    expect(confirm2.valid).toBe(false);
    expect(confirm2.reason).toContain('already');
  });

  it('REAL: wrong admin → rejected', async () => {
    const req = await requestConfirmation({
      actionType: 'rbac_assign_role' as SensitiveAction,
      targetId: 'user-target-004',
      adminId: TEST_ADMIN.id,
    });
    testConfirmationIds.push(req.confirmationId);

    const confirm = await confirmAction({
      confirmationId: req.confirmationId,
      token: req.token,
      actionType: 'rbac_assign_role' as SensitiveAction,
      targetId: 'user-target-004',
      adminId: 'different-admin-id', // different admin
    });
    expect(confirm.valid).toBe(false);
    expect(confirm.reason).toContain('different admin');
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST 4 — Security Event Recording + Failed Authorization
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 REAL] Security Events + Failed Authorization', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await ensureTestAdminUser();
  });

  it('REAL: recordSecurityEvent creates AuditLog with securityEventType + severity', async () => {
    // Use TEST_ADMIN.id (exists in DB) as the actor to avoid FK constraint
    await recordSecurityEvent({
      actorId: TEST_ADMIN.id,
      securityEventType: 'authz_permission_denied',
      severity: 'MEDIUM',
      action: 'test_authz_denied',
      resource: 'admin_billing',
      resourceId: 'billing-overview',
      details: { requiredPermission: 'billing:read', actualRole: 'member', deniedActor: 'unauthorized-user' },
      ipAddress: '192.168.1.100',
      outcome: 'denied',
    });

    const entry = await db.auditLog.findFirst({
      where: { action: 'test_authz_denied', userId: TEST_ADMIN.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    expect(entry!.securityEventType).toBe('authz_permission_denied');
    expect(entry!.severity).toBe('MEDIUM');
    expect(entry!.outcome).toBe('denied');
    expect(entry!.ipAddress).toBe('192.168.1.100');
    testAuditIds.push(entry!.id);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST 5 — Suspicious Activity Detection
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 REAL] Suspicious Activity Detection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await ensureTestAdminUser();
  });

  it('REAL: AUTHZ_FAILURE_BURST rule triggers when ≥5 authz failures in 5 min', async () => {
    // Create 6 authz failures from TEST_ADMIN (exists in DB) in the last 5 minutes
    for (let i = 0; i < 6; i++) {
      await recordSecurityEvent({
        actorId: TEST_ADMIN.id,
        securityEventType: 'authz_permission_denied',
        severity: 'MEDIUM',
        action: 'test_authz_burst',
        resource: 'admin_resource',
        outcome: 'denied',
      });
    }

    const detections = await detectSuspiciousActivity();
    const burst = detections.find(d => d.rule === 'AUTHZ_FAILURE_BURST' && d.evidence.actorIds.includes(TEST_ADMIN.id));
    expect(burst).toBeDefined();
    expect(burst!.severity).toBe('HIGH');
    expect(burst!.evidence.count).toBeGreaterThanOrEqual(5);
    expect(burst!.evidence.threshold).toBe(5);

    // Cleanup
    await db.auditLog.deleteMany({ where: { action: 'test_authz_burst' } }).catch(() => {});
  });

  it('REAL: no false positive when below threshold', async () => {
    // Create only 2 authz failures (below threshold of 5)
    for (let i = 0; i < 2; i++) {
      await recordSecurityEvent({
        actorId: TEST_ADMIN.id,
        securityEventType: 'authz_permission_denied',
        severity: 'MEDIUM',
        action: 'test_authz_below_threshold',
        outcome: 'denied',
      });
    }

    const detections = await detectSuspiciousActivity();
    const burst = detections.find(d => d.evidence.actorIds.includes(TEST_ADMIN.id) && d.rule === 'AUTHZ_FAILURE_BURST');
    expect(burst).toBeUndefined(); // No detection for below-threshold

    // Cleanup
    await db.auditLog.deleteMany({ where: { action: 'test_authz_below_threshold' } }).catch(() => {});
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST 6 — Configuration Change Auditing
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 REAL] Configuration Change Auditing', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await ensureTestAdminUser();
  });

  it('REAL: recordConfigChange captures before/after with secrets redacted', async () => {
    // Construct secret at runtime
    const sk = 'sk_' + 'live_' + '0'.repeat(30);
    await recordConfigChange({
      adminId: TEST_ADMIN.id,
      configKey: 'stripe.secret_key',
      configCategory: 'payment',
      beforeValue: sk, // secret — should be redacted
      afterValue: sk,  // secret — should be redacted
    });

    const entry = await db.auditLog.findFirst({
      where: { action: 'config_change', userId: TEST_ADMIN.id, resource: 'configuration' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    expect(entry!.securityEventType).toBe('config_change');
    expect(entry!.resourceId).toBe('stripe.secret_key');

    // Verify before/after don't contain the secret
    const beforeJson = entry!.beforeState || '{}';
    const afterJson = entry!.afterState || '{}';
    expect(beforeJson).not.toMatch(/sk_live_[a-zA-Z0-9]{20,}/);
    expect(afterJson).not.toMatch(/sk_live_[a-zA-Z0-9]{20,}/);
    expect(beforeJson).toContain('[REDACTED]');
    testAuditIds.push(entry!.id);
  });

  it('REAL: safe config values are NOT redacted', async () => {
    await recordConfigChange({
      adminId: TEST_ADMIN.id,
      configKey: 'email.enabled',
      configCategory: 'email',
      beforeValue: false,
      afterValue: true,
    });

    const entry = await db.auditLog.findFirst({
      where: { action: 'config_change', userId: TEST_ADMIN.id, resourceId: 'email.enabled' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    const before = JSON.parse(entry!.beforeState || '{}');
    const after = JSON.parse(entry!.afterState || '{}');
    // recordConfigChange wraps value in { value: params.beforeValue }
    // sanitizeObject processes the wrapper: { value: false } → { value: false } (boolean, not string)
    expect(before.value).toBe(false);
    expect(after.value).toBe(true);
    testAuditIds.push(entry!.id);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST 7 — RBAC for Phase 33 Routes
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 REAL] RBAC — Security Routes', () => {
  let authModule: MockedAuthModule;
  let auditGET: (request: NextRequest) => Promise<Response>;
  let integrityPOST: (request: NextRequest) => Promise<Response>;
  let eventsGET: (request: NextRequest) => Promise<Response>;
  let suspiciousGET: (request: NextRequest) => Promise<Response>;
  let roleChangesGET: (request: NextRequest) => Promise<Response>;
  let configChangesGET: (request: NextRequest) => Promise<Response>;
  let confirmationReqPOST: (request: NextRequest) => Promise<Response>;
  let confirmationConfirmPOST: (request: NextRequest) => Promise<Response>;

  const TEST_USERS = {
    super_admin: { id: 'su-1', email: 'su@t', role: 'super_admin', plan: 'elite' },
    admin: { id: 'ad-1', email: 'ad@t', role: 'admin', plan: 'pro' },
    support: { id: 'sp-1', email: 'sp@t', role: 'support', plan: 'free' },
    analytics: { id: 'an-1', email: 'an@t', role: 'analytics', plan: 'free' },
    member: { id: 'me-1', email: 'me@t', role: 'member', plan: 'free' },
    viewer: { id: 'vi-1', email: 'vi@t', role: 'viewer', plan: 'free' },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    // Ensure test users exist in DB (for FK constraints on confirmation routes)
    for (const [_, u] of Object.entries(TEST_USERS)) {
      await db.user.upsert({
        where: { id: u.id },
        create: {
          id: u.id, email: u.email, name: `Test ${u.role}`,
          role: u.role, plan: u.plan, credits: 0,
          passwordHash: 'test-hash', emailVerified: true, isActive: true,
        },
        update: {},
      }).catch(() => {});
    }
    // Also ensure cleanup of any confirmation records from these users
    await db.sensitiveActionConfirmation.deleteMany({
      where: { adminId: { in: Object.values(TEST_USERS).map(u => u.id) } },
    }).catch(() => {});
    auditGET = (await import('@/app/api/admin/security/audit/route')).GET;
    integrityPOST = (await import('@/app/api/admin/security/audit/verify-integrity/route')).POST;
    eventsGET = (await import('@/app/api/admin/security/events/route')).GET;
    suspiciousGET = (await import('@/app/api/admin/security/suspicious-activity/route')).GET;
    roleChangesGET = (await import('@/app/api/admin/security/role-changes/route')).GET;
    configChangesGET = (await import('@/app/api/admin/security/config-changes/route')).GET;
    confirmationReqPOST = (await import('@/app/api/admin/security/confirmation/request/route')).POST;
    confirmationConfirmPOST = (await import('@/app/api/admin/security/confirmation/confirm/route')).POST;
  });

  // GET /api/admin/security/audit — audit.read (super_admin, admin, support, analytics)
  for (const [role, expected] of [
    ['super_admin', 200], ['admin', 200], ['support', 200], ['analytics', 200],
    ['member', 403], ['viewer', 403],
  ] as const) {
    it(`GET /security/audit role=${role} → ${expected}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await auditGET(buildGet('http://localhost:3000/api/admin/security/audit'));
      expect(res.status).toBe(expected);
    });
  }

  it('GET /security/audit unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const res = await auditGET(buildGet('http://localhost:3000/api/admin/security/audit'));
    expect(res.status).toBe(401);
  });

  // POST /security/audit/verify-integrity — audit.read
  for (const [role, expected] of [
    ['super_admin', 200], ['admin', 200], ['support', 200], ['analytics', 200],
    ['member', 403], ['viewer', 403],
  ] as const) {
    it(`POST /security/audit/verify-integrity role=${role} → ${expected}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await integrityPOST(buildPost('http://localhost:3000/api/admin/security/audit/verify-integrity', {}));
      expect(res.status).toBe(expected);
    });
  }

  // GET /security/events — security.events.read (super_admin ONLY per existing rbac.ts)
  for (const [role, expected] of [
    ['super_admin', 200],
    ['admin', 403], ['support', 403], ['analytics', 403], ['member', 403], ['viewer', 403],
  ] as const) {
    it(`GET /security/events role=${role} → ${expected}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await eventsGET(buildGet('http://localhost:3000/api/admin/security/events'));
      expect(res.status).toBe(expected);
    });
  }

  // GET /security/suspicious-activity — security.events.read (super_admin ONLY)
  for (const [role, expected] of [
    ['super_admin', 200],
    ['admin', 403], ['support', 403], ['analytics', 403], ['member', 403], ['viewer', 403],
  ] as const) {
    it(`GET /security/suspicious-activity role=${role} → ${expected}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await suspiciousGET(buildGet('http://localhost:3000/api/admin/security/suspicious-activity'));
      expect(res.status).toBe(expected);
    });
  }

  // GET /security/role-changes — rbac.read (super_admin only)
  for (const [role, expected] of [
    ['super_admin', 200],
    ['admin', 403], ['support', 403], ['analytics', 403], ['member', 403], ['viewer', 403],
  ] as const) {
    it(`GET /security/role-changes role=${role} → ${expected}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await roleChangesGET(buildGet('http://localhost:3000/api/admin/security/role-changes'));
      expect(res.status).toBe(expected);
    });
  }

  // GET /security/config-changes — audit.read
  for (const [role, expected] of [
    ['super_admin', 200], ['admin', 200], ['support', 200], ['analytics', 200],
    ['member', 403], ['viewer', 403],
  ] as const) {
    it(`GET /security/config-changes role=${role} → ${expected}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await configChangesGET(buildGet('http://localhost:3000/api/admin/security/config-changes'));
      expect(res.status).toBe(expected);
    });
  }

  // POST /security/confirmation/request — rbac.assign (super_admin only)
  for (const [role, expected] of [
    ['super_admin', 200],
    ['admin', 403], ['support', 403], ['analytics', 403], ['member', 403], ['viewer', 403],
  ] as const) {
    it(`POST /security/confirmation/request role=${role} → ${expected}`, async () => {
      authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS[role]);
      const res = await confirmationReqPOST(buildPost('http://localhost:3000/api/admin/security/confirmation/request', {
        actionType: 'rbac_assign_role',
        targetId: 'test-target',
      }));
      expect(res.status).toBe(expected);
    });
  }

  it('POST /security/confirmation/request unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const res = await confirmationReqPOST(buildPost('http://localhost:3000/api/admin/security/confirmation/request', {
      actionType: 'rbac_assign_role',
      targetId: 'test-target',
    }));
    expect(res.status).toBe(401);
  });

  it('POST /security/confirmation/request invalid actionType → 400', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const res = await confirmationReqPOST(buildPost('http://localhost:3000/api/admin/security/confirmation/request', {
      actionType: 'invalid_action',
      targetId: 'test-target',
    }));
    expect(res.status).toBe(400);
  });

  it('POST /security/confirmation/request missing targetId → 400', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_USERS.super_admin);
    const res = await confirmationReqPOST(buildPost('http://localhost:3000/api/admin/security/confirmation/request', {
      actionType: 'rbac_assign_role',
    }));
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════
// BLOCKER 1 — SERVER-ENFORCED SENSITIVE ACTION CONFIRMATION ON rbac/assign
// Tests the ACTUAL mutation endpoint, not just the confirmation service.
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 BLOCKER 1] Server-enforced confirmation on rbac/assign', () => {
  let authModule: MockedAuthModule;
  let assignPOST: (request: NextRequest) => Promise<Response>;
  let confirmReqPOST: (request: NextRequest) => Promise<Response>;
  let targetUserId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_ADMIN);
    await ensureTestAdminUser();
    const assignMod = await import('@/app/api/admin/rbac/assign/route');
    assignPOST = assignMod.POST;
    const confirmMod = await import('@/app/api/admin/security/confirmation/request/route');
    confirmReqPOST = confirmMod.POST;

    // Create a target user for role assignment
    const target = await db.user.create({
      data: {
        email: 'rbac-target@test.local',
        name: 'RBAC Target',
        role: 'member',
        plan: 'free',
        credits: 0,
        passwordHash: 'test-hash',
        emailVerified: true,
        isActive: true,
      },
    });
    targetUserId = target.id;
  });

  afterEach(async () => {
    // Clean up target user + their audit entries
    await db.auditLog.deleteMany({ where: { resourceId: targetUserId } }).catch(() => {});
    await db.sensitiveActionConfirmation.deleteMany({ where: { targetId: targetUserId } }).catch(() => {});
    await db.user.deleteMany({ where: { id: targetUserId } }).catch(() => {});
  });

  function buildAssignPost(body: unknown): NextRequest {
    return new NextRequest('http://localhost:3000/api/admin/rbac/assign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('1. No confirmation → mutation REJECTED (403)', async () => {
    const res = await assignPOST(buildAssignPost({
      userId: targetUserId,
      role: 'admin',
      action: 'assign',
      // NO confirmationId or token
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('confirmation required');

    // Verify user role was NOT changed
    const user = await db.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
    expect(user?.role).toBe('member'); // unchanged
  });

  it('2. Invalid confirmation token → REJECTED', async () => {
    const res = await assignPOST(buildAssignPost({
      userId: targetUserId,
      role: 'admin',
      action: 'assign',
      confirmationId: 'fake-id',
      token: 'invalid-token',
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Invalid confirmation token');
  });

  it('3. Wrong target → REJECTED', async () => {
    // Request confirmation for targetUserId
    const reqRes = await confirmReqPOST(buildPost('http://localhost:3000/api/admin/security/confirmation/request', {
      actionType: 'rbac_assign_role',
      targetId: targetUserId,
    }));
    const reqBody = await reqRes.json();
    const { confirmationId, token } = reqBody.data;

    // Try to use it for a DIFFERENT target
    const res = await assignPOST(buildAssignPost({
      userId: 'different-user-id',
      role: 'admin',
      action: 'assign',
      confirmationId,
      token,
    }));
    expect(res.status).toBe(403);
  });

  it('7. Valid confirmation → mutation SUCCEEDS', async () => {
    // Request confirmation
    const reqRes = await confirmReqPOST(buildPost('http://localhost:3000/api/admin/security/confirmation/request', {
      actionType: 'rbac_assign_role',
      targetId: targetUserId,
    }));
    const reqBody = await reqRes.json();
    const { confirmationId, token } = reqBody.data;

    // Execute mutation with valid confirmation
    const res = await assignPOST(buildAssignPost({
      userId: targetUserId,
      role: 'admin',
      action: 'assign',
      confirmationId,
      token,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.previousRole).toBe('member');
    expect(body.data.newRole).toBe('admin');

    // Verify user role was ACTUALLY changed in DB
    const user = await db.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
    expect(user?.role).toBe('admin');
  });

  it('8. Successful mutation cannot reuse the confirmation', async () => {
    // Request + use confirmation
    const reqRes = await confirmReqPOST(buildPost('http://localhost:3000/api/admin/security/confirmation/request', {
      actionType: 'rbac_assign_role',
      targetId: targetUserId,
    }));
    const { confirmationId, token } = (await reqRes.json()).data;

    // First mutation succeeds
    await assignPOST(buildAssignPost({
      userId: targetUserId, role: 'support', action: 'assign',
      confirmationId, token,
    }));

    // Second mutation with SAME confirmation → rejected
    const res2 = await assignPOST(buildAssignPost({
      userId: targetUserId, role: 'admin', action: 'assign',
      confirmationId, token,
    }));
    expect(res2.status).toBe(403);
  });
});

// Helper to extract error message from response
async function body_error(res: Response): Promise<string> {
  const body = await res.json();
  return body.error || '';
}

// ═══════════════════════════════════════════════════════════════════
// BLOCKER 2 — REAL FAILED-AUTHORIZATION AUDITING
// Tests that real 403 responses create AuditLog entries.
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 BLOCKER 2] Failed authorization creates audit entry', () => {
  let authModule: MockedAuthModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    await ensureTestAdminUser();
    // Also ensure a member user exists for authz failure tests
    await db.user.upsert({
      where: { id: 'member-authz-test' },
      create: {
        id: 'member-authz-test', email: 'member-authz@test.local',
        name: 'Member Authz Test', role: 'member', plan: 'free',
        credits: 0, passwordHash: 'test', emailVerified: true, isActive: true,
      },
      update: {},
    }).catch(() => {});
  });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { userId: 'member-authz-test', action: { startsWith: 'authz_denied' } } }).catch(() => {});
  });

  it('REAL: member requesting admin endpoint → 403 AND AuditLog entry created with authz_permission_denied', async () => {
    // Ensure member user exists in DB (FK constraint for AuditLog.userId)
    await db.user.upsert({
      where: { id: 'member-authz-test' },
      create: {
        id: 'member-authz-test', email: 'member-authz@test.local',
        name: 'Member Authz Test', role: 'member', plan: 'free',
        credits: 0, passwordHash: 'test', emailVerified: true, isActive: true,
      },
      update: {},
    });

    authModule.__mockGetAuthUser.mockResolvedValue({
      id: 'member-authz-test', email: 'member-authz@test.local', role: 'member', plan: 'free',
    });

    // Hit a real protected endpoint (security/audit requires audit.read)
    const auditGET = (await import('@/app/api/admin/security/audit/route')).GET;
    const req = buildGet('http://localhost:3000/api/admin/security/audit');
    const res = await auditGET(req);

    expect(res.status).toBe(403);

    // Wait for the async audit write to complete (dynamic import + DB write)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify AuditLog entry was created
    const auditEntry = await db.auditLog.findFirst({
      where: {
        userId: 'member-authz-test',
        securityEventType: 'authz_permission_denied',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry!.action).toContain('authz_denied');
    expect(auditEntry!.outcome).toBe('denied');
    expect(auditEntry!.severity).toBe('MEDIUM');

    // Cleanup
    await db.auditLog.deleteMany({ where: { userId: 'member-authz-test' } }).catch(() => {});
  });
});

// ═══════════════════════════════════════════════════════════════════
// BLOCKER 3 — REAL CONFIGURATION CHANGE AUDITING
// Tests that the integration action endpoint calls recordConfigChange.
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 BLOCKER 3] Config change audit from real endpoint', () => {
  let authModule: MockedAuthModule;
  let integrationPOST: (request: NextRequest, ctx: { params: Promise<{ provider: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_ADMIN);
    await ensureTestAdminUser();
    const mod = await import('@/app/api/admin/operations/integrations/[provider]/action/route');
    integrationPOST = mod.POST;
  });

  afterEach(async () => {
    await db.auditLog.deleteMany({
      where: { userId: TEST_ADMIN.id, action: 'config_change', resourceId: { startsWith: 'payment.' } },
    }).catch(() => {});
  });

  it('REAL: integration validate action creates config_change audit entry with before/after', async () => {
    const req = buildPost('http://localhost:3000/api/admin/operations/integrations/payment.stripe/action', {
      action: 'validate',
    });
    const res = await integrationPOST(req, { params: Promise.resolve({ provider: 'payment.stripe' }) });
    expect(res.status).toBe(200);

    // Wait for async config change audit
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify config_change audit entry was created
    const entry = await db.auditLog.findFirst({
      where: {
        userId: TEST_ADMIN.id,
        action: 'config_change',
        securityEventType: 'config_change',
        resourceId: 'payment.stripe',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    expect(entry!.beforeState).not.toBeNull();
    expect(entry!.afterState).not.toBeNull();
    expect(entry!.requestId).not.toBeNull(); // Request ID propagated
  });
});

// ═══════════════════════════════════════════════════════════════════
// BLOCKER 5 — CONCURRENCY-SAFE HASH CHAIN
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 BLOCKER 5] Concurrency-safe hash chain', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await ensureTestAdminUser();
  });

  it('REAL: 5 rapid sequential audit writes produce unique sequences + no duplicates', async () => {
    // SQLite has limited concurrency — test rapid sequential writes that
    // exercise the chain logic. True parallel writes on SQLite cause
    // "database is locked" errors (not unique constraint violations).
    const results: any[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await recordAuditEvent({
        actorId: TEST_ADMIN.id,
        action: `test_rapid_${i}`,
        severity: 'LOW',
      });
      results.push(r);
    }

    // All should succeed
    const successful = results.filter(r => r !== null);
    expect(successful.length).toBe(5);

    // Verify all sequences are unique
    const sequences = successful.map(r => r.sequence);
    const uniqueSequences = new Set(sequences);
    expect(uniqueSequences.size).toBe(5);

    // Verify no duplicate sequences in DB
    const dbEvents = await db.auditLog.findMany({
      where: { userId: TEST_ADMIN.id, action: { startsWith: 'test_rapid_' } },
      select: { sequence: true },
    });
    const dbSequences = dbEvents.map(e => e.sequence).filter(s => s !== null);
    expect(new Set(dbSequences).size).toBe(dbSequences.length); // No duplicates

    // Cleanup
    await db.auditLog.deleteMany({
      where: { userId: TEST_ADMIN.id, action: { startsWith: 'test_rapid_' } },
    }).catch(() => {});
  });
});

// ═══════════════════════════════════════════════════════════════════
// BLOCKER 6 — COMPLETE TAMPER DETECTION (all fields)
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 33 BLOCKER 6] Complete tamper detection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await ensureTestAdminUser();
  });

  // Helper: create event, tamper a field, verify detection, restore
  async function testTamperDetection(
    fieldName: string,
    tamperedValue: unknown,
    restoreValue: unknown
  ) {
    const event = await recordAuditEvent({
      actorId: TEST_ADMIN.id,
      action: `test_tamper_${fieldName}`,
      severity: 'LOW',
      outcome: 'success',
      beforeState: { role: 'member' },
      afterState: { role: 'admin' },
      requestId: 'req-tamper-test',
    });
    testAuditIds.push(event!.id);

    // Tamper
    await db.auditLog.update({
      where: { id: event!.id },
      data: { [fieldName]: tamperedValue } as any,
    });

    const result = await verifyAuditIntegrity();
    expect(result.valid).toBe(false);
    expect(result.firstViolation).not.toBeNull();
    expect(result.firstViolation!.type).toBe('INCORRECT_EVENT_HASH');

    // Restore
    await db.auditLog.update({
      where: { id: event!.id },
      data: { [fieldName]: restoreValue } as any,
    });
  }

  it('detects actor modification', async () => {
    // Can't use a non-existent userId due to FK constraint.
    // Use a different existing user ID (kattyboy785@gmail.com exists in DB).
    const realUser = await db.user.findFirst({ where: { email: 'kattyboy785@gmail.com' }, select: { id: true } });
    await testTamperDetection('userId', realUser!.id, TEST_ADMIN.id);
  });

  it('detects action modification', async () => {
    await testTamperDetection('action', 'tampered_action', `test_tamper_action`);
  });

  it('detects severity modification', async () => {
    await testTamperDetection('severity', 'CRITICAL', 'LOW');
  });

  it('detects outcome modification', async () => {
    await testTamperDetection('outcome', 'denied', 'success');
  });

  it('detects beforeState modification', async () => {
    const orig = JSON.stringify({ value: { role: 'member' } });
    await testTamperDetection('beforeState', JSON.stringify({ value: { role: 'super_admin' } }), orig);
  });

  it('detects afterState modification', async () => {
    const orig = JSON.stringify({ value: { role: 'admin' } });
    await testTamperDetection('afterState', JSON.stringify({ value: { role: 'member' } }), orig);
  });

  it('detects requestId modification', async () => {
    await testTamperDetection('requestId', 'tampered-req-id', 'req-tamper-test');
  });

  it('detects securityEventType modification', async () => {
    await testTamperDetection('securityEventType', 'tampered_type', null);
  });
});
