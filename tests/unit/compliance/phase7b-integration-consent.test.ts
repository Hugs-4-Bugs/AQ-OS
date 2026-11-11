// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 7B: Third-Party Integration Consent Tests
//
// Tests actual route handlers for consent enforcement on:
//   - Google integration connect (initiation)
//   - Google integration callback (completion recheck)
//   - Telegram generate-code (initiation)
//   - Telegram connect (initiation)
//   - WhatsApp Meta connect (initiation)
//   - WhatsApp Twilio connect (initiation)
//
// Uses real JWT, real Prisma client, isolated test DB.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { generateAccessToken } from '@/lib/auth';
import { GET as googleConnectGET } from '@/app/api/integrations/google/connect/route';
import { GET as googleCallbackGET } from '@/app/api/integrations/google/callback/route';
import { POST as telegramGenerateCodePOST } from '@/app/api/integrations/telegram/generate-code/route';
import { POST as telegramConnectPOST } from '@/app/api/telegram/connect/route';
import { POST as whatsappMetaConnectPOST } from '@/app/api/whatsapp/meta/connect/route';
import { POST as whatsappTwilioConnectPOST } from '@/app/api/whatsapp/twilio/connect/route';
import {
  getDefaultConsentState,
  applyConsentChange,
  serializeConsentData,
} from '@/lib/compliance/consent-contract';

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

async function setConsent(userId: string, purpose: 'third_party_integrations', action: 'grant' | 'withdraw') {
  const settings = await db.userSettings.findUnique({ where: { userId } });
  const { deserializeConsentData } = await import('@/lib/compliance/consent-contract');
  const { state, history } = settings
    ? deserializeConsentData(settings.notificationPreferences)
    : { state: getDefaultConsentState(), history: [] as never[] };
  const { newState, historyEntry } = applyConsentChange(state, purpose, action, 'api');
  const newHistory = [...history, historyEntry];
  if (settings) {
    await db.userSettings.update({
      where: { userId },
      data: { notificationPreferences: serializeConsentData(newState, newHistory) },
    });
  } else {
    await db.userSettings.create({
      data: { userId, notificationPreferences: serializeConsentData(newState, newHistory) },
    });
  }
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

// ── Google integration connect ──────────────────────────────────────

describe('Phase 7B — Google integration connect consent', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('blocks Google connect without consent (403)', async () => {
    const req = authedGet('http://localhost:3000/api/integrations/google/connect', token);
    const res = await googleConnectGET(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('consent');
  });

  it('allows Google connect with consent (proceeds past consent check)', async () => {
    await setConsent(user.id, 'third_party_integrations', 'grant');
    const req = authedGet('http://localhost:3000/api/integrations/google/connect', token);
    const res = await googleConnectGET(req);
    // Past consent check → should get 500 (Google not configured) or redirect
    expect(res.status).not.toBe(403);
  });
});

// ── Google callback consent recheck ─────────────────────────────────

describe('Phase 7B — Google callback consent recheck', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };

  beforeEach(async () => {
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId };
  });

  afterEach(async () => {
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('blocks callback when consent was withdrawn', async () => {
    // Don't grant consent
    const state = Buffer.from(JSON.stringify({ userId: user.id, origin: 'http://localhost:3000' })).toString('base64');
    const req = new NextRequest(
      `http://localhost:3000/api/integrations/google/callback?code=fake&state=${state}`,
      { method: 'GET' }
    );
    const res = await googleCallbackGET(req);
    // Should redirect with integration_error (consent withdrawn)
    expect(res.status).toBe(307); // redirect
    const location = res.headers.get('location') || '';
    expect(location).toContain('integration_error');
  });

  it('allows callback when consent is granted (proceeds past consent check)', async () => {
    await setConsent(user.id, 'third_party_integrations', 'grant');
    const state = Buffer.from(JSON.stringify({ userId: user.id, origin: 'http://localhost:3000' })).toString('base64');
    const req = new NextRequest(
      `http://localhost:3000/api/integrations/google/callback?code=fake&state=${state}`,
      { method: 'GET' }
    );
    const res = await googleCallbackGET(req);
    // Past consent check → should fail at token exchange (no real code)
    // but NOT at consent check
    expect(res.status).toBe(307); // redirect (error from token exchange)
    const location = res.headers.get('location') || '';
    // Should NOT contain "consent was withdrawn"
    expect(location).not.toContain('consent+was+withdrawn');
  });
});

