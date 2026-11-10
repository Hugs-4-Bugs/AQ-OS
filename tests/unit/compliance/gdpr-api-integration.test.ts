// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GDPR API Integration Tests (Phase 2-5)
//
// Tests the ACTUAL route handlers for:
//   - GET /api/settings/account/export-download (Phase 2 — new route)
//   - GET /api/gdpr/export (Phase 3)
//   - POST /api/gdpr/delete (Phase 4 — two-step deletion)
//
// Uses real JWT tokens, real Prisma client, isolated test DB.
// NO mocking of @/lib/db or @/lib/auth.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { generateAccessToken } from '@/lib/auth';

// Import ACTUAL route handlers
import { GET as exportDownloadGET } from '@/app/api/settings/account/export-download/route';
import { GET as gdprExportGET } from '@/app/api/gdpr/export/route';
import { POST as gdprDeletePOST } from '@/app/api/gdpr/delete/route';
import { POST as exportRequestPOST } from '@/app/api/settings/account/export-request/route';

// ── Test helpers ────────────────────────────────────────────────────

async function createTestUser(email?: string) {
  return db.user.create({
    data: {
      email: email || `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name: 'Test User',
      passwordHash: '$2a$12$testhash',
      plan: 'free',
      isActive: true,
      emailVerified: true,
    },
  });
}

async function createTestSettings(userId: string) {
  return db.userSettings.create({ data: { userId } });
}

function mintToken(user: { id: string; email: string; role: string; plan: string; orgId: string | null }) {
  return generateAccessToken({
    id: user.id, email: user.email, role: user.role, plan: user.plan,
    orgId: user.orgId, isTrial: false, trialEndsAt: null,
  });
}

function authedGet(url: string, token: string): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function authedPost(url: string, token: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function unauthedGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function unauthedPost(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2 — Export Download Route Tests
// ═══════════════════════════════════════════════════════════════════

describe('Phase 2 — Export Download (real handler)', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;
  let downloadUrl: string;
  let downloadToken: string;
  let requestId: string;

  beforeEach(async () => {
    const dbUser = await createTestUser();
    await createTestSettings(dbUser.id);
    await db.lead.create({
      data: {
        userId: dbUser.id,
        businessName: 'Test Lead',
        email: 'lead@test.com',
        isActive: true,
      },
    });
    user = { id: dbUser.id, email: dbUser.email, role: dbUser.role, plan: dbUser.plan, orgId: dbUser.orgId };
    token = mintToken(user);

    // Generate an export via the real export-request API
    const res = await exportRequestPOST(authedPost(
      'http://localhost:3000/api/settings/account/export-request', token,
      { requestType: 'access' }
    ));
    const data = await res.json();
    downloadUrl = data.downloadUrl;
    downloadToken = new URL(downloadUrl, 'http://localhost').searchParams.get('token')!;
    requestId = new URL(downloadUrl, 'http://localhost').searchParams.get('requestId')!;
  });

  afterEach(async () => {
    await db.lead.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.dataExport.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.gdprRequest.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('rejects unauthenticated request', async () => {
    const req = unauthedGet(`http://localhost:3000/api/settings/account/export-download?token=${downloadToken}&requestId=${requestId}`);
    // requireAuth throws AuthError, caught by the handler → returns 401
    const res = await exportDownloadGET(req);
    expect(res.status).toBe(401);
  });

  it('returns the export file for valid token + owner', async () => {
    const req = authedGet(`http://localhost:3000/api/settings/account/export-download?token=${downloadToken}&requestId=${requestId}`, token);
    const res = await exportDownloadGET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');

    // Verify the file content is valid JSON with user data
    const text = await res.text();
    const json = JSON.parse(text);
    expect(json.user).toBeTruthy();
    expect(json.user.email).toBe(user.email);
  });

  it('rejects invalid token', async () => {
    const req = authedGet(`http://localhost:3000/api/settings/account/export-download?token=INVALID&requestId=${requestId}`, token);
    const res = await exportDownloadGET(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('token');
  });

  it('rejects missing parameters', async () => {
    const req = authedGet('http://localhost:3000/api/settings/account/export-download', token);
    const res = await exportDownloadGET(req);
    expect(res.status).toBe(400);
  });

  it('rejects non-existent requestId', async () => {
    const req = authedGet(`http://localhost:3000/api/settings/account/export-download?token=${downloadToken}&requestId=nonexistent-id`, token);
    const res = await exportDownloadGET(req);
    expect(res.status).toBe(404);
  });

  it('prevents cross-user download (returns 404, not 403)', async () => {
    // Create second user
    const user2 = await createTestUser('other@example.com');
    await createTestSettings(user2.id);
    const token2 = mintToken({
      id: user2.id, email: user2.email, role: user2.role, plan: user2.plan, orgId: user2.orgId,
    });

    // User 2 tries to download user 1's export
    const req = authedGet(`http://localhost:3000/api/settings/account/export-download?token=${downloadToken}&requestId=${requestId}`, token2);
    const res = await exportDownloadGET(req);
    expect(res.status).toBe(404); // Don't reveal existence to non-owners

    // Cleanup
    await db.userSettings.deleteMany({ where: { userId: user2.id } }).catch(() => {});
    await db.user.delete({ where: { id: user2.id } }).catch(() => {});
  });

  it('rejects expired download link', async () => {
    // Expire the request manually
    await db.gdprRequest.update({
      where: { id: requestId },
      data: { expiresAt: new Date(Date.now() - 1000) }, // expired 1 second ago
    });

    const req = authedGet(`http://localhost:3000/api/settings/account/export-download?token=${downloadToken}&requestId=${requestId}`, token);
    const res = await exportDownloadGET(req);
    expect(res.status).toBe(410);
    const data = await res.json();
    expect(data.error).toContain('expired');
  });

  it('rejects requestId substitution (token from different request)', async () => {
    // Create a second export request for the same user
    const res2 = await exportRequestPOST(authedPost(
      'http://localhost:3000/api/settings/account/export-request', token,
      { requestType: 'portability' }
    ));
    const data2 = await res2.json();
    const requestId2 = new URL(data2.downloadUrl, 'http://localhost').searchParams.get('requestId')!;

    // Try to use token from request 1 with requestId from request 2
    const req = authedGet(`http://localhost:3000/api/settings/account/export-download?token=${downloadToken}&requestId=${requestId2}`, token);
    const res = await exportDownloadGET(req);
    expect(res.status).toBe(403); // Token mismatch
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — GDPR Export Endpoint Tests
// ═══════════════════════════════════════════════════════════════════

describe('Phase 3 — GET /api/gdpr/export (real handler)', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const dbUser = await createTestUser();
    await createTestSettings(dbUser.id);
    await db.lead.create({
      data: {
        userId: dbUser.id, businessName: 'Export Test Lead', email: 'export-lead@test.com',
        isActive: true, niche: 'tech', city: 'Delhi', country: 'India',
      },
    });
    user = { id: dbUser.id, email: dbUser.email, role: dbUser.role, plan: dbUser.plan, orgId: dbUser.orgId };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.lead.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.dataExport.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.gdprRequest.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('rejects unauthenticated request', async () => {
    const req = unauthedGet('http://localhost:3000/api/gdpr/export');
    const res = await gdprExportGET(req);
    expect(res.status).toBe(401);
  });

  it('authenticated request succeeds and returns user data', async () => {
    const req = authedGet('http://localhost:3000/api/gdpr/export', token);
    const res = await gdprExportGET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeTruthy();
    // The export should contain the user's email
    const dataStr = JSON.stringify(data);
    expect(dataStr).toContain(user.email);
  });

  it('export includes seeded lead data', async () => {
    const req = authedGet('http://localhost:3000/api/gdpr/export', token);
    const res = await gdprExportGET(req);
    const data = await res.json();
    const dataStr = JSON.stringify(data);
    expect(dataStr).toContain('Export Test Lead');
  });

  it('export excludes password hashes', async () => {
    const req = authedGet('http://localhost:3000/api/gdpr/export', token);
    const res = await gdprExportGET(req);
    const data = await res.json();
    const dataStr = JSON.stringify(data);
    expect(dataStr).not.toContain('passwordHash');
    expect(dataStr).not.toContain('$2a$12$');
  });

  it('cross-user data is not included', async () => {
    // Create a second user with different data
    const user2 = await createTestUser('secret-other@example.com');
    await createTestSettings(user2.id);
    await db.lead.create({
      data: { userId: user2.id, businessName: 'SECRET_OTHER_USER_LEAD', email: 'secret@test.com', isActive: true },
    });

    // User 1 exports — should NOT contain user 2's data
    const req = authedGet('http://localhost:3000/api/gdpr/export', token);
    const res = await gdprExportGET(req);
    const data = await res.json();
    const dataStr = JSON.stringify(data);
    expect(dataStr).not.toContain('SECRET_OTHER_USER_LEAD');
    expect(dataStr).not.toContain('secret-other@example.com');

    // Cleanup
    await db.lead.deleteMany({ where: { userId: user2.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user2.id } }).catch(() => {});
    await db.user.delete({ where: { id: user2.id } }).catch(() => {});
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 4 — Deletion Workflow Tests
// ═══════════════════════════════════════════════════════════════════

describe('Phase 4 — POST /api/gdpr/delete (real handler)', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const dbUser = await createTestUser();
    await createTestSettings(dbUser.id);
    user = { id: dbUser.id, email: dbUser.email, role: dbUser.role, plan: dbUser.plan, orgId: dbUser.orgId };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.gdprRequest.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.update({ where: { id: user.id }, data: { isActive: true, deletedAt: null } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('rejects unauthenticated request', async () => {
    const req = unauthedPost('http://localhost:3000/api/gdpr/delete', { step: 'request' });
    const res = await gdprDeletePOST(req);
    expect(res.status).toBe(401);
  });

  it('step=request creates a deletion request with confirmation code', async () => {
    const req = authedPost('http://localhost:3000/api/gdpr/delete', token, { step: 'request' });
    const res = await gdprDeletePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    // The route returns confirmationCode for new requests, or a 'already pending' message
    // if a prior request exists. Either way, it should return 200.
    expect(data.step).toBe('confirm');
    // Verify GdprRequest was created
    const gdprReq = await db.gdprRequest.findFirst({
      where: { userId: user.id, requestType: 'deletion' },
    });
    expect(gdprReq).toBeTruthy();
    expect(gdprReq!.status).toBe('pending');
  });

  it('step=confirm with valid code initiates deletion', async () => {
    // First request
    const reqRes = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, { step: 'request' }));
    const reqData = await reqRes.json();
    const code = reqData.confirmationCode;

    // Confirm
    const confirmReq = authedPost('http://localhost:3000/api/gdpr/delete', token, {
      step: 'confirm',
      confirmationCode: code,
    });
    const confirmRes = await gdprDeletePOST(confirmReq);
    expect(confirmRes.status).toBe(200);
  });

  it('step=confirm with invalid code returns 400', async () => {
    // First request
    await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, { step: 'request' }));

    // Confirm with wrong code
    const confirmRes = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, {
      step: 'confirm',
      confirmationCode: 'WRONG_CODE_123',
    }));
    expect(confirmRes.status).toBe(400);
    const data = await confirmRes.json();
    expect(data.error).toContain('Invalid confirmation code');
  });

  it('step=confirm without existing request returns 404', async () => {
    const res = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, {
      step: 'confirm',
      confirmationCode: 'ANYTHING',
    }));
    // Route returns 404 when no pending deletion request exists
    expect(res.status).toBe(404);
  });

  it('confirmation code is cryptographically secure (not Math.random)', async () => {
    const req = authedPost('http://localhost:3000/api/gdpr/delete', token, { step: 'request' });
    const res = await gdprDeletePOST(req);
    const data = await res.json();
    const code = data.confirmationCode;
    // crypto.randomBytes(8).toString('hex').toUpperCase() produces
    // a 16-character hex string. Math.random().toString(36) produces
    // an 8-character base-36 string. Verify length is 16 (hex).
    expect(code.length).toBe(16);
    expect(code).toMatch(/^[0-9A-F]{16}$/);
  });

  it('cross-user confirmation is rejected', async () => {
    // User 1 requests deletion
    const reqRes = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, { step: 'request' }));
    const reqData = await reqRes.json();
    const code = reqData.confirmationCode;

    // User 2 tries to confirm user 1's deletion
    const user2 = await createTestUser('attacker@example.com');
    await createTestSettings(user2.id);
    const token2 = mintToken({
      id: user2.id, email: user2.email, role: user2.role, plan: user2.plan, orgId: user2.orgId,
    });

    const res = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token2, {
      step: 'confirm',
      confirmationCode: code,
    }));
    // Should fail — user 2 has no deletion request → 404
    expect(res.status).toBe(404);

    // Cleanup
    await db.userSettings.deleteMany({ where: { userId: user2.id } }).catch(() => {});
    await db.user.delete({ where: { id: user2.id } }).catch(() => {});
  });
});
