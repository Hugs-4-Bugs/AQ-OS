// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gap Analysis Service
// Phase 14: AI-Powered Multi-Dimensional Gap Analysis for Leads
//
// Identifies what's missing between a lead's current state and the
// ideal state for conversion. Performs analysis across 6 dimensions:
//   1. Digital Presence Gap
//   2. Contact Information Gap
//   3. Engagement Gap
//   4. Competitive Gap
//   5. Revenue Opportunity Gap
//   6. Technology Gap
//
// CRITICAL RULES:
// - NEVER use z-ai-web-dev-sdk on the client side
// - ALWAYS validate userId for org isolation
// - ALWAYS deduct credits before performing AI analysis
// - ALWAYS store results in LeadActivity records
// - NEVER throw on failure — return structured error results
// - Auto-trigger enrichment for leads with critical contact gaps
// - Auto-trigger outreach for leads with engagement gaps
// ═══════════════════════════════════════════════════════════════════

import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';
import { deductCredits, refundCredits } from '@/lib/credit-service';
import { sendNotification } from '@/lib/notification-engine';
import { logAuditEvent } from '@/lib/lead-audit';

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export interface GapAnalysis {
  leadId: string;
  overallScore: number; // 0-100, how close to ideal
  gaps: GapItem[];
  recommendations: GapRecommendation[];
  priorityActions: PriorityAction[];
  conversionProbability: number; // 0-100
  estimatedRevenueImpact: string;
}

export interface GapItem {
  dimension: 'digital_presence' | 'contact_info' | 'engagement' | 'competitive' | 'revenue' | 'technology';
  gap: string;
  current: string;
  ideal: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  impact: number; // 0-100
  autoFixable: boolean;
}

export interface GapRecommendation {
  gap: string;
  action: string;
  priority: 'immediate' | 'short_term' | 'long_term';
  estimatedEffort: 'low' | 'medium' | 'high';
  impactOnConversion: number; // percentage points
}

export interface PriorityAction {
  action: string;
  type: 'enrich' | 'outreach' | 'research' | 'meeting' | 'manual';
  leadId: string;
  reason: string;
  autoTrigger: boolean;
}

export interface BatchGapResult {
  total: number;
  analyzed: number;
  failed: number;
  skipped: number;
  results: Array<{
    leadId: string;
    success: boolean;
    analysis?: GapAnalysis;
    error?: string;
  }>;
}

export interface GapTrendsSummary {
  period: string;
  totalAnalyses: number;
  averageScore: number;
  scoreTrend: 'improving' | 'declining' | 'stable';
  dimensionAverages: Record<GapItem['dimension'], number>;
  mostCommonGaps: Array<{ gap: string; count: number; dimension: GapItem['dimension'] }>;
  autoFixableCount: number;
  criticalCount: number;
  conversionProbabilityAvg: number;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const GAP_ANALYSIS_CREDIT_COST = 3;
const GAP_ANALYSIS_ACTION = 'gap_analysis';

const SEVERITY_THRESHOLDS = {
  critical: 80, // impact >= 80 → critical
  high: 60,     // impact >= 60 → high
  medium: 40,   // impact >= 40 → medium
  low: 0,       // impact < 40 → low
} as const;

const DIMENSION_WEIGHTS: Record<GapItem['dimension'], number> = {
  contact_info: 0.30,      // Most important — can't convert without contact
  engagement: 0.25,        // Second — no engagement = no conversion
  digital_presence: 0.15,  // Third — digital maturity affects trust
  revenue: 0.15,           // Fourth — revenue potential matters
  competitive: 0.10,       // Fifth — competitive position
  technology: 0.05,        // Sixth — tech stack is nice to know
};

// ═══════════════════════════════════════════════════════════════════
// HELPER: SAFE JSON PARSER
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// HELPER: ORG ISOLATION VALIDATION
// ═══════════════════════════════════════════════════════════════════

async function validateLeadAccess(leadId: string, userId: string): Promise<boolean> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, isActive: true },
    select: { id: true, userId: true, orgId: true },
  });

  if (!lead) return false;

  // ACCOUNT ISOLATION: canonical fail-closed rule — owner, or same org
  // where BOTH orgIds are non-null. Previously `!lead.userId` failed
  // OPEN for ownerless leads.
  if (lead.userId === userId) return true;

  // Check org membership
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  return !!(user?.orgId && lead.orgId && user.orgId === lead.orgId);
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: BUILD LEAD CONTEXT
// ═══════════════════════════════════════════════════════════════════

interface LeadContext {
  lead: Awaited<ReturnType<typeof db.lead.findFirst>>;
  analysis: Awaited<ReturnType<typeof db.leadAnalysis.findUnique>>;
  communications: Awaited<ReturnType<typeof db.communication.findMany>>;
  outreachMessages: Awaited<ReturnType<typeof db.outreachMessage.findMany>>;
  deals: Awaited<ReturnType<typeof db.deal.findMany>>;
  competitors: Awaited<ReturnType<typeof db.competitorAnalysis.findMany>>;
  activities: Awaited<ReturnType<typeof db.leadActivity.findMany>>;
}

