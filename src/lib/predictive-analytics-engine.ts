// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Predictive Analytics Engine
// Computes REAL predictions from REAL database data ONLY.
// NO hardcoded values. NO fake forecasts.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

/** Categories for prediction grouping */
export type PredictionCategory = 'lead' | 'ai' | 'billing' | 'workflow';

/** All prediction types mapped to categories */
export type PredictionType =
  // Lead predictions
  | 'conversion_probability'
  | 'close_probability'
  | 'expected_revenue'
  | 'lead_velocity'
  // AI predictions
  | 'future_usage'
  | 'future_credits'
  | 'cost_forecast'
  // Billing predictions
  | 'churn_prediction'
  | 'upgrade_probability'
  | 'renewal_risk'
  // Workflow predictions
  | 'failure_probability'
  | 'retry_probability'
  | 'throughput_prediction';

/** Result returned by each prediction function */
export interface PredictionResult {
  id: string;
  userId: string;
  category: PredictionCategory;
  predictionType: PredictionType;
  targetEntityId: string | null;
  predictedValue: number;
  confidence: number;
  modelVersion: string;
  inputData: Record<string, unknown> | null;
  predictionHorizon: string | null;
  actualValue: number | null;
  actualizedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Internal shape before DB persistence */
interface PredictionInput {
  userId: string;
  category: PredictionCategory;
  predictionType: PredictionType;
  targetEntityId?: string | null;
  predictedValue: number;
  confidence: number;
  modelVersion?: string;
  inputData?: Record<string, unknown> | null;
  predictionHorizon?: string | null;
  expiresAt?: Date | null;
}

/** Date range for filtering */
export interface DateRange {
  start: Date;
  end: Date;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const MODEL_VERSION = 'v1';

/** Pipeline stages ordered from earliest to latest */
const STAGE_ORDER: Record<string, number> = {
  discovered: 0,
  analyzed: 1,
  contacted: 2,
  replied: 3,
  interested: 4,
  negotiation: 5,
  proposal_sent: 6,
  closed_won: 7,
  closed_lost: 8,
};

/** Stages considered "negotiation or later" for close probability */
const NEGOTIATION_PLUS_STAGES = ['negotiation', 'proposal_sent', 'closed_won', 'closed_lost'];

/** Weight factors for conversion probability computation */
const SCORE_WEIGHTS = {
  replyScore: 0.25,
  conversionScore: 0.35,
  urgencyScore: 0.15,
  revenuePotentialScore: 0.25,
};

/** Revenue estimates by estimatedRevenue tier (USD) */
const REVENUE_ESTIMATE: Record<string, number> = {
  low: 500,
  medium: 2500,
  high: 10000,
  premium: 50000,
};

/** AI-related credit actions for usage prediction */
const AI_CREDIT_ACTIONS = [
  'ai_analysis',
  'ai_scoring',
  'ai_outreach_generation',
  'ai_chat',
  'ai_deep_analysis',
  'lead_discovery',
  'deep_analysis',
  'outreach_generation',
  'lead_enrichment',
  'website_screenshot',
  'competitor_analysis',
];

/** Default prediction horizon values */
const DEFAULT_VELOCITY_DAYS = 30;
const DEFAULT_USAGE_DAYS = 30;
const DEFAULT_COST_DAYS = 30;
const DEFAULT_THROUGHPUT_HOURS = 24;

// ═══════════════════════════════════════════════════════════════════
// PERSISTENCE HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Store a prediction in the AnalyticsPrediction table.
 * If an unexpired prediction of the same type + target already exists, update it.
 */
async function storePrediction(input: PredictionInput): Promise<PredictionResult> {
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default 7-day expiry
  const inputDataStr = input.inputData ? JSON.stringify(input.inputData) : null;

  // Try to find an existing unexpired prediction for same user/type/target
  const existing = await db.analyticsPrediction.findFirst({
    where: {
      userId: input.userId,
      predictionType: input.predictionType,
      targetEntityId: input.targetEntityId ?? null,
      expiresAt: { gt: new Date() },
      actualizedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  let record;
  if (existing) {
    record = await db.analyticsPrediction.update({
      where: { id: existing.id },
      data: {
        predictedValue: input.predictedValue,
        confidence: input.confidence,
        modelVersion: input.modelVersion ?? MODEL_VERSION,
        inputData: inputDataStr,
        predictionHorizon: input.predictionHorizon ?? null,
        expiresAt,
        updatedAt: new Date(),
      },
    });
  } else {
    record = await db.analyticsPrediction.create({
      data: {
        userId: input.userId,
        category: input.category,
        predictionType: input.predictionType,
        targetEntityId: input.targetEntityId ?? null,
        predictedValue: input.predictedValue,
        confidence: input.confidence,
        modelVersion: input.modelVersion ?? MODEL_VERSION,
        inputData: inputDataStr,
        predictionHorizon: input.predictionHorizon ?? null,
        expiresAt,
      },
    });
  }

  return dbRecordToResult(record);
}

/** Convert a Prisma record to our PredictionResult type */
function dbRecordToResult(record: {
  id: string;
  userId: string | null;
  category: string | null;
  predictionType: string | null;
  targetEntityId: string | null;
  predictedValue: number | null;
  confidence: number | null;
  modelVersion: string | null;
  inputData: string | null;
  predictionHorizon: string | null;
  actualValue: number | null;
  actualizedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PredictionResult {
  return {
    id: record.id,
    userId: record.userId ?? '',
    category: (record.category ?? 'lead') as PredictionCategory,
    predictionType: (record.predictionType ?? 'conversion_probability') as PredictionType,
    targetEntityId: record.targetEntityId,
    predictedValue: record.predictedValue ?? 0,
    confidence: record.confidence ?? 0,
    modelVersion: record.modelVersion ?? MODEL_VERSION,
    inputData: record.inputData ? JSON.parse(record.inputData) : null,
    predictionHorizon: record.predictionHorizon,
    actualValue: record.actualValue,
    actualizedAt: record.actualizedAt,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to N decimal places */
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** Compute a simple linear trend (slope) from an array of numbers */
function computeLinearTrend(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  return den === 0 ? 0 : num / den;
}

/** Compute exponential moving average */
function exponentialMovingAverage(values: number[], alpha: number = 0.3): number {
  if (values.length === 0) return 0;
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema;
  }
  return ema;
}

// ═══════════════════════════════════════════════════════════════════
// 1. LEAD PREDICTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Predict conversion probability (0-1) for a specific lead.
 *
 * Formula:
 *   baseScore = weighted average of (replyScore, conversionScore, urgencyScore, revenuePotentialScore) / 100
 *   stageFactor = STAGE_ORDER[stage] / max_stage (farther along = higher conversion prob)
 *   contactFactor = bonus if lead has been contacted recently
 *   emailFactor = bonus for positive email status (opened, replied)
 *   prediction = clamp(baseScore * 0.6 + stageFactor * 0.25 + contactFactor * 0.08 + emailFactor * 0.07, 0, 1)
 */
export async function predictConversionProbability(
  userId: string,
  leadId: string
): Promise<PredictionResult> {
  // Fetch the lead with its activity history and scores
  const lead = await db.lead.findFirst({
    where: { id: leadId, isActive: true, OR: [{ userId }, { orgId: { not: null } }] },
    include: {
      leadScores: { orderBy: { scoredAt: 'desc' }, take: 10 },
      activities: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!lead) {
    return storePrediction({
      userId,
      category: 'lead',
      predictionType: 'conversion_probability',
      targetEntityId: leadId,
      predictedValue: 0,
      confidence: 0.1,
      inputData: { error: 'Lead not found or inactive' },
      predictionHorizon: '30d',
    });
  }

  // ── Base score from lead's four score dimensions ──
  const replyScore = lead.replyScore ?? 0;
  const conversionScore = lead.conversionScore ?? 0;
  const urgencyScore = lead.urgencyScore ?? 0;
  const revenuePotentialScore = lead.revenuePotentialScore ?? 0;

  const weightedScore =
    replyScore * SCORE_WEIGHTS.replyScore +
    conversionScore * SCORE_WEIGHTS.conversionScore +
    urgencyScore * SCORE_WEIGHTS.urgencyScore +
    revenuePotentialScore * SCORE_WEIGHTS.revenuePotentialScore;

  // Normalize scores (0-100 range) to 0-1
  const baseScore = clamp(weightedScore / 100, 0, 1);

  // ── Stage progression factor ──
  const stageIdx = STAGE_ORDER[lead.stage] ?? 0;
  const maxStageIdx = STAGE_ORDER['proposal_sent'] ?? 6; // don't count closed stages
  const stageFactor = clamp(stageIdx / maxStageIdx, 0, 1);

  // ── Contact recency factor ──
  let contactFactor = 0;
  if (lead.lastContactedAt) {
    const daysSinceContact = (Date.now() - lead.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceContact < 1) contactFactor = 1.0;
    else if (daysSinceContact < 3) contactFactor = 0.8;
    else if (daysSinceContact < 7) contactFactor = 0.5;
    else if (daysSinceContact < 14) contactFactor = 0.3;
    else contactFactor = 0.1;
  }

  // ── Email status factor ──
  let emailFactor = 0;
  const emailStatus = lead.emailStatus;
  if (emailStatus === 'replied') emailFactor = 1.0;
  else if (emailStatus === 'opened') emailFactor = 0.7;
  else if (emailStatus === 'sent') emailFactor = 0.3;
  else if (emailStatus === 'bounced') emailFactor = 0;
  else if (emailStatus === 'unsubscribed') emailFactor = 0;

  // ── Activity count boost ──
  const activityCount = lead.activities.length;
  const activityFactor = clamp(activityCount / 10, 0, 1) * 0.1;

  // ── Historical lead scores (if available) ──
  let historicalScoreBoost = 0;
  if (lead.leadScores.length > 0) {
    const recentConversionScores = lead.leadScores
      .filter(s => s.scoreType === 'conversion')
      .map(s => s.score);
    if (recentConversionScores.length > 0) {
      const avgHistScore = recentConversionScores.reduce((a, b) => a + b, 0) / recentConversionScores.length;
      historicalScoreBoost = clamp(avgHistScore / 100, 0, 1) * 0.1;
    }
  }

  // ── Combined probability ──
  const probability = clamp(
    baseScore * 0.5 +
    stageFactor * 0.2 +
    contactFactor * 0.08 +
    emailFactor * 0.1 +
    activityFactor +
    historicalScoreBoost,
    0,
    1
  );

  // ── Confidence ──
  // Higher confidence when we have more data points
  const dataPoints = [
    replyScore > 0,
    conversionScore > 0,
    urgencyScore > 0,
    revenuePotentialScore > 0,
    lead.lastContactedAt !== null,
    emailStatus !== null && emailStatus !== 'none',
    lead.leadScores.length > 0,
    activityCount > 0,
  ].filter(Boolean).length;

  const confidence = clamp(0.3 + (dataPoints / 8) * 0.6, 0.1, 0.95);

  return storePrediction({
    userId,
    category: 'lead',
    predictionType: 'conversion_probability',
    targetEntityId: leadId,
    predictedValue: roundTo(probability, 4),
    confidence: roundTo(confidence, 4),
    inputData: {
      replyScore,
      conversionScore,
      urgencyScore,
      revenuePotentialScore,
      baseScore: roundTo(baseScore, 4),
      stageFactor: roundTo(stageFactor, 4),
      contactFactor: roundTo(contactFactor, 4),
      emailFactor: roundTo(emailFactor, 4),
      activityFactor: roundTo(activityFactor, 4),
      historicalScoreBoost: roundTo(historicalScoreBoost, 4),
      stage: lead.stage,
      emailStatus: lead.emailStatus,
      activityCount,
      dataPoints,
    },
    predictionHorizon: '30d',
  });
}

/**
 * Predict close probability (won vs lost) for leads in negotiation+ stages.
 *
 * Formula:
 *   stageWeight = how far past negotiation (0.5 for negotiation, 0.7 for proposal, 1.0 for closed_won proxy)
 *   scoreComponent = weighted score / 100
 *   emailComponent = email status factor
 *   recencyComponent = days since last contact (lower = better)
 *   prediction = clamp(stageWeight * 0.35 + scoreComponent * 0.35 + emailComponent * 0.15 + recencyComponent * 0.15, 0, 1)
 */
export async function predictCloseProbability(
  userId: string,
  leadId: string
): Promise<PredictionResult> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, isActive: true, OR: [{ userId }, { orgId: { not: null } }] },
    include: {
      outreachMessages: {
        where: { status: { in: ['sent', 'delivered', 'opened', 'replied'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      activities: {
        where: { type: 'stage_change' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!lead) {
    return storePrediction({
      userId,
      category: 'lead',
      predictionType: 'close_probability',
      targetEntityId: leadId,
      predictedValue: 0,
      confidence: 0.1,
      inputData: { error: 'Lead not found or inactive' },
      predictionHorizon: '30d',
    });
  }

  const isInNegotiationPlus = NEGOTIATION_PLUS_STAGES.includes(lead.stage);

  // ── Stage weight ──
  let stageWeight = 0;
  if (lead.stage === 'closed_won') stageWeight = 1.0;
  else if (lead.stage === 'proposal_sent') stageWeight = 0.7;
  else if (lead.stage === 'negotiation') stageWeight = 0.5;
  else if (lead.stage === 'interested') stageWeight = 0.3;
  else stageWeight = 0.1; // early stage = low close prob

  // ── Score component ──
  const weightedScore =
    (lead.replyScore ?? 0) * 0.2 +
    (lead.conversionScore ?? 0) * 0.4 +
    (lead.urgencyScore ?? 0) * 0.15 +
    (lead.revenuePotentialScore ?? 0) * 0.25;
  const scoreComponent = clamp(weightedScore / 100, 0, 1);

  // ── Email status component ──
  let emailComponent = 0.2; // neutral default
  if (lead.emailStatus === 'replied') emailComponent = 1.0;
  else if (lead.emailStatus === 'opened') emailComponent = 0.7;
  else if (lead.emailStatus === 'sent') emailComponent = 0.4;
  else if (lead.emailStatus === 'bounced') emailComponent = 0;
  else if (lead.emailStatus === 'unsubscribed') emailComponent = 0;

  // ── Contact recency component ──
  let recencyComponent = 0.1;
  if (lead.lastContactedAt) {
    const daysSince = (Date.now() - lead.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 1) recencyComponent = 1.0;
    else if (daysSince < 3) recencyComponent = 0.8;
    else if (daysSince < 7) recencyComponent = 0.5;
    else if (daysSince < 14) recencyComponent = 0.3;
    else recencyComponent = 0.1;
  }

  // ── Outreach engagement ──
  const repliedMessages = lead.outreachMessages.filter(m => m.repliedAt !== null).length;
  const openedMessages = lead.outreachMessages.filter(m => m.openedAt !== null).length;
  const totalMessages = lead.outreachMessages.length;
  const engagementRate = totalMessages > 0 ? (repliedMessages * 1.0 + openedMessages * 0.5) / totalMessages : 0;
  const engagementComponent = clamp(engagementRate, 0, 1);

  // ── Combined probability ──
  const probability = clamp(
    stageWeight * 0.3 +
    scoreComponent * 0.3 +
    emailComponent * 0.15 +
    recencyComponent * 0.1 +
    engagementComponent * 0.15,
    0,
    1
  );

  // ── Confidence ──
  // Higher for negotiation+ stages; lower for early stages
  const stageConfidence = isInNegotiationPlus ? 0.2 : 0;
  const dataRichness = [
    lead.replyScore > 0,
    lead.conversionScore > 0,
    lead.emailStatus !== null && lead.emailStatus !== 'none',
    lead.lastContactedAt !== null,
    totalMessages > 0,
    repliedMessages > 0,
  ].filter(Boolean).length;

  const confidence = clamp(
    0.2 + stageConfidence + (dataRichness / 6) * 0.55,
    0.1,
    0.95
  );

  return storePrediction({
    userId,
    category: 'lead',
    predictionType: 'close_probability',
    targetEntityId: leadId,
    predictedValue: roundTo(probability, 4),
    confidence: roundTo(confidence, 4),
    inputData: {
      stage: lead.stage,
      isInNegotiationPlus,
      stageWeight: roundTo(stageWeight, 4),
      scoreComponent: roundTo(scoreComponent, 4),
      emailComponent: roundTo(emailComponent, 4),
      recencyComponent: roundTo(recencyComponent, 4),
      engagementComponent: roundTo(engagementComponent, 4),
      replyScore: lead.replyScore,
      conversionScore: lead.conversionScore,
      urgencyScore: lead.urgencyScore,
      revenuePotentialScore: lead.revenuePotentialScore,
      emailStatus: lead.emailStatus,
      totalOutreachMessages: totalMessages,
      repliedMessages,
      openedMessages,
    },
    predictionHorizon: '30d',
  });
}

/**
 * Predict total expected revenue from active leads in the pipeline.
 *
 * Formula:
 *   For each active lead NOT in closed_lost:
 *     revenueEstimate = REVENUE_ESTIMATE[estimatedRevenue] or default
 *     closeProb = from predictCloseProbability if in negotiation+, else conversion_probability
 *     contribution = revenueEstimate * closeProb
 *   Sum all contributions
 */
export async function predictExpectedRevenue(
  userId: string,
  dateRange?: DateRange
): Promise<PredictionResult> {
  // Get user's org for org-scoped leads
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  const where: Record<string, unknown> = {
    isActive: true,
    stage: { not: 'closed_lost' },
    OR: [{ userId }, ...(user?.orgId ? [{ orgId: user.orgId }] : [])],
  };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const leads = await db.lead.findMany({
    where,
    select: {
      id: true,
      stage: true,
      estimatedRevenue: true,
      revenuePotentialScore: true,
      conversionScore: true,
      replyScore: true,
      urgencyScore: true,
      emailStatus: true,
      lastContactedAt: true,
    },
  });

  let totalExpectedRevenue = 0;
  const leadContributions: { leadId: string; estimate: number; probability: number; contribution: number }[] = [];

  for (const lead of leads) {
    // Revenue estimate from tier
    const estimate = REVENUE_ESTIMATE[lead.estimatedRevenue ?? 'medium'] ?? REVENUE_ESTIMATE['medium'];

    // Adjust estimate by revenuePotentialScore (0-100 scale → 0.5x to 2x multiplier)
    const revenueMultiplier = 0.5 + (clamp(lead.revenuePotentialScore ?? 0, 0, 100) / 100) * 1.5;
    const adjustedEstimate = estimate * revenueMultiplier;

    // Close probability (simplified inline calculation to avoid N+1 queries)
    let closeProb: number;
    if (NEGOTIATION_PLUS_STAGES.includes(lead.stage)) {
      // Use close probability formula
      const stageWeight = lead.stage === 'proposal_sent' ? 0.7 : lead.stage === 'negotiation' ? 0.5 : lead.stage === 'closed_won' ? 1.0 : 0.3;
      const scoreComponent = clamp(
        ((lead.replyScore ?? 0) * 0.2 + (lead.conversionScore ?? 0) * 0.4 +
          (lead.urgencyScore ?? 0) * 0.15 + (lead.revenuePotentialScore ?? 0) * 0.25) / 100,
        0, 1
      );
      closeProb = clamp(stageWeight * 0.5 + scoreComponent * 0.5, 0, 1);
    } else {
      // Use conversion probability formula for earlier stages
      const baseScore = clamp(
        ((lead.replyScore ?? 0) * SCORE_WEIGHTS.replyScore +
          (lead.conversionScore ?? 0) * SCORE_WEIGHTS.conversionScore +
          (lead.urgencyScore ?? 0) * SCORE_WEIGHTS.urgencyScore +
          (lead.revenuePotentialScore ?? 0) * SCORE_WEIGHTS.revenuePotentialScore) / 100,
        0, 1
      );
      const stageIdx = STAGE_ORDER[lead.stage] ?? 0;
      const stageFactor = clamp(stageIdx / 6, 0, 1);
      closeProb = clamp(baseScore * 0.6 + stageFactor * 0.4, 0, 1);
    }

    const contribution = adjustedEstimate * closeProb;
    totalExpectedRevenue += contribution;

    leadContributions.push({
      leadId: lead.id,
      estimate: roundTo(adjustedEstimate, 2),
      probability: roundTo(closeProb, 4),
      contribution: roundTo(contribution, 2),
    });
  }

  // ── Confidence ──
  const leadCount = leads.length;
  const leadsWithScores = leads.filter(l =>
    (l.conversionScore ?? 0) > 0 || (l.revenuePotentialScore ?? 0) > 0
  ).length;
  const scoreCoverage = leadCount > 0 ? leadsWithScores / leadCount : 0;
  const confidence = clamp(0.2 + scoreCoverage * 0.5 + Math.min(leadCount / 50, 1) * 0.2, 0.1, 0.9);

  return storePrediction({
    userId,
    category: 'lead',
    predictionType: 'expected_revenue',
    predictedValue: roundTo(totalExpectedRevenue, 2),
    confidence: roundTo(confidence, 4),
    inputData: {
      totalLeads: leadCount,
      leadsWithScores,
      scoreCoverage: roundTo(scoreCoverage, 4),
      topContributions: leadContributions
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 10),
    },
    predictionHorizon: dateRange ? `${Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24))}d` : '30d',
  });
}

/**
 * Predict future lead discovery rate based on historical daily averages and trend.
 *
 * Formula:
 *   dailyCounts = count of leads created per day over the lookback period
 *   dailyAvg = mean(dailyCounts)
 *   trend = linear regression slope of dailyCounts
 *   predictedVelocity = max(0, dailyAvg + trend * days)
 */
export async function predictLeadVelocity(
  userId: string,
  days: number = DEFAULT_VELOCITY_DAYS
): Promise<PredictionResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  // Look back 2x the prediction window to compute trend (min 14 days)
  const lookbackDays = Math.max(days * 2, 14);
  const lookbackStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    isActive: true,
    OR: [{ userId }, ...(user?.orgId ? [{ orgId: user.orgId }] : [])],
    createdAt: { gte: lookbackStart },
  };

  // Get lead creation timestamps
  const leads = await db.lead.findMany({
    where,
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Group by day
  const dailyMap = new Map<string, number>();
  for (const lead of leads) {
    const dayKey = lead.createdAt.toISOString().split('T')[0];
    dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + 1);
  }

  // Build daily count array (fill gaps with 0)
  const dailyCounts: number[] = [];
  for (let i = 0; i < lookbackDays; i++) {
    const date = new Date(lookbackStart.getTime() + i * 24 * 60 * 60 * 1000);
    const dayKey = date.toISOString().split('T')[0];
    dailyCounts.push(dailyMap.get(dayKey) || 0);
  }

  // Compute average and trend
  const totalLeads = dailyCounts.reduce((s, v) => s + v, 0);
  const dailyAvg = dailyCounts.length > 0 ? totalLeads / dailyCounts.length : 0;
  const trend = computeLinearTrend(dailyCounts);

  // Predicted velocity = daily average adjusted by trend
  const predictedDailyVelocity = Math.max(0, dailyAvg + trend);
  const predictedTotalNewLeads = Math.max(0, predictedDailyVelocity * days);

  // ── Confidence ──
  const dataRichness = clamp(dailyCounts.length / 30, 0, 1);
  const variance = dailyCounts.length > 0
    ? dailyCounts.reduce((s, v) => s + Math.pow(v - dailyAvg, 2), 0) / dailyCounts.length
    : 0;
  const coefficientOfVariation = dailyAvg > 0 ? Math.sqrt(variance) / dailyAvg : 1;
  const stabilityFactor = clamp(1 - coefficientOfVariation, 0, 1);
  const confidence = clamp(0.2 + dataRichness * 0.3 + stabilityFactor * 0.4, 0.1, 0.9);

  return storePrediction({
    userId,
    category: 'lead',
    predictionType: 'lead_velocity',
    predictedValue: roundTo(predictedTotalNewLeads, 2),
    confidence: roundTo(confidence, 4),
    inputData: {
      lookbackDays,
      totalLeadsInLookback: totalLeads,
      dailyAvg: roundTo(dailyAvg, 4),
      trend: roundTo(trend, 4),
      predictedDailyVelocity: roundTo(predictedDailyVelocity, 4),
      predictionDays: days,
      variance: roundTo(variance, 4),
      coefficientOfVariation: roundTo(coefficientOfVariation, 4),
    },
    predictionHorizon: `${days}d`,
  });
}

// ═══════════════════════════════════════════════════════════════════
// 2. AI PREDICTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Predict future AI usage (credit consumption) based on recent daily average.
 *
 * Formula:
 *   recentDailyUsage = average credits spent per day on AI actions over last 14 days
 *   trend = linear trend of daily usage
 *   predictedUsage = (recentDailyUsage + trend) * days
 */
export async function predictFutureUsage(
  userId: string,
  days: number = DEFAULT_USAGE_DAYS
): Promise<PredictionResult> {
  // Look back 28 days for trend computation
  const lookbackStart = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const aiLedgerEntries = await db.creditsLedger.findMany({
    where: {
      userId,
      action: { in: AI_CREDIT_ACTIONS },
      credits: { lt: 0 },
      createdAt: { gte: lookbackStart },
    },
    select: { createdAt: true, credits: true },
    orderBy: { createdAt: 'asc' },
  });

  // Group by day
  const dailyMap = new Map<string, number>();
  for (const entry of aiLedgerEntries) {
    const dayKey = entry.createdAt.toISOString().split('T')[0];
    dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + Math.abs(entry.credits));
  }

  // Build daily array (fill gaps with 0)
  const dailyUsage: number[] = [];
  for (let i = 0; i < 28; i++) {
    const date = new Date(lookbackStart.getTime() + i * 24 * 60 * 60 * 1000);
    const dayKey = date.toISOString().split('T')[0];
    dailyUsage.push(dailyMap.get(dayKey) || 0);
  }

  // Recent 14-day average
  const recent14 = dailyUsage.slice(-14);
  const recentAvg = recent14.length > 0
    ? recent14.reduce((s, v) => s + v, 0) / recent14.length
    : 0;

  // Trend from full 28-day window
  const trend = computeLinearTrend(dailyUsage);

  // EMA for smoothing
  const emaValue = exponentialMovingAverage(dailyUsage, 0.3);

  // Combined prediction: blend of EMA, recent average, and trend
  const predictedDailyUsage = Math.max(0, (emaValue * 0.4 + recentAvg * 0.4) + trend * 0.2);
  const predictedTotalUsage = predictedDailyUsage * days;

  // ── Confidence ──
  const daysWithUsage = recent14.filter(v => v > 0).length;
  const usageConsistency = recent14.length > 0 ? daysWithUsage / recent14.length : 0;
  const confidence = clamp(0.2 + usageConsistency * 0.5 + Math.min(aiLedgerEntries.length / 50, 1) * 0.2, 0.1, 0.9);

  return storePrediction({
    userId,
    category: 'ai',
    predictionType: 'future_usage',
    predictedValue: roundTo(predictedTotalUsage, 2),
    confidence: roundTo(confidence, 4),
    inputData: {
      lookbackDays: 28,
      totalCreditsUsed: aiLedgerEntries.reduce((s, e) => s + Math.abs(e.credits), 0),
      recentDailyAvg: roundTo(recentAvg, 4),
      trend: roundTo(trend, 4),
      emaValue: roundTo(emaValue, 4),
      predictedDailyUsage: roundTo(predictedDailyUsage, 4),
      predictionDays: days,
      daysWithUsage,
      usageConsistency: roundTo(usageConsistency, 4),
    },
    predictionHorizon: `${days}d`,
  });
}

/**
 * Predict when user will run out of credits based on current balance and burn rate.
 *
 * predictedValue = number of days until credits reach 0
 *   burnRate = recent daily credit consumption
 *   daysRemaining = currentBalance / burnRate (if burnRate > 0)
 */
export async function predictFutureCredits(
  userId: string
): Promise<PredictionResult> {
  // Current balance
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { credits: true, creditsMonthly: true, rolloverCredits: true },
  });

  const currentBalance = (user?.credits ?? 0);
  const monthlyAllocation = (user?.creditsMonthly ?? 0);
  const rolloverCredits = (user?.rolloverCredits ?? 0);

  // Compute burn rate over last 14 days
  const lookbackStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const creditDeductions = await db.creditsLedger.findMany({
    where: {
      userId,
      credits: { lt: 0 },
      createdAt: { gte: lookbackStart },
    },
    select: { credits: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const totalBurned = creditDeductions.reduce((s, e) => s + Math.abs(e.credits), 0);

  // Group by day to get daily burn
  const dailyBurnMap = new Map<string, number>();
  for (const entry of creditDeductions) {
    const dayKey = entry.createdAt.toISOString().split('T')[0];
    dailyBurnMap.set(dayKey, (dailyBurnMap.get(dayKey) || 0) + Math.abs(entry.credits));
  }

  const dailyBurns = Array.from(dailyBurnMap.values());
  const avgDailyBurn = dailyBurns.length > 0 ? totalBurned / 14 : 0; // Use full 14-day window

  // Days until credits run out
  let daysUntilExhaustion: number;
  if (avgDailyBurn <= 0) {
    daysUntilExhaustion = -1; // No burn, credits won't run out naturally
  } else {
    daysUntilExhaustion = currentBalance / avgDailyBurn;
  }

  // ── Confidence ──
  const daysWithData = dailyBurns.length;
  const confidence = clamp(
    0.2 + Math.min(daysWithData / 10, 1) * 0.4 + (avgDailyBurn > 0 ? 0.2 : 0),
    0.1,
    0.9
  );

  return storePrediction({
    userId,
    category: 'ai',
    predictionType: 'future_credits',
    predictedValue: roundTo(daysUntilExhaustion, 2),
    confidence: roundTo(confidence, 4),
    inputData: {
      currentBalance,
      monthlyAllocation,
      rolloverCredits,
      totalBurned14d: totalBurned,
      avgDailyBurn: roundTo(avgDailyBurn, 4),
      daysWithData,
      daysUntilExhaustion: roundTo(daysUntilExhaustion, 2),
    },
    predictionHorizon: '90d',
  });
}

/**
 * Predict future AI costs based on usage patterns.
 *
 * Formula:
 *   costPerCredit = estimated USD cost per credit (derived from plan pricing)
 *   predictedUsage = from predictFutureUsage logic
 *   predictedCost = predictedUsage * costPerCredit
 */
export async function predictProviderCostForecast(
  userId: string,
  days: number = DEFAULT_COST_DAYS
): Promise<PredictionResult> {
  // Get user's plan to estimate cost per credit
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true, credits: true, creditsMonthly: true },
  });

  // Cost per credit based on plan pricing (approximate)
  // Free: $0/credit, Pro: $29/200credits ≈ $0.145/credit, Elite: $99/500credits ≈ $0.198/credit
  const costPerCredit: Record<string, number> = {
    free: 0,
    pro: 0.145,
    elite: 0.198,
  };
  const planCostPerCredit = costPerCredit[user?.plan ?? 'free'] ?? 0;

  // Look back for actual usage data
  const lookbackStart = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const aiLedgerEntries = await db.creditsLedger.findMany({
    where: {
      userId,
      action: { in: AI_CREDIT_ACTIONS },
      credits: { lt: 0 },
      createdAt: { gte: lookbackStart },
    },
    select: { createdAt: true, credits: true, action: true },
    orderBy: { createdAt: 'asc' },
  });

  // Daily usage
  const dailyMap = new Map<string, number>();
  for (const entry of aiLedgerEntries) {
    const dayKey = entry.createdAt.toISOString().split('T')[0];
    dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + Math.abs(entry.credits));
  }

  const dailyUsage: number[] = [];
  for (let i = 0; i < 28; i++) {
    const date = new Date(lookbackStart.getTime() + i * 24 * 60 * 60 * 1000);
    const dayKey = date.toISOString().split('T')[0];
    dailyUsage.push(dailyMap.get(dayKey) || 0);
  }

  const recent14 = dailyUsage.slice(-14);
  const recentAvg = recent14.length > 0
    ? recent14.reduce((s, v) => s + v, 0) / recent14.length
    : 0;
  const trend = computeLinearTrend(dailyUsage);
  const emaValue = exponentialMovingAverage(dailyUsage, 0.3);
  const predictedDailyUsage = Math.max(0, (emaValue * 0.4 + recentAvg * 0.4) + trend * 0.2);

  // Cost by action type for breakdown
  const actionBreakdown: Record<string, number> = {};
  for (const entry of aiLedgerEntries) {
    actionBreakdown[entry.action] = (actionBreakdown[entry.action] || 0) + Math.abs(entry.credits);
  }

  const predictedTotalUsage = predictedDailyUsage * days;
  const predictedCost = predictedTotalUsage * planCostPerCredit;

  // ── Confidence ──
  const daysWithUsage = recent14.filter(v => v > 0).length;
  const confidence = clamp(
    0.2 + (daysWithUsage / 14) * 0.4 + Math.min(aiLedgerEntries.length / 50, 1) * 0.2,
    0.1,
    0.85
  );

  return storePrediction({
    userId,
    category: 'ai',
    predictionType: 'cost_forecast',
    predictedValue: roundTo(predictedCost, 2),
    confidence: roundTo(confidence, 4),
    inputData: {
      plan: user?.plan ?? 'free',
      costPerCredit: planCostPerCredit,
      predictedDailyUsage: roundTo(predictedDailyUsage, 4),
      predictedTotalUsage: roundTo(predictedTotalUsage, 2),
      predictionDays: days,
      recentDailyAvg: roundTo(recentAvg, 4),
      trend: roundTo(trend, 4),
      actionBreakdown: Object.fromEntries(
        Object.entries(actionBreakdown).map(([k, v]) => [k, roundTo(v, 2)])
      ),
    },
    predictionHorizon: `${days}d`,
  });
}

// ═══════════════════════════════════════════════════════════════════
// 3. BILLING PREDICTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Predict churn risk (0-1) based on subscription status, credit usage decline,
 * last login, and trial expiry.
 *
 * Signals:
 *   - Subscription status (canceled/past_due = high risk)
 *   - Credit usage decline (less usage → higher churn)
 *   - Last login recency (older → higher risk)
 *   - Trial expiry (near expiry → higher risk)
 *   - No credit purchases ever (higher risk)
 */
export async function predictChurn(
  userId: string
): Promise<PredictionResult> {
  // Fetch user data
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      credits: true,
      creditsMonthly: true,
      isTrial: true,
      trialEndsAt: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    return storePrediction({
      userId,
      category: 'billing',
      predictionType: 'churn_prediction',
      predictedValue: 1.0,
      confidence: 0.5,
      inputData: { error: 'User not found' },
      predictionHorizon: '30d',
    });
  }

  // Fetch subscription
  const subscription = await db.subscription.findFirst({
    where: { userId, status: { in: ['active', 'trialing', 'past_due', 'canceled'] } },
    orderBy: { createdAt: 'desc' },
  });

  // ── Subscription status factor (0 = safe, 1 = high churn) ──
  let subscriptionFactor = 0.3; // default neutral
  if (subscription) {
    if (subscription.status === 'canceled') subscriptionFactor = 0.9;
    else if (subscription.status === 'past_due') subscriptionFactor = 0.8;
    else if (subscription.status === 'trialing') subscriptionFactor = 0.4;
    else if (subscription.status === 'active') subscriptionFactor = 0.15;
    if (subscription.cancelAtPeriodEnd) subscriptionFactor = Math.min(subscriptionFactor + 0.3, 1.0);
  }

  // ── Credit usage decline factor ──
  // Compare usage in last 7 days vs previous 7 days
  const last7Start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const prev7Start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const last7End = new Date();

  const recentUsage = await db.creditsLedger.aggregate({
    where: { userId, credits: { lt: 0 }, createdAt: { gte: last7Start, lte: last7End } },
    _sum: { credits: true },
    _count: { id: true },
  });

  const previousUsage = await db.creditsLedger.aggregate({
    where: { userId, credits: { lt: 0 }, createdAt: { gte: prev7Start, lt: last7Start } },
    _sum: { credits: true },
    _count: { id: true },
  });

  const recentCreditsUsed = Math.abs(recentUsage._sum.credits ?? 0);
  const previousCreditsUsed = Math.abs(previousUsage._sum.credits ?? 0);

  let usageDeclineFactor = 0.3; // neutral
  if (previousCreditsUsed > 0) {
    const usageRatio = recentCreditsUsed / previousCreditsUsed;
    if (usageRatio < 0.3) usageDeclineFactor = 0.9;
    else if (usageRatio < 0.5) usageDeclineFactor = 0.7;
    else if (usageRatio < 0.7) usageDeclineFactor = 0.5;
    else if (usageRatio < 0.9) usageDeclineFactor = 0.3;
    else usageDeclineFactor = 0.1; // usage stable or growing = low churn
  } else if (recentCreditsUsed === 0) {
    usageDeclineFactor = 0.8; // no usage at all
  }

  // ── Login recency factor ──
  let loginFactor = 0.3;
  if (user.lastLoginAt) {
    const daysSinceLogin = (Date.now() - user.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLogin < 1) loginFactor = 0.05;
    else if (daysSinceLogin < 3) loginFactor = 0.1;
    else if (daysSinceLogin < 7) loginFactor = 0.2;
    else if (daysSinceLogin < 14) loginFactor = 0.4;
    else if (daysSinceLogin < 30) loginFactor = 0.7;
    else loginFactor = 0.9;
  } else {
    loginFactor = 0.8; // never logged in (or no record)
  }

  // ── Trial expiry factor ──
  let trialFactor = 0.2;
  if (user.isTrial && user.trialEndsAt) {
    const daysUntilExpiry = (user.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry < 0) trialFactor = 0.9; // already expired
    else if (daysUntilExpiry < 3) trialFactor = 0.8;
    else if (daysUntilExpiry < 7) trialFactor = 0.6;
    else trialFactor = 0.3;
  }

  // ── Credit purchase factor ──
  const creditPurchases = await db.creditAddon.count({ where: { userId } });
  const purchaseFactor = creditPurchases > 0 ? 0.1 : 0.4; // no purchases = higher churn risk

  // ── Combined churn risk ──
  const churnRisk = clamp(
    subscriptionFactor * 0.3 +
    usageDeclineFactor * 0.25 +
    loginFactor * 0.2 +
    trialFactor * 0.15 +
    purchaseFactor * 0.1,
    0,
    1
  );

  // ── Confidence ──
  const dataPoints = [
    subscription !== null,
    recentCreditsUsed > 0 || previousCreditsUsed > 0,
    user.lastLoginAt !== null,
    user.isTrial,
    creditPurchases > 0,
  ].filter(Boolean).length;

  const confidence = clamp(0.3 + (dataPoints / 5) * 0.5, 0.1, 0.9);

  return storePrediction({
    userId,
    category: 'billing',
    predictionType: 'churn_prediction',
    predictedValue: roundTo(churnRisk, 4),
    confidence: roundTo(confidence, 4),
    inputData: {
      plan: user.plan,
      subscriptionStatus: subscription?.status ?? 'none',
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      recentCreditsUsed,
      previousCreditsUsed,
      usageRatio: previousCreditsUsed > 0 ? roundTo(recentCreditsUsed / previousCreditsUsed, 4) : null,
      subscriptionFactor: roundTo(subscriptionFactor, 4),
      usageDeclineFactor: roundTo(usageDeclineFactor, 4),
      loginFactor: roundTo(loginFactor, 4),
      trialFactor: roundTo(trialFactor, 4),
      purchaseFactor: roundTo(purchaseFactor, 4),
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      creditPurchases,
    },
    predictionHorizon: '30d',
  });
}

/**
 * Predict upgrade likelihood based on usage patterns, plan limits, credit purchases.
 *
 * Signals:
 *   - High credit usage relative to plan allocation
 *   - Multiple credit addon purchases
 *   - Hitting plan limits frequently
 *   - Active feature usage (many features used)
 */
export async function predictUpgradeProbability(
  userId: string
): Promise<PredictionResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true, credits: true, creditsMonthly: true, createdAt: true },
  });

  if (!user) {
    return storePrediction({
      userId,
      category: 'billing',
      predictionType: 'upgrade_probability',
      predictedValue: 0,
      confidence: 0.1,
      inputData: { error: 'User not found' },
      predictionHorizon: '30d',
    });
  }

  // Already on elite = no upgrade possible
  if (user.plan === 'elite') {
    return storePrediction({
      userId,
      category: 'billing',
      predictionType: 'upgrade_probability',
      predictedValue: 0,
      confidence: 0.95,
      inputData: { reason: 'Already on highest plan' },
      predictionHorizon: '30d',
    });
  }

  // ── Credit utilization factor ──
  // How close is the user to exhausting their monthly credits?
  const creditsRemaining = user.credits;
  const creditsMonthly = user.creditsMonthly;
  const creditUtilization = creditsMonthly > 0 ? clamp(1 - (creditsRemaining / creditsMonthly), 0, 2) : 0;

  let utilizationFactor = 0.1;
  if (creditUtilization > 1.0) utilizationFactor = 1.0; // exceeded allocation
  else if (creditUtilization > 0.9) utilizationFactor = 0.8;
  else if (creditUtilization > 0.7) utilizationFactor = 0.6;
  else if (creditUtilization > 0.5) utilizationFactor = 0.4;
  else utilizationFactor = 0.2;

  // ── Credit addon purchase factor ──
  const creditAddons = await db.creditAddon.findMany({
    where: { userId },
    select: { credits: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const totalAddonCredits = creditAddons.reduce((s, a) => s + a.credits, 0);
  const recentAddons = creditAddons.filter(
    a => a.createdAt.getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
  ).length;

  let addonFactor = 0.1;
  if (recentAddons >= 3) addonFactor = 0.9;
  else if (recentAddons >= 2) addonFactor = 0.7;
  else if (recentAddons >= 1) addonFactor = 0.5;
  else if (creditAddons.length > 0) addonFactor = 0.3;

  // ── Feature usage breadth ──
  const distinctActions = await db.creditsLedger.groupBy({
    by: ['action'],
    where: { userId, credits: { lt: 0 } },
    _count: { id: true },
  });
  const featureCount = distinctActions.length;
  let featureFactor = 0.1;
  if (featureCount >= 8) featureFactor = 0.9;
  else if (featureCount >= 5) featureFactor = 0.7;
  else if (featureCount >= 3) featureFactor = 0.5;
  else featureFactor = 0.2;

  // ── Entitlement limit proximity (usage vs plan limits) ──
  const usageTracking = await db.usageTracking.findMany({
    where: {
      userId,
      periodEnd: { gte: new Date() },
    },
    select: { feature: true, count: true },
  });

  const limitProximity = usageTracking.length; // more features tracked = more active
  let limitFactor = 0.1;
  if (limitProximity >= 5) limitFactor = 0.7;
  else if (limitProximity >= 3) limitFactor = 0.5;
  else if (limitProximity >= 1) limitFactor = 0.3;

  // ── Plan upgrade path ──
  const planBoost = user.plan === 'free' ? 0.1 : 0; // free users more likely to upgrade

  // ── Combined probability ──
  const upgradeProbability = clamp(
    utilizationFactor * 0.35 +
    addonFactor * 0.25 +
    featureFactor * 0.2 +
    limitFactor * 0.1 +
    planBoost +
    0.1, // base
    0,
    1
  );

  // ── Confidence ──
  const confidence = clamp(
    0.25 +
    (creditAddons.length > 0 ? 0.15 : 0) +
    (distinctActions.length > 3 ? 0.15 : 0) +
    (usageTracking.length > 0 ? 0.15 : 0) +
    (creditUtilization > 0 ? 0.1 : 0),
    0.1,
    0.9
  );

  return storePrediction({
    userId,
    category: 'billing',
    predictionType: 'upgrade_probability',
    predictedValue: roundTo(upgradeProbability, 4),
    confidence: roundTo(confidence, 4),
    inputData: {
      plan: user.plan,
      creditsRemaining,
      creditsMonthly,
      creditUtilization: roundTo(creditUtilization, 4),
      utilizationFactor: roundTo(utilizationFactor, 4),
      totalAddonCredits,
      recentAddons,
      addonFactor: roundTo(addonFactor, 4),
      featureCount,
      featureFactor: roundTo(featureFactor, 4),
      limitProximity,
      limitFactor: roundTo(limitFactor, 4),
    },
    predictionHorizon: '30d',
  });
}

/**
 * Predict subscription renewal risk (0-1).
 *
 * Signals:
 *   - cancelAtPeriodEnd flag
 *   - Subscription age (newer = higher risk)
 *   - Recent payment failures
 *   - Usage decline
 *   - Plan changes (downgrades)
 */
export async function predictRenewalRisk(
  userId: string
): Promise<PredictionResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true, createdAt: true, isTrial: true, trialEndsAt: true },
  });

  if (!user) {
    return storePrediction({
      userId,
      category: 'billing',
      predictionType: 'renewal_risk',
      predictedValue: 1.0,
      confidence: 0.5,
      inputData: { error: 'User not found' },
      predictionHorizon: '30d',
    });
  }

  // Free plan = no renewal risk (no subscription)
  if (user.plan === 'free') {
    return storePrediction({
      userId,
      category: 'billing',
      predictionType: 'renewal_risk',
      predictedValue: 0,
      confidence: 0.95,
      inputData: { reason: 'Free plan has no renewal' },
      predictionHorizon: '30d',
    });
  }

  // ── Subscription factor ──
  const subscription = await db.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  let subscriptionRisk = 0.3;
  if (subscription) {
    if (subscription.cancelAtPeriodEnd) subscriptionRisk = 0.9;
    else if (subscription.status === 'past_due') subscriptionRisk = 0.8;
    else if (subscription.status === 'canceled') subscriptionRisk = 1.0;
    else if (subscription.status === 'trialing') subscriptionRisk = 0.5;
    else if (subscription.status === 'active') subscriptionRisk = 0.2;
    else subscriptionRisk = 0.4; // expired or other
  }

  // ── Subscription age factor (newer subscriptions are riskier) ──
  let ageFactor = 0.3;
  if (subscription?.createdAt) {
    const ageDays = (Date.now() - subscription.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 7) ageFactor = 0.7;
    else if (ageDays < 30) ageFactor = 0.5;
    else if (ageDays < 90) ageFactor = 0.3;
    else ageFactor = 0.1; // long-standing subscriber = lower risk
  }

  // ── Payment failure factor ──
  const failedPayments = await db.paymentOrder.count({
    where: { userId, status: 'failed' },
  });
  let paymentFactor = 0.1;
  if (failedPayments >= 3) paymentFactor = 0.8;
  else if (failedPayments >= 2) paymentFactor = 0.6;
  else if (failedPayments >= 1) paymentFactor = 0.4;

  // ── Usage trend factor ──
  const last7Start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const prev7Start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const recentUsage = await db.creditsLedger.aggregate({
    where: { userId, credits: { lt: 0 }, createdAt: { gte: last7Start } },
    _sum: { credits: true },
  });
  const previousUsage = await db.creditsLedger.aggregate({
    where: { userId, credits: { lt: 0 }, createdAt: { gte: prev7Start, lt: last7Start } },
    _sum: { credits: true },
  });

  const recentUsed = Math.abs(recentUsage._sum.credits ?? 0);
  const previousUsed = Math.abs(previousUsage._sum.credits ?? 0);

  let usageTrendFactor = 0.3;
  if (previousUsed > 0) {
    const ratio = recentUsed / previousUsed;
    if (ratio < 0.3) usageTrendFactor = 0.8;
    else if (ratio < 0.6) usageTrendFactor = 0.5;
    else if (ratio < 0.9) usageTrendFactor = 0.3;
    else usageTrendFactor = 0.1;
  } else if (recentUsed === 0) {
    usageTrendFactor = 0.9;
  }

  // ── Downgrade history factor ──
  const downgradeEvents = await db.auditLog.count({
    where: {
      userId,
      action: { in: ['plan_downgrade', 'subscription_downgrade'] },
    },
  });
  const downgradeFactor = clamp(downgradeEvents * 0.15, 0, 0.6);

  // ── Combined risk ──
  const renewalRisk = clamp(
    subscriptionRisk * 0.35 +
    ageFactor * 0.15 +
    paymentFactor * 0.2 +
    usageTrendFactor * 0.2 +
    downgradeFactor * 0.1,
    0,
    1
  );

  // ── Confidence ──
  const dataPoints = [
    subscription !== null,
    failedPayments > 0,
    recentUsed > 0 || previousUsed > 0,
    downgradeEvents > 0,
    subscription?.cancelAtPeriodEnd === true,
  ].filter(Boolean).length;

  const confidence = clamp(0.3 + (dataPoints / 5) * 0.45, 0.1, 0.9);

  return storePrediction({
    userId,
    category: 'billing',
    predictionType: 'renewal_risk',
    predictedValue: roundTo(renewalRisk, 4),
    confidence: roundTo(confidence, 4),
    inputData: {
      plan: user.plan,
      subscriptionStatus: subscription?.status ?? 'none',
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      subscriptionAgeDays: subscription?.createdAt
        ? Math.round((Date.now() - subscription.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      subscriptionRisk: roundTo(subscriptionRisk, 4),
      ageFactor: roundTo(ageFactor, 4),
      failedPayments,
      paymentFactor: roundTo(paymentFactor, 4),
      recentUsed,
      previousUsed,
      usageTrendFactor: roundTo(usageTrendFactor, 4),
      downgradeEvents,
      downgradeFactor: roundTo(downgradeFactor, 4),
    },
    predictionHorizon: '30d',
  });
}

// ═══════════════════════════════════════════════════════════════════
// 4. WORKFLOW PREDICTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Predict workflow failure likelihood based on recent failure rate.
 *
 * Formula:
 *   recentFailureRate = failed executions / total executions in last 14 days
 *   If insufficient data, use workflow's failureCount / runCount
 *   Adjusted by recent trend (increasing failures = higher prediction)
 */
export async function predictFailureProbability(
  userId: string,
  workflowId: string
): Promise<PredictionResult> {
  // Verify workflow belongs to user
  const workflow = await db.workflowDefinition.findFirst({
    where: { id: workflowId, userId },
    select: {
      id: true,
      name: true,
      runCount: true,
      successCount: true,
      failureCount: true,
      status: true,
    },
  });

  if (!workflow) {
    return storePrediction({
      userId,
      category: 'workflow',
      predictionType: 'failure_probability',
      targetEntityId: workflowId,
      predictedValue: 0,
      confidence: 0.1,
      inputData: { error: 'Workflow not found' },
      predictionHorizon: '7d',
    });
  }

  // ── Historical failure rate from workflow stats ──
  const totalRuns = workflow.runCount;
  const historicalFailureRate = totalRuns > 0 ? workflow.failureCount / totalRuns : 0;

  // ── Recent execution failure rate (last 14 days) ──
  const lookbackStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const recentExecutions = await db.workflowExecution.findMany({
    where: {
      workflowId,
      createdAt: { gte: lookbackStart },
    },
    select: { status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  let recentFailed = 0;
  let recentTotal = recentExecutions.length;

  // Daily failure counts for trend
  const dailyFailures: number[] = [];
  const dailyTotals: number[] = [];
  const dailyMap = new Map<string, { total: number; failed: number }>();

  for (const exec of recentExecutions) {
    const dayKey = exec.createdAt.toISOString().split('T')[0];
    const entry = dailyMap.get(dayKey) || { total: 0, failed: 0 };
    entry.total += 1;
    if (exec.status === 'failed' || exec.status === 'dead_letter') {
      recentFailed += 1;
      entry.failed += 1;
    }
    dailyMap.set(dayKey, entry);
  }

  for (const entry of dailyMap.values()) {
    dailyTotals.push(entry.total);
    dailyFailures.push(entry.failed);
  }

  const recentFailureRate = recentTotal > 0 ? recentFailed / recentTotal : historicalFailureRate;

  // ── Trend: are failures increasing? ──
  const failureTrend = computeLinearTrend(dailyFailures);

  // ── Blended prediction ──
  // More weight to recent data if we have it
  let predictedFailure: number;
  if (recentTotal >= 5) {
    // Blend recent rate with historical, adjusted by trend
    predictedFailure = clamp(
      recentFailureRate * 0.6 +
      historicalFailureRate * 0.3 +
      Math.max(0, failureTrend) * 0.1,
      0,
      1
    );
  } else {
    // Rely more on workflow's aggregate stats
    predictedFailure = clamp(historicalFailureRate, 0, 1);
  }

  // ── Confidence ──
  const executionVolume = Math.min(recentTotal / 20, 1);
  const confidence = clamp(
    0.2 +
    (recentTotal >= 5 ? 0.3 : 0) +
    executionVolume * 0.2 +
    (totalRuns >= 10 ? 0.2 : totalRuns / 50),
    0.1,
    0.9
  );

  return storePrediction({
    userId,
    category: 'workflow',
    predictionType: 'failure_probability',
    targetEntityId: workflowId,
    predictedValue: roundTo(predictedFailure, 4),
    confidence: roundTo(confidence, 4),
    inputData: {
      workflowName: workflow.name,
      workflowStatus: workflow.status,
      totalRuns,
      successCount: workflow.successCount,
      failureCount: workflow.failureCount,
      historicalFailureRate: roundTo(historicalFailureRate, 4),
      recentTotal,
      recentFailed,
      recentFailureRate: roundTo(recentFailureRate, 4),
      failureTrend: roundTo(failureTrend, 4),
    },
    predictionHorizon: '7d',
  });
}

/**
 * Predict retry likelihood for a workflow based on its retry history.
 *
 * Formula:
 *   retryRate = total retries / total executions
 *   recentRetryRate = retries in last 14 days / executions in last 14 days
 *   prediction = blend of recent and historical rates
 */
export async function predictRetryProbability(
  userId: string,
  workflowId: string
): Promise<PredictionResult> {
  const workflow = await db.workflowDefinition.findFirst({
    where: { id: workflowId, userId },
    select: { id: true, name: true, runCount: true, maxRetries: true },
  });

  if (!workflow) {
    return storePrediction({
      userId,
      category: 'workflow',
      predictionType: 'retry_probability',
      targetEntityId: workflowId,
      predictedValue: 0,
      confidence: 0.1,
      inputData: { error: 'Workflow not found' },
      predictionHorizon: '7d',
    });
  }

  // ── Historical retry stats ──
  const totalRetryAgg = await db.workflowExecution.aggregate({
    where: { workflowId },
    _sum: { retryCount: true },
    _count: { id: true },
  });

  const totalRetries = totalRetryAgg._sum.retryCount ?? 0;
  const totalExecutions = totalRetryAgg._count.id;
  const historicalRetryRate = totalExecutions > 0 ? clamp(totalRetries / totalExecutions, 0, 1) : 0;

  // ── Recent retry rate (14 days) ──
  const lookbackStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const recentRetryAgg = await db.workflowExecution.aggregate({
    where: { workflowId, createdAt: { gte: lookbackStart } },
    _sum: { retryCount: true },
    _count: { id: true },
  });

  const recentRetries = recentRetryAgg._sum.retryCount ?? 0;
  const recentExecCount = recentRetryAgg._count.id;
  const recentRetryRate = recentExecCount > 0 ? clamp(recentRetries / recentExecCount, 0, 1) : historicalRetryRate;

  // ── Blended prediction ──
  let predictedRetry: number;
  if (recentExecCount >= 5) {
    predictedRetry = clamp(
      recentRetryRate * 0.65 + historicalRetryRate * 0.35,
      0,
      1
    );
  } else {
    predictedRetry = clamp(historicalRetryRate, 0, 1);
  }

  // Workflows with maxRetries=0 have 0 retry probability
  if (workflow.maxRetries === 0) {
    predictedRetry = 0;
  }

  // ── Confidence ──
  const confidence = clamp(
    0.2 +
    (recentExecCount >= 5 ? 0.3 : 0) +
    (totalExecutions >= 10 ? 0.2 : 0) +
    Math.min(recentExecCount / 30, 1) * 0.2,
    0.1,
    0.9
  );

  return storePrediction({
    userId,
    category: 'workflow',
    predictionType: 'retry_probability',
    targetEntityId: workflowId,
    predictedValue: roundTo(predictedRetry, 4),
    confidence: roundTo(confidence, 4),
    inputData: {
      workflowName: workflow.name,
      maxRetries: workflow.maxRetries,
      totalRetries,
      totalExecutions,
      historicalRetryRate: roundTo(historicalRetryRate, 4),
      recentRetries,
      recentExecCount,
      recentRetryRate: roundTo(recentRetryRate, 4),
    },
    predictionHorizon: '7d',
  });
}

/**
 * Predict workflow throughput (executions per hour) for the next N hours.
 *
 * Formula:
 *   recentHourlyThroughput = completed executions per hour over last 24h
 *   trend = from daily throughput over last 7 days
 *   predictedThroughput = recentHourlyThroughput + trend adjustment
 */
export async function predictThroughput(
  userId: string,
  hours: number = DEFAULT_THROUGHPUT_HOURS
): Promise<PredictionResult> {
  // Get user's workflow IDs
  const workflows = await db.workflowDefinition.findMany({
    where: { userId, status: 'active' },
    select: { id: true, name: true },
  });

  const workflowIds = workflows.map(w => w.id);

  if (workflowIds.length === 0) {
    return storePrediction({
      userId,
      category: 'workflow',
      predictionType: 'throughput_prediction',
      predictedValue: 0,
      confidence: 0.3,
      inputData: { reason: 'No active workflows' },
      predictionHorizon: `${hours}h`,
    });
  }

  // ── Recent throughput (last 24h) ──
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const recentCompleted = await db.workflowExecution.count({
    where: {
      workflowId: { in: workflowIds },
      status: 'completed',
      completedAt: { gte: last24h },
    },
  });

  const recentHourlyThroughput = recentCompleted / 24;

  // ── 7-day daily throughput for trend ──
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const weeklyExecutions = await db.workflowExecution.findMany({
    where: {
      workflowId: { in: workflowIds },
      status: 'completed',
      completedAt: { gte: last7d },
    },
    select: { completedAt: true },
    orderBy: { completedAt: 'asc' },
  });

  // Group by day
  const dailyMap = new Map<string, number>();
  for (const exec of weeklyExecutions) {
    if (exec.completedAt) {
      const dayKey = exec.completedAt.toISOString().split('T')[0];
      dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + 1);
    }
  }

  const dailyThroughputs: number[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dayKey = date.toISOString().split('T')[0];
    dailyThroughputs.unshift(dailyMap.get(dayKey) || 0);
  }

  const avgDailyThroughput = dailyThroughputs.length > 0
    ? dailyThroughputs.reduce((s, v) => s + v, 0) / dailyThroughputs.length
    : 0;
  const avgHourlyFromWeekly = avgDailyThroughput / 24;

  const trend = computeLinearTrend(dailyThroughputs);
  const hourlyTrend = trend / 24;

  // ── Also count queued executions as pending demand ──
  const queuedCount = await db.workflowExecution.count({
    where: {
      workflowId: { in: workflowIds },
      status: 'queued',
    },
  });

  // ── Blended prediction ──
  const baseThroughput = recentHourlyThroughput > 0
    ? recentHourlyThroughput * 0.6 + avgHourlyFromWeekly * 0.4
    : avgHourlyFromWeekly;

  const predictedHourlyThroughput = Math.max(0, baseThroughput + hourlyTrend);
  const predictedTotalThroughput = predictedHourlyThroughput * hours;

  // ── Confidence ──
  const dataVolume = clamp(weeklyExecutions.length / 50, 0, 1);
  const confidence = clamp(
    0.2 +
    (recentCompleted > 0 ? 0.2 : 0) +
    dataVolume * 0.3 +
    (workflowIds.length >= 3 ? 0.1 : 0) +
    (queuedCount > 0 ? 0.1 : 0),
    0.1,
    0.9
  );

  return storePrediction({
    userId,
    category: 'workflow',
    predictionType: 'throughput_prediction',
    predictedValue: roundTo(predictedTotalThroughput, 2),
    confidence: roundTo(confidence, 4),
    inputData: {
      activeWorkflows: workflowIds.length,
      recentCompleted24h: recentCompleted,
      recentHourlyThroughput: roundTo(recentHourlyThroughput, 4),
      avgDailyThroughput: roundTo(avgDailyThroughput, 4),
      avgHourlyFromWeekly: roundTo(avgHourlyFromWeekly, 4),
      trend: roundTo(trend, 4),
      hourlyTrend: roundTo(hourlyTrend, 4),
      predictedHourlyThroughput: roundTo(predictedHourlyThroughput, 4),
      queuedExecutions: queuedCount,
      predictionHours: hours,
    },
    predictionHorizon: `${hours}h`,
  });
}

// ═══════════════════════════════════════════════════════════════════
// 5. BULK GENERATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Run all prediction categories and store results in the AnalyticsPrediction table.
 * Returns all generated predictions.
 */
export async function generateAllPredictions(
  userId: string
): Promise<PredictionResult[]> {
  const predictions: PredictionResult[] = [];
  const errors: { category: string; error: string }[] = [];

  // ── Lead Predictions ──
  try {
    // Get active leads for per-lead predictions
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });

    const activeLeads = await db.lead.findMany({
      where: {
        isActive: true,
        OR: [{ userId }, ...(user?.orgId ? [{ orgId: user.orgId }] : [])],
      },
      select: { id: true, stage: true },
      take: 100, // Limit to top 100 leads to avoid excessive computation
      orderBy: { conversionScore: 'desc' },
    });

    // Per-lead predictions for leads in advanced stages
    const advancedLeads = activeLeads.filter(l =>
      ['interested', 'negotiation', 'proposal_sent'].includes(l.stage)
    );

    for (const lead of advancedLeads.slice(0, 20)) {
      try {
        predictions.push(await predictConversionProbability(userId, lead.id));
      } catch (e) {
        errors.push({ category: `conversion_prob:${lead.id}`, error: String(e) });
      }

      try {
        predictions.push(await predictCloseProbability(userId, lead.id));
      } catch (e) {
        errors.push({ category: `close_prob:${lead.id}`, error: String(e) });
      }
    }

    // Pipeline-level predictions
    try {
      predictions.push(await predictExpectedRevenue(userId));
    } catch (e) {
      errors.push({ category: 'expected_revenue', error: String(e) });
    }

    try {
      predictions.push(await predictLeadVelocity(userId));
    } catch (e) {
      errors.push({ category: 'lead_velocity', error: String(e) });
    }
  } catch (e) {
    errors.push({ category: 'lead', error: String(e) });
  }

  // ── AI Predictions ──
  try {
    predictions.push(await predictFutureUsage(userId));
  } catch (e) {
    errors.push({ category: 'future_usage', error: String(e) });
  }

  try {
    predictions.push(await predictFutureCredits(userId));
  } catch (e) {
    errors.push({ category: 'future_credits', error: String(e) });
  }

  try {
    predictions.push(await predictProviderCostForecast(userId));
  } catch (e) {
    errors.push({ category: 'cost_forecast', error: String(e) });
  }

  // ── Billing Predictions ──
  try {
    predictions.push(await predictChurn(userId));
  } catch (e) {
    errors.push({ category: 'churn', error: String(e) });
  }

  try {
    predictions.push(await predictUpgradeProbability(userId));
  } catch (e) {
    errors.push({ category: 'upgrade_prob', error: String(e) });
  }

  try {
    predictions.push(await predictRenewalRisk(userId));
  } catch (e) {
    errors.push({ category: 'renewal_risk', error: String(e) });
  }

  // ── Workflow Predictions ──
  try {
    const workflows = await db.workflowDefinition.findMany({
      where: { userId, status: 'active' },
      select: { id: true },
      take: 20,
    });

    for (const wf of workflows) {
      try {
        predictions.push(await predictFailureProbability(userId, wf.id));
      } catch (e) {
        errors.push({ category: `failure_prob:${wf.id}`, error: String(e) });
      }

      try {
        predictions.push(await predictRetryProbability(userId, wf.id));
      } catch (e) {
        errors.push({ category: `retry_prob:${wf.id}`, error: String(e) });
      }
    }

    try {
      predictions.push(await predictThroughput(userId));
    } catch (e) {
      errors.push({ category: 'throughput', error: String(e) });
    }
  } catch (e) {
    errors.push({ category: 'workflow', error: String(e) });
  }

  if (errors.length > 0) {
    console.warn('[PredictiveAnalytics] generateAllPredictions errors:', errors);
  }

  return predictions;
}

/**
 * Retrieve stored predictions with optional filtering.
 */
export async function getPredictions(
  userId: string,
  category?: PredictionCategory,
  predictionType?: PredictionType
): Promise<PredictionResult[]> {
  const where: Record<string, unknown> = { userId };

  if (category) {
    where.category = category;
  }
  if (predictionType) {
    where.predictionType = predictionType;
  }

  const records = await db.analyticsPrediction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return records.map(dbRecordToResult);
}

// ═══════════════════════════════════════════════════════════════════
// 6. ACTUALIZATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Update a prediction with the actual outcome value for model accuracy tracking.
 * Returns the updated prediction or null if not found.
 */
export async function actualizePrediction(
  predictionId: string,
  actualValue: number
): Promise<PredictionResult | null> {
  const existing = await db.analyticsPrediction.findUnique({
    where: { id: predictionId },
  });

  if (!existing) {
    return null;
  }

  const updated = await db.analyticsPrediction.update({
    where: { id: predictionId },
    data: {
      actualValue,
      actualizedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return dbRecordToResult(updated);
}

/**
 * Compute model accuracy metrics for predictions that have been actualized.
 * Returns accuracy statistics by category and prediction type.
 */
export async function getModelAccuracy(
  userId: string,
  category?: PredictionCategory
): Promise<{
  totalActualized: number;
  avgAbsoluteError: number;
  avgPercentError: number;
  byType: { predictionType: string; count: number; avgAbsError: number; avgPctError: number }[];
}> {
  const where: Record<string, unknown> = {
    userId,
    actualizedAt: { not: null },
    actualValue: { not: null },
  };

  if (category) {
    where.category = category;
  }

  const actualized = await db.analyticsPrediction.findMany({
    where,
    select: {
      predictionType: true,
      predictedValue: true,
      actualValue: true,
    },
  });

  if (actualized.length === 0) {
    return {
      totalActualized: 0,
      avgAbsoluteError: 0,
      avgPercentError: 0,
      byType: [],
    };
  }

  const errors = actualized.map(p => {
    const predicted = p.predictedValue ?? 0;
    const actual = p.actualValue ?? 0;
    const absError = Math.abs(predicted - actual);
    const pctError = actual !== 0 ? (absError / Math.abs(actual)) * 100 : (predicted !== 0 ? 100 : 0);
    return { predictionType: p.predictionType ?? 'unknown', absError, pctError };
  });

  const avgAbsoluteError = errors.reduce((s, e) => s + e.absError, 0) / errors.length;
  const avgPercentError = errors.reduce((s, e) => s + e.pctError, 0) / errors.length;

  // Group by type
  const typeMap = new Map<string, { count: number; absErrors: number[]; pctErrors: number[] }>();
  for (const e of errors) {
    const entry = typeMap.get(e.predictionType) || { count: 0, absErrors: [], pctErrors: [] };
    entry.count += 1;
    entry.absErrors.push(e.absError);
    entry.pctErrors.push(e.pctError);
    typeMap.set(e.predictionType, entry);
  }

  const byType = Array.from(typeMap.entries()).map(([predictionType, data]) => ({
    predictionType,
    count: data.count,
    avgAbsError: roundTo(data.absErrors.reduce((s, v) => s + v, 0) / data.count, 4),
    avgPctError: roundTo(data.pctErrors.reduce((s, v) => s + v, 0) / data.count, 4),
  }));

  return {
    totalActualized: actualized.length,
    avgAbsoluteError: roundTo(avgAbsoluteError, 4),
    avgPercentError: roundTo(avgPercentError, 4),
    byType,
  };
}

/**
 * Clean up expired predictions from the database.
 * Returns the count of deleted records.
 */
export async function cleanupExpiredPredictions(
  userId?: string
): Promise<number> {
  const where: Record<string, unknown> = {
    expiresAt: { lt: new Date() },
    actualizedAt: null, // Don't delete actualized predictions
  };

  if (userId) {
    where.userId = userId;
  }

  const result = await db.analyticsPrediction.deleteMany({ where });
  return result.count;
}
