// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 6 Security Hardening Tests
//
// Tests:
//   Phase 2 — Export-to-request linkage (exact DataExport association)
//   Phase 3 — Token hashing (plaintext NEVER stored in DB)
//   Phase 4 — Deletion confirmation hashing (plaintext NEVER stored)
//
// Uses real route handlers + real JWT + real isolated test DB.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { generateAccessToken } from '@/lib/auth';
import { POST as exportRequestPOST } from '@/app/api/settings/account/export-request/route';
import { GET as exportDownloadGET } from '@/app/api/settings/account/export-download/route';
import { POST as gdprDeletePOST } from '@/app/api/gdpr/delete/route';

async function createTestUser(email?: string) {
  return db.user.create({
    data: {
      email: email || `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name: 'Test User', passwordHash: '$2a$12$testhash', plan: 'free',
      isActive: true, emailVerified: true,
    },
  });
}

function mintToken(u: { id: string; email: string; role: string; plan: string; orgId: string | null }) {
  return generateAccessToken({ id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId, isTrial: false, trialEndsAt: null });
}

function authedGet(url: string, token: string): NextRequest {
  return new NextRequest(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
}

function authedPost(url: string, token: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Phase 2 + 3: Export linkage + token hashing ────────────────────

describe('Phase 2+3 — Export linkage + token hashing', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    await db.lead.create({ data: { userId: u.id, businessName: 'Test Lead', email: 'l@t.com', isActive: true } });
    user = { id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId };
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

  it('generates two exports and each downloads its own correct export', async () => {
    // Generate export 1 (access)
    const res1 = await exportRequestPOST(authedPost('http://localhost:3000/api/settings/account/export-request', token, { requestType: 'access' }));
    const data1 = await res1.json();
    const token1 = new URL(data1.downloadUrl, 'http://localhost').searchParams.get('token')!;
    const reqId1 = new URL(data1.downloadUrl, 'http://localhost').searchParams.get('requestId')!;

    // Generate export 2 (portability)
    const res2 = await exportRequestPOST(authedPost('http://localhost:3000/api/settings/account/export-request', token, { requestType: 'portability' }));
    const data2 = await res2.json();
    const token2 = new URL(data2.downloadUrl, 'http://localhost').searchParams.get('token')!;
    const reqId2 = new URL(data2.downloadUrl, 'http://localhost').searchParams.get('requestId')!;

    // Download export 1
    const dl1 = await exportDownloadGET(authedGet(`http://localhost:3000/api/settings/account/export-download?token=${token1}&requestId=${reqId1}`, token));
    expect(dl1.status).toBe(200);
    const json1 = JSON.parse(await dl1.text());
    expect(json1._meta.requestType).toBe('access');

    // Download export 2
    const dl2 = await exportDownloadGET(authedGet(`http://localhost:3000/api/settings/account/export-download?token=${token2}&requestId=${reqId2}`, token));
    expect(dl2.status).toBe(200);
    const json2 = JSON.parse(await dl2.text());
    expect(json2._meta.requestType).toBe('portability');
  });

  it('request A cannot retrieve export B (token mismatch)', async () => {
    const res1 = await exportRequestPOST(authedPost('http://localhost:3000/api/settings/account/export-request', token, { requestType: 'access' }));
    const data1 = await res1.json();
    const token1 = new URL(data1.downloadUrl, 'http://localhost').searchParams.get('token')!;
    const reqId1 = new URL(data1.downloadUrl, 'http://localhost').searchParams.get('requestId')!;

    const res2 = await exportRequestPOST(authedPost('http://localhost:3000/api/settings/account/export-request', token, { requestType: 'portability' }));
    const data2 = await res2.json();
    const reqId2 = new URL(data2.downloadUrl, 'http://localhost').searchParams.get('requestId')!;

    // Use token1 with reqId2 → should fail
    const dl = await exportDownloadGET(authedGet(`http://localhost:3000/api/settings/account/export-download?token=${token1}&requestId=${reqId2}`, token));
    expect(dl.status).toBe(403);
  });

  it('plaintext token is NOT stored in database', async () => {
    const res = await exportRequestPOST(authedPost('http://localhost:3000/api/settings/account/export-request', token, { requestType: 'access' }));
    const data = await res.json();
    const plaintextToken = new URL(data.downloadUrl, 'http://localhost').searchParams.get('token')!;
    const reqId = new URL(data.downloadUrl, 'http://localhost').searchParams.get('requestId')!;

    // Check the GdprRequest record — plaintext token should NOT appear
    const gdprReq = await db.gdprRequest.findUnique({ where: { id: reqId } });
    expect(gdprReq).toBeTruthy();
    expect(gdprReq!.downloadUrl).not.toContain(plaintextToken);
    expect(gdprReq!.notes).not.toContain(plaintextToken);

    // The notes should contain tokenHash, not the plaintext
    const notes = JSON.parse(gdprReq!.notes || '{}');
    expect(notes.tokenHash).toBeTruthy();
    expect(notes.tokenHash).not.toBe(plaintextToken);
    expect(notes.exportId).toBeTruthy();
  });

  it('token does not appear in audit logs', async () => {
    const res = await exportRequestPOST(authedPost('http://localhost:3000/api/settings/account/export-request', token, { requestType: 'access' }));
    const data = await res.json();
    const plaintextToken = new URL(data.downloadUrl, 'http://localhost').searchParams.get('token')!;

    const logs = await db.auditLog.findMany({ where: { userId: user.id } });
    for (const log of logs) {
      expect(log.details).not.toContain(plaintextToken);
    }
  });

  it('cross-user access is rejected (404)', async () => {
    const res = await exportRequestPOST(authedPost('http://localhost:3000/api/settings/account/export-request', token, { requestType: 'access' }));
    const data = await res.json();
    const dlToken = new URL(data.downloadUrl, 'http://localhost').searchParams.get('token')!;
    const reqId = new URL(data.downloadUrl, 'http://localhost').searchParams.get('requestId')!;

    // Create user 2
    const user2 = await createTestUser('other@example.com');
    await db.userSettings.create({ data: { userId: user2.id } });
    const token2 = mintToken({ id: user2.id, email: user2.email, role: user2.role, plan: user2.plan, orgId: user2.orgId });

    const dl = await exportDownloadGET(authedGet(`http://localhost:3000/api/settings/account/export-download?token=${dlToken}&requestId=${reqId}`, token2));
    expect(dl.status).toBe(404);

    await db.userSettings.deleteMany({ where: { userId: user2.id } }).catch(() => {});
    await db.user.delete({ where: { id: user2.id } }).catch(() => {});
  });

  it('expired token is rejected (410)', async () => {
    const res = await exportRequestPOST(authedPost('http://localhost:3000/api/settings/account/export-request', token, { requestType: 'access' }));
    const data = await res.json();
    const dlToken = new URL(data.downloadUrl, 'http://localhost').searchParams.get('token')!;
    const reqId = new URL(data.downloadUrl, 'http://localhost').searchParams.get('requestId')!;

    // Expire the request
    await db.gdprRequest.update({ where: { id: reqId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const dl = await exportDownloadGET(authedGet(`http://localhost:3000/api/settings/account/export-download?token=${dlToken}&requestId=${reqId}`, token));
    expect(dl.status).toBe(410);
  });
});

// ── Phase 4: Deletion confirmation hashing ──────────────────────────

describe('Phase 4 — Deletion confirmation hashing', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.gdprRequest.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.update({ where: { id: user.id }, data: { isActive: true, deletedAt: null } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('plaintext confirmation code is NOT stored in database', async () => {
    const res = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, { step: 'request' }));
    const data = await res.json();
    const code = data.confirmationCode;

    // Check the GdprRequest — plaintext code should NOT appear
    const gdprReq = await db.gdprRequest.findFirst({ where: { userId: user.id, requestType: 'deletion' } });
    expect(gdprReq).toBeTruthy();
    expect(gdprReq!.notes).not.toContain(code);

    // Notes should contain hash, not plaintext
    const notes = JSON.parse(gdprReq!.notes || '{}');
    expect(notes.confirmationCodeHash).toBeTruthy();
    expect(notes.confirmationCodeHash).not.toBe(code);
    expect(notes.confirmationCode).toBeUndefined(); // plaintext NOT stored
  });

  it('valid confirmation code works via hash comparison', async () => {
    // Request
    const reqRes = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, { step: 'request' }));
    const reqData = await reqRes.json();
    const code = reqData.confirmationCode;

    // Confirm
    const confirmRes = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, {
      step: 'confirm', confirmationCode: code,
    }));
    expect(confirmRes.status).toBe(200);
  });

  it('invalid confirmation code is rejected', async () => {
    await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, { step: 'request' }));

    const res = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, {
      step: 'confirm', confirmationCode: 'INVALID_CODE_123',
    }));
    expect(res.status).toBe(400);
  });

  it('confirmation code does not appear in audit logs', async () => {
    const reqRes = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, { step: 'request' }));
    const code = await reqRes.json().then(d => d.confirmationCode);

    const logs = await db.auditLog.findMany({ where: { userId: user.id } });
    for (const log of logs) {
      expect(log.details).not.toContain(code);
    }
  });

  it('cross-user confirmation is rejected', async () => {
    // User 1 requests deletion
    await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token, { step: 'request' }));

    // User 2 tries to confirm
    const user2 = await createTestUser('attacker@example.com');
    await db.userSettings.create({ data: { userId: user2.id } });
    const token2 = mintToken({ id: user2.id, email: user2.email, role: user2.role, plan: user2.plan, orgId: user2.orgId });

    const res = await gdprDeletePOST(authedPost('http://localhost:3000/api/gdpr/delete', token2, {
      step: 'confirm', confirmationCode: 'ANYTHING',
    }));
    expect(res.status).toBe(404);

    await db.userSettings.deleteMany({ where: { userId: user2.id } }).catch(() => {});
    await db.user.delete({ where: { id: user2.id } }).catch(() => {});
  });
});
