// ═══════════════════════════════════════════════════════════════════
// Phase 32 — REAL SystemEvent Integration Tests
//
// Uses REAL recordSystemEvent() + REAL db.systemEvent + REAL
// getOperationalEvents() + REAL resolveOperationalEvent().
// NO mocking of the SystemEvent pipeline.
//
// Tests prove:
//   A — real operational failure creates SystemEvent + visible through API
//   B — event resolution works + AuditLog accountability + idempotency
//   C — secret protection (details never contain secrets)
//   D — operational filtering (type/source/resolved/dateRange)
//   E — RBAC (unauthorized → 401, insufficient → 403, authorized → access)
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db';
});

import { db } from '@/lib/db';
import { recordSystemEvent } from '@/lib/system-event-service';

// Mock ONLY the auth boundary — service + DB are REAL
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

// Mock requireConfirmation — Phase 33 enforces confirmation on event resolution
vi.mock('@/lib/security/require-confirmation', () => ({
  requireConfirmation: vi.fn().mockResolvedValue({
    valid: true,
    confirmationId: 'mock-confirmation-id',
    requestId: 'mock-request-id',
  }),
}));

const TEST_ADMIN = {
  id: 'test-admin-sys-event',
  email: 'admin-sys-event@test.local',
  role: 'super_admin',
  plan: 'elite',
};

