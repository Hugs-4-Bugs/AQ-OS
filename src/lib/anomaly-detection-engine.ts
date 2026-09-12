// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Anomaly Detection Engine
// Detects REAL anomalies from REAL database data ONLY.
// NO hardcoded anomalies. NO static alerts.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type AnomalyCategory = 'lead' | 'ai' | 'billing' | 'workflow';
export type AnomalyType =
  | 'conversion_drop'
  | 'response_drop'
  | 'cost_spike'
  | 'usage_spike'
  | 'mrr_drop'
  | 'churn_spike'
  | 'failure_spike'
  | 'queue_growth';
export type AnomalySeverity = 'info' | 'warning' | 'critical';
export type AnomalyStatus = 'active' | 'acknowledged' | 'resolved';

export interface AnomalyDetectionResult {
  detected: boolean;
  anomalyId?: string;
  category: AnomalyCategory;
  anomalyType: AnomalyType;
  metricName: string;
  expectedValue: number;
  actualValue: number;
  deviation: number;
  severity: AnomalySeverity;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/** Calculate percentage deviation: ((actual - expected) / expected) * 100 */
function calculateDeviation(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 100;
  return ((actual - expected) / Math.abs(expected)) * 100;
}

/** Determine severity based on absolute deviation magnitude */
function determineSeverity(deviation: number): AnomalySeverity {
  const absDeviation = Math.abs(deviation);
  if (absDeviation > 50) return 'critical';
  if (absDeviation > 20) return 'warning';
  return 'info';
}

/** Round a number to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Check if a duplicate anomaly of the same type already exists (active or acknowledged) */
async function hasActiveAnomaly(
  userId: string,
  category: AnomalyCategory,
  anomalyType: AnomalyType
): Promise<boolean> {
  const existing = await db.analyticsAnomaly.findFirst({
    where: {
      userId,
      category,
      anomalyType,
      status: { in: ['active', 'acknowledged'] },
    },
  });
  return existing !== null;
}

/** Store an anomaly if it's genuinely detected */
async function storeAnomaly(result: AnomalyDetectionResult, userId: string): Promise<string | undefined> {
  if (!result.detected) return undefined;

  // Don't create duplicate active anomalies of the same type
  const alreadyExists = await hasActiveAnomaly(userId, result.category, result.anomalyType);
  if (alreadyExists) {
    return undefined;
  }

  const anomaly = await db.analyticsAnomaly.create({
    data: {
      userId,
      category: result.category,
      anomalyType: result.anomalyType,
      severity: result.severity,
      metricName: result.metricName,
      expectedValue: result.expectedValue,
      actualValue: result.actualValue,
      deviation: result.deviation,
      description: result.description,
      status: 'active',
    },
  });

  return anomaly.id;
}

// ═══════════════════════════════════════════════════════════════════
// 1. LEAD ANOMALIES
// ═══════════════════════════════════════════════════════════════════

/**
 * detectConversionDrop — Compare recent conversion rate (7 days) vs baseline (30 days).
 * If current is significantly lower (>20% drop), create anomaly.
 */
export async function detectConversionDrop(userId: string): Promise<AnomalyDetectionResult> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twentyThreeDaysAgo = new Date(now.getTime() - 23 * 24 * 60 * 60 * 1000);

  const result: AnomalyDetectionResult = {
    detected: false,
    category: 'lead',
    anomalyType: 'conversion_drop',
    metricName: 'conversion_rate',
    expectedValue: 0,
    actualValue: 0,
    deviation: 0,
    severity: 'info',
    description: '',
  };

