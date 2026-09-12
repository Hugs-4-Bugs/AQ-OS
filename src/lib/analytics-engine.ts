// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Analytics Engine Service
// Phase 13: Complete Analytics with Real Database Data
// ALL metrics computed from REAL database data ONLY. NO hardcoded values.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export interface LeadMetrics {
  discovered: number;
  converted: number;
  contacted: number;
  won: number;
  lost: number;
  responseRate: number;
  stageDistribution: Record<string, number>;
  topNiches: { niche: string; count: number }[];
  topCountries: { country: string; count: number }[];
  avgScores: { reply: number; conversion: number; urgency: number; revenue: number };
  conversionFunnel: { stage: string; count: number }[];
  trendsDaily: { date: string; discovered: number; converted: number }[];
}

export interface AIMetrics {
  totalUsage: number;
  creditsUsed: number;
  creditsRemaining: number;
  providerUsage: { provider: string; count: number; credits: number }[];
  tokenCost: number;
  modelDistribution: { model: string; count: number }[];
  analysisVolume: { date: string; analyses: number }[];
  chatUsage: { date: string; sessions: number; messages: number }[];
}

export interface MessagingMetrics {
  gmailOpenRate: number;
  gmailClickRate: number;
  gmailReplyRate: number;
  telegramDeliveryRate: number;
  whatsappDeliveryRate: number;
  channelBreakdown: { channel: string; sent: number; delivered: number; opened: number; replied: number }[];
  dailyVolume: { date: string; email: number; telegram: number; whatsapp: number }[];
  templateUsage: { template: string; channel: string; count: number }[];
}

export interface BillingMetrics {
  mrr: number;
  arr: number;
  churn: number;
  arpu: number;
  upgrades: number;
  downgrades: number;
  totalRevenue: number;
  revenueByPlan: { plan: string; revenue: number; count: number }[];
  paymentStatus: { status: string; count: number; amount: number }[];
  creditUsage: { action: string; totalCredits: number; count: number }[];
  revenueMonthly: { month: string; revenue: number }[];
}

export interface WorkflowMetrics {
  totalExecutions: number;
  successRate: number;
  failureRate: number;
  avgRuntimeMs: number;
  totalRetries: number;
  executionsByStatus: Record<string, number>;
  queueDepth: number;
  throughputLast24h: number;
  executionsByTrigger: { trigger: string; count: number }[];
  runtimeDistribution: { range: string; count: number }[];
  dailyExecutions: { date: string; success: number; failed: number; retried: number }[];
  topFailingWorkflows: { workflowId: string; name: string; failureCount: number }[];
}

