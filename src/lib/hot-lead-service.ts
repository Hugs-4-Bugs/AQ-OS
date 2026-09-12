// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Hot Lead Detection Service v2
// Phase: Criteria-based hot lead classification & monitoring
//
// CLASSIFICATION TIERS (by criteria met):
//   🔥 FIRE    — 3+ criteria met — immediate action required
//   ⚡ HOT     — 2 criteria met — high priority outreach
//   🌡️ WARM    — 1 criterion met — monitor and nurture
//   ❄️ COLD    — 0 criteria met — standard nurture flow
//
// HOT LEAD CRITERIA:
//   1. purchaseProbability >= 70 (high buying intent)
//   2. outreachPriority = 'critical' or 'high'
//   3. leadQualityScore >= 80
//   4. reply urgency = 'high' or 'critical'  (urgencyScore >= 70)
//   5. 3+ buying signals detected
//   6. lead stage = 'interested' or 'negotiation'
//
// STORAGE:
//   - Heat index stored in LeadScore (scoreType: 'heat_index')
//   - Temperature history in LeadActivity (type: 'hot_lead_temperature')
//   - Notifications via Notification model
//
// RULES:
//   - NO credit deduction — uses existing scored data
//   - NO AI/LLM calls — purely algorithmic
//   - Never throw — graceful error handling
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendNotification } from '@/lib/notification-engine';
import { logAuditEvent } from '@/lib/lead-audit';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type LeadTemperature = 'cold' | 'warm' | 'hot' | 'fire';

export type TemperatureChange = 'heating' | 'cooling' | 'stable' | 'new';

export interface HotLead {
  leadId: string;
  leadName: string;
  temperature: LeadTemperature;
  heatIndex: number;
  criteria: string[];
  lastTemperature: LeadTemperature;
  temperatureChange: TemperatureChange;
  purchaseProbability: number;
  outreachPriority: string;
  lastActivityAt: Date;
}