  try {
    // Current period: leads created in last 7 days
    const currentLeads = await db.lead.findMany({
      where: {
        userId,
        isActive: true,
        createdAt: { gte: sevenDaysAgo, lte: now },
      },
      select: { stage: true },
    });

    const currentTotal = currentLeads.length;
    const currentWon = currentLeads.filter(l => l.stage === 'closed_won').length;
    const currentRate = currentTotal > 0 ? (currentWon / currentTotal) * 100 : 0;

    // Baseline period: leads created 30-7 days ago (excluding the current window for cleaner baseline)
    const baselineLeads = await db.lead.findMany({
      where: {
        userId,
        isActive: true,
        createdAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
      },
      select: { stage: true },
    });

    const baselineTotal = baselineLeads.length;
    const baselineWon = baselineLeads.filter(l => l.stage === 'closed_won').length;
    const baselineRate = baselineTotal > 0 ? (baselineWon / baselineTotal) * 100 : 0;

    // Need minimum data points for meaningful comparison
    if (baselineTotal < 3 || currentTotal < 2) {
      return result;
    }

    result.expectedValue = round2(baselineRate);
    result.actualValue = round2(currentRate);

    // Calculate the percentage drop relative to baseline
    const deviation = calculateDeviation(currentRate, baselineRate);
    result.deviation = round2(deviation);

    // Only flag if there's a significant drop (>20% decrease)
    if (deviation < -20) {
      result.detected = true;
      result.severity = determineSeverity(deviation);

      const dropPercent = Math.abs(deviation).toFixed(1);
      result.description = `Lead conversion rate dropped ${dropPercent}% compared to the 30-day baseline. ` +
        `Current rate: ${currentRate.toFixed(1)}% (${currentWon} won out of ${currentTotal} leads) vs ` +
        `baseline: ${baselineRate.toFixed(1)}% (${baselineWon} won out of ${baselineTotal} leads). ` +
        `This indicates leads are not progressing through the pipeline as effectively.`;

      await storeAnomaly(result, userId);
    }

    return result;
  } catch (error) {
    console.error('[AnomalyDetection] detectConversionDrop error:', error);
    return result;
  }
}

/**
 * detectResponseDrop — Compare recent reply rate vs baseline.
 * Flag if dropped significantly (>20% decrease).
 */
