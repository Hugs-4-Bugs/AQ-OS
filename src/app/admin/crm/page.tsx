'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Command Center (Overview)
//
// The primary CRM landing page. Answers:
//   1. What is happening? (KPI strip)
//   2. What needs attention? (Needs Attention panel)
//   3. Where are leads in the lifecycle? (Funnel)
//   4. What is converting/stalled? (Pipeline summary)
//   5. What is outreach/Autopilot doing? (Outreach + Autopilot panels)
//   6. What business intelligence is available? (BI panel)
//   7. What requires admin intervention? (Needs Attention + schema drift)
//
// Data: GET /api/admin/crm/overview (super_admin only, server-aggregated).
// ═══════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity, Bot, BrainCircuit, ChevronRight, Database, Globe, Send, TrendingUp, Zap,
} from 'lucide-react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmKpiGrid } from '@/components/admin/crm/crm-kpi-card';
import { NeedsAttentionPanel } from '@/components/admin/crm/needs-attention-panel';
import { AcquisitionFunnel } from '@/components/admin/crm/acquisition-funnel';
import { CrmLoadingSkeleton, CrmErrorState, CrmEmptyState } from '@/components/admin/crm/crm-states';
import { useFetch, fmtInt, fmtMoney, fmtDateTime, timeAgo, humanize } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';

export default function AdminCrmOverviewPage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  const reduced = useReducedMotion();

  if (loading) {
    return (
      <CrmShell title="CRM Command Center" subtitle="Loading live acquisition data…">
        <CrmLoadingSkeleton variant="overview" />
      </CrmShell>
    );
  }

  if (error || !data) {
    return (
      <CrmShell title="CRM Command Center">
        <CrmErrorState message={error || 'Failed to load CRM overview'} onRetry={reload} />
      </CrmShell>
    );
  }

  return (
    <CrmShell
      title="CRM Command Center"
      subtitle={`Live across all tenants · updated ${fmtDateTime(data.generatedAt)}`}
      onRefresh={reload}
    >
      <div className="space-y-4">
        {/* Schema drift banner */}
        {data.schemaDrift.length > 0 && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-sky-500/30 bg-sky-500/5">
              <div className="flex items-start gap-3 p-3">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-sky-700 dark:text-sky-300">
                    Schema drift detected — {data.schemaDrift.length} table{data.schemaDrift.length !== 1 ? 's' : ''} missing from DB
                  </p>
                  <p className="mt-0.5 text-[11px] text-sky-700/80 dark:text-sky-300/80">
                    {data.schemaDrift.join(', ')} — declared in Prisma schema but not pushed to SQLite.
                    Affected sections render honest empty states. Run{' '}
                    <code className="rounded bg-sky-500/10 px-1 py-0.5 text-[10px]">npx prisma db push</code>{' '}
                    (additive, no data loss) to enable.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* KPI strip */}
        <section aria-label="Key metrics">
          <CrmKpiGrid kpis={data.kpis} />
        </section>

        {/* Needs Attention */}
        <section aria-label="Needs attention">
          <NeedsAttentionPanel items={data.needsAttention} />
        </section>

        {/* Funnel + Pipeline summary */}
        <div className="grid gap-3 lg:grid-cols-5">
          <motion.div
            className="lg:col-span-3"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { delay: 0.2, duration: 0.4 }}
          >
            <AcquisitionFunnel stages={data.funnel} />
          </motion.div>

          <motion.div
            className="lg:col-span-2"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { delay: 0.25, duration: 0.4 }}
          >
            <PipelineMiniCard stages={data.pipeline.stages} totalValue={data.pipeline.totalPipelineValue} activeDeals={data.pipeline.activeDealCount} />
          </motion.div>
        </div>

        {/* Outreach + Autopilot */}
        <div className="grid gap-3 lg:grid-cols-2">
          <OutreachMiniCard
            totalMessages={data.outreach.totalMessages}
            byStatus={data.outreach.byStatus}
            byChannel={data.outreach.byChannel}
            replyRate={data.outreach.replyRate}
          />
          <AutopilotMiniCard
            activeWorkflows={data.autopilot.activeWorkflows}
            totalRuns={data.autopilot.totalRuns}
            runsByStatus={data.autopilot.runsByStatus}
            workflows={data.autopilot.workflows}
          />
        </div>

        {/* BI + Recent activity */}
        <div className="grid gap-3 lg:grid-cols-2">
          <BiMiniCard bi={data.bi} />
          <RecentActivityCard activities={data.recentActivity} />
        </div>
      </div>
    </CrmShell>
  );
}

// ── Pipeline mini card ────────────────────────────────────────────────

function PipelineMiniCard({ stages, totalValue, activeDeals }: {
  stages: CrmOverview['pipeline']['stages'];
  totalValue: number;
  activeDeals: number;
}) {
  return (
    <Card className="h-full">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Pipeline Summary</h3>
          </div>
          <Link href="/admin/crm/pipeline" className="text-[11px] text-muted-foreground hover:text-foreground">
            view →
          </Link>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pipeline Value</p>
            <p className="text-sm font-semibold tabular-nums">{fmtMoney(totalValue)}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Active Deals</p>
            <p className="text-sm font-semibold tabular-nums">{fmtInt(activeDeals)}</p>
          </div>
        </div>
        <ul className="space-y-1">
          {stages.filter((s) => s.leadCount > 0).slice(0, 5).map((s) => (
            <li key={s.stage} className="flex items-center justify-between text-xs">
              <Link href={`/admin/crm/leads?stage=${s.stage}`} className="hover:underline" aria-label={`${s.label}: ${s.leadCount} leads`}>
                {s.label}
              </Link>
              <span className="tabular-nums text-muted-foreground">{fmtInt(s.leadCount)}</span>
            </li>
          ))}
          {stages.filter((s) => s.leadCount > 0).length === 0 && (
            <li className="py-4 text-center text-[11px] text-muted-foreground">No leads in pipeline yet.</li>
          )}
        </ul>
      </div>
    </Card>
  );
}

