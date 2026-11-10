// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Real API-level integration tests
//
// These tests invoke the ACTUAL route handler functions (GET/POST)
// exported from the route.ts files, using real JWT tokens minted via
// generateAccessToken(), against the isolated test SQLite database.
//
// NO mocking of @/lib/db or @/lib/auth — the real Prisma client and
// real auth middleware are exercised.
//
// Phase 1B: Real GDPR API Integration, Authorization & Consent Enforcement
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { generateAccessToken } from '@/lib/auth';

// Import the ACTUAL route handlers
import { GET as consentGET, POST as consentPOST } from '@/app/api/gdpr/consent/route';
import { POST as exportRequestPOST } from '@/app/api/settings/account/export-request/route';

// ── Test helpers ────────────────────────────────────────────────────

async function createTestUser(email: string = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`) {
  return db.user.create({
    data: {
      email,
      name: 'Test User',
      passwordHash: '$2a$12$testhash',
      plan: 'free',
      isActive: true,
      emailVerified: true,
    },
  });
}

async function createTestSettings(userId: string) {
  return db.userSettings.create({
    data: {
      userId,
    },
  });
}

function mintToken(user: { id: string; email: string; role: string; plan: string; orgId: string | null }) {
  return generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    orgId: user.orgId,
    isTrial: false,
    trialEndsAt: null,
  });
}

function authedRequest(
  url: string,
  method: 'GET' | 'POST',
  token: string,
  body?: unknown
): NextRequest {
  const init: ConstructorParameters<typeof NextRequest>[1] = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined && method === 'POST') {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

function unauthedRequest(
  url: string,
  method: 'GET' | 'POST',
  body?: unknown
): NextRequest {
  const init: ConstructorParameters<typeof NextRequest>[1] = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined && method === 'POST') {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

// ── Phase 2: Real consent API tests ────────────────────────────────

describe('Phase 2 — Consent API (real handler invocation)', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const dbUser = await createTestUser();
    await createTestSettings(dbUser.id);
    user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      plan: dbUser.plan,
      orgId: dbUser.orgId,
    };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.gdprRequest.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.dataExport.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('rejects unauthenticated GET with 401', async () => {
    const req = unauthedRequest('http://localhost:3000/api/gdpr/consent', 'GET');
    const res = await consentGET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it('rejects unauthenticated POST with 401', async () => {
    const req = unauthedRequest('http://localhost:3000/api/gdpr/consent', 'POST', {
      purpose: 'ai_processing',
      action: 'grant',
    });
    const res = await consentPOST(req);
    expect(res.status).toBe(401);
  });

  it('authenticated GET returns correct contract (consents array)', async () => {
    const req = authedRequest('http://localhost:3000/api/gdpr/consent', 'GET', token);
    const res = await consentGET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.consents).toBeDefined();
    expect(Array.isArray(data.consents)).toBe(true);
    expect(data.consents.length).toBe(5);
    expect(data.history).toBeDefined();
    expect(Array.isArray(data.history)).toBe(true);
    expect(data.noticeVersion).toBeTruthy();
    expect(data.policyEffectiveDate).toBeTruthy();
  });

  it('granting optional consent persists the correct state', async () => {
    const req = authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'ai_processing',
      action: 'grant',
      source: 'dashboard',
    });
    const res = await consentPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.consent).toBeDefined();
    expect(data.consent.purpose).toBe('ai_processing');
    expect(data.consent.status).toBe('granted');
    expect(data.consent.grantedAt).toBeTruthy();
  });

  it('withdrawing optional consent persists the withdrawal and timestamp', async () => {
    // First grant
    await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'ai_processing',
      action: 'grant',
    }));
    // Then withdraw
    const res = await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'ai_processing',
      action: 'withdraw',
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.consent.status).toBe('withdrawn');
    expect(data.consent.withdrawnAt).toBeTruthy();
  });

  it('consent history is preserved across multiple API requests', async () => {
    // Grant
    await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'ai_processing', action: 'grant',
    }));
    // Withdraw
    await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'ai_processing', action: 'withdraw',
    }));
    // Grant again
    await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'ai_processing', action: 'grant',
    }));
    // Now GET and check history
    const res = await consentGET(authedRequest('http://localhost:3000/api/gdpr/consent', 'GET', token));
    const data = await res.json();
    expect(data.history.length).toBeGreaterThanOrEqual(3);
    // History should show grant → withdraw → grant
    const aiHistory = data.history.filter((h: { purpose: string }) => h.purpose === 'ai_processing');
    expect(aiHistory.length).toBe(3);
    expect(aiHistory[0].action).toBe('grant');
    expect(aiHistory[1].action).toBe('withdraw');
    expect(aiHistory[2].action).toBe('grant');
  });

  it('essential-purpose withdrawal returns HTTP 400 and does not change persisted consent', async () => {
    const res = await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'essential_service',
      action: 'withdraw',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Cannot withdraw');

    // Verify consent is still granted
    const getRes = await consentGET(authedRequest('http://localhost:3000/api/gdpr/consent', 'GET', token));
    const getData = await getRes.json();
    const essential = getData.consents.find((c: { purpose: string }) => c.purpose === 'essential_service');
    expect(essential.status).toBe('granted');
  });

  it('invalid purpose returns HTTP 400', async () => {
    const res = await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'invalid_purpose',
      action: 'grant',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid purpose');
  });

  it('invalid action returns HTTP 400', async () => {
    const res = await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'ai_processing',
      action: 'invalid_action',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid action');
  });

  it('one user cannot read another user\'s consent', async () => {
    // Create second user
    const user2 = await createTestUser('other-user@example.com');
    await createTestSettings(user2.id);
    const token2 = mintToken({
      id: user2.id, email: user2.email, role: user2.role, plan: user2.plan, orgId: user2.orgId,
    });

    // User 1 grants ai_processing
    await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'ai_processing', action: 'grant',
    }));

    // User 2 GET should NOT see user 1's consent
    const res2 = await consentGET(authedRequest('http://localhost:3000/api/gdpr/consent', 'GET', token2));
    const data2 = await res2.json();
    const aiConsent2 = data2.consents.find((c: { purpose: string }) => c.purpose === 'ai_processing');
    // User 2's ai_processing should still be declined (default), not granted
    expect(aiConsent2.status).toBe('declined');

    // Cleanup
    await db.userSettings.deleteMany({ where: { userId: user2.id } }).catch(() => {});
    await db.user.delete({ where: { id: user2.id } }).catch(() => {});
  });

  it('repeated grant requests do not silently overwrite history', async () => {
    // Grant twice
    await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'ai_processing', action: 'grant',
    }));
    await consentPOST(authedRequest('http://localhost:3000/api/gdpr/consent', 'POST', token, {
      purpose: 'ai_processing', action: 'grant',
    }));

    // History should have 2 entries (both recorded)
    const res = await consentGET(authedRequest('http://localhost:3000/api/gdpr/consent', 'GET', token));
    const data = await res.json();
    const aiHistory = data.history.filter((h: { purpose: string }) => h.purpose === 'ai_processing');
    expect(aiHistory.length).toBe(2);
  });
});

// ── Phase 3: Real data export request API tests ────────────────────

describe('Phase 3 — Export Request API (real handler invocation)', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const dbUser = await createTestUser();
    await createTestSettings(dbUser.id);
    // Create some lead data for export verification
    await db.lead.create({
      data: {
        userId: dbUser.id,
        businessName: 'Test Lead Business',
        email: 'lead@test.com',
        phone: '1234567890',
        isActive: true,
        niche: 'technology',
        city: 'Mumbai',
        country: 'India',
      },
    });
    user = {
      id: dbUser.id, email: dbUser.email, role: dbUser.role, plan: dbUser.plan, orgId: dbUser.orgId,
    };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.lead.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.gdprRequest.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.dataExport.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('rejects unauthenticated request with 401', async () => {
    const req = unauthedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', {
      requestType: 'access',
    });
    // requireAuth throws AuthError, which the route catches and returns as 401
    const res = await exportRequestPOST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it('invalid requestType returns HTTP 400', async () => {
    const req = authedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', token, {
      requestType: 'invalid_type',
    });
    const res = await exportRequestPOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid requestType');
  });

  it('access request creates expected records and returns completed export', async () => {
    const req = authedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', token, {
      requestType: 'access',
    });
    const res = await exportRequestPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.requestType).toBe('access');
    expect(data.requestId).toBeTruthy();
    expect(data.status).toBe('completed');
    expect(data.downloadUrl).toContain('export-download');
    expect(data.recordCount).toBeGreaterThan(0);
    expect(data.expiresAt).toBeTruthy();
  });

  it('portability request creates expected records', async () => {
    const req = authedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', token, {
      requestType: 'portability',
    });
    const res = await exportRequestPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.requestType).toBe('portability');
    expect(data.status).toBe('completed');
  });

  it('pending-request limit blocks second API request of same type', async () => {
    // First request succeeds
    await exportRequestPOST(authedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', token, {
      requestType: 'access',
    }));
    // Second request of same type should be blocked
    // But since the first request completes immediately (synchronous export),
    // there won't be a pending request. Let's create a pending one manually.
    await db.gdprRequest.create({
      data: { userId: user.id, requestType: 'access', status: 'processing' },
    });
    const res = await exportRequestPOST(authedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', token, {
      requestType: 'access',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('pending');
  });

  it('rectification returns guidance and creates tracking record', async () => {
    const req = authedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', token, {
      requestType: 'rectification',
    });
    const res = await exportRequestPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.requestType).toBe('rectification');
    expect(data.status).toBe('completed');
    expect(data.redirectUrl).toBe('/settings');
    expect(data.requestId).toBeTruthy();

    // Verify GdprRequest record was created
    const gdprReq = await db.gdprRequest.findUnique({ where: { id: data.requestId } });
    expect(gdprReq).toBeTruthy();
    expect(gdprReq!.requestType).toBe('rectification');
    expect(gdprReq!.status).toBe('completed');
  });

  it('deletion returns guidance and creates tracking record', async () => {
    const req = authedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', token, {
      requestType: 'deletion',
    });
    const res = await exportRequestPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.requestType).toBe('deletion');
    expect(data.status).toBe('pending');
    expect(data.redirectUrl).toBe('/settings');
  });

  it('export data contains real seeded test-user data', async () => {
    const req = authedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', token, {
      requestType: 'access',
    });
    const res = await exportRequestPOST(req);
    const data = await res.json();
    expect(data.recordCount).toBeGreaterThan(0);

    // Verify the DataExport record has real content
    const exportRecord = await db.dataExport.findFirst({
      where: { userId: user.id, status: 'completed' },
    });
    expect(exportRecord).toBeTruthy();
    expect(exportRecord!.fileUrl).toContain('base64');
    expect(exportRecord!.fileSize).toBeGreaterThan(0);

    // Decode and verify the export contains the seeded lead
    const base64Data = exportRecord!.fileUrl.split(',')[1];
    const decoded = JSON.parse(Buffer.from(base64Data, 'base64').toString());
    expect(decoded.user).toBeTruthy();
    expect(decoded.user.email).toBe(user.email);
    expect(decoded.leads).toBeDefined();
    expect(decoded.leads.length).toBeGreaterThan(0);
    expect(decoded.leads[0].businessName).toBe('Test Lead Business');
  });

  it('export excludes password hashes and authentication secrets', async () => {
    const req = authedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', token, {
      requestType: 'access',
    });
    const res = await exportRequestPOST(req);
    const data = await res.json();

    const exportRecord = await db.dataExport.findFirst({
      where: { userId: user.id, status: 'completed' },
    });
    const base64Data = exportRecord!.fileUrl.split(',')[1];
    const decoded = JSON.parse(Buffer.from(base64Data, 'base64').toString());

    // User object should NOT contain passwordHash
    expect(decoded.user.passwordHash).toBeUndefined();
    // The export JSON should not contain 'passwordHash' anywhere in the user object
    const userJson = JSON.stringify(decoded.user);
    expect(userJson).not.toContain('passwordHash');
  });

  it('audit records are created with correct user and action', async () => {
    await exportRequestPOST(authedRequest('http://localhost:3000/api/settings/account/export-request', 'POST', token, {
      requestType: 'access',
    }));

    const auditLogs = await db.auditLog.findMany({
      where: { userId: user.id, resource: 'gdpr' },
    });
    expect(auditLogs.length).toBeGreaterThan(0);
    expect(auditLogs[0].action).toContain('gdpr_');
  });
});
