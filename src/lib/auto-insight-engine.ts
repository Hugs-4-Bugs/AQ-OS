// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Auto Insight Engine
// Generates REAL insights from REAL database data ONLY.
// NO hardcoded text. NO static insights.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── Types ────────────────────────────────────────────────────────────

interface InsightData {
  category: string;       // lead, ai, billing, workflow, competitor
  insightType: string;    // trend, anomaly, opportunity, risk, recommendation
  title: string;
  description: string;
  impact: string;         // low, medium, high
  metricName?: string;
  metricBefore?: number;
  metricAfter?: number;
  changePercent?: number;
  dataSource?: string;
  isActionable: boolean;
  actionSuggestion?: string;
  validUntil: Date;
}

// ── Helpers ──────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function defaultValidUntil(): Date {
  return daysAgo(-7); // 7 days in the future
}

function computeChangePercent(before: number, after: number): number {
  if (before === 0) return after > 0 ? 100 : 0;
  return Math.round(((after - before) / before) * 10000) / 100;
}

function impactFromChange(pct: number): string {
  const abs = Math.abs(pct);
  if (abs >= 30) return 'high';
  if (abs >= 15) return 'medium';
  return 'low';
}

async function storeInsight(userId: string, orgId: string | null, data: InsightData): Promise<void> {
  // Avoid duplicate insight: same userId + category + insightType + title within last 24h
  const existing = await db.analyticsInsight.findFirst({
    where: {
      userId,
      category: data.category,
      insightType: data.insightType,
      title: data.title,
      createdAt: { gte: daysAgo(1) },
    },
  });
  if (existing) return;

  await db.analyticsInsight.create({
    data: {
      userId,
      orgId,
      category: data.category,
      insightType: data.insightType,
      title: data.title,
      description: data.description,
      impact: data.impact,
      metricName: data.metricName,
      metricBefore: data.metricBefore,
      metricAfter: data.metricAfter,
      changePercent: data.changePercent,
      dataSource: data.dataSource,
      isActionable: data.isActionable,
      actionSuggestion: data.actionSuggestion,
      validUntil: data.validUntil,
    },
  });
}

async function getUserOrgId(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });
  return user?.orgId ?? null;
}

// ═══════════════════════════════════════════════════════════════════
// 1. TREND INSIGHTS — auto-generated from data changes
// ═══════════════════════════════════════════════════════════════════

/**
 * Analyze lead metrics over time.
 * Compares current period vs previous period to detect real changes.
 */