async function ensureTestAdminUser() {
  await db.user.upsert({
    where: { id: TEST_ADMIN.id },
    create: {
      id: TEST_ADMIN.id,
      email: TEST_ADMIN.email,
      name: 'Test Admin (SystemEvent)',
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

// Track all test event IDs for cleanup
const testEventIds: string[] = [];

async function cleanupTestEvents() {
  // Delete AuditLog entries for resolved test events
  for (const eventId of testEventIds) {
    await db.auditLog.deleteMany({
      where: { action: 'event_resolved', resourceId: eventId },
    }).catch(() => {});
  }
  // Delete test SystemEvents by source prefix
  await db.systemEvent.deleteMany({
    where: { source: { startsWith: 'test-' } },
  }).catch(() => {});
  // Delete test admin user
  await db.auditLog.deleteMany({ where: { userId: TEST_ADMIN.id } }).catch(() => {});
  await db.user.deleteMany({ where: { id: TEST_ADMIN.id } }).catch(() => {});
}

afterAll(async () => {
  await cleanupTestEvents();
});

function buildGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}
function buildPatch(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ═══════════════════════════════════════════════════════════════════
// TEST A — Real operational failure creates SystemEvent + visible through API
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 SystemEvent] TEST A — real failure creates event + API visibility', () => {
  let authModule: MockedAuthModule;
  let eventsGET: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_ADMIN);
    await ensureTestAdminUser();
    const mod = await import('@/app/api/admin/operations/events/route');
    eventsGET = mod.GET;
  });

  it('REAL: recordSystemEvent() creates a SystemEvent in DB + visible through getOperationalEvents()', async () => {
    // Record a real operational event
    await recordSystemEvent({
      type: 'error',
      source: 'test-workflow-executor',
      message: 'Test workflow execution failed at step "send_email"',
      details: {
        executionId: 'test-exec-123',
        workflowId: 'test-wf-456',
        stepName: 'send_email',
        errorPreview: 'SMTP connection refused',
      },
    });

    // Verify it was persisted in the DB
    const dbEvent = await db.systemEvent.findFirst({
      where: { source: 'test-workflow-executor' },
      orderBy: { createdAt: 'desc' },
    });
    expect(dbEvent).not.toBeNull();
    expect(dbEvent!.type).toBe('error');
    expect(dbEvent!.source).toBe('test-workflow-executor');
    expect(dbEvent!.message).toContain('Test workflow execution failed');
    expect(dbEvent!.resolved).toBe(false);
    testEventIds.push(dbEvent!.id);

    // Verify the details JSON contains the expected fields
    const details = JSON.parse(dbEvent!.details || '{}');
    expect(details.executionId).toBe('test-exec-123');
    expect(details.workflowId).toBe('test-wf-456');
    expect(details.stepName).toBe('send_email');

    // Verify it's visible through the API (getOperationalEvents)
    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events?source=test-workflow-executor'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const found = body.data.events.find((e: { id: string }) => e.id === dbEvent!.id);
    expect(found).toBeDefined();
    expect(found.type).toBe('error');
    expect(found.source).toBe('test-workflow-executor');
  });

  it('REAL: critical event type persisted correctly', async () => {
    await recordSystemEvent({
      type: 'critical',
      source: 'test-critical-path',
      message: 'Database connection lost',
      details: { host: 'localhost', port: 5432 },
    });

    const dbEvent = await db.systemEvent.findFirst({
      where: { source: 'test-critical-path', type: 'critical' },
      orderBy: { createdAt: 'desc' },
    });
    expect(dbEvent).not.toBeNull();
    expect(dbEvent!.type).toBe('critical');
    testEventIds.push(dbEvent!.id);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST B — Event resolution + AuditLog accountability + idempotency
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 SystemEvent] TEST B — resolution + AuditLog + idempotency', () => {
  let authModule: MockedAuthModule;
  let eventsPATCH: (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let testEventId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_ADMIN);
    await ensureTestAdminUser();
    const mod = await import('@/app/api/admin/operations/events/[id]/route');
    eventsPATCH = mod.PATCH;

    // Create a real SystemEvent for resolution testing
    await recordSystemEvent({
      type: 'warning',
      source: 'test-resolution',
      message: 'Test event for resolution testing',
      details: { testPurpose: 'resolution-integration-test' },
    });
    const event = await db.systemEvent.findFirst({
      where: { source: 'test-resolution' },
      orderBy: { createdAt: 'desc' },
    });
    testEventId = event!.id;
    testEventIds.push(testEventId);
  });

  it('REAL: unresolved event → PATCH → resolved=true + resolvedAt + AuditLog created', async () => {
    // Verify initial state
    const before = await db.systemEvent.findUnique({ where: { id: testEventId } });
    expect(before?.resolved).toBe(false);
    expect(before?.resolvedAt).toBeNull();

    // Resolve via real API
    const res = await eventsPATCH(
      buildPatch(`http://localhost:3000/api/admin/operations/events/${testEventId}`, { note: 'Resolved by integration test' }),
      { params: Promise.resolve({ id: testEventId }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(body.data.alreadyResolved).toBe(false);

    // Verify DB state
    const after = await db.systemEvent.findUnique({ where: { id: testEventId } });
    expect(after?.resolved).toBe(true);
    expect(after?.resolvedAt).not.toBeNull();
    expect(after?.resolvedAt instanceof Date).toBe(true);

    // Verify AuditLog entry was created (accountability — who resolved it)
    const auditEntries = await db.auditLog.findMany({
      where: { action: 'event_resolved', resourceId: testEventId },
    });
    expect(auditEntries.length).toBe(1);
    expect(auditEntries[0].userId).toBe(TEST_ADMIN.id);
    expect(auditEntries[0].resource).toBe('system_event');
  });

  it('REAL: second resolution is idempotent (no duplicate audit)', async () => {
    // First resolution
    await eventsPATCH(
      buildPatch(`http://localhost:3000/api/admin/operations/events/${testEventId}`, { note: 'First' }),
      { params: Promise.resolve({ id: testEventId }) }
    );

    // Second resolution — should be idempotent
    const res2 = await eventsPATCH(
      buildPatch(`http://localhost:3000/api/admin/operations/events/${testEventId}`, { note: 'Second' }),
      { params: Promise.resolve({ id: testEventId }) }
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.data.alreadyResolved).toBe(true);

    // Only ONE audit entry (no duplicate)
    const auditEntries = await db.auditLog.findMany({
      where: { action: 'event_resolved', resourceId: testEventId },
    });
    expect(auditEntries.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST C — Secret protection (details never contain secrets)
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 SystemEvent] TEST C — secret redaction', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('REAL: secrets in details are redacted before persistence', async () => {
    // Construct secret-like patterns at runtime so the literal strings
    // don't appear in source code (avoids GitHub Push Protection triggers).
    // The patterns still match our redaction regex (sk_live_[a-zA-Z0-9]{20,}).
    const sk = 'sk_' + 'live_' + '0'.repeat(30); // matches sk_live_[a-zA-Z0-9]{20,}
    const whsec = 'whsec_' + '0'.repeat(30); // matches whsec_[a-zA-Z0-9]{20,}
    const bearer = 'Bearer ' + 'x'.repeat(30); // matches Bearer\s+[a-zA-Z0-9._-]{20,}
    await recordSystemEvent({
      type: 'error',
      source: 'test-secret-redaction',
      message: `Provider call failed with API key ${sk}`,
      details: {
        stripeKey: `STRIPE_SECRET_KEY=${sk}`,
        razorpaySecret: `RAZORPAY_KEY_SECRET=${'0'.repeat(20)}`,
        password: `password=${'x'.repeat(16)}`,
        authToken: bearer,
        webhookSecret: whsec,
        safeField: 'this is safe to store',
      },
    });

    const dbEvent = await db.systemEvent.findFirst({
      where: { source: 'test-secret-redaction' },
      orderBy: { createdAt: 'desc' },
    });
    expect(dbEvent).not.toBeNull();
    testEventIds.push(dbEvent!.id);

    // Message should be redacted
    expect(dbEvent!.message).not.toMatch(/sk_live_[a-zA-Z0-9]{20,}/);
    expect(dbEvent!.message).toContain('[REDACTED]');

    // Details should be redacted
    const detailsJson = dbEvent!.details || '{}';
    expect(detailsJson).not.toMatch(/sk_live_[a-zA-Z0-9]{20,}/);
    expect(detailsJson).not.toMatch(/whsec_[a-zA-Z0-9]{20,}/);
    expect(detailsJson).not.toMatch(/Bearer\s+[a-zA-Z0-9._-]{20,}/);
    expect(detailsJson).toContain('[REDACTED]');
    // Safe fields should still be present
    const details = JSON.parse(detailsJson);
    expect(details.safeField).toBe('this is safe to store');
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST D — Operational filtering (type/source/resolved/dateRange)
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 SystemEvent] TEST D — real DB filtering', () => {
  let authModule: MockedAuthModule;
  let eventsGET: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    authModule.__mockGetAuthUser.mockResolvedValue(TEST_ADMIN);
    await ensureTestAdminUser();
    const mod = await import('@/app/api/admin/operations/events/route');
    eventsGET = mod.GET;
  });

  it('REAL: filter by type=error returns only error events', async () => {
    // Create test events of different types
    await recordSystemEvent({ type: 'error', source: 'test-filter-error', message: 'Error event' });
    await recordSystemEvent({ type: 'warning', source: 'test-filter-warning', message: 'Warning event' });
    await recordSystemEvent({ type: 'info', source: 'test-filter-info', message: 'Info event' });

    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events?type=error&source=test-filter'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // All returned events should be type=error
    for (const e of body.data.events) {
      expect(e.type).toBe('error');
      expect(e.source).toContain('test-filter');
    }
    // Cleanup
    await db.systemEvent.deleteMany({ where: { source: { startsWith: 'test-filter' } } }).catch(() => {});
  });

  it('REAL: filter by resolved=false returns only unresolved events', async () => {
    // Create an unresolved + a resolved event
    await recordSystemEvent({ type: 'warning', source: 'test-resolved-filter-unresolved', message: 'Unresolved' });
    await recordSystemEvent({ type: 'warning', source: 'test-resolved-filter-resolved', message: 'Will be resolved' });

    const toResolve = await db.systemEvent.findFirst({
      where: { source: 'test-resolved-filter-resolved' },
      orderBy: { createdAt: 'desc' },
    });
    if (toResolve) {
      await db.systemEvent.update({ where: { id: toResolve.id }, data: { resolved: true, resolvedAt: new Date() } });
    }

    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events?resolved=false&source=test-resolved-filter'));
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const e of body.data.events) {
      expect(e.resolved).toBe(false);
    }
    // Cleanup
    await db.systemEvent.deleteMany({ where: { source: { startsWith: 'test-resolved-filter' } } }).catch(() => {});
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST E — RBAC (unauthorized → 401, insufficient → 403, authorized → access)
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 SystemEvent] TEST E — RBAC', () => {
  let authModule: MockedAuthModule;
  let eventsGET: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    authModule = (await import('@/lib/auth')) as MockedAuthModule;
    const mod = await import('@/app/api/admin/operations/events/route');
    eventsGET = mod.GET;
  });

  it('REAL: unauthenticated → 401', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue(null);
    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events'));
    expect(res.status).toBe(401);
  });

  it('REAL: member role → 403 (lacks system.health.read)', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue({ id: 'member-1', email: 'm@t', role: 'member', plan: 'free' });
    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events'));
    expect(res.status).toBe(403);
  });

  it('REAL: viewer role → 403 (lacks system.health.read)', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue({ id: 'viewer-1', email: 'v@t', role: 'viewer', plan: 'free' });
    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events'));
    expect(res.status).toBe(403);
  });

  it('REAL: super_admin → 200 (has system.health.read)', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue({ id: TEST_ADMIN.id, email: 'sa@t', role: 'super_admin', plan: 'elite' });
    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events'));
    expect(res.status).toBe(200);
  });

  it('REAL: admin → 200 (has system.health.read)', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue({ id: 'admin-1', email: 'a@t', role: 'admin', plan: 'pro' });
    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events'));
    expect(res.status).toBe(200);
  });

  it('REAL: support → 200 (has system.health.read)', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue({ id: 'support-1', email: 's@t', role: 'support', plan: 'free' });
    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events'));
    expect(res.status).toBe(200);
  });

  it('REAL: analytics → 200 (has system.health.read)', async () => {
    authModule.__mockGetAuthUser.mockResolvedValue({ id: 'analytics-1', email: 'an@t', role: 'analytics', plan: 'free' });
    const res = await eventsGET(buildGet('http://localhost:3000/api/admin/operations/events'));
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST F — recordSystemEvent never throws (safe from failure paths)
// ═══════════════════════════════════════════════════════════════════
describe('[Phase 32 SystemEvent] TEST F — recordSystemEvent safety', () => {
  it('REAL: does NOT throw even with invalid type', async () => {
    // Should not throw — falls back to 'error'
    await expect(
      recordSystemEvent({
        type: 'invalid-type' as 'error',
        source: 'test-safety',
        message: 'Test invalid type',
      })
    ).resolves.not.toThrow();
    // Cleanup
    await db.systemEvent.deleteMany({ where: { source: 'test-safety' } }).catch(() => {});
  });

  it('REAL: does NOT throw with empty message', async () => {
    await expect(
      recordSystemEvent({
        type: 'info',
        source: 'test-safety-empty',
        message: '',
      })
    ).resolves.not.toThrow();
    await db.systemEvent.deleteMany({ where: { source: 'test-safety-empty' } }).catch(() => {});
  });
});
