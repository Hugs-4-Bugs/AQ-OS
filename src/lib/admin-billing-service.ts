// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Billing Monitoring & Management Service
// Phase 5: Admin Billing Foundations
//
// Provides admin-level billing monitoring, analytics, and overrides.
// All functions use `db` from `@/lib/db` and `logBillingEvent` from
// `@/lib/billing-audit`. Errors are handled gracefully.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logBillingEvent } from '@/lib/billing-audit';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

// --- 1. Billing Overview ---

export interface BillingOverviewByPlan {
  plan: string;
  count: number;
}

export interface BillingOverviewRevenue {
  currentMonth: number;
  lastMonth: number;
  percentChange: number;
}

export interface BillingOverviewResult {
  totalActive: number;
  byPlan: BillingOverviewByPlan[];
  revenue: BillingOverviewRevenue;
  failedPayments: number;
  pastDue: number;
  trials: number;
  churnRate: number;
}

// --- 2. Webhook Monitoring ---

export interface WebhookMonitoringOptions {
  provider?: 'razorpay' | 'stripe';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface WebhookEntry {
  id: string;
  eventId: string;
  eventType: string;
  provider: string;
  processed: boolean;
  processingError: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  paymentOrderId: string | null;
}

export interface WebhookStats {
  total: number;
  processed: number;
  failed: number;
  pending: number;
  avgProcessingTime: number | null;
}

export interface WebhookMonitoringResult {
  webhooks: WebhookEntry[];
  stats: WebhookStats;
}

// --- 3. Failed Payment Logs ---

export interface FailedPaymentLogsOptions {
  startDate?: Date;
  endDate?: Date;
  plan?: string;
  provider?: 'razorpay' | 'stripe';
  limit?: number;
  offset?: number;
}

export interface FailedPaymentEntry {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  provider: string;
  amount: number;
  currency: string;
  plan: string;
  billingCycle: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  couponCode: string | null;
  discountAmount: number;
  taxAmount: number;
  webhooks: Array<{
    id: string;
    eventType: string;
    processingError: string | null;
    receivedAt: Date;
  }>;
}

export interface FailedPaymentByProvider {
  provider: string;
  count: number;
}

export interface FailedPaymentByPlan {
  plan: string;
  count: number;
}

export interface FailedPaymentLogsResult {
  payments: FailedPaymentEntry[];
  total: number;
  byProvider: FailedPaymentByProvider[];
  byPlan: FailedPaymentByPlan[];
}

// --- 4. Invoice Tracking ---

export interface InvoiceTrackingOptions {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  currency?: string;
  limit?: number;
  offset?: number;
}

export interface InvoiceEntry {
  id: string;
  invoiceNumber: string;
  userId: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  gstNumber: string | null;
  taxExempt: boolean;
  createdAt: Date;
  paymentOrder: {
    id: string;
    provider: string;
    plan: string;
    billingCycle: string;
    status: string;
    amount: number;
  } | null;
}

export interface GstSummary {
  totalGstCollected: number;
  totalInvoicesWithGst: number;
  byGstRate: Array<{
    taxRate: number;
    taxAmount: number;
    count: number;
  }>;
}

export interface InvoiceTrackingResult {
  invoices: InvoiceEntry[];
  total: number;
  totalRevenue: number;
  taxCollected: number;
  gstSummary: GstSummary;
}

// --- 5. Subscription Metrics ---

export type SubscriptionMetricsPeriod = 'day' | 'week' | 'month';

export interface SubscriptionMetricsPoint {
  period: string;
  newSubscriptions: number;
  churned: number;
  upgrades: number;
  downgrades: number;
}

export interface PlanDistributionPoint {
  plan: string;
  count: number;
}

export interface SubscriptionMetricsResult {
  newSubscriptions: SubscriptionMetricsPoint[];
  churned: SubscriptionMetricsPoint[];
  upgrades: number;
  downgrades: number;
  distribution: PlanDistributionPoint[];
}

// --- 6. Retry Failed Webhook ---

export interface RetryFailedWebhookResult {
  success: boolean;
  webhookId: string;
  error?: string;
}

// --- 7. Override Subscription ---

export interface OverrideSubscriptionParams {
  subscriptionId: string;
  adminUserId: string;
  plan?: string;
  customCredits?: number;
  extendTrialDays?: number;
  forceStatus?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  reason?: string;
}

export interface OverrideSubscriptionResult {
  success: boolean;
  subscription?: {
    id: string;
    plan: string;
    status: string;
    isTrial: boolean;
    trialEndsAt: Date | null;
    billingCycle: string;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  };
  error?: string;
}

// --- 8. Export Billing Data ---

export interface ExportBillingDataOptions {
  startDate?: Date;
  endDate?: Date;
}

export interface ExportBillingDataResult {
  subscriptions: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  webhooks: Array<Record<string, unknown>>;
  exportedAt: string;
  dateRange: { startDate?: string; endDate?: string };
}

// --- 9. Revenue By Period ---

export interface RevenuePeriodPoint {
  period: string;
  revenue: number;
  refunds: number;
  net: number;
  gst: number;
}

export interface RevenueByPlanPoint {
  plan: string;
  revenue: number;
  count: number;
}

export interface RevenueByCurrencyPoint {
  currency: string;
  revenue: number;
  count: number;
}

export interface RevenueByPeriodResult {
  periods: RevenuePeriodPoint[];
  total: number;
  byPlan: RevenueByPlanPoint[];
  byCurrency: RevenueByCurrencyPoint[];
  gstTotal: number;
  refundsTotal: number;
}

// ═══════════════════════════════════════════════════════════════════
// 1. GET BILLING OVERVIEW
// ═══════════════════════════════════════════════════════════════════

/**
 * Get the billing dashboard overview data including:
 * - Total active subscriptions by plan
 * - Revenue for current and last month
 * - Failed payments, past-due subscriptions, trials
 * - Churn rate calculation
 */
export async function getBillingOverview(): Promise<BillingOverviewResult> {
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Active subscriptions by plan — use DB groupBy instead of loading all records
    const planGroups = await db.subscription.groupBy({
      by: ['plan'],
      _count: { plan: true },
      where: { status: { in: ['active', 'trialing'] } },
    });
    const byPlan = planGroups.map((g) => ({ plan: g.plan, count: g._count.plan }));
    const totalActive = byPlan.reduce((sum, g) => sum + g.count, 0);

    // Revenue — use DB aggregate(_sum) instead of loading all payment records
    const [currentMonthAgg, lastMonthAgg, allTimeAgg] = await Promise.all([
      db.paymentOrder.aggregate({
        _sum: { amount: true },
        where: { status: 'completed', createdAt: { gte: currentMonthStart } },
      }),
      db.paymentOrder.aggregate({
        _sum: { amount: true },
        where: { status: 'completed', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      }),
      db.paymentOrder.aggregate({
        _sum: { amount: true },
        where: { status: 'completed' },
      }),
    ]);
    const currentMonthRevenue = currentMonthAgg._sum.amount || 0;
    const lastMonthRevenue = lastMonthAgg._sum.amount || 0;

    const percentChange = lastMonthRevenue === 0
      ? (currentMonthRevenue > 0 ? 100 : 0)
      : ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;

    // Counts — use DB count() (already efficient)
    const [failedPayments, pastDue, trials, churnedLast30] = await Promise.all([
      db.paymentOrder.count({ where: { status: 'failed' } }),
      db.subscription.count({ where: { status: 'past_due' } }),
      db.subscription.count({ where: { status: 'trialing', isTrial: true } }),
      db.subscription.count({
        where: {
          status: { in: ['expired', 'canceled'] },
          updatedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const totalAtPeriodStart = totalActive + churnedLast30;
    const churnRate = totalAtPeriodStart > 0
      ? (churnedLast30 / totalAtPeriodStart) * 100
      : 0;

    return {
      totalActive,
      byPlan,
      revenue: {
        currentMonth: currentMonthRevenue,
        lastMonth: lastMonthRevenue,
        percentChange: Math.round(percentChange * 100) / 100,
      },
      failedPayments,
      pastDue,
      trials,
      churnRate: Math.round(churnRate * 100) / 100,
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get billing overview:', error);
    return {
      totalActive: 0,
      byPlan: [],
      revenue: { currentMonth: 0, lastMonth: 0, percentChange: 0 },
      failedPayments: 0,
      pastDue: 0,
      trials: 0,
      churnRate: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. GET WEBHOOK MONITORING
// ═══════════════════════════════════════════════════════════════════

/**
 * Monitor webhook processing with filtering by provider and date range.
 * Returns webhook entries and aggregate stats (total, processed, failed, pending,
 * average processing time).
 */
export async function getWebhookMonitoring(
  options?: WebhookMonitoringOptions
): Promise<WebhookMonitoringResult> {
  try {
    const where: Record<string, unknown> = {};

    if (options?.provider) {
      where.provider = options.provider;
    }

    if (options?.startDate || options?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (options.startDate) createdAt.gte = options.startDate;
      if (options.endDate) createdAt.lte = options.endDate;
      where.receivedAt = createdAt;
    }

    const [webhooks, total, processedCount, failedCount, pendingCount] = await Promise.all([
      db.paymentWebhook.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
        select: {
          id: true,
          eventId: true,
          eventType: true,
          provider: true,
          processed: true,
          processingError: true,
          receivedAt: true,
          processedAt: true,
          paymentOrderId: true,
        },
      }),
      db.paymentWebhook.count({ where }),
      db.paymentWebhook.count({ where: { ...where, processed: true } }),
      db.paymentWebhook.count({
        where: { ...where, processed: true, processingError: { not: null } },
      }),
      db.paymentWebhook.count({ where: { ...where, processed: false } }),
    ]);

    // Calculate average processing time for successfully processed webhooks
    const processedWebhooks = await db.paymentWebhook.findMany({
      where: {
        ...where,
        processed: true,
        processedAt: { not: null },
      },
      select: {
        receivedAt: true,
        processedAt: true,
      },
      take: 100,
    });

    let avgProcessingTime: number | null = null;
    if (processedWebhooks.length > 0) {
      const totalMs = processedWebhooks.reduce((sum, wh) => {
        if (wh.processedAt) {
          return sum + (new Date(wh.processedAt).getTime() - new Date(wh.receivedAt).getTime());
        }
        return sum;
      }, 0);
      avgProcessingTime = Math.round(totalMs / processedWebhooks.length);
    }

    return {
      webhooks: webhooks.map((wh) => ({
        id: wh.id,
        eventId: wh.eventId,
        eventType: wh.eventType,
        provider: wh.provider,
        processed: wh.processed,
        processingError: wh.processingError,
        receivedAt: wh.receivedAt,
        processedAt: wh.processedAt,
        paymentOrderId: wh.paymentOrderId,
      })),
      stats: {
        total,
        processed: processedCount,
        failed: failedCount,
        pending: pendingCount,
        avgProcessingTime,
      },
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get webhook monitoring:', error);
    return {
      webhooks: [],
      stats: { total: 0, processed: 0, failed: 0, pending: 0, avgProcessingTime: null },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. GET FAILED PAYMENT LOGS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get details on all failed payment orders with user info,
 * error details, and retry attempts (from webhooks).
 * Filter by date, plan, provider.
 */
export async function getFailedPaymentLogs(
  options?: FailedPaymentLogsOptions
): Promise<FailedPaymentLogsResult> {
  try {
    const where: Record<string, unknown> = { status: 'failed' };

    if (options?.provider) {
      where.provider = options.provider;
    }

    if (options?.plan) {
      where.plan = options.plan;
    }

    if (options?.startDate || options?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (options.startDate) createdAt.gte = options.startDate;
      if (options.endDate) createdAt.lte = options.endDate;
      where.createdAt = createdAt;
    }

    const [payments, total] = await Promise.all([
      db.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
        include: {
          user: {
            select: { name: true, email: true },
          },
          webhooks: {
            select: {
              id: true,
              eventType: true,
              processingError: true,
              receivedAt: true,
            },
            orderBy: { receivedAt: 'desc' },
            take: 5,
          },
        },
      }),
      db.paymentOrder.count({ where }),
    ]);

    // Breakdown by provider
    const allFailedByProvider = await db.paymentOrder.findMany({
      where: { status: 'failed' },
      select: { provider: true },
    });
    const providerMap = new Map<string, number>();
    for (const p of allFailedByProvider) {
      providerMap.set(p.provider, (providerMap.get(p.provider) || 0) + 1);
    }
    const byProvider = Array.from(providerMap.entries()).map(([provider, count]) => ({ provider, count }));

    // Breakdown by plan
    const allFailedByPlan = await db.paymentOrder.findMany({
      where: { status: 'failed' },
      select: { plan: true },
    });
    const planMap = new Map<string, number>();
    for (const p of allFailedByPlan) {
      planMap.set(p.plan, (planMap.get(p.plan) || 0) + 1);
    }
    const byPlan = Array.from(planMap.entries()).map(([plan, count]) => ({ plan, count }));

    return {
      payments: payments.map((p) => ({
        id: p.id,
        userId: p.userId,
        userName: p.user.name,
        userEmail: p.user.email,
        provider: p.provider,
        amount: p.amount,
        currency: p.currency,
        plan: p.plan,
        billingCycle: p.billingCycle,
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        providerOrderId: p.providerOrderId,
        providerPaymentId: p.providerPaymentId,
        couponCode: p.couponCode,
        discountAmount: p.discountAmount,
        taxAmount: p.taxAmount,
        webhooks: p.webhooks.map((w) => ({
          id: w.id,
          eventType: w.eventType,
          processingError: w.processingError,
          receivedAt: w.receivedAt,
        })),
      })),
      total,
      byProvider,
      byPlan,
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get failed payment logs:', error);
    return {
      payments: [],
      total: 0,
      byProvider: [],
      byPlan: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. GET INVOICE TRACKING
// ═══════════════════════════════════════════════════════════════════

/**
 * Track all invoices with status, revenue, tax collected, and GST summary
 * for Indian invoices. Filter by date range, status, currency.
 */
export async function getInvoiceTracking(
  options?: InvoiceTrackingOptions
): Promise<InvoiceTrackingResult> {
  try {
    const where: Record<string, unknown> = {};

    // Filter by payment order status if specified
    if (options?.status) {
      where.paymentOrder = { status: options.status };
    }

    if (options?.currency) {
      where.currency = options.currency;
    }

    if (options?.startDate || options?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (options.startDate) createdAt.gte = options.startDate;
      if (options.endDate) createdAt.lte = options.endDate;
      where.createdAt = createdAt;
    }

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
        include: {
          paymentOrder: {
            select: {
              id: true,
              provider: true,
              plan: true,
              billingCycle: true,
              status: true,
              amount: true,
            },
          },
        },
      }),
      db.invoice.count({ where }),
    ]);

    // Calculate totals
    const allInvoicesInScope = await db.invoice.findMany({
      where,
      select: {
        total: true,
        taxAmount: true,
        taxRate: true,
        gstNumber: true,
        taxExempt: true,
      },
    });

    const totalRevenue = allInvoicesInScope.reduce((sum, inv) => sum + inv.total, 0);
    const taxCollected = allInvoicesInScope.reduce((sum, inv) => sum + inv.taxAmount, 0);

    // GST summary for Indian invoices (non-tax-exempt with GST number)
    const gstInvoices = allInvoicesInScope.filter(
      (inv) => !inv.taxExempt && inv.gstNumber
    );
    const totalGstCollected = gstInvoices.reduce((sum, inv) => sum + inv.taxAmount, 0);
    const totalInvoicesWithGst = gstInvoices.length;

    // Group by tax rate
    const gstRateMap = new Map<number, { taxAmount: number; count: number }>();
    for (const inv of gstInvoices) {
      const existing = gstRateMap.get(inv.taxRate) || { taxAmount: 0, count: 0 };
      gstRateMap.set(inv.taxRate, {
        taxAmount: existing.taxAmount + inv.taxAmount,
        count: existing.count + 1,
      });
    }
    const byGstRate = Array.from(gstRateMap.entries()).map(([taxRate, data]) => ({
      taxRate,
      taxAmount: Math.round(data.taxAmount * 100) / 100,
      count: data.count,
    }));

    return {
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        userId: inv.userId,
        subtotal: inv.subtotal,
        taxRate: inv.taxRate,
        taxAmount: inv.taxAmount,
        total: inv.total,
        currency: inv.currency,
        gstNumber: inv.gstNumber,
        taxExempt: inv.taxExempt,
        createdAt: inv.createdAt,
        paymentOrder: inv.paymentOrder
          ? {
              id: inv.paymentOrder.id,
              provider: inv.paymentOrder.provider,
              plan: inv.paymentOrder.plan,
              billingCycle: inv.paymentOrder.billingCycle,
              status: inv.paymentOrder.status,
              amount: inv.paymentOrder.amount,
            }
          : null,
      })),
      total,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      taxCollected: Math.round(taxCollected * 100) / 100,
      gstSummary: {
        totalGstCollected: Math.round(totalGstCollected * 100) / 100,
        totalInvoicesWithGst,
        byGstRate,
      },
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get invoice tracking:', error);
    return {
      invoices: [],
      total: 0,
      totalRevenue: 0,
      taxCollected: 0,
      gstSummary: { totalGstCollected: 0, totalInvoicesWithGst: 0, byGstRate: [] },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. GET SUBSCRIPTION METRICS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get subscription metrics over a period (day/week/month):
 * - New subscriptions per period
 * - Churn per period
 * - Upgrade/downgrade counts
 * - Current plan distribution
 */
export async function getSubscriptionMetrics(
  period: SubscriptionMetricsPeriod = 'month'
): Promise<SubscriptionMetricsResult> {
  try {
    const now = new Date();
    const periodDays = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const totalDays = period === 'day' ? 30 : period === 'week' ? 90 : 365;
    const numPeriods = Math.ceil(totalDays / periodDays);

    // Get all subscription audit logs in the time window
    const windowStart = new Date(now.getTime() - totalDays * 24 * 60 * 60 * 1000);

    const auditLogs = await db.auditLog.findMany({
      where: {
        resource: 'billing',
        action: {
          in: [
            'subscription_created',
            'subscription_expired',
            'subscription_canceled',
            'upgrade_completed',
            'downgrade_completed',
          ],
        },
        createdAt: { gte: windowStart },
      },
      select: {
        action: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Build period buckets
    const periods: SubscriptionMetricsPoint[] = [];
    const newSubscriptions: SubscriptionMetricsPoint[] = [];
    const churned: SubscriptionMetricsPoint[] = [];
    let totalUpgrades = 0;
    let totalDowngrades = 0;

    for (let i = 0; i < numPeriods; i++) {
      const periodStart = new Date(windowStart.getTime() + i * periodDays * 24 * 60 * 60 * 1000);
      const periodEnd = new Date(periodStart.getTime() + periodDays * 24 * 60 * 60 * 1000);
      const periodLabel = formatPeriodLabel(periodStart, period);

      const logsInPeriod = auditLogs.filter(
        (log) => log.createdAt >= periodStart && log.createdAt < periodEnd
      );

      const newCount = logsInPeriod.filter((l) => l.action === 'subscription_created').length;
      const churnCount = logsInPeriod.filter(
        (l) => l.action === 'subscription_expired' || l.action === 'subscription_canceled'
      ).length;
      const upgradeCount = logsInPeriod.filter((l) => l.action === 'upgrade_completed').length;
      const downgradeCount = logsInPeriod.filter((l) => l.action === 'downgrade_completed').length;

      totalUpgrades += upgradeCount;
      totalDowngrades += downgradeCount;

      newSubscriptions.push({
        period: periodLabel,
        newSubscriptions: newCount,
        churned: 0,
        upgrades: upgradeCount,
        downgrades: downgradeCount,
      });

      churned.push({
        period: periodLabel,
        newSubscriptions: 0,
        churned: churnCount,
        upgrades: 0,
        downgrades: 0,
      });

      periods.push({
        period: periodLabel,
        newSubscriptions: newCount,
        churned: churnCount,
        upgrades: upgradeCount,
        downgrades: downgradeCount,
      });
    }

    // Current plan distribution
    const activeSubscriptions = await db.subscription.findMany({
      where: { status: { in: ['active', 'trialing', 'past_due'] } },
      select: { plan: true },
    });

    const planMap = new Map<string, number>();
    for (const sub of activeSubscriptions) {
      planMap.set(sub.plan, (planMap.get(sub.plan) || 0) + 1);
    }
    const distribution = Array.from(planMap.entries()).map(([plan, count]) => ({ plan, count }));

    return {
      newSubscriptions,
      churned,
      upgrades: totalUpgrades,
      downgrades: totalDowngrades,
      distribution,
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get subscription metrics:', error);
    return {
      newSubscriptions: [],
      churned: [],
      upgrades: 0,
      downgrades: 0,
      distribution: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. RETRY FAILED WEBHOOK
// ═══════════════════════════════════════════════════════════════════

/**
 * Manually retry a failed webhook by re-processing its event payload.
 * Logs the retry attempt in the audit trail.
 */
export async function retryFailedWebhook(
  webhookId: string
): Promise<RetryFailedWebhookResult> {
  try {
    const webhook = await db.paymentWebhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      return { success: false, webhookId, error: 'Webhook not found' };
    }

    if (webhook.processed && !webhook.processingError) {
      return { success: false, webhookId, error: 'Webhook already successfully processed' };
    }

    // Attempt to re-process: mark as not processed, clear error
    // In a real system, this would re-dispatch to the webhook handler.
    // Here we reset the state and log the retry.
    const now = new Date();
    await db.paymentWebhook.update({
      where: { id: webhookId },
      data: {
        processed: false,
        processingError: null,
        receivedAt: now,
        processedAt: null,
      },
    });

    // Log the retry attempt
    await logBillingEvent({
      userId: webhook.paymentOrderId
        ? (await db.paymentOrder.findUnique({ where: { id: webhook.paymentOrderId }, select: { userId: true } }))?.userId || 'system'
        : 'system',
      action: 'webhook_retry',
      details: `Admin retried webhook ${webhook.eventId} (${webhook.eventType})`,
      resourceId: webhookId,
      metadata: {
        provider: webhook.provider,
        eventType: webhook.eventType,
        originalError: webhook.processingError,
        retriedAt: now.toISOString(),
      },
    });

    return { success: true, webhookId };
  } catch (error) {
    console.error('[AdminBilling] Failed to retry webhook:', error);
    return {
      success: false,
      webhookId,
      error: error instanceof Error ? error.message : 'Failed to retry webhook',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 7. OVERRIDE SUBSCRIPTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Admin override for a subscription:
 * - Change plan manually
 * - Set custom credits
 * - Extend trial period
 * - Force status change
 * All overrides are logged with admin user info.
 */
export async function overrideSubscription(
  params: OverrideSubscriptionParams
): Promise<OverrideSubscriptionResult> {
  try {
    const { subscriptionId, adminUserId, plan, customCredits, extendTrialDays, forceStatus, reason } = params;

    const subscription = await db.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      return { success: false, error: 'Subscription not found' };
    }

    const updateData: Record<string, unknown> = {};
    const changes: Record<string, unknown> = {};

    // Change plan
    if (plan && plan !== subscription.plan) {
      updateData.plan = plan;
      changes.fromPlan = subscription.plan;
      changes.toPlan = plan;
    }

    // Force status change
    if (forceStatus && forceStatus !== subscription.status) {
      updateData.status = forceStatus;
      changes.fromStatus = subscription.status;
      changes.toStatus = forceStatus;

      // If moving to active, also clear trial flag
      if (forceStatus === 'active' && subscription.isTrial) {
        updateData.isTrial = false;
        updateData.trialEndsAt = null;
      }
    }

    // Extend trial
    if (extendTrialDays && extendTrialDays > 0) {
      const currentTrialEnd = subscription.trialEndsAt || new Date();
      const newTrialEnd = new Date(
        currentTrialEnd.getTime() + extendTrialDays * 24 * 60 * 60 * 1000
      );
      updateData.trialEndsAt = newTrialEnd;
      updateData.isTrial = true;
      if (subscription.status !== 'trialing') {
        updateData.status = 'trialing';
      }
      changes.trialExtendedDays = extendTrialDays;
      changes.newTrialEndsAt = newTrialEnd.toISOString();
    }

    // Apply updates
    if (Object.keys(updateData).length > 0) {
      await db.subscription.update({
        where: { id: subscriptionId },
        data: updateData,
      });
    }

    // Set custom credits on the user record
    if (customCredits !== undefined && customCredits >= 0) {
      // Get current credits before update
      const userBefore = await db.user.findUnique({
        where: { id: subscription.userId },
        select: { credits: true },
      });
      const previousCredits = userBefore?.credits ?? 0;
      const creditDelta = customCredits - previousCredits;

      await db.user.update({
        where: { id: subscription.userId },
        data: {
          credits: customCredits,
          ...(plan ? { plan } : {}),
          ...(updateData.isTrial === false ? { isTrial: false, trialEndsAt: null } : {}),
          ...(extendTrialDays ? { isTrial: true, trialEndsAt: updateData.trialEndsAt as Date } : {}),
        },
      });
      changes.customCredits = customCredits;
      changes.creditDelta = creditDelta;

      // Create ledger entry for the credit adjustment
      await db.creditsLedger.create({
        data: {
          userId: subscription.userId,
          action: 'admin_override',
          credits: creditDelta,
          balance: customCredits,
          description: `Admin credit override: ${creditDelta >= 0 ? '+' : ''}${creditDelta} credits (balance: ${customCredits})`,
        },
      });
    }

    // Log the override
    await logBillingEvent({
      userId: adminUserId,
      action: 'subscription_override',
      details: `Admin ${adminUserId} overrode subscription ${subscriptionId}`,
      resourceId: subscriptionId,
      metadata: {
        ...changes,
        reason: reason || 'No reason provided',
        overriddenUserId: subscription.userId,
      },
    });

    // Fetch the updated subscription
    const updatedSubscription = await db.subscription.findUnique({
      where: { id: subscriptionId },
    });

    return {
      success: true,
      subscription: updatedSubscription
        ? {
            id: updatedSubscription.id,
            plan: updatedSubscription.plan,
            status: updatedSubscription.status,
            isTrial: updatedSubscription.isTrial,
            trialEndsAt: updatedSubscription.trialEndsAt,
            billingCycle: updatedSubscription.billingCycle,
            currentPeriodStart: updatedSubscription.currentPeriodStart,
            currentPeriodEnd: updatedSubscription.currentPeriodEnd,
          }
        : undefined,
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to override subscription:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to override subscription',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 8. EXPORT BILLING DATA
// ═══════════════════════════════════════════════════════════════════

/**
 * Export billing data as structured JSON for reporting.
 * Includes subscriptions, payments, invoices, and webhooks.
 * Filter by date range.
 */
export async function exportBillingData(
  options?: ExportBillingDataOptions
): Promise<ExportBillingDataResult> {
  try {
    const dateFilter: Record<string, Date> = {};
    if (options?.startDate) dateFilter.gte = options.startDate;
    if (options?.endDate) dateFilter.lte = options.endDate;

    const where = Object.keys(dateFilter).length > 0
      ? { createdAt: dateFilter }
      : {};

    const [subscriptions, payments, invoices, webhooks] = await Promise.all([
      db.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          plan: true,
          status: true,
          isTrial: true,
          trialEndsAt: true,
          billingCycle: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          scheduledPlanChange: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          provider: true,
          amount: true,
          currency: true,
          plan: true,
          billingCycle: true,
          status: true,
          couponCode: true,
          discountAmount: true,
          taxAmount: true,
          subtotal: true,
          isIndianUser: true,
          gstNumber: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          userId: true,
          subtotal: true,
          taxRate: true,
          taxAmount: true,
          total: true,
          currency: true,
          gstNumber: true,
          taxExempt: true,
          createdAt: true,
        },
      }),
      db.paymentWebhook.findMany({
        where: Object.keys(dateFilter).length > 0
          ? { receivedAt: dateFilter }
          : {},
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true,
          eventId: true,
          eventType: true,
          provider: true,
          processed: true,
          processingError: true,
          receivedAt: true,
          processedAt: true,
          paymentOrderId: true,
        },
      }),
    ]);

    return {
      subscriptions: subscriptions.map((s) => ({
        ...s,
        trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
        currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      payments: payments.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      invoices: invoices.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
      })),
      webhooks: webhooks.map((w) => ({
        ...w,
        receivedAt: w.receivedAt.toISOString(),
        processedAt: w.processedAt?.toISOString() ?? null,
      })),
      exportedAt: new Date().toISOString(),
      dateRange: {
        startDate: options?.startDate?.toISOString(),
        endDate: options?.endDate?.toISOString(),
      },
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to export billing data:', error);
    return {
      subscriptions: [],
      payments: [],
      invoices: [],
      webhooks: [],
      exportedAt: new Date().toISOString(),
      dateRange: {
        startDate: options?.startDate?.toISOString(),
        endDate: options?.endDate?.toISOString(),
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 9. GET REVENUE BY PERIOD
// ═══════════════════════════════════════════════════════════════════

/**
 * Revenue breakdown by daily/weekly/monthly periods, by plan, by currency,
 * GST collected, and net revenue after refunds.
 */
export async function getRevenueByPeriod(
  startDate: Date,
  endDate: Date
): Promise<RevenueByPeriodResult> {
  try {
    // Fetch all completed and refunded payments in the range
    const payments = await db.paymentOrder.findMany({
      where: {
        status: { in: ['completed', 'refunded'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        amount: true,
        currency: true,
        plan: true,
        status: true,
        taxAmount: true,
        isIndianUser: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Determine period granularity based on date range
    const dayDiff = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    const granularity: 'day' | 'week' | 'month' = dayDiff <= 31 ? 'day' : dayDiff <= 180 ? 'week' : 'month';

    // Group payments by period
    const periodMap = new Map<string, { revenue: number; refunds: number; gst: number }>();

    for (const payment of payments) {
      const periodKey = getPeriodKey(payment.createdAt, granularity);

      const existing = periodMap.get(periodKey) || { revenue: 0, refunds: 0, gst: 0 };

      if (payment.status === 'refunded') {
        existing.refunds += payment.amount;
      } else {
        existing.revenue += payment.amount;
      }
      existing.gst += payment.taxAmount;

      periodMap.set(periodKey, existing);
    }

    const periods: RevenuePeriodPoint[] = Array.from(periodMap.entries())
      .map(([period, data]) => ({
        period,
        revenue: Math.round(data.revenue * 100) / 100,
        refunds: Math.round(data.refunds * 100) / 100,
        net: Math.round((data.revenue - data.refunds) * 100) / 100,
        gst: Math.round(data.gst * 100) / 100,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // By plan
    const planMap = new Map<string, { revenue: number; count: number }>();
    for (const payment of payments) {
      if (payment.status === 'completed') {
        const existing = planMap.get(payment.plan) || { revenue: 0, count: 0 };
        existing.revenue += payment.amount;
        existing.count += 1;
        planMap.set(payment.plan, existing);
      }
    }
    const byPlan = Array.from(planMap.entries()).map(([plan, data]) => ({
      plan,
      revenue: Math.round(data.revenue * 100) / 100,
      count: data.count,
    }));

    // By currency
    const currencyMap = new Map<string, { revenue: number; count: number }>();
    for (const payment of payments) {
      if (payment.status === 'completed') {
        const existing = currencyMap.get(payment.currency) || { revenue: 0, count: 0 };
        existing.revenue += payment.amount;
        existing.count += 1;
        currencyMap.set(payment.currency, existing);
      }
    }
    const byCurrency = Array.from(currencyMap.entries()).map(([currency, data]) => ({
      currency,
      revenue: Math.round(data.revenue * 100) / 100,
      count: data.count,
    }));

    // Totals
    const totalRevenue = payments
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);
    const totalRefunds = payments
      .filter((p) => p.status === 'refunded')
      .reduce((sum, p) => sum + p.amount, 0);
    const totalGst = payments.reduce((sum, p) => sum + p.taxAmount, 0);

    return {
      periods,
      total: Math.round(totalRevenue * 100) / 100,
      byPlan,
      byCurrency,
      gstTotal: Math.round(totalGst * 100) / 100,
      refundsTotal: Math.round(totalRefunds * 100) / 100,
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get revenue by period:', error);
    return {
      periods: [],
      total: 0,
      byPlan: [],
      byCurrency: [],
      gstTotal: 0,
      refundsTotal: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 31 COMPLETION — Operational list/detail/export helpers
//
// All functions reuse existing models (Subscription, PaymentOrder,
// PaymentWebhook, Invoice, CreditsLedger, ModelInvocation, AuditLog).
// All list queries are paginated + bounded. No findMany() is used for
// aggregate metrics — groupBy/aggregate/count are used instead.
// ═══════════════════════════════════════════════════════════════════

// --- 10. Subscription List (operational) ---

export interface SubscriptionListOptions {
  status?: string;
  plan?: string;
  provider?: 'stripe' | 'razorpay';
  limit?: number;
  offset?: number;
}

export interface SubscriptionListEntry {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  plan: string;
  status: string;
  billingCycle: string;
  isTrial: boolean;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  provider: 'stripe' | 'razorpay' | 'none';
  providerSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionListResult {
  subscriptions: SubscriptionListEntry[];
  total: number;
}

/**
 * Paginated list of platform subscriptions with operational fields.
 * Reuses existing Subscription model — NO duplicate infrastructure.
 */
export async function getSubscriptionList(
  options?: SubscriptionListOptions
): Promise<SubscriptionListResult> {
  try {
    const where: Record<string, unknown> = {};
    if (options?.status) where.status = options.status;
    if (options?.plan) where.plan = options.plan;
    if (options?.provider === 'stripe') where.stripeSubscriptionId = { not: null };
    if (options?.provider === 'razorpay') where.razorpaySubscriptionId = { not: null };

    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    const [subs, total] = await Promise.all([
      db.subscription.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: { select: { email: true, name: true } },
        },
      }),
      db.subscription.count({ where }),
    ]);

    return {
      subscriptions: subs.map((s) => {
        const provider: 'stripe' | 'razorpay' | 'none' = s.stripeSubscriptionId
          ? 'stripe'
          : s.razorpaySubscriptionId
          ? 'razorpay'
          : 'none';
        return {
          id: s.id,
          userId: s.userId,
          userEmail: s.user?.email || '',
          userName: s.user?.name || null,
          plan: s.plan,
          status: s.status,
          billingCycle: s.billingCycle,
          isTrial: s.isTrial,
          trialEndsAt: s.trialEndsAt,
          currentPeriodStart: s.currentPeriodStart,
          currentPeriodEnd: s.currentPeriodEnd,
          cancelAtPeriodEnd: s.cancelAtPeriodEnd,
          provider,
          providerSubscriptionId:
            s.stripeSubscriptionId || s.razorpaySubscriptionId || null,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        };
      }),
      total,
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get subscription list:', error);
    return { subscriptions: [], total: 0 };
  }
}

// --- 11. Payment / Transaction List ---

export interface PaymentListOptions {
  status?: string;
  provider?: string;
  plan?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface PaymentListEntry {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  provider: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  plan: string;
  billingCycle: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentListResult {
  payments: PaymentListEntry[];
  total: number;
}

/**
 * Paginated list of payment/transaction records.
 * Reuses existing PaymentOrder model. Provider/reference IDs are surfaced
 * only when non-null and never include signing secrets.
 */
export async function getPaymentList(
  options?: PaymentListOptions
): Promise<PaymentListResult> {
  try {
    const where: Record<string, unknown> = {};
    if (options?.status) where.status = options.status;
    if (options?.provider) where.provider = options.provider;
    if (options?.plan) where.plan = options.plan;
    if (options?.startDate || options?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (options?.startDate) createdAt.gte = options.startDate;
      if (options?.endDate) createdAt.lte = options.endDate;
      where.createdAt = createdAt;
    }

    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    const [payments, total] = await Promise.all([
      db.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { user: { select: { email: true, name: true } } },
      }),
      db.paymentOrder.count({ where }),
    ]);

    return {
      payments: payments.map((p) => ({
        id: p.id,
        userId: p.userId,
        userEmail: p.user?.email || '',
        userName: p.user?.name || null,
        provider: p.provider,
        providerOrderId: p.providerOrderId,
        providerPaymentId: p.providerPaymentId,
        amount: p.amount,
        currency: p.currency,
        plan: p.plan,
        billingCycle: p.billingCycle,
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      total,
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get payment list:', error);
    return { payments: [], total: 0 };
  }
}

// --- 12. Refund History ---

export interface RefundHistoryOptions {
  provider?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface RefundHistoryEntry {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  provider: string;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  plan: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefundHistoryResult {
  refunds: RefundHistoryEntry[];
  total: number;
  totalRefundedAmount: number;
}

/**
 * Paginated history of refunded payment orders (full + partial).
 * Reuses existing PaymentOrder model — refund execution itself goes
 * through /api/admin/refund (billing.refund permission required).
 */
export async function getRefundHistory(
  options?: RefundHistoryOptions
): Promise<RefundHistoryResult> {
  try {
    const where: Record<string, unknown> = { status: 'refunded' };
    if (options?.provider) where.provider = options.provider;
    if (options?.startDate || options?.endDate) {
      const updatedAt: Record<string, Date> = {};
      if (options?.startDate) updatedAt.gte = options.startDate;
      if (options?.endDate) updatedAt.lte = options.endDate;
      where.updatedAt = updatedAt;
    }

    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    const [refunds, total, amountAgg] = await Promise.all([
      db.paymentOrder.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        include: { user: { select: { email: true, name: true } } },
      }),
      db.paymentOrder.count({ where }),
      db.paymentOrder.aggregate({
        _sum: { amount: true },
        where,
      }),
    ]);

    return {
      refunds: refunds.map((p) => ({
        id: p.id,
        userId: p.userId,
        userEmail: p.user?.email || '',
        userName: p.user?.name || null,
        provider: p.provider,
        providerPaymentId: p.providerPaymentId,
        amount: p.amount,
        currency: p.currency,
        plan: p.plan,
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      total,
      totalRefundedAmount: amountAgg._sum.amount || 0,
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get refund history:', error);
    return { refunds: [], total: 0, totalRefundedAmount: 0 };
  }
}

// --- 13. Credits Overview (DB-aggregated) ---

export interface CreditsOverviewOptions {
  limit?: number;
  offset?: number;
}

export interface CreditsOverviewEntry {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  action: string;
  credits: number;
  balance: number;
  description: string | null;
  referenceId: string | null;
  createdAt: Date;
}

export interface CreditsOverviewResult {
  totalCreditBalance: number;
  totalLedgerEntries: number;
  recentEntries: CreditsOverviewEntry[];
}

/**
 * Aggregate credits balance (DB aggregate, no findMany) + paginated
 * recent ledger entries. Reuses existing CreditsLedger model.
 */
export async function getCreditsOverview(
  options?: CreditsOverviewOptions
): Promise<CreditsOverviewResult> {
  try {
    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    const [balanceAgg, totalEntries, recentEntries] = await Promise.all([
      db.user.aggregate({ _sum: { credits: true } }),
      db.creditsLedger.count({}),
      db.creditsLedger.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { user: { select: { email: true, name: true } } },
      }),
    ]);

    return {
      totalCreditBalance: balanceAgg._sum.credits || 0,
      totalLedgerEntries: totalEntries,
      recentEntries: recentEntries.map((e) => ({
        id: e.id,
        userId: e.userId,
        userEmail: e.user?.email || '',
        userName: e.user?.name || null,
        action: e.action,
        credits: e.credits,
        balance: e.balance,
        description: e.description,
        referenceId: e.referenceId,
        createdAt: e.createdAt,
      })),
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get credits overview:', error);
    return { totalCreditBalance: 0, totalLedgerEntries: 0, recentEntries: [] };
  }
}

// --- 14. AI Usage Overview (DB-aggregated) ---

export interface AIUsageOverviewOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AIUsageTotals {
  invocations: number;
  tokens: number;
  completed: number;
  failed: number;
}

export interface AIUsageByProviderEntry {
  provider: string;
  invocations: number;
  tokens: number;
}

export interface AIUsageByModelEntry {
  provider: string;
  model: string;
  invocations: number;
  tokens: number;
}

export interface AIUsageRecentEntry {
  id: string;
  invocationKey: string;
  provider: string;
  model: string;
  status: string;
  tokensUsed: number | null;
  durationMs: number | null;
  userId: string;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface AIUsageOverviewResult {
  totals: AIUsageTotals;
  byProvider: AIUsageByProviderEntry[];
  byModel: AIUsageByModelEntry[];
  recent: AIUsageRecentEntry[];
  total: number;
}

/**
 * Aggregate AI/model usage from existing ModelInvocation records.
 * Uses DB-side count/aggregate/groupBy — NO findMany for aggregates.
 * Reuses existing ModelInvocation model.
 */
export async function getAIUsageOverview(
  options?: AIUsageOverviewOptions
): Promise<AIUsageOverviewResult> {
  try {
    const where: Record<string, unknown> = {};
    if (options?.startDate || options?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (options?.startDate) createdAt.gte = options.startDate;
      if (options?.endDate) createdAt.lte = options.endDate;
      where.createdAt = createdAt;
    }

    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    const [total, tokensAgg, completedCount, failedCount, byProviderGroups, byModelGroups, recent] = await Promise.all([
      db.modelInvocation.count({ where }),
      db.modelInvocation.aggregate({ _sum: { tokensUsed: true }, where }),
      db.modelInvocation.count({ where: { ...where, status: 'COMPLETED' } }),
      db.modelInvocation.count({ where: { ...where, status: 'FAILED' } }),
      db.modelInvocation.groupBy({
        by: ['provider'],
        _count: { provider: true },
        _sum: { tokensUsed: true },
        where,
      }),
      db.modelInvocation.groupBy({
        by: ['provider', 'model'],
        _count: { model: true },
        _sum: { tokensUsed: true },
        where,
      }),
      db.modelInvocation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          invocationKey: true,
          provider: true,
          model: true,
          status: true,
          tokensUsed: true,
          durationMs: true,
          userId: true,
          startedAt: true,
          finishedAt: true,
        },
      }),
    ]);

    return {
      totals: {
        invocations: total,
        tokens: tokensAgg._sum.tokensUsed || 0,
        completed: completedCount,
        failed: failedCount,
      },
      byProvider: byProviderGroups.map((g) => ({
        provider: g.provider,
        invocations: g._count.provider,
        tokens: g._sum.tokensUsed || 0,
      })),
      byModel: byModelGroups.map((g) => ({
        provider: g.provider,
        model: g.model,
        invocations: g._count.model,
        tokens: g._sum.tokensUsed || 0,
      })),
      recent,
      total,
    };
  } catch (error) {
    console.error('[AdminBilling] Failed to get AI usage overview:', error);
    return {
      totals: { invocations: 0, tokens: 0, completed: 0, failed: 0 },
      byProvider: [],
      byModel: [],
      recent: [],
      total: 0,
    };
  }
}

// --- 15. Billing Events (AuditLog) ---

export interface BillingEventsOptions {
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface BillingEventEntry {
  id: string;
  userId: string;
  action: string;
  details: string | null;
  resource: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface BillingEventsResult {
  events: BillingEventEntry[];
  total: number;
}

/**
 * Billing-related audit log entries (refund_issued, plan_change,
 * payment_*, billing_*, credits_*, subscription_*). Reuses existing
 * AuditLog model. Bounded + paginated.
 */
export async function getBillingEvents(
  options?: BillingEventsOptions
): Promise<BillingEventsResult> {
  try {
    const BILLING_ACTION_PREFIXES = [
      'refund', 'payment', 'billing', 'credits', 'subscription', 'plan_',
    ];

    const where: Record<string, unknown> = {};
    if (options?.action) {
      where.action = { contains: options.action };
    } else {
      // Filter to billing-related actions only (OR semantics emulated via in)
      where.OR = BILLING_ACTION_PREFIXES.map((p) => ({
        action: { contains: p },
      }));
    }
    if (options?.startDate || options?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (options?.startDate) createdAt.gte = options.startDate;
      if (options?.endDate) createdAt.lte = options.endDate;
      where.createdAt = createdAt;
    }

    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    const [events, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          userId: true,
          action: true,
          details: true,
          resource: true,
          resourceId: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return { events, total };
  } catch (error) {
    console.error('[AdminBilling] Failed to get billing events:', error);
    return { events: [], total: 0 };
  }
}

// --- 16. Provider Status (evidence-based) ---

export type ProviderConfigState = 'CONFIGURED' | 'NOT_CONFIGURED' | 'ERROR' | 'UNKNOWN';
export type WebhookHealthState = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export interface ProviderStatusEntry {
  provider: 'stripe' | 'razorpay';
  configState: ProviderConfigState;
  // Health is evidence-based: derived from recent PaymentWebhook data,
  // NEVER claimed HEALTHY merely because an env var is present.
  health: WebhookHealthState;
  recentEvents: number;
  recentFailures: number;
  lastEventAt: Date | null;
  lastFailureAt: Date | null;
}

export interface ProviderStatusResult {
  providers: ProviderStatusEntry[];
  // Aggregate webhook health across all providers — UNKNOWN when there
  // is insufficient evidence (no recent webhook events at all).
  webhookHealth: WebhookHealthState;
}

/**
 * Provider configuration + evidence-based webhook health.
 *
 * Configuration state is derived from env var presence:
 *   - STRIPE_SECRET_KEY present (non-empty)  → CONFIGURED
 *   - RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET present → CONFIGURED
 *   - Otherwise → NOT_CONFIGURED
 *
 * Health is derived ONLY from PaymentWebhook records (last 24h):
 *   - DOWN:      >50% failure rate AND ≥5 events
 *   - DEGRADED:  5–50% failure rate AND ≥5 events
 *   - HEALTHY:   <5% failure rate AND ≥5 events
 *   - UNKNOWN:   <5 events (insufficient evidence)
 *
 * HEALTHY is NEVER claimed based on env var presence alone.
 */
export async function getProviderStatus(): Promise<ProviderStatusResult> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const providers: ProviderStatusEntry[] = [];

    // Stripe configuration
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const stripeConfigured = !!stripeKey && stripeKey.length > 0;

    // Razorpay configuration (both key id + secret required)
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET;
    const razorpayConfigured = !!razorpayKeyId && !!razorpayKeySecret;

    // Per-provider webhook evidence (last 24h) — DB-aggregated
    const [stripeEvidence, razorpayEvidence] = await Promise.all([
      Promise.all([
        db.paymentWebhook.count({
          where: { provider: 'stripe', receivedAt: { gte: twentyFourHoursAgo } },
        }),
        db.paymentWebhook.count({
          where: {
            provider: 'stripe',
            receivedAt: { gte: twentyFourHoursAgo },
            processed: false,
            processingError: { not: null },
          },
        }),
        db.paymentWebhook.findFirst({
          where: { provider: 'stripe' },
          orderBy: { receivedAt: 'desc' },
          select: { receivedAt: true },
        }),
        db.paymentWebhook.findFirst({
          where: {
            provider: 'stripe',
            processed: false,
            processingError: { not: null },
          },
          orderBy: { receivedAt: 'desc' },
          select: { receivedAt: true },
        }),
      ]),
      Promise.all([
        db.paymentWebhook.count({
          where: { provider: 'razorpay', receivedAt: { gte: twentyFourHoursAgo } },
        }),
        db.paymentWebhook.count({
          where: {
            provider: 'razorpay',
            receivedAt: { gte: twentyFourHoursAgo },
            processed: false,
            processingError: { not: null },
          },
        }),
        db.paymentWebhook.findFirst({
          where: { provider: 'razorpay' },
          orderBy: { receivedAt: 'desc' },
          select: { receivedAt: true },
        }),
        db.paymentWebhook.findFirst({
          where: {
            provider: 'razorpay',
            processed: false,
            processingError: { not: null },
          },
          orderBy: { receivedAt: 'desc' },
          select: { receivedAt: true },
        }),
      ]),
    ]);

    function deriveHealth(recent: number, failures: number): WebhookHealthState {
      if (recent < 5) return 'UNKNOWN';
      const rate = failures / recent;
      if (rate > 0.5) return 'DOWN';
      if (rate >= 0.05) return 'DEGRADED';
      return 'HEALTHY';
    }

    const stripeProvider: ProviderStatusEntry = {
      provider: 'stripe',
      configState: stripeConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      health: deriveHealth(stripeEvidence[0], stripeEvidence[1]),
      recentEvents: stripeEvidence[0],
      recentFailures: stripeEvidence[1],
      lastEventAt: stripeEvidence[2]?.receivedAt || null,
      lastFailureAt: stripeEvidence[3]?.receivedAt || null,
    };
    providers.push(stripeProvider);

    const razorpayProvider: ProviderStatusEntry = {
      provider: 'razorpay',
      configState: razorpayConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      health: deriveHealth(razorpayEvidence[0], razorpayEvidence[1]),
      recentEvents: razorpayEvidence[0],
      recentFailures: razorpayEvidence[1],
      lastEventAt: razorpayEvidence[2]?.receivedAt || null,
      lastFailureAt: razorpayEvidence[3]?.receivedAt || null,
    };
    providers.push(razorpayProvider);

    // Aggregate webhook health = worst-case across configured providers
    const configuredProviders = providers.filter(
      (p) => p.configState === 'CONFIGURED'
    );
    let aggregateHealth: WebhookHealthState;
    if (configuredProviders.length === 0) {
      aggregateHealth = 'UNKNOWN';
    } else if (configuredProviders.some((p) => p.health === 'DOWN')) {
      aggregateHealth = 'DOWN';
    } else if (configuredProviders.some((p) => p.health === 'DEGRADED')) {
      aggregateHealth = 'DEGRADED';
    } else if (configuredProviders.every((p) => p.health === 'HEALTHY')) {
      aggregateHealth = 'HEALTHY';
    } else {
      // Some providers have UNKNOWN health — surface UNKNOWN rather than
      // claiming HEALTHY based on the configured subset alone.
      aggregateHealth = 'UNKNOWN';
    }

    return { providers, webhookHealth: aggregateHealth };
  } catch (error) {
    console.error('[AdminBilling] Failed to get provider status:', error);
    return { providers: [], webhookHealth: 'UNKNOWN' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Format a period label for display.
 */
function formatPeriodLabel(date: Date, period: SubscriptionMetricsPeriod): string {
  const d = new Date(date);
  if (period === 'day') {
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }
  if (period === 'week') {
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - d.getDay());
    return `W${startOfWeek.toISOString().split('T')[0]}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get a period key from a date based on granularity.
 */
function getPeriodKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
  const d = new Date(date);
  if (granularity === 'day') {
    return d.toISOString().split('T')[0];
  }
  if (granularity === 'week') {
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - d.getDay());
    return `W${startOfWeek.toISOString().split('T')[0]}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
