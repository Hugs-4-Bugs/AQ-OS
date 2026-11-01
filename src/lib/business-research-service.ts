// ═══════════════════════════════════════════════════════════════════
// Business Research Service
//
// Orchestrates deep research on the USER'S OWN business website(s).
// Reuses existing research infrastructure:
//   - website-scorer.ts (analyzeWebsite) for HTML/SEO analysis
//   - website-fetch.ts (fetchSiteBundle) for multi-page crawling
//   - ai-provider.ts (executeAICompletion) for AI-powered analysis
//   - credit-service.ts (deductCredits/refundCredits) for billing
//
// The research produces a ResearchSnapshot with structured business
// intelligence that feeds into the lead-intelligence composer for
// improved outreach personalization.
//
// Lifecycle: pending → running → completed | failed
// A failed research does NOT delete the last successful snapshot.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { deductCredits, refundCredits, checkCreditSufficiency } from '@/lib/credit-service';
import { executeAICompletion } from '@/lib/ai/ai-provider';

// Credit cost for user business research (same as deep_analysis = 5 credits)
const BUSINESS_RESEARCH_CREDIT_COST = 5;
const BUSINESS_RESEARCH_ACTION = 'deep_analysis';

export interface ResearchResult {
  success: boolean;
  snapshotId?: string;
  error?: string;
  creditsUsed?: number;
}

/**
 * Trigger research on a WebProperty.
 *
 * This is the main entry point. It:
 * 1. Verifies ownership (WebProperty belongs to user)
 * 2. Checks credit sufficiency
 * 3. Creates a ResearchSnapshot (status=pending)
 * 4. Charges credits (idempotent)
 * 5. Runs the research (website scoring + AI analysis)
 * 6. Persists structured intelligence to the snapshot
 * 7. Updates WebProperty.lastResearchedAt
 *
 * On failure, refunds credits and marks the snapshot as failed.
 * The previous successful snapshot remains available.
 */
