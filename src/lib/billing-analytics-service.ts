// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Billing Analytics Service
// Phase 4-5: Billing and Payment Gaps Remediation
//
// MRR, ARR, churn rate, revenue by plan, payment success rate,
// ARPU, and credit usage patterns.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import type { PlanType } from '@/lib/entitlement-service';

// ===== TYPES =====

export interface MRRResult {
  totalMRR: number;
  mrrByPlan: Record<string, number>;
  currency: string;
  period: string;
}

export interface ARRResult {
  totalARR: number;
  arrByPlan: Record<string, number>;
  currency: string;
}

export interface ChurnResult {
  churnRate: number;
  churnedThisMonth: number;
  totalAtStartOfMonth: number;
  period: string;
}

export interface RevenueByPlanResult {
  plan: string;
  revenue: number;
  subscribers: number;
  arpu: number;
  currency: string;
}

export interface PaymentSuccessResult {
  successRate: number;
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  period: string;
}

export interface BillingAnalyticsResult {
  mrr: MRRResult;
  arr: ARRResult;
  churn: ChurnResult;
  revenueByPlan: RevenueByPlanResult[];
  paymentSuccess: PaymentSuccessResult;
  arpu: number;
  totalSubscribers: number;
  creditUsage: CreditUsageResult;
}

export interface CreditUsageResult {
  totalCreditsUsed: number;
  creditsUsedByAction: Record<string, number>;
  averageCreditsPerUser: number;
  topActions: Array<{ action: string; count: number; credits: number }>;
}

// ===== PLAN PRICING (monthly) =====

const PLAN_MONTHLY_PRICING: Record<string, { USD: number; INR: number }> = {
  pro: { USD: 29, INR: 2499 },
  elite: { USD: 89, INR: 7999 },
};

// ===== CALCULATE MRR =====

export async function calculateMRR(currency: string = 'USD'): Promise<MRRResult> {
  try {
    // Get all active subscriptions
    const activeSubscriptions = await db.subscription.findMany({
      where: {
        status: { in: ['active', 'trialing'] },
        plan: { in: ['pro', 'elite'] },
      },
      select: {
        plan: true,
        billingCycle: true,
        userId: true,
      },
    });

    const mrrByPlan: Record<string, number> = {};

    for (const sub of activeSubscriptions) {
      const plan = sub.plan as string;
      const pricing = PLAN_MONTHLY_PRICING[plan];

      if (!pricing) continue;

      const monthlyAmount = sub.billingCycle === 'yearly'
        ? pricing[currency as keyof typeof pricing] / 12
        : pricing[currency as keyof typeof pricing];

      mrrByPlan[plan] = (mrrByPlan[plan] || 0) + monthlyAmount;
    }

    const totalMRR = Object.values(mrrByPlan).reduce((sum, val) => sum + val, 0);

    const now = new Date();
    const period = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    return {
      totalMRR: Math.round(totalMRR * 100) / 100,
      mrrByPlan,
      currency,
      period,
    };
  } catch (error) {
    console.error('[BillingAnalytics] Failed to calculate MRR:', error);
    return { totalMRR: 0, mrrByPlan: {}, currency, period: '' };
  }
}

// ===== CALCULATE ARR =====

export async function calculateARR(currency: string = 'USD'): Promise<ARRResult> {
  try {
    const mrr = await calculateMRR(currency);
    const totalARR = mrr.totalMRR * 12;

    const arrByPlan: Record<string, number> = {};
    for (const [plan, mrrValue] of Object.entries(mrr.mrrByPlan)) {
      arrByPlan[plan] = Math.round(mrrValue * 12 * 100) / 100;
    }

    return {
      totalARR: Math.round(totalARR * 100) / 100,
      arrByPlan,
      currency,
    };
  } catch (error) {
    console.error('[BillingAnalytics] Failed to calculate ARR:', error);
    return { totalARR: 0, arrByPlan: {}, currency };
  }
}

// ===== GET CHURN RATE =====

export async function getChurnRate(): Promise<ChurnResult> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Count subscriptions at start of month
    const totalAtStartOfMonth = await db.subscription.count({
      where: {
        status: { in: ['active', 'trialing', 'past_due'] },
        createdAt: { lt: startOfMonth },
      },
    });

    // Count churned subscriptions this month
    const churnedThisMonth = await db.subscription.count({
      where: {
        status: 'expired',
        updatedAt: {
          gte: startOfMonth,
          lt: now,
        },
      },
    });

    const churnRate = totalAtStartOfMonth > 0
      ? (churnedThisMonth / totalAtStartOfMonth) * 100
      : 0;

    const period = `${startOfLastMonth.getFullYear()}-${(startOfLastMonth.getMonth() + 1).toString().padStart(2, '0')}`;

    return {
      churnRate: Math.round(churnRate * 100) / 100,
      churnedThisMonth,
      totalAtStartOfMonth,
      period,
    };
  } catch (error) {
    console.error('[BillingAnalytics] Failed to get churn rate:', error);
    return { churnRate: 0, churnedThisMonth: 0, totalAtStartOfMonth: 0, period: '' };
  }
}

// ===== GET REVENUE BY PLAN =====

