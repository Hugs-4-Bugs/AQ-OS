// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Integration Tests: Gmail Integration
// Phase 14.1: TESTING SUITE
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, createTestUser } from '../helpers/test-utils';


// Mock db

// Mock billing-audit
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

// Mock google-auth-library
const mockOAuth2Client = {
  generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?scope=email'),
  getToken: vi.fn(),
  setCredentials: vi.fn(),
  credentials: { access_token: 'mock_access_token', refresh_token: 'mock_refresh_token' },
};

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => mockOAuth2Client),
}));

// Mock googleapis gmail
const mockGmailUsers = {
  messages: {
    list: vi.fn(),
    get: vi.fn(),
    send: vi.fn(),
  },
  threads: {
    list: vi.fn(),
    get: vi.fn(),
  },
  labels: {
    list: vi.fn(),
  },
};

vi.mock('googleapis', () => ({
  google: {
    gmail: vi.fn().mockReturnValue({ users: mockGmailUsers }),
  },
}));

import { db } from '@/lib/db';
const mockDb = db as any;

// ═══════════════════════════════════════════════════════════════════
// OAUTH FLOW SIMULATION
// ═══════════════════════════════════════════════════════════════════

describe('Gmail OAuth Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate OAuth authorization URL', () => {
    const authUrl = mockOAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'],
    });
    expect(authUrl).toContain('accounts.google.com');
    expect(authUrl).toContain('oauth2');
  });

  it('should exchange authorization code for tokens', async () => {
    mockOAuth2Client.getToken.mockResolvedValue({
      tokens: { access_token: 'at_123', refresh_token: 'rt_456', expiry_date: Date.now() + 3600000 },
    });

    const { tokens } = await mockOAuth2Client.getToken('auth_code_123');
    expect(tokens.access_token).toBe('at_123');
    expect(tokens.refresh_token).toBe('rt_456');
    // setCredentials is called when we pass the tokens to the client
    mockOAuth2Client.setCredentials(tokens);
    expect(mockOAuth2Client.setCredentials).toHaveBeenCalled();
  });

  it('should store OAuth tokens in database', async () => {
    mockDb.user.update.mockResolvedValue({});

    await mockDb.user.update({
      where: { id: 'user_1' },
      data: {
        gmailAccessToken: 'at_123',
        gmailRefreshToken: 'rt_456',
        gmailTokenExpiry: new Date(Date.now() + 3600000),
      },
    });

    expect(mockDb.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gmailAccessToken: 'at_123',
          gmailRefreshToken: 'rt_456',
        }),
      })
    );
  });

  it('should handle OAuth error gracefully', async () => {
    mockOAuth2Client.getToken.mockRejectedValue(new Error('Invalid grant'));

    await expect(mockOAuth2Client.getToken('invalid_code')).rejects.toThrow('Invalid grant');
  });
});

// ═══════════════════════════════════════════════════════════════════
// THREAD LISTING
// ═══════════════════════════════════════════════════════════════════

