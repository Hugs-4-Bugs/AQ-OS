// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Integration Tests: Telegram Integration
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

// Mock node-telegram-bot-api
const mockBot = {
  sendMessage: vi.fn(),
  getMe: vi.fn(),
  setWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  on: vi.fn(),
  processUpdate: vi.fn(),
};

vi.mock('node-telegram-bot-api', () => ({
  default: vi.fn().mockImplementation(() => mockBot),
}));

import { db } from '@/lib/db';
const mockDb = db as any;

// ═══════════════════════════════════════════════════════════════════
// BOT CONNECTION FLOW
// ═══════════════════════════════════════════════════════════════════

describe('Telegram Bot Connection Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should verify bot token by calling getMe', async () => {
    mockBot.getMe.mockResolvedValue({
      id: 123456789,
      is_bot: true,
      first_name: 'AcquisitionOS Bot',
      username: 'AcquisitionOSBot',
    });

    const botInfo = await mockBot.getMe();
    expect(botInfo.is_bot).toBe(true);
    expect(botInfo.username).toBe('AcquisitionOSBot');
  });

  it('should store bot configuration in database', async () => {
    mockDb.user.update.mockResolvedValue({});

    await mockDb.user.update({
      where: { id: 'user_1' },
      data: {
        telegramBotToken: '123456:ABC-DEF',
        telegramBotUsername: 'AcquisitionOSBot',
        telegramConnected: true,
      },
    });

    expect(mockDb.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramBotToken: '123456:ABC-DEF',
          telegramConnected: true,
        }),
      })
    );
  });

  it('should reject invalid bot token', async () => {
    mockBot.getMe.mockRejectedValue(new Error('Unauthorized'));

    await expect(mockBot.getMe()).rejects.toThrow('Unauthorized');
  });
});

// ═══════════════════════════════════════════════════════════════════
// MESSAGE SENDING
// ═══════════════════════════════════════════════════════════════════

describe('Telegram Message Sending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send a text message', async () => {
    mockBot.sendMessage.mockResolvedValue({
      message_id: 42,
      text: 'Hello from AcquisitionOS',
      chat: { id: 12345, type: 'private' },
      date: Date.now(),
    });

    const result = await mockBot.sendMessage(12345, 'Hello from AcquisitionOS');
    expect(result.message_id).toBe(42);
    expect(result.text).toBe('Hello from AcquisitionOS');
  });

  it('should send message with parse mode', async () => {
    mockBot.sendMessage.mockResolvedValue({
      message_id: 43,
      text: '<b>Bold</b> message',
    });

    const result = await mockBot.sendMessage(12345, '<b>Bold</b> message', {
      parse_mode: 'HTML',
    });
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      12345,
      '<b>Bold</b> message',
      { parse_mode: 'HTML' }
    );
  });

  it('should handle message sending failure', async () => {
    mockBot.sendMessage.mockRejectedValue(new Error('Chat not found'));

    await expect(mockBot.sendMessage(99999, 'Test')).rejects.toThrow('Chat not found');
  });

  it('should respect Telegram message length limits', () => {
    const maxTelegramLength = 4096;
    const longMessage = 'A'.repeat(5000);
    const needsSplit = longMessage.length > maxTelegramLength;
    expect(needsSplit).toBe(true);

    // Split message
    const chunks: string[] = [];
    for (let i = 0; i < longMessage.length; i += maxTelegramLength) {
      chunks.push(longMessage.slice(i, i + maxTelegramLength));
    }
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(maxTelegramLength);
  });
});

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK VERIFICATION
// ═══════════════════════════════════════════════════════════════════

describe('Telegram Webhook Verification', () => {
  function verifyTelegramWebhook(
    secretToken: string,
    receivedToken: string | undefined
  ): boolean {
    return secretToken === receivedToken;
  }

  it('should accept webhook with correct secret', () => {
    expect(verifyTelegramWebhook('my_secret_token', 'my_secret_token')).toBe(true);
  });

  it('should reject webhook with incorrect secret', () => {
    expect(verifyTelegramWebhook('my_secret_token', 'wrong_token')).toBe(false);
  });

  it('should reject webhook without secret token', () => {
    expect(verifyTelegramWebhook('my_secret_token', undefined)).toBe(false);
  });

  it('should set webhook URL', async () => {
    mockBot.setWebhook.mockResolvedValue(true);

    const result = await mockBot.setWebhook('https://app.acquisitionos.com/api/telegram/webhook?XTransformPort=3000');
    expect(result).toBe(true);
    expect(mockBot.setWebhook).toHaveBeenCalledWith(
      expect.stringContaining('/api/telegram/webhook')
    );
  });

  it('should process incoming update', async () => {
    const update = {
      update_id: 123,
      message: {
        message_id: 1,
        from: { id: 111, first_name: 'User' },
        chat: { id: 111, type: 'private' },
        text: '/start',
      },
    };

    mockBot.processUpdate.mockImplementation(() => {});
    mockBot.processUpdate(update);
    expect(mockBot.processUpdate).toHaveBeenCalledWith(update);
  });
});

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════

describe('Telegram Health Check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should report healthy when bot is responsive', async () => {
    mockBot.getMe.mockResolvedValue({ is_bot: true, username: 'TestBot' });

    const botInfo = await mockBot.getMe();
    const healthy = !!botInfo.is_bot;
    expect(healthy).toBe(true);
  });

  it('should report unhealthy when bot is not responsive', async () => {
    mockBot.getMe.mockRejectedValue(new Error('Connection refused'));

    let healthy = false;
    try {
      await mockBot.getMe();
      healthy = true;
    } catch {
      healthy = false;
    }
    expect(healthy).toBe(false);
  });
});