export async function triggerBusinessResearch(
  userId: string,
  webPropertyId: string
): Promise<ResearchResult> {
  // 1. Verify ownership
  const webProperty = await db.webProperty.findFirst({
    where: { id: webPropertyId, userId, status: 'active' },
    include: {
      businessProfile: { select: { id: true, name: true, industry: true } },
    },
  });
  if (!webProperty) {
    return { success: false, error: 'Web property not found' };
  }

  // Check for in-flight research (idempotency — don't allow duplicate concurrent research)
  const inFlight = await db.researchSnapshot.findFirst({
    where: {
      webPropertyId,
      status: { in: ['pending', 'running'] },
    },
  });
  if (inFlight) {
    return { success: false, error: 'Research is already in progress for this web property' };
  }

  // 2. Check credit sufficiency
  const creditCheck = await checkCreditSufficiency(userId, BUSINESS_RESEARCH_CREDIT_COST);
  if (!creditCheck.sufficient) {
    return {
      success: false,
      error: `Insufficient credits: have ${creditCheck.balance}, need ${BUSINESS_RESEARCH_CREDIT_COST}`,
    };
  }

  // 3. Determine next research version
  const latestSnapshot = await db.researchSnapshot.findFirst({
    where: { webPropertyId },
    orderBy: { researchVersion: 'desc' },
    select: { researchVersion: true },
  });
  const nextVersion = (latestSnapshot?.researchVersion ?? 0) + 1;

  // 4. Create snapshot (pending)
  const snapshot = await db.researchSnapshot.create({
    data: {
      webPropertyId,
      userId,
      status: 'pending',
      researchVersion: nextVersion,
      creditsUsed: 0,
    },
  });

  // 5. Charge credits (idempotent — keyed by snapshot ID)
  const idempotencyKey = `business-research:${snapshot.id}`;
  const chargeResult = await deductCredits({
    userId,
    action: BUSINESS_RESEARCH_ACTION,
    cost: BUSINESS_RESEARCH_CREDIT_COST,
    referenceId: webPropertyId,
    idempotencyKey,
    description: `Business intelligence research for ${webProperty.url}`,
  });

  if (!chargeResult.success) {
    await db.researchSnapshot.update({
      where: { id: snapshot.id },
      data: { status: 'failed', errorMessage: chargeResult.error || 'Credit charge failed' },
    });
    return { success: false, error: chargeResult.error };
  }

  // 6. Run the research
  try {
    // Mark as running
    await db.researchSnapshot.update({
      where: { id: snapshot.id },
      data: { status: 'running', startedAt: new Date(), creditsUsed: BUSINESS_RESEARCH_CREDIT_COST },
    });

    // 6a. Fetch website content (reuse existing website-scorer)
    const websiteScore = await analyzeWebsiteForBusiness(webProperty.url, webProperty.businessProfile.name);

    // 6b. AI-powered deep analysis
    const aiResult = await executeBusinessAIResearch(webProperty, websiteScore);

    // 7. Persist structured intelligence
    await db.researchSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        companyDescription: aiResult.companyDescription,
        valueProposition: aiResult.valueProposition,
        targetAudience: aiResult.targetAudience,
        challenges: JSON.stringify(aiResult.challenges || []),
        differentiators: aiResult.differentiators,
        positioning: aiResult.positioning,
        acquisitionAngles: JSON.stringify(aiResult.acquisitionAngles || []),
        websiteQualityScore: websiteScore.overallScore,
        seoScore: websiteScore.seoScore,
        techStack: JSON.stringify(websiteScore.techStack || []),
        websiteGaps: JSON.stringify(websiteScore.gaps || []),
        swot: JSON.stringify(aiResult.swot || {}),
        pricingSignals: aiResult.pricingSignals ? JSON.stringify(aiResult.pricingSignals) : null,
        socialProfiles: aiResult.socialProfiles ? JSON.stringify(aiResult.socialProfiles) : null,
        sourceUrls: JSON.stringify([webProperty.url]),
        confidence: aiResult.confidence || 'medium',
        isObserved: false, // AI-generated analysis = inference
      },
    });

    // Update WebProperty lastResearchedAt
    await db.webProperty.update({
      where: { id: webPropertyId },
      data: { lastResearchedAt: new Date() },
    });

    return { success: true, snapshotId: snapshot.id, creditsUsed: BUSINESS_RESEARCH_CREDIT_COST };
  } catch (error: any) {
    // Mark as failed — do NOT delete the snapshot (preserve audit trail)
    // The previous successful snapshot remains available
    await db.researchSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error).slice(0, 2000),
      },
    });

    // Refund credits on failure
    await refundCredits({
      userId,
      amount: BUSINESS_RESEARCH_CREDIT_COST,
      originalAction: BUSINESS_RESEARCH_ACTION,
      idempotencyKey,
      description: `Refund: business research failed for ${webProperty.url}`,
    });

    return { success: false, error: 'Research failed', creditsUsed: 0 };
  }
}

/**
 * Get the latest successful ResearchSnapshot for a WebProperty.
 * Returns null if no successful research exists.
 */
export async function getLatestIntelligence(
  userId: string,
  webPropertyId: string
): Promise<any | null> {
  // Verify ownership
  const wp = await db.webProperty.findFirst({
    where: { id: webPropertyId, userId },
    select: { id: true },
  });
  if (!wp) return null;

  return db.researchSnapshot.findFirst({
    where: { webPropertyId, status: 'completed' },
    orderBy: { researchVersion: 'desc' },
  });
}

/**
 * Get all intelligence for a BusinessProfile (across all web properties).
 * Returns the latest successful snapshot per web property.
 */