// ── Telegram generate-code consent ──────────────────────────────────

describe('Phase 7B — Telegram generate-code consent', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.telegramConfig.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('blocks link code generation without consent (403)', async () => {
    const req = authedPost('http://localhost:3000/api/integrations/telegram/generate-code', token, {});
    const res = await telegramGenerateCodePOST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('consent');
  });

  it('allows link code generation with consent', async () => {
    await setConsent(user.id, 'third_party_integrations', 'grant');
    const req = authedPost('http://localhost:3000/api/integrations/telegram/generate-code', token, {});
    const res = await telegramGenerateCodePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.code).toBeTruthy();
  });
});

// ── Telegram connect consent ────────────────────────────────────────

describe('Phase 7B — Telegram connect consent', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.telegramConfig.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('blocks Telegram connect without consent (403)', async () => {
    const req = authedPost('http://localhost:3000/api/telegram/connect', token, {
      botToken: '123456:ABC-DEF-test',
    });
    const res = await telegramConnectPOST(req);
    expect(res.status).toBe(403);
  });
});

// ── WhatsApp connect consent ────────────────────────────────────────

describe('Phase 7B — WhatsApp connect consent', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    user = { id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.whatsappConfig.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('blocks WhatsApp Meta connect without consent (403)', async () => {
    const req = authedPost('http://localhost:3000/api/whatsapp/meta/connect', token, {
      accessToken: 'test',
      phoneNumberId: 'test',
    });
    const res = await whatsappMetaConnectPOST(req);
    expect(res.status).toBe(403);
  });

  it('blocks WhatsApp Twilio connect without consent (403)', async () => {
    const req = authedPost('http://localhost:3000/api/whatsapp/twilio/connect', token, {
      accountSid: 'test',
      authToken: 'test',
      phoneNumber: '+1234567890',
    });
    const res = await whatsappTwilioConnectPOST(req);
    expect(res.status).toBe(403);
  });
});

// ── Existing connections not blocked ────────────────────────────────

describe('Phase 7B — Existing connections not blocked', () => {
  let user: { id: string; email: string; role: string; plan: string; orgId: string | null };
  let token: string;

  beforeEach(async () => {
    const u = await createTestUser();
    await db.userSettings.create({ data: { userId: u.id } });
    // Create an EXISTING Telegram connection (simulating already-connected state)
    await db.telegramConfig.create({
      data: {
        userId: u.id,
        chatId: '123456',
        botToken: 'existing-token',
        username: 'existing_bot',
        botId: '123',
        isConnected: true,
        isPaused: false,
        mode: 'bot',
        healthStatus: 'healthy',
        lastHealthCheckAt: new Date(),
        reconnectAttempts: 0,
      },
    });
    user = { id: u.id, email: u.email, role: u.role, plan: u.plan, orgId: u.orgId };
    token = mintToken(user);
  });

  afterEach(async () => {
    await db.telegramConfig.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('existing Telegram connection status is readable after consent withdrawal', async () => {
    // Withdraw consent
    await setConsent(user.id, 'third_party_integrations', 'withdraw');

    // The existing connection record should still exist
    const existing = await db.telegramConfig.findUnique({ where: { userId: user.id } });
    expect(existing).toBeTruthy();
    expect(existing!.isConnected).toBe(true);
    // The connection was NOT automatically revoked
  });
});
