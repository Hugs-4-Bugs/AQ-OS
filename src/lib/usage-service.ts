// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Usage Tracking Service
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// Uses the CreditsLedger table for usage data — no separate
// UsageTracking table needed. We query the ledger.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { type CreditAction } from '@/lib/credit-service';
import { type PlanType, type FeatureKey, ENTITLEMENTS } from '@/lib/entitlement-service';

// ===== INTERFACES =====

export interface RecordUsageParams {
  userId: string;
  action: string;
  creditsUsed: number;
  metadata?: Record<string, unknown>;
}

export interface RecordUsageResult {
  success: boolean;
  ledgerEntryId?: string;
  error?: string;
}

export interface UsageSummaryResult {
  totalCreditsUsed: number;
  totalActions: number;
  byAction: Record<string, { creditsUsed: number; count: number }>;
  period: {
    start: Date;
    end: Date;
  };
}

export interface UsageByActionResult {
  action: string;
  creditsUsed: number;
  count: number;
  entries: Array<{
    id: string;
    credits: number;
    balance: number;
    description: string | null;
    referenceId: string | null;
    createdAt: Date;
  }>;
}

export interface UsageLimitResult {
  reached: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
}

export interface UsageHistoryResult {
  entries: Array<{
    id: string;
    action: string;
    credits: number;
    balance: number;
    description: string | null;
    referenceId: string | null;
    createdAt: Date;
  }>;
  total: number;
  hasMore: boolean;
}

export interface QuotaStatusItem {
  feature: FeatureKey;
  used: number;
  limit: number | null;
  remaining: number | null;
  percentage: number | null;
  enabled: boolean;
}

export interface QuotaStatusResult {
  plan: PlanType;
  quotas: QuotaStatusItem[];
}

// ===== USAGE SERVICE FUNCTIONS =====

/**
 * Record a usage event.
 * This is essentially a wrapper around the CreditsLedger for tracking
 * when specific actions occur, even if they don't cost credits.
 * For credit-cost actions, the CreditsLedger entry is already created
 * by the credit-service. This function can create additional entries
 * or record zero-cost usage events.
 */
export async function recordUsage(params: RecordUsageParams): Promise<RecordUsageResult> {
  try {
    const { userId, action, creditsUsed, metadata } = params;

    // Get current user balance
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Create ledger entry for the usage event
    const ledgerEntry = await db.creditsLedger.create({
      data: {
        userId,
        action,
        credits: -creditsUsed, // Negative for usage
        balance: user.credits,
        description: metadata ? JSON.stringify(metadata) : `Usage: ${action}`,
      },
    });

    return { success: true, ledgerEntryId: ledgerEntry.id };
  } catch (error) {
    console.error('[UsageService] Failed to record usage:', error);
    return { success: false, error: 'Failed to record usage' };
  }
}

/**
 * Get usage summary for the current billing period.
 * Aggregates all credit deductions from the ledger.
 */
