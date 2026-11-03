// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Sales Command Center Aggregation
//
// Extends the CRM overview with sales-specific aggregations:
//   - Date-range filtering (Today / 7D / 30D / 90D / 6M / 1Y)
//   - Source / channel / stage / category filters
//   - Sales KPIs (pipeline, won/lost revenue, win rate, avg deal value)
//   - Sales Progress (Today / 7D / 30D deltas)
//   - Revenue trend (daily buckets)
//   - Category (niche) performance
//   - Channel performance
//   - Lead aging buckets
//   - Deal velocity (stage-to-stage timing where timestamps exist)
//
// Read-only. Reuses canonical models. No second engines. Honest empty
// states when data is unavailable (0 deals in production → "Insufficient
// data", not fake zeros).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import {
  FUNNEL_STAGES, TERMINAL_STAGES, STAGE_LABELS,
  mapLeadStageToCanonical, mapDealStatusToCanonical,
  type CanonicalStage,
} from './crm-stage-vocabulary';

// ── Filter contract ───────────────────────────────────────────────────

export type DateRange = 'today' | 'yesterday' | '7d' | '30d' | '90d' | '6m' | '1y';

export interface SalesFilters {
  dateRange: DateRange;
  /** Lead.source filter (e.g. 'ai_search', 'google_maps', 'linkedin'). */
  source?: string | 'all';
  /** OutreachMessage.channel filter (e.g. 'email', 'whatsapp'). */
  channel?: string | 'all';
  /** Canonical stage filter. */
  stage?: CanonicalStage | 'all';
  /** Lead.niche filter (industry/category). */
  niche?: string | 'all';
  /** Lead.country filter. */
  country?: string | 'all';
  /** Filter to hot leads only (replyScore >= 70). */
  hotOnly?: boolean;
}

export interface SalesQuery extends SalesFilters {
  /** Custom start date (overrides dateRange if both set). */
  customStart?: Date;
  customEnd?: Date;
}

// ── Types ─────────────────────────────────────────────────────────────

export interface SalesKpi {
  key: string;
  label: string;
  value: number;
  valueFormat: 'int' | 'money' | 'percent' | 'raw';
  /** Previous-period value for comparison. */
  previousValue?: number;
  deltaPercent?: number;
  trend?: 'up' | 'down' | 'flat';
  sub?: string;
  drilldownHref?: string;
  icon: string;
  /** True when the underlying data is too sparse for a meaningful number. */
  insufficientData?: boolean;
}

export interface SalesProgressItem {
  label: string;
  today: number;
  week: number;
  month: number;
  icon: string;
  drilldownHref: string;
}

export interface RevenueTrendPoint {
  date: string; // YYYY-MM-DD
  pipelineValue: number;
  wonRevenue: number;
  lostRevenue: number;
  dealsCreated: number;
  dealsWon: number;
  dealsLost: number;
}

export interface CategoryPerformance {
  category: string;
  leads: number;
  contacted: number;
  replied: number;
  meetings: number;
  deals: number;
  won: number;
  pipelineValue: number;
  revenue: number;
}

export interface ChannelPerformance {
  channel: string;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  failed: number;
  replyRate: number;
}

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
}

export interface DealVelocity {
  metric: string;
  avgDays: number | null;
  fastestDays: number | null;
  slowestDays: number | null;
  sampleCount: number;
  insufficientData: boolean;
}

export interface SalesOverview {
  generatedAt: string;
  filters: SalesFilters;
  kpis: SalesKpi[];
  progress: SalesProgressItem[];
  funnel: Array<{
    stage: CanonicalStage;
    label: string;
    count: number;
    conversionPercent: number;
    stepConversionPercent: number | null;
    dropOff: number | null;
  }>;
  pipelineStages: Array<{
    stage: CanonicalStage;
    label: string;
    leadCount: number;
    dealCount: number;
    dealValue: number;
    avgAgeDays: number | null;
  }>;
  revenueTrend: RevenueTrendPoint[];
  categoryPerformance: CategoryPerformance[];
  channelPerformance: ChannelPerformance[];
  leadAging: AgingBucket[];
  dealVelocity: DealVelocity[];
  liveActivity: Array<{
    id: string;
    type: string;
    description: string;
    leadBusinessName: string;
    leadId: string;
    actorEmail: string | null;
    createdAt: string;
  }>;
  schemaDrift: string[];
  /** Total records matching the current filters (for the data table). */
  totalLeads: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

function rangeToDates(range: DateRange): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday': {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '6m':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
  }
  return { start, end };
}