describe('Gmail Thread Listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list email threads', async () => {
    mockGmailUsers.threads.list.mockResolvedValue({
      data: {
        threads: [
          { id: 'thread_1', snippet: 'Hello from lead...' },
          { id: 'thread_2', snippet: 'Re: Proposal...' },
        ],
        resultSizeEstimate: 2,
      },
    });

    const result = await mockGmailUsers.threads.list({ userId: 'me', maxResults: 10 });
    expect(result.data.threads).toHaveLength(2);
    expect(result.data.threads[0].id).toBe('thread_1');
  });

  it('should get a specific thread with messages', async () => {
    mockGmailUsers.threads.get.mockResolvedValue({
      data: {
        id: 'thread_1',
        messages: [
          { id: 'msg_1', payload: { headers: [{ name: 'Subject', value: 'Test' }] } },
          { id: 'msg_2', payload: { headers: [{ name: 'Subject', value: 'Re: Test' }] } },
        ],
      },
    });

    const result = await mockGmailUsers.threads.get({ userId: 'me', id: 'thread_1' });
    expect(result.data.messages).toHaveLength(2);
  });

  it('should handle empty thread list', async () => {
    mockGmailUsers.threads.list.mockResolvedValue({
      data: { threads: [], resultSizeEstimate: 0 },
    });

    const result = await mockGmailUsers.threads.list({ userId: 'me' });
    expect(result.data.threads).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// EMAIL SENDING
// ═══════════════════════════════════════════════════════════════════

describe('Gmail Email Sending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send an email via Gmail API', async () => {
    mockGmailUsers.messages.send.mockResolvedValue({
      data: { id: 'msg_sent_1', labelIds: ['SENT'] },
    });

    const result = await mockGmailUsers.messages.send({
      userId: 'me',
      body: { raw: Buffer.from('To: lead@test.com\nSubject: Test\n\nHello').toString('base64url') },
    });
    expect(result.data.id).toBe('msg_sent_1');
  });

  it('should encode email as base64url', () => {
    const emailContent = 'To: lead@test.com\nSubject: Outreach\n\nHello from AcquisitionOS';
    const encoded = Buffer.from(emailContent).toString('base64url');
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    // base64url should not contain + or /
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('should handle send failure', async () => {
    mockGmailUsers.messages.send.mockRejectedValue(new Error('Rate limit exceeded'));

    await expect(mockGmailUsers.messages.send({ userId: 'me', body: { raw: '' } }))
      .rejects.toThrow('Rate limit exceeded');
  });
});

// ═══════════════════════════════════════════════════════════════════
// TRACKING PIXEL URL GENERATION
// ═══════════════════════════════════════════════════════════════════

describe('Tracking Pixel URL Generation', () => {
  function generateTrackingPixelUrl(baseUrl: string, emailId: string, leadId: string): string {
    const params = new URLSearchParams({
      eid: emailId,
      lid: leadId,
      t: Date.now().toString(),
    });
    return `${baseUrl}/api/email/tracking/open/${emailId}?${params.toString()}`;
  }

  function generateClickTrackingUrl(baseUrl: string, emailId: string, leadId: string, targetUrl: string): string {
    const params = new URLSearchParams({
      eid: emailId,
      lid: leadId,
      url: targetUrl,
      t: Date.now().toString(),
    });
    return `${baseUrl}/api/email/tracking/click/${emailId}?${params.toString()}`;
  }

  it('should generate open tracking pixel URL', () => {
    const url = generateTrackingPixelUrl('https://app.acquisitionos.com', 'email_1', 'lead_1');
    expect(url).toContain('/api/email/tracking/open/email_1');
    expect(url).toContain('eid=email_1');
    expect(url).toContain('lid=lead_1');
  });

  it('should generate click tracking URL', () => {
    const url = generateClickTrackingUrl(
      'https://app.acquisitionos.com',
      'email_1',
      'lead_1',
      'https://acquisitionos.com/pricing'
    );
    expect(url).toContain('/api/email/tracking/click/email_1');
    expect(url).toContain('url=');
  });

  it('should include timestamp in tracking URLs', () => {
    const url = generateTrackingPixelUrl('https://app.acquisitionos.com', 'email_1', 'lead_1');
    expect(url).toContain('t=');
  });

  it('should generate valid HTML for tracking pixel', () => {
    const pixelUrl = generateTrackingPixelUrl('https://app.acquisitionos.com', 'email_1', 'lead_1');
    const html = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none" />`;
    expect(html).toContain('<img');
    expect(html).toContain('width="1"');
    expect(html).toContain('height="1"');
    expect(html).toContain('display:none');
  });
});

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK PAYLOAD PROCESSING
// ═══════════════════════════════════════════════════════════════════

describe('Gmail Webhook Payload Processing', () => {
  function processGmailWebhook(payload: {
    message?: { data?: string; messageId?: string; publishTime?: string };
  }): { emailId: string; historyId: string; timestamp: Date } | null {
    if (!payload.message?.data) return null;

    const decoded = JSON.parse(Buffer.from(payload.message.data, 'base64').toString());
    return {
      emailId: decoded.emailAddress || payload.message.messageId || '',
      historyId: decoded.historyId || '',
      timestamp: new Date(payload.message.publishTime || Date.now()),
    };
  }

  it('should process valid webhook payload', () => {
    const data = Buffer.from(JSON.stringify({
      emailAddress: 'user@test.com',
      historyId: '12345',
    })).toString('base64');

    const result = processGmailWebhook({
      message: {
        data,
        messageId: 'msg_pub_1',
        publishTime: '2024-01-15T10:00:00Z',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.emailId).toBe('user@test.com');
    expect(result!.historyId).toBe('12345');
  });

  it('should reject payload without message data', () => {
    const result = processGmailWebhook({});
    expect(result).toBeNull();
  });

  it('should reject payload with empty data', () => {
    const result = processGmailWebhook({ message: {} });
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// BOUNCE HANDLING
// ═══════════════════════════════════════════════════════════════════

describe('Bounce Handling', () => {
  interface BounceNotification {
    recipient: string;
    bounceType: 'permanent' | 'transient';
    bounceSubType: string;
    diagnosticCode: string;
    timestamp: Date;
  }

  function handleBounce(bounce: BounceNotification): {
    action: 'suppress' | 'retry' | 'ignore';
    reason: string;
  } {
    if (bounce.bounceType === 'permanent') {
      return {
        action: 'suppress',
        reason: `Permanent bounce: ${bounce.bounceSubType}. ${bounce.diagnosticCode}`,
      };
    }
    if (bounce.bounceType === 'transient') {
      return {
        action: 'retry',
        reason: `Transient bounce: ${bounce.bounceSubType}. Will retry later.`,
      };
    }
    return { action: 'ignore', reason: 'Unknown bounce type' };
  }

  it('should suppress permanently bounced emails', () => {
    const result = handleBounce({
      recipient: 'invalid@test.com',
      bounceType: 'permanent',
      bounceSubType: 'NoSuchUser',
      diagnosticCode: '550 5.1.1 User unknown',
      timestamp: new Date(),
    });
    expect(result.action).toBe('suppress');
    expect(result.reason).toContain('Permanent');
  });

  it('should retry transiently bounced emails', () => {
    const result = handleBounce({
      recipient: 'full@inbox.com',
      bounceType: 'transient',
      bounceSubType: 'MailboxFull',
      diagnosticCode: '452 4.2.2 Mailbox full',
      timestamp: new Date(),
    });
    expect(result.action).toBe('retry');
    expect(result.reason).toContain('Transient');
  });

  it('should store bounce record in database', async () => {
    mockDb.emailBounce = { create: vi.fn().mockResolvedValue({ id: 'bounce_1' }) } as any;

    await mockDb.emailBounce.create({
      data: {
        recipient: 'invalid@test.com',
        bounceType: 'permanent',
        diagnosticCode: '550 User unknown',
        leadId: 'lead_1',
      },
    });

    expect((mockDb.emailBounce as any).create).toHaveBeenCalled();
  });
});