export async function detectResponseDrop(userId: string): Promise<AnomalyDetectionResult> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const result: AnomalyDetectionResult = {
    detected: false,
    category: 'lead',
    anomalyType: 'response_drop',
    metricName: 'response_rate',
    expectedValue: 0,
    actualValue: 0,
    deviation: 0,
    severity: 'info',
    description: '',
  };

  try {
    // Current period: outreach messages in last 7 days
    const currentMessages = await db.outreachMessage.findMany({
      where: {
        userId,
        createdAt: { gte: sevenDaysAgo, lte: now },
        status: { in: ['sent', 'delivered', 'opened', 'replied', 'bounced'] },
      },
      select: { status: true },
    });

    const currentTotal = currentMessages.length;
    const currentReplied = currentMessages.filter(m => m.status === 'replied').length;
    const currentRate = currentTotal > 0 ? (currentReplied / currentTotal) * 100 : 0;

    // Baseline period: outreach messages 30-7 days ago
    const baselineMessages = await db.outreachMessage.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
        status: { in: ['sent', 'delivered', 'opened', 'replied', 'bounced'] },
      },
      select: { status: true },
    });

    const baselineTotal = baselineMessages.length;
    const baselineReplied = baselineMessages.filter(m => m.status === 'replied').length;
    const baselineRate = baselineTotal > 0 ? (baselineReplied / baselineTotal) * 100 : 0;

    // Need minimum data for meaningful comparison
    if (baselineTotal < 3 || currentTotal < 2) {
      return result;
    }

    result.expectedValue = round2(baselineRate);
    result.actualValue = round2(currentRate);

    const deviation = calculateDeviation(currentRate, baselineRate);
    result.deviation = round2(deviation);

    // Only flag if there's a significant drop (>20% decrease)
    if (deviation < -20) {
      result.detected = true;
      result.severity = determineSeverity(deviation);

      const dropPercent = Math.abs(deviation).toFixed(1);
      result.description = `Lead response rate dropped ${dropPercent}% compared to the 30-day baseline. ` +
        `Current rate: ${currentRate.toFixed(1)}% (${currentReplied} replies out of ${currentTotal} messages) vs ` +
        `baseline: ${baselineRate.toFixed(1)}% (${baselineReplied} replies out of ${baselineTotal} messages). ` +
        `Consider reviewing your outreach messaging or targeting.`;

      await storeAnomaly(result, userId);
    }

    return result;
  } catch (error) {
    console.error('[AnomalyDetection] detectResponseDrop error:', error);
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. AI ANOMALIES
// ═══════════════════════════════════════════════════════════════════

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

/**
 * detectCostSpike — Compare recent daily AI credit consumption vs baseline average.
 * Flag if significantly higher (>50% increase).
 */
export async function detectCostSpike(userId: string): Promise<AnomalyDetectionResult> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const result: AnomalyDetectionResult = {
    detected: false,
    category: 'ai',
    anomalyType: 'cost_spike',
    metricName: 'daily_ai_credit_consumption',
    expectedValue: 0,
    actualValue: 0,
    deviation: 0,
    severity: 'info',
    description: '',
  };

  try {
    // Current period: AI credit deductions in last 7 days
    const currentCredits = await db.creditsLedger.findMany({
      where: {
        userId,
        action: { in: AI_CREDIT_ACTIONS },
        credits: { lt: 0 }, // only deductions
        createdAt: { gte: sevenDaysAgo, lte: now },
      },
      select: { credits: true, createdAt: true },
    });

    const currentTotalDeductions = Math.abs(currentCredits.reduce((sum, c) => sum + c.credits, 0));
    // Average daily consumption over the 7-day period
    const currentDailyAvg = currentTotalDeductions / 7;

    // Baseline period: AI credit deductions 30-7 days ago
    const baselineCredits = await db.creditsLedger.findMany({
      where: {
        userId,
        action: { in: AI_CREDIT_ACTIONS },
        credits: { lt: 0 },
        createdAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
      },
      select: { credits: true },
    });

    const baselineTotalDeductions = Math.abs(baselineCredits.reduce((sum, c) => sum + c.credits, 0));
    // Average daily consumption over the 23-day baseline period
    const baselineDailyAvg = baselineTotalDeductions / 23;

    // Need minimum baseline to be meaningful
    if (baselineDailyAvg < 1) {
      return result;
    }

    result.expectedValue = round2(baselineDailyAvg);
    result.actualValue = round2(currentDailyAvg);

    const deviation = calculateDeviation(currentDailyAvg, baselineDailyAvg);
    result.deviation = round2(deviation);

    // Only flag if there's a significant spike (>50% increase)
    if (deviation > 50) {
      result.detected = true;
      result.severity = determineSeverity(deviation);

      const spikePercent = deviation.toFixed(1);
      result.description = `AI credit consumption spiked ${spikePercent}% above the 30-day daily average. ` +
        `Current daily average: ${currentDailyAvg.toFixed(1)} credits/day vs ` +
        `baseline: ${baselineDailyAvg.toFixed(1)} credits/day. ` +
        `Total consumed in last 7 days: ${currentTotalDeductions} credits. ` +
        `This may indicate unexpected usage patterns or runaway processes.`;

      await storeAnomaly(result, userId);
    }

    return result;
  } catch (error) {
    console.error('[AnomalyDetection] detectCostSpike error:', error);
    return result;
  }
}

/**
 * detectUsageSpike — Compare recent AI usage count vs baseline.
 * Flag if significantly higher (>50% increase).
 */