export interface HotLeadFeed {
  leads: HotLead[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface HotLeadScanResult {
  scannedAt: Date;
  totalLeadsScanned: number;
  results: HotLead[];
  newHotLeads: HotLead[];
  heatingUpLeads: HotLead[];
  coolingDownLeads: HotLead[];
}

export interface HotLeadStats {
  total: number;
  fire: number;
  hot: number;
  warm: number;
  cold: number;
  heatingUp: number;
  coolingDown: number;
  averageHeatIndex: number;
  lastScannedAt: Date | null;
}

export interface HotLeadFeedFilters {
  temperature?: LeadTemperature;
  page?: number;
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** Temperature rank for comparing temperatures (higher = hotter) */
const TEMPERATURE_RANK: Record<LeadTemperature, number> = {
  cold: 0,
  warm: 1,
  hot: 2,
  fire: 3,
};

/** Priority thresholds mapped from urgencyScore */
const PRIORITY_FROM_SCORE: Record<string, string> = {
  critical: '90',
  high: '70',
  medium: '40',
  low: '20',
};

/** Criteria identifiers */
const CRITERIA_IDS = {
  PURCHASE_PROBABILITY: 'purchase_probability_high',
  OUTREACH_PRIORITY: 'outreach_priority_critical_high',
  LEAD_QUALITY: 'lead_quality_high',
  REPLY_URGENCY: 'reply_urgency_high',
  BUYING_SIGNALS: 'buying_signals_multiple',
  STAGE_ADVANCED: 'stage_interested_negotiation',
} as const;

/** Buying signals required for criterion 5 */
const BUYING_SIGNALS_THRESHOLD = 3;

/** Pipeline stages that qualify for criterion 6 */
const ADVANCED_STAGES = ['interested', 'negotiation', 'proposal_sent', 'closed_won'];

/** Default page size for feed */
const DEFAULT_PAGE_SIZE = 20;

/** Max page size */
const MAX_PAGE_SIZE = 100;

/** Monitoring interval in milliseconds (5 minutes) */
const MONITORING_INTERVAL_MS = 5 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════
// CRITERIA EVALUATION
// ═══════════════════════════════════════════════════════════════════

interface LeadEvaluationData {
  id: string;
  businessName: string;
  conversionScore: number;     // purchaseProbability
  replyScore: number;          // leadQualityScore
  urgencyScore: number;        // reply urgency
  stage: string;
  updatedAt: Date;
  communications: Array<{ buyingSignals: string | null }>;
}

interface CriteriaEvaluation {
  metCriteria: string[];
  criteriaDetails: Record<string, boolean>;
}

/**
 * Evaluate all 6 hot lead criteria for a given lead.
 */
function evaluateCriteria(lead: LeadEvaluationData): CriteriaEvaluation {
  const metCriteria: string[] = [];
  const criteriaDetails: Record<string, boolean> = {};

  // Criterion 1: purchaseProbability >= 70
  const purchaseProbHigh = lead.conversionScore >= 70;
  criteriaDetails[CRITERIA_IDS.PURCHASE_PROBABILITY] = purchaseProbHigh;
  if (purchaseProbHigh) {
    metCriteria.push(CRITERIA_IDS.PURCHASE_PROBABILITY);
  }

  // Criterion 2: outreachPriority = 'critical' or 'high'
  // outreachPriority is derived from urgencyScore:
  //   urgencyScore >= 80 → critical, >= 60 → high
  const outreachPriority = deriveOutreachPriority(lead.urgencyScore);
  const priorityHigh = outreachPriority === 'critical' || outreachPriority === 'high';
  criteriaDetails[CRITERIA_IDS.OUTREACH_PRIORITY] = priorityHigh;
  if (priorityHigh) {
    metCriteria.push(CRITERIA_IDS.OUTREACH_PRIORITY);
  }

  // Criterion 3: leadQualityScore >= 80
  const qualityHigh = lead.replyScore >= 80;
  criteriaDetails[CRITERIA_IDS.LEAD_QUALITY] = qualityHigh;
  if (qualityHigh) {
    metCriteria.push(CRITERIA_IDS.LEAD_QUALITY);
  }

  // Criterion 4: reply urgency = 'high' or 'critical'
  const urgencyHigh = lead.urgencyScore >= 70;
  criteriaDetails[CRITERIA_IDS.REPLY_URGENCY] = urgencyHigh;
  if (urgencyHigh) {
    metCriteria.push(CRITERIA_IDS.REPLY_URGENCY);
  }

  // Criterion 5: 3+ buying signals detected
  const buyingSignalCount = countBuyingSignals(lead.communications);
  const hasManySignals = buyingSignalCount >= BUYING_SIGNALS_THRESHOLD;
  criteriaDetails[CRITERIA_IDS.BUYING_SIGNALS] = hasManySignals;
  if (hasManySignals) {
    metCriteria.push(CRITERIA_IDS.BUYING_SIGNALS);
  }

  // Criterion 6: lead moved to 'interested' or 'negotiation' stage
  const stageAdvanced = ADVANCED_STAGES.includes(lead.stage);
  criteriaDetails[CRITERIA_IDS.STAGE_ADVANCED] = stageAdvanced;
  if (stageAdvanced) {
    metCriteria.push(CRITERIA_IDS.STAGE_ADVANCED);
  }

  return { metCriteria, criteriaDetails };
}

/**
 * Derive outreach priority from urgencyScore.
 */
function deriveOutreachPriority(urgencyScore: number): string {
  if (urgencyScore >= 80) return 'critical';
  if (urgencyScore >= 60) return 'high';
  if (urgencyScore >= 40) return 'medium';
  return 'low';
}

/**
 * Count total buying signals from communications.
 */
function countBuyingSignals(communications: Array<{ buyingSignals: string | null }>): number {
  let total = 0;

  for (const comm of communications) {
    if (!comm.buyingSignals) continue;

    try {
      const parsed = JSON.parse(comm.buyingSignals);
      if (Array.isArray(parsed)) {
        total += parsed.length;
      } else if (typeof parsed === 'object' && parsed !== null) {
        for (const value of Object.values(parsed)) {
          if (Array.isArray(value)) {
            total += value.length;
          } else {
            total += 1;
          }
        }
      } else {
        total += 1;
      }
    } catch {
      if (comm.buyingSignals.trim().length > 0) {
        total += 1;
      }
    }
  }

  return total;
}

// ═══════════════════════════════════════════════════════════════════
// TEMPERATURE CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Classify a lead into a temperature tier based on criteria count.
 *   3+ criteria → fire
 *   2 criteria → hot
 *   1 criterion → warm
 *   0 criteria → cold
 */
function classifyTemperature(criteriaCount: number): LeadTemperature {
  if (criteriaCount >= 3) return 'fire';
  if (criteriaCount >= 2) return 'hot';
  if (criteriaCount >= 1) return 'warm';
  return 'cold';
}

/**
 * Determine temperature change direction.
 */
function determineTemperatureChange(
  current: LeadTemperature,
  previous: LeadTemperature | null
): TemperatureChange {
  if (!previous) return 'new';

  const currentRank = TEMPERATURE_RANK[current];
  const previousRank = TEMPERATURE_RANK[previous];

  if (currentRank > previousRank) return 'heating';
  if (currentRank < previousRank) return 'cooling';
  return 'stable';
}

// ═══════════════════════════════════════════════════════════════════
// HEAT INDEX CALCULATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate a composite heat index (0-100) for a lead.
 *
 * Combines:
 *   - Criteria count contribution (0-60 points, 10 per criterion)
 *   - Conversion score contribution (0-20 points)
 *   - Urgency score contribution (0-20 points)
 */
function calculateHeatIndex(
  criteriaCount: number,
  conversionScore: number,
  urgencyScore: number
): number {
  const criteriaPoints = Math.min(60, criteriaCount * 10);
  const conversionPoints = Math.round((Math.min(100, conversionScore) / 100) * 20);
  const urgencyPoints = Math.round((Math.min(100, urgencyScore) / 100) * 20);

  return Math.max(0, Math.min(100, criteriaPoints + conversionPoints + urgencyPoints));
}

// ═══════════════════════════════════════════════════════════════════
// DATA ACCESS
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch all active leads with their communications for a user.
 */
async function fetchUserLeads(userId: string): Promise<LeadEvaluationData[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  const orgId = user?.orgId;

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
      replyScore: true,
      urgencyScore: true,
      stage: true,
      updatedAt: true,
      communications: {
        select: { buyingSignals: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });

  return leads;
}

/**
 * Get the last recorded temperature for a lead from LeadActivity.
 */
async function getLastTemperature(leadId: string): Promise<LeadTemperature | null> {
  const activity = await db.leadActivity.findFirst({
    where: {
      leadId,
      type: 'hot_lead_temperature',
    },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });

  if (!activity?.metadata) return null;

  try {
    const parsed = JSON.parse(activity.metadata) as { temperature?: LeadTemperature };
    if (parsed.temperature && ['cold', 'warm', 'hot', 'fire'].includes(parsed.temperature)) {
      return parsed.temperature;
    }
  } catch {
    // Malformed metadata
  }

  return null;
}

/**
 * Get the last heat index for a lead from LeadScore.
 */
async function getLastHeatIndex(leadId: string): Promise<number> {
  const score = await db.leadScore.findFirst({
    where: {
      leadId,
      scoreType: 'heat_index',
    },
    orderBy: { scoredAt: 'desc' },
    select: { score: true },
  });

  return score?.score ?? 0;
}

/**
 * Get all leads with their latest heat index from LeadScore.
 * Returns a map of leadId → heatIndex for fast lookups.
 */
async function getAllHeatIndices(userId: string): Promise<Map<string, number>> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  const orgId = user?.orgId;

  const where: Record<string, unknown> = {
    scoreType: 'heat_index',
  };

  if (orgId) {
    where.OR = [{ lead: { userId } }, { lead: { orgId } }];
  } else {
    where.lead = { userId };
  }

  const scores = await db.leadScore.findMany({
    where,
    select: { leadId: true, score: true },
    orderBy: { scoredAt: 'desc' },
  });

  // Deduplicate — take latest per leadId
  const map = new Map<string, number>();
  for (const s of scores) {
    if (!map.has(s.leadId)) {
      map.set(s.leadId, s.score);
    }
  }

  return map;
}

// ═══════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════

/**
 * Store temperature change as a LeadActivity record.
 */
async function storeTemperatureRecord(
  leadId: string,
  temperature: LeadTemperature,
  criteria: string[],
  heatIndex: number,
  change: TemperatureChange
): Promise<void> {
  try {
    await db.leadActivity.create({
      data: {
        leadId,
        type: 'hot_lead_temperature',
        description: `Lead temperature: ${temperature} (heat index: ${heatIndex}). Change: ${change}. Criteria met: ${criteria.length}/6.`,
        metadata: JSON.stringify({
          temperature,
          heatIndex,
          criteria,
          change,
          recordedAt: new Date().toISOString(),
        }),
      },
    });
  } catch (error) {
    console.error('[HotLeadService] Failed to store temperature record:', error);
  }
}

/**
 * Store or update the heat index in LeadScore.
 */
async function storeHeatIndex(leadId: string, heatIndex: number): Promise<void> {
  try {
    // Upsert: delete old heat_index scores and create new one
    await db.leadScore.deleteMany({
      where: {
        leadId,
        scoreType: 'heat_index',
      },
    });

    await db.leadScore.create({
      data: {
        leadId,
        scoreType: 'heat_index',
        score: heatIndex,
        explanation: `Hot lead service heat index at ${new Date().toISOString()}`,
        modelVersion: 'hot-lead-v2',
      },
    });
  } catch (error) {
    console.error('[HotLeadService] Failed to store heat index:', error);
  }
}

/**
 * Create notification for a newly detected hot lead.
 */
async function notifyHotLead(
  userId: string,
  lead: HotLead,
  isNewDetection: boolean
): Promise<void> {
  try {
    const tempEmoji = lead.temperature === 'fire' ? '🔥' : lead.temperature === 'hot' ? '⚡' : '🌡️';

    const title = isNewDetection
      ? `${tempEmoji} New Hot Lead Detected: ${lead.leadName}`
      : `${tempEmoji} Lead Temperature Changed: ${lead.leadName}`;

    const changeText = lead.temperatureChange === 'heating'
      ? 'Temperature is rising!'
      : lead.temperatureChange === 'cooling'
      ? 'Temperature is cooling down.'
      : lead.temperatureChange === 'new'
      ? 'First temperature reading.'
      : 'Temperature stable.';

    const criteriaText = lead.criteria.length > 0
      ? `Criteria met: ${lead.criteria.join(', ')}`
      : 'No criteria met.';

    const message = `${lead.leadName} is now ${lead.temperature.toUpperCase()} (heat index: ${lead.heatIndex}/100). ${changeText} ${criteriaText}`;

    await sendNotification({
      userId,
      type: 'lead_pipeline_update',
      title,
      message,
      actionUrl: `/leads/${lead.leadId}`,
      metadata: {
        leadId: lead.leadId,
        leadName: lead.leadName,
        temperature: lead.temperature,
        heatIndex: lead.heatIndex,
        criteria: lead.criteria,
        temperatureChange: lead.temperatureChange,
        purchaseProbability: lead.purchaseProbability,
        outreachPriority: lead.outreachPriority,
        category: 'hot_lead_detection',
      },
    });
  } catch (error) {
    console.error('[HotLeadService] Failed to send notification:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// CORE SERVICE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Scan all leads for a user, classify temperatures, and notify.
 * This is the main entry point for hot lead detection.
 */
export async function scanHotLeads(userId: string): Promise<HotLeadScanResult> {
  const scannedAt = new Date();

  try {
    // Fetch all user leads
    const leads = await fetchUserLeads(userId);

    const results: HotLead[] = [];
    const newHotLeads: HotLead[] = [];
    const heatingUpLeads: HotLead[] = [];
    const coolingDownLeads: HotLead[] = [];

    for (const lead of leads) {
      try {
        // Evaluate criteria
        const evaluation = evaluateCriteria(lead);

        // Get previous temperature
        const lastTemp = await getLastTemperature(lead.id);

        // Classify current temperature
        const temperature = classifyTemperature(evaluation.metCriteria.length);

        // Determine change direction
        const temperatureChange = determineTemperatureChange(temperature, lastTemp);

        // Calculate heat index
        const heatIndex = calculateHeatIndex(
          evaluation.metCriteria.length,
          lead.conversionScore,
          lead.urgencyScore
        );

        // Derive outreach priority
        const outreachPriority = deriveOutreachPriority(lead.urgencyScore);

        const hotLead: HotLead = {
          leadId: lead.id,
          leadName: lead.businessName,
          temperature,
          heatIndex,
          criteria: evaluation.metCriteria,
          lastTemperature: lastTemp || 'cold',
          temperatureChange,
          purchaseProbability: lead.conversionScore,
          outreachPriority,
          lastActivityAt: lead.updatedAt,
        };

        results.push(hotLead);

        // Store temperature record and heat index
        await storeTemperatureRecord(lead.id, temperature, evaluation.metCriteria, heatIndex, temperatureChange);
        await storeHeatIndex(lead.id, heatIndex);

        // Categorize for notifications
        const isHotOrAbove = temperature === 'hot' || temperature === 'fire';
        const wasColdOrWarm = !lastTemp || lastTemp === 'cold' || lastTemp === 'warm';

        if (isHotOrAbove && temperatureChange === 'new') {
          newHotLeads.push(hotLead);
          // Notify for newly detected hot leads
          await notifyHotLead(userId, hotLead, true);
        } else if (temperatureChange === 'heating' && isHotOrAbove) {
          heatingUpLeads.push(hotLead);
          // Notify for leads heating up to hot or fire
          await notifyHotLead(userId, hotLead, false);
        } else if (temperatureChange === 'cooling') {
          coolingDownLeads.push(hotLead);
        }
      } catch (error) {
        console.error(`[HotLeadService] Error processing lead ${lead.id}:`, error);
      }
    }

    // Audit log
    await logAuditEvent(userId, 'hot_lead_scan', {
      scannedAt: scannedAt.toISOString(),
      totalLeads: leads.length,
      hotLeads: results.filter((r) => r.temperature === 'hot').length,
      fireLeads: results.filter((r) => r.temperature === 'fire').length,
      newHotLeads: newHotLeads.length,
      heatingUp: heatingUpLeads.length,
    });

    return {
      scannedAt,
      totalLeadsScanned: leads.length,
      results: results.sort((a, b) => b.heatIndex - a.heatIndex),
      newHotLeads,
      heatingUpLeads,
      coolingDownLeads,
    };
  } catch (error) {
    console.error('[HotLeadService] scanHotLeads failed:', error);

    return {
      scannedAt,
      totalLeadsScanned: 0,
      results: [],
      newHotLeads: [],
      heatingUpLeads: [],
      coolingDownLeads: [],
    };
  }
}

/**
 * Get the hot lead feed with optional filters.
 */
export async function getHotLeadFeed(
  userId: string,
  filters?: HotLeadFeedFilters
): Promise<HotLeadFeed> {
  const page = Math.max(1, filters?.page || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, filters?.limit || DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * limit;

  try {
    // Fetch all leads and evaluate
    const leads = await fetchUserLeads(userId);

    const evaluated: HotLead[] = [];

    for (const lead of leads) {
      const evaluation = evaluateCriteria(lead);
      const temperature = classifyTemperature(evaluation.metCriteria.length);
      const lastTemp = await getLastTemperature(lead.id);
      const temperatureChange = determineTemperatureChange(temperature, lastTemp);
      const heatIndex = await getLastHeatIndex(lead.id) ||
        calculateHeatIndex(evaluation.metCriteria.length, lead.conversionScore, lead.urgencyScore);

      // Apply temperature filter
      if (filters?.temperature && temperature !== filters.temperature) {
        continue;
      }

      evaluated.push({
        leadId: lead.id,
        leadName: lead.businessName,
        temperature,
        heatIndex,
        criteria: evaluation.metCriteria,
        lastTemperature: lastTemp || 'cold',
        temperatureChange,
        purchaseProbability: lead.conversionScore,
        outreachPriority: deriveOutreachPriority(lead.urgencyScore),
        lastActivityAt: lead.updatedAt,
      });
    }

    // Sort by heat index descending
    evaluated.sort((a, b) => b.heatIndex - a.heatIndex);

    const total = evaluated.length;
    const paginatedLeads = evaluated.slice(skip, skip + limit);

    return {
      leads: paginatedLeads,
      total,
      page,
      limit,
      hasMore: skip + limit < total,
    };
  } catch (error) {
    console.error('[HotLeadService] getHotLeadFeed failed:', error);
    return { leads: [], total: 0, page, limit, hasMore: false };
  }
}

/**
 * Get the heat index for a single lead.
 */
export async function getLeadHeatIndex(leadId: string): Promise<number> {
  try {
    const heatIndex = await getLastHeatIndex(leadId);
    if (heatIndex > 0) return heatIndex;

    // If no stored index, calculate on-the-fly
    const lead = await db.lead.findUnique({
      where: { id: leadId, isActive: true },
      select: {
        conversionScore: true,
        urgencyScore: true,
        communications: {
          select: { buyingSignals: true },
          take: 50,
        },
      },
    });

    if (!lead) return 0;

    const evaluation = evaluateCriteria({
      ...lead,
      id: leadId,
      businessName: '',
      replyScore: 0,
      stage: 'discovered',
      updatedAt: new Date(),
    });

    return calculateHeatIndex(
      evaluation.metCriteria.length,
      lead.conversionScore,
      lead.urgencyScore
    );
  } catch (error) {
    console.error('[HotLeadService] getLeadHeatIndex failed:', error);
    return 0;
  }
}

/**
 * Get the temperature for a single lead.
 */
export async function getLeadTemperature(leadId: string): Promise<LeadTemperature> {
  try {
    const lastTemp = await getLastTemperature(leadId);
    if (lastTemp) return lastTemp;

    // If no stored temperature, evaluate now
    const lead = await db.lead.findUnique({
      where: { id: leadId, isActive: true },
      select: {
        businessName: true,
        conversionScore: true,
        replyScore: true,
        urgencyScore: true,
        stage: true,
        updatedAt: true,
        communications: {
          select: { buyingSignals: true },
          take: 50,
        },
      },
    });

    if (!lead) return 'cold';

    const evaluation = evaluateCriteria(lead);
    return classifyTemperature(evaluation.metCriteria.length);
  } catch (error) {
    console.error('[HotLeadService] getLeadTemperature failed:', error);
    return 'cold';
  }
}

/**
 * Get hot lead statistics for a user.
 */
export async function getHotLeadStats(userId: string): Promise<HotLeadStats> {
  const defaultStats: HotLeadStats = {
    total: 0,
    fire: 0,
    hot: 0,
    warm: 0,
    cold: 0,
    heatingUp: 0,
    coolingDown: 0,
    averageHeatIndex: 0,
    lastScannedAt: null,
  };

  try {
    // Fetch all leads
    const leads = await fetchUserLeads(userId);
    const heatIndices = await getAllHeatIndices(userId);

    let fire = 0;
    let hot = 0;
    let warm = 0;
    let cold = 0;
    let heatingUp = 0;
    let coolingDown = 0;
    let totalHeatIndex = 0;

    for (const lead of leads) {
      const evaluation = evaluateCriteria(lead);
      const temperature = classifyTemperature(evaluation.metCriteria.length);
      const lastTemp = await getLastTemperature(lead.id);
      const change = determineTemperatureChange(temperature, lastTemp);
      const heatIndex = heatIndices.get(lead.id) ||
        calculateHeatIndex(evaluation.metCriteria.length, lead.conversionScore, lead.urgencyScore);

      switch (temperature) {
        case 'fire': fire++; break;
        case 'hot': hot++; break;
        case 'warm': warm++; break;
        case 'cold': cold++; break;
      }

      if (change === 'heating') heatingUp++;
      if (change === 'cooling') coolingDown++;

      totalHeatIndex += heatIndex;
    }

    // Get last scan time
    const lastActivity = await db.leadActivity.findFirst({
      where: {
        type: 'hot_lead_temperature',
        lead: {
          OR: leads.length > 0
            ? [{ id: { in: leads.map((l) => l.id) } }]
            : [{ id: 'nonexistent' }],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return {
      total: leads.length,
      fire,
      hot,
      warm,
      cold,
      heatingUp,
      coolingDown,
      averageHeatIndex: leads.length > 0
        ? Math.round(totalHeatIndex / leads.length)
        : 0,
      lastScannedAt: lastActivity?.createdAt || null,
    };
  } catch (error) {
    console.error('[HotLeadService] getHotLeadStats failed:', error);
    return defaultStats;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MONITORING
// ═══════════════════════════════════════════════════════════════════

/** Active monitoring timers per user */
const monitoringTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

/**
 * Start periodic hot lead monitoring for a user.
 * Scans every 5 minutes. Idempotent — calling again resets the timer.
 */
export function startHotLeadMonitoring(userId: string): void {
  // Clear existing timer if any
  stopHotLeadMonitoring(userId);

  const timer = setInterval(async () => {
    try {
      await scanHotLeads(userId);
    } catch (error) {
      console.error(`[HotLeadService] Monitoring scan failed for user ${userId}:`, error);
    }
  }, MONITORING_INTERVAL_MS);

  // Prevent the timer from keeping the process alive
  if (timer && typeof (timer as unknown as NodeJS.Timeout).unref === 'function') {
    (timer as unknown as NodeJS.Timeout).unref();
  }

  monitoringTimers.set(userId, timer);

  // Run initial scan immediately
  scanHotLeads(userId).catch((error) => {
    console.error(`[HotLeadService] Initial monitoring scan failed for user ${userId}:`, error);
  });
}

/**
 * Stop periodic hot lead monitoring for a user.
 */
export function stopHotLeadMonitoring(userId: string): void {
  const timer = monitoringTimers.get(userId);
  if (timer) {
    clearInterval(timer);
    monitoringTimers.delete(userId);
  }
}

/**
 * Check if monitoring is active for a user.
 */
export function isMonitoringActive(userId: string): boolean {
  return monitoringTimers.has(userId);
}
