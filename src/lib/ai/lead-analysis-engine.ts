// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Analysis Engine
// Phase 8: AI-powered comprehensive lead analysis
//
// Inputs: website, socials, niche, reviews, ratings, tech, revenue, stage
// Outputs: lead score, opportunity score, outreach strategy, strengths,
//          weaknesses, website analysis, tech analysis, recommendations
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { executeAICompletion, type AICompletionRequest, AI_CONFIG } from './ai-provider';
import { getPrompt, sanitizePromptInput } from './prompt-manager';
import { logAnalysisGenerated, logAIAudit } from './ai-audit';
import { deductCredits, checkCreditSufficiency, type CreditAction } from '@/lib/credit-service';

// ===== TYPES =====

export interface LeadAnalysisInput {
  leadId: string;
  userId: string;
  force?: boolean; // Force re-analysis even if recent analysis exists
}

export interface LeadAnalysisOutput {
  leadScore: number;
  opportunityScore: number;
  outreachStrategy: string;
  strengths: string[];
  weaknesses: string[];
  websiteAnalysis: {
    quality: string;
    issues: string[];
    recommendations: string[];
  };
  techAnalysis: {
    stack: string[];
    maturity: string;
    gaps: string[];
  };
  recommendations: string[];
  purchaseProbability: number;
  outreachPriority: string;
  estimatedDealSize: string;
  bestApproach: string;
  keyPainPoints: string[];
  aiProvider: string;
  analysisVersion: number;
}

export interface LeadAnalysisResult {
  success: boolean;
  analysis?: LeadAnalysisOutput;
  error?: string;
  creditsDeducted?: number;
  newBalance?: number;
}

// ===== CREDIT COST =====

const ANALYSIS_CREDIT_COST = 5;
const ANALYSIS_ACTION: CreditAction = 'deep_analysis';

// ===== CACHE DURATION =====

const ANALYSIS_CACHE_HOURS = AI_CONFIG.analysisCacheHours;

// ===== BUILD LEAD CONTEXT =====

function buildLeadContext(lead: {
  businessName: string;
  ownerName?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  niche?: string | null;
  city?: string | null;
  country?: string | null;
  rating?: number | null;
  reviews?: string | null;
  stage: string;
  replyScore: number;
  conversionScore: number;
  urgencyScore: number;
  revenuePotentialScore: number;
  websiteQuality?: string | null;
  digitalWeaknesses?: string | null;
  techStack?: string | null;
  opportunityNotes?: string | null;
  bestContactPerson?: string | null;
  bestChannel?: string | null;
  outreachStyle?: string | null;
  estimatedQuality?: string | null;
  estimatedRevenue?: string | null;
  scoreReasoning?: string | null;
  tags: string;
}): string {
  const parts: string[] = [
    `Business: ${lead.businessName}`,
    lead.ownerName ? `Owner: ${lead.ownerName}` : '',
    lead.website ? `Website: ${lead.website}` : '',
    lead.niche ? `Niche: ${lead.niche}` : '',
    lead.city || lead.country ? `Location: ${[lead.city, lead.country].filter(Boolean).join(', ')}` : '',
    `Stage: ${lead.stage}`,
    `Scores: Reply=${lead.replyScore}, Conversion=${lead.conversionScore}, Urgency=${lead.urgencyScore}, Revenue=${lead.revenuePotentialScore}`,
    lead.rating ? `Rating: ${lead.rating}/5` : '',
    lead.reviews ? `Reviews: ${lead.reviews}` : '',
    lead.websiteQuality ? `Website Quality: ${lead.websiteQuality}` : '',
    lead.digitalWeaknesses ? `Digital Weaknesses: ${lead.digitalWeaknesses}` : '',
    lead.techStack ? `Tech Stack: ${lead.techStack}` : '',
    lead.opportunityNotes ? `Opportunity: ${lead.opportunityNotes}` : '',
    lead.bestContactPerson ? `Best Contact: ${lead.bestContactPerson}` : '',
    lead.bestChannel ? `Best Channel: ${lead.bestChannel}` : '',
    lead.outreachStyle ? `Outreach Style: ${lead.outreachStyle}` : '',
    lead.estimatedQuality ? `Estimated Quality: ${lead.estimatedQuality}` : '',
    lead.estimatedRevenue ? `Estimated Revenue: ${lead.estimatedRevenue}` : '',
    lead.scoreReasoning ? `Score Reasoning: ${lead.scoreReasoning}` : '',
    lead.email ? `Email: ${lead.email}` : '',
    lead.phone ? `Phone: ${lead.phone}` : '',
    lead.linkedin ? `LinkedIn: ${lead.linkedin}` : '',
    lead.instagram ? `Instagram: ${lead.instagram}` : '',
    lead.facebook ? `Facebook: ${lead.facebook}` : '',
  ];

  return parts.filter(Boolean).join('\n');
}