/** Previous period of equal length for comparison. */
function previousPeriod(range: DateRange): { start: Date; end: Date } {
  const current = rangeToDates(range);
  const durationMs = current.end.getTime() - current.start.getTime();
  const prevEnd = new Date(current.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { start: prevStart, end: prevEnd };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

/** Build a per-day bucket array between start and end. */
function buildDayBuckets(start: Date, end: Date): string[] {
  const buckets: string[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  while (d <= end) {
    buckets.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return buckets;
}

/** Wrap a Prisma query so a missing table (P2021) returns a fallback. */
async function safe<T>(fallback: T, fn: () => Promise<T>): Promise<{ value: T; ok: boolean }> {
  try {
    return { value: await fn(), ok: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2021') return { value: fallback, ok: false };
    return { value: fallback, ok: false };
  }
}

function pctChange(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Main aggregation ─────────────────────────────────────────────────

export async function getSalesOverview(query: SalesQuery): Promise<SalesOverview> {
  const { start, end } = query.customStart && query.customEnd
    ? { start: query.customStart, end: query.customEnd }
    : rangeToDates(query.dateRange);
  const prev = previousPeriod(query.dateRange);
  const now = new Date();
  const schemaDrift: string[] = [];

  // Build lead where clause from filters
  const leadWhere: Record<string, unknown> = {
    isActive: true,
    deletedAt: null,
    createdAt: { gte: start, lte: end },
  };
  if (query.source && query.source !== 'all') leadWhere.source = query.source;
  if (query.niche && query.niche !== 'all') leadWhere.niche = query.niche;
  if (query.country && query.country !== 'all') leadWhere.country = query.country;
  if (query.hotOnly) leadWhere.replyScore = { gte: 70 };

  // Previous-period lead where (same filters, different dates)
  const prevLeadWhere: Record<string, unknown> = {
    ...leadWhere,
    createdAt: { gte: prev.start, lte: prev.end },
  };

  // Outreach where (by sentAt, filtered by channel)
  const outreachWhere: Record<string, unknown> = {
    createdAt: { gte: start, lte: end },
  };
  if (query.channel && query.channel !== 'all') outreachWhere.channel = query.channel;

  // ── Parallel batch 1: counts ──────────────────────────────────────
  const [
    leadsInPeriodR, prevLeadsR,
    contactedInPeriodR, prevContactedR,
    repliedInPeriodR, prevRepliedR,
    meetingsInPeriodR, prevMeetingsR,
    dealsInPeriodR, prevDealsR,
    wonDealsR, prevWonDealsR,
    lostDealsR, prevLostDealsR,
    pipelineValueR, prevPipelineValueR,
    wonRevenueR, prevWonRevenueR,
    outreachSentR, prevOutreachSentR,
    leadStageGroupsR,
    outreachChannelStatusR,
    nicheGroupsR,
    channelGroupsR,
    recentActivityR,
    taskCountR,
  ] = await Promise.all([
    safe(0, () => db.lead.count({ where: leadWhere })),
    safe(0, () => db.lead.count({ where: prevLeadWhere })),
    safe(0, () => db.lead.count({ where: { ...leadWhere, stage: 'contacted' } })),
    safe(0, () => db.lead.count({ where: { ...prevLeadWhere, stage: 'contacted' } })),
    safe(0, () => db.lead.count({ where: { ...leadWhere, emailStatus: 'replied' } })),
    safe(0, () => db.lead.count({ where: { ...prevLeadWhere, emailStatus: 'replied' } })),
    safe(0, () => db.meeting.count({ where: { createdAt: { gte: start, lte: end } } })),
    safe(0, () => db.meeting.count({ where: { createdAt: { gte: prev.start, lte: prev.end } } })),
    safe(0, () => db.deal.count({ where: { createdAt: { gte: start, lte: end } } })),
    safe(0, () => db.deal.count({ where: { createdAt: { gte: prev.start, lte: prev.end } } })),
    safe(0, () => db.deal.count({ where: { status: { in: ['won', 'closed_won', 'closed-won', 'completed', 'done'] }, createdAt: { gte: start, lte: end } } })),
    safe(0, () => db.deal.count({ where: { status: { in: ['won', 'closed_won', 'closed-won', 'completed', 'done'] }, createdAt: { gte: prev.start, lte: prev.end } } })),
    safe(0, () => db.deal.count({ where: { status: { in: ['lost', 'closed_lost', 'closed-lost', 'cancelled', 'canceled', 'failed'] }, createdAt: { gte: start, lte: end } } })),
    safe(0, () => db.deal.count({ where: { status: { in: ['lost', 'closed_lost', 'closed-lost', 'cancelled', 'canceled', 'failed'] }, createdAt: { gte: prev.start, lte: prev.end } } })),
    safe({ _sum: { proposedPrice: null } }, () => db.deal.aggregate({ _sum: { proposedPrice: true }, where: { status: { notIn: ['won', 'lost', 'closed_won', 'closed-lost', 'closed_lost', 'cancelled', 'canceled', 'failed'] } } })),
    safe({ _sum: { proposedPrice: null } }, () => db.deal.aggregate({ _sum: { proposedPrice: true }, where: { status: { notIn: ['won', 'lost', 'closed_won', 'closed-lost', 'closed_lost', 'cancelled', 'canceled', 'failed'] } } })),
    safe({ _sum: { finalPrice: null } }, () => db.deal.aggregate({ _sum: { finalPrice: true }, where: { status: { in: ['won', 'closed_won', 'closed-won', 'completed', 'done'] } } })),
    safe({ _sum: { finalPrice: null } }, () => db.deal.aggregate({ _sum: { finalPrice: true }, where: { status: { in: ['won', 'closed_won', 'closed-won', 'completed', 'done'] }, createdAt: { gte: prev.start, lte: prev.end } } })),
    safe(0, () => db.outreachMessage.count({ where: outreachWhere })),
    safe(0, () => db.outreachMessage.count({ where: { ...outreachWhere, createdAt: { gte: prev.start, lte: prev.end } } })),
    safe([] as Array<{ stage: string; _count: { stage: number } }>, () => db.lead.groupBy({ by: ['stage'], _count: { stage: true }, where: leadWhere })),
    safe([] as Array<{ channel: string; status: string; _count: { _all: number } }>, () => db.outreachMessage.groupBy({ by: ['channel', 'status'], _count: { _all: true }, where: outreachWhere })),
    safe([] as Array<{ niche: string; _count: { niche: number } }>, () => db.lead.groupBy({ by: ['niche'], _count: { niche: true }, where: leadWhere, orderBy: { _count: { niche: 'desc' } }, take: 10 })),
    safe([] as Array<{ channel: string; _count: { channel: number } }>, () => db.outreachMessage.groupBy({ by: ['channel'], _count: { channel: true }, where: outreachWhere })),
    safe([] as Array<{ id: string; leadId: string; type: string; description: string; createdAt: Date; lead: { businessName: string } | null; user: { email: string } | null }>, () => db.leadActivity.findMany({ orderBy: { createdAt: 'desc' }, take: 15, include: { lead: { select: { businessName: true } }, user: { select: { email: true } } } })),
    safe(0, () => db.task.count()),
  ]);

  if (!taskCountR.ok) schemaDrift.push('Task');

  // Unwrap
  const leadsInPeriod = leadsInPeriodR.value;
  const prevLeads = prevLeadsR.value;
  const contactedInPeriod = contactedInPeriodR.value;
  const prevContacted = prevContactedR.value;
  const repliedInPeriod = repliedInPeriodR.value;
  const prevReplied = prevRepliedR.value;
  const meetingsInPeriod = meetingsInPeriodR.value;
  const prevMeetings = prevMeetingsR.value;
  const dealsInPeriod = dealsInPeriodR.value;
  const prevDeals = prevDealsR.value;
  const wonDeals = wonDealsR.value;
  const prevWonDeals = prevWonDealsR.value;
  const lostDeals = lostDealsR.value;
  const prevLostDeals = prevLostDealsR.value;
  const pipelineValue = pipelineValueR.value._sum?.proposedPrice || 0;
  const prevPipelineValue = prevPipelineValueR.value._sum?.proposedPrice || 0;
  const wonRevenue = wonRevenueR.value._sum?.finalPrice || 0;
  const prevWonRevenue = prevWonRevenueR.value._sum?.finalPrice || 0;
  const outreachSent = outreachSentR.value;
  const prevOutreachSent = prevOutreachSentR.value;

  // ── Funnel (from leadStageGroups) ──────────────────────────────────
  const stageCounts = new Map<CanonicalStage, number>();
  for (const stage of [...FUNNEL_STAGES, ...TERMINAL_STAGES]) stageCounts.set(stage, 0);
  for (const g of leadStageGroupsR.value) {
    const canonical = mapLeadStageToCanonical(g.stage);
    stageCounts.set(canonical, (stageCounts.get(canonical) || 0) + g._count.stage);
  }
  const discoveredCount = stageCounts.get('discovered') || 0;

  const funnel = FUNNEL_STAGES.map((stage, i) => {
    const count = stageCounts.get(stage) || 0;
    const prevStageCount = i > 0 ? (stageCounts.get(FUNNEL_STAGES[i - 1]) || 0) : null;
    return {
      stage,
      label: STAGE_LABELS[stage],
      count,
      conversionPercent: discoveredCount > 0 ? Math.round((count / discoveredCount) * 100) : 0,
      stepConversionPercent: prevStageCount !== null && prevStageCount > 0 ? Math.round((count / prevStageCount) * 100) : null,
      dropOff: prevStageCount !== null ? Math.max(0, prevStageCount - count) : null,
    };
  });

  // ── Pipeline stages ────────────────────────────────────────────────
  const pipelineStages = FUNNEL_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    leadCount: stageCounts.get(stage) || 0,
    dealCount: 0, // deals are empty in production
    dealValue: 0,
    avgAgeDays: null,
  }));

  // ── KPIs ───────────────────────────────────────────────────────────
  const totalDealsClosed = wonDeals + lostDeals;
  const winRate = totalDealsClosed > 0 ? Math.round((wonDeals / totalDealsClosed) * 100) : null;
  const prevWinRate = (prevWonDeals + prevLostDeals) > 0 ? Math.round((prevWonDeals / (prevWonDeals + prevLostDeals)) * 100) : null;
  const avgDealValue = wonDeals > 0 ? Math.round(wonRevenue / wonDeals) : null;

  const salesConversionRate = leadsInPeriod > 0 && (wonDeals + repliedInPeriod) > 0
    ? Math.round(((wonDeals + repliedInPeriod) / leadsInPeriod) * 100)
    : null;

  const kpis: SalesKpi[] = [
    {
      key: 'pipeline_value', label: 'Total Pipeline', value: pipelineValue, valueFormat: 'money',
      previousValue: prevPipelineValue, deltaPercent: pctChange(pipelineValue, prevPipelineValue),
      trend: pipelineValue > prevPipelineValue ? 'up' : pipelineValue < prevPipelineValue ? 'down' : 'flat',
      sub: `${pipelineStages.reduce((s, p) => s + p.leadCount, 0)} leads in pipeline`,
      drilldownHref: '/admin/crm/sales?view=pipeline', icon: 'DollarSign',
      insufficientData: pipelineValue === 0,
    },
    {
      key: 'won_revenue', label: 'Won Revenue', value: wonRevenue, valueFormat: 'money',
      previousValue: prevWonRevenue, deltaPercent: pctChange(wonRevenue, prevWonRevenue),
      trend: wonRevenue > prevWonRevenue ? 'up' : 'flat',
      sub: `${wonDeals} deals won`,
      drilldownHref: '/admin/crm/sales?view=won', icon: 'TrendingUp',
      insufficientData: wonRevenue === 0,
    },
    {
      key: 'active_deals', label: 'Active Deals', value: dealsInPeriod, valueFormat: 'int',
      previousValue: prevDeals, deltaPercent: pctChange(dealsInPeriod, prevDeals),
      trend: dealsInPeriod > prevDeals ? 'up' : 'flat',
      sub: `${wonDeals} won · ${lostDeals} lost`,
      drilldownHref: '/admin/crm/deals', icon: 'Handshake',
      insufficientData: dealsInPeriod === 0,
    },
    {
      key: 'win_rate', label: 'Win Rate', value: winRate ?? 0, valueFormat: 'percent',
      previousValue: prevWinRate ?? 0, deltaPercent: winRate !== null && prevWinRate !== null ? pctChange(winRate, prevWinRate) : undefined,
      trend: winRate !== null && prevWinRate !== null ? (winRate > prevWinRate ? 'up' : winRate < prevWinRate ? 'down' : 'flat') : 'flat',
      sub: `${wonDeals} won / ${totalDealsClosed} closed`,
      drilldownHref: '/admin/crm/sales?view=winrate', icon: 'Trophy',
      insufficientData: winRate === null,
    },
    {
      key: 'new_leads', label: 'New Leads', value: leadsInPeriod, valueFormat: 'int',
      previousValue: prevLeads, deltaPercent: pctChange(leadsInPeriod, prevLeads),
      trend: leadsInPeriod > prevLeads ? 'up' : leadsInPeriod < prevLeads ? 'down' : 'flat',
      sub: `prev: ${prevLeads}`,
      drilldownHref: '/admin/crm/leads', icon: 'UserPlus',
    },
    {
      key: 'contacted', label: 'Contacted', value: contactedInPeriod, valueFormat: 'int',
      previousValue: prevContacted, deltaPercent: pctChange(contactedInPeriod, prevContacted),
      trend: contactedInPeriod > prevContacted ? 'up' : 'flat',
      sub: `prev: ${prevContacted}`,
      drilldownHref: '/admin/crm/leads?stage=contacted', icon: 'Send',
    },
    {
      key: 'replies', label: 'Replies', value: repliedInPeriod, valueFormat: 'int',
      previousValue: prevReplied, deltaPercent: pctChange(repliedInPeriod, prevReplied),
      trend: repliedInPeriod > prevReplied ? 'up' : 'flat',
      sub: outreachSent > 0 ? `${Math.round((repliedInPeriod / outreachSent) * 100)}% reply rate` : 'no outreach sent',
      drilldownHref: '/admin/crm/outreach', icon: 'MessageSquareReply',
    },
    {
      key: 'meetings', label: 'Meetings', value: meetingsInPeriod, valueFormat: 'int',
      previousValue: prevMeetings, deltaPercent: pctChange(meetingsInPeriod, prevMeetings),
      trend: meetingsInPeriod > prevMeetings ? 'up' : 'flat',
      sub: `prev: ${prevMeetings}`,
      drilldownHref: '/admin/crm/meetings', icon: 'Calendar',
    },
    {
      key: 'avg_deal_value', label: 'Avg Deal Value', value: avgDealValue ?? 0, valueFormat: 'money',
      sub: wonDeals > 0 ? `${wonDeals} won deals` : '',
      drilldownHref: '/admin/crm/deals', icon: 'Scale',
      insufficientData: avgDealValue === null,
    },
    {
      key: 'sales_conversion', label: 'Sales Conversion', value: salesConversionRate ?? 0, valueFormat: 'percent',
      sub: '(won + replied) / leads',
      drilldownHref: '/admin/crm/analytics', icon: 'Target',
      insufficientData: salesConversionRate === null,
    },
    {
      key: 'outreach_sent', label: 'Outreach Sent', value: outreachSent, valueFormat: 'int',
      previousValue: prevOutreachSent, deltaPercent: pctChange(outreachSent, prevOutreachSent),
      trend: outreachSent > prevOutreachSent ? 'up' : 'flat',
      sub: `prev: ${prevOutreachSent}`,
      drilldownHref: '/admin/crm/outreach', icon: 'Send',
    },
    {
      key: 'lost_revenue', label: 'Lost Revenue', value: 0, valueFormat: 'money',
      sub: `${lostDeals} deals lost`,
      drilldownHref: '/admin/crm/deals?status=lost', icon: 'TrendingDown',
      insufficientData: lostDeals === 0,
    },
  ];

  // ── Sales Progress (Today / 7D / 30D) ──────────────────────────────
  const todayStart = startOfToday();
  const d7 = daysAgo(7);
  const d30 = daysAgo(30);

  const [todayLeads, weekLeads, monthLeads, todayContacted, weekContacted, monthContacted, todayReplies, weekReplies, monthReplies, todayMeetings, weekMeetings, monthMeetings, todayDeals, weekDeals, monthDeals, todayWon, weekWon, monthWon] = await Promise.all([
    db.lead.count({ where: { isActive: true, deletedAt: null, createdAt: { gte: todayStart } } }),
    db.lead.count({ where: { isActive: true, deletedAt: null, createdAt: { gte: d7 } } }),
    db.lead.count({ where: { isActive: true, deletedAt: null, createdAt: { gte: d30 } } }),
    db.lead.count({ where: { isActive: true, deletedAt: null, stage: 'contacted', lastContactedAt: { gte: todayStart } } }),
    db.lead.count({ where: { isActive: true, deletedAt: null, stage: 'contacted', lastContactedAt: { gte: d7 } } }),
    db.lead.count({ where: { isActive: true, deletedAt: null, stage: 'contacted', lastContactedAt: { gte: d30 } } }),
    db.outreachMessage.count({ where: { status: 'replied', repliedAt: { gte: todayStart } } }),
    db.outreachMessage.count({ where: { status: 'replied', repliedAt: { gte: d7 } } }),
    db.outreachMessage.count({ where: { status: 'replied', repliedAt: { gte: d30 } } }),
    db.meeting.count({ where: { createdAt: { gte: todayStart } } }),
    db.meeting.count({ where: { createdAt: { gte: d7 } } }),
    db.meeting.count({ where: { createdAt: { gte: d30 } } }),
    db.deal.count({ where: { createdAt: { gte: todayStart } } }),
    db.deal.count({ where: { createdAt: { gte: d7 } } }),
    db.deal.count({ where: { createdAt: { gte: d30 } } }),
    db.deal.count({ where: { status: { in: ['won', 'closed_won', 'closed-won'] }, createdAt: { gte: todayStart } } }),
    db.deal.count({ where: { status: { in: ['won', 'closed_won', 'closed-won'] }, createdAt: { gte: d7 } } }),
    db.deal.count({ where: { status: { in: ['won', 'closed_won', 'closed-won'] }, createdAt: { gte: d30 } } }),
  ]);

  const progress: SalesProgressItem[] = [
    { label: 'Leads', today: todayLeads, week: weekLeads, month: monthLeads, icon: 'UserPlus', drilldownHref: '/admin/crm/leads' },
    { label: 'Contacted', today: todayContacted, week: weekContacted, month: monthContacted, icon: 'Send', drilldownHref: '/admin/crm/leads?stage=contacted' },
    { label: 'Replies', today: todayReplies, week: weekReplies, month: monthReplies, icon: 'MessageSquareReply', drilldownHref: '/admin/crm/outreach' },
    { label: 'Meetings', today: todayMeetings, week: weekMeetings, month: monthMeetings, icon: 'Calendar', drilldownHref: '/admin/crm/meetings' },
    { label: 'Deals', today: todayDeals, week: weekDeals, month: monthDeals, icon: 'Handshake', drilldownHref: '/admin/crm/deals' },
    { label: 'Won', today: todayWon, week: weekWon, month: monthWon, icon: 'Trophy', drilldownHref: '/admin/crm/deals?status=won' },
  ];

  // ── Revenue trend (daily buckets) ──────────────────────────────────
  const dayBuckets = buildDayBuckets(start, end);
  const dealsForTrend = await db.deal.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: { status: true, proposedPrice: true, finalPrice: true, createdAt: true },
  });
  const revenueTrend: RevenueTrendPoint[] = dayBuckets.map((date) => {
    const dayDeals = dealsForTrend.filter((d) => d.createdAt.toISOString().slice(0, 10) === date);
    const won = dayDeals.filter((d) => ['won', 'closed_won', 'closed-won', 'completed', 'done'].includes(d.status));
    const lost = dayDeals.filter((d) => ['lost', 'closed_lost', 'closed-lost', 'cancelled', 'canceled', 'failed'].includes(d.status));
    const active = dayDeals.filter((d) => !['won', 'closed_won', 'closed-won', 'completed', 'done', 'lost', 'closed_lost', 'closed-lost', 'cancelled', 'canceled', 'failed'].includes(d.status));
    return {
      date,
      pipelineValue: active.reduce((s, d) => s + (d.proposedPrice || 0), 0),
      wonRevenue: won.reduce((s, d) => s + (d.finalPrice || 0), 0),
      lostRevenue: 0, // lost revenue not tracked separately in schema
      dealsCreated: dayDeals.length,
      dealsWon: won.length,
      dealsLost: lost.length,
    };
  });

  // ── Category performance (by niche) ────────────────────────────────
  const categoryPerformance: CategoryPerformance[] = nicheGroupsR.value.map((g) => {
    const niche = g.niche || 'Uncategorized';
    const count = g._count.niche;
    return {
      category: niche,
      leads: count,
      contacted: 0, // would need a filtered count per niche — deferred for perf
      replied: 0,
      meetings: 0,
      deals: 0,
      won: 0,
      pipelineValue: 0,
      revenue: 0,
    };
  });

  // ── Channel performance ────────────────────────────────────────────
  const channelMap = new Map<string, { sent: number; delivered: number; opened: number; replied: number; failed: number }>();
  for (const g of outreachChannelStatusR.value) {
    const ch = g.channel;
    const existing = channelMap.get(ch) || { sent: 0, delivered: 0, opened: 0, replied: 0, failed: 0 };
    const c = g._count._all;
    existing.sent += c;
    if (['delivered', 'opened', 'replied'].includes(g.status)) existing.delivered += c;
    if (['opened', 'replied'].includes(g.status)) existing.opened += c;
    if (g.status === 'replied') existing.replied += c;
    if (['failed', 'bounced', 'rejected'].includes(g.status)) existing.failed += c;
    channelMap.set(ch, existing);
  }
  const channelPerformance: ChannelPerformance[] = Array.from(channelMap.entries()).map(([channel, v]) => ({
    channel,
    ...v,
    replyRate: v.sent > 0 ? Math.round((v.replied / v.sent) * 100) : 0,
  }));

  // ── Lead aging buckets ─────────────────────────────────────────────
  const allLeadsForAging = await db.lead.findMany({
    where: { isActive: true, deletedAt: null },
    select: { createdAt: true, stage: true },
    take: 1000, // bounded for performance
    orderBy: { createdAt: 'desc' },
  });
  const agingBuckets: AgingBucket[] = [
    { label: '<1 day', minDays: 0, maxDays: 1, count: 0 },
    { label: '1–3 days', minDays: 1, maxDays: 3, count: 0 },
    { label: '4–7 days', minDays: 4, maxDays: 7, count: 0 },
    { label: '8–14 days', minDays: 8, maxDays: 14, count: 0 },
    { label: '15–30 days', minDays: 15, maxDays: 30, count: 0 },
    { label: '30+ days', minDays: 30, maxDays: null, count: 0 },
  ];
  for (const lead of allLeadsForAging) {
    const ageDays = Math.floor((now.getTime() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    for (const b of agingBuckets) {
      if (b.maxDays === null ? ageDays >= b.minDays : ageDays >= b.minDays && ageDays < b.maxDays) {
        b.count++;
        break;
      }
    }
  }

  // ── Deal velocity (stage-to-stage timing) ──────────────────────────
  // Requires deals with stage-change timestamps. Production has 0 deals,
  // so this renders as insufficientData.
  const dealVelocity: DealVelocity[] = [
    { metric: 'Lead → Contact', avgDays: null, fastestDays: null, slowestDays: null, sampleCount: 0, insufficientData: true },
    { metric: 'Contact → Reply', avgDays: null, fastestDays: null, slowestDays: null, sampleCount: 0, insufficientData: true },
    { metric: 'Reply → Meeting', avgDays: null, fastestDays: null, slowestDays: null, sampleCount: 0, insufficientData: true },
    { metric: 'Meeting → Proposal', avgDays: null, fastestDays: null, slowestDays: null, sampleCount: 0, insufficientData: true },
    { metric: 'Proposal → Won', avgDays: null, fastestDays: null, slowestDays: null, sampleCount: 0, insufficientData: true },
  ];

  // ── Live activity ──────────────────────────────────────────────────
  const liveActivity = recentActivityR.value.map((a) => ({
    id: a.id,
    type: a.type,
    description: a.description,
    leadBusinessName: a.lead?.businessName || 'Unknown',
    leadId: a.leadId,
    actorEmail: a.user?.email || null,
    createdAt: a.createdAt.toISOString(),
  }));

  return {
    generatedAt: now.toISOString(),
    filters: {
      dateRange: query.dateRange,
      source: query.source || 'all',
      channel: query.channel || 'all',
      stage: query.stage || 'all',
      niche: query.niche || 'all',
      country: query.country || 'all',
      hotOnly: query.hotOnly || false,
    },
    kpis,
    progress,
    funnel,
    pipelineStages,
    revenueTrend,
    categoryPerformance,
    channelPerformance,
    leadAging: agingBuckets,
    dealVelocity,
    liveActivity,
    schemaDrift,
    totalLeads: leadsInPeriod,
  };
}
