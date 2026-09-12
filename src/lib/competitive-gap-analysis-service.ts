// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Competitive Gap Analysis Service
// Systematic competitive gap analysis comparing user's business
// profile against tracked competitors across 8 dimensions.
//
// CRITICAL RULES:
// - NEVER use z-ai-web-dev-sdk directly; use executeAICompletion
// - ALWAYS validate userId for org isolation
// - ALWAYS deduct credits (8 per analysis) before AI call
// - ALWAYS store results in CompetitorAnalysis.analysisData JSON
// - NEVER throw on failure — return structured error results
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { deductCredits, refundCredits } from '@/lib/credit-service';
import { executeAICompletion } from '@/lib/ai/ai-provider';

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export type GapCategory = 'seo' | 'pricing' | 'social' | 'reviews' | 'tech_stack' | 'content' | 'features' | 'delivery';
export type GapSeverity = 'critical' | 'moderate' | 'minor';
export type GapEffort = 'high' | 'medium' | 'low';

export interface CompetitorGap {
  id: string;
  category: GapCategory;
  title: string;
  description: string;
  severity: GapSeverity;
  effortToClose: GapEffort;
  estimatedImpact: GapEffort;
  competitorAdvantage: string;
  suggestedAction: string;
  competitorId: string;
}

export interface GapAnalysisResult {
  competitorId: string;
  competitorName: string;
  gapScore: number;
  gaps: CompetitorGap[];
  strengths: string[];
  summary: string;
  analyzedAt: Date;
}

export interface AggregateGapAnalysis {
  userId: string;
  overallGapScore: number;
  competitorResults: GapAnalysisResult[];
  topGaps: CompetitorGap[];
  topStrengths: string[];
  categoryBreakdown: Record<GapCategory, { avgGapScore: number; gapCount: number; criticalCount: number }>;
  analyzedAt: Date;
}

export interface RemediationStep {
  id: string;
  gapId: string;
  gapTitle: string;
  category: GapCategory;
  priority: number;
  action: string;
  effortToClose: GapEffort;
  estimatedImpact: GapEffort;
  competitorId: string;
  competitorName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  createdAt: Date;
  updatedAt: Date;
}

