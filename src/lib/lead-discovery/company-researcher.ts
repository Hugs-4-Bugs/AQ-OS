// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Company Researcher
// AI-powered deep research on a company, identifying how the user's
// business can help them based on website gaps and niche context.
//
// Uses existing Z-AI infrastructure (executeAICompletion from
// ai-provider) and credit system (deductCredits from credit-service).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { executeAICompletion, type AICompletionRequest } from '@/lib/ai/ai-provider';
import { logAIAudit } from '@/lib/ai/ai-audit';
import { deductCredits, checkCreditSufficiency, type CreditAction } from '@/lib/credit-service';
import { logAuditEvent } from '@/lib/lead-audit';
import type { WebsiteScore } from '@/lib/lead-discovery/website-scorer';

// ===== TYPES =====

export interface UserProfile {
  name: string;          // e.g. "Acme Digital Agency"
  businessType: string;  // e.g. "digital agency", "web development"
  services: string;      // e.g. "web design, SEO, online booking systems"
  location: string;      // e.g. "London UK"
}

export interface LeadInput {
  id: string;
  userId: string;
  businessName: string;
  website?: string | null;
  niche?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  stage?: string;
  techStack?: string | null;
}

export interface ResearchChallenge {
  challenge: string;
  solution: string;
  value: string;
}

export interface CompanyResearchResult {
  companyDescription: string;
  challenges: ResearchChallenge[];
  approachAngle: string;
  leadTemperature: 'hot' | 'warm' | 'cold';
  leadScore: number;
  personalizedPitch: string;
  aiProvider: string;
  creditsDeducted: number;
  newCreditBalance: number;
}

// ===== CREDIT COST =====

const RESEARCH_CREDIT_COST = 5;
const RESEARCH_ACTION: CreditAction = 'deep_analysis';

// ===== MAIN EXPORT =====

/**
 * Research a company using AI to identify how the user's business
 * can help them. Uses the existing Z-AI infrastructure and credit system.
 *
 * Flow:
 * 1. Check credit sufficiency
 * 2. Deduct credits atomically
 * 3. Build structured prompt from lead + websiteScore + userProfile
 * 4. Call AI via executeAICompletion (same as lead-analysis-engine)
 * 5. Parse JSON response (fallback on parse failure)
 * 6. Update Lead record in DB (scores, metadata)
 * 7. Create LeadActivity record
 * 8. Return full research result
 */