export async function generateLeadTrendInsights(userId: string): Promise<number> {
  const orgId = await getUserOrgId(userId);
  let count = 0;

  // ── 1a. Lead discovery rate ──────────────────────────────────────
  const thisWeekStart = daysAgo(7);
  const lastWeekStart = daysAgo(14);

  const [leadsThisWeek, leadsLastWeek] = await Promise.all([
    db.lead.count({
      where: {
        userId,
        isActive: true,
        createdAt: { gte: thisWeekStart },
      },
    }),
    db.lead.count({
      where: {
        userId,
        isActive: true,
        createdAt: { gte: lastWeekStart, lt: thisWeekStart },
      },
    }),
  ]);

  if (leadsLastWeek > 0 || leadsThisWeek > 0) {
    const pct = computeChangePercent(leadsLastWeek, leadsThisWeek);
    if (Math.abs(pct) >= 5) {
      const direction = pct > 0 ? 'increased' : 'decreased';
      const absPct = Math.abs(pct);
      await storeInsight(userId, orgId, {
        category: 'lead',
        insightType: 'trend',
        title: `Lead discovery rate ${direction} ${absPct}% this week`,
        description: `You discovered ${leadsThisWeek} leads this week compared to ${leadsLastWeek} last week — a ${absPct}% ${direction}.`,
        impact: impactFromChange(pct),
        metricName: 'leads_discovered',
        metricBefore: leadsLastWeek,
        metricAfter: leadsThisWeek,
        changePercent: pct,
        dataSource: JSON.stringify({ table: 'Lead', period: 'weekly' }),
        isActionable: pct < 0,
        actionSuggestion: pct < 0
          ? 'Try expanding your search niches or sources to increase lead discovery.'
          : undefined,
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  // ── 1b. Lead conversion rate ─────────────────────────────────────
  const [convertedThisWeek, convertedLastWeek] = await Promise.all([
    db.lead.count({
      where: {
        userId,
        isActive: true,
        stage: 'closed_won',
        updatedAt: { gte: thisWeekStart },
      },
    }),
    db.lead.count({
      where: {
        userId,
        isActive: true,
        stage: 'closed_won',
        updatedAt: { gte: lastWeekStart, lt: thisWeekStart },
      },
    }),
  ]);

  if (convertedLastWeek > 0 || convertedThisWeek > 0) {
    const pct = computeChangePercent(convertedLastWeek, convertedThisWeek);
    if (Math.abs(pct) >= 5) {
      const direction = pct > 0 ? 'increased' : 'decreased';
      const absPct = Math.abs(pct);
      await storeInsight(userId, orgId, {
        category: 'lead',
        insightType: 'trend',
        title: `Lead conversion ${direction} ${absPct}% this week`,
        description: `${convertedThisWeek} leads converted this week vs ${convertedLastWeek} last week — a ${absPct}% ${direction}.`,
        impact: impactFromChange(pct),
        metricName: 'leads_converted',
        metricBefore: convertedLastWeek,
        metricAfter: convertedThisWeek,
        changePercent: pct,
        dataSource: JSON.stringify({ table: 'Lead', stage: 'closed_won', period: 'weekly' }),
        isActionable: pct < 0,
        actionSuggestion: pct < 0
          ? 'Review your outreach approach for leads in negotiation stage. Consider adjusting messaging or follow-up timing.'
          : undefined,
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  // ── 1c. Discovery rate over month ────────────────────────────────
  const thisMonthStart = daysAgo(30);
  const lastMonthStart = daysAgo(60);

  const [leadsThisMonth, leadsLastMonth] = await Promise.all([
    db.lead.count({
      where: {
        userId,
        isActive: true,
        createdAt: { gte: thisMonthStart },
      },
    }),
    db.lead.count({
      where: {
        userId,
        isActive: true,
        createdAt: { gte: lastMonthStart, lt: thisMonthStart },
      },
    }),
  ]);

  if (leadsLastMonth > 0 || leadsThisMonth > 0) {
    const pct = computeChangePercent(leadsLastMonth, leadsThisMonth);
    if (Math.abs(pct) >= 10) {
      const direction = pct > 0 ? 'increased' : 'decreased';
      const absPct = Math.abs(pct);
      await storeInsight(userId, orgId, {
        category: 'lead',
        insightType: 'trend',
        title: `Discovery rate ${direction} ${absPct}% this month`,
        description: `You discovered ${leadsThisMonth} leads this month compared to ${leadsLastMonth} last month — a ${absPct}% ${direction}.`,
        impact: impactFromChange(pct),
        metricName: 'leads_discovered_monthly',
        metricBefore: leadsLastMonth,
        metricAfter: leadsThisMonth,
        changePercent: pct,
        dataSource: JSON.stringify({ table: 'Lead', period: 'monthly' }),
        isActionable: pct < 0,
        actionSuggestion: pct < 0
          ? 'Consider running more discovery jobs or exploring new niches to maintain pipeline volume.'
          : undefined,
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  // ── 1d. Lead stage distribution shift ────────────────────────────
  const [contactedThisWeek, contactedLastWeek] = await Promise.all([
    db.lead.count({
      where: {
        userId,
        isActive: true,
        stage: { in: ['contacted', 'replied', 'interested', 'negotiation', 'proposal_sent'] },
        updatedAt: { gte: thisWeekStart },
      },
    }),
    db.lead.count({
      where: {
        userId,
        isActive: true,
        stage: { in: ['contacted', 'replied', 'interested', 'negotiation', 'proposal_sent'] },
        updatedAt: { gte: lastWeekStart, lt: thisWeekStart },
      },
    }),
  ]);

  if (contactedLastWeek > 0 || contactedThisWeek > 0) {
    const pct = computeChangePercent(contactedLastWeek, contactedThisWeek);
    if (Math.abs(pct) >= 15) {
      const direction = pct > 0 ? 'up' : 'down';
      const absPct = Math.abs(pct);
      await storeInsight(userId, orgId, {
        category: 'lead',
        insightType: 'trend',
        title: `Active pipeline engagement ${direction} ${absPct}%`,
        description: `${contactedThisWeek} leads actively engaged this week vs ${contactedLastWeek} last week — ${absPct}% ${direction}.`,
        impact: impactFromChange(pct),
        metricName: 'leads_engaged',
        metricBefore: contactedLastWeek,
        metricAfter: contactedThisWeek,
        changePercent: pct,
        dataSource: JSON.stringify({ table: 'Lead', stages: ['contacted', 'replied', 'interested', 'negotiation', 'proposal_sent'], period: 'weekly' }),
        isActionable: pct < 0,
        actionSuggestion: pct < 0
          ? 'Your pipeline engagement is slowing down. Consider sending follow-up messages to leads in earlier stages.'
          : undefined,
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  // ── 1e. Average lead score trend ─────────────────────────────────
  const recentLeads = await db.lead.findMany({
    where: {
      userId,
      isActive: true,
      createdAt: { gte: thisWeekStart },
    },
    select: { conversionScore: true },
  });

  const olderLeads = await db.lead.findMany({
    where: {
      userId,
      isActive: true,
      createdAt: { gte: lastWeekStart, lt: thisWeekStart },
    },
    select: { conversionScore: true },
  });

  const avgRecentScore = recentLeads.length > 0
    ? recentLeads.reduce((sum, l) => sum + l.conversionScore, 0) / recentLeads.length
    : 0;
  const avgOlderScore = olderLeads.length > 0
    ? olderLeads.reduce((sum, l) => sum + l.conversionScore, 0) / olderLeads.length
    : 0;

  if (avgOlderScore > 0 && avgRecentScore > 0) {
    const pct = computeChangePercent(avgOlderScore, avgRecentScore);
    if (Math.abs(pct) >= 10) {
      const direction = pct > 0 ? 'improved' : 'declined';
      const absPct = Math.abs(pct);
      await storeInsight(userId, orgId, {
        category: 'lead',
        insightType: 'trend',
        title: `Average lead quality ${direction} ${absPct}%`,
        description: `Average conversion score ${direction} from ${avgOlderScore.toFixed(1)} to ${avgRecentScore.toFixed(1)} — a ${absPct}% change.`,
        impact: impactFromChange(pct),
        metricName: 'avg_conversion_score',
        metricBefore: Math.round(avgOlderScore * 100) / 100,
        metricAfter: Math.round(avgRecentScore * 100) / 100,
        changePercent: pct,
        dataSource: JSON.stringify({ table: 'Lead', field: 'conversionScore', period: 'weekly' }),
        isActionable: pct < 0,
        actionSuggestion: pct < 0
          ? 'Lead quality is declining. Refine your discovery criteria to target higher-quality prospects.'
          : undefined,
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  return count;
}

/**
 * Analyze AI usage trends.
 */
export async function generateAITrendInsights(userId: string): Promise<number> {
  const orgId = await getUserOrgId(userId);
  let count = 0;

  const thisWeekStart = daysAgo(7);
  const lastWeekStart = daysAgo(14);

  // ── AI credit consumption trend ──────────────────────────────────
  const [creditsThisWeek, creditsLastWeek] = await Promise.all([
    db.creditsLedger.aggregate({
      _sum: { credits: true },
      where: {
        userId,
        credits: { lt: 0 },
        createdAt: { gte: thisWeekStart },
      },
    }),
    db.creditsLedger.aggregate({
      _sum: { credits: true },
      where: {
        userId,
        credits: { lt: 0 },
        createdAt: { gte: lastWeekStart, lt: thisWeekStart },
      },
    }),
  ]);

  const spentThisWeek = Math.abs(creditsThisWeek._sum.credits ?? 0);
  const spentLastWeek = Math.abs(creditsLastWeek._sum.credits ?? 0);

  if (spentLastWeek > 0 || spentThisWeek > 0) {
    const pct = computeChangePercent(spentLastWeek, spentThisWeek);
    if (Math.abs(pct) >= 10) {
      const direction = pct > 0 ? 'increased' : 'decreased';
      const absPct = Math.abs(pct);
      await storeInsight(userId, orgId, {
        category: 'ai',
        insightType: 'trend',
        title: `AI credit consumption ${direction} ${absPct}% this week`,
        description: `You spent ${spentThisWeek} credits this week vs ${spentLastWeek} last week — a ${absPct}% ${direction}.`,
        impact: pct > 0 ? impactFromChange(pct) : 'low',
        metricName: 'credits_consumed',
        metricBefore: spentLastWeek,
        metricAfter: spentThisWeek,
        changePercent: pct,
        dataSource: JSON.stringify({ table: 'CreditsLedger', period: 'weekly' }),
        isActionable: pct > 20,
        actionSuggestion: pct > 20
          ? 'AI costs are rising significantly. Review which AI actions consume the most credits and optimize usage.'
          : undefined,
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  // ── AI action breakdown trend ────────────────────────────────────
  const aiActionsThisWeek = await db.creditsLedger.groupBy({
    by: ['action'],
    where: {
      userId,
      credits: { lt: 0 },
      createdAt: { gte: thisWeekStart },
    },
    _sum: { credits: true },
    _count: true,
  });

  const aiActionsLastWeek = await db.creditsLedger.groupBy({
    by: ['action'],
    where: {
      userId,
      credits: { lt: 0 },
      createdAt: { gte: lastWeekStart, lt: thisWeekStart },
    },
    _sum: { credits: true },
    _count: true,
  });

  // Find the most-used AI action and compare
  const topActionThisWeek = aiActionsThisWeek.sort((a, b) => (b._count ?? 0) - (a._count ?? 0))[0];
  const topActionLastWeek = aiActionsLastWeek.find(a => a.action === topActionThisWeek?.action);

  if (topActionThisWeek && topActionLastWeek) {
    const thisCount = topActionThisWeek._count;
    const lastCount = topActionLastWeek._count;
    const pct = computeChangePercent(lastCount, thisCount);
    if (Math.abs(pct) >= 15) {
      const direction = pct > 0 ? 'increased' : 'decreased';
      const absPct = Math.abs(pct);
      await storeInsight(userId, orgId, {
        category: 'ai',
        insightType: 'trend',
        title: `Top AI action "${topActionThisWeek.action}" usage ${direction} ${absPct}%`,
        description: `${topActionThisWeek.action} was used ${thisCount} times this week vs ${lastCount} last week — ${absPct}% ${direction}.`,
        impact: impactFromChange(pct),
        metricName: `ai_action_${topActionThisWeek.action}_count`,
        metricBefore: lastCount,
        metricAfter: thisCount,
        changePercent: pct,
        dataSource: JSON.stringify({ table: 'CreditsLedger', action: topActionThisWeek.action, period: 'weekly' }),
        isActionable: false,
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  // ── AI chat sessions trend ───────────────────────────────────────
  const [chatSessionsThisWeek, chatSessionsLastWeek] = await Promise.all([
    db.aiChatSession.count({
      where: { userId, createdAt: { gte: thisWeekStart } },
    }),
    db.aiChatSession.count({
      where: { userId, createdAt: { gte: lastWeekStart, lt: thisWeekStart } },
    }),
  ]);

  if (chatSessionsLastWeek > 0 || chatSessionsThisWeek > 0) {
    const pct = computeChangePercent(chatSessionsLastWeek, chatSessionsThisWeek);
    if (Math.abs(pct) >= 20) {
      const direction = pct > 0 ? 'increased' : 'decreased';
      const absPct = Math.abs(pct);
      await storeInsight(userId, orgId, {
        category: 'ai',
        insightType: 'trend',
        title: `AI chat sessions ${direction} ${absPct}% this week`,
        description: `${chatSessionsThisWeek} AI chat sessions this week vs ${chatSessionsLastWeek} last week — ${absPct}% ${direction}.`,
        impact: 'low',
        metricName: 'ai_chat_sessions',
        metricBefore: chatSessionsLastWeek,
        metricAfter: chatSessionsThisWeek,
        changePercent: pct,
        dataSource: JSON.stringify({ table: 'AiChatSession', period: 'weekly' }),
        isActionable: false,
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  return count;
}

/**
 * Analyze billing trends.
 */
export async function generateBillingTrendInsights(userId: string): Promise<number> {
  const orgId = await getUserOrgId(userId);
  let count = 0;

  const thisMonthStart = daysAgo(30);
  const lastMonthStart = daysAgo(60);

  // ── Payment order volume & revenue ───────────────────────────────
  const [paymentsThisMonth, paymentsLastMonth] = await Promise.all([
    db.paymentOrder.findMany({
      where: {
        userId,
        status: 'completed',
        createdAt: { gte: thisMonthStart },
      },
      select: { amount: true },
    }),
    db.paymentOrder.findMany({
      where: {
        userId,
        status: 'completed',
        createdAt: { gte: lastMonthStart, lt: thisMonthStart },
      },
      select: { amount: true },
    }),
  ]);

  const revenueThisMonth = paymentsThisMonth.reduce((sum, p) => sum + p.amount, 0);
  const revenueLastMonth = paymentsLastMonth.reduce((sum, p) => sum + p.amount, 0);

  if (revenueLastMonth > 0 || revenueThisMonth > 0) {
    const pct = computeChangePercent(revenueLastMonth, revenueThisMonth);
    if (Math.abs(pct) >= 5) {
      const direction = pct > 0 ? 'grew' : 'declined';
      const absPct = Math.abs(pct);
      await storeInsight(userId, orgId, {
        category: 'billing',
        insightType: 'trend',
        title: `MRR ${direction} by ${absPct}% this month`,
        description: `Completed payments total $${revenueThisMonth.toFixed(2)} this month vs $${revenueLastMonth.toFixed(2)} last month — ${absPct}% ${direction}.`,
        impact: impactFromChange(pct),
        metricName: 'mrr',
        metricBefore: revenueLastMonth,
        metricAfter: revenueThisMonth,
        changePercent: pct,
        dataSource: JSON.stringify({ table: 'PaymentOrder', status: 'completed', period: 'monthly' }),
        isActionable: pct < 0,
        actionSuggestion: pct < 0
          ? 'Revenue is declining. Consider upgrading your plan or purchasing credit add-ons to support growth.'
          : undefined,
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  // ── Credit balance trend ─────────────────────────────────────────
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { credits: true, creditsMonthly: true, rolloverCredits: true },
  });

  if (user) {
    const totalCredits = user.credits;
    const monthlyCredits = user.creditsMonthly;

    // Compare current balance vs monthly allocation
    const usageRatio = monthlyCredits > 0 ? ((monthlyCredits - totalCredits) / monthlyCredits) * 100 : 0;

    if (usageRatio >= 80) {
      await storeInsight(userId, orgId, {
        category: 'billing',
        insightType: 'trend',
        title: `Credit usage at ${usageRatio.toFixed(0)}% of monthly allocation`,
        description: `You have ${totalCredits} credits remaining out of ${monthlyCredits} monthly credits. You've used ${usageRatio.toFixed(0)}% of your allocation.`,
        impact: usageRatio >= 95 ? 'high' : 'medium',
        metricName: 'credit_usage_percent',
        metricBefore: monthlyCredits,
        metricAfter: totalCredits,
        changePercent: Math.round(usageRatio * 100) / 100,
        dataSource: JSON.stringify({ table: 'User', field: 'credits' }),
        isActionable: true,
        actionSuggestion: usageRatio >= 95
          ? 'Almost out of credits! Purchase a credit add-on or upgrade your plan immediately to avoid service interruption.'
          : 'Credits are running low. Consider purchasing a credit add-on or upgrading your plan.',
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  // ── Subscription status insight ──────────────────────────────────
  const activeSub = await db.subscription.findFirst({
    where: { userId, status: { in: ['active', 'trialing'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (activeSub) {
    if (activeSub.status === 'trialing' && activeSub.trialEndsAt) {
      const daysLeft = Math.ceil((activeSub.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7 && daysLeft > 0) {
        await storeInsight(userId, orgId, {
          category: 'billing',
          insightType: 'trend',
          title: `Trial expires in ${daysLeft} days`,
          description: `Your ${activeSub.plan} plan trial ends in ${daysLeft} days. Upgrade to keep access to all features.`,
          impact: daysLeft <= 2 ? 'high' : 'medium',
          metricName: 'trial_days_remaining',
          metricBefore: 14,
          metricAfter: daysLeft,
          changePercent: computeChangePercent(14, daysLeft),
          dataSource: JSON.stringify({ table: 'Subscription', id: activeSub.id }),
          isActionable: true,
          actionSuggestion: `Upgrade to ${activeSub.plan} plan before your trial expires to avoid losing features.`,
          validUntil: new Date(activeSub.trialEndsAt),
        });
        count++;
      }
    }

    if (activeSub.cancelAtPeriodEnd && activeSub.currentPeriodEnd) {
      const daysUntilEnd = Math.ceil((activeSub.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilEnd <= 7 && daysUntilEnd > 0) {
        await storeInsight(userId, orgId, {
          category: 'billing',
          insightType: 'trend',
          title: `Subscription cancels in ${daysUntilEnd} days`,
          description: `Your ${activeSub.plan} plan subscription is set to cancel at the end of the billing period (${daysUntilEnd} days).`,
          impact: 'high',
          metricName: 'subscription_days_until_cancel',
          metricBefore: 30,
          metricAfter: daysUntilEnd,
          changePercent: computeChangePercent(30, daysUntilEnd),
          dataSource: JSON.stringify({ table: 'Subscription', id: activeSub.id }),
          isActionable: true,
          actionSuggestion: 'Reactivate your subscription to avoid losing access to premium features.',
          validUntil: new Date(activeSub.currentPeriodEnd),
        });
        count++;
      }
    }
  }

  return count;
}

/**
 * Analyze workflow trends.
 */
export async function generateWorkflowTrendInsights(userId: string): Promise<number> {
  const orgId = await getUserOrgId(userId);
  let count = 0;

  const thisWeekStart = daysAgo(7);
  const lastWeekStart = daysAgo(14);

  // ── Workflow execution success/failure rate ──────────────────────
  const [execsThisWeek, execsLastWeek] = await Promise.all([
    db.workflowExecution.groupBy({
      by: ['status'],
      where: {
        userId,
        createdAt: { gte: thisWeekStart },
      },
      _count: true,
    }),
    db.workflowExecution.groupBy({
      by: ['status'],
      where: {
        userId,
        createdAt: { gte: lastWeekStart, lt: thisWeekStart },
      },
      _count: true,
    }),
  ]);

  const failedThisWeek = execsThisWeek.find(e => e.status === 'failed')?._count ?? 0;
  const failedLastWeek = execsLastWeek.find(e => e.status === 'failed')?._count ?? 0;
  const completedThisWeek = execsThisWeek.find(e => e.status === 'completed')?._count ?? 0;
  const completedLastWeek = execsLastWeek.find(e => e.status === 'completed')?._count ?? 0;
  const totalThisWeek = execsThisWeek.reduce((sum, e) => sum + e._count, 0);
  const totalLastWeek = execsLastWeek.reduce((sum, e) => sum + e._count, 0);

  if (totalLastWeek > 0 || totalThisWeek > 0) {
    // Failure rate comparison
    const failRateThisWeek = totalThisWeek > 0 ? (failedThisWeek / totalThisWeek) * 100 : 0;
    const failRateLastWeek = totalLastWeek > 0 ? (failedLastWeek / totalLastWeek) * 100 : 0;

    if (failRateThisWeek > failRateLastWeek && failedThisWeek > 0) {
      const pctIncrease = computeChangePercent(failRateLastWeek, failRateThisWeek);
      await storeInsight(userId, orgId, {
        category: 'workflow',
        insightType: 'trend',
        title: `Workflow failure rate increased by ${Math.abs(pctIncrease).toFixed(0)}%`,
        description: `Failure rate went from ${failRateLastWeek.toFixed(1)}% to ${failRateThisWeek.toFixed(1)}%. ${failedThisWeek} workflows failed this week vs ${failedLastWeek} last week.`,
        impact: failRateThisWeek > 30 ? 'high' : 'medium',
        metricName: 'workflow_failure_rate',
        metricBefore: Math.round(failRateLastWeek * 100) / 100,
        metricAfter: Math.round(failRateThisWeek * 100) / 100,
        changePercent: pctIncrease,
        dataSource: JSON.stringify({ table: 'WorkflowExecution', period: 'weekly' }),
        isActionable: true,
        actionSuggestion: 'Review failed workflow execution logs to identify and fix recurring issues.',
        validUntil: defaultValidUntil(),
      });
      count++;
    }

    // Total execution volume trend
    const pct = computeChangePercent(totalLastWeek, totalThisWeek);
    if (Math.abs(pct) >= 20) {
      const direction = pct > 0 ? 'increased' : 'decreased';
      const absPct = Math.abs(pct);
      await storeInsight(userId, orgId, {
        category: 'workflow',
        insightType: 'trend',
        title: `Workflow executions ${direction} ${absPct}% this week`,
        description: `${totalThisWeek} workflow executions this week vs ${totalLastWeek} last week — ${absPct}% ${direction}. Completed: ${completedThisWeek} vs ${completedLastWeek}.`,
        impact: impactFromChange(pct),
        metricName: 'workflow_executions',
        metricBefore: totalLastWeek,
        metricAfter: totalThisWeek,
        changePercent: pct,
        dataSource: JSON.stringify({ table: 'WorkflowExecution', period: 'weekly' }),
        isActionable: false,
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  // ── Active workflows count ───────────────────────────────────────
  const activeWorkflows = await db.workflowDefinition.count({
    where: { userId, status: 'active' },
  });

  const pausedWorkflows = await db.workflowDefinition.count({
    where: { userId, status: 'paused' },
  });

  if (activeWorkflows > 0 && pausedWorkflows > 0) {
    await storeInsight(userId, orgId, {
      category: 'workflow',
      insightType: 'trend',
      title: `${pausedWorkflows} workflows paused, ${activeWorkflows} active`,
      description: `You have ${activeWorkflows} active and ${pausedWorkflows} paused workflows. Paused workflows may need attention.`,
      impact: 'low',
      metricName: 'paused_workflows',
      metricBefore: activeWorkflows,
      metricAfter: pausedWorkflows,
      dataSource: JSON.stringify({ table: 'WorkflowDefinition' }),
      isActionable: pausedWorkflows > activeWorkflows,
      actionSuggestion: pausedWorkflows > activeWorkflows
        ? 'More than half your workflows are paused. Consider resuming or archiving unused ones.'
        : undefined,
      validUntil: defaultValidUntil(),
    });
    count++;
  }

  return count;
}

// ═══════════════════════════════════════════════════════════════════
// 2. ANOMALY-BASED INSIGHTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Read from AnalyticsAnomaly table and convert active anomalies into insight format.
 */
export async function generateAnomalyInsights(userId: string): Promise<number> {
  const orgId = await getUserOrgId(userId);
  let count = 0;

  const activeAnomalies = await db.analyticsAnomaly.findMany({
    where: {
      userId,
      status: 'active',
    },
    orderBy: { deviation: 'desc' },
    take: 10,
  });

  for (const anomaly of activeAnomalies) {
    const absDeviation = Math.abs(anomaly.deviation ?? 0);
    const direction = (anomaly.actualValue ?? 0) > (anomaly.expectedValue ?? 0) ? 'above' : 'below';

    let actionSuggestion: string | undefined;
    let isActionable = false;

    switch (anomaly.anomalyType) {
      case 'conversion_drop':
        actionSuggestion = 'Investigate why lead conversion has dropped. Review recent outreach messages and lead quality.';
        isActionable = true;
        break;
      case 'response_drop':
        actionSuggestion = 'Response rates have dropped. Try adjusting your outreach tone or timing.';
        isActionable = true;
        break;
      case 'cost_spike':
        actionSuggestion = 'AI costs are higher than expected. Review which actions consume the most credits.';
        isActionable = true;
        break;
      case 'usage_spike':
        actionSuggestion = 'Usage has spiked significantly. Ensure this aligns with your goals and budget.';
        isActionable = true;
        break;
      case 'mrr_drop':
        actionSuggestion = 'Monthly revenue has dropped. Review subscription status and payment history.';
        isActionable = true;
        break;
      case 'churn_spike':
        actionSuggestion = 'Churn rate is unusually high. Reach out to at-risk accounts to understand their concerns.';
        isActionable = true;
        break;
      case 'failure_spike':
        actionSuggestion = 'Workflow failures are spiking. Check execution logs for error patterns.';
        isActionable = true;
        break;
      case 'queue_growth':
        actionSuggestion = 'Work queue is growing faster than processing. Consider scaling or prioritizing tasks.';
        isActionable = true;
        break;
    }

    await storeInsight(userId, orgId, {
      category: anomaly.category ?? 'general',
      insightType: 'anomaly',
      title: `Anomaly: ${anomaly.metricName} ${absDeviation.toFixed(0)}% ${direction} expected`,
      description: anomaly.description ||
        `${anomaly.metricName} is ${absDeviation.toFixed(1)}% ${direction} the expected value. Expected: ${(anomaly.expectedValue ?? 0).toFixed(2)}, Actual: ${(anomaly.actualValue ?? 0).toFixed(2)}.`,
      impact: anomaly.severity === 'critical' ? 'high' : anomaly.severity === 'warning' ? 'medium' : 'low',
      metricName: anomaly.metricName ?? 'unknown',
      metricBefore: anomaly.expectedValue ?? undefined,
      metricAfter: anomaly.actualValue ?? undefined,
      changePercent: anomaly.deviation ?? undefined,
      dataSource: JSON.stringify({ table: 'AnalyticsAnomaly', id: anomaly.id, anomalyType: anomaly.anomalyType }),
      isActionable,
      actionSuggestion,
      validUntil: defaultValidUntil(),
    });
    count++;
  }

  return count;
}

// ═══════════════════════════════════════════════════════════════════
// 3. OPPORTUNITY INSIGHTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect opportunities from data: leads with high scores but no contact,
 * unused sequences, underutilized channels.
 */
export async function generateOpportunityInsights(userId: string): Promise<number> {
  const orgId = await getUserOrgId(userId);
  let count = 0;

  // ── High-score leads with no contact attempt ─────────────────────
  const uncontactedHighScoreLeads = await db.lead.findMany({
    where: {
      userId,
      isActive: true,
      stage: 'discovered',
      conversionScore: { gte: 60 },
      lastContactedAt: null,
    },
    select: { id: true, businessName: true, conversionScore: true },
    take: 20,
    orderBy: { conversionScore: 'desc' },
  });

  if (uncontactedHighScoreLeads.length > 0) {
    const avgScore = uncontactedHighScoreLeads.reduce((s, l) => s + l.conversionScore, 0) / uncontactedHighScoreLeads.length;
    await storeInsight(userId, orgId, {
      category: 'lead',
      insightType: 'opportunity',
      title: `${uncontactedHighScoreLeads.length} high-score leads awaiting contact`,
      description: `${uncontactedHighScoreLeads.length} leads with conversion score ≥ 60 (avg: ${avgScore.toFixed(1)}) have never been contacted. Top lead: "${uncontactedHighScoreLeads[0].businessName}" (score: ${uncontactedHighScoreLeads[0].conversionScore}).`,
      impact: uncontactedHighScoreLeads.length >= 5 ? 'high' : 'medium',
      metricName: 'uncontacted_high_score_leads',
      metricBefore: 0,
      metricAfter: uncontactedHighScoreLeads.length,
      changePercent: 100,
      dataSource: JSON.stringify({ table: 'Lead', filters: { stage: 'discovered', conversionScore_gte: 60, lastContactedAt_null: true } }),
      isActionable: true,
      actionSuggestion: `Start outreach to your top ${Math.min(5, uncontactedHighScoreLeads.length)} high-score leads immediately. Use AI-generated messages for best results.`,
      validUntil: defaultValidUntil(),
    });
    count++;
  }

  // ── Leads in early stages that could be moved forward ─────────────
  const leadsInAnalysis = await db.lead.count({
    where: {
      userId,
      isActive: true,
      stage: 'analyzed',
      conversionScore: { gte: 40 },
    },
  });

  if (leadsInAnalysis >= 3) {
    await storeInsight(userId, orgId, {
      category: 'lead',
      insightType: 'opportunity',
      title: `${leadsInAnalysis} analyzed leads ready for outreach`,
      description: `${leadsInAnalysis} leads are in the "analyzed" stage with conversion scores ≥ 40. Move them to contacted to advance the pipeline.`,
      impact: leadsInAnalysis >= 10 ? 'high' : 'medium',
      metricName: 'analyzed_leads_ready',
      metricBefore: 0,
      metricAfter: leadsInAnalysis,
      dataSource: JSON.stringify({ table: 'Lead', stage: 'analyzed', conversionScore_gte: 40 }),
      isActionable: true,
      actionSuggestion: 'Move analyzed leads to the contacted stage and start outreach campaigns.',
      validUntil: defaultValidUntil(),
    });
    count++;
  }

  // ── Unused outreach sequences ────────────────────────────────────
  const unusedSequences = await db.outreachSequence.findMany({
    where: {
      userId,
      status: 'draft',
    },
    select: { id: true, name: true, createdAt: true },
    take: 10,
  });

  if (unusedSequences.length > 0) {
    await storeInsight(userId, orgId, {
      category: 'lead',
      insightType: 'opportunity',
      title: `${unusedSequences.length} draft outreach sequences not activated`,
      description: `${unusedSequences.length} outreach sequences are still in draft status. Activate them to start automated outreach.`,
      impact: 'low',
      metricName: 'draft_sequences',
      metricBefore: 0,
      metricAfter: unusedSequences.length,
      dataSource: JSON.stringify({ table: 'OutreachSequence', status: 'draft' }),
      isActionable: true,
      actionSuggestion: 'Review and activate your draft sequences to leverage automated outreach.',
      validUntil: defaultValidUntil(),
    });
    count++;
  }

  // ── Underutilized channels ───────────────────────────────────────
  const channelUsage = await db.outreachMessage.groupBy({
    by: ['channel'],
    where: { userId },
    _count: true,
  });

  const allChannels = ['email', 'whatsapp', 'linkedin', 'instagram'];
  const usedChannels = new Set(channelUsage.map(c => c.channel));
  const unusedChannels = allChannels.filter(c => !usedChannels.has(c));

  if (unusedChannels.length > 0 && usedChannels.size > 0) {
    await storeInsight(userId, orgId, {
      category: 'lead',
      insightType: 'opportunity',
      title: `Untapped outreach channels: ${unusedChannels.join(', ')}`,
      description: `You're only using ${usedChannels.size} of 4 outreach channels. Expanding to ${unusedChannels.join(', ')} could increase your reach.`,
      impact: 'medium',
      metricName: 'active_outreach_channels',
      metricBefore: usedChannels.size,
      metricAfter: allChannels.length,
      changePercent: computeChangePercent(usedChannels.size, allChannels.length),
      dataSource: JSON.stringify({ table: 'OutreachMessage', groupBy: 'channel' }),
      isActionable: true,
      actionSuggestion: `Set up ${unusedChannels[0]} integration to expand your outreach capabilities and reach more leads.`,
      validUntil: defaultValidUntil(),
    });
    count++;
  }

  // ── Leads with replies but no follow-up ──────────────────────────
  const repliedLeadsNoFollowUp = await db.lead.count({
    where: {
      userId,
      isActive: true,
      stage: 'replied',
      lastContactedAt: { lt: daysAgo(3) },
    },
  });

  if (repliedLeadsNoFollowUp >= 2) {
    await storeInsight(userId, orgId, {
      category: 'lead',
      insightType: 'opportunity',
      title: `${repliedLeadsNoFollowUp} replied leads need follow-up`,
      description: `${repliedLeadsNoFollowUp} leads have replied but haven't been contacted in 3+ days. Timely follow-up significantly increases close rates.`,
      impact: repliedLeadsNoFollowUp >= 5 ? 'high' : 'medium',
      metricName: 'replied_leads_stale',
      metricBefore: 0,
      metricAfter: repliedLeadsNoFollowUp,
      dataSource: JSON.stringify({ table: 'Lead', stage: 'replied', lastContactedAt_lt: '3_days_ago' }),
      isActionable: true,
      actionSuggestion: 'Follow up with replied leads immediately. A quick response can move them to the interested stage.',
      validUntil: defaultValidUntil(),
    });
    count++;
  }

  return count;
}

// ═══════════════════════════════════════════════════════════════════
// 4. RISK INSIGHTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect risks: credit depletion forecast, expiring subscriptions, stale leads.
 */
export async function generateRiskInsights(userId: string): Promise<number> {
  const orgId = await getUserOrgId(userId);
  let count = 0;

  // ── Credit depletion forecast ────────────────────────────────────
  const last7DaysCredits = await db.creditsLedger.aggregate({
    _sum: { credits: true },
    _count: true,
    where: {
      userId,
      credits: { lt: 0 },
      createdAt: { gte: daysAgo(7) },
    },
  });

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { credits: true, creditsMonthly: true },
  });

  if (user && last7DaysCredits._count > 0) {
    const weeklySpend = Math.abs(last7DaysCredits._sum.credits ?? 0);
    const dailyAvg = weeklySpend / 7;
    const daysUntilDepletion = dailyAvg > 0 ? Math.floor(user.credits / dailyAvg) : Infinity;

    if (daysUntilDepletion <= 14 && daysUntilDepletion > 0) {
      await storeInsight(userId, orgId, {
        category: 'billing',
        insightType: 'risk',
        title: `Credits will deplete in ~${daysUntilDepletion} days at current rate`,
        description: `You have ${user.credits} credits remaining. At your current usage rate of ${dailyAvg.toFixed(1)} credits/day, you'll run out in approximately ${daysUntilDepletion} days.`,
        impact: daysUntilDepletion <= 3 ? 'high' : daysUntilDepletion <= 7 ? 'medium' : 'low',
        metricName: 'credit_depletion_days',
        metricBefore: user.creditsMonthly,
        metricAfter: daysUntilDepletion,
        dataSource: JSON.stringify({ table: 'CreditsLedger', period: '7d_avg', dailyAvg: dailyAvg.toFixed(2) }),
        isActionable: true,
        actionSuggestion: daysUntilDepletion <= 3
          ? 'URGENT: Purchase credit add-ons immediately or upgrade your plan to avoid service interruption.'
          : 'Consider purchasing credit add-ons or upgrading your plan to maintain your current usage level.',
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  // ── Stale leads (no activity in 14+ days) ───────────────────────
  const staleLeads = await db.lead.count({
    where: {
      userId,
      isActive: true,
      stage: { notIn: ['closed_won', 'closed_lost'] },
      updatedAt: { lt: daysAgo(14) },
    },
  });

  if (staleLeads >= 3) {
    await storeInsight(userId, orgId, {
      category: 'lead',
      insightType: 'risk',
      title: `${staleLeads} leads have been inactive for 14+ days`,
      description: `${staleLeads} active leads haven't been updated in over 2 weeks. These leads may go cold without re-engagement.`,
      impact: staleLeads >= 10 ? 'high' : 'medium',
      metricName: 'stale_leads_14d',
      metricBefore: 0,
      metricAfter: staleLeads,
      dataSource: JSON.stringify({ table: 'Lead', updatedBefore: '14d', excludeStages: ['closed_won', 'closed_lost'] }),
      isActionable: true,
      actionSuggestion: 'Re-engage stale leads with a follow-up message. Consider moving truly inactive leads to closed_lost to keep your pipeline clean.',
      validUntil: defaultValidUntil(),
    });
    count++;
  }

  // ── Expiring subscriptions ───────────────────────────────────────
  const expiringSubscriptions = await db.subscription.findMany({
    where: {
      userId,
      status: { in: ['active', 'trialing'] },
      currentPeriodEnd: {
        gte: new Date(),
        lte: daysAgo(-7),
      },
    },
  });

  for (const sub of expiringSubscriptions) {
    if (sub.currentPeriodEnd) {
      const daysLeft = Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      await storeInsight(userId, orgId, {
        category: 'billing',
        insightType: 'risk',
        title: `${sub.plan} subscription period ends in ${daysLeft} days`,
        description: `Your ${sub.plan} plan billing period ends in ${daysLeft} days. Ensure payment method is up to date to avoid service interruption.`,
        impact: daysLeft <= 2 ? 'high' : 'medium',
        metricName: 'subscription_period_days_left',
        metricBefore: 30,
        metricAfter: daysLeft,
        changePercent: computeChangePercent(30, daysLeft),
        dataSource: JSON.stringify({ table: 'Subscription', id: sub.id, plan: sub.plan }),
        isActionable: true,
        actionSuggestion: 'Verify your payment method is current. Consider switching to yearly billing for savings.',
        validUntil: new Date(sub.currentPeriodEnd),
      });
      count++;
    }
  }

  // ── Leads stuck in negotiation ───────────────────────────────────
  const stuckInNegotiation = await db.lead.count({
    where: {
      userId,
      isActive: true,
      stage: 'negotiation',
      updatedAt: { lt: daysAgo(7) },
    },
  });

  if (stuckInNegotiation >= 2) {
    await storeInsight(userId, orgId, {
      category: 'lead',
      insightType: 'risk',
      title: `${stuckInNegotiation} leads stuck in negotiation for 7+ days`,
      description: `${stuckInNegotiation} leads have been in the negotiation stage for over a week. Prolonged negotiation often leads to lost deals.`,
      impact: stuckInNegotiation >= 5 ? 'high' : 'medium',
      metricName: 'stuck_negotiation_leads',
      metricBefore: 0,
      metricAfter: stuckInNegotiation,
      dataSource: JSON.stringify({ table: 'Lead', stage: 'negotiation', updatedBefore: '7d' }),
      isActionable: true,
      actionSuggestion: 'Reach out to stalled negotiation leads with a new proposal or limited-time offer to break the deadlock.',
      validUntil: defaultValidUntil(),
    });
    count++;
  }

  // ── High bounce rate ─────────────────────────────────────────────
  const recentBounces = await db.emailBounce.count({
    where: {
      userId,
      createdAt: { gte: daysAgo(7) },
    },
  });

  const recentSent = await db.outreachMessage.count({
    where: {
      userId,
      status: { in: ['sent', 'delivered', 'opened', 'replied', 'bounced'] },
      sentAt: { gte: daysAgo(7) },
    },
  });

  if (recentSent >= 5 && recentBounces > 0) {
    const bounceRate = (recentBounces / recentSent) * 100;
    if (bounceRate >= 15) {
      await storeInsight(userId, orgId, {
        category: 'lead',
        insightType: 'risk',
        title: `Email bounce rate at ${bounceRate.toFixed(1)}% this week`,
        description: `${recentBounces} out of ${recentSent} emails bounced this week (${bounceRate.toFixed(1)}% bounce rate). High bounce rates can harm your sender reputation.`,
        impact: bounceRate >= 30 ? 'high' : 'medium',
        metricName: 'email_bounce_rate',
        metricBefore: 0,
        metricAfter: Math.round(bounceRate * 100) / 100,
        changePercent: bounceRate,
        dataSource: JSON.stringify({ table: 'EmailBounce', period: '7d', bounces: recentBounces, sent: recentSent }),
        isActionable: true,
        actionSuggestion: 'Verify lead email addresses before sending. Consider using email verification tools to reduce bounces.',
        validUntil: defaultValidUntil(),
      });
      count++;
    }
  }

  return count;
}

// ═══════════════════════════════════════════════════════════════════
// 5. COMPETITOR INSIGHTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Read from CompetitorAnalysis/CompetitorSnapshot tables and generate
 * insights about competitor changes.
 */
export async function generateCompetitorInsights(userId: string): Promise<number> {
  const orgId = await getUserOrgId(userId);
  let count = 0;

  // ── Competitor analyses overview ─────────────────────────────────
  const competitorAnalyses = await db.competitorAnalysis.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  if (competitorAnalyses.length > 0) {
    // Find competitors with high threat level
    const highThreatCompetitors = competitorAnalyses.filter(c => c.threatLevel === 'high');
    if (highThreatCompetitors.length > 0) {
      const names = highThreatCompetitors.map(c => c.competitorName).join(', ');
      await storeInsight(userId, orgId, {
        category: 'competitor',
        insightType: 'risk',
        title: `${highThreatCompetitors.length} high-threat competitors detected`,
        description: `Competitors with high threat level: ${names}. These competitors show strong SEO, social presence, or market positioning.`,
        impact: 'high',
        metricName: 'high_threat_competitors',
        metricBefore: 0,
        metricAfter: highThreatCompetitors.length,
        dataSource: JSON.stringify({ table: 'CompetitorAnalysis', threatLevel: 'high' }),
        isActionable: true,
        actionSuggestion: 'Focus on your differentiation strategy. Review these competitors\' weaknesses for opportunities to outperform them.',
        validUntil: defaultValidUntil(),
      });
      count++;
    }

    // Find competitors with low opportunity scores (meaning they're strong)
    const avgOppScore = competitorAnalyses
      .filter(c => c.opportunityScore !== null)
      .reduce((sum, c) => sum + (c.opportunityScore ?? 0), 0) / competitorAnalyses.filter(c => c.opportunityScore !== null).length;

    if (!isNaN(avgOppScore) && avgOppScore > 0) {
      const topOpp = competitorAnalyses
        .filter(c => c.opportunityScore !== null)
        .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))[0];

      if (topOpp && topOpp.opportunityScore && topOpp.opportunityScore >= 60) {
        await storeInsight(userId, orgId, {
          category: 'competitor',
          insightType: 'opportunity',
          title: `High opportunity score against "${topOpp.competitorName}"`,
          description: `"${topOpp.competitorName}" has an opportunity score of ${topOpp.opportunityScore}/100. Average across all competitors: ${avgOppScore.toFixed(1)}. This indicates areas where you can gain advantage.`,
          impact: topOpp.opportunityScore >= 80 ? 'high' : 'medium',
          metricName: 'competitor_opportunity_score',
          metricBefore: Math.round(avgOppScore * 100) / 100,
          metricAfter: topOpp.opportunityScore,
          changePercent: computeChangePercent(avgOppScore, topOpp.opportunityScore),
          dataSource: JSON.stringify({ table: 'CompetitorAnalysis', competitorId: topOpp.id }),
          isActionable: true,
          actionSuggestion: 'Review this competitor\'s weaknesses and differentiation opportunities. Target their weak areas in your marketing.',
          validUntil: defaultValidUntil(),
        });
        count++;
      }
    }
  }

  // ── Competitor snapshots comparison ──────────────────────────────
  const recentSnapshots = await db.competitorSnapshot.findMany({
    where: {
      userId,
      createdAt: { gte: daysAgo(30) },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  if (recentSnapshots.length >= 2) {
    // Group snapshots by competitorId
    const byCompetitor = new Map<string, typeof recentSnapshots>();
    for (const snap of recentSnapshots) {
      const existing = byCompetitor.get(snap.competitorId) ?? [];
      existing.push(snap);
      byCompetitor.set(snap.competitorId, existing);
    }

    // Compare SEO score changes for competitors with 2+ snapshots
    for (const [competitorId, snapshots] of byCompetitor) {
      if (snapshots.length < 2) continue;

      const latest = snapshots[0];
      const previous = snapshots[snapshots.length - 1];

      if (latest.seoScore !== null && previous.seoScore !== null) {
        const pct = computeChangePercent(previous.seoScore, latest.seoScore);
        if (Math.abs(pct) >= 10) {
          const direction = pct > 0 ? 'improved' : 'declined';
          const absPct = Math.abs(pct);

          // Get competitor name
          const analysis = await db.competitorAnalysis.findUnique({
            where: { id: competitorId },
            select: { competitorName: true },
          });

          const name = analysis?.competitorName ?? 'Unknown competitor';

          await storeInsight(userId, orgId, {
            category: 'competitor',
            insightType: 'trend',
            title: `Competitor "${name}" SEO score ${direction} ${absPct}%`,
            description: `${name}'s SEO score went from ${previous.seoScore} to ${latest.seoScore} — a ${absPct}% ${direction}. ${pct > 0 ? 'They may be investing more in SEO.' : 'Their SEO presence may be weakening.'}`,
            impact: impactFromChange(pct),
            metricName: 'competitor_seo_score',
            metricBefore: previous.seoScore,
            metricAfter: latest.seoScore,
            changePercent: pct,
            dataSource: JSON.stringify({ table: 'CompetitorSnapshot', competitorId, snapshotType: latest.snapshotType }),
            isActionable: pct > 0,
            actionSuggestion: pct > 0
              ? `A competitor is improving their SEO. Consider investing in your own SEO to maintain competitive parity.`
              : `A competitor's SEO is declining. This could be an opportunity to capture their search traffic.`,
            validUntil: defaultValidUntil(),
          });
          count++;
          break; // Only generate one snapshot insight per run to avoid spam
        }
      }
    }
  }

  // ── Competitors with identified weaknesses ───────────────────────
  const competitorsWithWeaknesses = competitorAnalyses.filter(c => {
    try {
      const weaknesses = c.weaknesses ? JSON.parse(c.weaknesses) : [];
      return Array.isArray(weaknesses) && weaknesses.length >= 3;
    } catch {
      return false;
    }
  });

  if (competitorsWithWeaknesses.length > 0) {
    const totalWeaknesses = competitorsWithWeaknesses.reduce((sum, c) => {
      try {
        return sum + (JSON.parse(c.weaknesses ?? '[]') as unknown[]).length;
      } catch {
        return sum;
      }
    }, 0);

    await storeInsight(userId, orgId, {
      category: 'competitor',
      insightType: 'opportunity',
      title: `${competitorsWithWeaknesses.length} competitors with 3+ identified weaknesses`,
      description: `${competitorsWithWeaknesses.length} competitors have 3 or more weaknesses identified (total: ${totalWeaknesses}). These represent opportunities to differentiate.`,
      impact: competitorsWithWeaknesses.length >= 3 ? 'high' : 'medium',
      metricName: 'competitors_with_weaknesses',
      metricBefore: 0,
      metricAfter: competitorsWithWeaknesses.length,
      dataSource: JSON.stringify({ table: 'CompetitorAnalysis', minWeaknesses: 3 }),
      isActionable: true,
      actionSuggestion: 'Review competitor weaknesses and align your marketing/sales messaging to highlight your strengths in those areas.',
      validUntil: defaultValidUntil(),
    });
    count++;
  }

  return count;
}

// ═══════════════════════════════════════════════════════════════════
// 6. BULK GENERATION + RETRIEVAL + MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Runs all insight generators and stores results in AnalyticsInsight table.
 */
export async function generateAllInsights(userId: string): Promise<{
  totalGenerated: number;
  breakdown: Record<string, number>;
}> {
  const breakdown: Record<string, number> = {};

  const generators: [string, (userId: string) => Promise<number>][] = [
    ['lead_trends', generateLeadTrendInsights],
    ['ai_trends', generateAITrendInsights],
    ['billing_trends', generateBillingTrendInsights],
    ['workflow_trends', generateWorkflowTrendInsights],
    ['anomalies', generateAnomalyInsights],
    ['opportunities', generateOpportunityInsights],
    ['risks', generateRiskInsights],
    ['competitors', generateCompetitorInsights],
  ];

  let totalGenerated = 0;

  for (const [name, generator] of generators) {
    try {
      const count = await generator(userId);
      breakdown[name] = count;
      totalGenerated += count;
    } catch (error) {
      console.error(`[AutoInsightEngine] Error in ${name} generator:`, error);
      breakdown[name] = 0;
    }
  }

  // Clean up expired insights after generation
  await cleanupExpiredInsights(userId);

  return { totalGenerated, breakdown };
}

/**
 * Retrieves stored insights with optional filters.
 */
export async function getInsights(
  userId: string,
  category?: string,
  insightType?: string,
  isRead?: boolean,
): Promise<{
  insights: Awaited<ReturnType<typeof db.analyticsInsight.findMany>>;
  total: number;
}> {
  const where: Record<string, unknown> = { userId };

  if (category) where.category = category;
  if (insightType) where.insightType = insightType;
  if (typeof isRead === 'boolean') where.isRead = isRead;

  // Only return non-expired insights
  where.validUntil = { gte: new Date() };

  const [insights, total] = await Promise.all([
    db.analyticsInsight.findMany({
      where,
      orderBy: [
        { impact: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 100,
    }),
    db.analyticsInsight.count({ where }),
  ]);

  return { insights, total };
}

/**
 * Mark insight as read.
 */
export async function markInsightRead(insightId: string, userId: string): Promise<boolean> {
  const insight = await db.analyticsInsight.findFirst({
    where: { id: insightId, userId },
  });

  if (!insight) return false;

  await db.analyticsInsight.update({
    where: { id: insightId },
    data: { isRead: true },
  });

  return true;
}

/**
 * Dismiss (delete) insight.
 */
export async function dismissInsight(insightId: string, userId: string): Promise<boolean> {
  const insight = await db.analyticsInsight.findFirst({
    where: { id: insightId, userId },
  });

  if (!insight) return false;

  await db.analyticsInsight.delete({
    where: { id: insightId },
  });

  return true;
}

/**
 * Remove expired insights.
 */
export async function cleanupExpiredInsights(userId: string): Promise<number> {
  const result = await db.analyticsInsight.deleteMany({
    where: {
      userId,
      validUntil: { lt: new Date() },
    },
  });

  return result.count;
}