export interface GapScoreTrend {
  current: number;
  previous: number | null;
  change: number;
  trend: 'improving' | 'declining' | 'stable';
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const GAP_ANALYSIS_CREDIT_COST = 8;
const GAP_ANALYSIS_CREDIT_ACTION = 'competitor_analysis';

const CATEGORY_WEIGHTS: Record<GapCategory, number> = {
  seo: 0.20,
  pricing: 0.15,
  social: 0.12,
  reviews: 0.13,
  tech_stack: 0.10,
  content: 0.12,
  features: 0.10,
  delivery: 0.08,
};

const ALL_CATEGORIES: GapCategory[] = [
  'seo', 'pricing', 'social', 'reviews', 'tech_stack', 'content', 'features', 'delivery',
];

const VALID_SEVERITIES: GapSeverity[] = ['critical', 'moderate', 'minor'];
const VALID_EFFORTS: GapEffort[] = ['high', 'medium', 'low'];
const VALID_CATEGORIES = new Set<string>(ALL_CATEGORIES);

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function generateId(): string {
  return `gap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
    return [];
  } catch {
    return [];
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ═══════════════════════════════════════════════════════════════════
// DATA GATHERING
// ═══════════════════════════════════════════════════════════════════

interface CompetitorContext {
  competitor: {
    id: string;
    competitorName: string;
    competitorUrl: string;
    seoScore: number | null;
    socialScore: number | null;
    techStack: string | null;
    strengths: string | null;
    weaknesses: string | null;
    opportunities: string | null;
    threats: string | null;
    threatLevel: string | null;
    pricingModel: string | null;
    estimatedTrafficTier: string | null;
    differentiationOpportunities: string | null;
    analysisData: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
}

interface UserProfile {
  company: string | null;
  country: string | null;
  website: string | null;
  preferencesJson: string | null;
}

async function gatherCompetitorData(userId: string, competitorId: string): Promise<CompetitorContext> {
  const competitor = await db.competitorAnalysis.findFirst({
    where: { id: competitorId, userId },
    select: {
      id: true,
      competitorName: true,
      competitorUrl: true,
      seoScore: true,
      socialScore: true,
      techStack: true,
      strengths: true,
      weaknesses: true,
      opportunities: true,
      threats: true,
      threatLevel: true,
      pricingModel: true,
      estimatedTrafficTier: true,
      differentiationOpportunities: true,
      analysisData: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { competitor };
}

async function gatherUserProfile(userId: string): Promise<UserProfile> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { company: true, country: true, preferencesJson: true },
  });

  return {
    company: user?.company ?? null,
    country: user?.country ?? null,
    website: null, // User doesn't have a website field — use company
    preferencesJson: user?.preferencesJson ?? null,
  };
}

async function gatherAllCompetitors(userId: string): Promise<CompetitorContext[]> {
  const competitors = await db.competitorAnalysis.findMany({
    where: { userId },
    select: {
      id: true,
      competitorName: true,
      competitorUrl: true,
      seoScore: true,
      socialScore: true,
      techStack: true,
      strengths: true,
      weaknesses: true,
      opportunities: true,
      threats: true,
      threatLevel: true,
      pricingModel: true,
      estimatedTrafficTier: true,
      differentiationOpportunities: true,
      analysisData: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  return competitors.map((c) => ({ competitor: c }));
}

// ═══════════════════════════════════════════════════════════════════
// RULE-BASED GAP PRE-ANALYSIS (deterministic, no AI needed)
// ═══════════════════════════════════════════════════════════════════

interface RawGap {
  category: GapCategory;
  title: string;
  description: string;
  severity: GapSeverity;
  effortToClose: GapEffort;
  estimatedImpact: GapEffort;
  competitorAdvantage: string;
  suggestedAction: string;
}

function detectRuleBasedGaps(ctx: CompetitorContext): RawGap[] {
  const gaps: RawGap[] = [];
  const c = ctx.competitor;
  if (!c) return gaps;

  // Parse analysis data for deeper fields
  const analysisData = safeParseJSON<Record<string, unknown>>(c.analysisData || '{}', {});
  const techStackArr = parseJsonArray(c.techStack);
  const strengthsArr = parseJsonArray(c.strengths);
  const weaknessesArr = parseJsonArray(c.weaknesses);
  const opportunitiesArr = parseJsonArray(c.opportunities);
  const threatsArr = parseJsonArray(c.threats);
  const diffOpps = parseJsonArray(c.differentiationOpportunities);

  // ── SEO GAPS ──
  if (c.seoScore && c.seoScore >= 70) {
    gaps.push({
      category: 'seo',
      title: 'SEO Score Deficit',
      description: `Competitor has an SEO score of ${c.seoScore}/100, suggesting strong organic search visibility.`,
      severity: c.seoScore >= 85 ? 'critical' : 'moderate',
      effortToClose: 'high',
      estimatedImpact: 'high',
      competitorAdvantage: `SEO score of ${c.seoScore} indicates optimized on-page SEO, quality backlinks, and keyword targeting.`,
      suggestedAction: 'Conduct a full SEO audit of your website. Identify top keywords your competitor ranks for and develop a content strategy to compete.',
    });
  }

  const seoKeywords = (analysisData as Record<string, unknown>).topKeywords;
  if (seoKeywords && Array.isArray(seoKeywords) && seoKeywords.length > 5) {
    gaps.push({
      category: 'content',
      title: 'Keyword Content Gap',
      description: `Competitor is ranking for ${seoKeywords.length}+ target keywords that may represent content opportunities.`,
      severity: 'moderate',
      effortToClose: 'medium',
      estimatedImpact: 'high',
      competitorAdvantage: `Established keyword portfolio with ${seoKeywords.length}+ tracked terms.`,
      suggestedAction: 'Create content targeting the same keyword clusters. Use long-tail variations for quicker wins.',
    });
  }

  // ── SOCIAL GAPS ──
  if (c.socialScore && c.socialScore >= 60) {
    gaps.push({
      category: 'social',
      title: 'Social Presence Deficit',
      description: `Competitor has a social score of ${c.socialScore}/100, indicating active and growing social media engagement.`,
      severity: c.socialScore >= 80 ? 'critical' : 'moderate',
      effortToClose: 'medium',
      estimatedImpact: 'medium',
      competitorAdvantage: `Social score of ${c.socialScore} suggests strong follower counts, engagement rates, and multi-platform presence.`,
      suggestedAction: 'Audit your social profiles. Post consistently 3-5x/week. Engage with followers daily. Consider paid social campaigns.',
    });
  }

  // ── TECH STACK GAPS ──
  if (techStackArr.length > 10) {
    gaps.push({
      category: 'tech_stack',
      title: 'Technology Maturity Gap',
      description: `Competitor uses ${techStackArr.length}+ technologies, indicating a mature, feature-rich platform.`,
      severity: techStackArr.length > 20 ? 'moderate' : 'minor',
      effortToClose: 'high',
      estimatedImpact: 'medium',
      competitorAdvantage: `Sophisticated tech stack with ${techStackArr.join(', ').slice(0, 80)}... enabling rich features and faster iteration.`,
      suggestedAction: 'Evaluate which competitor technologies provide the most user value. Prioritize implementing equivalent features that impact conversion.',
    });
  }

  const hasModernStack = techStackArr.some(t =>
    /react|next\.?js|vue|angular|typescript|tailwind|graphql/i.test(t)
  );
  if (hasModernStack) {
    gaps.push({
      category: 'tech_stack',
      title: 'Modern Frontend Framework',
      description: 'Competitor uses a modern frontend framework, likely providing a faster, more interactive user experience.',
      severity: 'minor',
      effortToClose: 'high',
      estimatedImpact: 'medium',
      competitorAdvantage: 'Modern tech stack provides better performance, accessibility, and developer velocity.',
      suggestedAction: 'Ensure your website achieves Core Web Vitals benchmarks. Consider modernizing your frontend if conversion data supports the investment.',
    });
  }

  // ── PRICING GAPS ──
  if (c.pricingModel && c.pricingModel !== 'unknown') {
    const pricingTiers = (analysisData as Record<string, unknown>).pricingTiers;
    const tierCount = Array.isArray(pricingTiers) ? pricingTiers.length : 0;
    if (tierCount >= 3) {
      gaps.push({
        category: 'pricing',
        title: 'Structured Pricing Strategy',
        description: `Competitor has ${tierCount} pricing tiers (${c.pricingModel} model), providing clear options for different customer segments.`,
        severity: 'moderate',
        effortToClose: 'medium',
        estimatedImpact: 'high',
        competitorAdvantage: `Multi-tier pricing (${c.pricingModel}) captures wider market segments and enables upselling.`,
        suggestedAction: 'Review your pricing structure. Consider adding tiered options if you only have a single price point. Test different price anchoring strategies.',
      });
    } else if (tierCount === 0 && c.pricingModel === 'custom') {
      gaps.push({
        category: 'pricing',
        title: 'Custom Pricing Model',
        description: 'Competitor uses custom/enterprise pricing, which can signal premium positioning but may lack transparency.',
        severity: 'minor',
        effortToClose: 'low',
        estimatedImpact: 'medium',
        competitorAdvantage: 'Custom pricing allows maximum margin flexibility and customer-specific deals.',
        suggestedAction: 'If your pricing is public, use transparency as a competitive advantage. Show clear value-to-price mapping.',
      });
    }
  }

  // ── REVIEWS GAPS ──
  const reviewsData = (analysisData as Record<string, unknown>).reviewsData as Record<string, unknown> | undefined;
  if (reviewsData) {
    const overallRating = reviewsData.overallRating as number | undefined;
    const totalReviews = reviewsData.totalReviews as number | undefined;
    if (overallRating && overallRating >= 4.0 && totalReviews && totalReviews >= 50) {
      gaps.push({
        category: 'reviews',
        title: 'Strong Review Profile',
        description: `Competitor has ${totalReviews}+ reviews with a ${overallRating}/5 rating, building strong social proof.`,
        severity: overallRating >= 4.5 ? 'critical' : 'moderate',
        effortToClose: 'medium',
        estimatedImpact: 'high',
        competitorAdvantage: `${totalReviews} reviews at ${overallRating}/5 creates significant trust signals for potential customers.`,
        suggestedAction: 'Implement a systematic review collection process. Respond to all reviews. Showcase testimonials on your website.',
      });
    }
  }

  // ── FEATURES GAPS ──
  if (strengthsArr.length >= 3) {
    gaps.push({
      category: 'features',
      title: 'Strong Feature Portfolio',
      description: `Competitor has ${strengthsArr.length} documented strengths: ${strengthsArr.slice(0, 3).join(', ')}.`,
      severity: 'moderate',
      effortToClose: 'high',
      estimatedImpact: 'high',
      competitorAdvantage: strengthsArr.slice(0, 3).join(', '),
      suggestedAction: 'Map competitor strengths against your feature set. Identify must-have parity features and unique differentiation opportunities.',
    });
  }

  if (opportunitiesArr.length > 0) {
    gaps.push({
      category: 'features',
      title: 'Market Opportunities Being Pursued',
      description: `Competitor is pursuing ${opportunitiesArr.length} identified opportunities: ${opportunitiesArr.slice(0, 2).join(', ')}.`,
      severity: 'minor',
      effortToClose: 'medium',
      estimatedImpact: 'medium',
      competitorAdvantage: `Active pursuit of market opportunities shows strategic agility and growth mindset.`,
      suggestedAction: `Evaluate if the same opportunities apply to your market. Consider moving faster on shared opportunity areas.`,
    });
  }

  // ── DELIVERY GAPS ──
  if (c.estimatedTrafficTier === 'high') {
    gaps.push({
      category: 'delivery',
      title: 'High Traffic & Brand Recognition',
      description: 'Competitor has high estimated web traffic, suggesting strong brand awareness and content distribution.',
      severity: 'moderate',
      effortToClose: 'high',
      estimatedImpact: 'high',
      competitorAdvantage: 'High traffic volume provides a large funnel for customer acquisition.',
      suggestedAction: 'Invest in content marketing and SEO to build organic traffic. Consider strategic partnerships and guest posting for visibility.',
    });
  }

  if (c.threatLevel === 'high') {
    gaps.push({
      category: 'delivery',
      title: 'High Competitive Threat',
      description: 'This competitor is classified as a high threat — they are actively competing for the same market segment.',
      severity: 'critical',
      effortToClose: 'high',
      estimatedImpact: 'high',
      competitorAdvantage: 'High threat classification indicates direct market overlap and strong positioning.',
      suggestedAction: 'Develop a specific competitive strategy. Identify their weakest points and position your offering as the superior alternative.',
    });
  }

  // ── DIFFERENTIATION OPPORTUNITIES ──
  if (diffOpps.length > 0) {
    gaps.push({
      category: 'features',
      title: 'Differentiation Opportunity',
      description: `Identified differentiation areas: ${diffOpps.slice(0, 2).join(', ')}`,
      severity: 'minor',
      effortToClose: 'medium',
      estimatedImpact: 'high',
      competitorAdvantage: 'Knowing their differentiation points helps inform counter-strategy.',
      suggestedAction: `Focus on the differentiation opportunities: ${diffOpps.slice(0, 2).join(', ')}. Build features or messaging around these gaps.`,
    });
  }

  return gaps;
}

function detectRuleBasedStrengths(ctx: CompetitorContext): string[] {
  const strengths: string[] = [];
  const c = ctx.competitor;
  if (!c) return strengths;

  // If competitor has weaknesses, user might be strong there
  const weaknessesArr = parseJsonArray(c.weaknesses);
  if (weaknessesArr.length > 0) {
    weaknessesArr.forEach((w) => {
      strengths.push(`Competitor weakness you can exploit: ${w}`);
    });
  }

  // If competitor has no pricing page, user has pricing advantage
  if (!c.pricingModel || c.pricingModel === 'unknown') {
    strengths.push('Pricing transparency — competitor pricing is not publicly available');
  }

  // Low threat level means user is in a strong position
  if (c.threatLevel === 'low') {
    strengths.push('Low competitive threat from this competitor');
  }

  // If competitor has low SEO score, user has SEO opportunity
  if (c.seoScore && c.seoScore < 40) {
    strengths.push(`SEO opportunity — competitor's low SEO score (${c.seoScore}) leaves room for organic dominance`);
  }