export async function getRevenueByPlan(currency: string = 'USD'): Promise<RevenueByPlanResult[]> {
  try {
    const plans: PlanType[] = ['pro', 'elite'];
    const results: RevenueByPlanResult[] = [];

    for (const plan of plans) {
      const subscribers = await db.subscription.count({
        where: {
          plan,
          status: { in: ['active', 'trialing'] },
        },
      });

      const pricing = PLAN_MONTHLY_PRICING[plan];
      const monthlyRevenue = pricing ? subscribers * pricing[currency as keyof typeof pricing] : 0;
      const arpu = subscribers > 0 ? monthlyRevenue / subscribers : 0;

      results.push({
        plan,
        revenue: Math.round(monthlyRevenue * 100) / 100,
        subscribers,
        arpu: Math.round(arpu * 100) / 100,
        currency,
      });
    }

    return results;
  } catch (error) {
    console.error('[BillingAnalytics] Failed to get revenue by plan:', error);
    return [];
  }
}

// ===== GET PAYMENT SUCCESS RATE =====

export async function getPaymentSuccessRate(periodDays: number = 30): Promise<PaymentSuccessResult> {
  try {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [successfulPayments, failedPayments] = await Promise.all([
      db.paymentOrder.count({
        where: {
          status: 'completed',
          createdAt: { gte: since },
        },
      }),
      db.paymentOrder.count({
        where: {
          status: 'failed',
          createdAt: { gte: since },
        },
      }),
    ]);

    const totalPayments = successfulPayments + failedPayments;
    const successRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

    const now = new Date();
    const period = `Last ${periodDays} days (since ${since.toLocaleDateString()} — ${now.toLocaleDateString()})`;

    return {
      successRate: Math.round(successRate * 100) / 100,
      totalPayments,
      successfulPayments,
      failedPayments,
      period,
    };
  } catch (error) {
    console.error('[BillingAnalytics] Failed to get payment success rate:', error);
    return { successRate: 0, totalPayments: 0, successfulPayments: 0, failedPayments: 0, period: '' };
  }
}

// ===== GET ARPU =====

export async function getARPU(currency: string = 'USD'): Promise<number> {
  try {
    const revenueByPlan = await getRevenueByPlan(currency);
    const totalRevenue = revenueByPlan.reduce((sum, r) => sum + r.revenue, 0);
    const totalSubscribers = revenueByPlan.reduce((sum, r) => sum + r.subscribers, 0);

    return totalSubscribers > 0 ? Math.round((totalRevenue / totalSubscribers) * 100) / 100 : 0;
  } catch (error) {
    console.error('[BillingAnalytics] Failed to calculate ARPU:', error);
    return 0;
  }
}

// ===== GET CREDIT USAGE PATTERNS =====

export async function getCreditUsagePatterns(options?: {
  periodDays?: number;
  limit?: number;
}): Promise<CreditUsageResult> {
  try {
    const periodDays = options?.periodDays || 30;
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Get all credit deductions in the period
    const deductions = await db.creditsLedger.findMany({
      where: {
        credits: { lt: 0 }, // Only deductions
        createdAt: { gte: since },
      },
      select: {
        action: true,
        credits: true,
      },
    });

    const totalCreditsUsed = deductions.reduce((sum, d) => sum + Math.abs(d.credits), 0);
    const creditsUsedByAction: Record<string, number> = {};

    for (const d of deductions) {
      creditsUsedByAction[d.action] = (creditsUsedByAction[d.action] || 0) + Math.abs(d.credits);
    }

    // Calculate average credits per user
    const uniqueUsers = new Set(
      (await db.creditsLedger.findMany({
        where: {
          credits: { lt: 0 },
          createdAt: { gte: since },
        },
        select: { userId: true },
        distinct: ['userId'],
      })).map((d) => d.userId)
    ).size;

    const averageCreditsPerUser = uniqueUsers > 0 ? totalCreditsUsed / uniqueUsers : 0;

    // Get top actions
    const topActions = Object.entries(creditsUsedByAction)
      .map(([action, credits]) => ({
        action,
        count: deductions.filter((d) => d.action === action).length,
        credits,
      }))
      .sort((a, b) => b.credits - a.credits)
      .slice(0, options?.limit || 10);

    return {
      totalCreditsUsed,
      creditsUsedByAction,
      averageCreditsPerUser: Math.round(averageCreditsPerUser * 100) / 100,
      topActions,
    };
  } catch (error) {
    console.error('[BillingAnalytics] Failed to get credit usage patterns:', error);
    return { totalCreditsUsed: 0, creditsUsedByAction: {}, averageCreditsPerUser: 0, topActions: [] };
  }
}

// ===== GET COMPLETE ANALYTICS =====

export async function getCompleteAnalytics(currency: string = 'USD'): Promise<BillingAnalyticsResult> {
  const [mrr, arr, churn, revenueByPlan, paymentSuccess, arpu, creditUsage] = await Promise.all([
    calculateMRR(currency),
    calculateARR(currency),
    getChurnRate(),
    getRevenueByPlan(currency),
    getPaymentSuccessRate(),
    getARPU(currency),
    getCreditUsagePatterns(),
  ]);

  const totalSubscribers = revenueByPlan.reduce((sum, r) => sum + r.subscribers, 0);

  return {
    mrr,
    arr,
    churn,
    revenueByPlan,
    paymentSuccess,
    arpu,
    totalSubscribers,
    creditUsage,
  };
}