// ===== MAIN ANALYSIS FUNCTION =====

/**
 * Analyze a lead using AI.
 * - Checks credit sufficiency
 * - Deducts credits atomically
 * - Builds context from lead data
 * - Executes AI completion with failover
 * - Stores results in LeadAnalysis table
 * - Updates lead scores
 * - Logs audit events
 */
export async function analyzeLead(input: LeadAnalysisInput): Promise<LeadAnalysisResult> {
  const { leadId, userId, force } = input;

  try {
    // 1. Check for existing recent analysis (unless forced)
    if (!force) {
      const existing = await db.leadAnalysis.findUnique({
        where: { leadId },
      });

      if (existing) {
        const hoursSinceUpdate = (Date.now() - existing.updatedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceUpdate < ANALYSIS_CACHE_HOURS) {
          // Return cached analysis
          return {
            success: true,
            analysis: {
              leadScore: existing.replyScore,
              opportunityScore: existing.dealConversionScore,
              outreachStrategy: existing.closingStrategy || '',
              strengths: existing.recommendedServices ? JSON.parse(existing.recommendedServices) : [],
              weaknesses: existing.weaknesses ? JSON.parse(existing.weaknesses) : [],
              websiteAnalysis: {
                quality: 'average',
                issues: [],
                recommendations: [],
              },
              techAnalysis: {
                stack: [],
                maturity: existing.digitalMaturityScore > 60 ? 'advanced' : existing.digitalMaturityScore > 30 ? 'intermediate' : 'basic',
                gaps: [],
              },
              recommendations: [],
              purchaseProbability: existing.dealConversionScore,
              outreachPriority: existing.urgencyScore > 70 ? 'critical' : existing.urgencyScore > 50 ? 'high' : existing.urgencyScore > 25 ? 'medium' : 'low',
              estimatedDealSize: existing.estimatedDealValueUsd || 'Unknown',
              bestApproach: existing.bestContactTime || '',
              keyPainPoints: [],
              aiProvider: 'cached',
              analysisVersion: existing.analysisVersion,
            },
            creditsDeducted: 0,
            newBalance: 0,
          };
        }
      }
    }

    // 2. Get lead data
    const lead = await db.lead.findUnique({
      where: { id: leadId, isActive: true },
    });

    if (!lead) {
      return { success: false, error: 'Lead not found' };
    }

    // 3. Check credit sufficiency
    const sufficiency = await checkCreditSufficiency(userId, ANALYSIS_CREDIT_COST);
    if (!sufficiency.sufficient) {
      return {
        success: false,
        error: `Insufficient credits. Need ${ANALYSIS_CREDIT_COST}, have ${sufficiency.balance}`,
      };
    }

    // 4. Deduct credits
    const deduction = await deductCredits({
      userId,
      action: ANALYSIS_ACTION,
      cost: ANALYSIS_CREDIT_COST,
      referenceId: leadId,
    });

    if (!deduction.success) {
      return { success: false, error: deduction.error || 'Failed to deduct credits' };
    }

    // 5. Build prompt with lead context
    const leadContext = buildLeadContext(lead);
    const prompt = getPrompt('lead-analysis', {
      leadContext: sanitizePromptInput(leadContext),
      businessName: sanitizePromptInput(lead.businessName),
      niche: sanitizePromptInput(lead.niche || 'Unknown'),
      country: sanitizePromptInput(lead.country || 'Unknown'),
      stage: sanitizePromptInput(lead.stage),
      scores: `Reply=${lead.replyScore}, Conversion=${lead.conversionScore}, Urgency=${lead.urgencyScore}, Revenue=${lead.revenuePotentialScore}`,
    });

    // 6. Execute AI completion
    const startTime = Date.now();
    const completionRequest: AICompletionRequest = {
      messages: [
        { role: 'system', content: prompt.content },
        { role: 'user', content: `Analyze this lead: ${lead.businessName}` },
      ],
      config: {
        provider: 'z-ai',
        maxTokens: 4096,
        temperature: 0.7,
        timeout: 45000,
        retries: 2,
      },
    };

    const result = await executeAICompletion(completionRequest, userId, 'lead_analysis');
    const latencyMs = Date.now() - startTime;

    if (!result.success || !result.content) {
      // Refund credits on failure
      await deductCredits({ userId, action: `${ANALYSIS_ACTION}_refund` as CreditAction, cost: -ANALYSIS_CREDIT_COST, referenceId: leadId });
      return { success: false, error: result.error || 'AI analysis failed' };
    }

    // 7. Parse AI response
    let analysisData: LeadAnalysisOutput;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      const parsed = JSON.parse(jsonMatch[0]);
      analysisData = {
        leadScore: Math.min(100, Math.max(0, Number(parsed.leadScore) || 0)),
        opportunityScore: Math.min(100, Math.max(0, Number(parsed.opportunityScore) || 0)),
        outreachStrategy: String(parsed.outreachStrategy || ''),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
        websiteAnalysis: parsed.websiteAnalysis || { quality: 'average', issues: [], recommendations: [] },
        techAnalysis: parsed.techAnalysis || { stack: [], maturity: 'basic', gaps: [] },
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
        purchaseProbability: Math.min(100, Math.max(0, Number(parsed.purchaseProbability) || 0)),
        outreachPriority: ['low', 'medium', 'high', 'critical'].includes(parsed.outreachPriority) ? parsed.outreachPriority : 'medium',
        estimatedDealSize: String(parsed.estimatedDealSize || 'Unknown'),
        bestApproach: String(parsed.bestApproach || ''),
        keyPainPoints: Array.isArray(parsed.keyPainPoints) ? parsed.keyPainPoints.map(String) : [],
        aiProvider: result.provider,
        analysisVersion: 1,
      };
    } catch (parseError) {
      console.error('[LeadAnalysis] Failed to parse AI response:', parseError);
      // Refund credits
      await deductCredits({ userId, action: `${ANALYSIS_ACTION}_refund` as CreditAction, cost: -ANALYSIS_CREDIT_COST, referenceId: leadId });
      return { success: false, error: 'Failed to parse AI analysis' };
    }

    // 8. Store analysis in database
    const existingAnalysis = await db.leadAnalysis.findUnique({ where: { leadId } });

    if (existingAnalysis) {
      await db.leadAnalysis.update({
        where: { leadId },
        data: {
          replyScore: analysisData.leadScore,
          dealConversionScore: analysisData.opportunityScore,
          urgencyScore: analysisData.outreachPriority === 'critical' ? 90 : analysisData.outreachPriority === 'high' ? 70 : analysisData.outreachPriority === 'medium' ? 40 : 20,
          revenuePotentialScore: analysisData.purchaseProbability,
          scoreExplanations: JSON.stringify(analysisData.recommendations),
          weaknesses: JSON.stringify(analysisData.weaknesses),
          recommendedServices: JSON.stringify(analysisData.strengths),
          closingStrategy: analysisData.outreachStrategy,
          bestContactTime: analysisData.bestApproach,
          analysisVersion: { increment: 1 },
          websiteQualityScore: analysisData.websiteAnalysis ? (analysisData.websiteAnalysis.quality === 'excellent' ? 90 : analysisData.websiteAnalysis.quality === 'good' ? 70 : analysisData.websiteAnalysis.quality === 'average' ? 50 : analysisData.websiteAnalysis.quality === 'poor' ? 30 : 10) : 0,
          digitalMaturityScore: analysisData.techAnalysis?.maturity === 'advanced' ? 80 : analysisData.techAnalysis?.maturity === 'intermediate' ? 50 : analysisData.techAnalysis?.maturity === 'basic' ? 25 : 0,
          outreachMessages: JSON.stringify({
            bestApproach: analysisData.bestApproach,
            keyPainPoints: analysisData.keyPainPoints,
            estimatedDealSize: analysisData.estimatedDealSize,
          }),
        },
      });
    } else {
      await db.leadAnalysis.create({
        data: {
          leadId,
          replyScore: analysisData.leadScore,
          dealConversionScore: analysisData.opportunityScore,
          urgencyScore: analysisData.outreachPriority === 'critical' ? 90 : analysisData.outreachPriority === 'high' ? 70 : analysisData.outreachPriority === 'medium' ? 40 : 20,
          revenuePotentialScore: analysisData.purchaseProbability,
          scoreExplanations: JSON.stringify(analysisData.recommendations),
          weaknesses: JSON.stringify(analysisData.weaknesses),
          recommendedServices: JSON.stringify(analysisData.strengths),
          closingStrategy: analysisData.outreachStrategy,
          bestContactTime: analysisData.bestApproach,
          analysisVersion: 1,
          websiteQualityScore: analysisData.websiteAnalysis ? (analysisData.websiteAnalysis.quality === 'excellent' ? 90 : analysisData.websiteAnalysis.quality === 'good' ? 70 : analysisData.websiteAnalysis.quality === 'average' ? 50 : analysisData.websiteAnalysis.quality === 'poor' ? 30 : 10) : 0,
          digitalMaturityScore: analysisData.techAnalysis?.maturity === 'advanced' ? 80 : analysisData.techAnalysis?.maturity === 'intermediate' ? 50 : analysisData.techAnalysis?.maturity === 'basic' ? 25 : 0,
          outreachMessages: JSON.stringify({
            bestApproach: analysisData.bestApproach,
            keyPainPoints: analysisData.keyPainPoints,
            estimatedDealSize: analysisData.estimatedDealSize,
          }),
        },
      });
    }

    // 9. Update lead scores
    await db.lead.update({
      where: { id: leadId },
      data: {
        replyScore: analysisData.leadScore,
        conversionScore: analysisData.opportunityScore,
        urgencyScore: analysisData.outreachPriority === 'critical' ? 90 : analysisData.outreachPriority === 'high' ? 70 : analysisData.outreachPriority === 'medium' ? 40 : 20,
        revenuePotentialScore: analysisData.purchaseProbability,
        scoreReasoning: JSON.stringify(analysisData.recommendations.slice(0, 3)),
        bestChannel: analysisData.outreachStrategy,
        outreachStyle: analysisData.outreachPriority,
      },
    });

    // 10. Create lead scores entries
    const scoreTypes = [
      { type: 'reply', score: analysisData.leadScore },
      { type: 'conversion', score: analysisData.opportunityScore },
      { type: 'urgency', score: analysisData.outreachPriority === 'critical' ? 90 : analysisData.outreachPriority === 'high' ? 70 : 40 },
      { type: 'revenue_potential', score: analysisData.purchaseProbability },
      { type: 'website_quality', score: analysisData.websiteAnalysis?.quality === 'excellent' ? 90 : analysisData.websiteAnalysis?.quality === 'good' ? 70 : 50 },
      { type: 'digital_maturity', score: analysisData.techAnalysis?.maturity === 'advanced' ? 80 : analysisData.techAnalysis?.maturity === 'intermediate' ? 50 : 25 },
    ];

    for (const { type, score } of scoreTypes) {
      await db.leadScore.create({
        data: {
          leadId,
          scoreType: type,
          score,
          explanation: `Generated by AI analysis (v${analysisData.analysisVersion})`,
          modelVersion: analysisData.aiProvider,
        },
      });
    }

    // 11. Log audit
    await logAnalysisGenerated(userId, leadId, {
      leadScore: analysisData.leadScore,
      provider: result.provider,
      latencyMs,
    });

    await logAIAudit({
      userId,
      action: 'ai_credits_deducted',
      resource: 'credits',
      details: {
        action: 'lead_analysis',
        amount: ANALYSIS_CREDIT_COST,
        balance: deduction.newBalance,
        referenceId: leadId,
      },
    });

    return {
      success: true,
      analysis: analysisData,
      creditsDeducted: ANALYSIS_CREDIT_COST,
      newBalance: deduction.newBalance,
    };
  } catch (error) {
    console.error('[LeadAnalysis] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
    };
  }
}

