// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Hot Lead Detection Service
// Phase: Proactive lead scoring & alerting engine
//
// Combines multiple signals into a single "heat score" (0-100),
// classifies leads by heat level, triggers auto-actions for
// hot/critical leads, and detects rising trends.
//
// SIGNAL WEIGHTS:
//   - Lead score (conversionScore):          25%
//   - Reply recency (replied within 24h):    20%
//   - Engagement velocity (7-day activity):  15%
//   - Buying signal count:                   15%
//   - Meeting scheduled (upcoming):          10%
//   - Pipeline velocity (stage progression): 10%
//   - Website activity (enrichment updates):  5%
//
// HEAT LEVELS:
//   cold     (0-30)  — Low priority, normal nurture flow
//   warm    (31-60)  — Worth following up, schedule outreach
//   hot     (61-80)  — High priority, immediate outreach recommended
//   critical (81-100) — Must contact NOW, auto-generate outreach, notify user
//
// RULES:
//   - NO AI/LLM calls — purely algorithmic based on existing DB data
//   - NO credit deduction — internal analytics service
//   - Store hot lead events in LeadActivity (type: 'hot_lead_detected')
//   - Never throw — graceful error handling throughout
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendNotification } from '@/lib/notification-engine';
import { logAuditEvent } from '@/lib/lead-audit';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type HeatLevel = 'cold' | 'warm' | 'hot' | 'critical';

export type TrendDirection = 'rising' | 'stable' | 'cooling';

export interface HotLeadSignals {
  leadScore: number;
  replyRecency: number;
  engagementVelocity: number;
  buyingSignalCount: number;
  hasUpcomingMeeting: boolean;
  pipelineVelocity: number;
  websiteActivityScore: number;
}

export interface HotLeadResult {
  leadId: string;
  businessName: string;
  heatScore: number;
  heatLevel: HeatLevel;
  previousHeatLevel?: HeatLevel;
  signals: HotLeadSignals;
  trend: TrendDirection;
  recommendedAction: string;
  autoActionsTaken: string[];
}

