/**
 * Universal AI outreach personalization tests (Stage C)
 *
 * Verifies the context-driven system end to end at the unit level:
 *  - the v4 outreach prompt is industry-neutral and contains the honesty
 *    rules (no invented gaps, no forced website-audit template);
 *  - buildBusinessContextBlock renders a wellness sender DIFFERENTLY from a
 *    software sender — the pitch follows the profile, not a default;
 *  - generateOutreach threads businessProfileId + campaign overrides into
 *    the resolved context and stores them on the message metadata;
 *  - the discovery search-query builder becomes offer-aware when a campaign
 *    override exists (and stays unchanged otherwise).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    businessProfile: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    lead: { findUnique: vi.fn(), findFirst: vi.fn() },
    outreachMessage: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  executeAICompletion: vi.fn(),
  deductCredits: vi.fn(),
  checkCreditSufficiency: vi.fn(),
  refundCredits: vi.fn(),
  logOutreachGenerated: vi.fn(),
  resolveLeadForExecution: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/ai/ai-provider', () => ({ executeAICompletion: mocks.executeAICompletion, AI_CONFIG: {} }));
vi.mock('@/lib/credit-service', () => ({
  deductCredits: mocks.deductCredits,
  checkCreditSufficiency: mocks.checkCreditSufficiency,
  refundCredits: mocks.refundCredits,
  // lead-discovery-service reads CREDIT_COSTS at module scope.
  CREDIT_COSTS: { lead_discovery: 1, deep_analysis: 5, outreach_message: 2 },
}));
vi.mock('@/lib/ai/ai-audit', () => ({ logOutreachGenerated: mocks.logOutreachGenerated }));

import { getPrompt } from '@/lib/ai/prompt-manager';
import { generateOutreach } from '@/lib/ai/outreach-generator';
import { buildBusinessContextBlock, type ResolvedBusinessContext } from '@/lib/business-profile';
import { buildSearchQueries } from '@/lib/lead-discovery-service';

const wellnessProfile = {
  id: 'prof-wellness',
  userId: 'u1',
  label: 'Serenity Wellness',
  companyName: 'Serenity Wellness Ltd',
  industry: 'Health & Wellness',
  website: 'https://serenity.example',
  description: 'Corporate wellness and physiotherapy programs for clinics and offices',
  valueProposition: 'Healthier staff, fewer sick days',
  productsServices: JSON.stringify([{ name: 'Corporate massage packages', description: 'On-site for offices' }]),
  targetAudience: JSON.stringify({ industries: ['hospitals', 'corporate offices'], roles: ['HR managers'], icp: 'mid-size clinics' }),
  serviceAreas: JSON.stringify(['Mumbai', 'Pune']),
  goals: 'Book 5 intro calls per week with clinic owners',
  toneStyle: 'warm, professional',
  language: 'English',
  differentiators: JSON.stringify(['12 years', '40+ clinics served']),
  preferredCta: 'book a 15-minute intro call',
  additionalContext: 'Never quote prices in the first message',
  isDefault: true,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const softwareProfile = {
  ...wellnessProfile,
  id: 'prof-software',
  label: 'DevStack',
  companyName: 'DevStack Software',
  industry: 'Software',
  description: 'Custom CRM software for distributors',
  productsServices: JSON.stringify([{ name: 'Distribution CRM', description: 'Inventory + sales pipeline' }]),
  targetAudience: JSON.stringify({ industries: ['wholesale distributors'], roles: ['operations heads'] }),
  preferredCta: 'watch a 5-minute product demo',
};

const baseLead = {
  id: 'lead-1',
  userId: 'u1',
  businessName: 'City General Hospital',
  ownerName: 'Dr. Rao',
  niche: 'Healthcare',
  country: 'India',
  city: 'Mumbai',
  stage: 'discovered',
  website: 'https://citygeneral.example',
  digitalWeaknesses: null,
  opportunityNotes: null,
  bestChannel: null,
  outreachStyle: null,
  scoreReasoning: null,
  replyScore: 10,
  conversionScore: 20,
  urgencyScore: 5,
  lastContactedAt: null,
  outreachMessages: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.lead.findFirst.mockResolvedValue(baseLead);
  mocks.db.businessProfile.findFirst.mockReset();
  mocks.checkCreditSufficiency.mockResolvedValue({ sufficient: true, balance: 100 });
  mocks.deductCredits.mockResolvedValue({ success: true, newBalance: 98 });
  mocks.refundCredits.mockResolvedValue({ success: true });
  mocks.logOutreachGenerated.mockResolvedValue(undefined);
  mocks.resolveLeadForExecution.mockResolvedValue({ ok: true, lead: baseLead });
  mocks.executeAICompletion.mockResolvedValue({
    success: true,
    provider: 'z-ai',
    content: JSON.stringify({
      subject: 'Partnership question for City General',
      body: 'Hello Dr. Rao, ...',
      callToAction: 'book a call',
      followUpSuggestion: 'nudge in a week',
      personalizationPoints: ['City General Hospital'],
      toneAnalysis: 'professional',
      estimatedReplyRate: 40,
      alternativeVersions: { formal: 'x', casual: 'y', urgent: 'z' },
    }),
  });
  mocks.db.outreachMessage.create.mockResolvedValue({});
});

describe('v4 outreach prompt (universal, honest)', () => {
  it('uses the sender business block and forbids invented gaps and forced web-dev pitches', () => {
    const prompt = getPrompt('outreach-generation', {
      leadContext: 'Business: City General Hospital',
      businessName: 'City General Hospital',
      ownerName: 'Dr. Rao',
      niche: 'Healthcare',
      channel: 'email',
      tone: 'professional',
      language: 'English',
      previousMessage: '',
      daysSinceLastContact: 'Never contacted',
      senderSignature: '— Serenity Wellness',
      senderBusiness: '=== SENDER BUSINESS CONTEXT ===\nBusiness name: Serenity Wellness Ltd',
      campaignContext: '',
    });

    expect(prompt.content).toContain('SENDER BUSINESS CONTEXT');
    expect(prompt.content).toContain('ANY industry');
    expect(prompt.content).toContain('Do NOT claim the recipient has website problems');
    expect(prompt.content).toContain('Do NOT force the message into a website-audit or software-sales template');
    expect(prompt.content).toContain('Do NOT invent relationships, prior conversations, customer results, statistics');
  });
});

describe('buildBusinessContextBlock follows the sender profile (any industry)', () => {
  it('a wellness sender offers wellness services — not website development', () => {
    const ctx: ResolvedBusinessContext = {
      profileId: 'prof-wellness', label: 'Serenity Wellness', companyName: 'Serenity Wellness Ltd',
      industry: 'Health & Wellness', website: 'https://serenity.example',
      description: 'Corporate wellness and physiotherapy programs',
      valueProposition: '', productsServices: [{ name: 'Corporate massage packages', description: 'On-site for offices' }],
      targetAudience: 'industries: hospitals, corporate offices', serviceAreas: 'Mumbai, Pune',
      goals: 'Book 5 intro calls per week', tone: 'warm, professional', language: 'English',
      differentiators: ['12 years'], preferredCta: 'book a 15-minute intro call',
      additionalContext: '', overriddenFields: [], sources: {},
    };
    const block = buildBusinessContextBlock(ctx);
    expect(block).toContain('Corporate massage packages');
    expect(block.toLowerCase()).not.toContain('website redesign');
    expect(block.toLowerCase()).not.toContain('web development');
  });

  it('a software sender offers its actual software', () => {
    const ctx: ResolvedBusinessContext = {
      profileId: 'prof-software', label: 'DevStack', companyName: 'DevStack Software',
      industry: 'Software', website: '', description: 'Custom CRM software for distributors',
      valueProposition: '', productsServices: [{ name: 'Distribution CRM', description: 'Inventory + sales pipeline' }],
      targetAudience: 'industries: wholesale distributors', serviceAreas: '', goals: '', tone: '', language: '',
      differentiators: [], preferredCta: 'watch a 5-minute product demo', additionalContext: '',
      overriddenFields: [], sources: {},
    };
    const block = buildBusinessContextBlock(ctx);
    expect(block).toContain('Distribution CRM');
    expect(block).toContain('watch a 5-minute product demo');
  });
});

describe('generateOutreach threads profile + campaign overrides', () => {
  it('stores businessProfileId + campaign overrides in message metadata and uses campaign tone', async () => {
    mocks.db.businessProfile.findFirst.mockResolvedValue(wellnessProfile);

    const result = await generateOutreach({
      leadId: 'lead-1',
      userId: 'u1',
      channel: 'email',
      tone: 'professional',
      businessProfileId: 'prof-wellness',
      campaignOverrides: { objective: 'Fill December slots', tone: 'direct', cta: 'reply with a slot' },
    });

    expect(result.success).toBe(true);

    // Campaign overrides applied: the prompt saw the override tone.
    const sysCall = mocks.executeAICompletion.mock.calls[0][0].messages[0].content;
    expect(sysCall).toContain('Serenity Wellness Ltd'); // sender context present
    expect(sysCall).toContain('Corporate massage packages');
    expect(sysCall).toContain('Fill December slots'); // objective override
    expect(sysCall).toContain('reply with a slot'); // cta override

    // Message persisted with provenance of which profile/campaign ran.
    const persisted = mocks.db.outreachMessage.create.mock.calls[0][0].data;
    const meta = JSON.parse(persisted.metadata);
    expect(meta.businessProfileId).toBe('prof-wellness');
    expect(meta.campaignOverrides.objective).toBe('Fill December slots');
    expect(meta.tone).toBe('direct');
  });

  it('a foreign profile id never leaks another user\'s data (falls back to own default)', async () => {
    // First lookup: foreign id scoped by u1 → miss. Second: own default → hit.
    mocks.db.businessProfile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(wellnessProfile);

    const result = await generateOutreach({
      leadId: 'lead-1', userId: 'u1', channel: 'email',
      businessProfileId: 'someone-elses-profile',
    });

    expect(result.success).toBe(true);
    const secondCall = mocks.db.businessProfile.findFirst.mock.calls[1][0];
    expect(secondCall.where.userId).toBe('u1'); // ownership enforced server-side
  });
});

describe('discovery search queries become offer-aware with campaign context', () => {
  it('adds an intent-driven query when a campaign offer/audience override exists', () => {
    const queries = buildSearchQueries({
      niche: 'hospitals',
      country: 'India',
      city: 'Mumbai',
      source: 'ai_search',
      campaign: { audience: 'hospital HR departments' },
    });
    expect(queries[0]).toContain('hospitals businesses serving hospital HR departments');
    expect(queries[0]).toContain('Mumbai, India');
  });

  it('without campaign context the queries are exactly as before (no behavior change)', () => {
    const queries = buildSearchQueries({ niche: 'hospitals', country: 'India', city: 'Mumbai', source: 'ai_search' });
    expect(queries[0]).toBe('hospitals businesses in Mumbai, India');
    expect(queries.some((q) => q.includes('serving'))).toBe(false);
  });
});