export async function researchCompany(
  lead: LeadInput,
  websiteScore: WebsiteScore,
  userProfile: UserProfile
): Promise<CompanyResearchResult> {
  console.log(`[CompanyResearcher] Starting research for: ${lead.businessName} (leadId: ${lead.id})`);

  // ── STEP 1: Check credit sufficiency ────────────────────────────
  const sufficiency = await checkCreditSufficiency(lead.userId, RESEARCH_CREDIT_COST);
  if (!sufficiency.sufficient) {
    console.warn(`[CompanyResearcher] Insufficient credits for user ${lead.userId}: need ${RESEARCH_CREDIT_COST}, have ${sufficiency.balance}`);
    return buildFallbackResult(
      websiteScore,
      `Insufficient credits. Need ${RESEARCH_CREDIT_COST}, have ${sufficiency.balance}.`,
      0,
      sufficiency.balance
    );
  }

  // ── STEP 2: Deduct credits ──────────────────────────────────────
  const deduction = await deductCredits({
    userId: lead.userId,
    action: RESEARCH_ACTION,
    cost: RESEARCH_CREDIT_COST,
    referenceId: lead.id,
  });

  if (!deduction.success) {
    console.error(`[CompanyResearcher] Credit deduction failed: ${deduction.error}`);
    return buildFallbackResult(
      websiteScore,
      `Credit deduction failed: ${deduction.error}`,
      0,
      deduction.newBalance
    );
  }

  // ── STEP 3: Build structured prompt ─────────────────────────────
  const prompt = buildResearchPrompt(lead, websiteScore, userProfile);

  // ── STEP 4: Call AI via existing infrastructure ──────────────────
  const startTime = Date.now();

  const completionRequest: AICompletionRequest = {
    messages: [
      {
        role: 'system',
        content: 'You are a business development analyst. You research companies and identify how a service provider can help them. Always return valid JSON. No markdown formatting.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    config: {
      provider: 'z-ai' as const,
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 20000,
      retries: 1,
    },
  };

  // Log the request being sent (for debugging AI call failures)
  console.log(`[CompanyResearcher] Sending AI request — provider: z-ai, model: default, messages: ${completionRequest.messages.length}`);
  console.log(`[CompanyResearcher] System prompt (first 100 chars): ${completionRequest.messages[0]?.content?.slice(0, 100)}`);

  const result = await executeAICompletion(completionRequest, lead.userId, 'company_research');
  const latencyMs = Date.now() - startTime;

  // ── STEP 5: Log raw AI result & Parse AI response ───────────────
  console.log(`[CompanyResearcher] AI result received — success: ${result.success}, provider: ${result.provider}, model: ${result.model}, tokensUsed: ${result.tokensUsed}, latencyMs: ${result.latencyMs}, retries: ${result.retries}`);
  if (result.error) {
    console.error(`[CompanyResearcher] AI error detail: ${result.error}`);
  }
  if (result.content) {
    console.log(`[CompanyResearcher] Raw AI response (first 500 chars): ${result.content.slice(0, 500)}`);
  } else {
    console.warn(`[CompanyResearcher] AI response content is empty/null/undefined. Type: ${typeof result.content}, Value: ${JSON.stringify(result.content)}`);
  }

  let researchData: Omit<CompanyResearchResult, 'aiProvider' | 'creditsDeducted' | 'newCreditBalance'>;

  let usedProvider = result.provider;
  let creditsDeducted = RESEARCH_CREDIT_COST;
  let newCreditBalance = deduction.newBalance;

  if (!result.success || !result.content) {
    const isNetworkFailure = result.error?.includes('Network error') ||
      result.error?.includes('fetch failed') ||
      result.error?.includes('ConnectTimeout');

    if (!result.content) {
      console.error('[CompanyResearcher] AI provider returned null for company research — all providers failed');
    }

    console.error(
      `[CompanyResearcher] AI completion FAILED — provider: ${result.provider}, model: ${result.model}, ` +
      `retries: ${result.retries}, errorType: ${isNetworkFailure ? 'NETWORK' : 'API'}, error: ${result.error}`
    );
    console.error(`[CompanyResearcher] AI content was: ${result.content ? '"' + result.content.substring(0, 200) + '"' : 'null/empty'}`);
    // Refund credits on AI failure
    await deductCredits({
      userId: lead.userId,
      action: `${RESEARCH_ACTION}_refund` as CreditAction,
      cost: -RESEARCH_CREDIT_COST,
      referenceId: lead.id,
    });
    creditsDeducted = 0;
    // Update balance after refund
    const postRefund = await checkCreditSufficiency(lead.userId, 1);
    newCreditBalance = postRefund.balance;
    usedProvider = 'fallback';
    // Use fallback data but continue to update DB and create activity
    researchData = buildFallbackResearchData(websiteScore);
  } else {
    try {
      researchData = parseAIResponse(result.content, websiteScore);
    } catch (parseError) {
      console.error('[CompanyResearcher] JSON parse failed, using fallback:', parseError);
      console.error(`[CompanyResearcher] Raw AI content that failed parsing (first 500 chars): ${result.content.substring(0, 500)}`);
      researchData = buildFallbackResearchData(websiteScore);
      usedProvider = 'fallback';
    }
  }

  const fullResult: CompanyResearchResult = {
    ...researchData,
    aiProvider: usedProvider,
    creditsDeducted,
    newCreditBalance,
  };

  // ── STEP 6: Update Lead record in DB ────────────────────────────
  try {
    const researchMetadata = JSON.stringify({
      companyDescription: researchData.companyDescription,
      challenges: researchData.challenges,
      approachAngle: researchData.approachAngle,
      personalizedPitch: researchData.personalizedPitch,
      websiteScore: {
        overallScore: websiteScore.overallScore,
        seoScore: websiteScore.seoScore,
        gaps: websiteScore.gaps,
      },
      userProfile: {
        name: userProfile.name,
        services: userProfile.services,
      },
      researchedAt: new Date().toISOString(),
      aiProvider: usedProvider,
    });

    await db.lead.update({
      where: { id: lead.id },
      data: {
        replyScore: researchData.leadScore,
        scoreReasoning: JSON.stringify({
          temperature: researchData.leadTemperature,
          approachAngle: researchData.approachAngle,
          challenges: researchData.challenges.map((c) => c.challenge),
        }),
        digitalWeaknesses: websiteScore.gaps.join(', '),
        opportunityNotes: researchData.personalizedPitch,
        // Store full research in techStack JSON field
        techStack: researchMetadata,
      },
    });

    console.log(`[CompanyResearcher] Updated lead ${lead.id}: score=${researchData.leadScore} temp=${researchData.leadTemperature}`);
  } catch (dbError) {
    console.error(`[CompanyResearcher] Failed to update lead in DB:`, dbError);
    // Don't fail the whole operation — the research data is still valid
  }

  // ── STEP 7: Create LeadActivity record ──────────────────────────
  try {
    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'research_completed',
        description: `AI research completed: ${researchData.leadTemperature} lead (score: ${researchData.leadScore}/100). Approach: ${researchData.approachAngle}`,
        metadata: JSON.stringify({
          leadTemperature: researchData.leadTemperature,
          leadScore: researchData.leadScore,
          challengeCount: researchData.challenges.length,
          approachAngle: researchData.approachAngle,
          websiteScore: websiteScore.overallScore,
          aiProvider: usedProvider,
          latencyMs,
        }),
      },
    });

    console.log(`[CompanyResearcher] Created LeadActivity for lead ${lead.id}`);
  } catch (activityError) {
    console.error(`[CompanyResearcher] Failed to create LeadActivity:`, activityError);
    // Don't fail — activity logging is best-effort
  }

  // ── STEP 8: Audit logging ───────────────────────────────────────
  await logAuditEvent(lead.userId, 'lead_enriched', {
    leadId: lead.id,
    type: 'company_research',
    leadTemperature: researchData.leadTemperature,
    leadScore: researchData.leadScore,
    websiteScore: websiteScore.overallScore,
  });

  await logAIAudit({
    userId: lead.userId,
    action: 'ai_analysis_generated',
    resource: 'lead',
    resourceId: lead.id,
    details: {
      type: 'company_research',
      provider: result.provider,
      latencyMs,
      creditsDeducted: RESEARCH_CREDIT_COST,
      balance: deduction.newBalance,
    },
  });

  console.log(`[CompanyResearcher] Research complete for ${lead.businessName}: score=${researchData.leadScore} temp=${researchData.leadTemperature} latency=${latencyMs}ms`);

  return fullResult;
}

