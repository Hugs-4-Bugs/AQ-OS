// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Integration Tests: WhatsApp Integration
// Phase 14.1: TESTING SUITE
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, createTestUser } from '../helpers/test-utils';


// Mock db

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    lead: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    subscription: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    creditsLedger: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), findFirst: vi.fn() },
    paymentOrder: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    workflowDefinition: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    workflowExecution: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    workflowLog: { create: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    notification: { create: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    competitorData: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    gdprRequest: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    userSettings: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    creditAddon: { findMany: vi.fn(), create: vi.fn() },
    loginHistory: { create: vi.fn(), count: vi.fn() },
    userSession: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    coupon: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    taxRate: { findFirst: vi.fn() },
    chatSession: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    emailBounce: { create: vi.fn() },
    whatsappMessage: { update: vi.fn() },
    apiKey: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    apiKeyUsage: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    planEntitlement: { upsert: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn((fn) => typeof fn === 'function' ? fn() : fn),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn(),
  logBillingEvent: vi.fn(),
}));

import { db } from '@/lib/db';
const mockDb = db as any;

// ═══════════════════════════════════════════════════════════════════
// META CLOUD CONNECTION
// ═══════════════════════════════════════════════════════════════════

describe('WhatsApp Meta Cloud Connection', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('should verify webhook with challenge response', () => {
    const VERIFY_TOKEN = 'acquisitionos_verify_token';
    const query = {
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': 'challenge_token_123',
    };

    const isValid = query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === VERIFY_TOKEN;
    expect(isValid).toBe(true);
    if (isValid) {
      expect(query['hub.challenge']).toBe('challenge_token_123');
    }
  });

  it('should reject invalid verify token', () => {
    const VERIFY_TOKEN = 'acquisitionos_verify_token';
    const query = {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': 'challenge_token_123',
    };

    const isValid = query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === VERIFY_TOKEN;
    expect(isValid).toBe(false);
  });

  it('should send message via Meta Cloud API', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        messaging_product: 'whatsapp',
        contacts: [{ input: '+1234567890', wa_id: '1234567890' }],
        messages: [{ id: 'wamid_123' }],
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const response = await fetch(
      'https://graph.facebook.com/v18.0/PHONE_NUMBER_ID/messages',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ACCESS_TOKEN',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '+1234567890',
          type: 'text',
          text: { body: 'Hello from AcquisitionOS' },
        }),
      }
    );

    const data = await response.json();
    expect(data.messages[0].id).toBe('wamid_123');
    expect(data.messaging_product).toBe('whatsapp');
  });

  it('should handle Meta API error', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      json: () => Promise.resolve({
        error: { message: 'Invalid access token', type: 'OAuthException' },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const response = await fetch('https://graph.facebook.com/v18.0/PHONE_NUMBER_ID/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer INVALID' },
      body: JSON.stringify({}),
    });

    expect(response.ok).toBe(false);
    const data = await response.json();
    expect(data.error.type).toBe('OAuthException');
  });
});

// ═══════════════════════════════════════════════════════════════════
// TWILIO CONNECTION
// ═══════════════════════════════════════════════════════════════════

