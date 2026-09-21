// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Scoring Engine
// Phase 8: Multi-dimensional lead scoring with explainability
//
// Generates:
// - Lead quality score
// - Purchase probability
// - Outreach priority
// - Website quality
// - Digital maturity
// - AI confidence score
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { resolveLeadForExecution } from '@/lib/lead-resolution';
import { executeAICompletion, type AICompletionRequest, AI_CONFIG } from './ai-provider';
import { getPrompt, sanitizePromptInput } from './prompt-manager';
import { logScoreGenerated } from './ai-audit';
import { deductCredits, checkCreditSufficiency, refundCredits, type CreditAction } from '@/lib/credit-service';

// ===== TYPES =====

export interface ScoreLeadInput {
  leadId: string;
  userId: string;
  force?: boolean;
}

export interface LeadScores {
  leadQualityScore: number;
  purchaseProbability: number;
  outreachPriority: 'low' | 'medium' | 'high' | 'critical';
  websiteQualityScore: number;
  digitalMaturityScore: number;
  aiConfidenceScore: number;
  explanations: {
    leadQuality: string;
    purchaseProbability: string;
    outreachPriority: string;
    websiteQuality: string;
    digitalMaturity: string;
  };
  scoringFactors: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };
  refreshRecommendation: string;
}

export interface ScoreLeadResult {
  success: boolean;
  scores?: LeadScores;
  error?: string;
  creditsDeducted?: number;
  newBalance?: number;
}

// ===== CREDIT COST =====

const SCORING_CREDIT_COST = 3;
const SCORING_ACTION: CreditAction = 'deep_analysis';

// ===== CACHE =====

const SCORE_CACHE_HOURS = AI_CONFIG.scoringCacheHours;

// ===== MAIN SCORING FUNCTION =====