export async function getUsageSummary(
  userId: string,
  period?: { start: Date; end: Date }
): Promise<UsageSummaryResult> {
  try {
    // Default to current billing period
    const subscription = await db.subscription.findFirst({
      where: { userId, status: { in: ['trialing', 'active', 'past_due'] } },
      select: { currentPeriodStart: true, currentPeriodEnd: true },
    });

    const periodStart = period?.start || subscription?.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const periodEnd = period?.end || subscription?.currentPeriodEnd || new Date();

    // Query all deductions in the period
    const deductions = await db.creditsLedger.findMany({
      where: {
        userId,
        credits: { lt: 0 }, // Only deductions
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      select: {
        action: true,
        credits: true,
      },
    });

    // Aggregate by action
    const byAction: Record<string, { creditsUsed: number; count: number }> = {};
    let totalCreditsUsed = 0;

    for (const entry of deductions) {
      const creditsUsed = Math.abs(entry.credits);
      totalCreditsUsed += creditsUsed;

      if (!byAction[entry.action]) {
        byAction[entry.action] = { creditsUsed: 0, count: 0 };
      }

      byAction[entry.action].creditsUsed += creditsUsed;
      byAction[entry.action].count += 1;
    }

    return {
      totalCreditsUsed,
      totalActions: deductions.length,
      byAction,
      period: { start: periodStart, end: periodEnd },
    };
  } catch (error) {
    console.error('[UsageService] Failed to get usage summary:', error);
    return {
      totalCreditsUsed: 0,
      totalActions: 0,
      byAction: {},
      period: { start: new Date(), end: new Date() },
    };
  }
}

/**
 * Get usage for a specific action in a period.
 */
export async function getUsageByAction(
  userId: string,
  action: string,
  period?: { start: Date; end: Date }
): Promise<UsageByActionResult> {
  try {
    const subscription = await db.subscription.findFirst({
      where: { userId, status: { in: ['trialing', 'active', 'past_due'] } },
      select: { currentPeriodStart: true, currentPeriodEnd: true },
    });

    const periodStart = period?.start || subscription?.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const periodEnd = period?.end || subscription?.currentPeriodEnd || new Date();

    const entries = await db.creditsLedger.findMany({
      where: {
        userId,
        action,
        credits: { lt: 0 },
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        credits: true,
        balance: true,
        description: true,
        referenceId: true,
        createdAt: true,
      },
    });

    const creditsUsed = entries.reduce((sum, e) => sum + Math.abs(e.credits), 0);

    return {
      action,
      creditsUsed,
      count: entries.length,
      entries,
    };
  } catch (error) {
    console.error('[UsageService] Failed to get usage by action:', error);
    return { action, creditsUsed: 0, count: 0, entries: [] };
  }
}

/**
 * Check if usage limit is reached for an action.
 * Compares current period usage against the provided limit.
 */
export async function checkUsageLimit(
  userId: string,
  action: string,
  limit: number | null
): Promise<UsageLimitResult> {
  try {
    // null limit means unlimited
    if (limit === null) {
      return { reached: false, used: 0, limit: null, remaining: null };
    }

    const usage = await getUsageByAction(userId, action);
    const used = usage.count;

    return {
      reached: used >= limit,
      used,
      limit,
      remaining: Math.max(0, limit - used),
    };
  } catch (error) {
    console.error('[UsageService] Failed to check usage limit:', error);
    return { reached: true, used: 0, limit: 0, remaining: 0 };
  }
}

/**
 * Reset monthly usage counters.
 * Since we use the CreditsLedger and filter by date range,
 * we don't need to explicitly reset counters. The billing period
 * change naturally starts a new count. This function is provided
 * for consistency with the interface and can trigger any needed
 * side effects.
 */
export async function resetMonthlyUsage(userId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    // With ledger-based usage tracking, "resetting" means updating
    // the subscription's current period start/end dates
    const subscription = await db.subscription.findFirst({
      where: { userId, status: { in: ['trialing', 'active', 'past_due'] } },
    });

    if (!subscription) {
      return { success: false, message: 'No active subscription found' };
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    return { success: true, message: 'Monthly usage period reset' };
  } catch (error) {
    console.error('[UsageService] Failed to reset monthly usage:', error);
    return { success: false, message: 'Failed to reset monthly usage' };
  }
}

/**
 * Get paginated usage history.
 */
export async function getUsageHistory(
  userId: string,
  params?: {
    limit?: number;
    offset?: number;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    deductionsOnly?: boolean;
  }
): Promise<UsageHistoryResult> {
  try {
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    const where: Record<string, unknown> = { userId };

    if (params?.action) {
      where.action = params.action;
    }

    if (params?.deductionsOnly) {
      where.credits = { lt: 0 };
    }

    if (params?.startDate || params?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (params.startDate) createdAt.gte = params.startDate;
      if (params.endDate) createdAt.lte = params.endDate;
      where.createdAt = createdAt;
    }

    const [entries, total] = await Promise.all([
      db.creditsLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // Fetch one extra to check hasMore
        skip: offset,
        select: {
          id: true,
          action: true,
          credits: true,
          balance: true,
          description: true,
          referenceId: true,
          createdAt: true,
        },
      }),
      db.creditsLedger.count({ where }),
    ]);

    const hasMore = entries.length > limit;
    const trimmedEntries = hasMore ? entries.slice(0, limit) : entries;

    return {
      entries: trimmedEntries,
      total,
      hasMore,
    };
  } catch (error) {
    console.error('[UsageService] Failed to get usage history:', error);
    return { entries: [], total: 0, hasMore: false };
  }
}