export async function getBusinessIntelligence(
  userId: string,
  businessProfileId: string
): Promise<{ webProperties: any[]; intelligence: any[] }> {
  // Verify ownership
  const profile = await db.businessProfile.findFirst({
    where: { id: businessProfileId, userId },
    select: { id: true },
  });
  if (!profile) return { webProperties: [], intelligence: [] };

  const webProperties = await db.webProperty.findMany({
    where: { businessProfileId, userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });

  const intelligence = await Promise.all(
    webProperties.map(async (wp) => {
      const snapshot = await getLatestIntelligence(userId, wp.id);
      return { webProperty: wp, snapshot };
    })
  );

  return { webProperties, intelligence };
}

// ═══════════════════════════════════════════════════════════════════
// Internal: Website analysis (reuses website-scorer.ts)
// ═══════════════════════════════════════════════════════════════════

async function analyzeWebsiteForBusiness(url: string, companyName: string): Promise<{
  overallScore: number;
  seoScore: number;
  techStack: string[];
  gaps: string[];
}> {
  try {
    // Dynamically import to avoid loading cheerio at module init
    const { analyzeWebsite } = await import('@/lib/lead-discovery/website-scorer');
    const score = await analyzeWebsite(url, companyName, 'business');
    return {
      overallScore: score.overallScore,
      seoScore: score.seoScore,
      techStack: score.techStack,
      gaps: score.gaps,
    };
  } catch {
    // If website scoring fails, return neutral defaults
    return { overallScore: 0, seoScore: 0, techStack: [], gaps: ['Website analysis failed'] };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Internal: AI-powered business research
// Uses executeAICompletion (the canonical AI provider abstraction)
// ═══════════════════════════════════════════════════════════════════

interface BusinessAIResult {
  companyDescription: string;
  valueProposition: string;
  targetAudience: string;
  challenges: string[];
  differentiators: string;
  positioning: string;
  acquisitionAngles: string[];
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  pricingSignals?: any;
  socialProfiles?: any;
  confidence: string;
}

async function executeBusinessAIResearch(
  webProperty: any,
  websiteScore: { overallScore: number; seoScore: number; techStack: string[]; gaps: string[] }
): Promise<BusinessAIResult> {
  const prompt = buildResearchPrompt(webProperty, websiteScore);

  const request = {
    messages: [
      {
        role: 'system' as const,
        content: 'You are a business intelligence analyst. Analyze the provided website information and extract structured business intelligence. Return ONLY valid JSON.',
      },
      {
        role: 'user' as const,
        content: prompt,
      },
    ],
    config: {
      provider: 'z-ai',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 30000,
      retries: 1,
    },
  };

  const aiResponse = await executeAICompletion(request, webProperty.userId, 'business_research');

  // Parse the AI response as JSON
  const content = aiResponse.content || aiResponse.text || '';
  let parsed: BusinessAIResult;
  try {
    // Try to extract JSON from the response (may be wrapped in markdown code block)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch {
    // Fallback: use the raw content as description
    parsed = {
      companyDescription: content.slice(0, 2000),
      valueProposition: '',
      targetAudience: '',
      challenges: [],
      differentiators: '',
      positioning: '',
      acquisitionAngles: [],
      swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      confidence: 'low',
    };
  }

  return parsed;
}

function buildResearchPrompt(
  webProperty: { url: string; businessProfile: { name: string; industry?: string } },
  websiteScore: { overallScore: number; seoScore: number; techStack: string[]; gaps: string[] }
): string {
  return `Analyze this business website and extract structured business intelligence.

Website URL: ${webProperty.url}
Business Name: ${webProperty.businessProfile.name}
Industry: ${webProperty.businessProfile.industry || 'Unknown'}

Website Quality Score: ${websiteScore.overallScore}/100
SEO Score: ${websiteScore.seoScore}/100
Detected Technology Stack: ${websiteScore.techStack.join(', ') || 'None detected'}
Website Gaps: ${websiteScore.gaps.join('; ') || 'None identified'}

Based on this information, extract the following business intelligence as JSON:
{
  "companyDescription": "What the business does (2-3 sentences)",
  "valueProposition": "Their core value proposition",
  "targetAudience": "Who they appear to target",
  "challenges": ["Likely business challenges based on website gaps"],
  "differentiators": "What makes them stand out",
  "positioning": "Their market positioning",
  "acquisitionAngles": ["Recommended angles for acquiring their customers"],
  "swot": {
    "strengths": ["Website/business strengths"],
    "weaknesses": ["Website/business weaknesses"],
    "opportunities": ["Growth opportunities visible from their web presence"],
    "threats": ["Potential threats to their business"]
  },
  "confidence": "high|medium|low"
}`;
}