// ===== PROMPT BUILDER =====

/**
 * Truncate a string field to a maximum length to prevent oversized AI prompts.
 * Never pass raw HTML into AI prompts.
 */
function truncateField(value: string | null | undefined, maxLen: number = 500): string {
  if (!value) return '';
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen) + '...[truncated]';
}

/**
 * Build the structured AI prompt from lead data, website score, and user profile.
 * All string fields are truncated to 500 chars max to prevent oversized prompts.
 */
function buildResearchPrompt(
  lead: LeadInput,
  websiteScore: WebsiteScore,
  userProfile: UserProfile
): string {
  const gapsList = websiteScore.gaps.length > 0
    ? websiteScore.gaps.slice(0, 5).map(g => truncateField(g, 100)).join(', ')
    : 'No significant gaps identified';

  const location = [lead.city, lead.country].filter(Boolean).join(', ') || 'Unknown';

  return `You are a business development analyst. Research this company and identify how ${truncateField(userProfile.name)} offering ${truncateField(userProfile.services)} can help them.

Company: ${truncateField(lead.businessName)}
Website: ${truncateField(lead.website) || 'No website'}
Niche: ${truncateField(lead.niche) || 'Unknown'}
Location: ${truncateField(location)}
Website Score: ${websiteScore.overallScore}/100
Identified Gaps: ${gapsList}
Tech Stack: ${websiteScore.techStack.slice(0, 5).join(', ')}
Design Age: ${websiteScore.designAge}
Has SSL: ${websiteScore.hasSSL}
Mobile Friendly: ${websiteScore.isMobile}
Has Contact Info: ${websiteScore.hasContactInfo}
Has Online Booking: ${websiteScore.hasOnlineBooking}
SEO Score: ${websiteScore.seoScore}/100

Your Business: ${truncateField(userProfile.name)}
Business Type: ${truncateField(userProfile.businessType)}
Services You Offer: ${truncateField(userProfile.services)}
Your Location: ${truncateField(userProfile.location)}

Analyze:
1. What does this company do (2 sentences max)
2. What are their top 3 business challenges based on their niche and website quality
3. How specifically can ${userProfile.name} solve each challenge
4. What is the estimated value of solving these problems for them
5. What is the best angle to approach them (cost saving, revenue growth, competitive advantage, customer experience)
6. Rate this lead quality: hot/warm/cold based on gap severity

Return ONLY valid JSON:
{
  "companyDescription": string,
  "challenges": [{ "challenge": string, "solution": string, "value": string }],
  "approachAngle": string,
  "leadTemperature": "hot"|"warm"|"cold",
  "leadScore": number,
  "personalizedPitch": string
}`;
}