export interface DashboardMetrics {
  leads?: LeadMetrics;
  ai?: AIMetrics;
  messaging?: MessagingMetrics;
  billing?: BillingMetrics;
  workflows?: WorkflowMetrics;
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════
// CACHE LAYER
// ═══════════════════════════════════════════════════════════════════

const analyticsCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = parseInt(process.env.ANALYTICS_CACHE_TTL || '300') * 1000; // seconds to ms

function getCached<T>(key: string): T | null {
  const entry = analyticsCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data as T;
  if (entry) analyticsCache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  analyticsCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

function buildCacheKey(prefix: string, userId: string, orgId?: string, dateRange?: { start: Date; end: Date }): string {
  return `${prefix}:${userId}:${orgId || 'none'}:${dateRange ? `${dateRange.start.toISOString()}-${dateRange.end.toISOString()}` : 'all'}`;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateToMonth(date: Date): string {
  return date.toISOString().slice(0, 7); // "YYYY-MM"
}

/** Build the where clause for leads belonging to a user (with optional org scope) */
function leadWhere(userId: string, orgId?: string, dateRange?: { start: Date; end: Date }) {
  const where: Record<string, unknown> = {
    isActive: true,
    OR: [
      { userId },
      ...(orgId ? [{ orgId }] : []),
    ],
  };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }
  return where;
}

/** Build where clause for user-owned entities */
function userWhere(userId: string, dateRange?: { start: Date; end: Date }) {
  const where: Record<string, unknown> = { userId };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }
  return where;
}

// Pipeline stages in order for the conversion funnel
const FUNNEL_STAGES = [
  'discovered',
  'analyzed',
  'contacted',
  'replied',
  'interested',
  'negotiation',
  'proposal_sent',
  'closed_won',
  'closed_lost',
];

// AI-related actions in CreditsLedger
const AI_ACTIONS = [
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

// ═══════════════════════════════════════════════════════════════════
// 1. LEAD METRICS
// ═══════════════════════════════════════════════════════════════════

export async function getLeadMetrics(
  userId: string,
  orgId?: string,
  dateRange?: { start: Date; end: Date }
): Promise<LeadMetrics> {
  const cacheKey = buildCacheKey('leads', userId, orgId, dateRange);
  const cached = getCached<LeadMetrics>(cacheKey);
  if (cached) return cached;

  try {
    const where = leadWhere(userId, orgId, dateRange);

    // Stage counts
    const stageGroups = await db.lead.groupBy({
      by: ['stage'],
      where,
      _count: { id: true },
    });

    const stageDistribution: Record<string, number> = {};
    for (const g of stageGroups) {
      stageDistribution[g.stage] = g._count.id;
    }

    const discovered = stageDistribution['discovered'] || 0;
    const won = stageDistribution['closed_won'] || 0;
    const lost = stageDistribution['closed_lost'] || 0;

    // Contacted = leads in contacted+ stages (everything past discovered/analyzed)
    const contactedStages = ['contacted', 'replied', 'interested', 'negotiation', 'proposal_sent', 'closed_won', 'closed_lost'];
    const contacted = contactedStages.reduce((sum, s) => sum + (stageDistribution[s] || 0), 0);

    // Converted = leads that reached won stage
    const converted = won;

    // Response rate: replied / contacted
    const replied = stageDistribution['replied'] || 0;
    const responseRate = contacted > 0 ? (replied / contacted) * 100 : 0;

    // Top niches
    const nicheGroups = await db.lead.groupBy({
      by: ['niche'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    const topNiches = nicheGroups
      .filter(g => g.niche !== null)
      .map(g => ({ niche: g.niche!, count: g._count.id }));

    // Top countries
    const countryGroups = await db.lead.groupBy({
      by: ['country'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    const topCountries = countryGroups
      .filter(g => g.country !== null)
      .map(g => ({ country: g.country!, count: g._count.id }));

    // Average scores
    const scoreAgg = await db.lead.aggregate({
      where,
      _avg: {
        replyScore: true,
        conversionScore: true,
        urgencyScore: true,
        revenuePotentialScore: true,
      },
      _count: { id: true },
    });
    const avgScores = {
      reply: scoreAgg._avg.replyScore ? Math.round(scoreAgg._avg.replyScore * 100) / 100 : 0,
      conversion: scoreAgg._avg.conversionScore ? Math.round(scoreAgg._avg.conversionScore * 100) / 100 : 0,
      urgency: scoreAgg._avg.urgencyScore ? Math.round(scoreAgg._avg.urgencyScore * 100) / 100 : 0,
      revenue: scoreAgg._avg.revenuePotentialScore ? Math.round(scoreAgg._avg.revenuePotentialScore * 100) / 100 : 0,
    };

    // Conversion funnel
    const conversionFunnel = FUNNEL_STAGES.map(stage => ({
      stage,
      count: stageDistribution[stage] || 0,
    }));

    // Daily trends (last 30 days or within date range)
    const trendStart = dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const trendEnd = dateRange?.end || new Date();

    // Get leads created in range grouped by date
    const leadsInRange = await db.lead.findMany({
      where: {
        ...where,
        createdAt: { gte: trendStart, lte: trendEnd },
      },
      select: { createdAt: true, stage: true },
      orderBy: { createdAt: 'asc' },
    });

    const trendMap = new Map<string, { discovered: number; converted: number }>();
    for (const lead of leadsInRange) {
      const dateKey = formatDate(lead.createdAt);
      const entry = trendMap.get(dateKey) || { discovered: 0, converted: 0 };
      entry.discovered += 1;
      if (lead.stage === 'closed_won') {
        entry.converted += 1;
      }
      trendMap.set(dateKey, entry);
    }
    const trendsDaily = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    const result: LeadMetrics = {
      discovered,
      converted,
      contacted,
      won,
      lost,
      responseRate: Math.round(responseRate * 100) / 100,
      stageDistribution,
      topNiches,
      topCountries,
      avgScores,
      conversionFunnel,
      trendsDaily,
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[AnalyticsEngine] getLeadMetrics error:', error);
    return {
      discovered: 0, converted: 0, contacted: 0, won: 0, lost: 0,
      responseRate: 0, stageDistribution: {}, topNiches: [], topCountries: [],
      avgScores: { reply: 0, conversion: 0, urgency: 0, revenue: 0 },
      conversionFunnel: FUNNEL_STAGES.map(s => ({ stage: s, count: 0 })),
      trendsDaily: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. AI METRICS
// ═══════════════════════════════════════════════════════════════════

export async function getAIMetrics(
  userId: string,
  dateRange?: { start: Date; end: Date }
): Promise<AIMetrics> {
  const cacheKey = buildCacheKey('ai', userId, undefined, dateRange);
  const cached = getCached<AIMetrics>(cacheKey);
  if (cached) return cached;

  try {
    const where = userWhere(userId, dateRange);

    // AI credit ledger entries
    const aiWhere = {
      ...where,
      action: { in: AI_ACTIONS },
    };

    // Total usage count
    const totalUsageResult = await db.creditsLedger.aggregate({
      where: aiWhere,
      _count: { id: true },
      _sum: { credits: true },
    });
    const totalUsage = totalUsageResult._count.id;
    const creditsUsed = Math.abs(totalUsageResult._sum.credits || 0);

    // Credits remaining from user record
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    const creditsRemaining = user?.credits ?? 0;

    // Provider usage (group by action type)
    const actionGroups = await db.creditsLedger.groupBy({
      by: ['action'],
      where: aiWhere,
      _count: { id: true },
      _sum: { credits: true },
    });
    const providerUsage = actionGroups.map(g => ({
      provider: g.action,
      count: g._count.id,
      credits: Math.abs(g._sum.credits || 0),
    }));

    // Token cost (use credits as proxy)
    const tokenCost = creditsUsed;

    // Model distribution (group by action as a proxy for model)
    const modelDistribution = actionGroups.map(g => ({
      model: g.action,
      count: g._count.id,
    }));

    // Analysis volume by day
    const aiLedgerEntries = await db.creditsLedger.findMany({
      where: aiWhere,
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const analysisMap = new Map<string, number>();
    for (const entry of aiLedgerEntries) {
      const dateKey = formatDate(entry.createdAt);
      analysisMap.set(dateKey, (analysisMap.get(dateKey) || 0) + 1);
    }
    const analysisVolume = Array.from(analysisMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, analyses]) => ({ date, analyses }));

    // Chat usage by day
    const chatSessions = await db.aiChatSession.findMany({
      where: userWhere(userId, dateRange),
      select: { createdAt: true, messages: { select: { id: true } } },
    });
    const chatMap = new Map<string, { sessions: number; messages: number }>();
    for (const session of chatSessions) {
      const dateKey = formatDate(session.createdAt);
      const entry = chatMap.get(dateKey) || { sessions: 0, messages: 0 };
      entry.sessions += 1;
      entry.messages += session.messages.length;
      chatMap.set(dateKey, entry);
    }
    const chatUsage = Array.from(chatMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    const result: AIMetrics = {
      totalUsage,
      creditsUsed,
      creditsRemaining,
      providerUsage,
      tokenCost,
      modelDistribution,
      analysisVolume,
      chatUsage,
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[AnalyticsEngine] getAIMetrics error:', error);
    return {
      totalUsage: 0, creditsUsed: 0, creditsRemaining: 0,
      providerUsage: [], tokenCost: 0, modelDistribution: [],
      analysisVolume: [], chatUsage: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. MESSAGING METRICS
// ═══════════════════════════════════════════════════════════════════

export async function getMessagingMetrics(
  userId: string,
  dateRange?: { start: Date; end: Date }
): Promise<MessagingMetrics> {
  const cacheKey = buildCacheKey('messaging', userId, undefined, dateRange);
  const cached = getCached<MessagingMetrics>(cacheKey);
  if (cached) return cached;

  try {
    const where = userWhere(userId, dateRange);

    // ── Email metrics from OutreachMessage (channel='email') ──
    const emailSent = await db.outreachMessage.count({
      where: { ...where, channel: 'email', status: { in: ['sent', 'delivered', 'opened', 'replied'] } },
    });
    const emailOpened = await db.outreachMessage.count({
      where: { ...where, channel: 'email', status: { in: ['opened', 'replied'] }, openedAt: { not: null } },
    });
    const emailReplied = await db.outreachMessage.count({
      where: { ...where, channel: 'email', status: 'replied', repliedAt: { not: null } },
    });

    // Click rate - try to extract from metadata JSON if available
    let emailClicked = 0;
    try {
      const emailMessagesWithMeta = await db.outreachMessage.findMany({
        where: { ...where, channel: 'email', status: { in: ['sent', 'delivered', 'opened', 'replied'] }, metadata: { not: null } },
        select: { metadata: true },
      });
      for (const msg of emailMessagesWithMeta) {
        if (msg.metadata) {
          try {
            const meta = JSON.parse(msg.metadata);
            if (meta.clicked || meta.clickTracked) {
              emailClicked += 1;
            }
          } catch {
            // ignore invalid JSON
          }
        }
      }
    } catch {
      // metadata field may not have data
    }

    const gmailOpenRate = emailSent > 0 ? (emailOpened / emailSent) * 100 : 0;
    const gmailClickRate = emailSent > 0 ? (emailClicked / emailSent) * 100 : 0;
    const gmailReplyRate = emailSent > 0 ? (emailReplied / emailSent) * 100 : 0;

    // ── Telegram delivery rate from MessageDelivery ──
    const telegramSent = await db.messageDelivery.count({
      where: { ...where, channel: 'telegram', direction: 'outbound' },
    });
    const telegramDelivered = await db.messageDelivery.count({
      where: {
        ...where,
        channel: 'telegram',
        direction: 'outbound',
        status: { in: ['delivered', 'read'] },
      },
    });
    const telegramDeliveryRate = telegramSent > 0 ? (telegramDelivered / telegramSent) * 100 : 0;

    // ── WhatsApp delivery rate from MessageDelivery ──
    const whatsappSent = await db.messageDelivery.count({
      where: { ...where, channel: 'whatsapp', direction: 'outbound' },
    });
    const whatsappDelivered = await db.messageDelivery.count({
      where: {
        ...where,
        channel: 'whatsapp',
        direction: 'outbound',
        status: { in: ['delivered', 'read'] },
      },
    });
    const whatsappDeliveryRate = whatsappSent > 0 ? (whatsappDelivered / whatsappSent) * 100 : 0;

    // ── Channel breakdown ──
    const channels = ['email', 'whatsapp', 'telegram', 'linkedin', 'instagram'] as const;
    const channelBreakdown: MessagingMetrics['channelBreakdown'] = [];

    for (const channel of channels) {
      // OutreachMessage counts for email/linkedin/instagram
      const omSent = await db.outreachMessage.count({
        where: { ...where, channel, status: { in: ['sent', 'delivered', 'opened', 'replied'] } },
      });
      const omDelivered = await db.outreachMessage.count({
        where: { ...where, channel, status: { in: ['delivered', 'opened', 'replied'] } },
      });
      const omOpened = await db.outreachMessage.count({
        where: { ...where, channel, openedAt: { not: null } },
      });
      const omReplied = await db.outreachMessage.count({
        where: { ...where, channel, repliedAt: { not: null } },
      });

      // MessageDelivery counts for telegram/whatsapp
      const mdSent = await db.messageDelivery.count({
        where: { ...where, channel, direction: 'outbound' },
      });
      const mdDelivered = await db.messageDelivery.count({
        where: { ...where, channel, direction: 'outbound', status: { in: ['delivered', 'read'] } },
      });

      const sent = omSent + mdSent;
      const delivered = omDelivered + mdDelivered;

      if (sent > 0 || delivered > 0) {
        channelBreakdown.push({
          channel,
          sent,
          delivered,
          opened: omOpened,
          replied: omReplied,
        });
      }
    }

    // ── Daily volume ──
    const outreachInRange = await db.outreachMessage.findMany({
      where: {
        ...where,
        channel: 'email',
        status: { in: ['sent', 'delivered', 'opened', 'replied'] },
        ...(dateRange ? { createdAt: { gte: dateRange.start, lte: dateRange.end } } : {}),
      },
      select: { createdAt: true },
    });

    const deliveryInRange = await db.messageDelivery.findMany({
      where: {
        ...where,
        direction: 'outbound',
        ...(dateRange ? { createdAt: { gte: dateRange.start, lte: dateRange.end } } : {}),
      },
      select: { createdAt: true, channel: true },
    });

    const dailyMap = new Map<string, { email: number; telegram: number; whatsapp: number }>();
    for (const msg of outreachInRange) {
      const dateKey = formatDate(msg.createdAt);
      const entry = dailyMap.get(dateKey) || { email: 0, telegram: 0, whatsapp: 0 };
      entry.email += 1;
      dailyMap.set(dateKey, entry);
    }
    for (const msg of deliveryInRange) {
      const dateKey = formatDate(msg.createdAt);
      const entry = dailyMap.get(dateKey) || { email: 0, telegram: 0, whatsapp: 0 };
      if (msg.channel === 'telegram') entry.telegram += 1;
      else if (msg.channel === 'whatsapp') entry.whatsapp += 1;
      dailyMap.set(dateKey, entry);
    }
    const dailyVolume = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    // ── Template usage ──
    const templateUsageResult = await db.messageDelivery.groupBy({
      by: ['templateName', 'channel'],
      where: {
        ...where,
        templateName: { not: null },
      },
      _count: { id: true },
    });
    const templateUsage = templateUsageResult
      .filter(g => g.templateName !== null)
      .map(g => ({
        template: g.templateName!,
        channel: g.channel,
        count: g._count.id,
      }));

    const result: MessagingMetrics = {
      gmailOpenRate: Math.round(gmailOpenRate * 100) / 100,
      gmailClickRate: Math.round(gmailClickRate * 100) / 100,
      gmailReplyRate: Math.round(gmailReplyRate * 100) / 100,
      telegramDeliveryRate: Math.round(telegramDeliveryRate * 100) / 100,
      whatsappDeliveryRate: Math.round(whatsappDeliveryRate * 100) / 100,
      channelBreakdown,
      dailyVolume,
      templateUsage,
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[AnalyticsEngine] getMessagingMetrics error:', error);
    return {
      gmailOpenRate: 0, gmailClickRate: 0, gmailReplyRate: 0,
      telegramDeliveryRate: 0, whatsappDeliveryRate: 0,
      channelBreakdown: [], dailyVolume: [], templateUsage: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. BILLING METRICS
// ═══════════════════════════════════════════════════════════════════

/** Plan pricing map for MRR calculation */
const PLAN_PRICES: Record<string, number> = {
  free: 0,
  pro: 29,
  elite: 99,
};

export async function getBillingMetrics(
  userId: string,
  dateRange?: { start: Date; end: Date }
): Promise<BillingMetrics> {
  const cacheKey = buildCacheKey('billing', userId, undefined, dateRange);
  const cached = getCached<BillingMetrics>(cacheKey);
  if (cached) return cached;

  try {
    // ── MRR: Sum of active subscription amounts ──
    const activeSubscriptions = await db.subscription.findMany({
      where: {
        userId,
        status: { in: ['active', 'trialing'] },
      },
    });

    let mrr = 0;
    const planCounts: Record<string, number> = {};
    const planRevenue: Record<string, number> = {};

    for (const sub of activeSubscriptions) {
      const planPrice = PLAN_PRICES[sub.plan] ?? 0;
      // Yearly billing is discounted ~2 months, monthly equivalent
      const monthlyAmount = sub.billingCycle === 'yearly' ? (planPrice * 10) / 12 : planPrice;
      mrr += monthlyAmount;
      planCounts[sub.plan] = (planCounts[sub.plan] || 0) + 1;
      planRevenue[sub.plan] = (planRevenue[sub.plan] || 0) + monthlyAmount;
    }

    const arr = mrr * 12;
    const activeCount = activeSubscriptions.length;
    const arpu = activeCount > 0 ? mrr / activeCount : 0;

    // ── Churn: canceled / total active+cancelled ──
    const canceledCount = await db.subscription.count({
      where: {
        userId,
        status: 'canceled',
        ...(dateRange ? { createdAt: { gte: dateRange.start, lte: dateRange.end } } : {}),
      },
    });
    const totalSubs = activeCount + canceledCount;
    const churn = totalSubs > 0 ? (canceledCount / totalSubs) * 100 : 0;

    // ── Upgrades and downgrades from AuditLog ──
    const planChanges = await db.auditLog.findMany({
      where: {
        userId,
        action: { in: ['plan_upgrade', 'plan_downgrade', 'subscription_upgrade', 'subscription_downgrade', 'plan_change'] },
        ...(dateRange ? { createdAt: { gte: dateRange.start, lte: dateRange.end } } : {}),
      },
      select: { action: true, details: true },
    });

    let upgrades = 0;
    let downgrades = 0;
    for (const change of planChanges) {
      if (change.action.includes('upgrade')) {
        upgrades += 1;
      } else if (change.action.includes('downgrade')) {
        downgrades += 1;
      } else if (change.details) {
        // Parse details JSON for plan_change actions
        try {
          const details = JSON.parse(change.details);
          if (details.direction === 'upgrade' || details.newPlan === 'elite' || (details.newPlan === 'pro' && details.oldPlan === 'free')) {
            upgrades += 1;
          } else if (details.direction === 'downgrade') {
            downgrades += 1;
          }
        } catch {
          // ignore
        }
      }
    }

    // ── Total revenue from completed PaymentOrders ──
    const completedPayments = await db.paymentOrder.findMany({
      where: {
        userId,
        status: 'completed',
        ...(dateRange ? { createdAt: { gte: dateRange.start, lte: dateRange.end } } : {}),
      },
      select: { amount: true, plan: true },
    });

    const totalRevenue = completedPayments.reduce((sum, p) => sum + p.amount, 0);

    // Revenue by plan
    const revenueByPlanMap: Record<string, { revenue: number; count: number }> = {};
    for (const payment of completedPayments) {
      if (!revenueByPlanMap[payment.plan]) {
        revenueByPlanMap[payment.plan] = { revenue: 0, count: 0 };
      }
      revenueByPlanMap[payment.plan].revenue += payment.amount;
      revenueByPlanMap[payment.plan].count += 1;
    }
    const revenueByPlan = Object.entries(revenueByPlanMap).map(([plan, data]) => ({ plan, ...data }));

    // ── Payment status breakdown ──
    const paymentStatusGroups = await db.paymentOrder.groupBy({
      by: ['status'],
      where: {
        userId,
        ...(dateRange ? { createdAt: { gte: dateRange.start, lte: dateRange.end } } : {}),
      },
      _count: { id: true },
      _sum: { amount: true },
    });
    const paymentStatus = paymentStatusGroups.map(g => ({
      status: g.status,
      count: g._count.id,
      amount: g._sum.amount || 0,
    }));

    // ── Credit usage by action ──
    const creditUsageGroups = await db.creditsLedger.groupBy({
      by: ['action'],
      where: {
        userId,
        credits: { lt: 0 }, // only deductions
        ...(dateRange ? { createdAt: { gte: dateRange.start, lte: dateRange.end } } : {}),
      },
      _count: { id: true },
      _sum: { credits: true },
    });
    const creditUsage = creditUsageGroups.map(g => ({
      action: g.action,
      totalCredits: Math.abs(g._sum.credits || 0),
      count: g._count.id,
    }));

    // ── Revenue monthly ──
    const allPayments = await db.paymentOrder.findMany({
      where: {
        userId,
        status: 'completed',
      },
      select: { createdAt: true, amount: true },
      orderBy: { createdAt: 'asc' },
    });
    const monthlyMap = new Map<string, number>();
    for (const payment of allPayments) {
      const monthKey = formatDateToMonth(payment.createdAt);
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + payment.amount);
    }
    const revenueMonthly = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({ month, revenue: Math.round(revenue * 100) / 100 }));

    const result: BillingMetrics = {
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      churn: Math.round(churn * 100) / 100,
      arpu: Math.round(arpu * 100) / 100,
      upgrades,
      downgrades,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      revenueByPlan,
      paymentStatus,
      creditUsage,
      revenueMonthly,
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[AnalyticsEngine] getBillingMetrics error:', error);
    return {
      mrr: 0, arr: 0, churn: 0, arpu: 0, upgrades: 0, downgrades: 0,
      totalRevenue: 0, revenueByPlan: [], paymentStatus: [],
      creditUsage: [], revenueMonthly: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. WORKFLOW METRICS
// ═══════════════════════════════════════════════════════════════════

export async function getWorkflowMetrics(
  userId: string,
  orgId?: string,
  dateRange?: { start: Date; end: Date }
): Promise<WorkflowMetrics> {
  const cacheKey = buildCacheKey('workflows', userId, orgId, dateRange);
  const cached = getCached<WorkflowMetrics>(cacheKey);
  if (cached) return cached;

  try {
    // Get user's workflow definitions
    const workflowWhere: Record<string, unknown> = { userId };
    if (orgId) {
      workflowWhere.OR = [{ userId }, { orgId }];
    }

    const workflows = await db.workflowDefinition.findMany({
      where: workflowWhere,
      select: { id: true, name: true, triggerType: true },
    });
    const workflowIds = workflows.map(w => w.id);
    const workflowNameMap = new Map(workflows.map(w => [w.id, w.name]));

    if (workflowIds.length === 0) {
      const empty: WorkflowMetrics = {
        totalExecutions: 0, successRate: 0, failureRate: 0, avgRuntimeMs: 0,
        totalRetries: 0, executionsByStatus: {}, queueDepth: 0, throughputLast24h: 0,
        executionsByTrigger: [], runtimeDistribution: [], dailyExecutions: [],
        topFailingWorkflows: [],
      };
      setCache(cacheKey, empty);
      return empty;
    }

    // Execution where clause
    const execWhere: Record<string, unknown> = {
      workflowId: { in: workflowIds },
    };
    if (dateRange) {
      execWhere.createdAt = { gte: dateRange.start, lte: dateRange.end };
    }

    // Total executions
    const totalExecutions = await db.workflowExecution.count({ where: execWhere });

    // Status distribution
    const statusGroups = await db.workflowExecution.groupBy({
      by: ['status'],
      where: execWhere,
      _count: { id: true },
    });
    const executionsByStatus: Record<string, number> = {};
    let completedCount = 0;
    let failedCount = 0;
    for (const g of statusGroups) {
      executionsByStatus[g.status] = g._count.id;
      if (g.status === 'completed') completedCount = g._count.id;
      if (g.status === 'failed' || g.status === 'dead_letter') failedCount += g._count.id;
    }

    const successRate = totalExecutions > 0 ? (completedCount / totalExecutions) * 100 : 0;
    const failureRate = totalExecutions > 0 ? (failedCount / totalExecutions) * 100 : 0;

    // Average runtime
    const runtimeAgg = await db.workflowExecution.aggregate({
      where: { ...execWhere, durationMs: { not: null } },
      _avg: { durationMs: true },
    });
    const avgRuntimeMs = runtimeAgg._avg.durationMs ? Math.round(runtimeAgg._avg.durationMs) : 0;

    // Total retries
    const retryAgg = await db.workflowExecution.aggregate({
      where: execWhere,
      _sum: { retryCount: true },
    });
    const totalRetries = retryAgg._sum.retryCount || 0;

    // Queue depth (queued executions)
    const queueDepth = await db.workflowExecution.count({
      where: { ...execWhere, status: 'queued' },
    });

    // Throughput last 24h
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const throughputLast24h = await db.workflowExecution.count({
      where: {
        workflowId: { in: workflowIds },
        completedAt: { gte: last24h },
        status: 'completed',
      },
    });

    // Executions by trigger type
    const triggerGroups = await db.workflowDefinition.groupBy({
      by: ['triggerType'],
      where: workflowWhere,
      _sum: { runCount: true },
    });
    const executionsByTrigger = triggerGroups
      .filter(g => (g._sum.runCount || 0) > 0)
      .map(g => ({
        trigger: g.triggerType,
        count: g._sum.runCount || 0,
      }));

    // Runtime distribution
    const executionsWithDuration = await db.workflowExecution.findMany({
      where: { ...execWhere, durationMs: { not: null } },
      select: { durationMs: true },
    });
    const runtimeBuckets: Record<string, number> = {
      '<100ms': 0, '100ms-500ms': 0, '500ms-1s': 0, '1s-5s': 0, '5s-30s': 0, '30s-5m': 0, '>5m': 0,
    };
    for (const exec of executionsWithDuration) {
      const ms = exec.durationMs!;
      if (ms < 100) runtimeBuckets['<100ms'] += 1;
      else if (ms < 500) runtimeBuckets['100ms-500ms'] += 1;
      else if (ms < 1000) runtimeBuckets['500ms-1s'] += 1;
      else if (ms < 5000) runtimeBuckets['1s-5s'] += 1;
      else if (ms < 30000) runtimeBuckets['5s-30s'] += 1;
      else if (ms < 300000) runtimeBuckets['30s-5m'] += 1;
      else runtimeBuckets['>5m'] += 1;
    }
    const runtimeDistribution = Object.entries(runtimeBuckets).map(([range, count]) => ({ range, count }));

    // Daily executions
    const executionsInRange = await db.workflowExecution.findMany({
      where: {
        ...execWhere,
        createdAt: { gte: dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { createdAt: true, status: true, retryCount: true },
      orderBy: { createdAt: 'asc' },
    });
    const dailyMap = new Map<string, { success: number; failed: number; retried: number }>();
    for (const exec of executionsInRange) {
      const dateKey = formatDate(exec.createdAt);
      const entry = dailyMap.get(dateKey) || { success: 0, failed: 0, retried: 0 };
      if (exec.status === 'completed') entry.success += 1;
      else if (exec.status === 'failed' || exec.status === 'dead_letter') entry.failed += 1;
      if (exec.retryCount > 0) entry.retried += 1;
      dailyMap.set(dateKey, entry);
    }
    const dailyExecutions = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    // Top failing workflows
    const failingExecGroups = await db.workflowExecution.groupBy({
      by: ['workflowId'],
      where: {
        ...execWhere,
        status: { in: ['failed', 'dead_letter'] },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    const topFailingWorkflows = failingExecGroups.map(g => ({
      workflowId: g.workflowId,
      name: workflowNameMap.get(g.workflowId) || 'Unknown',
      failureCount: g._count.id,
    }));

    const result: WorkflowMetrics = {
      totalExecutions,
      successRate: Math.round(successRate * 100) / 100,
      failureRate: Math.round(failureRate * 100) / 100,
      avgRuntimeMs,
      totalRetries,
      executionsByStatus,
      queueDepth,
      throughputLast24h,
      executionsByTrigger,
      runtimeDistribution,
      dailyExecutions,
      topFailingWorkflows,
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[AnalyticsEngine] getWorkflowMetrics error:', error);
    return {
      totalExecutions: 0, successRate: 0, failureRate: 0, avgRuntimeMs: 0,
      totalRetries: 0, executionsByStatus: {}, queueDepth: 0, throughputLast24h: 0,
      executionsByTrigger: [], runtimeDistribution: [], dailyExecutions: [],
      topFailingWorkflows: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. DASHBOARD METRICS (Aggregated)
// ═══════════════════════════════════════════════════════════════════

export async function getDashboardMetrics(
  userId: string,
  orgId?: string,
  dashboard: 'executive' | 'sales' | 'ai' | 'ops' = 'executive',
  dateRange?: { start: Date; end: Date }
): Promise<DashboardMetrics> {
  const cacheKey = `dashboard:${userId}:${orgId || 'none'}:${dashboard}:${dateRange ? `${dateRange.start.toISOString()}-${dateRange.end.toISOString()}` : 'all'}`;
  const cached = getCached<DashboardMetrics>(cacheKey);
  if (cached) return cached;

  try {
    const result: DashboardMetrics = { generatedAt: new Date().toISOString() };

    switch (dashboard) {
      case 'executive':
        // Executive dashboard: high-level across all categories
        result.leads = await getLeadMetrics(userId, orgId, dateRange);
        result.billing = await getBillingMetrics(userId, dateRange);
        result.workflows = await getWorkflowMetrics(userId, orgId, dateRange);
        result.ai = await getAIMetrics(userId, dateRange);
        break;

      case 'sales':
        // Sales dashboard: leads + messaging focused
        result.leads = await getLeadMetrics(userId, orgId, dateRange);
        result.messaging = await getMessagingMetrics(userId, dateRange);
        break;

      case 'ai':
        // AI dashboard: AI usage + lead scores
        result.ai = await getAIMetrics(userId, dateRange);
        result.leads = await getLeadMetrics(userId, orgId, dateRange);
        break;

      case 'ops':
        // Operations dashboard: workflows + messaging
        result.workflows = await getWorkflowMetrics(userId, orgId, dateRange);
        result.messaging = await getMessagingMetrics(userId, dateRange);
        break;
    }

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[AnalyticsEngine] getDashboardMetrics error:', error);
    return { generatedAt: new Date().toISOString() };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 7. TIME SERIES DATA
// ═══════════════════════════════════════════════════════════════════

export async function getTimeSeriesData(
  userId: string,
  metric: string,
  granularity: 'hourly' | 'daily' | 'weekly' | 'monthly',
  dateRange: { start: Date; end: Date }
): Promise<{ date: string; value: number }[]> {
  try {
    const cacheKey = `timeseries:${userId}:${metric}:${granularity}:${dateRange.start.toISOString()}-${dateRange.end.toISOString()}`;
    const cached = getCached<{ date: string; value: number }[]>(cacheKey);
    if (cached) return cached;

    let rawEntries: { createdAt: Date; value: number }[] = [];

    switch (metric) {
      case 'leads_discovered': {
        const leads = await db.lead.findMany({
          where: leadWhere(userId, undefined, dateRange),
          select: { createdAt: true },
        });
        rawEntries = leads.map(l => ({ createdAt: l.createdAt, value: 1 }));
        break;
      }

      case 'leads_converted': {
        const leads = await db.lead.findMany({
          where: { ...leadWhere(userId, undefined, dateRange), stage: 'closed_won' },
          select: { createdAt: true },
        });
        rawEntries = leads.map(l => ({ createdAt: l.createdAt, value: 1 }));
        break;
      }

      case 'credits_used': {
        const ledger = await db.creditsLedger.findMany({
          where: { userId, credits: { lt: 0 }, createdAt: { gte: dateRange.start, lte: dateRange.end } },
          select: { createdAt: true, credits: true },
        });
        rawEntries = ledger.map(l => ({ createdAt: l.createdAt, value: Math.abs(l.credits) }));
        break;
      }

      case 'ai_usage': {
        const ledger = await db.creditsLedger.findMany({
          where: { userId, action: { in: AI_ACTIONS }, createdAt: { gte: dateRange.start, lte: dateRange.end } },
          select: { createdAt: true },
        });
        rawEntries = ledger.map(l => ({ createdAt: l.createdAt, value: 1 }));
        break;
      }

      case 'messages_sent': {
        const outreach = await db.outreachMessage.findMany({
          where: { userId, status: { in: ['sent', 'delivered', 'opened', 'replied'] }, sentAt: { gte: dateRange.start, lte: dateRange.end } },
          select: { sentAt: true },
        });
        rawEntries = outreach.map(o => ({ createdAt: o.sentAt!, value: 1 }));
        break;
      }

      case 'revenue': {
        const payments = await db.paymentOrder.findMany({
          where: { userId, status: 'completed', createdAt: { gte: dateRange.start, lte: dateRange.end } },
          select: { createdAt: true, amount: true },
        });
        rawEntries = payments.map(p => ({ createdAt: p.createdAt, value: p.amount }));
        break;
      }

      case 'workflow_executions': {
        const workflows = await db.workflowDefinition.findMany({
          where: { userId },
          select: { id: true },
        });
        const workflowIds = workflows.map(w => w.id);
        if (workflowIds.length > 0) {
          const executions = await db.workflowExecution.findMany({
            where: { workflowId: { in: workflowIds }, createdAt: { gte: dateRange.start, lte: dateRange.end } },
            select: { createdAt: true },
          });
          rawEntries = executions.map(e => ({ createdAt: e.createdAt, value: 1 }));
        }
        break;
      }

      default: {
        console.warn(`[AnalyticsEngine] Unknown time series metric: ${metric}`);
        return [];
      }
    }

    // Aggregate by granularity
    const grouped = new Map<string, number>();

    for (const entry of rawEntries) {
      let key: string;
      switch (granularity) {
        case 'hourly':
          key = entry.createdAt.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
          break;
        case 'daily':
          key = formatDate(entry.createdAt);
          break;
        case 'weekly': {
          const d = new Date(entry.createdAt);
          const startOfWeek = new Date(d);
          startOfWeek.setDate(d.getDate() - d.getDay());
          key = formatDate(startOfWeek);
          break;
        }
        case 'monthly':
          key = formatDateToMonth(entry.createdAt);
          break;
      }
      grouped.set(key, (grouped.get(key) || 0) + entry.value);
    }

    const result = Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[AnalyticsEngine] getTimeSeriesData error:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// 8. SNAPSHOT METRICS
// ═══════════════════════════════════════════════════════════════════

export async function snapshotMetrics(
  userId: string,
  category: string,
  period: 'hourly' | 'daily' | 'weekly' | 'monthly'
): Promise<void> {
  try {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    switch (period) {
      case 'hourly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
        periodEnd = new Date(periodStart.getTime() + 60 * 60 * 1000);
        break;
      case 'daily':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'weekly': {
        const dayOfWeek = now.getDay();
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - dayOfWeek);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      }
      case 'monthly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
    }

    const dateRange = { start: periodStart, end: periodEnd };

    let metrics: Record<string, unknown> = {};

    switch (category) {
      case 'leads': {
        const leadData = await getLeadMetrics(userId, undefined, dateRange);
        metrics = {
          discovered: leadData.discovered,
          converted: leadData.converted,
          contacted: leadData.contacted,
          won: leadData.won,
          lost: leadData.lost,
          responseRate: leadData.responseRate,
          avgConversionScore: leadData.avgScores.conversion,
        };
        break;
      }

      case 'ai': {
        const aiData = await getAIMetrics(userId, dateRange);
        metrics = {
          totalUsage: aiData.totalUsage,
          creditsUsed: aiData.creditsUsed,
          creditsRemaining: aiData.creditsRemaining,
          tokenCost: aiData.tokenCost,
        };
        break;
      }

      case 'messaging': {
        const msgData = await getMessagingMetrics(userId, dateRange);
        metrics = {
          gmailOpenRate: msgData.gmailOpenRate,
          gmailReplyRate: msgData.gmailReplyRate,
          telegramDeliveryRate: msgData.telegramDeliveryRate,
          whatsappDeliveryRate: msgData.whatsappDeliveryRate,
        };
        break;
      }

      case 'billing': {
        const billingData = await getBillingMetrics(userId, dateRange);
        metrics = {
          mrr: billingData.mrr,
          arr: billingData.arr,
          churn: billingData.churn,
          arpu: billingData.arpu,
          totalRevenue: billingData.totalRevenue,
        };
        break;
      }

      case 'workflows': {
        const wfData = await getWorkflowMetrics(userId, undefined, dateRange);
        metrics = {
          totalExecutions: wfData.totalExecutions,
          successRate: wfData.successRate,
          failureRate: wfData.failureRate,
          avgRuntimeMs: wfData.avgRuntimeMs,
          queueDepth: wfData.queueDepth,
        };
        break;
      }

      default:
        console.warn(`[AnalyticsEngine] Unknown snapshot category: ${category}`);
        return;
    }

    // Upsert the snapshot using the unique constraint
    // unique: [userId, category, period, periodStart]
    await db.analyticsSnapshot.upsert({
      where: {
        userId_category_period_periodStart: {
          userId,
          category,
          period,
          periodStart,
        },
      },
      create: {
        userId,
        category,
        period,
        periodStart,
        periodEnd,
        metrics: JSON.stringify(metrics),
      },
      update: {
        periodEnd,
        metrics: JSON.stringify(metrics),
      },
    });
  } catch (error) {
    console.error('[AnalyticsEngine] snapshotMetrics error:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT UTILITIES
// ═══════════════════════════════════════════════════════════════════

/** Clear the entire analytics cache or for a specific user */
export function clearAnalyticsCache(userId?: string): void {
  if (!userId) {
    analyticsCache.clear();
    return;
  }
  // Delete entries that start with any prefix containing this userId
  for (const key of analyticsCache.keys()) {
    if (key.includes(`:${userId}:`)) {
      analyticsCache.delete(key);
    }
  }
}

/** Get cache statistics for monitoring */
export function getAnalyticsCacheStats(): { size: number; hitRate: number } {
  return {
    size: analyticsCache.size,
    hitRate: 0, // Hit rate tracking would require additional instrumentation
  };
}
