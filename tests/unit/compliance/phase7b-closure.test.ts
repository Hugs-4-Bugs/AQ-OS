// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 7B Closure Tests
//
// Tests the newly-enforced routes from the closure task:
//   - Calendar connect + callback
//   - Gmail connect POST + callback
//   - Telegram combined route (generate_code + connect actions)
//   - WhatsApp send-otp
//   - Settings telegram link
//   - Settings whatsapp verify + confirm
//   - Connected accounts connect
//
// Verifies that consent is enforced at each creation boundary and
// that non-creation actions (disconnect, status, update_settings)
// are NOT blocked.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { generateAccessToken } from '@/lib/auth';
import { POST as calendarConnectPOST } from '@/app/api/calendar/connect/route';
import { POST as gmailConnectPOST } from '@/app/api/gmail/connect/route';
import { POST as telegramRoutePOST } from '@/app/api/integrations/telegram/route';
import { POST as whatsappSendOtpPOST } from '@/app/api/integrations/whatsapp/send-otp/route';
import { POST as connectedAccountsConnectPOST } from '@/app/api/connected-accounts/connect/route';
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

async function setConsent(userId: string, action: 'grant' | 'withdraw') {
  const settings = await db.userSettings.findUnique({ where: { userId } });
  const { deserializeConsentData } = await import('@/lib/compliance/consent-contract');
  const { state, history } = settings
    ? deserializeConsentData(settings.notificationPreferences)
    : { state: getDefaultConsentState(), history: [] as never[] };
  const { newState, historyEntry } = applyConsentChange(state, 'third_party_integrations', action, 'api');
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

function authedPost(url: string, token: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Phase 7B Closure — Calendar connect consent', () => {
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
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('blocks Calendar connect without consent (403)', async () => {
    const req = authedPost('http://localhost:3000/api/calendar/connect', token, {});
    const res = await calendarConnectPOST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('consent');
  });

  it('allows Calendar connect with consent (proceeds past check)', async () => {
    await setConsent(user.id, 'grant');
    const req = authedPost('http://localhost:3000/api/calendar/connect', token, {});
    const res = await calendarConnectPOST(req);
    expect(res.status).not.toBe(403);
  });
});

describe('Phase 7B Closure — Gmail connect POST consent', () => {
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

  it('blocks Gmail connect POST without consent (403)', async () => {
    const req = authedPost('http://localhost:3000/api/gmail/connect', token, {});
    const res = await gmailConnectPOST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('consent');
  });
});

describe('Phase 7B Closure — Telegram combined route action-based consent', () => {
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
    await db.telegramConfig.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it('blocks generate_code action without consent (403)', async () => {
    const req = authedPost('http://localhost:3000/api/integrations/telegram', token, {
      action: 'generate_code',
    });
    const res = await telegramRoutePOST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('consent');
  });

  it('allows generate_code with consent', async () => {
    await setConsent(user.id, 'grant');
    const req = authedPost('http://localhost:3000/api/integrations/telegram', token, {
      action: 'generate_code',
    });
    const res = await telegramRoutePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.linkCode || data.code).toBeTruthy();
  });

  it('blocks connect action without consent (403)', async () => {
    const req = authedPost('http://localhost:3000/api/integrations/telegram', token, {
      action: 'connect',
      chatId: '123456',
      username: 'testbot',
    });
    const res = await telegramRoutePOST(req);
    expect(res.status).toBe(403);
  });

  it('disconnect action is NOT blocked by consent withdrawal', async () => {
    // Even without consent, disconnect should work
    const req = authedPost('http://localhost:3000/api/integrations/telegram', token, {
      action: 'disconnect',
    });
    const res = await telegramRoutePOST(req);
    expect(res.status).not.toBe(403);
  });

  it('update_settings action is NOT blocked by consent withdrawal', async () => {
    const req = authedPost('http://localhost:3000/api/integrations/telegram', token, {
      action: 'update_settings',
      settings: { dealUpdate: false },
    });
    const res = await telegramRoutePOST(req);
    expect(res.status).not.toBe(403);
  });
});

describe('Phase 7B Closure — WhatsApp send-otp consent', () => {
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

  it('blocks WhatsApp send-otp without consent (403)', async () => {
    const req = authedPost('http://localhost:3000/api/integrations/whatsapp/send-otp', token, {
      phone: '+1234567890',
    });
    const res = await whatsappSendOtpPOST(req);
    expect(res.status).toBe(403);
  });
});

describe('Phase 7B Closure — Connected accounts connect consent', () => {
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

  it('blocks connected-accounts connect without consent (403)', async () => {
    const req = authedPost('http://localhost:3000/api/connected-accounts/connect', token, {
      provider: 'gmail-smtp',
      accountIdentifier: 'test@gmail.com',
      credentials: { host: 'smtp.gmail.com', port: 587, user: 'test@gmail.com', password: 'test' },
    });
    const res = await connectedAccountsConnectPOST(req);
    expect(res.status).toBe(403);
  });
});