  // If competitor has low social score
  if (c.socialScore && c.socialScore < 40) {
    strengths.push(`Social media advantage — competitor's weak social presence (${c.socialScore}) leaves room for differentiation`);
  }

  return strengths;
}

// ═══════════════════════════════════════════════════════════════════
// AI-POWERED GAP ANALYSIS
// ═══════════════════════════════════════════════════════════════════

async function performAIGapAnalysis(
  ctx: CompetitorContext,
  userProfile: UserProfile,
  ruleBasedGaps: RawGap[],
  targetCategory?: GapCategory
): Promise<{
  aiGaps: CompetitorGap[];
  strengths: string[];
  summary: string;
  gapScore: number;
}> {
  const c = ctx.competitor;
  if (!c) {
    return { aiGaps: [], strengths: [], summary: 'No competitor data available', gapScore: 50 };
  }

  const techStackArr = parseJsonArray(c.techStack);
  const strengthsArr = parseJsonArray(c.strengths);
  const weaknessesArr = parseJsonArray(c.weaknesses);

  const categoriesToAnalyze = targetCategory
    ? [targetCategory]
    : ALL_CATEGORIES;

  const gapsDescription = ruleBasedGaps.map(g =>
    `[${g.category}] ${g.title}: ${g.description} (severity: ${g.severity}, effort: ${g.effortToClose}, impact: ${g.estimatedImpact})`
  ).join('\n');

  const prompt = `You are a competitive intelligence analyst. Analyze the gap between the user's business and a tracked competitor.

USER BUSINESS PROFILE:
- Company: ${userProfile.company || 'Unknown'}
- Country: ${userProfile.country || 'Unknown'}

COMPETITOR DATA:
- Name: ${c.competitorName}
- URL: ${c.competitorUrl}
- SEO Score: ${c.seoScore ?? 'N/A'}/100
- Social Score: ${c.socialScore ?? 'N/A'}/100
- Tech Stack: ${techStackArr.join(', ') || 'Unknown'}
- Pricing Model: ${c.pricingModel || 'Unknown'}
- Traffic Tier: ${c.estimatedTrafficTier || 'Unknown'}
- Threat Level: ${c.threatLevel || 'Unknown'}
- Strengths: ${strengthsArr.join('; ') || 'None documented'}
- Weaknesses: ${weaknessesArr.join('; ') || 'None documented'}
- Differentiation Opportunities: ${parseJsonArray(c.differentiationOpportunities).join('; ') || 'None documented'}

RULE-BASED GAPS ALREADY DETECTED:
${gapsDescription || 'No rule-based gaps detected'}

CATEGORIES TO ANALYZE: ${categoriesToAnalyze.join(', ')}

Return a JSON object:
{
  "gaps": [
    {
      "category": "${categoriesToAnalyze.join('|')}",
      "title": "Short gap title",
      "description": "Detailed gap description",
      "severity": "critical|moderate|minor",
      "effortToClose": "high|medium|low",
      "estimatedImpact": "high|medium|low",
      "competitorAdvantage": "What the competitor does better",
      "suggestedAction": "Specific actionable step to close this gap"
    }
  ],
  "strengths": ["Area where user is ahead of competitor"],
  "summary": "Overall competitive position summary (2-3 sentences)",
  "gapScore": 0-100
}

Rules:
- gapScore: 100 = no gaps (user dominates), 0 = many critical gaps (highly vulnerable)
- Include gaps NOT already detected by rules (contextual, strategic, nuanced)
- Be specific and actionable
- Maximum 6 gaps, focus on highest impact
- Return ONLY valid JSON. No markdown.`;

  try {
    const result = await executeAICompletion(
      {
        messages: [
          {
            role: 'system',
            content: 'You are a competitive intelligence analyst. Return only valid JSON. No markdown, no explanations. Be specific and actionable.',
          },
          { role: 'user', content: prompt },
        ],
        config: { provider: 'z-ai', temperature: 0.3, maxTokens: 3000 },
      },
      'system', // userId placeholder — the caller handles auth
      'competitive_gap_analysis'
    );

    if (!result.success) {
      return {
        aiGaps: [],
        strengths: detectRuleBasedStrengths(ctx),
        summary: 'AI analysis unavailable. Rule-based analysis found ' + ruleBasedGaps.length + ' gaps.',
        gapScore: 50,
      };
    }

    const parsed = safeParseJSON<{
      gaps?: Array<{
        category: string;
        title: string;
        description: string;
        severity: string;
        effortToClose: string;
        estimatedImpact: string;
        competitorAdvantage: string;
        suggestedAction: string;
      }>;
      strengths?: string[];
      summary?: string;
      gapScore?: number;
    }>(result.content, {});

    const aiGaps: CompetitorGap[] = (parsed.gaps || [])
      .filter(g => VALID_CATEGORIES.has(g.category) && g.title)
      .map(g => ({
        id: generateId(),
        category: g.category as GapCategory,
        title: g.title,
        description: g.description || '',
        severity: VALID_SEVERITIES.includes(g.severity) ? g.severity as GapSeverity : 'moderate',
        effortToClose: VALID_EFFORTS.includes(g.effortToClose) ? g.effortToClose as GapEffort : 'medium',
        estimatedImpact: VALID_EFFORTS.includes(g.estimatedImpact) ? g.estimatedImpact as GapEffort : 'medium',
        competitorAdvantage: g.competitorAdvantage || '',
        suggestedAction: g.suggestedAction || '',
        competitorId: c.id,
      }));

    const strengths = [
      ...(parsed.strengths || []),
      ...detectRuleBasedStrengths(ctx),
    ].slice(0, 10);

    const gapScore = clamp(parsed.gapScore ?? 50, 0, 100);

    return {
      aiGaps,
      strengths,
      summary: parsed.summary || `Competitive analysis identified ${aiGaps.length} gaps against ${c.competitorName}.`,
      gapScore,
    };
  } catch (error) {
    console.error('[CompetitiveGapAnalysis] AI analysis failed:', error);
    return {
      aiGaps: [],
      strengths: detectRuleBasedStrengths(ctx),
      summary: 'AI analysis failed. Rule-based analysis found ' + ruleBasedGaps.length + ' gaps.',
      gapScore: 50,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// GAP SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════════

function calculateGapScoreFromGaps(gaps: CompetitorGap[]): number {
  if (gaps.length === 0) return 100;

  let totalPenalty = 0;
  const severityWeights: Record<GapSeverity, number> = {
    critical: 25,
    moderate: 15,
    minor: 5,
  };
  const impactWeights: Record<GapEffort, number> = {
    high: 1.5,
    medium: 1.0,
    low: 0.5,
  };

  for (const gap of gaps) {
    const categoryWeight = CATEGORY_WEIGHTS[gap.category] || 0.1;
    const severityWeight = severityWeights[gap.severity];
    const impactWeight = impactWeights[gap.estimatedImpact];
    totalPenalty += severityWeight * categoryWeight * impactWeight;
  }

  return clamp(Math.round(100 - totalPenalty), 0, 100);
}

// ═══════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════

async function storeGapAnalysisResult(
  userId: string,
  competitorId: string,
  result: GapAnalysisResult
): Promise<void> {
  const existing = await db.competitorAnalysis.findFirst({
    where: { id: competitorId, userId },
    select: { analysisData: true },
  });

  const existingData = safeParseJSON<Record<string, unknown>>(existing?.analysisData || '{}', {});
  existingData.gapAnalysis = {
    gapScore: result.gapScore,
    gaps: result.gaps,
    strengths: result.strengths,
    summary: result.summary,
    analyzedAt: result.analyzedAt.toISOString(),
  };

  await db.competitorAnalysis.update({
    where: { id: competitorId },
    data: {
      analysisData: JSON.stringify(existingData),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

/**
 * Analyze gaps between user's business and a specific competitor (or all tracked competitors).
 */
export async function analyzeGaps(params: {
  userId: string;
  competitorId?: string;
  category?: GapCategory;
}): Promise<GapAnalysisResult> {
  const { userId, competitorId, category } = params;

  // Validate category if provided
  if (category && !VALID_CATEGORIES.has(category)) {
    throw new Error(`Invalid gap category: ${category}`);
  }

  if (competitorId) {
    // Analyze single competitor
    const creditResult = await deductCredits({
      userId,
      action: GAP_ANALYSIS_CREDIT_ACTION,
      cost: GAP_ANALYSIS_CREDIT_COST,
      referenceId: `gap-analysis:${competitorId}`,
    });

    if (!creditResult.success) {
      throw new Error(creditResult.error || 'Insufficient credits');
    }

    try {
      const [ctx, profile] = await Promise.all([
        gatherCompetitorData(userId, competitorId),
        gatherUserProfile(userId),
      ]);

      if (!ctx.competitor) {
        await refundCredits({
          userId,
          amount: GAP_ANALYSIS_CREDIT_COST,
          originalAction: GAP_ANALYSIS_CREDIT_ACTION,
          referenceId: `gap-analysis:${competitorId}`,
        });
        throw new Error('Competitor not found');
      }

      const ruleGaps = detectRuleBasedGaps(ctx)
        .filter(g => !category || g.category === category);

      const aiResult = await performAIGapAnalysis(ctx, profile, ruleGaps, category);

      // Merge rule-based + AI gaps (deduplicate by title)
      const mergedGaps = mergeGaps(ruleGaps, aiResult.aiGaps, ctx.competitor.id);

      const finalGapScore = mergedGaps.length > 0
        ? calculateGapScoreFromGaps(mergedGaps)
        : aiResult.gapScore;

      const result: GapAnalysisResult = {
        competitorId: ctx.competitor.id,
        competitorName: ctx.competitor.competitorName,
        gapScore: finalGapScore,
        gaps: mergedGaps,
        strengths: aiResult.strengths,
        summary: aiResult.summary,
        analyzedAt: new Date(),
      };

      await storeGapAnalysisResult(userId, competitorId, result);
      return result;
    } catch (error) {
      // Only refund if it's not an insufficient credits error (already thrown)
      if (!(error instanceof Error && error.message.includes('Insufficient credits')) &&
          !(error instanceof Error && error.message.includes('Competitor not found'))) {
        await refundCredits({
          userId,
          amount: GAP_ANALYSIS_CREDIT_COST,
          originalAction: GAP_ANALYSIS_CREDIT_ACTION,
          referenceId: `gap-analysis:${competitorId}`,
        });
      }
      throw error;
    }
  } else {
    throw new Error('competitorId is required for single analysis. Use analyzeAllGaps for all competitors.');
  }
}

/**
 * Analyze gaps across all tracked competitors.
 */
export async function analyzeAllGaps(userId: string): Promise<AggregateGapAnalysis> {
  const competitors = await gatherAllCompetitors(userId);

  if (competitors.length === 0) {
    return {
      userId,
      overallGapScore: 100,
      competitorResults: [],
      topGaps: [],
      topStrengths: [],
      categoryBreakdown: initCategoryBreakdown(),
      analyzedAt: new Date(),
    };
  }

  // Deduct credits (one deduction for the full batch analysis)
  const totalCompetitors = competitors.length;
  const totalCost = Math.min(GAP_ANALYSIS_CREDIT_COST * 2, GAP_ANALYSIS_CREDIT_COST + totalCompetitors); // Cap cost
  const creditResult = await deductCredits({
    userId,
    action: GAP_ANALYSIS_CREDIT_ACTION,
    cost: GAP_ANALYSIS_CREDIT_COST,
    referenceId: `gap-analysis:all:${Date.now()}`,
  });

  if (!creditResult.success) {
    throw new Error(creditResult.error || 'Insufficient credits');
  }

  const profile = await gatherUserProfile(userId);
  const results: GapAnalysisResult[] = [];
  const allGaps: CompetitorGap[] = [];
  const allStrengths: Set<string> = new Set();
  const categoryBreakdown = initCategoryBreakdown();

  for (const ctx of competitors) {
    if (!ctx.competitor) continue;

    try {
      const ruleGaps = detectRuleBasedGaps(ctx);
      const aiResult = await performAIGapAnalysis(ctx, profile, ruleGaps);

      const mergedGaps = mergeGaps(ruleGaps, aiResult.aiGaps, ctx.competitor.id);
      const gapScore = mergedGaps.length > 0
        ? calculateGapScoreFromGaps(mergedGaps)
        : aiResult.gapScore;

      const result: GapAnalysisResult = {
        competitorId: ctx.competitor.id,
        competitorName: ctx.competitor.competitorName,
        gapScore,
        gaps: mergedGaps,
        strengths: aiResult.strengths,
        summary: aiResult.summary,
        analyzedAt: new Date(),
      };

      results.push(result);
      allGaps.push(...mergedGaps);
      aiResult.strengths.forEach(s => allStrengths.add(s));

      // Update category breakdown
      for (const gap of mergedGaps) {
        const cat = categoryBreakdown[gap.category];
        cat.gapCount++;
        if (gap.severity === 'critical') cat.criticalCount++;
      }

      // Store per-competitor
      await storeGapAnalysisResult(userId, ctx.competitor.id, result);
    } catch (error) {
      console.error(`[CompetitiveGapAnalysis] Failed for ${ctx.competitor?.competitorName}:`, error);
    }
  }

  // Calculate category scores
  for (const cat of ALL_CATEGORIES) {
    const catGaps = allGaps.filter(g => g.category === cat);
    categoryBreakdown[cat].avgGapScore = catGaps.length > 0
      ? calculateGapScoreFromGaps(catGaps)
      : 100;
  }

  // Sort top gaps by severity then impact
  const severityOrder: Record<GapSeverity, number> = { critical: 0, moderate: 1, minor: 2 };
  const topGaps = [...allGaps]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 15);

  const overallGapScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.gapScore, 0) / results.length)
    : 100;

  return {
    userId,
    overallGapScore,
    competitorResults: results,
    topGaps,
    topStrengths: Array.from(allStrengths).slice(0, 15),
    categoryBreakdown,
    analyzedAt: new Date(),
  };
}

/**
 * Get a prioritized remediation plan based on stored gap analyses.
 */
export async function getGapRemediationPlan(
  userId: string,
  competitorId?: string
): Promise<RemediationStep[]> {
  const where: Record<string, unknown> = { userId };
  if (competitorId) where.id = competitorId;

  const competitors = await db.competitorAnalysis.findMany({
    where,
    select: {
      id: true,
      competitorName: true,
      analysisData: true,
    },
  });

  const steps: RemediationStep[] = [];

  for (const comp of competitors) {
    const data = safeParseJSON<Record<string, unknown>>(comp.analysisData || '{}', {});
    const gapAnalysis = data.gapAnalysis as Record<string, unknown> | undefined;
    if (!gapAnalysis) continue;

    const gaps = (gapAnalysis.gaps as CompetitorGap[] | undefined) || [];

    // Sort gaps by severity then impact for prioritization
    const severityOrder: Record<GapSeverity, number> = { critical: 0, moderate: 1, minor: 2 };
    const impactOrder: Record<GapEffort, number> = { high: 0, medium: 1, low: 2 };
    const effortOrder: Record<GapEffort, number> = { low: 0, medium: 1, high: 2 };

    const sortedGaps = [...gaps].sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      const impDiff = impactOrder[a.estimatedImpact] - impactOrder[b.estimatedImpact];
      if (impDiff !== 0) return impDiff;
      return effortOrder[a.effortToClose] - effortOrder[b.effortToClose];
    });

    sortedGaps.forEach((gap, idx) => {
      steps.push({
        id: gap.id || generateId(),
        gapId: gap.id,
        gapTitle: gap.title,
        category: gap.category,
        priority: idx + 1,
        action: gap.suggestedAction,
        effortToClose: gap.effortToClose,
        estimatedImpact: gap.estimatedImpact,
        competitorId: comp.id,
        competitorName: comp.competitorName,
        status: 'pending',
        createdAt: new Date(gap.id.includes('-') ? parseInt(gap.id.split('-')[1]) || Date.now() : Date.now()),
        updatedAt: new Date(),
      });
    });
  }

  return steps;
}

/**
 * Track progress on a specific gap remediation.
 */
export async function trackGapProgress(
  userId: string,
  gapId: string,
  status: 'in_progress' | 'completed' | 'dismissed'
): Promise<void> {
  // Find which competitor has this gap
  const competitors = await db.competitorAnalysis.findMany({
    where: { userId },
    select: { id: true, analysisData: true },
  });

  for (const comp of competitors) {
    const data = safeParseJSON<Record<string, unknown>>(comp.analysisData || '{}', {});
    const gapAnalysis = data.gapAnalysis as Record<string, unknown> | undefined;
    if (!gapAnalysis) continue;

    const gaps = (gapAnalysis.gaps as CompetitorGap[] | undefined) || [];
    const gapIndex = gaps.findIndex(g => g.id === gapId);

    if (gapIndex >= 0) {
      gaps[gapIndex] = { ...gaps[gapIndex], status } as CompetitorGap & { status: string };
      data.gapAnalysis = { ...gapAnalysis, gaps };

      await db.competitorAnalysis.update({
        where: { id: comp.id },
        data: { analysisData: JSON.stringify(data) },
      });

      return;
    }
  }

  throw new Error('Gap not found');
}

/**
 * Get the user's current overall gap score from stored analyses.
 */
export async function getGapScore(userId: string): Promise<GapScoreTrend> {
  const competitors = await db.competitorAnalysis.findMany({
    where: { userId },
    select: { analysisData: true },
  });

  let totalScore = 0;
  let analyzedCount = 0;

  for (const comp of competitors) {
    const data = safeParseJSON<Record<string, unknown>>(comp.analysisData || '{}', {});
    const gapAnalysis = data.gapAnalysis as Record<string, unknown> | undefined;
    if (gapAnalysis?.gapScore && typeof gapAnalysis.gapScore === 'number') {
      totalScore += gapAnalysis.gapScore as number;
      analyzedCount++;
    }
  }

  const current = analyzedCount > 0
    ? Math.round(totalScore / analyzedCount)
    : 100;

  // Attempt to get previous score by looking at the oldest analysis data
  // Since we store the latest analysis, we simulate a previous score
  // In a production system, this would be tracked in a separate time-series table
  const previous: number | null = null;
  const change = previous !== null ? current - previous : 0;
  const trend: 'improving' | 'declining' | 'stable' = previous === null
    ? 'stable'
    : change > 5 ? 'improving'
    : change < -5 ? 'declining'
    : 'stable';

  return { current, previous, change, trend };
}

// ═══════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════

function mergeGaps(
  ruleGaps: RawGap[],
  aiGaps: CompetitorGap[],
  competitorId: string
): CompetitorGap[] {
  const merged: CompetitorGap[] = [];
  const seenTitles = new Set<string>();

  // Add rule-based gaps first
  for (const rg of ruleGaps) {
    const key = rg.title.toLowerCase().trim();
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      merged.push({
        id: generateId(),
        category: rg.category,
        title: rg.title,
        description: rg.description,
        severity: rg.severity,
        effortToClose: rg.effortToClose,
        estimatedImpact: rg.estimatedImpact,
        competitorAdvantage: rg.competitorAdvantage,
        suggestedAction: rg.suggestedAction,
        competitorId,
      });
    }
  }

  // Add AI gaps (only if not duplicating rule-based)
  for (const ag of aiGaps) {
    const key = ag.title.toLowerCase().trim();
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      merged.push(ag);
    }
  }

  return merged;
}

function initCategoryBreakdown(): Record<GapCategory, { avgGapScore: number; gapCount: number; criticalCount: number }> {
  const breakdown = {} as Record<GapCategory, { avgGapScore: number; gapCount: number; criticalCount: number }>;
  for (const cat of ALL_CATEGORIES) {
    breakdown[cat] = { avgGapScore: 100, gapCount: 0, criticalCount: 0 };
  }
  return breakdown;
}
