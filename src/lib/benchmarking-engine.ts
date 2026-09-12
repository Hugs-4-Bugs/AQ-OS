// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Benchmarking Engine
// Compares user metrics against org, team, and competitor benchmarks
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

interface BenchmarkInput {
  userId: string;
  orgId?: string;
  category: 'internal' | 'competitor';
  benchmarkType: string;
  metricName: string;
  yourValue: number;
  benchmarkValue: number;
  comparisonGroup?: string;
  periodStart: Date;
  periodEnd: Date;
  dataPoints?: number;
  metadata?: Record<string, unknown>;
}

interface OrgMemberMetrics {
  userId: string;
  leadCount: number;
  dealCount: number;
  avgConversionScore: number;
  avgReplyScore: number;
  avgUrgencyScore: number;
  avgRevenuePotentialScore: number;
  totalDealsValue: number;
  dealsWon: number;
  dealsDraft: number;
  contactedCount: number;
  repliedCount: number;
}

interface CompetitorScoreData {
  competitorName: string;
  seoScore: number | null;
  socialScore: number | null;
  opportunityScore: number | null;
  pricingModel: string | null;
}

// ===== UTILITY FUNCTIONS =====

/** Calculate percentile rank: what percentage of values fall below yourValue */
function calculatePercentile(yourValue: number, allValues: number[]): number {
  if (allValues.length === 0) return 50;
  const sorted = [...allValues].sort((a, b) => a - b);
  let belowCount = 0;
  for (const val of sorted) {
    if (val < yourValue) belowCount++;
    else if (val === yourValue) belowCount += 0.5;
  }
  return Math.round((belowCount / sorted.length) * 100 * 100) / 100;
}

/** Get the current billing period (month) */
function getCurrentPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

/** Get org members for a user (from user's orgId or provided orgId) */
async function getOrgMembers(orgId: string): Promise<string[]> {
  const members = await db.orgMember.findMany({
    where: { orgId },
    select: { userId: true },
  });
  return members.map(m => m.userId);
}

/** Get user's orgId */
async function getUserOrgId(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });
  return user?.orgId ?? null;
}