/**
 * Get quota status for all features.
 * Returns used/limit for each feature based on the user's plan.
 */
export async function getQuotaStatus(userId: string): Promise<QuotaStatusResult> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    const plan = (user?.plan || 'free') as PlanType;
    const entitlements = ENTITLEMENTS[plan];

    // Get current period usage for all actions
    const subscription = await db.subscription.findFirst({
      where: { userId, status: { in: ['trialing', 'active', 'past_due'] } },
      select: { currentPeriodStart: true },
    });

    const periodStart = subscription?.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // Get usage counts for the current period (deductions only)
    const deductions = await db.creditsLedger.findMany({
      where: {
        userId,
        credits: { lt: 0 },
        createdAt: { gte: periodStart },
      },
      select: {
        action: true,
        credits: true,
      },
    });

    // Count usage per action
    const usageCounts: Record<string, number> = {};
    for (const d of deductions) {
      const key = d.action;
      usageCounts[key] = (usageCounts[key] || 0) + 1;
    }

    // Build quota status for each feature
    const quotas: QuotaStatusItem[] = (Object.keys(entitlements) as FeatureKey[]).map((feature) => {
      const config = entitlements[feature];
      const used = usageCounts[feature] || 0;
      const limit = config.limit;
      const remaining = limit !== null ? Math.max(0, limit - used) : null;
      const percentage = limit !== null && limit > 0 ? Math.round((used / limit) * 100) : null;

      return {
        feature,
        used,
        limit,
        remaining,
        percentage,
        enabled: config.enabled,
      };
    });

    return { plan, quotas };
  } catch (error) {
    console.error('[UsageService] Failed to get quota status:', error);
    return {
      plan: 'free',
      quotas: [],
    };
  }
}

/**
 * Get the top used features for a user in the current period.
 * Useful for dashboard displays.
 */
export async function getTopUsedFeatures(
  userId: string,
  limit: number = 5
): Promise<Array<{ action: string; creditsUsed: number; count: number }>> {
  try {
    const subscription = await db.subscription.findFirst({
      where: { userId, status: { in: ['trialing', 'active', 'past_due'] } },
      select: { currentPeriodStart: true },
    });

    const periodStart = subscription?.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const deductions = await db.creditsLedger.findMany({
      where: {
        userId,
        credits: { lt: 0 },
        createdAt: { gte: periodStart },
      },
      select: {
        action: true,
        credits: true,
      },
    });

    // Aggregate by action
    const aggregated: Record<string, { creditsUsed: number; count: number }> = {};
    for (const d of deductions) {
      if (!aggregated[d.action]) {
        aggregated[d.action] = { creditsUsed: 0, count: 0 };
      }
      aggregated[d.action].creditsUsed += Math.abs(d.credits);
      aggregated[d.action].count += 1;
    }

    // Sort by credits used and return top N
    return Object.entries(aggregated)
      .map(([action, data]) => ({ action, ...data }))
      .sort((a, b) => b.creditsUsed - a.creditsUsed)
      .slice(0, limit);
  } catch (error) {
    console.error('[UsageService] Failed to get top used features:', error);
    return [];
  }
}

/**
 * Get daily usage for a period (for charts/graphs).
 */
export async function getDailyUsage(
  userId: string,
  days: number = 30
): Promise<Array<{ date: string; creditsUsed: number; actions: number }>> {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const deductions = await db.creditsLedger.findMany({
      where: {
        userId,
        credits: { lt: 0 },
        createdAt: { gte: startDate },
      },
      select: {
        credits: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const dailyMap: Record<string, { creditsUsed: number; actions: number }> = {};

    // Initialize all days
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      dailyMap[dateKey] = { creditsUsed: 0, actions: 0 };
    }

    // Fill in actual data
    for (const d of deductions) {
      const dateKey = d.createdAt.toISOString().split('T')[0];
      if (dailyMap[dateKey]) {
        dailyMap[dateKey].creditsUsed += Math.abs(d.credits);
        dailyMap[dateKey].actions += 1;
      }
    }

    return Object.entries(dailyMap)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error('[UsageService] Failed to get daily usage:', error);
    return [];
  }
}