export async function detectUsageSpike(userId: string): Promise<AnomalyDetectionResult> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const result: AnomalyDetectionResult = {
    detected: false,
    category: 'ai',
    anomalyType: 'usage_spike',
    metricName: 'daily_ai_usage_count',
    expectedValue: 0,
    actualValue: 0,
    deviation: 0,
    severity: 'info',
    description: '',
  };

  try {
    // Current period: AI action count in last 7 days
    const currentCount = await db.creditsLedger.count({
      where: {
        userId,
        action: { in: AI_CREDIT_ACTIONS },
        createdAt: { gte: sevenDaysAgo, lte: now },
      },
    });

    const currentDailyAvg = currentCount / 7;

    // Baseline period: AI action count 30-7 days ago
    const baselineCount = await db.creditsLedger.count({
      where: {
        userId,
        action: { in: AI_CREDIT_ACTIONS },
        createdAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
      },
    });

    const baselineDailyAvg = baselineCount / 23;

    // Need minimum baseline to be meaningful
    if (baselineDailyAvg < 0.5) {
      return result;
    }

    result.expectedValue = round2(baselineDailyAvg);
    result.actualValue = round2(currentDailyAvg);

    const deviation = calculateDeviation(currentDailyAvg, baselineDailyAvg);
    result.deviation = round2(deviation);

    // Only flag if there's a significant spike (>50% increase)
    if (deviation > 50) {
      result.detected = true;
      result.severity = determineSeverity(deviation);

      const spikePercent = deviation.toFixed(1);
      result.description = `AI usage count spiked ${spikePercent}% above the 30-day daily average. ` +
        `Current daily average: ${currentDailyAvg.toFixed(1)} actions/day vs ` +
        `baseline: ${baselineDailyAvg.toFixed(1)} actions/day. ` +
        `Total actions in last 7 days: ${currentCount}. ` +
        `Review if this is expected growth or an anomaly.`;

      await storeAnomaly(result, userId);
    }

    return result;
  } catch (error) {
    console.error('[AnomalyDetection] detectUsageSpike error:', error);
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. BILLING ANOMALIES
// ═══════════════════════════════════════════════════════════════════

/** Plan pricing map for MRR calculation */
const PLAN_PRICES: Record<string, number> = {
  free: 0,
  pro: 29,
  elite: 99,
};

/**
 * detectMrrDrop — Compare current MRR vs previous period.
 * Flag if MRR dropped significantly (>20% decrease).
 */
export async function detectMrrDrop(userId: string): Promise<AnomalyDetectionResult> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const result: AnomalyDetectionResult = {
    detected: false,
    category: 'billing',
    anomalyType: 'mrr_drop',
    metricName: 'monthly_recurring_revenue',
    expectedValue: 0,
    actualValue: 0,
    deviation: 0,
    severity: 'info',
    description: '',
  };

  try {
    // Current MRR: active/trialing subscriptions now
    const currentSubscriptions = await db.subscription.findMany({
      where: {
        userId,
        status: { in: ['active', 'trialing'] },
      },
      select: { plan: true, billingCycle: true, createdAt: true },
    });

    let currentMrr = 0;
    for (const sub of currentSubscriptions) {
      const planPrice = PLAN_PRICES[sub.plan] ?? 0;
      const monthlyAmount = sub.billingCycle === 'yearly' ? (planPrice * 10) / 12 : planPrice;
      currentMrr += monthlyAmount;
    }

    // Previous MRR: subscriptions that were active in the previous 30-day period
    // We estimate previous MRR by looking at subscriptions created before 30 days ago
    // and subtracting those canceled in the last 30 days
    const previousSubscriptions = await db.subscription.findMany({
      where: {
        userId,
        createdAt: { lt: thirtyDaysAgo },
      },
      select: { plan: true, billingCycle: true, status: true, cancelAtPeriodEnd: true },
    });

    let previousMrr = 0;
    for (const sub of previousSubscriptions) {
      if (sub.status === 'active' || sub.status === 'trialing') {
        const planPrice = PLAN_PRICES[sub.plan] ?? 0;
        const monthlyAmount = sub.billingCycle === 'yearly' ? (planPrice * 10) / 12 : planPrice;
        previousMrr += monthlyAmount;
      }
    }

    // Also count canceled subscriptions as lost MRR
    const canceledInPeriod = await db.subscription.findMany({
      where: {
        userId,
        status: 'canceled',
        updatedAt: { gte: thirtyDaysAgo, lte: now },
      },
      select: { plan: true, billingCycle: true },
    });

    let canceledMrr = 0;
    for (const sub of canceledInPeriod) {
      const planPrice = PLAN_PRICES[sub.plan] ?? 0;
      const monthlyAmount = sub.billingCycle === 'yearly' ? (planPrice * 10) / 12 : planPrice;
      canceledMrr += monthlyAmount;
    }

    // If we have cancellations, add them to previous MRR to get a better baseline
    if (canceledMrr > 0) {
      previousMrr += canceledMrr;
    }

    // Need at least some billing history
    if (previousMrr === 0 && currentMrr === 0) {
      return result;
    }

    result.expectedValue = round2(previousMrr);
    result.actualValue = round2(currentMrr);

    const deviation = calculateDeviation(currentMrr, previousMrr);
    result.deviation = round2(deviation);

    // Only flag if there's a significant drop (>20% decrease)
    if (deviation < -20 && previousMrr > 0) {
      result.detected = true;
      result.severity = determineSeverity(deviation);

      const dropPercent = Math.abs(deviation).toFixed(1);
      const mrrLost = round2(previousMrr - currentMrr);
      result.description = `MRR dropped ${dropPercent}% compared to the previous period. ` +
        `Current MRR: $${currentMrr.toFixed(2)} vs previous: $${previousMrr.toFixed(2)}. ` +
        `Lost revenue: $${mrrLost.toFixed(2)}/month. ` +
        `${canceledInPeriod.length} subscription(s) were canceled in the last 30 days. ` +
        `Investigate reasons for cancellation and consider retention strategies.`;

      await storeAnomaly(result, userId);
    }

    return result;
  } catch (error) {
    console.error('[AnomalyDetection] detectMrrDrop error:', error);
    return result;
  }
}

