'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Sales Command Center
//
// The primary real-time sales intelligence surface. An admin opens this
// page and immediately sees the complete acquisition-to-sales lifecycle
// with live status, interactive charts, cross-filtering, and drilldowns.
//
// Real-time: uses useCrmLiveUpdates() which checks connection liveness
// and triggers refetch on visibility change. The status indicator is
// HONEST — it shows the actual connection state, never fakes "LIVE".
//
// Data: GET /api/admin/crm/sales (super_admin only, server-aggregated).
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Trophy, Handshake, DollarSign, Target, Send,
  Calendar, UserPlus, MessageSquareReply, Scale, Activity, Bot, Zap,
  Wifi, WifiOff, RefreshCw, ChevronRight, Flame, Clock, Filter, X,
  ExternalLink, AlertCircle,
} from 'lucide-react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState, CrmEmptyState } from '@/components/admin/crm/crm-states';
import {
  useFetch, fmtInt, fmtMoney, fmtPercent, fmtDateTime, timeAgo, humanize,
} from '@/components/admin/crm/crm-utils';
import { useCrmLiveUpdates } from '@/hooks/use-crm-live-updates';
import { FUNNEL_STAGES, STAGE_LABELS, type CanonicalStage } from '@/lib/admin/crm/crm-stage-vocabulary';
import type { SalesOverview, SalesFilters, DateRange } from '@/lib/admin/crm/crm-sales-service';

const DATE_RANGES: Array<{ value: DateRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
];

const CHART_COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#6366f1', '#ec4899', '#84cc16'];

export default function AdminCrmSalesCommandCenterPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reduced = useReducedMotion();

  // Filters from URL
  const [dateRange, setDateRange] = useState<DateRange>((searchParams.get('dateRange') as DateRange) || '30d');
  const [source, setSource] = useState(searchParams.get('source') || 'all');
  const [channel, setChannel] = useState(searchParams.get('channel') || 'all');
  const [stage, setStage] = useState(searchParams.get('stage') || 'all');
  const [niche, setNiche] = useState(searchParams.get('niche') || 'all');
  const [hotOnly, setHotOnly] = useState(searchParams.get('hotOnly') === 'true');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Live updates
  const live = useCrmLiveUpdates(true);
  const [lastFetchTick, setLastFetchTick] = useState(0);

  // Build query string
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set('dateRange', dateRange);
    if (source !== 'all') p.set('source', source);
    if (channel !== 'all') p.set('channel', channel);
    if (stage !== 'all') p.set('stage', stage);
    if (niche !== 'all') p.set('niche', niche);
    if (hotOnly) p.set('hotOnly', 'true');
    return p.toString();
  }, [dateRange, source, channel, stage, niche, hotOnly]);

  // Sync URL when filters change
  useEffect(() => {
    const p = new URLSearchParams();
    p.set('dateRange', dateRange);
    if (source !== 'all') p.set('source', source);
    if (channel !== 'all') p.set('channel', channel);
    if (stage !== 'all') p.set('stage', stage);
    if (niche !== 'all') p.set('niche', niche);
    if (hotOnly) p.set('hotOnly', 'true');
    router.replace(`/admin/crm/sales?${p.toString()}`, { scroll: false });
  }, [dateRange, source, channel, stage, niche, hotOnly, router]);

  // Fetch with live tick for refetch triggering
  const { data, loading, error, reload } = useFetch<SalesOverview>(`/api/admin/crm/sales?${queryString}`);

  // Trigger refetch when live tick changes (but not more than once per 5s)
  useEffect(() => {
    if (live.tick > lastFetchTick && live.tick > 0) {
      setLastFetchTick(live.tick);
      reload();
    }
  }, [live.tick, lastFetchTick, reload]);

  const activeFilterCount = (source !== 'all' ? 1 : 0) + (channel !== 'all' ? 1 : 0) +
    (stage !== 'all' ? 1 : 0) + (niche !== 'all' ? 1 : 0) + (hotOnly ? 1 : 0);

  const clearFilters = () => {
    setSource('all'); setChannel('all'); setStage('all'); setNiche('all'); setHotOnly(false);
  };

  const liveStatusColor = live.status === 'live' ? 'text-emerald-500' : live.status === 'reconnecting' ? 'text-amber-500' : 'text-rose-500';
  const LiveStatusIcon = live.status === 'live' ? Wifi : live.status === 'reconnecting' ? RefreshCw : WifiOff;
  const liveDotClass = live.status === 'live' ? 'bg-emerald-500' : live.status === 'reconnecting' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500';

  if (loading) {
    return (
      <CrmShell title="Sales Command Center" subtitle="Loading live sales intelligence…">
        <CrmLoadingSkeleton variant="overview" />
      </CrmShell>
    );
  }

  if (error || !data) {
    return (
      <CrmShell title="Sales Command Center">
        <CrmErrorState message={error || 'Failed to load sales data'} onRetry={reload} />
      </CrmShell>
    );
  }

  return (
    <CrmShell
      title="Sales Command Center"
      subtitle={`Live sales intelligence · updated ${fmtDateTime(data.generatedAt)}`}
      onRefresh={reload}
    >
      <div className="space-y-4">
        {/* ── Live status + filter bar ──────────────────────────────── */}
        <Card>
          <div className="flex flex-wrap items-center gap-3 p-3">
            {/* Live status indicator */}
            <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5" aria-live="polite">
              <span className={`h-2 w-2 rounded-full ${liveDotClass}`} aria-hidden="true" />
              <LiveStatusIcon className={`h-3.5 w-3.5 ${liveStatusColor}`} aria-hidden="true" />
              <span className={`text-xs font-medium ${liveStatusColor}`}>{live.statusLabel}</span>
              {live.secondsSinceLastEvent !== null && (
                <span className="text-[10px] text-muted-foreground">
                  · {live.secondsSinceLastEvent < 60 ? `${live.secondsSinceLastEvent}s ago` : `${Math.floor(live.secondsSinceLastEvent / 60)}m ago`}
                </span>
              )}
              <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {live.eventCount} events
              </span>
            </div>

            {/* Date range selector */}
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-[100px]" aria-label="Date range"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Source filter */}
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-[130px]" aria-label="Source"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="ai_search">AI Search</SelectItem>
                <SelectItem value="google_maps">Google Maps</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
              </SelectContent>
            </Select>

            {/* Channel filter */}
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-[110px]" aria-label="Channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>

            {/* Stage filter */}
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-[130px]" aria-label="Stage"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {FUNNEL_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Hot leads toggle */}
            <Button variant={hotOnly ? 'default' : 'outline'} size="sm" onClick={() => setHotOnly((v) => !v)} aria-pressed={hotOnly}>
              <Flame className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Hot
            </Button>

            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-3 w-3" aria-hidden="true" /> Clear ({activeFilterCount})
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
              <Filter className="h-3 w-3" aria-hidden="true" />
              <span>{fmtInt(data.totalLeads)} leads in period</span>
            </div>
          </div>
        </Card>

        {/* ── KPI strip ─────────────────────────────────────────────── */}
        <section aria-label="Sales KPIs">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {data.kpis.slice(0, 12).map((kpi, i) => {
              const IconComp = ICON_MAP[kpi.icon] || Target;
              const TrendIcon = kpi.trend === 'up' ? TrendingUp : kpi.trend === 'down' ? TrendingDown : null;
              const trendColor = kpi.trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : kpi.trend === 'down' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground';
              return (
                <motion.div
                  key={kpi.key}
                  initial={reduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduced ? { duration: 0 } : { delay: Math.min(i * 0.03, 0.3), duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link href={kpi.drilldownHref || '#'}>
                    <Card className="group h-full transition-shadow hover:shadow-md">
                      <div className="flex h-full flex-col p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">{kpi.label}</span>
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                            <IconComp className="h-3 w-3 text-primary" aria-hidden="true" />
                          </span>
                        </div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">
                          {kpi.insufficientData && kpi.value === 0 ? (
                            <span className="text-xs text-muted-foreground">Insufficient data</span>
                          ) : kpi.valueFormat === 'money' ? fmtMoney(kpi.value) :
                            kpi.valueFormat === 'percent' ? fmtPercent(kpi.value) :
                            kpi.valueFormat === 'int' ? fmtInt(kpi.value) : String(kpi.value)}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {TrendIcon && <TrendIcon className={`h-3 w-3 ${trendColor}`} aria-hidden="true" />}
                          {kpi.sub && <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>}
                        </div>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── Sales Progress ────────────────────────────────────────── */}
        <Card>
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Sales Progress</h3>
              <span className="text-[11px] text-muted-foreground">real deltas from actual data</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {data.progress.map((item, i) => {
                const IconComp = ICON_MAP[item.icon] || Target;
                return (
                  <motion.div
                    key={item.label}
                    initial={reduced ? false : { opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={reduced ? { duration: 0 } : { delay: Math.min(i * 0.04, 0.3) }}
                  >
                    <Link href={item.drilldownHref}>
                      <div className="rounded-md border border-border p-2.5 transition-colors hover:bg-muted">
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <IconComp className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          <span className="text-[11px] font-medium">{item.label}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-center">
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">Today</p>
                            <p className="text-sm font-semibold tabular-nums">{fmtInt(item.today)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">7D</p>
                            <p className="text-sm font-semibold tabular-nums">{fmtInt(item.week)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">30D</p>
                            <p className="text-sm font-semibold tabular-nums">{fmtInt(item.month)}</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* ── Funnel + Pipeline ─────────────────────────────────────── */}
        <div className="grid gap-3 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Acquisition → Sales Funnel</h3>
                <Link href="/admin/crm/leads" className="text-[11px] text-muted-foreground hover:text-foreground">drill down →</Link>
              </div>
              <FunnelBars stages={data.funnel} reduced={reduced} />
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Pipeline Board</h3>
                <Link href="/admin/crm/pipeline" className="text-[11px] text-muted-foreground hover:text-foreground">view →</Link>
              </div>
              {data.pipelineStages.every((s) => s.leadCount === 0) ? (
                <CrmEmptyState title="No leads in pipeline" description="Leads will appear as they progress through stages." />
              ) : (
                <ul className="space-y-1.5">
                  {data.pipelineStages.filter((s) => s.leadCount > 0).map((s) => (
                    <li key={s.stage}>
                      <Link href={`/admin/crm/leads?stage=${s.stage}`} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-xs hover:bg-muted">
                        <span className="font-medium">{s.label}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{fmtInt(s.leadCount)} leads</Badge>
                          {s.dealValue > 0 && <Badge variant="outline" className="text-[10px]">{fmtMoney(s.dealValue)}</Badge>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* ── Revenue trend + Lead aging ────────────────────────────── */}
        <div className="grid gap-3 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Revenue & Deal Trend</h3>
                <span className="text-[11px] text-muted-foreground">{data.revenueTrend.length} day buckets</span>
              </div>
              {data.revenueTrend.every((d) => d.dealsCreated === 0 && d.pipelineValue === 0) ? (
                <CrmEmptyState title="No deal activity in period" description="Revenue and deal creation trend will appear here when deals are created." />
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.revenueTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="pipeFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.5} interval={Math.max(1, Math.floor(data.revenueTrend.length / 8))} />
                      <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.5} />
                      <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v, name) => [name === 'wonRevenue' ? fmtMoney(Number(v)) : fmtInt(Number(v)), name === 'wonRevenue' ? 'Won Revenue' : name === 'pipelineValue' ? 'Pipeline' : 'Deals']} />
                      <Area type="monotone" dataKey="pipelineValue" stroke="#6366f1" strokeWidth={1.5} fill="url(#pipeFill)" name="Pipeline" />
                      <Area type="monotone" dataKey="wonRevenue" stroke="#10b981" strokeWidth={2} fill="url(#revFill)" name="Won Revenue" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <div className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Lead Aging</h3>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.leadAging} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="currentColor" opacity={0.5} />
                    <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.5} allowDecimals={false} />
                    <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v) => [fmtInt(Number(v)), 'Leads']} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {data.leadAging.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Category + Channel performance ────────────────────────── */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Category Performance</h3>
                <span className="text-[11px] text-muted-foreground">by niche</span>
              </div>
              {data.categoryPerformance.length === 0 ? (
                <CrmEmptyState title="No categories" description="Lead niches will appear here once leads are discovered with niche data." />
              ) : (
                <ul className="space-y-1.5">
                  {data.categoryPerformance.map((cat) => (
                    <li key={cat.category}>
                      <button
                        onClick={() => setNiche(cat.category === 'Uncategorized' ? 'all' : cat.category)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-border p-2 text-xs hover:bg-muted"
                      >
                        <span className="font-medium capitalize">{cat.category}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">{fmtInt(cat.leads)} leads</Badge>
                          <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Channel Performance</h3>
                <span className="text-[11px] text-muted-foreground">by outreach channel</span>
              </div>
              {data.channelPerformance.length === 0 ? (
                <CrmEmptyState title="No outreach sent" description="Channel performance will appear here once outreach messages are sent." />
              ) : (
                <ul className="space-y-2">
                  {data.channelPerformance.map((ch) => (
                    <li key={ch.channel} className="rounded-md border border-border p-2.5">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <button onClick={() => setChannel(ch.channel)} className="font-medium capitalize hover:underline">{ch.channel}</button>
                        <Badge variant="outline" className="text-[10px]">{fmtInt(ch.sent)} sent</Badge>
                      </div>
                      <div className="flex gap-3 text-[10px] text-muted-foreground">
                        <span>delivered: {ch.delivered}</span>
                        <span>opened: {ch.opened}</span>
                        <span className="text-emerald-600 dark:text-emerald-400">replied: {ch.replied}</span>
                        <span>reply rate: {ch.replyRate}%</span>
                        {ch.failed > 0 && <span className="text-rose-500">failed: {ch.failed}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* ── Deal velocity ─────────────────────────────────────────── */}
        <Card>
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Scale className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Deal Velocity</h3>
              <span className="text-[11px] text-muted-foreground">stage-to-stage timing</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {data.dealVelocity.map((v) => (
                <div key={v.metric} className="rounded-md border border-border p-2.5">
                  <p className="text-[11px] font-medium">{v.metric}</p>
                  {v.insufficientData ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">Insufficient data</p>
                  ) : (
                    <>
                      <p className="mt-1 text-sm font-semibold tabular-nums">{v.avgDays !== null ? `${v.avgDays}d` : '—'}</p>
                      <p className="text-[10px] text-muted-foreground">{v.sampleCount} samples</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ── Live activity feed ────────────────────────────────────── */}
        <Card>
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Live Activity</h3>
                <span className={`flex h-2 w-2 rounded-full ${liveDotClass}`} aria-hidden="true" />
              </div>
              <Link href="/admin/crm/activities" className="text-[11px] text-muted-foreground hover:text-foreground">view all →</Link>
            </div>
            {data.liveActivity.length === 0 ? (
              <CrmEmptyState title="No recent activity" description="Live events will stream here as they occur." />
            ) : (
              <ul className="space-y-1.5">
                <AnimatePresence mode="popLayout">
                  {data.liveActivity.slice(0, 8).map((a, i) => (
                    <motion.li
                      key={a.id}
                      layout
                      initial={reduced ? false : { opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduced ? undefined : { opacity: 0, x: 12 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.3 }}
                    >
                      <button
                        onClick={() => setSelectedLeadId(a.leadId)}
                        className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-2 text-left hover:bg-muted"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs">
                            <span className="font-medium">{a.leadBusinessName}</span>
                            <span className="ml-1.5 text-muted-foreground">· {humanize(a.type)}</span>
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">{a.description || a.actorEmail || 'system'}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* Lead detail drawer (reuses the leads API) */}
      <AnimatePresence>
        {selectedLeadId && (
          <LeadDetailDrawer leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />
        )}
      </AnimatePresence>
    </CrmShell>
  );
}

// ── Icon map ──────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp, TrendingDown, Trophy, Handshake, DollarSign, Target, Send,
  Calendar, UserPlus, MessageSquareReply, Scale, Activity, Bot, Zap,
  Flame, Clock, Wifi, WifiOff, RefreshCw,
};

// ── Funnel bars (inline, reuses styles from acquisition-funnel) ───────

function FunnelBars({ stages, reduced }: {
  stages: SalesOverview['funnel'];
  reduced: boolean;
}) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const gradients = [
    'from-sky-500/80 to-sky-600/80',
    'from-cyan-500/80 to-cyan-600/80',
    'from-teal-500/80 to-teal-600/80',
    'from-emerald-500/80 to-emerald-600/80',
    'from-amber-500/80 to-amber-600/80',
    'from-orange-500/80 to-orange-600/80',
    'from-violet-500/80 to-violet-600/80',
  ];
  return (
    <ul className="space-y-2">
      {stages.map((stage, i) => {
        const widthPercent = Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 4 : 1);
        return (
          <motion.li
            key={stage.stage}
            initial={reduced ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={reduced ? { duration: 0 } : { delay: Math.min(i * 0.06, 0.5) }}
          >
            <Link href={`/admin/crm/leads?stage=${stage.stage}`} className="group block">
              <div className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-right">
                  <p className="text-xs font-medium">{stage.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {stage.stepConversionPercent !== null ? `${stage.stepConversionPercent}% step` : 'start'}
                  </p>
                </div>
                <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-muted/50">
                  <motion.div
                    className={`absolute inset-y-0 left-0 rounded-md bg-gradient-to-r ${gradients[i] || 'from-slate-500/80 to-slate-600/80'}`}
                    initial={reduced ? { width: `${widthPercent}%` } : { width: 0 }}
                    animate={{ width: `${widthPercent}%` }}
                    transition={reduced ? { duration: 0 } : { delay: Math.min(i * 0.06 + 0.1, 0.6), duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-2.5">
                    <span className="text-xs font-semibold text-white mix-blend-difference">{fmtInt(stage.count)}</span>
                    <div className="flex items-center gap-2 text-[10px] text-white mix-blend-difference">
                      <span>{stage.conversionPercent}% of total</span>
                      {stage.dropOff !== null && stage.dropOff > 0 && <span className="opacity-80">−{fmtInt(stage.dropOff)}</span>}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </div>
            </Link>
          </motion.li>
        );
      })}
    </ul>
  );
}

// ── Lead detail drawer (lightweight, links to full leads page) ────────

function LeadDetailDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Lead Detail</SheetTitle>
          <SheetDescription className="sr-only">Open the full lead detail in the Leads workspace</SheetDescription>
        </SheetHeader>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Lead ID: <code className="rounded bg-muted px-1">{leadId}</code></p>
          <Link href={`/admin/crm/leads?id=${leadId}`}>
            <Button variant="default" size="sm" className="w-full">
              Open full lead detail <ExternalLink className="ml-1.5 h-3 w-3" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