// ===== AI RESPONSE PARSER =====

/**
 * Parse the AI response JSON. Handles all common AI output formats:
 * - Response wrapped in ```json ... ``` code blocks
 * - Response with leading/trailing whitespace
 * - Response with a preamble sentence before the JSON object
 * - Response where JSON is embedded mid-text
 *
 * On parse failure, throws an error (caller catches and uses fallback).
 */
function parseAIResponse(
  content: string,
  websiteScore: WebsiteScore
): Omit<CompanyResearchResult, 'aiProvider' | 'creditsDeducted' | 'newCreditBalance'> {
  // LOG: Capture raw AI response BEFORE any processing (first 300 chars — permanent diagnostic log)
  console.log(`[CompanyResearcher:parseAIResponse] RAW input (first 300 chars): "${content.slice(0, 300)}"`);

  // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
  let cleaned = content.trim();
  const codeBlockMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (codeBlockMatch) {
    console.log('[CompanyResearcher:parseAIResponse] Stripped markdown code block wrapper');
    cleaned = codeBlockMatch[1].trim();
  } else if (cleaned.startsWith('```')) {
    // Fallback: strip opening/closing ticks if regex didn't match cleanly
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    console.log('[CompanyResearcher:parseAIResponse] Stripped markdown ticks (fallback)');
  }

  // Extract JSON object from anywhere in the response
  // This handles: preamble text, trailing commentary, multiple JSON objects
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[CompanyResearcher:parseAIResponse] No JSON object found in cleaned response');
    console.error(`[CompanyResearcher:parseAIResponse] Cleaned text (first 500 chars): "${cleaned.slice(0, 500)}"`);
    throw new Error('No JSON object found in AI response');
  }

  console.log(`[CompanyResearcher:parseAIResponse] Extracted JSON (first 300 chars): ${jsonMatch[0].slice(0, 300)}`);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error('[CompanyResearcher:parseAIResponse] JSON.parse failed on extracted text:', parseErr);
    console.error(`[CompanyResearcher:parseAIResponse] Text that failed to parse (first 500 chars): ${jsonMatch[0].slice(0, 500)}`);
    throw parseErr;
  }

  // Validate and normalize each field
  const companyDescription = typeof parsed.companyDescription === 'string' && parsed.companyDescription.trim()
    ? parsed.companyDescription.trim()
    : websiteScore.opportunityStatement;

  const challenges: ResearchChallenge[] = Array.isArray(parsed.challenges)
    ? parsed.challenges.slice(0, 3).map((c: Record<string, unknown>) => ({
        challenge: typeof c.challenge === 'string' ? c.challenge.trim() : 'Unknown challenge',
        solution: typeof c.solution === 'string' ? c.solution.trim() : 'Solution not identified',
        value: typeof c.value === 'string' ? c.value.trim() : 'Value not estimated',
      }))
    : [];

  // Ensure at least 1 challenge
  if (challenges.length === 0) {
    challenges.push({
      challenge: 'Poor digital presence based on website analysis',
      solution: 'Professional website redesign and optimization',
      value: 'Increased customer acquisition and brand trust',
    });
  }

  const validTemperatures = ['hot', 'warm', 'cold'] as const;
  const rawTemp = typeof parsed.leadTemperature === 'string' ? parsed.leadTemperature.toLowerCase().trim() : '';
  const leadTemperature: 'hot' | 'warm' | 'cold' =
    validTemperatures.includes(rawTemp as typeof validTemperatures[number]) ? rawTemp as 'hot' | 'warm' | 'cold' : 'warm';

  const leadScore = typeof parsed.leadScore === 'number'
    ? Math.min(100, Math.max(0, Math.round(parsed.leadScore)))
    : inferScoreFromTemperature(leadTemperature, websiteScore.overallScore);

  const approachAngle = typeof parsed.approachAngle === 'string' && parsed.approachAngle.trim()
    ? parsed.approachAngle.trim()
    : inferApproachAngle(websiteScore.gaps);

  const personalizedPitch = typeof parsed.personalizedPitch === 'string' && parsed.personalizedPitch.trim()
    ? parsed.personalizedPitch.trim()
    : websiteScore.opportunityStatement;

  return {
    companyDescription,
    challenges,
    approachAngle,
    leadTemperature,
    leadScore,
    personalizedPitch,
  };
}

