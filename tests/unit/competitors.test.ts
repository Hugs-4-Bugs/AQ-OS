// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Competitor Intelligence
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

// Mock feature-flags
vi.mock('@/lib/feature-flags', () => ({
  shouldBypassEmail: vi.fn(() => true),
}));

import { db } from '@/lib/db';
const mockDb = db as any;

// ═══════════════════════════════════════════════════════════════════
// COMPETITOR DATA CRUD
// ═══════════════════════════════════════════════════════════════════

describe('Competitor Data CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create competitor data', async () => {
    const competitorData = {
      id: 'comp_1',
      userId: 'user_1',
      name: 'Competitor A',
      website: 'https://competitor-a.com',
      industry: 'SaaS',
    };
    mockDb.competitorData.create.mockResolvedValue(competitorData);

    const result = await mockDb.competitorData.create({ data: competitorData });
    expect(result.id).toBe('comp_1');
    expect(result.name).toBe('Competitor A');
  });

  it('should read competitor data', async () => {
    mockDb.competitorData.findUnique.mockResolvedValue({
      id: 'comp_1',
      name: 'Competitor A',
    });

    const result = await mockDb.competitorData.findUnique({ where: { id: 'comp_1' } });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Competitor A');
  });

  it('should update competitor data', async () => {
    mockDb.competitorData.update.mockResolvedValue({
      id: 'comp_1',
      name: 'Competitor A Updated',
    });

    const result = await mockDb.competitorData.update({
      where: { id: 'comp_1' },
      data: { name: 'Competitor A Updated' },
    });
    expect(result.name).toBe('Competitor A Updated');
  });

  it('should delete competitor data', async () => {
    mockDb.competitorData.delete.mockResolvedValue({ id: 'comp_1' });

    const result = await mockDb.competitorData.delete({ where: { id: 'comp_1' } });
    expect(result.id).toBe('comp_1');
  });

  it('should list competitor data for a user', async () => {
    const competitors = [
      { id: 'comp_1', userId: 'user_1', name: 'Comp A' },
      { id: 'comp_2', userId: 'user_1', name: 'Comp B' },
    ];
    mockDb.competitorData.findMany.mockResolvedValue(competitors);

    const results = await mockDb.competitorData.findMany({ where: { userId: 'user_1' } });
    expect(results).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ANALYSIS PIPELINE STAGES
// ═══════════════════════════════════════════════════════════════════

describe('Analysis Pipeline Stages', () => {
  type PipelineStage = 'scraping' | 'extraction' | 'analysis' | 'scoring' | 'reporting';

  const STAGES: Record<PipelineStage, { order: number; description: string }> = {
    scraping: { order: 0, description: 'Scrape competitor website and social profiles' },
    extraction: { order: 1, description: 'Extract structured data from scraped content' },
    analysis: { order: 2, description: 'Analyze extracted data for insights' },
    scoring: { order: 3, description: 'Score competitor against various dimensions' },
    reporting: { order: 4, description: 'Generate comparison report' },
  };

  it('should have correct stage order', () => {
    expect(STAGES.scraping.order).toBeLessThan(STAGES.extraction.order);
    expect(STAGES.extraction.order).toBeLessThan(STAGES.analysis.order);
    expect(STAGES.analysis.order).toBeLessThan(STAGES.scoring.order);
    expect(STAGES.scoring.order).toBeLessThan(STAGES.reporting.order);
  });

  it('should have descriptions for all stages', () => {
    for (const stage of Object.values(STAGES)) {
      expect(stage.description.length).toBeGreaterThan(5);
    }
  });

  it('should process stages in order', () => {
    const orderedStages = Object.entries(STAGES)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([name]) => name);
    expect(orderedStages).toEqual(['scraping', 'extraction', 'analysis', 'scoring', 'reporting']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PRICING CHANGE DETECTION
// ═══════════════════════════════════════════════════════════════════

describe('Pricing Change Detection', () => {
  interface PricingSnapshot {
    plan: string;
    price: number;
    currency: string;
    capturedAt: Date;
  }

  function detectPricingChange(
    previous: PricingSnapshot | null,
    current: PricingSnapshot
  ): { changed: boolean; direction?: 'up' | 'down'; percentChange?: number; details?: string } {
    if (!previous) {
      return { changed: false };
    }
    if (current.price === previous.price) {
      return { changed: false };
    }
    const direction = current.price > previous.price ? 'up' : 'down';
    const percentChange = ((current.price - previous.price) / previous.price) * 100;
    return {
      changed: true,
      direction,
      percentChange: Math.round(Math.abs(percentChange) * 100) / 100,
      details: `${previous.plan} price changed from ${previous.price} ${previous.currency} to ${current.price} ${current.currency} (${direction} ${Math.abs(percentChange).toFixed(1)}%)`,
    };
  }

  it('should detect price increase', () => {
    const result = detectPricingChange(
      { plan: 'Pro', price: 29, currency: 'USD', capturedAt: new Date('2024-01-01') },
      { plan: 'Pro', price: 39, currency: 'USD', capturedAt: new Date('2024-02-01') }
    );
    expect(result.changed).toBe(true);
    expect(result.direction).toBe('up');
    expect(result.percentChange).toBeCloseTo(34.48, 1);
  });

  it('should detect price decrease', () => {
    const result = detectPricingChange(
      { plan: 'Pro', price: 39, currency: 'USD', capturedAt: new Date('2024-01-01') },
      { plan: 'Pro', price: 29, currency: 'USD', capturedAt: new Date('2024-02-01') }
    );
    expect(result.changed).toBe(true);
    expect(result.direction).toBe('down');
  });

  it('should detect no change', () => {
    const result = detectPricingChange(
      { plan: 'Pro', price: 29, currency: 'USD', capturedAt: new Date('2024-01-01') },
      { plan: 'Pro', price: 29, currency: 'USD', capturedAt: new Date('2024-02-01') }
    );
    expect(result.changed).toBe(false);
  });

  it('should handle first snapshot (no previous)', () => {
    const result = detectPricingChange(null, {
      plan: 'Pro', price: 29, currency: 'USD', capturedAt: new Date(),
    });
    expect(result.changed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SEO KEYWORD EXTRACTION LOGIC
// ═══════════════════════════════════════════════════════════════════

describe('SEO Keyword Extraction', () => {
  function extractKeywords(content: {
    title?: string;
    metaDescription?: string;
    headings?: string[];
    body?: string;
  }): string[] {
    const text = [
      content.title || '',
      content.metaDescription || '',
      ...(content.headings || []),
      content.body || '',
    ].join(' ');

    // Simple keyword extraction: split on non-alphanumeric, filter short words, deduplicate
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);

    // Count frequencies
    const freq: Record<string, number> = {};
    for (const word of words) {
      freq[word] = (freq[word] || 0) + 1;
    }

    // Sort by frequency, return top keywords
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  it('should extract keywords from title and description', () => {
    const keywords = extractKeywords({
      title: 'Best Restaurant POS Software',
      metaDescription: 'Restaurant point of sale software for small businesses',
    });
    expect(keywords).toContain('restaurant');
    expect(keywords).toContain('software');
  });

  it('should rank frequent keywords higher', () => {
    const keywords = extractKeywords({
      title: 'CRM Software',
      metaDescription: 'Best CRM software for sales teams. CRM software reviews.',
      body: 'Our CRM software helps teams manage relationships.',
    });
    // 'software' appears 3 times, 'crm' appears 3 times
    expect(keywords[0]).toMatch(/^(software|crm)$/);
  });

  it('should filter out short words', () => {
    const keywords = extractKeywords({
      title: 'A CRM for the Best Sales',
    });
    expect(keywords).not.toContain('for');
    expect(keywords).not.toContain('the');
  });

  it('should limit to top 10 keywords', () => {
    const longBody = Array.from({ length: 20 }, (_, i) => `keyword${i} word`).join(' ');
    const keywords = extractKeywords({ body: longBody });
    expect(keywords.length).toBeLessThanOrEqual(10);
  });
});

// ═══════════════════════════════════════════════════════════════════
// WEBSITE CHANGE DIFFING
// ═══════════════════════════════════════════════════════════════════

describe('Website Change Diffing', () => {
  interface WebsiteSnapshot {
    url: string;
    contentHash: string;
    contentLength: number;
    capturedAt: Date;
  }

  function detectWebsiteChange(
    previous: WebsiteSnapshot | null,
    current: WebsiteSnapshot
  ): { changed: boolean; changeType?: 'content' | 'structure' | 'minor'; details?: string } {
    if (!previous) {
      return { changed: false };
    }
    if (previous.contentHash === current.contentHash) {
      return { changed: false };
    }
    const lengthDiff = Math.abs(current.contentLength - previous.contentLength);
    const percentChange = (lengthDiff / previous.contentLength) * 100;

    let changeType: 'content' | 'structure' | 'minor';
    if (percentChange > 30) {
      changeType = 'structure';
    } else if (percentChange > 5) {
      changeType = 'content';
    } else {
      changeType = 'minor';
    }

    return {
      changed: true,
      changeType,
      details: `Content changed: ${percentChange.toFixed(1)}% size difference (${previous.contentLength} → ${current.contentLength} chars)`,
    };
  }

  it('should detect content change via hash', () => {
    const result = detectWebsiteChange(
      { url: 'https://comp.com', contentHash: 'abc123', contentLength: 5000, capturedAt: new Date() },
      { url: 'https://comp.com', contentHash: 'def456', contentLength: 5500, capturedAt: new Date() }
    );
    expect(result.changed).toBe(true);
    expect(result.changeType).toBe('content');
  });

  it('should classify structural changes', () => {
    const result = detectWebsiteChange(
      { url: 'https://comp.com', contentHash: 'abc', contentLength: 5000, capturedAt: new Date() },
      { url: 'https://comp.com', contentHash: 'def', contentLength: 8000, capturedAt: new Date() }
    );
    expect(result.changed).toBe(true);
    expect(result.changeType).toBe('structure');
  });

  it('should classify minor changes', () => {
    const result = detectWebsiteChange(
      { url: 'https://comp.com', contentHash: 'abc', contentLength: 5000, capturedAt: new Date() },
      { url: 'https://comp.com', contentHash: 'def', contentLength: 5100, capturedAt: new Date() }
    );
    expect(result.changed).toBe(true);
    expect(result.changeType).toBe('minor');
  });

  it('should detect no change', () => {
    const result = detectWebsiteChange(
      { url: 'https://comp.com', contentHash: 'abc123', contentLength: 5000, capturedAt: new Date() },
      { url: 'https://comp.com', contentHash: 'abc123', contentLength: 5000, capturedAt: new Date() }
    );
    expect(result.changed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SOCIAL ACTIVITY TRACKING
// ═══════════════════════════════════════════════════════════════════

describe('Social Activity Tracking', () => {
  interface SocialActivity {
    platform: string;
    postCount: number;
    engagementRate: number;
    followerCount: number;
    lastPostDate: Date;
  }

  function analyzeSocialActivity(activities: SocialActivity[]): {
    mostActive: string;
    totalPosts: number;
    avgEngagement: number;
    activePlatforms: number;
  } {
    if (activities.length === 0) {
      return { mostActive: 'none', totalPosts: 0, avgEngagement: 0, activePlatforms: 0 };
    }

    const mostActive = activities.reduce((a, b) => a.postCount > b.postCount ? a : b).platform;
    const totalPosts = activities.reduce((sum, a) => sum + a.postCount, 0);
    const avgEngagement = activities.reduce((sum, a) => sum + a.engagementRate, 0) / activities.length;
    const activePlatforms = activities.filter(a => a.postCount > 0).length;

    return {
      mostActive,
      totalPosts,
      avgEngagement: Math.round(avgEngagement * 100) / 100,
      activePlatforms,
    };
  }

  it('should identify most active platform', () => {
    const result = analyzeSocialActivity([
      { platform: 'twitter', postCount: 50, engagementRate: 2.5, followerCount: 1000, lastPostDate: new Date() },
      { platform: 'linkedin', postCount: 30, engagementRate: 5.0, followerCount: 2000, lastPostDate: new Date() },
      { platform: 'instagram', postCount: 80, engagementRate: 3.0, followerCount: 5000, lastPostDate: new Date() },
    ]);
    expect(result.mostActive).toBe('instagram');
    expect(result.totalPosts).toBe(160);
  });

  it('should calculate average engagement rate', () => {
    const result = analyzeSocialActivity([
      { platform: 'twitter', postCount: 10, engagementRate: 2.0, followerCount: 1000, lastPostDate: new Date() },
      { platform: 'linkedin', postCount: 10, engagementRate: 4.0, followerCount: 2000, lastPostDate: new Date() },
    ]);
    expect(result.avgEngagement).toBe(3.0);
  });

  it('should count active platforms', () => {
    const result = analyzeSocialActivity([
      { platform: 'twitter', postCount: 10, engagementRate: 2.0, followerCount: 1000, lastPostDate: new Date() },
      { platform: 'linkedin', postCount: 0, engagementRate: 0, followerCount: 500, lastPostDate: new Date() },
      { platform: 'instagram', postCount: 5, engagementRate: 3.0, followerCount: 2000, lastPostDate: new Date() },
    ]);
    expect(result.activePlatforms).toBe(2);
  });

  it('should handle empty activity list', () => {
    const result = analyzeSocialActivity([]);
    expect(result.mostActive).toBe('none');
    expect(result.totalPosts).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// REVIEW SENTIMENT SCORING
// ═══════════════════════════════════════════════════════════════════

describe('Review Sentiment Scoring', () => {
  const POSITIVE_WORDS = new Set(['great', 'excellent', 'amazing', 'love', 'best', 'fantastic', 'wonderful', 'helpful', 'recommend', 'awesome']);
  const NEGATIVE_WORDS = new Set(['bad', 'terrible', 'awful', 'hate', 'worst', 'poor', 'disappointed', 'frustrating', 'useless', 'horrible']);

  function analyzeSentiment(text: string): {
    score: number;
    label: 'positive' | 'neutral' | 'negative';
    positiveWords: string[];
    negativeWords: string[];
  } {
    const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/);
    const found: { positive: string[]; negative: string[] } = { positive: [], negative: [] };

    for (const word of words) {
      if (POSITIVE_WORDS.has(word)) found.positive.push(word);
      if (NEGATIVE_WORDS.has(word)) found.negative.push(word);
    }

    const total = found.positive.length + found.negative.length;
    let score = 0;
    if (total > 0) {
      score = (found.positive.length - found.negative.length) / total;
    }

    let label: 'positive' | 'neutral' | 'negative';
    if (score > 0.2) label = 'positive';
    else if (score < -0.2) label = 'negative';
    else label = 'neutral';

    return {
      score: Math.round(score * 100) / 100,
      label,
      positiveWords: [...new Set(found.positive)],
      negativeWords: [...new Set(found.negative)],
    };
  }

  it('should detect positive sentiment', () => {
    const result = analyzeSentiment('This product is great and amazing. I love it!');
    expect(result.label).toBe('positive');
    expect(result.score).toBeGreaterThan(0);
    expect(result.positiveWords).toContain('great');
    expect(result.positiveWords).toContain('amazing');
  });

  it('should detect negative sentiment', () => {
    const result = analyzeSentiment('Terrible experience. Very disappointed and frustrated.');
    expect(result.label).toBe('negative');
    expect(result.score).toBeLessThan(0);
    expect(result.negativeWords).toContain('terrible');
    expect(result.negativeWords).toContain('disappointed');
  });

  it('should detect neutral sentiment', () => {
    const result = analyzeSentiment('The product works as expected. Nothing special.');
    expect(result.label).toBe('neutral');
    expect(result.score).toBe(0);
  });

  it('should handle mixed sentiment', () => {
    const result = analyzeSentiment('Great product but terrible customer service. Love the features but hate the wait.');
    expect(result.positiveWords.length).toBeGreaterThan(0);
    expect(result.negativeWords.length).toBeGreaterThan(0);
  });

  it('should handle empty text', () => {
    const result = analyzeSentiment('');
    expect(result.score).toBe(0);
    expect(result.label).toBe('neutral');
  });
});