/**
 * detectChurnSpike — Compare recent cancellation rate vs baseline.
 * Flag if churn rate increased significantly (>20% increase).
 */
export async function detectChurnSpike(userId: string): Promise<AnomalyDetectionResult> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const result: AnomalyDetectionResult = {
    detected: false,
    category: 'billing',
    anomalyType: 'churn_spike',
    metricName: 'churn_rate',
    expectedValue: 0,
    actualValue: 0,
    deviation: 0,
    severity: 'info',
    description: '',
  };

  try {
    // Current period: cancellations in last 7 days
    const currentCanceled = await db.subscription.count({
      where: {
        userId,
        status: 'canceled',
        updatedAt: { gte: sevenDaysAgo, lte: now },
      },
    });

    const currentTotal = await db.subscription.count({
      where: {
        userId,
        createdAt: { lte: now },
      },
    });

    const currentActiveTotal = await db.subscription.count({
      where: {
        userId,
        status: { in: ['active', 'trialing', 'canceled'] },
      },
    });

    // Current churn rate: canceled / total (active + canceled)
    const churnDenominator = currentActiveTotal > 0 ? currentActiveTotal : currentTotal;
    const currentChurnRate = churnDenominator > 0 ? (currentCanceled / churnDenominator) * 100 : 0;

    // Baseline period: cancellations 30-7 days ago
    const baselineCanceled = await db.subscription.count({
      where: {
        userId,
        status: 'canceled',
        updatedAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
      },
    });

    // Normalize to weekly rate for comparison
    const currentWeeklyRate = currentCanceled; // already 7 days
    const baselineWeeklyRate = baselineCanceled / (23 / 7); // normalize 23-day period to weekly

    // Need some baseline data
    if (baselineWeeklyRate < 0.1 && currentWeeklyRate === 0) {
      return result;
    }

    result.expectedValue = round2(baselineWeeklyRate);
    result.actualValue = round2(currentWeeklyRate);

    const deviation = calculateDeviation(currentWeeklyRate, baselineWeeklyRate);
    result.deviation = round2(deviation);

    // Only flag if there's a significant spike (>20% increase in churn)
    if (deviation > 20 && currentCanceled > 0) {
      result.detected = true;
      result.severity = determineSeverity(deviation);

      const spikePercent = deviation.toFixed(1);
      result.description = `Subscription cancellation rate spiked ${spikePercent}% above the 30-day baseline. ` +
        `Current weekly cancellations: ${currentCanceled} vs baseline weekly average: ${baselineWeeklyRate.toFixed(1)}. ` +
        `Current churn rate: ${currentChurnRate.toFixed(1)}%. ` +
        `This may indicate dissatisfaction with the product or a pricing issue.`;

      await storeAnomaly(result, userId);
    }

    return result;
  } catch (error) {
    console.error('[AnomalyDetection] detectChurnSpike error:', error);
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. WORKFLOW ANOMALIES
// ═══════════════════════════════════════════════════════════════════

/**
 * detectFailureSpike — Compare recent workflow failure rate vs baseline.
 * Flag if failure rate increased significantly (>20% increase).
 */
export async function detectFailureSpike(userId: string): Promise<AnomalyDetectionResult> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const result: AnomalyDetectionResult = {
    detected: false,
    category: 'workflow',
    anomalyType: 'failure_spike',
    metricName: 'workflow_failure_rate',
    expectedValue: 0,
    actualValue: 0,
    deviation: 0,
    severity: 'info',
    description: '',
  };

  try {
    // Get user's workflow IDs
    const workflows = await db.workflowDefinition.findMany({
      where: { userId },
      select: { id: true, name: true },
    });

    const workflowIds = workflows.map(w => w.id);

    if (workflowIds.length === 0) {
      return result;
    }

    // Current period: executions in last 7 days
    const currentTotal = await db.workflowExecution.count({
      where: {
        workflowId: { in: workflowIds },
        createdAt: { gte: sevenDaysAgo, lte: now },
      },
    });

    const currentFailed = await db.workflowExecution.count({
      where: {
        workflowId: { in: workflowIds },
        status: { in: ['failed', 'dead_letter'] },
        createdAt: { gte: sevenDaysAgo, lte: now },
      },
    });

    const currentRate = currentTotal > 0 ? (currentFailed / currentTotal) * 100 : 0;

    // Baseline period: executions 30-7 days ago
    const baselineTotal = await db.workflowExecution.count({
      where: {
        workflowId: { in: workflowIds },
        createdAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
      },
    });

    const baselineFailed = await db.workflowExecution.count({
      where: {
        workflowId: { in: workflowIds },
        status: { in: ['failed', 'dead_letter'] },
        createdAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
      },
    });

    const baselineRate = baselineTotal > 0 ? (baselineFailed / baselineTotal) * 100 : 0;

    // Need minimum data for comparison
    if (baselineTotal < 3 || currentTotal < 2) {
      return result;
    }

    result.expectedValue = round2(baselineRate);
    result.actualValue = round2(currentRate);

    const deviation = calculateDeviation(currentRate, baselineRate);
    result.deviation = round2(deviation);

    // Only flag if there's a significant increase (>20% increase in failure rate)
    if (deviation > 20 && currentFailed > 0) {
      result.detected = true;
      result.severity = determineSeverity(deviation);

      const spikePercent = deviation.toFixed(1);
      result.description = `Workflow failure rate spiked ${spikePercent}% above the 30-day baseline. ` +
        `Current failure rate: ${currentRate.toFixed(1)}% (${currentFailed} failed out of ${currentTotal} executions) vs ` +
        `baseline: ${baselineRate.toFixed(1)}% (${baselineFailed} failed out of ${baselineTotal} executions). ` +
        `Check workflow configurations and external service dependencies.`;

      await storeAnomaly(result, userId);
    }

    return result;
  } catch (error) {
    console.error('[AnomalyDetection] detectFailureSpike error:', error);
    return result;
  }
}

