'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Dashboard: Billing & Revenue
//
// Surfaces the existing platform billing service (admin-billing-service)
// through its API actions:
//   • overview   — active subs, revenue MoM, churn, failed payments
//   • metrics    — subscription movement (new / churned / upgrades)
//   • revenue    — revenue by period, plan and currency
//   • failed-payments — failed payment logs
//   • webhooks   — webhook monitoring
// All endpoints are super_admin-enforced server-side.
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
  DollarSign,
  CreditCard,
  AlertTriangle,
  Webhook,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Loader2,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend as RLegend,
} from 'recharts';

// ─── Types (mirror admin-billing-service interfaces) ──────────────────

interface OverviewData {
  totalActive: number;
  byPlan: { plan: string; count: number }[];
  revenue: { currentMonth: number; lastMonth: number; percentChange: number };
  failedPayments: number;
  pastDue: number;
  trials: number;
  churnRate: number;
}

interface MetricsData {
  newSubscriptions: { period: string; newSubscriptions: number; churned: number; upgrades: number; downgrades: number }[];
  churned: { period: string; churned: number }[];
  upgrades: number;
  downgrades: number;
  distribution: { plan: string; count: number }[];
}

interface RevenueData {
  periods: { period: string; revenue: number; refunds: number; net: number; gst: number }[];
  total: number;
  byPlan: { plan: string; revenue: number; count: number }[];
  byCurrency: { currency: string; revenue: number; count: number }[];
  gstTotal: number;
  refundsTotal: number;
}

interface FailedPaymentsData {
  payments: {
    id: string;
    userEmail: string;
    userName: string | null;
    provider: string;
    amount: number;
    currency: string;
    plan: string;
    status: string;
    createdAt: string;
  }[];
  total: number;
}

interface WebhooksData {
  webhooks: {
    id: string;
    eventId: string;
    eventType: string;
    provider: string;
    processed: boolean;
    processingError: string | null;
    receivedAt: string;
  }[];
  stats: { total: number; processed: number; failed: number; pending: number; avgProcessingTime: number | null };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtMoney(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n);
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function fetchAction<T>(action: string, extraParams = ''): Promise<T> {
  const res = await fetch(`/api/admin/billing?action=${action}${extraParams}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load ${action}`);
  const json = await res.json();
  return json.data as T;
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [failed, setFailed] = useState<FailedPaymentsData | null>(null);
  const [webhooks, setWebhooks] = useState<WebhooksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Revenue requires an explicit window — use the last 12 months
      const rangeEnd = new Date();
      const rangeStart = new Date();
      rangeStart.setFullYear(rangeStart.getFullYear() - 1);
      const rangeParams =
        '&startDate=' + rangeStart.toISOString().slice(0, 10) +
        '&endDate=' + rangeEnd.toISOString().slice(0, 10);
      const [o, m, r, f, w] = await Promise.all([
        fetchAction<OverviewData>('overview'),
        fetchAction<MetricsData>('metrics'),
        fetchAction<RevenueData>('revenue', rangeParams),
        fetchAction<FailedPaymentsData>('failed-payments'),
        fetchAction<WebhooksData>('webhooks'),
      ]);
      setOverview(o);
      setMetrics(m);
      setRevenue(r);
      setFailed(f);
      setWebhooks(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
          <p className="text-sm font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const mom = overview?.revenue.percentChange ?? 0;
  const revenueChart =
    revenue?.periods.map((p) => ({
      period: p.period.length >= 7 ? p.period.slice(0, 7) : p.period,
      revenue: Math.round(p.revenue * 100) / 100,
      net: Math.round(p.net * 100) / 100,
    })) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Billing &amp; Revenue</h1>
          <p className="text-xs text-muted-foreground">Platform-wide payments, subscriptions and webhook health</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} aria-label="Refresh billing data">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Revenue (This Month)</span>
              <DollarSign className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">
              {fmtMoney(overview?.revenue.currentMonth ?? 0)}
            </div>
            <p
              className={`mt-1 flex items-center gap-1 text-xs ${
                mom >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {mom >= 0 ? (
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3 w-3" aria-hidden="true" />
              )}
              {mom >= 0 ? '+' : ''}
              {Math.round(mom)}% vs last month ({fmtMoney(overview?.revenue.lastMonth ?? 0)})
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Active Subscriptions</span>
              <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{overview?.totalActive ?? 0}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {overview?.trials ?? 0} trialing · {overview?.pastDue ?? 0} past due
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Failed Payments</span>
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{overview?.failedPayments ?? 0}</div>
            <p className="mt-1 text-xs text-muted-foreground">All-time failed payment orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Churn Rate</span>
              <TrendingDown className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">
              {Math.round(overview?.churnRate ?? 0)}%
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics?.upgrades ?? 0} upgrades · {metrics?.downgrades ?? 0} downgrades
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Revenue by Period</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {revenueChart.length === 0 ? (
            <p className="pt-10 text-center text-xs text-muted-foreground">No revenue recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number | string) => fmtMoney(Number(v))} />
                <RLegend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="revenue" name="Gross" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" name="Net" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* By plan + currency */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue by Plan (all time)</CardTitle>
          </CardHeader>
          <CardContent>
            {!revenue || revenue.byPlan.length === 0 ? (
              <p className="text-xs text-muted-foreground">No plan revenue recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenue.byPlan.map((p) => (
                    <TableRow key={p.plan}>
                      <TableCell className="text-xs font-medium capitalize">{p.plan}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{p.count}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtMoney(p.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            {!overview || overview.byPlan.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active subscriptions.</p>
            ) : (
              <ul className="space-y-2">
                {overview.byPlan.map((p) => {
                  const max = Math.max(...overview.byPlan.map((x) => x.count), 1);
                  return (
                    <li key={p.plan} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium capitalize">{p.plan}</span>
                        <span className="tabular-nums text-muted-foreground">{p.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500/70"
                          style={{ width: `${(p.count / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Failed payments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
            Failed Payments (latest)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!failed || failed.payments.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No failed payments recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="pr-6 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failed.payments.slice(0, 10).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-6">
                      <p className="truncate text-xs font-medium max-w-[200px]">{p.userName || '—'}</p>
                      <p className="truncate text-[11px] text-muted-foreground max-w-[200px]">{p.userEmail}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {p.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{p.provider}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {fmtMoney(p.amount, p.currency)}
                    </TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">
                      {fmtDateTime(p.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Webhook Monitoring
            </span>
            {webhooks && webhooks.stats.failed > 0 ? (
              <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">
                {webhooks.stats.failed} failed
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">
                all processed
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!webhooks || webhooks.webhooks.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No webhook events recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Event</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.webhooks.slice(0, 10).map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="pl-6">
                      <p className="truncate text-xs font-medium max-w-[240px]">{w.eventType}</p>
                      <p className="truncate text-[10px] text-muted-foreground max-w-[240px]">{w.eventId}</p>
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{w.provider}</TableCell>
                    <TableCell>
                      {w.processed ? (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">
                          processed
                        </Badge>
                      ) : w.processingError ? (
                        <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">
                          failed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px]">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                          pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">
                      {fmtDateTime(w.receivedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
