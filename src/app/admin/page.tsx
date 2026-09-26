'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Dashboard: Platform Overview
//
// Platform-wide KPIs, signup trend, plan distribution, recent signups
// and recent platform activity. Data comes from GET /api/admin/overview
// (server-enforced super_admin only).
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  UserPlus,
  CreditCard,
  DollarSign,
  Target,
  Workflow,
  Coins,
  Activity,
  AlertTriangle,
  RefreshCw,
  Inbox,
  ShieldCheck,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────

interface OverviewData {
  generatedAt: string;
  users: {
    total: number;
    active: number;
    inactive: number;
    verified: number;
    newLast7d: number;
    newLast30d: number;
    today: number;
    byRole: { role: string; count: number }[];
    byPlan: { plan: string; count: number }[];
  };
  signupTrend: { date: string; count: number }[];
  leads: { total: number; last7d: number; last30d: number };
  workflows: {
    definitions: number;
    executions: number;
    executionsLast7d: number;
    completed: number;
    failed: number;
    running: number;
    successRate: number;
    byStatus: { status: string; count: number }[];
  };
  outreach: { sequences: number; messages: number };
  billing: {
    revenueThisMonth: number;
    revenueLastMonth: number;
    momChangePercent: number;
    revenueAllTime: number;
    completedOrders: number;
    failedOrders: number;
    activeSubscriptions: number;
    trialingSubscriptions: number;
  };
  credits: { totalBalance: number; ledgerEntries: number; ledgerLast30d: number };
  feedback: { total: number; open: number };
  system: { unresolvedEvents: number; criticalEvents: number };
  recentSignups: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    plan: string;
    isActive: boolean;
    createdAt: string;
  }[];
  recentAudit: {
    id: string;
    action: string;
    resource: string | null;
    resourceId: string | null;
    createdAt: string;
    user: { email: string; name: string | null } | null;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

const CHART_COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#eab308', '#64748b'];

function fmtInt(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function humanize(s: string): string {
  return s.replace(/_/g, ' ');
}

// ─── Subcomponents ────────────────────────────────────────────────────

interface KpiProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  subTone?: 'positive' | 'negative' | 'neutral';
}

function KpiCard({ icon: Icon, label, value, sub, subTone = 'neutral' }: KpiProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        {sub && (
          <p
            className={
              'mt-1 text-xs ' +
              (subTone === 'positive'
                ? 'text-emerald-600 dark:text-emerald-400'
                : subTone === 'negative'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-muted-foreground')
            }
          >
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/overview', { credentials: 'include' });
      if (!res.ok) {
        throw new Error(res.status === 403 ? 'Admin access required' : 'Failed to load overview');
      }
      const json = await res.json();
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading platform overview">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
          <p className="text-sm font-medium">{error || 'Something went wrong'}</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const planDist = data.users.byPlan
    .slice()
    .sort((a, b) => b.count - a.count)
    .map((p) => ({ name: p.plan, value: p.count }));

  const mom = data.billing.momChangePercent;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Platform Overview</h1>
          <p className="text-xs text-muted-foreground">
            Live across all tenants · updated {fmtDateTime(data.generatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.system.criticalEvents > 0 ? (
            <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400" variant="outline">
              <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
              {data.system.criticalEvents} critical events
            </Badge>
          ) : (
            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400" variant="outline">
              <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
              System healthy
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={load} aria-label="Refresh overview">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          icon={Users}
          label="Total Users"
          value={fmtInt(data.users.total)}
          sub={`+${fmtInt(data.users.newLast30d)} in 30 days`}
          subTone="positive"
        />
        <KpiCard
          icon={CreditCard}
          label="Active Subscriptions"
          value={fmtInt(data.billing.activeSubscriptions)}
          sub={`${fmtInt(data.billing.trialingSubscriptions)} trialing`}
        />
        <KpiCard
          icon={DollarSign}
          label="Revenue (This Month)"
          value={fmtMoney(data.billing.revenueThisMonth)}
          sub={`${mom >= 0 ? '+' : ''}${mom}% vs last month`}
          subTone={mom >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          icon={Target}
          label="Total Leads"
          value={fmtInt(data.leads.total)}
          sub={`+${fmtInt(data.leads.last7d)} in 7 days`}
          subTone="positive"
        />
        <KpiCard
          icon={Workflow}
          label="Workflow Executions"
          value={fmtInt(data.workflows.executions)}
          sub={`${data.workflows.successRate}% success rate`}
          subTone={data.workflows.successRate >= 90 ? 'positive' : data.workflows.successRate >= 70 ? 'neutral' : 'negative'}
        />
        <KpiCard
          icon={Coins}
          label="Credits in Circulation"
          value={fmtInt(data.credits.totalBalance)}
          sub={`${fmtInt(data.credits.ledgerLast30d)} ledger entries in 30d`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Signups — last 30 days
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.signupTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  opacity={0.5}
                  interval={4}
                />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} allowDecimals={false} />
                <RTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v) => [`${v} signups`, '']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#signupFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Users by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={planDist}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="52%"
                    outerRadius="80%"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {planDist.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <LegendPlain items={planDist} />
          </CardContent>
        </Card>
      </div>

      {/* Recent signups + activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Signups</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {data.recentSignups.length === 0 ? (
              <p className="px-6 pb-4 text-xs text-muted-foreground">No users yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">User</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="pr-6 text-right">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentSignups.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold uppercase text-primary">
                            {(u.name || u.email).slice(0, 2)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium max-w-[180px]">
                              {u.name || '—'}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground max-w-[180px]">
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] capitalize">
                          {u.plan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{u.role}</span>
                      </TableCell>
                      <TableCell className="pr-6 text-right text-xs text-muted-foreground">
                        {fmtDate(u.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Recent Platform Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentAudit.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-xs text-muted-foreground">No audit activity recorded yet.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.recentAudit.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {humanize(a.action)}
                        {a.resource ? (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            · {a.resource}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {a.user?.email || 'system'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tiny legend for the pie chart ───────────────────────────────────

function LegendPlain({ items }: { items: { name: string; value: number }[] }) {
  return (
    <ul aria-label="Users by plan" className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      {items.map((it, i) => (
        <li key={it.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
          />
          <span className="capitalize">
            {it.name} ({it.value})
          </span>
        </li>
      ))}
    </ul>
  );
}
