// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Cost Tracking Service
// Phase 8: AI Fixes — Token Usage, Cost Calculation, Budget Alerts
//
// Tracks AI usage and costs:
// - Token usage per request (input + output tokens)
// - Cost per model (GPT-4, GPT-3.5, etc.)
// - Cost per user per day/month
// - Budget alerts at 80% and 100%
// - Cost breakdown by feature
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export interface TokenUsageRecord {
  userId: string;
  feature: AIFeature;
  model: AIModel;
  inputTokens: number;
  outputTokens: number;
  requestId: string;
  metadata?: Record<string, unknown>;
}

export type AIFeature = 'discovery' | 'enrichment' | 'chat' | 'sales_coach' | 'proposal' | 'competitor' | 'vector_search' | 'rag';

export type AIModel = 'auto' | 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo' | 'claude-3' | 'unknown';

export interface CostCalculation {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

export interface UserSpending {
  userId: string;
  today: CostCalculation;
  thisMonth: CostCalculation;
  thisWeek: CostCalculation;
  totalTokensToday: number;
  totalTokensThisMonth: number;
}

export interface BudgetAlert {
  level: 'warning' | 'critical' | 'none';
  percentage: number;
  budgetLimit: number;
  currentSpend: number;
  message: string;
}

export interface CostBreakdownItem {
  feature: string;
  cost: number;
  tokens: number;
  requestCount: number;
  percentage: number;
}

export interface CostBreakdown {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  byFeature: CostBreakdownItem[];
  byModel: CostBreakdownItem[];
  period: { start: Date; end: Date };
}

// ===== MODEL PRICING (USD per 1000 tokens) =====

const MODEL_PRICING: Record<AIModel, { input: number; output: number }> = {
  'auto': { input: 0.002, output: 0.006 }, // Average pricing
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3': { input: 0.003, output: 0.015 },
  'unknown': { input: 0.002, output: 0.006 },
};

// ===== BUDGET DEFAULTS =====

const DEFAULT_DAILY_BUDGET = parseFloat(process.env.AI_DAILY_BUDGET_USD || '10');
const DEFAULT_MONTHLY_BUDGET = parseFloat(process.env.AI_MONTHLY_BUDGET_USD || '200');

// ===== CORE FUNCTIONS =====

/**
 * Record token usage for an AI request.
 * Stores the record in the database for cost tracking.
 */
export async function recordTokenUsage(record: TokenUsageRecord): Promise<{
  recorded: boolean;
  cost: CostCalculation;
  alert?: BudgetAlert;
}> {
  try {
    const cost = calculateCost(record.model, record.inputTokens, record.outputTokens);

    // Store in database
    await db.aiCostRecord.create({
      data: {
        userId: record.userId,
        feature: record.feature,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        costUsd: cost.totalCost,
        requestId: record.requestId,
      },
    });

    // Check budget alerts
    const alert = await checkBudgetAlert(record.userId);

    return { recorded: true, cost, alert: alert.level !== 'none' ? alert : undefined };
  } catch (error) {
    console.error('[AICostTracker] Failed to record token usage:', error);
    const cost = calculateCost(record.model, record.inputTokens, record.outputTokens);
    return { recorded: false, cost };
  }
}

/**
 * Calculate cost for a given model and token usage.
 */
export function calculateCost(
  model: AIModel,
  inputTokens: number,
  outputTokens: number
): CostCalculation {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['auto'];

  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;

  return {
    inputCost: Math.round(inputCost * 10000) / 10000, // 4 decimal places
    outputCost: Math.round(outputCost * 10000) / 10000,
    totalCost: Math.round((inputCost + outputCost) * 10000) / 10000,
    currency: 'USD',
  };
}

/**
 * Get spending data for a user.
 * Returns today's, this week's, and this month's spending.
 */
export async function getUserSpending(userId: string): Promise<UserSpending> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayRecords, weekRecords, monthRecords] = await Promise.all([
      db.aiCostRecord.findMany({
        where: { userId, createdAt: { gte: todayStart } },
      }),
      db.aiCostRecord.findMany({
        where: { userId, createdAt: { gte: weekStart } },
      }),
      db.aiCostRecord.findMany({
        where: { userId, createdAt: { gte: monthStart } },
      }),
    ]);

    const aggregateCost = (records: Array<{ costUsd: number; inputTokens: number; outputTokens: number }>) => {
      const totalCost = records.reduce((sum, r) => sum + r.costUsd, 0);
      const totalTokens = records.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: Math.round(totalCost * 10000) / 10000,
        currency: 'USD',
        totalTokens,
      };
    };

    const todayAgg = aggregateCost(todayRecords);
    const weekAgg = aggregateCost(weekRecords);
    const monthAgg = aggregateCost(monthRecords);

    return {
      userId,
      today: todayAgg,
      thisWeek: weekAgg,
      thisMonth: monthAgg,
      totalTokensToday: todayAgg.totalTokens,
      totalTokensThisMonth: monthAgg.totalTokens,
    };
  } catch (error) {
    console.error('[AICostTracker] Failed to get user spending:', error);
    return {
      userId,
      today: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
      thisWeek: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
      thisMonth: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
      totalTokensToday: 0,
      totalTokensThisMonth: 0,
    };
  }
}

/**
 * Check budget alerts for a user.
 * Returns warning at 80%, critical at 100%.
 */