export interface HotLeadScanResult {
  totalLeads: number;
  cold: number;
  warm: number;
  hot: number;
  critical: number;
  hotLeads: HotLeadResult[];
  criticalLeads: HotLeadResult[];
  risingLeads: HotLeadResult[];
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** Weight configuration for each signal */
const SIGNAL_WEIGHTS = {
  leadScore: 0.25,
  replyRecency: 0.20,
  engagementVelocity: 0.15,
  buyingSignalCount: 0.15,
  hasUpcomingMeeting: 0.10,
  pipelineVelocity: 0.10,
  websiteActivityScore: 0.05,
} as const;

/** Heat level thresholds */
const HEAT_THRESHOLDS = {
  cold: { min: 0, max: 30 },
  warm: { min: 31, max: 60 },
  hot: { min: 61, max: 80 },
  critical: { min: 81, max: 100 },
} as const;

/** Pipeline stage order for velocity calculation */
const STAGE_ORDER: Record<string, number> = {
  discovered: 0,
  analyzed: 1,
  contacted: 2,
  replied: 3,
  interested: 4,
  negotiation: 5,
  proposal_sent: 6,
  closed_won: 7,
  closed_lost: 7,
};

/** Lookback window for engagement velocity */
const ENGAGEMENT_WINDOW_DAYS = 7;

/** Lookback window for reply recency scoring */
const REPLY_RECENCY_WINDOW_HOURS = 24;

/** Threshold for trend detection — score change needed to be "rising" or "cooling" */
const TREND_THRESHOLD = 10;

/** Maximum buying signals to cap the score contribution */
const MAX_BUYING_SIGNALS = 10;

/** Maximum engagement interactions to cap the score contribution */
const MAX_ENGAGEMENT_INTERACTIONS = 20;

/** Minimum days in pipeline for velocity scoring (avoids division by zero) */
const MIN_PIPELINE_DAYS = 1;

/** Maximum pipeline days before velocity contribution drops to 0 */
const MAX_PIPELINE_DAYS_FOR_VELOCITY = 90;

// ═══════════════════════════════════════════════════════════════════
// SIGNAL CALCULATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate lead score signal (0-100).
 * Uses conversionScore from the Lead model, normalized from its raw float value.
 */
function calculateLeadScoreSignal(conversionScore: number): number {
  // conversionScore is typically 0-100 range already
  const clamped = Math.max(0, Math.min(100, conversionScore));
  return clamped;
}

/**
 * Calculate reply recency signal (0-100).
 * Returns 100 if the lead replied within 24 hours, decaying linearly
 * to 0 at 7 days since last reply, or 0 if no reply at all.
 */
function calculateReplyRecencySignal(
  emailStatus: string | null,
  lastContactedAt: Date | null,
  communications: Array<{ direction: string; createdAt: Date }>
): number {
  // Must have a "replied" status to qualify
  if (emailStatus !== 'replied' && !communications.some((c) => c.direction === 'inbound')) {
    return 0;
  }

  const now = new Date();

  // Find the most recent inbound communication
  const inboundComms = communications
    .filter((c) => c.direction === 'inbound')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const lastReplyDate = inboundComms.length > 0
    ? new Date(inboundComms[0].createdAt)
    : lastContactedAt;

  if (!lastReplyDate) {
    return 0;
  }

  const hoursSinceReply = (now.getTime() - lastReplyDate.getTime()) / (1000 * 60 * 60);

  if (hoursSinceReply <= REPLY_RECENCY_WINDOW_HOURS) {
    return 100;
  }

  // Linear decay from 100 at 24h to 0 at 168h (7 days)
  if (hoursSinceReply >= 168) {
    return 0;
  }

  return Math.round(100 * (1 - (hoursSinceReply - REPLY_RECENCY_WINDOW_HOURS) / (168 - REPLY_RECENCY_WINDOW_HOURS)));
}

/**
 * Calculate engagement velocity signal (0-100).
 * Based on number of interactions in the last 7 days.
 * Capped at MAX_ENGAGEMENT_INTERACTIONS for 100 score.
 */
function calculateEngagementVelocitySignal(
  activities: Array<{ createdAt: Date }>,
  communications: Array<{ createdAt: Date }>,
  outreachMessages: Array<{ createdAt: Date; status: string }>
): number {
  const now = new Date();
  const windowStart = new Date(now.getTime() - ENGAGEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Count activities within window
  const recentActivities = activities.filter((a) => new Date(a.createdAt) >= windowStart).length;

  // Count communications within window
  const recentComms = communications.filter((c) => new Date(c.createdAt) >= windowStart).length;

  // Count outreach messages sent/opened/replied within window
  const recentOutreach = outreachMessages.filter(
    (m) => new Date(m.createdAt) >= windowStart && ['sent', 'delivered', 'opened', 'replied'].includes(m.status)
  ).length;

  const totalInteractions = recentActivities + recentComms + recentOutreach;

  // Cap at MAX_ENGAGEMENT_INTERACTIONS
  const capped = Math.min(totalInteractions, MAX_ENGAGEMENT_INTERACTIONS);

  return Math.round((capped / MAX_ENGAGEMENT_INTERACTIONS) * 100);
}

/**
 * Calculate buying signal count signal (0-100).
 * Counts buying signals from Communications (parsed from JSON).
 * Capped at MAX_BUYING_SIGNALS for 100 score.
 */
function calculateBuyingSignalCountSignal(
  communications: Array<{ buyingSignals: string | null }>
): number {
  let totalSignals = 0;

  for (const comm of communications) {
    if (!comm.buyingSignals) continue;
    try {
      const parsed = JSON.parse(comm.buyingSignals);
      if (Array.isArray(parsed)) {
        totalSignals += parsed.length;
      } else if (typeof parsed === 'object' && parsed !== null) {
        // Could be a structured object with signal arrays
        const values = Object.values(parsed);
        for (const v of values) {
          if (Array.isArray(v)) {
            totalSignals += v.length;
          } else {
            totalSignals += 1;
          }
        }
      } else {
        totalSignals += 1;
      }
    } catch {
      // Malformed JSON — count as 1 signal if non-empty
      if (comm.buyingSignals.trim().length > 0) {
        totalSignals += 1;
      }
    }
  }

  const capped = Math.min(totalSignals, MAX_BUYING_SIGNALS);
  return Math.round((capped / MAX_BUYING_SIGNALS) * 100);
}

/**
 * Calculate meeting scheduled signal (0 or 100).
 * Returns 100 if there's an upcoming confirmed/scheduled meeting, 0 otherwise.
 */
function calculateMeetingSignal(
  meetings: Array<{ status: string; startDateTime: Date }>
): boolean {
  const now = new Date();
  return meetings.some(
    (m) =>
      ['scheduled', 'confirmed'].includes(m.status) &&
      new Date(m.startDateTime) > now
  );
}

/**
 * Calculate pipeline velocity signal (0-100).
 * Measures how quickly a lead has progressed through pipeline stages.
 * Faster progression = higher score.
 */
function calculatePipelineVelocitySignal(
  currentStage: string,
  createdAt: Date
): number {
  const stageOrder = STAGE_ORDER[currentStage];
  if (stageOrder === undefined) {
    return 0;
  }

  const now = new Date();
  const daysInPipeline = Math.max(
    MIN_PIPELINE_DAYS,
    (now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  // If past 90 days, velocity contribution drops to 0
  if (daysInPipeline > MAX_PIPELINE_DAYS_FOR_VELOCITY) {
    return 0;
  }

  // Velocity = stage progress / time
  // Maximum possible stages = 7 (discovered to closed_won)
  const maxStages = 7;
  const stageProgress = Math.min(stageOrder, maxStages);

  // Ideal velocity: reaching stage 7 in 7 days = perfect score
  // stageProgress / daysInPipeline gives stages per day
  const velocity = stageProgress / daysInPipeline;

  // Normalize: reaching stage 4+ in under 14 days is considered very fast
  // We use a simple formula: (velocity * 14) capped at 1.0 * 100
  const normalized = Math.min(1, velocity * 14);

  return Math.round(normalized * 100);
}

/**
 * Calculate website activity signal (0-100).
 * Based on how recently the lead was enriched/updated.
 * Recent enrichment = higher score.
 */
function calculateWebsiteActivitySignal(
  updatedAt: Date,
  lastContactedAt: Date | null
): number {
  const now = new Date();
  const hoursSinceUpdate = (now.getTime() - new Date(updatedAt).getTime()) / (1000 * 60 * 60);

  // Very recent update (within 24h) = high score
  if (hoursSinceUpdate <= 24) {
    return 80 + Math.round(20 * (1 - hoursSinceUpdate / 24)); // 80-100
  }

  // Recent update (1-3 days) = moderate score
  if (hoursSinceUpdate <= 72) {
    return 40 + Math.round(40 * (1 - (hoursSinceUpdate - 24) / 48)); // 40-80
  }

  // Older update (3-14 days) = low score
  if (hoursSinceUpdate <= 336) {
    return Math.round(40 * (1 - (hoursSinceUpdate - 72) / 264)); // 0-40
  }

  // Very old update = 0
  return 0;
}

// ═══════════════════════════════════════════════════════════════════
// HEAT SCORE COMPUTATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute the weighted heat score from individual signals.
 */
function computeHeatScore(signals: HotLeadSignals): number {
  const rawScore =
    signals.leadScore * SIGNAL_WEIGHTS.leadScore +
    signals.replyRecency * SIGNAL_WEIGHTS.replyRecency +
    signals.engagementVelocity * SIGNAL_WEIGHTS.engagementVelocity +
    signals.buyingSignalCount * SIGNAL_WEIGHTS.buyingSignalCount +
    (signals.hasUpcomingMeeting ? 100 : 0) * SIGNAL_WEIGHTS.hasUpcomingMeeting +
    signals.pipelineVelocity * SIGNAL_WEIGHTS.pipelineVelocity +
    signals.websiteActivityScore * SIGNAL_WEIGHTS.websiteActivityScore;

  // Round and clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

/**
 * Classify a heat score into a heat level.
 */
function classifyHeatLevel(score: number): HeatLevel {
  if (score >= HEAT_THRESHOLDS.critical.min) return 'critical';
  if (score >= HEAT_THRESHOLDS.hot.min) return 'hot';
  if (score >= HEAT_THRESHOLDS.warm.min) return 'warm';
  return 'cold';
}

/**
 * Determine the recommended action based on heat level.
 */
function getRecommendedAction(heatLevel: HeatLevel, signals: HotLeadSignals): string {
  switch (heatLevel) {
    case 'critical':
      if (signals.hasUpcomingMeeting) {
        return 'CRITICAL: Prepare for upcoming meeting — review all buying signals and close the deal';
      }
      return 'CRITICAL: Contact immediately — high buying intent detected with strong engagement signals';

    case 'hot':
      if (signals.hasUpcomingMeeting) {
        return 'Schedule preparation call — lead has meeting and strong signals';
      }
      if (signals.buyingSignalCount >= 60) {
        return 'Send proposal — multiple buying signals detected, move to negotiation';
      }
      return 'Prioritize outreach — lead shows strong engagement and conversion potential';

    case 'warm':
      if (signals.replyRecency >= 50) {
        return 'Follow up on recent reply — keep the momentum going';
      }
      if (signals.engagementVelocity >= 50) {
        return 'Increase touchpoints — lead is actively engaging';
      }
      return 'Schedule outreach — lead shows moderate interest, nurture toward hot';

    case 'cold':
      if (signals.pipelineVelocity >= 40) {
        return 'Monitor — lead progressing fast but needs more engagement';
      }
      return 'Continue nurture flow — low engagement, maintain standard cadence';
  }
}

/**
 * Determine trend by comparing current score to previous score.
 */
function determineTrend(currentScore: number, previousScore: number | null): TrendDirection {
  if (previousScore === null) return 'stable';

  const delta = currentScore - previousScore;

  if (delta >= TREND_THRESHOLD) return 'rising';
  if (delta <= -TREND_THRESHOLD) return 'cooling';
  return 'stable';
}

// ═══════════════════════════════════════════════════════════════════
// DATA FETCHING HELPERS
// ═══════════════════════════════════════════════════════════════════

interface LeadWithRelations {
  id: string;
  businessName: string;
  conversionScore: number;
  emailStatus: string | null;
  stage: string;
  createdAt: Date;
  updatedAt: Date;
  lastContactedAt: Date | null;
  userId: string | null;
  orgId: string | null;
  activities: Array<{ createdAt: Date }>;
  communications: Array<{
    direction: string;
    createdAt: Date;
    buyingSignals: string | null;
  }>;
  outreachMessages: Array<{
    createdAt: Date;
    status: string;
  }>;
  meetings: Array<{
    status: string;
    startDateTime: Date;
  }>;
}

/**
 * Fetch all active leads for a user with their related data.
 * Uses a single query with includes for efficiency.
 */
async function fetchLeadsForUser(userId: string): Promise<LeadWithRelations[]> {
  // Get user's orgId for org-scoped leads
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  const orgId = user?.orgId;

  // Build where clause — user's own leads or org-scoped leads
  const where: Record<string, unknown> = {
    isActive: true,
    deletedAt: null,
  };

  if (orgId) {
    where.OR = [{ userId }, { orgId }];
  } else {
    where.userId = userId;
  }

  const leads = await db.lead.findMany({
    where,
    select: {
      id: true,
      businessName: true,
      conversionScore: true,
      emailStatus: true,
      stage: true,
      createdAt: true,
      updatedAt: true,
      lastContactedAt: true,
      userId: true,
      orgId: true,
      activities: {
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50, // Limit for performance
      },
      communications: {
        select: {
          direction: true,
          createdAt: true,
          buyingSignals: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      outreachMessages: {
        select: {
          createdAt: true,
          status: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      meetings: {
        select: {
          status: true,
          startDateTime: true,
        },
        where: {
          status: { in: ['scheduled', 'confirmed'] },
        },
      },
    },
    orderBy: { conversionScore: 'desc' },
  });

  return leads;
}

/**
 * Fetch a single lead with its related data.
 */
async function fetchLeadById(leadId: string, userId: string): Promise<LeadWithRelations | null> {
  // Get user's orgId for access check
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  const orgId = user?.orgId;

  // Build where clause with access control
  const accessFilter: Record<string, unknown>[] = [{ userId }];
  if (orgId) {
    accessFilter.push({ orgId });
  }

  const lead = await db.lead.findFirst({
    where: {
      id: leadId,
      isActive: true,
      deletedAt: null,
      OR: accessFilter,
    },
    select: {
      id: true,
      businessName: true,
      conversionScore: true,
      emailStatus: true,
      stage: true,
      createdAt: true,
      updatedAt: true,
      lastContactedAt: true,
      userId: true,
      orgId: true,
      activities: {
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      communications: {
        select: {
          direction: true,
          createdAt: true,
          buyingSignals: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      outreachMessages: {
        select: {
          createdAt: true,
          status: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      meetings: {
        select: {
          status: true,
          startDateTime: true,
        },
        where: {
          status: { in: ['scheduled', 'confirmed'] },
        },
      },
    },
  });

  return lead;
}

/**
 * Get the previous heat score for a lead from LeadActivity records.
 * Returns the previous score or null if no previous detection.
 */
async function getPreviousHeatScore(leadId: string): Promise<{ score: number; heatLevel: HeatLevel } | null> {
  const previousActivity = await db.leadActivity.findFirst({
    where: {
      leadId,
      type: 'hot_lead_detected',
    },
    orderBy: { createdAt: 'desc' },
    select: {
      metadata: true,
    },
  });

  if (!previousActivity?.metadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(previousActivity.metadata) as {
      heatScore?: number;
      heatLevel?: HeatLevel;
    };

    if (typeof parsed.heatScore === 'number' && parsed.heatLevel) {
      return { score: parsed.heatScore, heatLevel: parsed.heatLevel };
    }
  } catch {
    // Malformed metadata — ignore
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// CORE HEAT SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate all signals and the final heat score for a lead.
 */
async function calculateLeadHeat(lead: LeadWithRelations): Promise<HotLeadResult> {
  // 1. Lead score signal
  const leadScore = calculateLeadScoreSignal(lead.conversionScore);

  // 2. Reply recency signal
  const replyRecency = calculateReplyRecencySignal(
    lead.emailStatus,
    lead.lastContactedAt,
    lead.communications
  );

  // 3. Engagement velocity signal
  const engagementVelocity = calculateEngagementVelocitySignal(
    lead.activities,
    lead.communications,
    lead.outreachMessages
  );

  // 4. Buying signal count signal
  const buyingSignalCount = calculateBuyingSignalCountSignal(lead.communications);

  // 5. Meeting scheduled signal
  const hasUpcomingMeeting = calculateMeetingSignal(lead.meetings);

  // 6. Pipeline velocity signal
  const pipelineVelocity = calculatePipelineVelocitySignal(lead.stage, lead.createdAt);

  // 7. Website activity signal
  const websiteActivityScore = calculateWebsiteActivitySignal(lead.updatedAt, lead.lastContactedAt);

  // Assemble signals
  const signals: HotLeadSignals = {
    leadScore,
    replyRecency,
    engagementVelocity,
    buyingSignalCount,
    hasUpcomingMeeting,
    pipelineVelocity,
    websiteActivityScore,
  };

  // Compute weighted heat score
  const heatScore = computeHeatScore(signals);

  // Classify heat level
  const heatLevel = classifyHeatLevel(heatScore);

  // Get previous score for trend detection
  const previous = await getPreviousHeatScore(lead.id);

  const previousHeatLevel = previous?.heatLevel;
  const trend = determineTrend(heatScore, previous?.score ?? null);

  // Recommended action
  const recommendedAction = getRecommendedAction(heatLevel, signals);

  return {
    leadId: lead.id,
    businessName: lead.businessName,
    heatScore,
    heatLevel,
    previousHeatLevel,
    signals,
    trend,
    recommendedAction,
    autoActionsTaken: [],
  };
}

// ═══════════════════════════════════════════════════════════════════
// AUTO-ACTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Process automatic actions for hot/critical leads.
 *
 * Hot (61-80):    In-app notification + suggest outreach
 * Critical (81+): In-app notification + email alert + auto-generate
 *                  outreach draft + move pipeline stage
 *
 * Returns list of actions taken.
 */
export async function processHotLeadActions(
  lead: HotLeadResult,
  userId: string
): Promise<string[]> {
  const actionsTaken: string[] = [];

  // Only process for hot and critical leads
  if (lead.heatLevel !== 'hot' && lead.heatLevel !== 'critical') {
    return actionsTaken;
  }

  try {
    // ── HOT LEAD ACTIONS ──────────────────────────────────────────
    if (lead.heatLevel === 'hot') {
      // 1. Create in-app notification
      try {
        await sendNotification({
          userId,
          type: 'lead_pipeline_update',
          title: `🔥 Hot Lead: ${lead.businessName}`,
          message: `Heat score ${lead.heatScore}/100 — ${lead.recommendedAction}. Signals: ${lead.signals.buyingSignalCount >= 50 ? 'strong buying intent, ' : ''}${lead.signals.replyRecency >= 50 ? 'recent reply, ' : ''}${lead.signals.engagementVelocity >= 50 ? 'high engagement' : 'moderate engagement'}.`,
          actionUrl: `/leads/${lead.leadId}`,
          metadata: {
            leadId: lead.leadId,
            heatScore: lead.heatScore,
            heatLevel: lead.heatLevel,
            signals: lead.signals,
            category: 'hot_lead',
          },
        });
        actionsTaken.push('in_app_notification');
      } catch (error) {
        console.error('[HotLeadDetection] Failed to send in-app notification:', error);
      }

      // 2. Suggest outreach (create a lead activity note)
      try {
        await db.leadActivity.create({
          data: {
            leadId: lead.leadId,
            type: 'hot_lead_outreach_suggested',
            description: `Outreach suggested for hot lead (score: ${lead.heatScore}). ${lead.recommendedAction}`,
            metadata: JSON.stringify({
              heatScore: lead.heatScore,
              heatLevel: lead.heatLevel,
              recommendedAction: lead.recommendedAction,
              signals: lead.signals,
            }),
          },
        });
        actionsTaken.push('outreach_suggested');
      } catch (error) {
        console.error('[HotLeadDetection] Failed to create outreach suggestion:', error);
      }
    }

    // ── CRITICAL LEAD ACTIONS ─────────────────────────────────────
    if (lead.heatLevel === 'critical') {
      // 1. Create in-app notification (urgent)
      try {
        await sendNotification({
          userId,
          type: 'lead_pipeline_update',
          title: `🚨 CRITICAL Lead: ${lead.businessName}`,
          message: `Heat score ${lead.heatScore}/100 — IMMEDIATE ACTION REQUIRED. ${lead.recommendedAction}. Buying signals: ${lead.signals.buyingSignalCount}/100, Reply recency: ${lead.signals.replyRecency}/100, Engagement: ${lead.signals.engagementVelocity}/100.`,
          actionUrl: `/leads/${lead.leadId}`,
          metadata: {
            leadId: lead.leadId,
            heatScore: lead.heatScore,
            heatLevel: lead.heatLevel,
            signals: lead.signals,
            category: 'critical_lead',
          },
        });
        actionsTaken.push('in_app_notification');
      } catch (error) {
        console.error('[HotLeadDetection] Failed to send critical notification:', error);
      }

      // 2. Email alert
      try {
        await sendNotification({
          userId,
          type: 'lead_pipeline_update',
          title: `🚨 CRITICAL Lead Alert: ${lead.businessName}`,
          message: `A lead has reached CRITICAL heat level (${lead.heatScore}/100). Immediate contact recommended. ${lead.recommendedAction}. View lead details to take action.`,
          actionUrl: `/leads/${lead.leadId}`,
          metadata: {
            leadId: lead.leadId,
            heatScore: lead.heatScore,
            heatLevel: lead.heatLevel,
            urgent: true,
            emailAlert: true,
          },
        });
        actionsTaken.push('email_alert');
      } catch (error) {
        console.error('[HotLeadDetection] Failed to send email alert:', error);
      }

      // 3. Auto-generate outreach draft
      try {
        await generateAutoOutreachDraft(lead, userId);
        actionsTaken.push('outreach_draft_generated');
      } catch (error) {
        console.error('[HotLeadDetection] Failed to generate outreach draft:', error);
      }

      // 4. Move pipeline stage forward if not already in negotiation+
      try {
        const leadRecord = await db.lead.findUnique({
          where: { id: lead.leadId },
          select: { stage: true },
        });

        if (leadRecord) {
          const currentStageOrder = STAGE_ORDER[leadRecord.stage] ?? 0;

          // If lead is before "interested" stage, advance it
          if (currentStageOrder < STAGE_ORDER['interested']) {
            // Determine the next logical stage
            let targetStage = leadRecord.stage;

            if (currentStageOrder <= STAGE_ORDER['discovered']) {
              targetStage = 'contacted';
            } else if (currentStageOrder <= STAGE_ORDER['contacted']) {
              targetStage = 'replied';
            } else if (currentStageOrder <= STAGE_ORDER['replied']) {
              targetStage = 'interested';
            }

            if (targetStage !== leadRecord.stage) {
              await db.lead.update({
                where: { id: lead.leadId },
                data: { stage: targetStage },
              });

              await db.leadActivity.create({
                data: {
                  leadId: lead.leadId,
                  type: 'stage_change',
                  description: `Auto-advanced from "${leadRecord.stage}" to "${targetStage}" by hot lead detection (critical heat score: ${lead.heatScore})`,
                  metadata: JSON.stringify({
                    fromStage: leadRecord.stage,
                    toStage: targetStage,
                    reason: 'critical_hot_lead_auto_advance',
                    heatScore: lead.heatScore,
                  }),
                },
              });

              actionsTaken.push(`pipeline_advanced_${leadRecord.stage}_to_${targetStage}`);
            }
          }
        }
      } catch (error) {
        console.error('[HotLeadDetection] Failed to advance pipeline stage:', error);
      }
    }

    // ── RECORD HOT LEAD DETECTION ─────────────────────────────────
    try {
      await db.leadActivity.create({
        data: {
          leadId: lead.leadId,
          type: 'hot_lead_detected',
          description: `Lead detected as ${lead.heatLevel} (heat score: ${lead.heatScore}/100). Trend: ${lead.trend}. Actions: ${actionsTaken.join(', ') || 'none'}`,
          metadata: JSON.stringify({
            heatScore: lead.heatScore,
            heatLevel: lead.heatLevel,
            previousHeatLevel: lead.previousHeatLevel,
            trend: lead.trend,
            signals: lead.signals,
            recommendedAction: lead.recommendedAction,
            actionsTaken,
          }),
        },
      });
    } catch (error) {
      console.error('[HotLeadDetection] Failed to record hot lead detection activity:', error);
    }

    // ── AUDIT LOG ─────────────────────────────────────────────────
    try {
      await logAuditEvent(userId, 'hot_lead_detected', {
        leadId: lead.leadId,
        businessName: lead.businessName,
        heatScore: lead.heatScore,
        heatLevel: lead.heatLevel,
        previousHeatLevel: lead.previousHeatLevel,
        trend: lead.trend,
        actionsTaken,
      }, lead.leadId);
    } catch (error) {
      console.error('[HotLeadDetection] Failed to log audit event:', error);
    }
  } catch (error) {
    console.error('[HotLeadDetection] Unexpected error in processHotLeadActions:', error);
  }

  return actionsTaken;
}

/**
 * Auto-generate an outreach draft for a critical lead.
 * Creates an OutreachMessage record in 'draft' status with personalized content.
 */
async function generateAutoOutreachDraft(lead: HotLeadResult, userId: string): Promise<void> {
  const leadRecord = await db.lead.findUnique({
    where: { id: lead.leadId },
    select: {
      businessName: true,
      ownerName: true,
      email: true,
      niche: true,
      city: true,
      country: true,
      stage: true,
    },
  });

  if (!leadRecord) return;

  const contactName = leadRecord.ownerName || leadRecord.businessName;
  const niche = leadRecord.niche || 'your industry';

  // Build a contextual outreach message based on signals
  let subject = '';
  let body = '';

  if (lead.signals.hasUpcomingMeeting) {
    subject = `Looking forward to our meeting — ${leadRecord.businessName}`;
    body = `Hi ${contactName},\n\nI'm looking forward to our upcoming meeting. I wanted to share some additional thoughts on how we can help ${leadRecord.businessName} grow.\n\nBased on my research, I see some great opportunities in the ${niche} space that I'd love to discuss.\n\nBest regards`;
  } else if (lead.signals.buyingSignalCount >= 60) {
    subject = `Quick follow-up on ${leadRecord.businessName}'s growth opportunities`;
    body = `Hi ${contactName},\n\nI noticed ${leadRecord.businessName} might be looking for solutions in the ${niche} space. I'd love to share some ideas that could help accelerate your growth.\n\nWould you be open to a quick 15-minute call this week?\n\nBest regards`;
  } else if (lead.signals.replyRecency >= 50) {
    subject = `Following up on our conversation — ${leadRecord.businessName}`;
    body = `Hi ${contactName},\n\nThank you for your recent response. I wanted to follow up and share some specific ways we can help ${leadRecord.businessName} achieve its goals.\n\nWould you like me to send over a brief proposal?\n\nBest regards`;
  } else {
    subject = `Helping ${leadRecord.businessName} grow in ${niche}`;
    body = `Hi ${contactName},\n\nI've been researching businesses in the ${niche} space${leadRecord.city ? ` in ${leadRecord.city}` : ''}, and I believe ${leadRecord.businessName} has significant growth potential.\n\nI'd love to share some insights and discuss how we can help.\n\nAre you available for a brief call this week?\n\nBest regards`;
  }

  // Create the outreach draft
  await db.outreachMessage.create({
    data: {
      leadId: lead.leadId,
      userId,
      channel: 'email',
      direction: 'outbound',
      subject,
      content: body,
      status: 'draft',
      generatedByAI: false,
      metadata: JSON.stringify({
        source: 'hot_lead_auto_draft',
        heatScore: lead.heatScore,
        heatLevel: lead.heatLevel,
        generatedAt: new Date().toISOString(),
      }),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXPORTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Scan all leads for a user and identify hot ones.
 *
 * Processes every active lead, calculates heat scores,
 * classifies into heat levels, detects trends, and
 * triggers auto-actions for hot/critical leads.
 *
 * Returns a comprehensive scan result with counts and
 * filtered lists of hot/critical/rising leads.
 */
export async function detectHotLeads(userId: string): Promise<HotLeadScanResult> {
  try {
    // Fetch all leads with relations
    const leads = await fetchLeadsForUser(userId);

    // Calculate heat for each lead
    const results: HotLeadResult[] = [];

    for (const lead of leads) {
      try {
        const heatResult = await calculateLeadHeat(lead);
        results.push(heatResult);
      } catch (error) {
        console.error(`[HotLeadDetection] Failed to calculate heat for lead ${lead.id}:`, error);
        // Create a cold result as fallback
        results.push({
          leadId: lead.id,
          businessName: lead.businessName,
          heatScore: 0,
          heatLevel: 'cold',
          signals: {
            leadScore: 0,
            replyRecency: 0,
            engagementVelocity: 0,
            buyingSignalCount: 0,
            hasUpcomingMeeting: false,
            pipelineVelocity: 0,
            websiteActivityScore: 0,
          },
          trend: 'stable',
          recommendedAction: 'Continue nurture flow — unable to calculate heat score',
          autoActionsTaken: [],
        });
      }
    }

    // Classify and count
    let cold = 0;
    let warm = 0;
    let hot = 0;
    let critical = 0;

    const hotLeads: HotLeadResult[] = [];
    const criticalLeads: HotLeadResult[] = [];
    const risingLeads: HotLeadResult[] = [];

    for (const result of results) {
      switch (result.heatLevel) {
        case 'cold':
          cold++;
          break;
        case 'warm':
          warm++;
          break;
        case 'hot':
          hot++;
          hotLeads.push(result);
          break;
        case 'critical':
          critical++;
          criticalLeads.push(result);
          break;
      }

      if (result.trend === 'rising') {
        risingLeads.push(result);
      }
    }

    // Process auto-actions for hot/critical leads (non-blocking, best-effort)
    for (const lead of [...hotLeads, ...criticalLeads]) {
      try {
        const actions = await processHotLeadActions(lead, userId);
        lead.autoActionsTaken = actions;
      } catch (error) {
        console.error(`[HotLeadDetection] Failed to process actions for lead ${lead.leadId}:`, error);
      }
    }

    // Sort hot leads by heat score descending
    hotLeads.sort((a, b) => b.heatScore - a.heatScore);
    criticalLeads.sort((a, b) => b.heatScore - a.heatScore);
    risingLeads.sort((a, b) => b.heatScore - a.heatScore);

    // Audit log for the scan
    try {
      await logAuditEvent(userId, 'hot_lead_scan', {
        totalLeads: leads.length,
        cold,
        warm,
        hot,
        critical,
        risingCount: risingLeads.length,
        scanDuration: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[HotLeadDetection] Failed to log scan audit event:', error);
    }

    return {
      totalLeads: leads.length,
      cold,
      warm,
      hot,
      critical,
      hotLeads,
      criticalLeads,
      risingLeads,
    };
  } catch (error) {
    console.error('[HotLeadDetection] detectHotLeads failed:', error);

    // Return empty result on catastrophic failure
    return {
      totalLeads: 0,
      cold: 0,
      warm: 0,
      hot: 0,
      critical: 0,
      hotLeads: [],
      criticalLeads: [],
      risingLeads: [],
    };
  }
}

/**
 * Get the heat score for a single lead.
 *
 * Calculates all signals, computes the weighted heat score,
 * determines the heat level and trend, and returns
 * a detailed result. Does NOT trigger auto-actions
 * (use processHotLeadActions separately if needed).
 */
export async function getLeadHeatScore(
  leadId: string,
  userId: string
): Promise<HotLeadResult> {
  try {
    const lead = await fetchLeadById(leadId, userId);

    if (!lead) {
      return {
        leadId,
        businessName: 'Unknown',
        heatScore: 0,
        heatLevel: 'cold',
        signals: {
          leadScore: 0,
          replyRecency: 0,
          engagementVelocity: 0,
          buyingSignalCount: 0,
          hasUpcomingMeeting: false,
          pipelineVelocity: 0,
          websiteActivityScore: 0,
        },
        trend: 'stable',
        recommendedAction: 'Lead not found or access denied',
        autoActionsTaken: [],
      };
    }

    return await calculateLeadHeat(lead);
  } catch (error) {
    console.error(`[HotLeadDetection] getLeadHeatScore failed for lead ${leadId}:`, error);

    return {
      leadId,
      businessName: 'Unknown',
      heatScore: 0,
      heatLevel: 'cold',
      signals: {
        leadScore: 0,
        replyRecency: 0,
        engagementVelocity: 0,
        buyingSignalCount: 0,
        hasUpcomingMeeting: false,
        pipelineVelocity: 0,
        websiteActivityScore: 0,
      },
      trend: 'stable',
      recommendedAction: 'Error calculating heat score — please try again',
      autoActionsTaken: [],
    };
  }
}