export async function scoreLead(input: ScoreLeadInput): Promise<ScoreLeadResult> {
  const { leadId, userId, force } = input;

  try {
    // 1. Check for cached scores
    if (!force) {
      const recentScores = await db.leadScore.findMany({
        where: { leadId, scoredAt: { gte: new Date(Date.now() - SCORE_CACHE_HOURS * 60 * 60 * 1000) } },
        orderBy: { scoredAt: 'desc' },
      });

      if (recentScores.length >= 4) {
        // Build cached response
        const scoreMap: Record<string, number> = {};
        for (const s of recentScores) {
          scoreMap[s.scoreType] = s.score;
        }

        return {
          success: true,
          scores: {
            leadQualityScore: scoreMap['reply'] || 0,
            purchaseProbability: scoreMap['conversion'] || 0,
            outreachPriority: scoreMap['urgency'] && scoreMap['urgency'] > 70 ? 'critical' : scoreMap['urgency'] && scoreMap['urgency'] > 50 ? 'high' : 'medium',
            websiteQualityScore: scoreMap['website_quality'] || 0,
            digitalMaturityScore: scoreMap['digital_maturity'] || 0,
            aiConfidenceScore: Math.round((Object.values(scoreMap).reduce((a: number, b: number) => a + b, 0) as number) / Math.max(Object.keys(scoreMap).length, 1)),
            explanations: {
              leadQuality: `Cached lead quality score: ${scoreMap['reply'] || 0}/100`,
              purchaseProbability: `Cached purchase probability: ${scoreMap['conversion'] || 0}/100`,
              outreachPriority: `Based on urgency score: ${scoreMap['urgency'] || 0}/100`,
              websiteQuality: `Cached website quality: ${scoreMap['website_quality'] || 0}/100`,
              digitalMaturity: `Cached digital maturity: ${scoreMap['digital_maturity'] || 0}/100`,
            },
            scoringFactors: { positive: ['Cached from previous scoring'], negative: [], neutral: [] },
            refreshRecommendation: `Re-score in ${AI_CONFIG.scoringCacheHours} hours for updated analysis`,
          },
          creditsDeducted: 0,
          newBalance: 0,
        };
      }
    }

    // 2. Get lead data — single reliable owner-scoped resolution path
    const resolution = await resolveLeadForExecution(userId, leadId);
    if (!resolution.ok) {
      return { success: false, error: resolution.userMessage };
    }
    const lead = resolution.lead;

    // 3. Check credits
    const sufficiency = await checkCreditSufficiency(userId, SCORING_CREDIT_COST);
    if (!sufficiency.sufficient) {
      return { success: false, error: `Insufficient credits. Need ${SCORING_CREDIT_COST}, have ${sufficiency.balance}` };
    }

    // 4. Deduct credits
    const deduction = await deductCredits({
      userId,
      action: SCORING_ACTION,
      cost: SCORING_CREDIT_COST,
      referenceId: leadId,
    });

    if (!deduction.success) {
      return { success: false, error: deduction.error || 'Failed to deduct credits' };
    }

    // 5. Build context
    const leadContext = [
      `Business: ${lead.businessName}`,
      lead.niche ? `Niche: ${lead.niche}` : '',
      lead.country ? `Country: ${lead.country}` : '',
      `Stage: ${lead.stage}`,
      `Current Scores: Reply=${lead.replyScore}, Conversion=${lead.conversionScore}, Urgency=${lead.urgencyScore}`,
      lead.website ? `Website: ${lead.website}` : '',
      lead.websiteQuality ? `Website Quality: ${lead.websiteQuality}` : '',
      lead.digitalWeaknesses ? `Weaknesses: ${lead.digitalWeaknesses}` : '',
      lead.rating ? `Rating: ${lead.rating}/5` : '',
      lead.techStack ? `Tech: ${lead.techStack}` : '',
    ].filter(Boolean).join('\n');

    // 6. Get scoring prompt
    const prompt = getPrompt('lead-scoring', {
      leadContext: sanitizePromptInput(leadContext),
      businessName: sanitizePromptInput(lead.businessName),
      niche: sanitizePromptInput(lead.niche || 'Unknown'),
    });

    // 7. Execute AI completion
    const completionRequest: AICompletionRequest = {
      messages: [
        { role: 'system', content: prompt.content },
        { role: 'user', content: `Score this lead comprehensively.` },
      ],
      config: {
        provider: 'z-ai',
        maxTokens: 2048,
        temperature: 0.5,
        timeout: 30000,
        retries: 2,
      },
    };

    const result = await executeAICompletion(completionRequest, userId, 'lead_scoring');

    if (!result.success || !result.content) {
      await refundCredits({ userId, amount: SCORING_CREDIT_COST, originalAction: SCORING_ACTION, referenceId: leadId });
      return { success: false, error: result.error || 'AI scoring failed' };
    }

    // 8. Parse response
    let scores: LeadScores;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      const parsed = JSON.parse(jsonMatch[0]);
      scores = {
        leadQualityScore: Math.min(100, Math.max(0, Number(parsed.leadQualityScore) || 0)),
        purchaseProbability: Math.min(100, Math.max(0, Number(parsed.purchaseProbability) || 0)),
        outreachPriority: ['low', 'medium', 'high', 'critical'].includes(parsed.outreachPriority) ? parsed.outreachPriority : 'medium',
        websiteQualityScore: Math.min(100, Math.max(0, Number(parsed.websiteQualityScore) || 0)),
        digitalMaturityScore: Math.min(100, Math.max(0, Number(parsed.digitalMaturityScore) || 0)),
        aiConfidenceScore: Math.min(100, Math.max(0, Number(parsed.aiConfidenceScore) || 70)),
        explanations: parsed.explanations || {
          leadQuality: 'AI-generated score',
          purchaseProbability: 'Based on analysis',
          outreachPriority: 'Based on urgency indicators',
          websiteQuality: 'Based on website analysis',
          digitalMaturity: 'Based on tech stack analysis',
        },
        scoringFactors: parsed.scoringFactors || { positive: [], negative: [], neutral: [] },
        refreshRecommendation: parsed.refreshRecommendation || 'Re-score in 24 hours',
      };
    } catch (parseError) {
      console.error('[ScoringEngine] Failed to parse:', parseError);
      await refundCredits({ userId, amount: SCORING_CREDIT_COST, originalAction: SCORING_ACTION, referenceId: leadId });
      return { success: false, error: 'Failed to parse AI scoring response' };
    }

    // 9. Store scores in database
    const scoreEntries = [
      { scoreType: 'reply', score: scores.leadQualityScore, explanation: scores.explanations.leadQuality },
      { scoreType: 'conversion', score: scores.purchaseProbability, explanation: scores.explanations.purchaseProbability },
      { scoreType: 'website_quality', score: scores.websiteQualityScore, explanation: scores.explanations.websiteQuality },
      { scoreType: 'digital_maturity', score: scores.digitalMaturityScore, explanation: scores.explanations.digitalMaturity },
    ];

    for (const entry of scoreEntries) {
      await db.leadScore.create({
        data: {
          leadId,
          scoreType: entry.scoreType,
          score: entry.score,
          explanation: entry.explanation,
          modelVersion: result.provider,
        },
      });
    }

    // 10. Update lead with new scores
    await db.lead.update({
      where: { id: leadId },
      data: {
        replyScore: scores.leadQualityScore,
        conversionScore: scores.purchaseProbability,
        urgencyScore: scores.outreachPriority === 'critical' ? 90 : scores.outreachPriority === 'high' ? 70 : scores.outreachPriority === 'medium' ? 40 : 20,
        revenuePotentialScore: scores.purchaseProbability,
        scoreReasoning: JSON.stringify({
          positive: scores.scoringFactors.positive.slice(0, 3),
          negative: scores.scoringFactors.negative.slice(0, 3),
          confidence: scores.aiConfidenceScore,
        }),
      },
    });

    // 11. Log audit
    await logScoreGenerated(userId, leadId, {
      scores: {
        leadQuality: scores.leadQualityScore,
        purchaseProbability: scores.purchaseProbability,
        websiteQuality: scores.websiteQualityScore,
        digitalMaturity: scores.digitalMaturityScore,
        confidence: scores.aiConfidenceScore,
      },
      provider: result.provider,
    });

    return {
      success: true,
      scores,
      creditsDeducted: SCORING_CREDIT_COST,
      newBalance: deduction.newBalance,
    };
  } catch (error) {
    console.error('[ScoringEngine] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Scoring failed' };
  }
}
