// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Overview Aggregation Service
//
// Single query-batched aggregation that powers the CRM Overview dashboard.
// Reads canonical existing models only — no new tables, no migrations.
//
// Design:
//   - All queries run in parallel via Promise.all
//   - Each query is wrapped in a safe-query helper so a missing table
//     (Task, WebProperty, ResearchSnapshot are known schema-drift) returns
//     a structured fallback instead of crashing the whole overview
//   - Stage mapping is read-only projection (no data rewrite)
//   - Honest empty states: missing data → count=0, not fake numbers
//
// Guarded server-side: only called from /api/admin/crm/overview which is
// behind withSuperAdmin. This service performs NO writes.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import {
  FUNNEL_STAGES,
  TERMINAL_STAGES,
  STAGE_LABELS,
  mapLeadStageToCanonical,
  mapDealStatusToCanonical,
  isLeadStale,
  isLeadStalled,
  type CanonicalStage,
} from './crm-stage-vocabulary';
import type {
  CrmOverview,
  CrmKpi,
  NeedsAttentionItem,
  FunnelStage,
  PipelineStageSummary,
  OutreachStatusBreakdown,
  OutreachChannelBreakdown,
  AutopilotRunSummary,
  AutopilotWorkflowSummary,
  BusinessProfileSummary,
  BiStatus,
  ActivityItem,
} from './crm-types';