// ── Outreach mini card ────────────────────────────────────────────────

function OutreachMiniCard({ totalMessages, byStatus, byChannel, replyRate }: {
  totalMessages: number;
  byStatus: CrmOverview['outreach']['byStatus'];
  byChannel: CrmOverview['outreach']['byChannel'];
  replyRate: number;
}) {
  return (
    <Card className="h-full">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Outreach Performance</h3>
          </div>
          <Link href="/admin/crm/outreach" className="text-[11px] text-muted-foreground hover:text-foreground">view →</Link>
        </div>
        {totalMessages === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">No outreach messages sent yet.</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="rounded-md bg-muted/50 p-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="text-sm font-semibold tabular-nums">{fmtInt(totalMessages)}</p>
              </div>
              <div className="rounded-md bg-muted/50 p-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reply Rate</p>
                <p className="text-sm font-semibold tabular-nums">{replyRate}%</p>
              </div>
              <div className="rounded-md bg-muted/50 p-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Channels</p>
                <p className="text-sm font-semibold tabular-nums">{byChannel.length}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {byStatus.slice(0, 5).map((s) => (
                <div key={s.status} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{humanize(s.status)}</span>
                  <span className="tabular-nums font-medium">{fmtInt(s.count)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

// ── Autopilot mini card ───────────────────────────────────────────────

function AutopilotMiniCard({ activeWorkflows, totalRuns, runsByStatus, workflows }: {
  activeWorkflows: number;
  totalRuns: number;
  runsByStatus: CrmOverview['autopilot']['runsByStatus'];
  workflows: CrmOverview['autopilot']['workflows'];
}) {
  return (
    <Card className="h-full">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold">AI / Autopilot</h3>
          </div>
          <Link href="/admin/crm/autopilot" className="text-[11px] text-muted-foreground hover:text-foreground">view →</Link>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Active Workflows</p>
            <p className="text-sm font-semibold tabular-nums">{fmtInt(activeWorkflows)}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Runs</p>
            <p className="text-sm font-semibold tabular-nums">{fmtInt(totalRuns)}</p>
          </div>
        </div>
        {workflows.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-muted-foreground">No autopilot workflows configured.</p>
        ) : (
          <ul className="space-y-1.5">
            {workflows.slice(0, 3).map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 text-xs">
                <Link href={`/admin/crm/autopilot?id=${w.id}`} className="min-w-0 truncate hover:underline">
                  {w.name}
                </Link>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{w.status}</Badge>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(w.lastRunAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {runsByStatus.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Runs by status</p>
            <div className="flex flex-wrap gap-1.5">
              {runsByStatus.map((r) => (
                <Badge key={r.status} variant="outline" className="text-[10px]">
                  {humanize(r.status)}: {fmtInt(r.count)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── BI mini card ──────────────────────────────────────────────────────

function BiMiniCard({ bi }: { bi: CrmOverview['bi'] }) {
  return (
    <Card className="h-full">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Business Intelligence</h3>
          </div>
          <Link href="/admin/crm/intelligence" className="text-[11px] text-muted-foreground hover:text-foreground">view →</Link>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Profiles</p>
            <p className="text-sm font-semibold tabular-nums">{fmtInt(bi.totalProfiles)}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Web Props</p>
            <p className="text-sm font-semibold tabular-nums">{fmtInt(bi.totalWebProperties)}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Snapshots</p>
            <p className="text-sm font-semibold tabular-nums">{fmtInt(bi.totalResearchSnapshots)}</p>
          </div>
        </div>
        {bi.schemaDrift && (
          <div className="mb-2 rounded-md bg-sky-500/10 p-2 text-[11px] text-sky-700 dark:text-sky-300">
            <Globe className="mr-1 inline h-3 w-3" aria-hidden="true" />
            WebProperty / ResearchSnapshot tables missing — BI features pending schema push.
          </div>
        )}
        {bi.profiles.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-muted-foreground">No business profiles created yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {bi.profiles.slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                <Link href={`/admin/crm/intelligence?id=${p.id}`} className="min-w-0 truncate hover:underline">
                  {p.name}
                </Link>
                <span className="shrink-0 text-[10px] text-muted-foreground">{p.userEmail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ── Recent activity card ──────────────────────────────────────────────

function RecentActivityCard({ activities }: { activities: CrmOverview['recentActivity'] }) {
  return (
    <Card className="h-full">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Recent Activity</h3>
          </div>
          <Link href="/admin/crm/activities" className="text-[11px] text-muted-foreground hover:text-foreground">view →</Link>
        </div>
        {activities.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {activities.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs">
                    <Link href={`/admin/crm/leads?id=${a.leadId}`} className="font-medium hover:underline">
                      {a.leadBusinessName}
                    </Link>
                    <span className="ml-1.5 text-muted-foreground">· {humanize(a.type)}</span>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {a.description || a.actorEmail || 'system'}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