/**
 * detectQueueGrowth — Check if queued executions are growing abnormally.
 * Compares current queue depth vs average throughput to detect queue buildup.
 */
export async function detectQueueGrowth(userId: string): Promise<AnomalyDetectionResult> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const result: AnomalyDetectionResult = {
    detected: false,
    category: 'workflow',
    anomalyType: 'queue_growth',
    metricName: 'queued_executions_ratio',
    expectedValue: 0,
    actualValue: 0,
    deviation: 0,
    severity: 'info',
    description: '',
  };

  try {
    // Get user's workflow IDs
    const workflows = await db.workflowDefinition.findMany({
      where: { userId },
      select: { id: true },
    });

    const workflowIds = workflows.map(w => w.id);

    if (workflowIds.length === 0) {
      return result;
    }

    // Current queue depth
    const currentQueued = await db.workflowExecution.count({
      where: {
        workflowId: { in: workflowIds },
        status: 'queued',
      },
    });

    if (currentQueued === 0) {
      return result;
    }

    // Completed in last 24 hours (throughput)
    const completedLast24h = await db.workflowExecution.count({
      where: {
        workflowId: { in: workflowIds },
        status: 'completed',
        completedAt: { gte: twentyFourHoursAgo },
      },
    });

    // Hourly completion rate
    const hourlyCompletionRate = completedLast24h / 24;

    // Queued in last hour (recent queue growth)
    const recentlyQueued = await db.workflowExecution.count({
      where: {
        workflowId: { in: workflowIds },
        status: 'queued',
        createdAt: { gte: oneHourAgo },
      },
    });

    // If queue is growing faster than completion rate, flag it
    // Expected: queue should be near 0 if throughput is adequate
    // Actual: current queue depth
    // A healthy system has queue depth close to 0 or at most 1-2x hourly throughput

    const expectedQueue = Math.max(hourlyCompletionRate * 0.5, 1); // Allow up to 0.5x hourly throughput as normal queue
    const actualQueue = currentQueued;

    result.expectedValue = round2(expectedQueue);
    result.actualValue = round2(actualQueue);

    const deviation = calculateDeviation(actualQueue, expectedQueue);
    result.deviation = round2(deviation);

    // Only flag if queue is significantly deeper than expected (>20% above normal)
    // And there are at least a few items in the queue
    if (deviation > 20 && currentQueued >= 3) {
      result.detected = true;
      result.severity = determineSeverity(deviation);

      const growthPercent = deviation.toFixed(1);
      result.description = `Workflow execution queue is growing abnormally. ` +
        `Current queue depth: ${currentQueued} executions (${recentlyQueued} queued in the last hour) vs ` +
        `expected queue: ${expectedQueue.toFixed(1)} executions. ` +
        `Throughput: ${completedLast24h} completed in last 24h (${hourlyCompletionRate.toFixed(1)}/hour). ` +
        `The queue may be backing up due to failures, slow processing, or a burst of triggers.`;

      await storeAnomaly(result, userId);
    }

    return result;
  } catch (error) {
    console.error('[AnomalyDetection] detectQueueGrowth error:', error);
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. BULK DETECTION & MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * runAllAnomalyChecks — Runs all detection functions and stores anomalies.
 */
export async function runAllAnomalyChecks(userId: string): Promise<AnomalyDetectionResult[]> {
  const results = await Promise.allSettled([
    detectConversionDrop(userId),
    detectResponseDrop(userId),
    detectCostSpike(userId),
    detectUsageSpike(userId),
    detectMrrDrop(userId),
    detectChurnSpike(userId),
    detectFailureSpike(userId),
    detectQueueGrowth(userId),
  ]);

  return results
    .map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.error(`[AnomalyDetection] Check ${i} failed:`, r.reason);
      return null;
    })
    .filter((r): r is AnomalyDetectionResult => r !== null);
}