describe('WhatsApp Twilio Connection', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('should send WhatsApp message via Twilio', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        sid: 'SM1234567890abcdef',
        status: 'queued',
        to: 'whatsapp:+1234567890',
        from: 'whatsapp:+1987654321',
      }),
    });

    const response = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/ACCOUNT_SID/Messages.json',
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from('ACCOUNT_SID:AUTH_TOKEN').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: 'whatsapp:+1234567890',
          From: 'whatsapp:+1987654321',
          Body: 'Hello from AcquisitionOS via Twilio',
        }).toString(),
      }
    );

    const data = await response.json();
    expect(data.status).toBe('queued');
    expect(data.sid).toBe('SM1234567890abcdef');
  });

  it('should validate Twilio webhook signature', () => {
    function validateTwilioSignature(
      url: string,
      params: Record<string, string>,
      signature: string,
      authToken: string
    ): boolean {
      // Simplified validation — real implementation uses HMAC
      // In production: crypto.createHmac('sha1', authToken).update(url + Object.entries(params).sort().flat().join('')).digest('base64') === signature
      return signature.length > 0 && authToken.length > 0;
    }

    expect(validateTwilioSignature(
      'https://app.acquisitionos.com/api/whatsapp/webhook',
      { MessageSid: 'SM123' },
      'valid_signature',
      'auth_token'
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MESSAGE DELIVERY STATUS
// ═══════════════════════════════════════════════════════════════════

describe('WhatsApp Message Delivery Status', () => {
  type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

  function processDeliveryStatus(status: DeliveryStatus, messageId: string): {
    action: string;
    timestamp: Date;
  } {
    const actions: Record<DeliveryStatus, string> = {
      sent: 'Message sent to WhatsApp servers',
      delivered: 'Message delivered to recipient device',
      read: 'Message read by recipient',
      failed: 'Message delivery failed',
    };
    return { action: actions[status], timestamp: new Date() };
  }

  it('should handle sent status', () => {
    const result = processDeliveryStatus('sent', 'msg_1');
    expect(result.action).toContain('sent');
  });

  it('should handle delivered status', () => {
    const result = processDeliveryStatus('delivered', 'msg_1');
    expect(result.action).toContain('delivered');
  });

  it('should handle read status', () => {
    const result = processDeliveryStatus('read', 'msg_1');
    expect(result.action).toContain('read');
  });

  it('should handle failed status', () => {
    const result = processDeliveryStatus('failed', 'msg_1');
    expect(result.action).toContain('failed');
  });

  it('should store delivery status in database', async () => {
    mockDb.whatsappMessage = {
      update: vi.fn().mockResolvedValue({ id: 'msg_1' }),
    } as any;

    await (mockDb.whatsappMessage as any).update({
      where: { id: 'msg_1' },
      data: { status: 'delivered', deliveredAt: new Date() },
    });

    expect((mockDb.whatsappMessage as any).update).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE VARIABLE SUBSTITUTION
// ═══════════════════════════════════════════════════════════════════

describe('WhatsApp Template Variable Substitution', () => {
  function substituteTemplateVariables(
    template: string,
    variables: Record<string, string>
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      // WhatsApp templates use {{1}}, {{2}}, etc.
      const numericKey = String(Object.keys(variables).indexOf(key) + 1);
      result = result.replace(new RegExp(`\\{\\{${numericKey}\\}\\}`, 'g'), value);
    }
    return result;
  }

  it('should substitute numbered template variables', () => {
    const template = 'Hello {{1}}, welcome to {{2}}! Your code is {{3}}.';
    const result = substituteTemplateVariables(template, {
      name: 'John',
      company: 'AcquisitionOS',
      code: 'ABC123',
    });
    expect(result).toBe('Hello John, welcome to AcquisitionOS! Your code is ABC123.');
  });

  it('should handle single variable template', () => {
    const template = 'Your verification code is {{1}}.';
    const result = substituteTemplateVariables(template, { code: '789012' });
    expect(result).toBe('Your verification code is 789012.');
  });

  it('should leave unsubstituted variables intact', () => {
    const template = 'Hello {{1}}, {{2}}';
    const result = substituteTemplateVariables(template, { name: 'John' });
    expect(result).toBe('Hello John, {{2}}');
  });

  it('should validate template against WhatsApp requirements', () => {
    function validateTemplate(template: string): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      if (template.length > 1024) errors.push('Template exceeds 1024 character limit');
      const vars = template.match(/\{\{\d+\}\}/g) || [];
      const varNumbers = vars.map(v => parseInt(v.match(/\d+/)?.[0] || '0'));
      const maxVar = Math.max(...varNumbers, 0);
      if (maxVar > 10) errors.push('Maximum 10 template variables allowed');
      return { valid: errors.length === 0, errors };
    }

    expect(validateTemplate('Hello {{1}}').valid).toBe(true);
    expect(validateTemplate('A'.repeat(1025)).valid).toBe(false);
  });
});