/**
 * Get existing analysis for a lead.
 */
export async function getLeadAnalysis(leadId: string): Promise<LeadAnalysisOutput | null> {
  const analysis = await db.leadAnalysis.findUnique({
    where: { leadId },
  });

  if (!analysis) return null;

  let outreachData: Record<string, unknown> = {};
  try {
    outreachData = analysis.outreachMessages ? JSON.parse(analysis.outreachMessages) : {};
  } catch { /* corrupted data */ }

  let strengths: string[] = [];
  try { strengths = analysis.recommendedServices ? JSON.parse(analysis.recommendedServices) : []; } catch { /* corrupted */ }

  let weaknesses: string[] = [];
  try { weaknesses = analysis.weaknesses ? JSON.parse(analysis.weaknesses) : []; } catch { /* corrupted */ }

  let recommendations: string[] = [];
  try { recommendations = analysis.scoreExplanations ? JSON.parse(analysis.scoreExplanations) : []; } catch { /* corrupted */ }

  return {
    leadScore: analysis.replyScore,
    opportunityScore: analysis.dealConversionScore,
    outreachStrategy: analysis.closingStrategy || '',
    strengths,
    weaknesses,
    websiteAnalysis: {
      quality: analysis.websiteQualityScore > 70 ? 'good' : analysis.websiteQualityScore > 40 ? 'average' : 'poor',
      issues: [],
      recommendations: [],
    },
    techAnalysis: {
      stack: [],
      maturity: analysis.digitalMaturityScore > 60 ? 'advanced' : analysis.digitalMaturityScore > 30 ? 'intermediate' : 'basic',
      gaps: [],
    },
    recommendations,
    purchaseProbability: analysis.revenuePotentialScore,
    outreachPriority: analysis.urgencyScore > 70 ? 'critical' : analysis.urgencyScore > 50 ? 'high' : 'medium',
    estimatedDealSize: (outreachData.estimatedDealSize as string) || analysis.estimatedDealValueUsd || 'Unknown',
    bestApproach: analysis.bestContactTime || (outreachData.bestApproach as string) || '',
    keyPainPoints: (outreachData.keyPainPoints as string[]) || [],
    aiProvider: 'cached',
    analysisVersion: analysis.analysisVersion,
  };
}