/** Compute metrics for a set of users in the given period */
async function computeUserMetrics(
  userIds: string[],
  periodStart: Date,
  periodEnd: Date
): Promise<OrgMemberMetrics[]> {
  const results: OrgMemberMetrics[] = [];

  for (const uid of userIds) {
    // Count leads in period
    const leadCount = await db.lead.count({
      where: {
        userId: uid,
        isActive: true,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    });

    // Get leads with scores for averaging
    const leadsWithScores = await db.lead.findMany({
      where: {
        userId: uid,
        isActive: true,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        conversionScore: true,
        replyScore: true,
        urgencyScore: true,
        revenuePotentialScore: true,
        stage: true,
      },
    });

    const leadCountNonZero = leadsWithScores.length || 1;
    const avgConversionScore =
      leadsWithScores.reduce((sum, l) => sum + l.conversionScore, 0) / leadCountNonZero;
    const avgReplyScore =
      leadsWithScores.reduce((sum, l) => sum + l.replyScore, 0) / leadCountNonZero;
    const avgUrgencyScore =
      leadsWithScores.reduce((sum, l) => sum + l.urgencyScore, 0) / leadCountNonZero;
    const avgRevenuePotentialScore =
      leadsWithScores.reduce((sum, l) => sum + l.revenuePotentialScore, 0) / leadCountNonZero;

    // Count contacted leads
    const contactedCount = leadsWithScores.filter(
      l => l.stage !== 'discovered' && l.stage !== 'analyzed'
    ).length;

    // Count replied leads
    const repliedCount = leadsWithScores.filter(
      l => ['replied', 'interested', 'negotiation', 'proposal_sent', 'closed_won'].includes(l.stage)
    ).length;

    // Count deals
    const deals = await db.deal.findMany({
      where: {
        lead: { userId: uid },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: { finalPrice: true, status: true },
    });

    const dealCount = deals.length;
    const totalDealsValue = deals.reduce((sum, d) => sum + (d.finalPrice ?? 0), 0);
    const dealsWon = deals.filter(d => d.status === 'closed_won').length;
    const dealsDraft = deals.filter(d => d.status === 'draft').length;

    results.push({
      userId: uid,
      leadCount,
      dealCount,
      avgConversionScore: Math.round(avgConversionScore * 100) / 100,
      avgReplyScore: Math.round(avgReplyScore * 100) / 100,
      avgUrgencyScore: Math.round(avgUrgencyScore * 100) / 100,
      avgRevenuePotentialScore: Math.round(avgRevenuePotentialScore * 100) / 100,
      totalDealsValue,
      dealsWon,
      dealsDraft,
      contactedCount,
      repliedCount,
    });
  }

  return results;
}

/** Store a benchmark result */
async function storeBenchmark(input: BenchmarkInput) {
  return db.analyticsBenchmark.create({
    data: {
      userId: input.userId,
      orgId: input.orgId ?? null,
      category: input.category,
      benchmarkType: input.benchmarkType,
      metricName: input.metricName,
      yourValue: input.yourValue,
      benchmarkValue: input.benchmarkValue,
      percentile: calculatePercentile(
        input.yourValue,
        input.category === 'internal'
          ? [input.yourValue, input.benchmarkValue] // will be recalculated with full group
          : [input.yourValue, input.benchmarkValue]
      ),
      comparisonGroup: input.comparisonGroup ?? null,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dataPoints: input.dataPoints ?? 0,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

/** Recalculate percentile with a full set of values from the comparison group */
async function storeBenchmarkWithPercentile(
  input: Omit<BenchmarkInput, 'percentile'> & { percentile?: number },
  groupValues: number[]
) {
  const percentile = calculatePercentile(input.yourValue, groupValues);
  return db.analyticsBenchmark.create({
    data: {
      userId: input.userId,
      orgId: input.orgId ?? null,
      category: input.category,
      benchmarkType: input.benchmarkType,
      metricName: input.metricName,
      yourValue: input.yourValue,
      benchmarkValue: input.benchmarkValue,
      percentile,
      comparisonGroup: input.comparisonGroup ?? null,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dataPoints: input.dataPoints ?? groupValues.length,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

// ===== INTERNAL BENCHMARKS =====

/**
 * Compare user's metrics against org averages.
 * Queries all org members' leads, deals, scores, and computes comparison.
 */
export async function generateOrgComparison(
  userId: string,
  orgId?: string
): Promise<Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>> {
  const resolvedOrgId = orgId ?? (await getUserOrgId(userId));
  if (!resolvedOrgId) {
    // No org — compare against all users in the system
    return generateGlobalComparison(userId);
  }

  const { start, end } = getCurrentPeriod();
  const memberIds = await getOrgMembers(resolvedOrgId);

  if (memberIds.length === 0) {
    return [];
  }

  const metrics = await computeUserMetrics(memberIds, start, end);
  const yourMetrics = metrics.find(m => m.userId === userId);

  if (!yourMetrics) {
    // User is not in org members; add them
    const yourOwnMetrics = await computeUserMetrics([userId], start, end);
    if (yourOwnMetrics.length === 0) return [];
    metrics.push(yourOwnMetrics[0]);
  }

  const userMetrics = metrics.find(m => m.userId === userId)!;
  const orgSize = metrics.length;

  // Compute org averages (excluding current user for fair comparison)
  const otherMetrics = metrics.filter(m => m.userId !== userId);
  const avgOrField = (field: keyof OrgMemberMetrics) => {
    if (otherMetrics.length === 0) return userMetrics[field] as number;
    const sum = otherMetrics.reduce((s, m) => s + (m[field] as number), 0);
    return Math.round((sum / otherMetrics.length) * 100) / 100;
  };

  const results: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }> = [];

  const metricDefs: Array<{
    metricName: string;
    getUserValue: (m: OrgMemberMetrics) => number;
    groupLabel: string;
  }> = [
    { metricName: 'lead_count', getUserValue: m => m.leadCount, groupLabel: 'org_average' },
    { metricName: 'deal_count', getUserValue: m => m.dealCount, groupLabel: 'org_average' },
    { metricName: 'avg_conversion_score', getUserValue: m => m.avgConversionScore, groupLabel: 'org_average' },
    { metricName: 'avg_reply_score', getUserValue: m => m.avgReplyScore, groupLabel: 'org_average' },
    { metricName: 'avg_urgency_score', getUserValue: m => m.avgUrgencyScore, groupLabel: 'org_average' },
    { metricName: 'avg_revenue_potential', getUserValue: m => m.avgRevenuePotentialScore, groupLabel: 'org_average' },
    { metricName: 'deals_won', getUserValue: m => m.dealsWon, groupLabel: 'org_average' },
    { metricName: 'contacted_count', getUserValue: m => m.contactedCount, groupLabel: 'org_average' },
    { metricName: 'replied_count', getUserValue: m => m.repliedCount, groupLabel: 'org_average' },
    { metricName: 'total_deals_value', getUserValue: m => m.totalDealsValue, groupLabel: 'org_average' },
  ];

  for (const def of metricDefs) {
    const yourValue = def.getUserValue(userMetrics);
    const benchmarkValue = avgOrField(def.metricName as keyof OrgMemberMetrics);
    const allValues = metrics.map(m => def.getUserValue(m));

    const benchmark = await storeBenchmarkWithPercentile(
      {
        userId,
        orgId: resolvedOrgId,
        category: 'internal',
        benchmarkType: 'org_comparison',
        metricName: def.metricName,
        yourValue,
        benchmarkValue,
        comparisonGroup: def.groupLabel,
        periodStart: start,
        periodEnd: end,
        dataPoints: orgSize,
        metadata: { orgId: resolvedOrgId, orgSize },
      },
      allValues
    );

    results.push({
      id: benchmark.id,
      metricName: def.metricName,
      yourValue,
      benchmarkValue,
      percentile: benchmark.percentile ?? 50,
    });
  }

  return results;
}

/** Fallback when user has no org — compare against all system users */
async function generateGlobalComparison(
  userId: string
): Promise<Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>> {
  const { start, end } = getCurrentPeriod();

  // Get a sample of other users for comparison
  const otherUsers = await db.user.findMany({
    where: {
      id: { not: userId },
      isActive: true,
    },
    select: { id: true },
    take: 50,
  });

  const allUserIds = [userId, ...otherUsers.map(u => u.id)];
  const metrics = await computeUserMetrics(allUserIds, start, end);
  const userMetrics = metrics.find(m => m.userId === userId);
  if (!userMetrics) return [];

  const otherMetrics = metrics.filter(m => m.userId !== userId);
  const avgOrField = (field: keyof OrgMemberMetrics) => {
    if (otherMetrics.length === 0) return userMetrics[field] as number;
    const sum = otherMetrics.reduce((s, m) => s + (m[field] as number), 0);
    return Math.round((sum / otherMetrics.length) * 100) / 100;
  };

  const results: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }> = [];

  const metricDefs: Array<{
    metricName: string;
    getUserValue: (m: OrgMemberMetrics) => number;
  }> = [
    { metricName: 'lead_count', getUserValue: m => m.leadCount },
    { metricName: 'deal_count', getUserValue: m => m.dealCount },
    { metricName: 'avg_conversion_score', getUserValue: m => m.avgConversionScore },
    { metricName: 'avg_reply_score', getUserValue: m => m.avgReplyScore },
    { metricName: 'deals_won', getUserValue: m => m.dealsWon },
    { metricName: 'contacted_count', getUserValue: m => m.contactedCount },
    { metricName: 'replied_count', getUserValue: m => m.repliedCount },
    { metricName: 'total_deals_value', getUserValue: m => m.totalDealsValue },
  ];

  for (const def of metricDefs) {
    const yourValue = def.getUserValue(userMetrics);
    const benchmarkValue = avgOrField(def.metricName as keyof OrgMemberMetrics);
    const allValues = metrics.map(m => def.getUserValue(m));

    const benchmark = await storeBenchmarkWithPercentile(
      {
        userId,
        category: 'internal',
        benchmarkType: 'org_comparison',
        metricName: def.metricName,
        yourValue,
        benchmarkValue,
        comparisonGroup: 'global_average',
        periodStart: start,
        periodEnd: end,
        dataPoints: allUserIds.length,
        metadata: { comparisonType: 'global', sampleSize: allUserIds.length },
      },
      allValues
    );

    results.push({
      id: benchmark.id,
      metricName: def.metricName,
      yourValue,
      benchmarkValue,
      percentile: benchmark.percentile ?? 50,
    });
  }

  return results;
}

/**
 * Compare user's metrics against team members.
 * Same as org comparison but scoped to the team the user belongs to.
 */
export async function generateTeamComparison(
  userId: string,
  orgId?: string
): Promise<Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>> {
  const resolvedOrgId = orgId ?? (await getUserOrgId(userId));
  if (!resolvedOrgId) {
    // No org — fall back to global comparison with team_comparison label
    const globalResults = await generateGlobalComparison(userId);
    return globalResults.map(r => ({ ...r, metricName: `team_${r.metricName}` }));
  }

  const { start, end } = getCurrentPeriod();
  const memberIds = await getOrgMembers(resolvedOrgId);

  if (memberIds.length === 0) return [];

  const metrics = await computeUserMetrics(memberIds, start, end);
  const userMetrics = metrics.find(m => m.userId === userId);

  if (!userMetrics) {
    const yourOwnMetrics = await computeUserMetrics([userId], start, end);
    if (yourOwnMetrics.length === 0) return [];
    metrics.push(yourOwnMetrics[0]);
  }

  const updatedUserMetrics = metrics.find(m => m.userId === userId)!;

  // Team comparison focuses on productivity ratios
  const yourLeadCount = updatedUserMetrics.leadCount || 1;
  const yourContactRate = updatedUserMetrics.leadCount > 0
    ? (updatedUserMetrics.contactedCount / yourLeadCount) * 100
    : 0;
  const yourReplyRate = updatedUserMetrics.contactedCount > 0
    ? (updatedUserMetrics.repliedCount / updatedUserMetrics.contactedCount) * 100
    : 0;
  const yourWinRate = updatedUserMetrics.dealCount > 0
    ? (updatedUserMetrics.dealsWon / updatedUserMetrics.dealCount) * 100
    : 0;

  const otherMetrics = metrics.filter(m => m.userId !== userId);

  // Compute team average ratios
  const teamContactRate = otherMetrics.length > 0
    ? otherMetrics.reduce((s, m) => {
        const rate = m.leadCount > 0 ? (m.contactedCount / m.leadCount) * 100 : 0;
        return s + rate;
      }, 0) / otherMetrics.length
    : yourContactRate;

  const teamReplyRate = otherMetrics.length > 0
    ? otherMetrics.reduce((s, m) => {
        const rate = m.contactedCount > 0 ? (m.repliedCount / m.contactedCount) * 100 : 0;
        return s + rate;
      }, 0) / otherMetrics.length
    : yourReplyRate;

  const teamWinRate = otherMetrics.length > 0
    ? otherMetrics.reduce((s, m) => {
        const rate = m.dealCount > 0 ? (m.dealsWon / m.dealCount) * 100 : 0;
        return s + rate;
      }, 0) / otherMetrics.length
    : yourWinRate;

  const teamAvgLeadCount = otherMetrics.length > 0
    ? otherMetrics.reduce((s, m) => s + m.leadCount, 0) / otherMetrics.length
    : updatedUserMetrics.leadCount;

  const teamAvgDealValue = otherMetrics.length > 0
    ? otherMetrics.reduce((s, m) => s + m.totalDealsValue, 0) / otherMetrics.length
    : updatedUserMetrics.totalDealsValue;

  const results: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }> = [];

  const teamMetricDefs: Array<{
    metricName: string;
    yourValue: number;
    benchmarkValue: number;
  }> = [
    { metricName: 'team_lead_count', yourValue: updatedUserMetrics.leadCount, benchmarkValue: Math.round(teamAvgLeadCount * 100) / 100 },
    { metricName: 'team_contact_rate', yourValue: Math.round(yourContactRate * 100) / 100, benchmarkValue: Math.round(teamContactRate * 100) / 100 },
    { metricName: 'team_reply_rate', yourValue: Math.round(yourReplyRate * 100) / 100, benchmarkValue: Math.round(teamReplyRate * 100) / 100 },
    { metricName: 'team_win_rate', yourValue: Math.round(yourWinRate * 100) / 100, benchmarkValue: Math.round(teamWinRate * 100) / 100 },
    { metricName: 'team_avg_deal_value', yourValue: updatedUserMetrics.totalDealsValue, benchmarkValue: Math.round(teamAvgDealValue * 100) / 100 },
    { metricName: 'team_deals_won', yourValue: updatedUserMetrics.dealsWon, benchmarkValue: otherMetrics.length > 0 ? Math.round(otherMetrics.reduce((s, m) => s + m.dealsWon, 0) / otherMetrics.length * 100) / 100 : updatedUserMetrics.dealsWon },
  ];

  for (const def of teamMetricDefs) {
    const allValues = metrics.map(m => {
      switch (def.metricName) {
        case 'team_lead_count': return m.leadCount;
        case 'team_contact_rate': return m.leadCount > 0 ? (m.contactedCount / m.leadCount) * 100 : 0;
        case 'team_reply_rate': return m.contactedCount > 0 ? (m.repliedCount / m.contactedCount) * 100 : 0;
        case 'team_win_rate': return m.dealCount > 0 ? (m.dealsWon / m.dealCount) * 100 : 0;
        case 'team_avg_deal_value': return m.totalDealsValue;
        case 'team_deals_won': return m.dealsWon;
        default: return 0;
      }
    });

    const benchmark = await storeBenchmarkWithPercentile(
      {
        userId,
        orgId: resolvedOrgId,
        category: 'internal',
        benchmarkType: 'team_comparison',
        metricName: def.metricName,
        yourValue: def.yourValue,
        benchmarkValue: def.benchmarkValue,
        comparisonGroup: 'team_average',
        periodStart: start,
        periodEnd: end,
        dataPoints: metrics.length,
        metadata: { orgId: resolvedOrgId, teamSize: metrics.length },
      },
      allValues
    );

    results.push({
      id: benchmark.id,
      metricName: def.metricName,
      yourValue: def.yourValue,
      benchmarkValue: def.benchmarkValue,
      percentile: benchmark.percentile ?? 50,
    });
  }

  return results;
}

// ===== COMPETITOR BENCHMARKS =====

/**
 * Compare user's lead scores vs competitor scores from CompetitorAnalysis table.
 */
export async function generateScoreComparison(
  userId: string
): Promise<Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>> {
  const { start, end } = getCurrentPeriod();

  // Get user's average lead scores
  const userLeads = await db.lead.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      conversionScore: true,
      replyScore: true,
      urgencyScore: true,
      revenuePotentialScore: true,
    },
  });

  const leadCount = userLeads.length || 1;
  const userAvgConversion = userLeads.reduce((s, l) => s + l.conversionScore, 0) / leadCount;
  const userAvgReply = userLeads.reduce((s, l) => s + l.replyScore, 0) / leadCount;
  const userAvgUrgency = userLeads.reduce((s, l) => s + l.urgencyScore, 0) / leadCount;
  const userAvgRevenue = userLeads.reduce((s, l) => s + l.revenuePotentialScore, 0) / leadCount;

  // Get user's competitor analyses
  const competitorAnalyses = await db.competitorAnalysis.findMany({
    where: { userId },
    select: {
      competitorName: true,
      seoScore: true,
      socialScore: true,
      opportunityScore: true,
    },
  });

  if (competitorAnalyses.length === 0) {
    // No competitor data — store benchmarks with 0 competitor values
    const emptyResults: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }> = [];
    const scoreMetrics = [
      { metricName: 'competitor_seo_score', yourValue: Math.round(userAvgConversion * 100) / 100, benchmarkValue: 0 },
      { metricName: 'competitor_social_score', yourValue: Math.round(userAvgReply * 100) / 100, benchmarkValue: 0 },
      { metricName: 'competitor_opportunity_score', yourValue: Math.round((userAvgConversion + userAvgReply + userAvgUrgency + userAvgRevenue) / 4 * 100) / 100, benchmarkValue: 0 },
    ];

    for (const def of scoreMetrics) {
      const benchmark = await storeBenchmark({
        userId,
        category: 'competitor',
        benchmarkType: 'score_comparison',
        metricName: def.metricName,
        yourValue: def.yourValue,
        benchmarkValue: def.benchmarkValue,
        percentile: 50,
        comparisonGroup: 'competitor_average',
        periodStart: start,
        periodEnd: end,
        dataPoints: 0,
        metadata: { note: 'No competitor data available' },
      });

      emptyResults.push({
        id: benchmark.id,
        metricName: def.metricName,
        yourValue: def.yourValue,
        benchmarkValue: def.benchmarkValue,
        percentile: 50,
      });
    }

    return emptyResults;
  }

  // Compute competitor averages
  const competitorSeoScores = competitorAnalyses
    .map(c => c.seoScore)
    .filter((s): s is number => s !== null);
  const competitorSocialScores = competitorAnalyses
    .map(c => c.socialScore)
    .filter((s): s is number => s !== null);
  const competitorOpportunityScores = competitorAnalyses
    .map(c => c.opportunityScore)
    .filter((s): s is number => s !== null);

  const avgCompetitorSeo = competitorSeoScores.length > 0
    ? competitorSeoScores.reduce((s, v) => s + v, 0) / competitorSeoScores.length
    : 0;
  const avgCompetitorSocial = competitorSocialScores.length > 0
    ? competitorSocialScores.reduce((s, v) => s + v, 0) / competitorSocialScores.length
    : 0;
  const avgCompetitorOpportunity = competitorOpportunityScores.length > 0
    ? competitorOpportunityScores.reduce((s, v) => s + v, 0) / competitorOpportunityScores.length
    : 0;

  // User's composite scores (normalize to 0-100 scale like competitor scores)
  const userSeoComparable = Math.min(100, userAvgConversion * 10); // scale up
  const userSocialComparable = Math.min(100, userAvgReply * 10);
  const userOpportunityComparable = Math.min(100, ((userAvgConversion + userAvgReply + userAvgUrgency + userAvgRevenue) / 4) * 10);

  const results: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }> = [];

  const scoreMetrics: Array<{
    metricName: string;
    yourValue: number;
    benchmarkValue: number;
    competitorValues: number[];
  }> = [
    {
      metricName: 'competitor_seo_score',
      yourValue: Math.round(userSeoComparable * 100) / 100,
      benchmarkValue: Math.round(avgCompetitorSeo * 100) / 100,
      competitorValues: competitorSeoScores,
    },
    {
      metricName: 'competitor_social_score',
      yourValue: Math.round(userSocialComparable * 100) / 100,
      benchmarkValue: Math.round(avgCompetitorSocial * 100) / 100,
      competitorValues: competitorSocialScores,
    },
    {
      metricName: 'competitor_opportunity_score',
      yourValue: Math.round(userOpportunityComparable * 100) / 100,
      benchmarkValue: Math.round(avgCompetitorOpportunity * 100) / 100,
      competitorValues: competitorOpportunityScores,
    },
  ];

  for (const def of scoreMetrics) {
    const allValues = [def.yourValue, ...def.competitorValues];
    const benchmark = await storeBenchmarkWithPercentile(
      {
        userId,
        category: 'competitor',
        benchmarkType: 'score_comparison',
        metricName: def.metricName,
        yourValue: def.yourValue,
        benchmarkValue: def.benchmarkValue,
        comparisonGroup: 'competitor_average',
        periodStart: start,
        periodEnd: end,
        dataPoints: competitorAnalyses.length,
        metadata: {
          competitorCount: competitorAnalyses.length,
          competitors: competitorAnalyses.map(c => c.competitorName),
        },
      },
      allValues
    );

    results.push({
      id: benchmark.id,
      metricName: def.metricName,
      yourValue: def.yourValue,
      benchmarkValue: def.benchmarkValue,
      percentile: benchmark.percentile ?? 50,
    });
  }

  return results;
}

/**
 * Compare user's plan pricing vs competitor pricing models.
 */
export async function generatePricingComparison(
  userId: string
): Promise<Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>> {
  const { start, end } = getCurrentPeriod();

  // Get user's current plan and subscription
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const userPlan = user?.plan ?? 'free';

  // Plan pricing mapping
  const planPricing: Record<string, number> = {
    free: 0,
    pro: 49,
    elite: 149,
  };

  const userPrice = planPricing[userPlan] ?? 0;

  // Get competitor pricing data
  const competitorAnalyses = await db.competitorAnalysis.findMany({
    where: { userId },
    select: {
      competitorName: true,
      pricingModel: true,
      pricingDetails: true,
    },
  });

  // Parse competitor pricing
  const competitorPrices: number[] = [];
  const competitorPricingModels: Array<{ name: string; model: string; price: number }> = [];

  for (const comp of competitorAnalyses) {
    let price = 0;
    let model = comp.pricingModel ?? 'unknown';

    if (comp.pricingDetails) {
      try {
        const details = JSON.parse(comp.pricingDetails);
        if (details.startingPrice !== undefined) {
          price = Number(details.startingPrice) || 0;
        } else if (details.monthlyPrice !== undefined) {
          price = Number(details.monthlyPrice) || 0;
        } else if (details.price !== undefined) {
          price = Number(details.price) || 0;
        }
        if (details.model) model = details.model;
      } catch {
        // pricingDetails is not valid JSON, use pricingModel
      }
    }

    if (price > 0) {
      competitorPrices.push(price);
    }
    competitorPricingModels.push({ name: comp.competitorName, model, price });
  }

  const avgCompetitorPrice = competitorPrices.length > 0
    ? competitorPrices.reduce((s, p) => s + p, 0) / competitorPrices.length
    : 0;

  const results: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }> = [];

  const pricingMetrics: Array<{
    metricName: string;
    yourValue: number;
    benchmarkValue: number;
  }> = [
    {
      metricName: 'pricing_monthly_cost',
      yourValue: userPrice,
      benchmarkValue: Math.round(avgCompetitorPrice * 100) / 100,
    },
    {
      metricName: 'pricing_value_score',
      yourValue: userPrice > 0 ? Math.round((100 / userPrice) * 100) / 100 : 100,
      benchmarkValue: avgCompetitorPrice > 0 ? Math.round((100 / avgCompetitorPrice) * 100) / 100 : 0,
    },
  ];

  for (const def of pricingMetrics) {
    const allValues = [def.yourValue, ...competitorPrices];
    const benchmark = await storeBenchmarkWithPercentile(
      {
        userId,
        category: 'competitor',
        benchmarkType: 'pricing_comparison',
        metricName: def.metricName,
        yourValue: def.yourValue,
        benchmarkValue: def.benchmarkValue,
        comparisonGroup: 'competitor_average',
        periodStart: start,
        periodEnd: end,
        dataPoints: competitorAnalyses.length,
        metadata: {
          userPlan,
          competitorPricingModels,
          competitorCount: competitorAnalyses.length,
        },
      },
      allValues
    );

    results.push({
      id: benchmark.id,
      metricName: def.metricName,
      yourValue: def.yourValue,
      benchmarkValue: def.benchmarkValue,
      percentile: benchmark.percentile ?? 50,
    });
  }

  return results;
}

/**
 * Compare user's SEO metrics vs competitor SEO scores.
 */
export async function generateSEOComparison(
  userId: string
): Promise<Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>> {
  const { start, end } = getCurrentPeriod();

  // Get user's lead website quality data
  const userLeads = await db.lead.findMany({
    where: {
      userId,
      isActive: true,
      hasWebsite: true,
    },
    select: {
      websiteQuality: true,
      conversionScore: true,
    },
  });

  // Compute user's SEO-equivalent score from lead data
  const websiteQualityMap: Record<string, number> = {
    none: 0,
    poor: 20,
    below_average: 35,
    average: 50,
    good: 70,
    excellent: 90,
  };

  const userSeoScores = userLeads.map(l => {
    const qualityScore = websiteQualityMap[l.websiteQuality ?? 'none'] ?? 0;
    const conversionBonus = Math.min(30, l.conversionScore * 3);
    return qualityScore + conversionBonus;
  });

  const userAvgSeo = userSeoScores.length > 0
    ? userSeoScores.reduce((s, v) => s + v, 0) / userSeoScores.length
    : 0;

  // Get competitor SEO data
  const competitorAnalyses = await db.competitorAnalysis.findMany({
    where: { userId },
    select: {
      competitorName: true,
      seoScore: true,
    },
  });

  const competitorSeoScores = competitorAnalyses
    .map(c => c.seoScore)
    .filter((s): s is number => s !== null);

  const avgCompetitorSeo = competitorSeoScores.length > 0
    ? competitorSeoScores.reduce((s, v) => s + v, 0) / competitorSeoScores.length
    : 0;

  // Also get CompetitorSnapshot data for more SEO metrics
  const competitorSnapshots = await db.competitorSnapshot.findMany({
    where: {
      userId,
      snapshotType: { in: ['seo', 'full'] },
    },
    select: {
      seoScore: true,
      competitorId: true,
    },
  });

  const snapshotSeoScores = competitorSnapshots
    .map(s => s.seoScore)
    .filter((s): s is number => s !== null);

  const allCompetitorSeoScores = [...competitorSeoScores, ...snapshotSeoScores];
  const avgAllCompetitorSeo = allCompetitorSeoScores.length > 0
    ? allCompetitorSeoScores.reduce((s, v) => s + v, 0) / allCompetitorSeoScores.length
    : avgCompetitorSeo;

  const results: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }> = [];

  const seoMetrics: Array<{
    metricName: string;
    yourValue: number;
    benchmarkValue: number;
  }> = [
    {
      metricName: 'seo_avg_score',
      yourValue: Math.round(userAvgSeo * 100) / 100,
      benchmarkValue: Math.round(avgAllCompetitorSeo * 100) / 100,
    },
    {
      metricName: 'seo_website_coverage',
      yourValue: userLeads.length > 0 ? (userLeads.filter(l => l.websiteQuality && l.websiteQuality !== 'none').length / userLeads.length) * 100 : 0,
      benchmarkValue: 85, // industry average
    },
  ];

  for (const def of seoMetrics) {
    const allValues = [def.yourValue, ...allCompetitorSeoScores];
    const benchmark = await storeBenchmarkWithPercentile(
      {
        userId,
        category: 'competitor',
        benchmarkType: 'seo_comparison',
        metricName: def.metricName,
        yourValue: def.yourValue,
        benchmarkValue: def.benchmarkValue,
        comparisonGroup: 'competitor_average',
        periodStart: start,
        periodEnd: end,
        dataPoints: allCompetitorSeoScores.length || competitorAnalyses.length,
        metadata: {
          competitorCount: competitorAnalyses.length,
          snapshotCount: competitorSnapshots.length,
          userLeadCount: userLeads.length,
        },
      },
      allValues
    );

    results.push({
      id: benchmark.id,
      metricName: def.metricName,
      yourValue: def.yourValue,
      benchmarkValue: def.benchmarkValue,
      percentile: benchmark.percentile ?? 50,
    });
  }

  return results;
}