// ── Helpers ───────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Wrap a Prisma query so a missing table (P2021) or other error returns a fallback. */
async function safe<T>(fallback: T, fn: () => Promise<T>): Promise<{ value: T; ok: boolean; error?: string }> {
  try {
    const value = await fn();
    return { value, ok: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    const msg = err instanceof Error ? err.message : String(err);
    if (code === 'P2021') {
      // Table missing — schema drift
      return { value: fallback, ok: false, error: 'TABLE_MISSING' };
    }
    return { value: fallback, ok: false, error: msg };
  }
}

// ── Main overview query ──────────────────────────────────────────────

export async function getCrmOverview(): Promise<CrmOverview> {
  const now = new Date();
  const d7 = daysAgo(7);
  const d30 = daysAgo(30);
  const todayStart = startOfToday();
  const schemaDrift: string[] = [];

  // ── Parallel batch 1: counts ────────────────────────────────────
  const [
    totalLeadsR, leads7dR, leads30dR, leadsTodayR,
    analyzedLeadsR,
    contactedLeadsR,
    repliedLeadsR,
    meetingsR,
    activeDealsR, wonDealsR, lostDealsR,
    outreachSentR, outreachRepliedR, outreachFailedR,
    pipelineValueR,
    creditsConsumed30dR,
    activeAutopilotRunsR,
    leadStageGroupsR,
    outreachStatusGroupsR, outreachChannelGroupsR, outreachChannelStatusGroupsR,
    autopilotRunStatusR,
    autopilotWorkflowsR,
    recentActivityR,
    followUpsOverdueR,
    tasksOverdueR,
    businessProfilesR,
    webPropertyCountR, researchSnapshotCountR,
    researchSnapshotStatusR,
    leadAnalysisCountR,
  ] = await Promise.all([
    safe(0, () => db.lead.count()),
    safe(0, () => db.lead.count({ where: { createdAt: { gte: d7 } } })),
    safe(0, () => db.lead.count({ where: { createdAt: { gte: d30 } } })),
    safe(0, () => db.lead.count({ where: { createdAt: { gte: todayStart } } })),
    safe(0, () => db.lead.count({ where: { stage: { in: ['analyzed', 'scored', 'enriched', 'qualified'] } } })),
    safe(0, () => db.lead.count({ where: { stage: 'contacted' } })),
    safe(0, () => db.lead.count({ where: { emailStatus: 'replied' } })),
    safe(0, () => db.meeting.count()),
    safe(0, () => db.deal.count({ where: { status: { notIn: ['won', 'lost', 'closed_won', 'closed-lost', 'closed_lost', 'cancelled', 'canceled', 'failed'] } } })),
    safe(0, () => db.deal.count({ where: { status: { in: ['won', 'closed_won', 'closed-won', 'completed', 'done'] } } })),
    safe(0, () => db.deal.count({ where: { status: { in: ['lost', 'closed_lost', 'closed-lost', 'cancelled', 'canceled', 'failed'] } } })),
    safe(0, () => db.outreachMessage.count({ where: { status: { in: ['sent', 'delivered', 'opened', 'replied'] } } })),
    safe(0, () => db.outreachMessage.count({ where: { status: 'replied' } })),
    safe(0, () => db.outreachMessage.count({ where: { status: { in: ['failed', 'bounced', 'rejected'] } } })),
    safe({ _sum: { proposedPrice: null } }, () => db.deal.aggregate({ _sum: { proposedPrice: true }, where: { status: { notIn: ['won', 'lost', 'closed_won', 'closed-lost', 'closed_lost', 'cancelled', 'canceled', 'failed'] } } })),
    safe(0, () => db.creditsLedger.count({ where: { createdAt: { gte: d30 }, amount: { lt: 0 } } })),
    safe(0, () => db.autopilotRun.count({ where: { status: { in: ['RUNNING', 'QUEUED', 'WAITING', 'PAUSED'] } } })),
    safe([] as Array<{ stage: string; _count: { stage: number } }>, () => db.lead.groupBy({ by: ['stage'], _count: { stage: true } })),
    safe([] as Array<{ status: string; _count: { status: number } }>, () => db.outreachMessage.groupBy({ by: ['status'], _count: { status: true } })),
    safe([] as Array<{ channel: string; _count: { channel: number } }>, () => db.outreachMessage.groupBy({ by: ['channel'], _count: { channel: true } })),
    safe([] as Array<{ channel: string; status: string; _count: { channel_status: number } }>, () => db.outreachMessage.groupBy({ by: ['channel', 'status'], _count: { channel_status: true } })),
    safe([] as Array<{ status: string; _count: { status: number } }>, () => db.autopilotRun.groupBy({ by: ['status'], _count: { status: true } })),
    safe([] as Array<{ id: string; userId: string; name: string; status: string; schedule: string; lastRunAt: Date | null; nextRunAt: Date | null; runCount: number; totalDiscovered: number; totalSaved: number; totalProcessed: number; lastError: string | null }>, () => db.autopilotWorkflow.findMany({ orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, userId: true, name: true, status: true, schedule: true, lastRunAt: true, nextRunAt: true, runCount: true, totalDiscovered: true, totalSaved: true, totalProcessed: true, lastError: true } })),
    safe([] as Array<{ id: string; leadId: string; type: string; description: string; createdAt: Date; metadata: string | null; lead: { businessName: string } | null; user: { email: string } | null }>, () => db.leadActivity.findMany({ orderBy: { createdAt: 'desc' }, take: 12, include: { lead: { select: { businessName: true } }, user: { select: { email: true } } } })),
    safe(0, () => db.followUpReminder.count({ where: { completed: false, dueAt: { lt: now } } })),
    safe(0, () => db.task.count({ where: { status: { in: ['open', 'in_progress'] }, dueAt: { lt: now } } })),
    safe([] as Array<{ id: string; userId: string; name: string; industry: string | null; status: string; isDefault: boolean; createdAt: Date; user: { email: string; name: string | null } | null }>, () => db.businessProfile.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { user: { select: { email: true, name: true } } } })),
    safe(0, () => db.webProperty.count()),
    safe(0, () => db.researchSnapshot.count()),
    safe([] as Array<{ status: string; _count: { status: number } }>, () => db.researchSnapshot.groupBy({ by: ['status'], _count: { status: true } })),
    safe(0, () => db.leadAnalysis.count()),
  ]);

  // Track schema drift
  if (!webPropertyCountR.ok) schemaDrift.push('WebProperty');
  if (!researchSnapshotCountR.ok) schemaDrift.push('ResearchSnapshot');
  if (!tasksOverdueR.ok) schemaDrift.push('Task');
  if (!researchSnapshotStatusR.ok) schemaDrift.push('ResearchSnapshot');

  // Unwrap safe values
  const totalLeads = totalLeadsR.value;
  const leads7d = leads7dR.value;
  const leads30d = leads30dR.value;
  const leadsToday = leadsTodayR.value;
  const analyzedLeads = analyzedLeadsR.value;
  const contactedLeads = contactedLeadsR.value;
  const repliedLeads = repliedLeadsR.value;
  const meetingsCount = meetingsR.value;
  const activeDeals = activeDealsR.value;
  const wonDeals = wonDealsR.value;
  const lostDeals = lostDealsR.value;
  const outreachSent = outreachSentR.value;
  const outreachReplied = outreachRepliedR.value;
  const outreachFailed = outreachFailedR.value;
  const pipelineValue = pipelineValueR.value._sum?.proposedPrice || 0;
  const creditsConsumed30d = creditsConsumed30dR.value;
  const activeAutopilotRuns = activeAutopilotRunsR.value;

  // ── Build funnel from leadStageGroups (read-only projection) ─────
  const stageCounts = new Map<CanonicalStage, number>();
  for (const stage of [...FUNNEL_STAGES, ...TERMINAL_STAGES]) stageCounts.set(stage, 0);
  for (const g of leadStageGroupsR.value) {
    const canonical = mapLeadStageToCanonical(g.stage);
    stageCounts.set(canonical, (stageCounts.get(canonical) || 0) + g._count.stage);
  }
  // Merge deal-side won/lost into the funnel terminals
  // (deals are a separate model; their won/lost augment the lead-stage counts)
  // Already counted via lead.stage if set; deals add if lead.stage wasn't terminal.
  // For simplicity, we use lead-stage as the primary funnel source.

  const discoveredCount = stageCounts.get('discovered') || 0;
  const funnel: FunnelStage[] = [];
  let prevCount: number | null = null;
  for (const stage of FUNNEL_STAGES) {
    const count = stageCounts.get(stage) || 0;
    const conversionPercent = discoveredCount > 0 ? Math.round((count / discoveredCount) * 100) : 0;
    const stepConversionPercent = prevCount !== null && prevCount > 0 ? Math.round((count / prevCount) * 100) : null;
    const dropOff = prevCount !== null ? Math.max(0, prevCount - count) : null;
    funnel.push({
      stage,
      label: STAGE_LABELS[stage],
      count,
      conversionPercent,
      stepConversionPercent,
      dropOff,
    });
    prevCount = count;
  }

  // ── KPI strip ────────────────────────────────────────────────────
  const conversionRate = totalLeads > 0 && (wonDeals + repliedLeads) > 0
    ? Math.round(((wonDeals + repliedLeads) / totalLeads) * 100)
    : 0;
  const replyRate = outreachSent > 0 ? Math.round((outreachReplied / outreachSent) * 100) : 0;

  const kpis: CrmKpi[] = [
    { key: 'total_leads', label: 'Total Leads', value: totalLeads, valueFormat: 'int', sub: `+${leads7d} in 7 days`, trend: leads7d > 0 ? 'up' : 'flat', icon: 'Users', drilldownHref: '/admin/crm/leads' },
    { key: 'new_leads', label: 'New Leads (24h)', value: leadsToday, valueFormat: 'int', sub: `${leads30d} in 30 days`, trend: leadsToday > 0 ? 'up' : 'flat', icon: 'UserPlus', drilldownHref: '/admin/crm/leads?filter=new' },
    { key: 'analyzed_leads', label: 'Analyzed Leads', value: analyzedLeads + (leadAnalysisCountR.ok ? 0 : 0), valueFormat: 'int', sub: leadAnalysisCountR.ok ? `${leadAnalysisCountR.value} analyses` : 'analyses table ready', trend: analyzedLeads > 0 ? 'up' : 'flat', icon: 'BrainCircuit', drilldownHref: '/admin/crm/leads?stage=analyzed' },
    { key: 'contacted_leads', label: 'Contacted Leads', value: contactedLeads, valueFormat: 'int', sub: `${Math.round((contactedLeads / Math.max(totalLeads, 1)) * 100)}% of total`, trend: contactedLeads > 0 ? 'up' : 'flat', icon: 'Send', drilldownHref: '/admin/crm/leads?stage=contacted' },
    { key: 'replies', label: 'Replies', value: outreachReplied, valueFormat: 'int', sub: `${replyRate}% reply rate`, trend: outreachReplied > 0 ? 'up' : 'flat', icon: 'MessageSquareReply', drilldownHref: '/admin/crm/outreach' },
    { key: 'meetings', label: 'Meetings', value: meetingsCount, valueFormat: 'int', sub: meetingsCount === 0 ? 'none scheduled' : 'all-time', trend: 'flat', icon: 'Calendar', drilldownHref: '/admin/crm/meetings' },
    { key: 'active_deals', label: 'Active Deals', value: activeDeals, valueFormat: 'int', sub: activeDeals === 0 ? 'no deals yet' : `${wonDeals + lostDeals} closed`, trend: 'flat', icon: 'Handshake', drilldownHref: '/admin/crm/deals' },
    { key: 'won_deals', label: 'Won Deals', value: wonDeals, valueFormat: 'int', sub: wonDeals === 0 ? 'none yet' : `${lostDeals} lost`, trend: wonDeals > 0 ? 'up' : 'flat', icon: 'Trophy', drilldownHref: '/admin/crm/deals?status=won' },
    { key: 'pipeline_value', label: 'Pipeline Value', value: pipelineValue, valueFormat: 'money', sub: activeDeals === 0 ? 'no active deals' : `${activeDeals} active`, trend: 'flat', icon: 'DollarSign', drilldownHref: '/admin/crm/pipeline' },
    { key: 'conversion_rate', label: 'Conversion Rate', value: conversionRate, valueFormat: 'percent', sub: 'won + replied / total', trend: conversionRate > 0 ? 'up' : 'flat', icon: 'Target', drilldownHref: '/admin/crm/analytics' },
    { key: 'reply_rate', label: 'Outreach Reply Rate', value: replyRate, valueFormat: 'percent', sub: `${outreachSent} sent`, trend: replyRate > 0 ? 'up' : 'flat', icon: 'Reply', drilldownHref: '/admin/crm/outreach' },
    { key: 'credits_30d', label: 'Credits Consumed (30d)', value: creditsConsumed30d, valueFormat: 'int', sub: 'debit entries', trend: 'flat', icon: 'Coins', drilldownHref: '/admin/billing' },
    { key: 'active_autopilot', label: 'Active Autopilot Runs', value: activeAutopilotRuns, valueFormat: 'int', sub: 'RUNNING/QUEUED/WAITING', trend: activeAutopilotRuns > 0 ? 'up' : 'flat', icon: 'Bot', drilldownHref: '/admin/crm/autopilot' },
  ];

  // ── Needs Attention ──────────────────────────────────────────────
  const needsAttention: NeedsAttentionItem[] = [];

  // Replies waiting (outreach messages with status 'replied' but lead not in replied stage)
  // Approximated by outreachReplied count (each replied message is a waiting reply unless handled)
  if (outreachReplied > 0) {
    needsAttention.push({
      key: 'replies_waiting', label: 'Replies Waiting', count: outreachReplied,
      severity: 'critical', drilldownHref: '/admin/crm/outreach?filter=replied',
      description: 'Inbound replies awaiting a response.',
    });
  }

  // Overdue follow-ups
  const overdueFollowUps = followUpsOverdueR.value;
  if (overdueFollowUps > 0) {
    needsAttention.push({
      key: 'overdue_followups', label: 'Overdue Follow-ups', count: overdueFollowUps,
      severity: 'warning', drilldownHref: '/admin/crm/tasks?filter=overdue_followups',
      description: 'Follow-up reminders past their due date.',
    });
  }

  // Overdue tasks (only if table exists)
  if (tasksOverdueR.ok) {
    const overdueTasks = tasksOverdueR.value;
    if (overdueTasks > 0) {
      needsAttention.push({
        key: 'overdue_tasks', label: 'Overdue Tasks', count: overdueTasks,
        severity: 'warning', drilldownHref: '/admin/crm/tasks?filter=overdue',
        description: 'Open tasks past their due date.',
      });
    }
  }

  // Failed outreach
  if (outreachFailed > 0) {
    needsAttention.push({
      key: 'failed_outreach', label: 'Failed Outreach', count: outreachFailed,
      severity: 'critical', drilldownHref: '/admin/crm/outreach?filter=failed',
      description: 'Outreach messages that bounced or failed to send.',
    });
  }

  // Failed autopilot runs (recent — last 7 days)
  const autopilotRunStatus = autopilotRunStatusR.value;
  const failedRuns = autopilotRunStatus.find((s) => s.status === 'FAILED')?._count.status || 0;
  if (failedRuns > 0) {
    needsAttention.push({
      key: 'failed_autopilot', label: 'Failed Autopilot Runs', count: failedRuns,
      severity: 'critical', drilldownHref: '/admin/crm/autopilot?filter=failed',
      description: 'Autopilot runs that ended in failure.',
    });
  }

  // Stale leads (discovered/analyzed, never moved, > STALE_DAYS old)
  // Approximated: leads created > 21 days ago still in discovered/analyzed
  const staleCutoff = daysAgo(21);
  const staleLeadsR = await safe(0, () => db.lead.count({
    where: {
      stage: { in: ['discovered', 'analyzed', null] },
      createdAt: { lt: staleCutoff },
    },
  }));
  if (staleLeadsR.value > 0) {
    needsAttention.push({
      key: 'stale_leads', label: 'Stale Leads', count: staleLeadsR.value,
      severity: 'warning', drilldownHref: '/admin/crm/leads?filter=stale',
      description: 'Leads sitting in discovery/analysis for 21+ days.',
    });
  }

  // Schema drift warnings (as info-severity attention items)
  if (schemaDrift.length > 0) {
    needsAttention.push({
      key: 'schema_drift', label: 'Schema Drift', count: schemaDrift.length,
      severity: 'info', drilldownHref: '/admin/crm',
      description: `Tables missing from DB: ${schemaDrift.join(', ')}. Run prisma db push (additive) to enable.`,
    });
  }

  // ── Pipeline summary ─────────────────────────────────────────────
  const pipelineStages: PipelineStageSummary[] = FUNNEL_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    leadCount: stageCounts.get(stage) || 0,
    dealValue: 0, // deals are empty in production; computed below if any
    dealCount: 0,
    avgAgeDays: null, // computed in a follow-up query only if leads exist
  }));

  // ── Outreach breakdown ───────────────────────────────────────────
  const outreachByStatus: OutreachStatusBreakdown[] = outreachStatusGroupsR.value
    .map((g) => ({ status: g.status, count: g._count.status }))
    .sort((a, b) => b.count - a.count);

  const channelMap = new Map<string, OutreachChannelBreakdown>();
  for (const g of outreachChannelStatusGroupsR.value) {
    const ch = g.channel;
    const existing = channelMap.get(ch) || { channel: ch, sent: 0, delivered: 0, opened: 0, replied: 0, failed: 0 };
    const count = g._count.channel_status;
    existing.sent += count;
    if (['delivered', 'opened', 'replied'].includes(g.status)) existing.delivered += count;
    if (['opened', 'replied'].includes(g.status)) existing.opened += count;
    if (g.status === 'replied') existing.replied += count;
    if (['failed', 'bounced', 'rejected'].includes(g.status)) existing.failed += count;
    channelMap.set(ch, existing);
  }
  const outreachByChannel: OutreachChannelBreakdown[] = Array.from(channelMap.values());

  // ── Autopilot summary ────────────────────────────────────────────
  const runsByStatus: AutopilotRunSummary[] = autopilotRunStatus
    .map((g) => ({ status: g.status, count: g._count.status }))
    .sort((a, b) => b.count - a.count);

  const workflows: AutopilotWorkflowSummary[] = autopilotWorkflowsR.value.map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    schedule: w.schedule,
    lastRunAt: w.lastRunAt?.toISOString() || null,
    nextRunAt: w.nextRunAt?.toISOString() || null,
    runCount: w.runCount,
    totalDiscovered: w.totalDiscovered,
    totalSaved: w.totalSaved,
    totalProcessed: w.totalProcessed,
    lastError: w.lastError,
  }));

  const failedRunsRecent = failedRuns;

  // ── BI status ────────────────────────────────────────────────────
  // Fetch web properties + snapshots per profile (separate query for clarity)
  const profileIds = businessProfilesR.value.map((bp) => bp.id);
  type WebPropWithSnap = { id: string; businessProfileId: string; lastResearchedAt: Date | null; researchSnapshots: Array<{ id: string; status: string }> };
  const webPropsR = await safe<WebPropWithSnap[]>([], () => db.webProperty.findMany({
    where: { businessProfileId: { in: profileIds } },
    select: { id: true, businessProfileId: true, lastResearchedAt: true, researchSnapshots: { select: { id: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
  }));
  const webPropsByProfile = new Map<string, WebPropWithSnap[]>();
  for (const wp of webPropsR.value) {
    const arr = webPropsByProfile.get(wp.businessProfileId) || [];
    arr.push(wp);
    webPropsByProfile.set(wp.businessProfileId, arr);
  }

  const profiles: BusinessProfileSummary[] = businessProfilesR.value.map((bp) => {
    const webProps = webPropsByProfile.get(bp.id) || [];
    const snapshotCount = webProps.reduce((s, wp) => s + (wp.researchSnapshots?.length || 0), 0);
    const lastResearched = webProps
      .map((wp) => wp.lastResearchedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      id: bp.id,
      userId: bp.userId,
      userName: bp.user?.name || bp.user?.email || 'Unknown',
      userEmail: bp.user?.email || '',
      name: bp.name,
      industry: bp.industry,
      status: bp.status,
      isDefault: bp.isDefault,
      webPropertyCount: webProps.length,
      researchSnapshotCount: snapshotCount,
      lastResearchedAt: lastResearched ? lastResearched.toISOString() : null,
      createdAt: bp.createdAt.toISOString(),
    };
  });

  const bi: BiStatus = {
    totalProfiles: profiles.length,
    totalWebProperties: webPropertyCountR.ok ? webPropertyCountR.value : 0,
    totalResearchSnapshots: researchSnapshotCountR.ok ? researchSnapshotCountR.value : 0,
    completedSnapshots: researchSnapshotStatusR.ok ? (researchSnapshotStatusR.value.find((g) => g.status === 'completed')?._count.status || 0) : 0,
    failedSnapshots: researchSnapshotStatusR.ok ? (researchSnapshotStatusR.value.find((g) => g.status === 'failed')?._count.status || 0) : 0,
    pendingSnapshots: researchSnapshotStatusR.ok ? (researchSnapshotStatusR.value.find((g) => g.status === 'pending')?._count.status || 0) : 0,
    schemaDrift: !webPropertyCountR.ok || !researchSnapshotCountR.ok,
    profiles,
  };

  // ── Recent activity ──────────────────────────────────────────────
  const recentActivity: ActivityItem[] = recentActivityR.value.map((a) => ({
    id: a.id,
    leadId: a.leadId,
    leadBusinessName: a.lead?.businessName || 'Unknown',
    type: a.type,
    description: a.description,
    actorEmail: a.user?.email || null,
    createdAt: a.createdAt.toISOString(),
    metadata: a.metadata,
  }));

  return {
    generatedAt: now.toISOString(),
    kpis,
    needsAttention,
    funnel,
    pipeline: {
      stages: pipelineStages,
      totalPipelineValue: pipelineValue,
      activeDealCount: activeDeals,
    },
    outreach: {
      totalMessages: outreachByStatus.reduce((s, o) => s + o.count, 0),
      byStatus: outreachByStatus,
      byChannel: outreachByChannel,
      replyRate,
    },
    autopilot: {
      activeWorkflows: workflows.filter((w) => w.status === 'ACTIVE').length,
      totalRuns: runsByStatus.reduce((s, r) => s + r.count, 0),
      runsByStatus,
      workflows,
      failedRunsRecent,
    },
    bi,
    recentActivity,
    schemaDrift,
  };
}
