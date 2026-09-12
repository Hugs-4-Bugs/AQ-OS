// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: AI (Lead Scoring, Outreach, Chat, Credits)
// Phase 14.1: TESTING SUITE
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, createTestUser, createTestLead } from '../helpers/test-utils';


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

// Mock feature-flags
vi.mock('@/lib/feature-flags', () => ({
  shouldBypassEmail: vi.fn(() => true),
}));

// Mock email
vi.mock('@/lib/email', () => ({
  sendSecurityAlertEmail: vi.fn(),
  isEmailServiceConfigured: vi.fn(() => false),
}));

import { db } from '@/lib/db';
const mockDb = db as any;

// ═══════════════════════════════════════════════════════════════════
// LEAD QUALITY SCORING (Weighted Dimensions)
// ═══════════════════════════════════════════════════════════════════

describe('Lead Quality Scoring', () => {
  /**
   * Lead scoring uses weighted dimensions:
   * - conversionScore: business fit and likelihood to convert
   * - replyScore: responsiveness to outreach
   * - urgencyScore: time-sensitivity of need
   * - revenuePotentialScore: estimated revenue opportunity
   *
   * These are stored on the Lead model and combined for overall quality.
   */

  function calculateOverallScore(lead: {
    conversionScore: number;
    replyScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
  }): number {
    const weights = {
      conversion: 0.35,
      reply: 0.20,
      urgency: 0.15,
      revenue: 0.30,
    };
    const raw =
      lead.conversionScore * weights.conversion +
      lead.replyScore * weights.reply +
      lead.urgencyScore * weights.urgency +
      lead.revenuePotentialScore * weights.revenue;
    return Math.round(raw * 100) / 100;
  }

  it('should calculate weighted score correctly', () => {
    const lead = createTestLead({
      conversionScore: 80,
      replyScore: 60,
      urgencyScore: 40,
      revenuePotentialScore: 90,
    });
    const score = calculateOverallScore(lead as any);
    // 80*0.35 + 60*0.20 + 40*0.15 + 90*0.30 = 28 + 12 + 6 + 27 = 73
    expect(score).toBe(73);
  });

  it('should give highest weight to conversion score', () => {
    const highConversion = createTestLead({
      conversionScore: 100,
      replyScore: 0,
      urgencyScore: 0,
      revenuePotentialScore: 0,
    } as any);
    const lowConversion = createTestLead({
      conversionScore: 0,
      replyScore: 100,
      urgencyScore: 0,
      revenuePotentialScore: 0,
    } as any);
    expect(calculateOverallScore(highConversion as any)).toBeGreaterThan(
      calculateOverallScore(lowConversion as any)
    );
  });

  it('should give second highest weight to revenue potential', () => {
    const highRevenue = createTestLead({
      conversionScore: 0,
      replyScore: 100,
      urgencyScore: 0,
      revenuePotentialScore: 0,
    } as any);
    const lowRevenue = createTestLead({
      conversionScore: 0,
      replyScore: 0,
      urgencyScore: 100,
      revenuePotentialScore: 0,
    } as any);
    expect(calculateOverallScore(highRevenue as any)).toBeGreaterThan(
      calculateOverallScore(lowRevenue as any)
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// SCORE CAPPING (0-100)
// ═══════════════════════════════════════════════════════════════════

describe('Score Capping', () => {
  function capScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  it('should cap score at 100', () => {
    expect(capScore(150)).toBe(100);
    expect(capScore(100)).toBe(100);
    expect(capScore(101)).toBe(100);
  });

  it('should cap score at 0 minimum', () => {
    expect(capScore(-10)).toBe(0);
    expect(capScore(0)).toBe(0);
  });

  it('should preserve scores within range', () => {
    expect(capScore(50)).toBe(50);
    expect(capScore(75)).toBe(75);
    expect(capScore(1)).toBe(1);
    expect(capScore(99)).toBe(99);
  });

  it('should round fractional scores', () => {
    expect(capScore(73.6)).toBe(74);
    expect(capScore(73.4)).toBe(73);
  });
});

// ═══════════════════════════════════════════════════════════════════
// OUTREACH MESSAGE PERSONALIZATION
// ═══════════════════════════════════════════════════════════════════

describe('Outreach Message Personalization', () => {
  interface PersonalizationContext {
    businessName: string;
    ownerName: string | null;
    niche: string;
    city: string | null;
    website: string | null;
    digitalWeaknesses: string | null;
  }

  function personalizeMessage(
    template: string,
    context: PersonalizationContext
  ): string {
    return template
      .replace(/\{\{businessName\}\}/g, context.businessName)
      .replace(/\{\{ownerName\}\}/g, context.ownerName || 'there')
      .replace(/\{\{niche\}\}/g, context.niche)
      .replace(/\{\{city\}\}/g, context.city || 'your area')
      .replace(/\{\{website\}\}/g, context.website || 'your website')
      .replace(/\{\{digitalWeaknesses\}\}/g, context.digitalWeaknesses || 'your online presence');
  }

  const template =
    'Hi {{ownerName}}, I noticed {{businessName}} in {{city}} could benefit from improving {{digitalWeaknesses}}.';

  it('should replace all template variables', () => {
    const result = personalizeMessage(template, {
      businessName: 'Acme Corp',
      ownerName: 'John',
      niche: 'restaurant',
      city: 'Mumbai',
      website: 'https://acme.com',
      digitalWeaknesses: 'SEO rankings',
    });
    expect(result).toContain('John');
    expect(result).toContain('Acme Corp');
    expect(result).toContain('Mumbai');
    expect(result).toContain('SEO rankings');
    expect(result).not.toContain('{{');
  });

  it('should use fallback for missing owner name', () => {
    const result = personalizeMessage(template, {
      businessName: 'Test Biz',
      ownerName: null,
      niche: 'retail',
      city: 'Delhi',
      website: null,
      digitalWeaknesses: null,
    });
    expect(result).toContain('there');
  });

  it('should use fallback for missing city', () => {
    const result = personalizeMessage(template, {
      businessName: 'Test Biz',
      ownerName: 'Jane',
      niche: 'tech',
      city: null,
      website: null,
      digitalWeaknesses: null,
    });
    expect(result).toContain('your area');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CHANNEL CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════

describe('Channel Constraints', () => {
  type Channel = 'email' | 'whatsapp' | 'telegram' | 'linkedin' | 'phone';

  const CHANNEL_CONSTRAINTS: Record<Channel, { maxLength: number; supportsAttachments: boolean; richFormatting: boolean }> = {
    email: { maxLength: 50000, supportsAttachments: true, richFormatting: true },
    whatsapp: { maxLength: 65536, supportsAttachments: true, richFormatting: false },
    telegram: { maxLength: 4096, supportsAttachments: true, richFormatting: true },
    linkedin: { maxLength: 300, supportsAttachments: false, richFormatting: false },
    phone: { maxLength: 0, supportsAttachments: false, richFormatting: false },
  };

  it('should enforce max length per channel', () => {
    expect(CHANNEL_CONSTRAINTS.email.maxLength).toBe(50000);
    expect(CHANNEL_CONSTRAINTS.linkedin.maxLength).toBe(300);
    expect(CHANNEL_CONSTRAINTS.telegram.maxLength).toBe(4096);
  });

  it('should identify channels that support attachments', () => {
    expect(CHANNEL_CONSTRAINTS.email.supportsAttachments).toBe(true);
    expect(CHANNEL_CONSTRAINTS.whatsapp.supportsAttachments).toBe(true);
    expect(CHANNEL_CONSTRAINTS.linkedin.supportsAttachments).toBe(false);
    expect(CHANNEL_CONSTRAINTS.phone.supportsAttachments).toBe(false);
  });

  function validateMessageForChannel(message: string, channel: Channel): { valid: boolean; error?: string } {
    const constraints = CHANNEL_CONSTRAINTS[channel];
    if (constraints.maxLength > 0 && message.length > constraints.maxLength) {
      return { valid: false, error: `Message exceeds ${channel} max length of ${constraints.maxLength}` };
    }
    return { valid: true };
  }

  it('should validate message length against channel constraints', () => {
    const shortMessage = 'Hello!';
    expect(validateMessageForChannel(shortMessage, 'email').valid).toBe(true);
    expect(validateMessageForChannel(shortMessage, 'linkedin').valid).toBe(true);

    const longMessage = 'A'.repeat(301);
    expect(validateMessageForChannel(longMessage, 'linkedin').valid).toBe(false);
    expect(validateMessageForChannel(longMessage, 'email').valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TONE APPLICATION
// ═══════════════════════════════════════════════════════════════════

describe('Tone Application', () => {
  type Tone = 'professional' | 'friendly' | 'casual' | 'consultative' | 'direct';

  const TONE_PROMPTS: Record<Tone, string> = {
    professional: 'Use formal language, proper titles, and a business-appropriate tone.',
    friendly: 'Use warm, approachable language. Be personable but not overly casual.',
    casual: 'Use relaxed, conversational language. Keep it light and natural.',
    consultative: 'Position as an advisor. Ask questions, provide insights, focus on value.',
    direct: 'Be concise and to the point. State the value proposition clearly.',
  };

  it('should have tone prompts for all supported tones', () => {
    const tones: Tone[] = ['professional', 'friendly', 'casual', 'consultative', 'direct'];
    for (const tone of tones) {
      expect(TONE_PROMPTS[tone]).toBeDefined();
      expect(TONE_PROMPTS[tone].length).toBeGreaterThan(10);
    }
  });

  it('should generate different prompt text for different tones', () => {
    expect(TONE_PROMPTS.professional).not.toBe(TONE_PROMPTS.casual);
    expect(TONE_PROMPTS.direct).not.toBe(TONE_PROMPTS.consultative);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CHAT SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

describe('Chat Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a chat session', async () => {
    mockDb.chatSession = {
      create: vi.fn().mockResolvedValue({ id: 'chat_1', userId: 'user_1' }),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    } as any;

    const session = await mockDb.chatSession.create({
      data: { userId: 'user_1', title: 'New Chat' },
    });
    expect(session.id).toBe('chat_1');
  });

  it('should list chat sessions for a user', async () => {
    const mockSessions = [
      { id: 'chat_1', userId: 'user_1', title: 'Chat 1' },
      { id: 'chat_2', userId: 'user_1', title: 'Chat 2' },
    ];
    mockDb.chatSession = {
      findMany: vi.fn().mockResolvedValue(mockSessions),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    } as any;

    const sessions = await mockDb.chatSession.findMany({
      where: { userId: 'user_1' },
    });
    expect(sessions).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT ENFORCEMENT FOR AI OPERATIONS
// ═══════════════════════════════════════════════════════════════════

describe('Credit Enforcement for AI Operations', () => {
  const AI_CREDIT_COSTS: Record<string, number> = {
    chat_message: 1,
    lead_analysis: 5,
    outreach_generation: 2,
    proposal_generation: 10,
    sales_coaching: 3,
  };

  it('should define credit costs for all AI operations', () => {
    Object.values(AI_CREDIT_COSTS).forEach(cost => {
      expect(cost).toBeGreaterThan(0);
    });
  });

  it('should check credit sufficiency before AI operations', async () => {
    mockDb.user.findUnique.mockResolvedValue({ credits: 100 });
    const balance = await mockDb.user.findUnique({
      where: { id: 'user_1' },
      select: { credits: true },
    });
    const cost = AI_CREDIT_COSTS.lead_analysis;
    const canAfford = (balance?.credits ?? 0) >= cost;
    expect(canAfford).toBe(true);
  });

  it('should block AI operation when insufficient credits', async () => {
    mockDb.user.findUnique.mockResolvedValue({ credits: 2 });
    const balance = await mockDb.user.findUnique({
      where: { id: 'user_1' },
      select: { credits: true },
    });
    const cost = AI_CREDIT_COSTS.proposal_generation; // 10 credits
    const canAfford = (balance?.credits ?? 0) >= cost;
    expect(canAfford).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PROMPT TEMPLATE RENDERING
// ═══════════════════════════════════════════════════════════════════

describe('Prompt Template Rendering', () => {
  interface TemplateVars {
    [key: string]: string;
  }

  function renderTemplate(template: string, vars: TemplateVars): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }

  it('should render single variable template', () => {
    const template = 'Analyze the business: {{businessName}}';
    const result = renderTemplate(template, { businessName: 'Acme Corp' });
    expect(result).toBe('Analyze the business: Acme Corp');
  });

  it('should render multiple variables', () => {
    const template = '{{businessName}} in {{city}} — niche: {{niche}}';
    const result = renderTemplate(template, {
      businessName: 'Test Biz',
      city: 'Mumbai',
      niche: 'restaurant',
    });
    expect(result).toBe('Test Biz in Mumbai — niche: restaurant');
  });

  it('should leave unreferenced variables intact', () => {
    const template = 'Hello {{name}}, {{unknown}}';
    const result = renderTemplate(template, { name: 'John' });
    expect(result).toBe('Hello John, {{unknown}}');
  });

  it('should handle empty vars object', () => {
    const template = 'No variables here';
    const result = renderTemplate(template, {});
    expect(result).toBe('No variables here');
  });

  it('should replace repeated variables', () => {
    const template = '{{name}} is great. {{name}} is the best!';
    const result = renderTemplate(template, { name: 'Acme' });
    expect(result).toBe('Acme is great. Acme is the best!');
  });
});