// ===== BULK OPERATIONS =====

/**
 * Run all benchmarks for a user.
 */
export async function generateAllBenchmarks(
  userId: string,
  orgId?: string
): Promise<{
  orgComparison: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>;
  teamComparison: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>;
  scoreComparison: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>;
  pricingComparison: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>;
  seoComparison: Array<{ id: string; metricName: string; yourValue: number; benchmarkValue: number; percentile: number }>;
}> {
  const [orgComparison, teamComparison, scoreComparison, pricingComparison, seoComparison] = await Promise.all([
    generateOrgComparison(userId, orgId).catch(err => {
      console.error('Org comparison error:', err);
      return [];
    }),
    generateTeamComparison(userId, orgId).catch(err => {
      console.error('Team comparison error:', err);
      return [];
    }),
    generateScoreComparison(userId).catch(err => {
      console.error('Score comparison error:', err);
      return [];
    }),
    generatePricingComparison(userId).catch(err => {
      console.error('Pricing comparison error:', err);
      return [];
    }),
    generateSEOComparison(userId).catch(err => {
      console.error('SEO comparison error:', err);
      return [];
    }),
  ]);

  return {
    orgComparison,
    teamComparison,
    scoreComparison,
    pricingComparison,
    seoComparison,
  };
}

/**
 * Retrieve stored benchmarks with optional filters.
 */
export async function getBenchmarks(
  userId: string,
  category?: string,
  benchmarkType?: string
): Promise<Array<{
  id: string;
  orgId: string | null;
  category: string;
  benchmarkType: string;
  metricName: string;
  yourValue: number;
  benchmarkValue: number;
  percentile: number | null;
  comparisonGroup: string | null;
  periodStart: Date;
  periodEnd: Date;
  dataPoints: number;
  metadata: string | null;
  createdAt: Date;
}>> {
  const where: Record<string, unknown> = { userId };

  if (category) {
    where.category = category;
  }
  if (benchmarkType) {
    where.benchmarkType = benchmarkType;
  }

  return db.analyticsBenchmark.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}