// ===== FALLBACK BUILDERS =====

/**
 * Build a complete fallback result when AI fails entirely.
 * Uses websiteScore.opportunityStatement as companyDescription.
 */
function buildFallbackResult(
  websiteScore: WebsiteScore,
  errorReason: string,
  creditsDeducted: number,
  newCreditBalance: number
): CompanyResearchResult {
  const fallbackData = buildFallbackResearchData(websiteScore);

  return {
    ...fallbackData,
    aiProvider: 'fallback',
    creditsDeducted,
    newCreditBalance,
  };
}

/**
 * Build fallback research data from website score when AI response
 * cannot be parsed. Uses opportunityStatement for companyDescription.
 */
function buildFallbackResearchData(
  websiteScore: WebsiteScore
): Omit<CompanyResearchResult, 'aiProvider' | 'creditsDeducted' | 'newCreditBalance'> {
  const leadTemperature = inferTemperatureFromScore(websiteScore.overallScore);
  const leadScore = inferScoreFromTemperature(leadTemperature, websiteScore.overallScore);
  const approachAngle = inferApproachAngle(websiteScore.gaps);

  return {
    companyDescription: websiteScore.opportunityStatement,
    challenges: websiteScore.gaps.slice(0, 3).map((gap) => ({
      challenge: gap,
      solution: `Our services can address: ${gap.toLowerCase()}`,
      value: 'Improved digital presence and customer acquisition',
    })),
    approachAngle,
    leadTemperature,
    leadScore,
    personalizedPitch: websiteScore.opportunityStatement,
  };
}

// ===== INFERENCE HELPERS =====

/**
 * Infer lead temperature from website score.
 */
function inferTemperatureFromScore(overallScore: number): 'hot' | 'warm' | 'cold' {
  if (overallScore <= 30) return 'hot';  // Many gaps = hot opportunity
  if (overallScore <= 60) return 'warm';
  return 'cold';  // Few gaps = less urgent need
}

/**
 * Infer lead score from temperature and website score.
 */
function inferScoreFromTemperature(temperature: 'hot' | 'warm' | 'cold', websiteScore: number): number {
  switch (temperature) {
    case 'hot': return Math.min(100, Math.max(70, 100 - websiteScore));
    case 'warm': return Math.min(69, Math.max(40, 80 - websiteScore));
    case 'cold': return Math.min(39, Math.max(10, 50 - websiteScore));
  }
}

/**
 * Infer best approach angle from gaps.
 */
function inferApproachAngle(gaps: string[]): string {
  const gapLower = gaps.map((g) => g.toLowerCase());

  if (gapLower.some((g) => g.includes('mobile') || g.includes('ssl') || g.includes('outdated'))) {
    return 'competitive advantage';
  }
  if (gapLower.some((g) => g.includes('seo') || g.includes('analytics') || g.includes('booking'))) {
    return 'revenue growth';
  }
  if (gapLower.some((g) => g.includes('contact') || g.includes('social') || g.includes('booking'))) {
    return 'customer experience';
  }
  if (gapLower.some((g) => g.includes('website') || g.includes('no '))) {
    return 'cost saving';
  }

  return 'competitive advantage';
}