async function buildLeadContext(leadId: string): Promise<LeadContext> {
  const [
    lead,
    analysis,
    communications,
    outreachMessages,
    deals,
    competitors,
    activities,
  ] = await Promise.all([
    db.lead.findFirst({
      where: { id: leadId, isActive: true },
    }),
    db.leadAnalysis.findUnique({
      where: { leadId },
    }),
    db.communication.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    db.outreachMessage.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    db.deal.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.competitorAnalysis.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.leadActivity.findMany({
      where: { leadId, type: 'gap_analysis_completed' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    lead,
    analysis,
    communications,
    outreachMessages,
    deals,
    competitors,
    activities,
  };
}

// ═══════════════════════════════════════════════════════════════════
// RULE-BASED GAP ANALYSIS (No AI needed — deterministic)
// ═══════════════════════════════════════════════════════════════════

/**
 * Analyze digital presence gaps based on existing lead data.
 * This is deterministic — no AI needed for factual gap detection.
 */
function analyzeDigitalPresenceGaps(ctx: LeadContext): GapItem[] {
  const gaps: GapItem[] = [];
  const lead = ctx.lead;
  if (!lead) return gaps;

  // No website
  if (!lead.website || lead.website.trim() === '') {
    gaps.push({
      dimension: 'digital_presence',
      gap: 'Missing business website',
      current: 'No website URL recorded',
      ideal: 'Professional business website with clear value proposition',
      severity: 'high',
      impact: 75,
      autoFixable: false,
    });
  } else if (lead.websiteQuality === 'poor' || lead.websiteQuality === 'none') {
    gaps.push({
      dimension: 'digital_presence',
      gap: 'Poor website quality',
      current: `Website quality: ${lead.websiteQuality || 'unknown'}`,
      ideal: 'Good or excellent website with modern design, mobile responsiveness, clear CTAs',
      severity: 'high',
      impact: 65,
      autoFixable: false,
    });
  } else if (lead.websiteQuality === 'basic') {
    gaps.push({
      dimension: 'digital_presence',
      gap: 'Basic website — room for improvement',
      current: `Website quality: basic`,
      ideal: 'Professional website with SEO optimization, blog, testimonials',
      severity: 'medium',
      impact: 40,
      autoFixable: false,
    });
  }

  // No social media
  const socialProfiles: string[] = [];
  if (lead.linkedin) socialProfiles.push('LinkedIn');
  if (lead.instagram) socialProfiles.push('Instagram');
  if (lead.facebook) socialProfiles.push('Facebook');

  if (socialProfiles.length === 0) {
    gaps.push({
      dimension: 'digital_presence',
      gap: 'No social media presence detected',
      current: 'No social profiles found',
      ideal: 'Active presence on at least 2-3 social platforms relevant to the niche',
      severity: 'high',
      impact: 60,
      autoFixable: true,
    });
  } else if (socialProfiles.length === 1) {
    gaps.push({
      dimension: 'digital_presence',
      gap: 'Limited social media presence',
      current: `Only ${socialProfiles.join(', ')} found`,
      ideal: 'Active presence on at least 2-3 social platforms',
      severity: 'medium',
      impact: 35,
      autoFixable: true,
    });
  }

  // No Google Maps listing
  if (!lead.googleMapsListing || lead.googleMapsListing.trim() === '') {
    gaps.push({
      dimension: 'digital_presence',
      gap: 'No Google Maps listing',
      current: 'No Google Maps/Google Business profile found',
      ideal: 'Verified Google Business profile with reviews and accurate information',
      severity: 'medium',
      impact: 45,
      autoFixable: false,
    });
  }

  // Low rating
  if (lead.rating !== null && lead.rating !== undefined && lead.rating < 3.5) {
    gaps.push({
      dimension: 'digital_presence',
      gap: 'Low online rating',
      current: `Rating: ${lead.rating}/5`,
      ideal: 'Rating of 4.0+ with positive review sentiment',
      severity: 'high',
      impact: 55,
      autoFixable: false,
    });
  }

  // Digital weaknesses noted
  if (lead.digitalWeaknesses && lead.digitalWeaknesses.trim() !== '') {
    const weaknesses = lead.digitalWeaknesses.split(',').map(w => w.trim()).filter(Boolean);
    if (weaknesses.length > 0) {
      gaps.push({
        dimension: 'digital_presence',
        gap: `Digital weaknesses: ${weaknesses.slice(0, 3).join(', ')}`,
        current: lead.digitalWeaknesses,
        ideal: 'No significant digital weaknesses',
        severity: weaknesses.length >= 3 ? 'high' : 'medium',
        impact: Math.min(70, weaknesses.length * 20),
        autoFixable: false,
      });
    }
  }

  return gaps;
}

/**
 * Analyze contact information gaps.
 * This is the most critical dimension — missing contact info blocks conversion.
 */
function analyzeContactInfoGaps(ctx: LeadContext): GapItem[] {
  const gaps: GapItem[] = [];
  const lead = ctx.lead;
  if (!lead) return gaps;

  const hasEmail = !!(lead.email && lead.email.trim() !== '');
  const hasPhone = !!(lead.phone && lead.phone.trim() !== '');
  const hasDecisionMaker = !!(lead.bestContactPerson && lead.bestContactPerson.trim() !== '');
  const hasLinkedIn = !!(lead.linkedin && lead.linkedin.trim() !== '');
  const hasOwner = !!(lead.ownerName && lead.ownerName.trim() !== '');

  // No email
  if (!hasEmail) {
    gaps.push({
      dimension: 'contact_info',
      gap: 'Missing email address',
      current: 'No email recorded',
      ideal: 'Valid business email of decision maker',
      severity: 'critical',
      impact: 95,
      autoFixable: true,
    });
  }

  // No phone
  if (!hasPhone) {
    gaps.push({
      dimension: 'contact_info',
      gap: 'Missing phone number',
      current: 'No phone number recorded',
      ideal: 'Business phone number with country code',
      severity: 'high',
      impact: 70,
      autoFixable: true,
    });
  }

  // No decision maker identified
  if (!hasDecisionMaker && !hasOwner) {
    gaps.push({
      dimension: 'contact_info',
      gap: 'No decision maker identified',
      current: 'No best contact person or owner name recorded',
      ideal: 'Decision maker name, role, and preferred contact method identified',
      severity: 'critical',
      impact: 85,
      autoFixable: true,
    });
  } else if (!hasDecisionMaker && hasOwner) {
    gaps.push({
      dimension: 'contact_info',
      gap: 'Decision maker role unknown',
      current: `Owner: ${lead.ownerName} (role/authority unclear)`,
      ideal: 'Decision maker with confirmed authority and role',
      severity: 'medium',
      impact: 50,
      autoFixable: true,
    });
  }

  // No LinkedIn
  if (!hasLinkedIn) {
    gaps.push({
      dimension: 'contact_info',
      gap: 'Missing LinkedIn profile',
      current: 'No LinkedIn profile recorded',
      ideal: 'LinkedIn company page and/or decision maker profile',
      severity: 'medium',
      impact: 40,
      autoFixable: true,
    });
  }

  // No contact channel identified
  if (!lead.bestChannel || lead.bestChannel.trim() === '') {
    gaps.push({
      dimension: 'contact_info',
      gap: 'Best contact channel unknown',
      current: 'No preferred contact channel identified',
      ideal: 'Preferred contact channel (email, phone, LinkedIn, WhatsApp) identified',
      severity: 'medium',
      impact: 45,
      autoFixable: true,
    });
  }

  // All contact info missing — ultra critical
  if (!hasEmail && !hasPhone && !hasLinkedIn) {
    gaps.push({
      dimension: 'contact_info',
      gap: 'No contact information at all',
      current: 'No email, phone, or LinkedIn available',
      ideal: 'At minimum: email + phone for direct outreach',
      severity: 'critical',
      impact: 100,
      autoFixable: true,
    });
  }

  return gaps;
}

/**
 * Analyze engagement gaps — how well we're engaging with this lead.
 */
function analyzeEngagementGaps(ctx: LeadContext): GapItem[] {
  const gaps: GapItem[] = [];
  const lead = ctx.lead;
  if (!lead) return gaps;

  const now = Date.now();
  const hasOutreach = ctx.outreachMessages.length > 0;
  const hasCommunications = ctx.communications.length > 0;
  const lastContactedAt = lead.lastContactedAt ? new Date(lead.lastContactedAt).getTime() : null;

  // No outreach sent
  if (!hasOutreach && lead.emailStatus === 'none') {
    gaps.push({
      dimension: 'engagement',
      gap: 'No outreach has been sent',
      current: 'Lead has not been contacted yet',
      ideal: 'Personalized outreach sent with follow-up sequence',
      severity: 'critical',
      impact: 90,
      autoFixable: true,
    });
  }

  // No reply received
  const hasReply = ctx.communications.some(c => c.intent === 'positive' || c.intent === 'neutral')
    || ctx.outreachMessages.some(m => m.status === 'replied' || m.status === 'opened');
  if (hasOutreach && !hasReply) {
    gaps.push({
      dimension: 'engagement',
      gap: 'No response to outreach',
      current: `Outreach sent but no reply (${ctx.outreachMessages.length} messages)`,
      ideal: 'Lead has engaged with at least one outreach attempt',
      severity: 'high',
      impact: 75,
      autoFixable: true,
    });
  }

  // Long time since last contact
  if (lastContactedAt) {
    const daysSinceContact = Math.floor((now - lastContactedAt) / (1000 * 60 * 60 * 24));
    if (daysSinceContact > 30) {
      gaps.push({
        dimension: 'engagement',
        gap: 'Stale lead — no contact in 30+ days',
        current: `Last contacted ${daysSinceContact} days ago`,
        ideal: 'Contact within the last 7 days with active follow-up cadence',
        severity: 'high',
        impact: 70,
        autoFixable: true,
      });
    } else if (daysSinceContact > 14) {
      gaps.push({
        dimension: 'engagement',
        gap: 'Lead cooling — no contact in 14+ days',
        current: `Last contacted ${daysSinceContact} days ago`,
        ideal: 'Contact within the last 7 days',
        severity: 'medium',
        impact: 50,
        autoFixable: true,
      });
    }
  }

  // Email status issues
  if (lead.emailStatus === 'bounced') {
    gaps.push({
      dimension: 'engagement',
      gap: 'Email bounced — invalid email address',
      current: 'Email bounced on last outreach attempt',
      ideal: 'Valid, deliverable email address',
      severity: 'critical',
      impact: 85,
      autoFixable: true,
    });
  } else if (lead.emailStatus === 'unsubscribed') {
    gaps.push({
      dimension: 'engagement',
      gap: 'Lead unsubscribed from emails',
      current: 'Lead has opted out of email communication',
      ideal: 'Lead engaged through alternative channels (phone, LinkedIn, WhatsApp)',
      severity: 'high',
      impact: 65,
      autoFixable: false,
    });
  }

  // No follow-up scheduled
  if (!lead.followUpAt && hasOutreach) {
    gaps.push({
      dimension: 'engagement',
      gap: 'No follow-up scheduled',
      current: 'Outreach was sent but no follow-up is planned',
      ideal: 'Automated follow-up sequence with next touch scheduled',
      severity: 'medium',
      impact: 50,
      autoFixable: true,
    });
  }

  return gaps;
}

/**
 * Analyze competitive gaps — how the lead compares to similar businesses.
 */
function analyzeCompetitiveGaps(ctx: LeadContext): GapItem[] {
  const gaps: GapItem[] = [];
  const lead = ctx.lead;
  if (!lead) return gaps;

  // No competitor analysis done
  if (ctx.competitors.length === 0) {
    gaps.push({
      dimension: 'competitive',
      gap: 'No competitive analysis performed',
      current: 'No competitors analyzed for this lead',
      ideal: 'At least 2-3 competitors analyzed with strengths/weaknesses identified',
      severity: 'medium',
      impact: 45,
      autoFixable: false,
    });
  }

  // Check competitor threat levels
  const highThreatCompetitors = ctx.competitors.filter(c => c.threatLevel === 'high');
  if (highThreatCompetitors.length > 0) {
    gaps.push({
      dimension: 'competitive',
      gap: `High-competition: ${highThreatCompetitors.length} strong competitor(s) identified`,
      current: `Competing against: ${highThreatCompetitors.map(c => c.competitorName).join(', ')}`,
      ideal: 'Clear competitive differentiation strategy with unique value propositions',
      severity: 'high',
      impact: 65,
      autoFixable: false,
    });
  }

  // Lead analysis missing competitive context
  if (!ctx.analysis || !ctx.analysis.closingStrategy) {
    gaps.push({
      dimension: 'competitive',
      gap: 'No closing strategy defined',
      current: 'No competitive closing strategy documented',
      ideal: 'Tailored closing strategy that addresses competitive alternatives',
      severity: 'medium',
      impact: 40,
      autoFixable: false,
    });
  }

  // Missing differentiation opportunities
  if (ctx.competitors.length > 0 && !ctx.competitors.some(c => c.differentiationOpportunities)) {
    gaps.push({
      dimension: 'competitive',
      gap: 'Differentiation opportunities not explored',
      current: 'Competitors identified but no differentiation analysis done',
      ideal: 'Clear differentiation points vs. each major competitor',
      severity: 'medium',
      impact: 35,
      autoFixable: false,
    });
  }

  return gaps;
}

/**
 * Analyze revenue opportunity gaps — revenue potential vs pipeline.
 */
function analyzeRevenueGaps(ctx: LeadContext): GapItem[] {
  const gaps: GapItem[] = [];
  const lead = ctx.lead;
  if (!lead) return gaps;

  // No revenue estimation
  if (!lead.estimatedRevenue || lead.estimatedRevenue === 'medium') {
    // Default "medium" means it wasn't actually estimated
    const wasEstimated = ctx.analysis?.estimatedDealValueInr || ctx.analysis?.estimatedDealValueUsd;
    if (!wasEstimated) {
      gaps.push({
        dimension: 'revenue',
        gap: 'Revenue potential not estimated',
        current: `Estimated revenue tier: ${lead.estimatedRevenue || 'unknown'}`,
        ideal: 'Specific deal value estimate based on business size, niche, and market',
        severity: 'medium',
        impact: 40,
        autoFixable: false,
      });
    }
  }

  // No deal created
  if (ctx.deals.length === 0 && lead.stage !== 'discovered') {
    gaps.push({
      dimension: 'revenue',
      gap: 'No deal created for this lead',
      current: `Lead is in "${lead.stage}" stage but no deal exists`,
      ideal: 'Active deal with proposed price, scope, and timeline',
      severity: 'high',
      impact: 60,
      autoFixable: false,
    });
  }

  // Low revenue potential score
  if (lead.revenuePotentialScore < 30) {
    gaps.push({
      dimension: 'revenue',
      gap: 'Low revenue potential score',
      current: `Revenue potential score: ${lead.revenuePotentialScore}/100`,
      ideal: 'Revenue potential score of 60+ indicating strong opportunity',
      severity: 'medium',
      impact: 35,
      autoFixable: false,
    });
  }

  // Stale deals
  const activeDeals = ctx.deals.filter(d => d.status === 'draft' || d.status === 'proposed' || d.status === 'negotiation');
  if (activeDeals.length > 0) {
    const staleDeals = activeDeals.filter(d => {
      const daysSinceUpdate = Math.floor((Date.now() - new Date(d.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
      return daysSinceUpdate > 14;
    });
    if (staleDeals.length > 0) {
      gaps.push({
        dimension: 'revenue',
        gap: `${staleDeals.length} deal(s) stale for 14+ days`,
        current: `Deal(s) stuck in ${staleDeals.map(d => d.status).join(', ')} status`,
        ideal: 'Active deal progression with regular touchpoints',
        severity: 'high',
        impact: 55,
        autoFixable: false,
      });
    }
  }

  return gaps;
}

/**
 * Analyze technology gaps — tech stack maturity and missing tools.
 */
function analyzeTechnologyGaps(ctx: LeadContext): GapItem[] {
  const gaps: GapItem[] = [];
  const lead = ctx.lead;
  if (!lead) return gaps;

  // Parse tech stack
  let techStack: string[] = [];
  if (lead.techStack) {
    try {
      techStack = JSON.parse(lead.techStack);
      if (!Array.isArray(techStack)) techStack = [];
    } catch {
      techStack = [];
    }
  }

  // No tech stack data
  if (techStack.length === 0) {
    gaps.push({
      dimension: 'technology',
      gap: 'Technology stack unknown',
      current: 'No tech stack information recorded',
      ideal: 'Complete tech stack with categories (CMS, CRM, analytics, marketing tools)',
      severity: 'low',
      impact: 20,
      autoFixable: true,
    });
  } else if (techStack.length <= 2) {
    gaps.push({
      dimension: 'technology',
      gap: 'Minimal technology stack detected',
      current: `Only ${techStack.length} tool(s): ${techStack.join(', ')}`,
      ideal: 'Modern tech stack with CRM, analytics, marketing automation, CMS',
      severity: 'low',
      impact: 25,
      autoFixable: false,
    });
  }

  // Check for common modern tool gaps
  const modernCategories = ['CRM', 'analytics', 'marketing', 'automation', 'CMS'];
  const hasCRM = techStack.some(t => /hubspot|salesforce|pipedrive|zoho|freshsales/i.test(t));
  const hasAnalytics = techStack.some(t => /google analytics|ga4|mixpanel|amplitude|hotjar/i.test(t));
  const hasMarketing = techStack.some(t => /mailchimp|constant contact|sendgrid|klaviyo|activecampaign/i.test(t));

  if (techStack.length > 0 && !hasCRM) {
    gaps.push({
      dimension: 'technology',
      gap: 'No CRM detected in tech stack',
      current: `Tech stack: ${techStack.join(', ')} — no CRM found`,
      ideal: 'CRM system for lead and customer management',
      severity: 'low',
      impact: 15,
      autoFixable: false,
    });
  }

  if (techStack.length > 0 && !hasAnalytics) {
    gaps.push({
      dimension: 'technology',
      gap: 'No analytics tool detected',
      current: `Tech stack: ${techStack.join(', ')} — no analytics found`,
      ideal: 'Web analytics for data-driven decisions',
      severity: 'low',
      impact: 10,
      autoFixable: false,
    });
  }

  // Website quality correlates with tech maturity
  if (lead.websiteQuality === 'poor' && techStack.length === 0) {
    gaps.push({
      dimension: 'technology',
      gap: 'Low technology maturity — both website and tools are weak',
      current: 'Poor website and no tech stack detected',
      ideal: 'Professional website with integrated marketing and analytics tools',
      severity: 'medium',
      impact: 35,
      autoFixable: false,
    });
  }

  return gaps;
}

// ═══════════════════════════════════════════════════════════════════
// AI-POWERED DEEP ANALYSIS
// ═══════════════════════════════════════════════════════════════════

/**
 * Use AI to generate deeper insights, recommendations, and conversion
 * probability based on the rule-based gap analysis results.
 */
async function performAIDeepAnalysis(
  ctx: LeadContext,
  ruleBasedGaps: GapItem[]
): Promise<{
  aiGaps: GapItem[];
  recommendations: GapRecommendation[];
  conversionProbability: number;
  estimatedRevenueImpact: string;
}> {
  const lead = ctx.lead;
  if (!lead) {
    return {
      aiGaps: [],
      recommendations: [],
      conversionProbability: 0,
      estimatedRevenueImpact: 'Unknown',
    };
  }

  // Build context summary
  const contextSummary = buildContextSummary(ctx);
  const gapsSummary = ruleBasedGaps.map(g =>
    `[${g.dimension}] ${g.gap} (severity: ${g.severity}, impact: ${g.impact}, current: "${g.current}", ideal: "${g.ideal}")`
  ).join('\n');

  const prompt = `You are an expert sales analyst performing gap analysis for lead conversion. Given the lead data and identified gaps, provide:

1. Any ADDITIONAL gaps not caught by rule-based analysis ( nuanced or contextual)
2. Prioritized recommendations for closing each gap
3. Conversion probability (0-100) based on current state
4. Estimated revenue impact description

LEAD DATA:
${contextSummary}

RULE-BASED GAPS ALREADY IDENTIFIED:
${gapsSummary || 'No gaps identified by rules'}

Return a JSON object with this exact structure:
{
  "additionalGaps": [
    {
      "dimension": "digital_presence|contact_info|engagement|competitive|revenue|technology",
      "gap": "Description of the gap",
      "current": "Current state",
      "ideal": "Ideal state",
      "severity": "critical|high|medium|low",
      "impact": 0-100,
      "autoFixable": true/false
    }
  ],
  "recommendations": [
    {
      "gap": "Which gap this addresses",
      "action": "Specific actionable recommendation",
      "priority": "immediate|short_term|long_term",
      "estimatedEffort": "low|medium|high",
      "impactOnConversion": 0-20 (percentage points this could improve)
    }
  ],
  "conversionProbability": 0-100,
  "estimatedRevenueImpact": "Brief description of revenue potential and risk"
}

Be specific and actionable. Focus on gaps that directly impact conversion probability.
Return ONLY the JSON object. No markdown, no explanations.`;

  try {
    const zai = await ZAI.create();

    const response = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a precise sales analytics assistant. Return only valid JSON. No markdown, no explanations. You specialize in identifying conversion gaps and providing actionable recommendations.',
        },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
    });

    const content = response.choices?.[0]?.message?.content || '{}';

    const parsed = safeParseJSON<{
      additionalGaps?: Array<{
        dimension: string;
        gap: string;
        current: string;
        ideal: string;
        severity: string;
        impact: number;
        autoFixable: boolean;
      }>;
      recommendations?: Array<{
        gap: string;
        action: string;
        priority: string;
        estimatedEffort: string;
        impactOnConversion: number;
      }>;
      conversionProbability?: number;
      estimatedRevenueImpact?: string;
    }>(content, {});

    // Validate and normalize AI gaps
    const validDimensions = ['digital_presence', 'contact_info', 'engagement', 'competitive', 'revenue', 'technology'];
    const validSeverities = ['critical', 'high', 'medium', 'low'];

    const aiGaps: GapItem[] = (parsed.additionalGaps || [])
      .filter(g => validDimensions.includes(g.dimension) && g.gap)
      .map(g => ({
        dimension: g.dimension as GapItem['dimension'],
        gap: g.gap,
        current: g.current || 'Unknown',
        ideal: g.ideal || 'Unknown',
        severity: validSeverities.includes(g.severity) ? g.severity as GapItem['severity'] : 'medium',
        impact: Math.max(0, Math.min(100, g.impact || 30)),
        autoFixable: !!g.autoFixable,
      }));

    // Validate recommendations
    const validPriorities = ['immediate', 'short_term', 'long_term'];
    const validEfforts = ['low', 'medium', 'high'];

    const recommendations: GapRecommendation[] = (parsed.recommendations || [])
      .filter(r => r.action && r.gap)
      .map(r => ({
        gap: r.gap,
        action: r.action,
        priority: validPriorities.includes(r.priority) ? r.priority as GapRecommendation['priority'] : 'short_term',
        estimatedEffort: validEfforts.includes(r.estimatedEffort) ? r.estimatedEffort as GapRecommendation['estimatedEffort'] : 'medium',
        impactOnConversion: Math.max(0, Math.min(20, r.impactOnConversion || 0)),
      }));

    const conversionProbability = Math.max(0, Math.min(100, parsed.conversionProbability || 0));
    const estimatedRevenueImpact = parsed.estimatedRevenueImpact || 'Impact assessment unavailable';

    return { aiGaps, recommendations, conversionProbability, estimatedRevenueImpact };
  } catch (error) {
    console.error('[GapAnalysis] AI deep analysis failed:', error);
    return {
      aiGaps: [],
      recommendations: [],
      conversionProbability: 0,
      estimatedRevenueImpact: 'AI analysis unavailable',
    };
  }
}

/**
 * Build a human-readable context summary of the lead for AI prompts.
 */
function buildContextSummary(ctx: LeadContext): string {
  const lead = ctx.lead;
  if (!lead) return 'No lead data available';

  const parts: string[] = [];

  // Basic info
  parts.push(`Business: ${lead.businessName}`);
  if (lead.ownerName) parts.push(`Owner: ${lead.ownerName}`);
  if (lead.niche) parts.push(`Niche: ${lead.niche}`);
  if (lead.city || lead.country) parts.push(`Location: ${[lead.city, lead.country].filter(Boolean).join(', ')}`);
  parts.push(`Stage: ${lead.stage}`);
  parts.push(`Email Status: ${lead.emailStatus || 'none'}`);

  // Contact info
  const contactParts: string[] = [];
  if (lead.email) contactParts.push(`Email: ${lead.email}`);
  if (lead.phone) contactParts.push(`Phone: ${lead.phone}`);
  if (lead.linkedin) contactParts.push(`LinkedIn: ${lead.linkedin}`);
  if (lead.bestContactPerson) contactParts.push(`Best Contact: ${lead.bestContactPerson}`);
  if (lead.bestChannel) contactParts.push(`Best Channel: ${lead.bestChannel}`);
  if (contactParts.length > 0) parts.push(`Contact: ${contactParts.join(', ')}`);

  // Digital presence
  const digitalParts: string[] = [];
  if (lead.website) digitalParts.push(`Website: ${lead.website}`);
  if (lead.websiteQuality) digitalParts.push(`Website Quality: ${lead.websiteQuality}`);
  if (lead.rating) digitalParts.push(`Rating: ${lead.rating}/5`);
  if (lead.hasWebsite) digitalParts.push('Has Website: yes');
  if (lead.digitalWeaknesses) digitalParts.push(`Weaknesses: ${lead.digitalWeaknesses}`);
  if (digitalParts.length > 0) parts.push(`Digital: ${digitalParts.join(', ')}`);

  // Scores
  parts.push(`Scores - Reply: ${lead.replyScore}, Conversion: ${lead.conversionScore}, Urgency: ${lead.urgencyScore}, Revenue: ${lead.revenuePotentialScore}`);

  // Engagement
  parts.push(`Outreach messages sent: ${ctx.outreachMessages.length}`);
  parts.push(`Communications: ${ctx.communications.length}`);
  if (lead.lastContactedAt) {
    const daysSince = Math.floor((Date.now() - new Date(lead.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24));
    parts.push(`Last contacted: ${daysSince} days ago`);
  }
  if (lead.followUpAt) parts.push(`Follow-up scheduled: ${new Date(lead.followUpAt).toISOString()}`);

  // Revenue
  if (lead.estimatedRevenue) parts.push(`Estimated Revenue: ${lead.estimatedRevenue}`);
  if (ctx.deals.length > 0) {
    parts.push(`Deals: ${ctx.deals.length} (statuses: ${ctx.deals.map(d => d.status).join(', ')})`);
  }

  // Tech stack
  if (lead.techStack) {
    try {
      const stack = JSON.parse(lead.techStack);
      if (Array.isArray(stack)) parts.push(`Tech Stack: ${stack.join(', ')}`);
    } catch {
      // Skip malformed
    }
  }

  // Competitors
  if (ctx.competitors.length > 0) {
    parts.push(`Competitors analyzed: ${ctx.competitors.length} (${ctx.competitors.map(c => c.competitorName).join(', ')})`);
  }

  // Previous analysis
  if (ctx.analysis) {
    if (ctx.analysis.decisionMaker) parts.push(`Decision Maker: ${ctx.analysis.decisionMaker}`);
    if (ctx.analysis.recommendedServices) parts.push(`Recommended Services: ${ctx.analysis.recommendedServices}`);
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// SEVERITY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════

function classifySeverity(impact: number): GapItem['severity'] {
  if (impact >= SEVERITY_THRESHOLDS.critical) return 'critical';
  if (impact >= SEVERITY_THRESHOLDS.high) return 'high';
  if (impact >= SEVERITY_THRESHOLDS.medium) return 'medium';
  return 'low';
}

// ═══════════════════════════════════════════════════════════════════
// OVERALL SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════════

function calculateOverallScore(gaps: GapItem[]): number {
  if (gaps.length === 0) return 100;

  // Calculate weighted gap penalty per dimension
  const dimensionPenalties: Record<GapItem['dimension'], number> = {
    digital_presence: 0,
    contact_info: 0,
    engagement: 0,
    competitive: 0,
    revenue: 0,
    technology: 0,
  };

  for (const gap of gaps) {
    dimensionPenalties[gap.dimension] += gap.impact;
  }

  // Calculate weighted score (0-100, where 100 = no gaps)
  let totalPenalty = 0;
  for (const [dimension, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    const maxPenalty = 100; // Max possible penalty per dimension
    const dimensionPenalty = Math.min(maxPenalty, dimensionPenalties[dimension as GapItem['dimension']]);
    totalPenalty += dimensionPenalty * weight;
  }

  return Math.max(0, Math.round(100 - totalPenalty));
}

// ═══════════════════════════════════════════════════════════════════
// PRIORITY ACTION GENERATION
// ═══════════════════════════════════════════════════════════════════

function generatePriorityActions(leadId: string, gaps: GapItem[]): PriorityAction[] {
  const actions: PriorityAction[] = [];

  // Sort gaps by impact (highest first)
  const sortedGaps = [...gaps].sort((a, b) => b.impact - a.impact);

  for (const gap of sortedGaps) {
    // Auto-trigger enrichment for critical contact gaps
    if (gap.dimension === 'contact_info' && gap.severity === 'critical' && gap.autoFixable) {
      actions.push({
        action: `Run lead enrichment to find ${gap.gap.toLowerCase()}`,
        type: 'enrich',
        leadId,
        reason: `Critical gap: ${gap.gap} — enrichment can auto-fill this`,
        autoTrigger: true,
      });
    }

    // Auto-trigger outreach for engagement gaps
    if (gap.dimension === 'engagement' && gap.autoFixable) {
      if (gap.gap.includes('No outreach') || gap.gap.includes('No contact')) {
        actions.push({
          action: 'Initiate outreach sequence for this lead',
          type: 'outreach',
          leadId,
          reason: `Engagement gap: ${gap.gap}`,
          autoTrigger: true,
        });
      } else if (gap.gap.includes('Stale') || gap.gap.includes('cooling')) {
        actions.push({
          action: 'Send re-engagement message to this lead',
          type: 'outreach',
          leadId,
          reason: `Engagement gap: ${gap.gap}`,
          autoTrigger: true,
        });
      }
    }

    // Recommend research for competitive gaps
    if (gap.dimension === 'competitive' && gap.severity === 'high') {
      actions.push({
        action: 'Conduct competitive analysis for differentiation strategy',
        type: 'research',
        leadId,
        reason: `Competitive gap: ${gap.gap}`,
        autoTrigger: false,
      });
    }

    // Recommend meeting for revenue gaps
    if (gap.dimension === 'revenue' && gap.gap.includes('stale deal')) {
      actions.push({
        action: 'Schedule a meeting to revive the stalled deal',
        type: 'meeting',
        leadId,
        reason: `Revenue gap: ${gap.gap}`,
        autoTrigger: false,
      });
    }

    // Manual action for non-auto-fixable gaps
    if (!gap.autoFixable && gap.severity === 'critical') {
      actions.push({
        action: `Manually address: ${gap.gap}`,
        type: 'manual',
        leadId,
        reason: `Critical gap requiring manual intervention: ${gap.gap}`,
        autoTrigger: false,
      });
    }
  }

  // Deduplicate by type (keep highest impact per type)
  const seenTypes = new Set<string>();
  return actions.filter(action => {
    const key = `${action.type}:${action.reason}`;
    if (seenTypes.has(key)) return false;
    seenTypes.add(key);
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════
// CORE: analyzeLeadGaps
// ═══════════════════════════════════════════════════════════════════

/**
 * Perform comprehensive AI-powered gap analysis for a single lead.
 *
 * Steps:
 * 1. Validate access
 * 2. Deduct credits (3 credits)
 * 3. Build lead context from DB
 * 4. Run rule-based gap analysis (6 dimensions)
 * 5. Run AI deep analysis for additional insights
 * 6. Merge results, calculate scores
 * 7. Generate priority actions
 * 8. Store results in LeadActivity
 * 9. Send notifications for critical gaps
 * 10. Return structured result
 */
export async function analyzeLeadGaps(
  leadId: string,
  userId: string
): Promise<{ success: boolean; analysis?: GapAnalysis; error?: string }> {
  try {
    // Step 1: Validate access
    const hasAccess = await validateLeadAccess(leadId, userId);
    if (!hasAccess) {
      return { success: false, error: 'Lead not found or access denied' };
    }

    // Step 2: Deduct credits
    const creditResult = await deductCredits({
      userId,
      action: GAP_ANALYSIS_ACTION,
      cost: GAP_ANALYSIS_CREDIT_COST,
      referenceId: leadId,
    });

    if (!creditResult.success) {
      return { success: false, error: creditResult.error || 'Insufficient credits' };
    }

    // Step 3: Build context
    const ctx = await buildLeadContext(leadId);

    if (!ctx.lead) {
      // Refund credits if lead not found after access check
      await refundCredits({
        userId,
        amount: GAP_ANALYSIS_CREDIT_COST,
        originalAction: GAP_ANALYSIS_ACTION,
        referenceId: leadId,
      }).catch(() => {});
      return { success: false, error: 'Lead not found' };
    }

    // Step 4: Rule-based gap analysis across all dimensions
    const digitalPresenceGaps = analyzeDigitalPresenceGaps(ctx);
    const contactInfoGaps = analyzeContactInfoGaps(ctx);
    const engagementGaps = analyzeEngagementGaps(ctx);
    const competitiveGaps = analyzeCompetitiveGaps(ctx);
    const revenueGaps = analyzeRevenueGaps(ctx);
    const technologyGaps = analyzeTechnologyGaps(ctx);

    const allRuleBasedGaps: GapItem[] = [
      ...digitalPresenceGaps,
      ...contactInfoGaps,
      ...engagementGaps,
      ...competitiveGaps,
      ...revenueGaps,
      ...technologyGaps,
    ];

    // Re-classify severity for all gaps
    for (const gap of allRuleBasedGaps) {
      gap.severity = classifySeverity(gap.impact);
    }

    // Step 5: AI deep analysis
    const aiResult = await performAIDeepAnalysis(ctx, allRuleBasedGaps);

    // Step 6: Merge and calculate
    const allGaps = [...allRuleBasedGaps, ...aiResult.aiGaps];

    // Sort by impact (highest first)
    allGaps.sort((a, b) => b.impact - a.impact);

    const overallScore = calculateOverallScore(allGaps);

    // Generate priority actions
    const priorityActions = generatePriorityActions(leadId, allGaps);

    // Generate rule-based recommendations for gaps without AI recs
    const ruleBasedRecommendations: GapRecommendation[] = generateRuleBasedRecommendations(allGaps);

    // Merge recommendations (AI ones take priority, rule-based fill gaps)
    const coveredGaps = new Set(aiResult.recommendations.map(r => r.gap));
    const supplementalRecs = ruleBasedRecommendations.filter(r => !coveredGaps.has(r.gap));
    const allRecommendations = [...aiResult.recommendations, ...supplementalRecs];

    // Sort recommendations by impact
    allRecommendations.sort((a, b) => b.impactOnConversion - a.impactOnConversion);

    // Calculate conversion probability
    // Use AI estimate if available, otherwise calculate from gaps
    let conversionProbability = aiResult.conversionProbability;
    if (conversionProbability === 0) {
      // Fallback: estimate from gap severity
      const criticalCount = allGaps.filter(g => g.severity === 'critical').length;
      const highCount = allGaps.filter(g => g.severity === 'high').length;
      conversionProbability = Math.max(5, 100 - (criticalCount * 25) - (highCount * 10));
    }

    // Revenue impact
    const estimatedRevenueImpact = aiResult.estimatedRevenueImpact;

    // Build final analysis
    const analysis: GapAnalysis = {
      leadId,
      overallScore,
      gaps: allGaps,
      recommendations: allRecommendations,
      priorityActions,
      conversionProbability: Math.round(conversionProbability),
      estimatedRevenueImpact,
    };

    // Step 7: Store results in LeadActivity
    await db.leadActivity.create({
      data: {
        leadId,
        type: 'gap_analysis_completed',
        description: `Gap analysis completed: score ${overallScore}/100, ${allGaps.length} gaps found (${allGaps.filter(g => g.severity === 'critical').length} critical)`,
        metadata: JSON.stringify({
          overallScore,
          gapCount: allGaps.length,
          criticalCount: allGaps.filter(g => g.severity === 'critical').length,
          highCount: allGaps.filter(g => g.severity === 'high').length,
          mediumCount: allGaps.filter(g => g.severity === 'medium').length,
          lowCount: allGaps.filter(g => g.severity === 'low').length,
          conversionProbability: analysis.conversionProbability,
          dimensions: {
            digital_presence: digitalPresenceGaps.length,
            contact_info: contactInfoGaps.length,
            engagement: engagementGaps.length,
            competitive: competitiveGaps.length,
            revenue: revenueGaps.length,
            technology: technologyGaps.length,
          },
          priorityActionCount: priorityActions.length,
          autoTriggerCount: priorityActions.filter(a => a.autoTrigger).length,
          estimatedRevenueImpact,
        }),
      },
    });

    // Step 8: Send notifications for critical gaps
    const criticalGaps = allGaps.filter(g => g.severity === 'critical');
    if (criticalGaps.length > 0) {
      await sendNotification({
        userId,
        type: 'ai_analysis_complete',
        title: `Critical Gaps Found: ${ctx.lead.businessName}`,
        message: `${criticalGaps.length} critical gap(s) identified for ${ctx.lead.businessName}. Overall score: ${overallScore}/100. Top gap: ${criticalGaps[0].gap}`,
        actionUrl: `/leads/${leadId}`,
        metadata: {
          leadId,
          analysisType: 'gap_analysis',
          overallScore,
          criticalCount: criticalGaps.length,
        },
      }).catch(() => {}); // Never block on notification failure
    }

    // Step 9: Audit log
    await logAuditEvent(userId, 'lead_updated', {
      action: 'gap_analysis_completed',
      leadId,
      businessName: ctx.lead.businessName,
      overallScore,
      gapCount: allGaps.length,
      criticalCount: criticalGaps.length,
      conversionProbability: analysis.conversionProbability,
    });

    return { success: true, analysis };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown gap analysis error';
    console.error(`[GapAnalysis] Failed for lead ${leadId}:`, error);

    // Attempt credit refund on failure
    await refundCredits({
      userId,
      amount: GAP_ANALYSIS_CREDIT_COST,
      originalAction: GAP_ANALYSIS_ACTION,
      referenceId: leadId,
    }).catch(() => {});

    return { success: false, error: message };
  }
}

// ═══════════════════════════════════════════════════════════════════
// RULE-BASED RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════

function generateRuleBasedRecommendations(gaps: GapItem[]): GapRecommendation[] {
  const recommendations: GapRecommendation[] = [];

  for (const gap of gaps) {
    const rec = generateRecommendationForGap(gap);
    if (rec) recommendations.push(rec);
  }

  return recommendations;
}

function generateRecommendationForGap(gap: GapItem): GapRecommendation | null {
  // Map common gap patterns to specific recommendations
  const recommendationMap: Record<string, GapRecommendation> = {
    'Missing email address': {
      gap: gap.gap,
      action: 'Run lead enrichment to discover the business email address. Try searching LinkedIn, company website, or WHOIS records.',
      priority: 'immediate',
      estimatedEffort: 'low',
      impactOnConversion: 15,
    },
    'Missing phone number': {
      gap: gap.gap,
      action: 'Enrich lead data to find phone number. Check Google Business listing, website contact page, or social profiles.',
      priority: 'immediate',
      estimatedEffort: 'low',
      impactOnConversion: 10,
    },
    'No decision maker identified': {
      gap: gap.gap,
      action: 'Research the company on LinkedIn to identify the decision maker. Look for CEO, founder, VP, or director roles.',
      priority: 'immediate',
      estimatedEffort: 'medium',
      impactOnConversion: 12,
    },
    'No outreach has been sent': {
      gap: gap.gap,
      action: 'Generate and send a personalized outreach message immediately. Use AI outreach generation with the lead context.',
      priority: 'immediate',
      estimatedEffort: 'low',
      impactOnConversion: 18,
    },
    'Missing business website': {
      gap: gap.gap,
      action: 'Search for the business website manually or via enrichment. A website is critical for understanding the lead and crafting outreach.',
      priority: 'short_term',
      estimatedEffort: 'low',
      impactOnConversion: 8,
    },
    'Poor website quality': {
      gap: gap.gap,
      action: 'Use website quality analysis to document specific improvements. Position your offering as a solution to their digital weaknesses.',
      priority: 'short_term',
      estimatedEffort: 'medium',
      impactOnConversion: 7,
    },
    'No social media presence detected': {
      gap: gap.gap,
      action: 'Run enrichment to discover social profiles. Social presence provides outreach channels and competitive intelligence.',
      priority: 'short_term',
      estimatedEffort: 'low',
      impactOnConversion: 5,
    },
    'No Google Maps listing': {
      gap: gap.gap,
      action: 'Check if the business has a Google Business Profile. Missing listings indicate a digital presence opportunity.',
      priority: 'long_term',
      estimatedEffort: 'low',
      impactOnConversion: 4,
    },
    'Missing LinkedIn profile': {
      gap: gap.gap,
      action: 'Search LinkedIn for the company and key contacts. LinkedIn is often the best channel for B2B outreach.',
      priority: 'short_term',
      estimatedEffort: 'low',
      impactOnConversion: 6,
    },
    'No response to outreach': {
      gap: gap.gap,
      action: 'Try a different channel (phone, LinkedIn, WhatsApp). Adjust messaging tone and value proposition. Consider a follow-up sequence.',
      priority: 'immediate',
      estimatedEffort: 'medium',
      impactOnConversion: 10,
    },
    'Stale lead': {
      gap: gap.gap,
      action: 'Send a re-engagement message with new value proposition or updated offering. Consider a "checking in" approach.',
      priority: 'immediate',
      estimatedEffort: 'low',
      impactOnConversion: 8,
    },
    'Lead cooling': {
      gap: gap.gap,
      action: 'Send a personalized follow-up referencing the previous conversation. Add new value or insight to rekindle interest.',
      priority: 'short_term',
      estimatedEffort: 'low',
      impactOnConversion: 7,
    },
    'Email bounced': {
      gap: gap.gap,
      action: 'Run enrichment to find a valid email. Try alternative email formats or contact via other channels.',
      priority: 'immediate',
      estimatedEffort: 'low',
      impactOnConversion: 14,
    },
    'No competitive analysis performed': {
      gap: gap.gap,
      action: 'Add 2-3 key competitors and run competitive analysis. Understanding the landscape improves your pitch.',
      priority: 'short_term',
      estimatedEffort: 'medium',
      impactOnConversion: 5,
    },
    'No deal created for this lead': {
      gap: gap.gap,
      action: 'Create a deal with estimated value, scope, and timeline. This moves the lead into the active pipeline.',
      priority: 'short_term',
      estimatedEffort: 'low',
      impactOnConversion: 8,
    },
    'Technology stack unknown': {
      gap: gap.gap,
      action: 'Run enrichment or check the website for tech stack indicators. Knowing their tools helps tailor the pitch.',
      priority: 'long_term',
      estimatedEffort: 'low',
      impactOnConversion: 3,
    },
    'No contact information at all': {
      gap: gap.gap,
      action: 'URGENT: Run full lead enrichment immediately. Without any contact info, this lead cannot be converted. Try web search, social media, and business directories.',
      priority: 'immediate',
      estimatedEffort: 'medium',
      impactOnConversion: 20,
    },
  };

  // Find matching recommendation
  for (const [key, rec] of Object.entries(recommendationMap)) {
    if (gap.gap.includes(key) || key.includes(gap.gap)) {
      return { ...rec, gap: gap.gap };
    }
  }

  // Default recommendation for unmatched gaps
  return {
    gap: gap.gap,
    action: `Address the "${gap.gap}" gap in the ${gap.dimension.replace('_', ' ')} dimension. Current: "${gap.current}". Target: "${gap.ideal}".`,
    priority: gap.severity === 'critical' ? 'immediate' : gap.severity === 'high' ? 'short_term' : 'long_term',
    estimatedEffort: gap.autoFixable ? 'low' : 'medium',
    impactOnConversion: Math.round(gap.impact / 8),
  };
}

// ═══════════════════════════════════════════════════════════════════
// BATCH GAP ANALYSIS
// ═══════════════════════════════════════════════════════════════════

/**
 * Analyze gaps for multiple leads at once.
 * Processes sequentially to respect credit and API rate limits.
 */
export async function batchAnalyzeGaps(
  leadIds: string[],
  userId: string
): Promise<BatchGapResult> {
  const results: BatchGapResult['results'] = [];
  let analyzed = 0;
  let failed = 0;
  let skipped = 0;

  // Deduplicate lead IDs
  const uniqueLeadIds = [...new Set(leadIds)];

  for (const leadId of uniqueLeadIds) {
    try {
      const result = await analyzeLeadGaps(leadId, userId);

      if (result.success) {
        analyzed++;
        results.push({
          leadId,
          success: true,
          analysis: result.analysis,
        });
      } else if (result.error?.includes('Insufficient credits')) {
        skipped++;
        results.push({
          leadId,
          success: false,
          error: 'Insufficient credits',
        });
      } else {
        failed++;
        results.push({
          leadId,
          success: false,
          error: result.error,
        });
      }

      // Small delay between analyses to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      failed++;
      results.push({
        leadId,
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  }

  // Audit log for batch operation
  await logAuditEvent(userId, 'lead_updated', {
    action: 'batch_gap_analysis_completed',
    totalLeads: uniqueLeadIds.length,
    analyzed,
    failed,
    skipped,
  });

  return {
    total: uniqueLeadIds.length,
    analyzed,
    failed,
    skipped,
    results,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GAP TRENDS
// ═══════════════════════════════════════════════════════════════════

/**
 * Track how gaps are closing over time for a user's leads.
 * Analyzes historical gap analysis results from LeadActivity records.
 */
export async function getGapTrends(userId: string): Promise<GapTrendsSummary> {
  try {
    // Get all gap analysis activities for this user's leads
    const userLeads = await db.lead.findMany({
      where: { userId, isActive: true },
      select: { id: true },
    });

    const leadIds = userLeads.map(l => l.id);

    if (leadIds.length === 0) {
      return {
        period: '30d',
        totalAnalyses: 0,
        averageScore: 0,
        scoreTrend: 'stable',
        dimensionAverages: {
          digital_presence: 0,
          contact_info: 0,
          engagement: 0,
          competitive: 0,
          revenue: 0,
          technology: 0,
        },
        mostCommonGaps: [],
        autoFixableCount: 0,
        criticalCount: 0,
        conversionProbabilityAvg: 0,
      };
    }

    // Get gap analysis activities from the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const activities = await db.leadActivity.findMany({
      where: {
        leadId: { in: leadIds },
        type: 'gap_analysis_completed',
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activities.length === 0) {
      return {
        period: '30d',
        totalAnalyses: 0,
        averageScore: 0,
        scoreTrend: 'stable',
        dimensionAverages: {
          digital_presence: 0,
          contact_info: 0,
          engagement: 0,
          competitive: 0,
          revenue: 0,
          technology: 0,
        },
        mostCommonGaps: [],
        autoFixableCount: 0,
        criticalCount: 0,
        conversionProbabilityAvg: 0,
      };
    }

    // Parse all analysis metadata
    const parsedAnalyses = activities
      .map(activity => {
        try {
          const metadata = JSON.parse(activity.metadata || '{}');
          return {
            ...metadata,
            createdAt: activity.createdAt,
            leadId: activity.leadId,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{
        overallScore: number;
        gapCount: number;
        criticalCount: number;
        highCount: number;
        mediumCount: number;
        lowCount: number;
        conversionProbability: number;
        dimensions: Record<string, number>;
        autoTriggerCount: number;
        estimatedRevenueImpact: string;
        createdAt: Date;
        leadId: string;
      }>;

    // Calculate averages
    const totalAnalyses = parsedAnalyses.length;
    const averageScore = Math.round(
      parsedAnalyses.reduce((sum, a) => sum + (a.overallScore || 0), 0) / totalAnalyses
    );
    const conversionProbabilityAvg = Math.round(
      parsedAnalyses.reduce((sum, a) => sum + (a.conversionProbability || 0), 0) / totalAnalyses
    );
    const totalCriticalCount = parsedAnalyses.reduce((sum, a) => sum + (a.criticalCount || 0), 0);

    // Calculate dimension averages (penalty per dimension → convert to score)
    const dimensionAverages: Record<GapItem['dimension'], number> = {
      digital_presence: 0,
      contact_info: 0,
      engagement: 0,
      competitive: 0,
      revenue: 0,
      technology: 0,
    };

    const dimensionKeyMap: Record<string, GapItem['dimension']> = {
      digital_presence: 'digital_presence',
      contact_info: 'contact_info',
      engagement: 'engagement',
      competitive: 'competitive',
      revenue: 'revenue',
      technology: 'technology',
    };

    for (const analysis of parsedAnalyses) {
      if (analysis.dimensions) {
        for (const [dim, count] of Object.entries(analysis.dimensions)) {
          const validDim = dimensionKeyMap[dim];
          if (validDim) {
            dimensionAverages[validDim] += (count as number) || 0;
          }
        }
      }
    }

    // Convert to average gaps per dimension
    for (const dim of Object.keys(dimensionAverages) as GapItem['dimension'][]) {
      dimensionAverages[dim] = Math.round((dimensionAverages[dim] / totalAnalyses) * 10) / 10;
    }

    // Determine trend (compare first half vs second half of analyses)
    let scoreTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (parsedAnalyses.length >= 4) {
      const halfPoint = Math.floor(parsedAnalyses.length / 2);
      const recentScores = parsedAnalyses.slice(0, halfPoint).map(a => a.overallScore || 0);
      const olderScores = parsedAnalyses.slice(halfPoint).map(a => a.overallScore || 0);
      const recentAvg = recentScores.reduce((s, v) => s + v, 0) / recentScores.length;
      const olderAvg = olderScores.reduce((s, v) => s + v, 0) / olderScores.length;
      const diff = recentAvg - olderAvg;

      if (diff > 5) scoreTrend = 'improving';
      else if (diff < -5) scoreTrend = 'declining';
    }

    // Count auto-fixable gaps (approximate from autoTrigger counts)
    const autoFixableCount = parsedAnalyses.reduce((sum, a) => sum + (a.autoTriggerCount || 0), 0);

    // Find most common gaps (we don't store individual gap texts in metadata,
    // so we approximate from the dimension counts)
    const gapFrequencyMap: Record<string, { count: number; dimension: GapItem['dimension'] }> = {};

    // Common gap patterns by dimension
    const commonGapsByDimension: Record<GapItem['dimension'], string[]> = {
      digital_presence: ['Missing business website', 'No social media presence', 'No Google Maps listing'],
      contact_info: ['Missing email address', 'Missing phone number', 'No decision maker identified'],
      engagement: ['No outreach has been sent', 'No response to outreach', 'Stale lead'],
      competitive: ['No competitive analysis performed', 'High-competition environment'],
      revenue: ['No deal created', 'Revenue potential not estimated'],
      technology: ['Technology stack unknown'],
    };

    // Estimate from dimension counts
    for (const analysis of parsedAnalyses) {
      if (analysis.dimensions) {
        for (const [dim, gapCount] of Object.entries(analysis.dimensions)) {
          const validDim = dimensionKeyMap[dim];
          if (validDim && gapCount > 0) {
            const commonGaps = commonGapsByDimension[validDim] || [];
            for (let i = 0; i < Math.min(gapCount, commonGaps.length); i++) {
              const gapKey = commonGaps[i];
              if (!gapFrequencyMap[gapKey]) {
                gapFrequencyMap[gapKey] = { count: 0, dimension: validDim };
              }
              gapFrequencyMap[gapKey].count++;
            }
          }
        }
      }
    }

    const mostCommonGaps = Object.entries(gapFrequencyMap)
      .map(([gap, data]) => ({ gap, count: data.count, dimension: data.dimension }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      period: '30d',
      totalAnalyses,
      averageScore,
      scoreTrend,
      dimensionAverages,
      mostCommonGaps,
      autoFixableCount,
      criticalCount: totalCriticalCount,
      conversionProbabilityAvg,
    };
  } catch (error) {
    console.error('[GapAnalysis] Failed to get gap trends:', error);
    return {
      period: '30d',
      totalAnalyses: 0,
      averageScore: 0,
      scoreTrend: 'stable',
      dimensionAverages: {
        digital_presence: 0,
        contact_info: 0,
        engagement: 0,
        competitive: 0,
        revenue: 0,
        technology: 0,
      },
      mostCommonGaps: [],
      autoFixableCount: 0,
      criticalCount: 0,
      conversionProbabilityAvg: 0,
    };
  }
}