/**
 * getAnomalies — Retrieves stored anomalies with optional filters.
 */
export async function getAnomalies(
  userId: string,
  category?: AnomalyCategory,
  status?: AnomalyStatus,
  severity?: AnomalySeverity
) {
  const where: Record<string, unknown> = { userId };

  if (category) where.category = category;
  if (status) where.status = status;
  if (severity) where.severity = severity;

  const anomalies = await db.analyticsAnomaly.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return anomalies;
}

/**
 * acknowledgeAnomaly — Mark anomaly as acknowledged.
 */
export async function acknowledgeAnomaly(anomalyId: string, userId: string) {
  const anomaly = await db.analyticsAnomaly.findFirst({
    where: { id: anomalyId, userId },
  });

  if (!anomaly) {
    throw new Error('Anomaly not found or does not belong to this user');
  }

  if (anomaly.status !== 'active') {
    throw new Error(`Cannot acknowledge anomaly in '${anomaly.status}' status. Only 'active' anomalies can be acknowledged.`);
  }

  const updated = await db.analyticsAnomaly.update({
    where: { id: anomalyId },
    data: { status: 'acknowledged' },
  });

  return updated;
}

/**
 * resolveAnomaly — Mark anomaly as resolved.
 */
export async function resolveAnomaly(anomalyId: string, userId: string) {
  const anomaly = await db.analyticsAnomaly.findFirst({
    where: { id: anomalyId, userId },
  });

  if (!anomaly) {
    throw new Error('Anomaly not found or does not belong to this user');
  }

  if (anomaly.status === 'resolved') {
    throw new Error('Anomaly is already resolved');
  }

  const updated = await db.analyticsAnomaly.update({
    where: { id: anomalyId },
    data: {
      status: 'resolved',
      resolvedAt: new Date(),
    },
  });

  return updated;
}

/**
 * cleanupOldAnomalies — Remove resolved anomalies older than N days.
 * Default: 30 days.
 */
export async function cleanupOldAnomalies(userId: string, daysOld: number = 30): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const deleted = await db.analyticsAnomaly.deleteMany({
    where: {
      userId,
      status: 'resolved',
      resolvedAt: { lt: cutoffDate },
    },
  });

  return deleted.count;
}