export async function checkBudgetAlert(userId: string): Promise<BudgetAlert> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todaySpend, monthSpend] = await Promise.all([
      db.aiCostRecord.aggregate({
        _sum: { costUsd: true },
        where: { userId, createdAt: { gte: todayStart } },
      }),
      db.aiCostRecord.aggregate({
        _sum: { costUsd: true },
        where: { userId, createdAt: { gte: monthStart } },
      }),
    ]);

    const todayTotal = todaySpend._sum.costUsd || 0;
    const monthTotal = monthSpend._sum.costUsd || 0;

    // Check monthly budget first (more important)
    const monthPercent = (monthTotal / DEFAULT_MONTHLY_BUDGET) * 100;
    if (monthPercent >= 100) {
      return {
        level: 'critical',
        percentage: Math.round(monthPercent),
        budgetLimit: DEFAULT_MONTHLY_BUDGET,
        currentSpend: monthTotal,
        message: `Monthly AI budget exceeded! Spent $${monthTotal.toFixed(2)} of $${DEFAULT_MONTHLY_BUDGET.toFixed(2)} budget.`,
      };
    }
    if (monthPercent >= 80) {
      return {
        level: 'warning',
        percentage: Math.round(monthPercent),
        budgetLimit: DEFAULT_MONTHLY_BUDGET,
        currentSpend: monthTotal,
        message: `Monthly AI budget at ${Math.round(monthPercent)}%. Spent $${monthTotal.toFixed(2)} of $${DEFAULT_MONTHLY_BUDGET.toFixed(2)} budget.`,
      };
    }

    // Check daily budget
    const dayPercent = (todayTotal / DEFAULT_DAILY_BUDGET) * 100;
    if (dayPercent >= 100) {
      return {
        level: 'critical',
        percentage: Math.round(dayPercent),
        budgetLimit: DEFAULT_DAILY_BUDGET,
        currentSpend: todayTotal,
        message: `Daily AI budget exceeded! Spent $${todayTotal.toFixed(2)} of $${DEFAULT_DAILY_BUDGET.toFixed(2)} budget today.`,
      };
    }
    if (dayPercent >= 80) {
      return {
        level: 'warning',
        percentage: Math.round(dayPercent),
        budgetLimit: DEFAULT_DAILY_BUDGET,
        currentSpend: todayTotal,
        message: `Daily AI budget at ${Math.round(dayPercent)}%. Spent $${todayTotal.toFixed(2)} of $${DEFAULT_DAILY_BUDGET.toFixed(2)} budget today.`,
      };
    }

    return {
      level: 'none',
      percentage: Math.round(Math.max(monthPercent, dayPercent)),
      budgetLimit: DEFAULT_MONTHLY_BUDGET,
      currentSpend: monthTotal,
      message: '',
    };
  } catch (error) {
    console.error('[AICostTracker] Failed to check budget alert:', error);
    return { level: 'none', percentage: 0, budgetLimit: 0, currentSpend: 0, message: '' };
  }
}

/**
 * Get cost breakdown by feature and model for a given time period.
 */
export async function getCostBreakdown(
  userId: string,
  periodStart?: Date,
  periodEnd?: Date
): Promise<CostBreakdown> {
  try {
    const now = new Date();
    const start = periodStart || new Date(now.getFullYear(), now.getMonth(), 1);
    const end = periodEnd || now;

    const records = await db.aiCostRecord.findMany({
      where: {
        userId,
        createdAt: { gte: start, lte: end },
      },
    });

    const totalCost = records.reduce((sum, r) => sum + r.costUsd, 0);
    const totalTokens = records.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);

    // Group by feature
    const featureMap = new Map<string, { cost: number; tokens: number; count: number }>();
    for (const r of records) {
      const existing = featureMap.get(r.feature) || { cost: 0, tokens: 0, count: 0 };
      existing.cost += r.costUsd;
      existing.tokens += r.inputTokens + r.outputTokens;
      existing.count++;
      featureMap.set(r.feature, existing);
    }

    const byFeature: CostBreakdownItem[] = Array.from(featureMap.entries())
      .map(([feature, data]) => ({
        feature,
        cost: Math.round(data.cost * 10000) / 10000,
        tokens: data.tokens,
        requestCount: data.count,
        percentage: totalCost > 0 ? Math.round((data.cost / totalCost) * 100) : 0,
      }))
      .sort((a, b) => b.cost - a.cost);

    // Group by model
    const modelMap = new Map<string, { cost: number; tokens: number; count: number }>();
    for (const r of records) {
      const existing = modelMap.get(r.model) || { cost: 0, tokens: 0, count: 0 };
      existing.cost += r.costUsd;
      existing.tokens += r.inputTokens + r.outputTokens;
      existing.count++;
      modelMap.set(r.model, existing);
    }

    const byModel: CostBreakdownItem[] = Array.from(modelMap.entries())
      .map(([model, data]) => ({
        feature: model,
        cost: Math.round(data.cost * 10000) / 10000,
        tokens: data.tokens,
        requestCount: data.count,
        percentage: totalCost > 0 ? Math.round((data.cost / totalCost) * 100) : 0,
      }))
      .sort((a, b) => b.cost - a.cost);

    return {
      totalCost: Math.round(totalCost * 10000) / 10000,
      totalTokens,
      totalRequests: records.length,
      byFeature,
      byModel,
      period: { start, end },
    };
  } catch (error) {
    console.error('[AICostTracker] Failed to get cost breakdown:', error);
    return {
      totalCost: 0,
      totalTokens: 0,
      totalRequests: 0,
      byFeature: [],
      byModel: [],
      period: { start: periodStart || new Date(), end: periodEnd || new Date() },
    };
  }
}
