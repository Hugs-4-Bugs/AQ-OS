'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Dashboard: Billing & Revenue
//
// Surfaces the existing platform billing service (admin-billing-service)
// through its API actions:
//   • overview          — active subs, revenue MoM, churn, failed payments
//   • metrics           — subscription movement (new / churned / upgrades)
//   • revenue           — revenue by period, plan and currency
//   • failed-payments   — failed payment logs
//   • webhooks          — webhook monitoring
//   • invoices          — invoice tracking list
//   • subscriptions     — operational subscription list
//   • payments          — payment/transaction list
//   • refunds           — refund history
//   • credits           — credits overview + recent ledger
//   • ai-usage          — AI/model invocation overview
//   • events            — billing-related audit log
//   • provider-status   — Stripe/Razorpay config + webhook health
//
// All endpoints are RBAC-gated with billing:read (super_admin / admin /
// analytics). Refund *execution* is gated separately with billing.refund
// (super_admin ONLY) and lives at POST /api/admin/refund.
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
  Bot,
  ScrollText,
  ShieldCheck,
  Receipt,
  Repeat,
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

interface InvoicesData {
  invoices: {
    id: string;
    invoiceNumber: string;
    userId: string;
    userEmail: string;
    userName: string | null;
    total: number;
    currency: string;
    status: string | null;
    createdAt: string;
  }[];
  total: number;
}

interface SubscriptionsData {
  subscriptions: {
    id: string;
    userId: string;
    userEmail: string;
    userName: string | null;
    plan: string;
    status: string;
    billingCycle: string;
    isTrial: boolean;
    trialEndsAt: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    provider: 'stripe' | 'razorpay' | 'none';
    providerSubscriptionId: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  total: number;
}

interface PaymentsData {
  payments: {
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
    createdAt: string;
    updatedAt: string;
  }[];
  total: number;
}

interface RefundsData {
  refunds: {
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
    createdAt: string;
    updatedAt: string;
  }[];
  total: number;
  totalRefundedAmount: number;
}

interface CreditsData {
  totalCreditBalance: number;
  totalLedgerEntries: number;
  recentEntries: {
    id: string;
    userId: string;
    userEmail: string;
    userName: string | null;
    action: string;
    credits: number;
    balance: number;
    description: string | null;
    referenceId: string | null;
    createdAt: string;
  }[];
}

interface AIUsageData {
  totals: { invocations: number; tokens: number; completed: number; failed: number };
  byProvider: { provider: string; invocations: number; tokens: number }[];
  byModel: { provider: string; model: string; invocations: number; tokens: number }[];
  recent: {
    id: string;
    invocationKey: string;
    provider: string;
    model: string;
    status: string;
    tokensUsed: number | null;
    durationMs: number | null;
    userId: string;
    startedAt: string | null;
    finishedAt: string | null;
  }[];
  total: number;
}

interface BillingEventsData {
  events: {
    id: string;
    userId: string;
    action: string;
    details: string | null;
    resource: string | null;
    resourceId: string | null;
    ipAddress: string | null;
    createdAt: string;
  }[];
  total: number;
}

interface ProviderStatusData {
  providers: {
    provider: 'stripe' | 'razorpay';
    configState: 'CONFIGURED' | 'NOT_CONFIGURED' | 'ERROR' | 'UNKNOWN';
    health: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
    recentEvents: number;
    recentFailures: number;
    lastEventAt: string | null;
    lastFailureAt: string | null;
  }[];
  webhookHealth: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
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

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function fetchAction<T>(action: string, extraParams = ''): Promise<T> {
  const res = await fetch(`/api/admin/billing?action=${action}${extraParams}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load ${action} (${res.status})`);
  const json = await res.json();
  return json.data as T;
}

// Badge color helpers — config presence is NOT health.
function configBadge(state: string) {
  if (state === 'CONFIGURED')
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">CONFIGURED</Badge>;
  if (state === 'NOT_CONFIGURED')
    return <Badge variant="outline" className="bg-muted text-muted-foreground text-[11px]">NOT_CONFIGURED</Badge>;
  if (state === 'ERROR')
    return <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">ERROR</Badge>;
  return <Badge variant="outline" className="text-[11px]">UNKNOWN</Badge>;
}

function healthBadge(state: string) {
  if (state === 'HEALTHY')
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">HEALTHY</Badge>;
  if (state === 'DEGRADED')
    return <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[11px] dark:text-amber-400">DEGRADED</Badge>;
  if (state === 'DOWN')
    return <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">DOWN</Badge>;
  return <Badge variant="outline" className="text-[11px]">UNKNOWN</Badge>;
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (['active', 'completed', 'processed', 'succeeded'].includes(s))
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">{status}</Badge>;
  if (['failed', 'past_due', 'canceled', 'expired', 'down'].includes(s))
    return <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">{status}</Badge>;
  if (['trialing', 'trial', 'pending'].includes(s))
    return <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[11px] dark:text-amber-400">{status}</Badge>;
  if (['refunded'].includes(s))
    return <Badge variant="outline" className="bg-violet-500/15 text-violet-600 border-violet-500/30 text-[11px] dark:text-violet-400">{status}</Badge>;
  return <Badge variant="outline" className="text-[11px]">{status}</Badge>;
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [failed, setFailed] = useState<FailedPaymentsData | null>(null);
  const [webhooks, setWebhooks] = useState<WebhooksData | null>(null);
  const [invoices, setInvoices] = useState<InvoicesData | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionsData | null>(null);
  const [payments, setPayments] = useState<PaymentsData | null>(null);
  const [refunds, setRefunds] = useState<RefundsData | null>(null);
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [aiUsage, setAIUsage] = useState<AIUsageData | null>(null);
  const [events, setEvents] = useState<BillingEventsData | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusData | null>(null);
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
      const [
        o, m, r, f, w, inv, subs, pay, ref, cred, ai, evt, prov,
      ] = await Promise.all([
        fetchAction<OverviewData>('overview'),
        fetchAction<MetricsData>('metrics'),
        fetchAction<RevenueData>('revenue', rangeParams),
        fetchAction<FailedPaymentsData>('failed-payments'),
        fetchAction<WebhooksData>('webhooks'),
        fetchAction<InvoicesData>('invoices'),
        fetchAction<SubscriptionsData>('subscriptions'),
        fetchAction<PaymentsData>('payments'),
        fetchAction<RefundsData>('refunds'),
        fetchAction<CreditsData>('credits'),
        fetchAction<AIUsageData>('ai-usage'),
        fetchAction<BillingEventsData>('events'),
        fetchAction<ProviderStatusData>('provider-status'),
      ]);
      setOverview(o); setMetrics(m); setRevenue(r); setFailed(f); setWebhooks(w);
      setInvoices(inv); setSubscriptions(subs); setPayments(pay); setRefunds(ref);
      setCredits(cred); setAIUsage(ai); setEvents(evt); setProviderStatus(prov);
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
          <p className="text-xs text-muted-foreground">Platform-wide payments, subscriptions, credits, AI usage and webhook health</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} aria-label="Refresh billing data">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* KPI row — billing overview (preserved) */}
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

      {/* Revenue chart (preserved) */}
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

      {/* By plan + currency (preserved) */}
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

      {/* ─── Provider Status ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Provider Status
            <span className="ml-auto text-[11px] text-muted-foreground">Aggregate webhook health:</span>
            {providerStatus && healthBadge(providerStatus.webhookHealth)}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!providerStatus || providerStatus.providers.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No provider status available.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Provider</TableHead>
                  <TableHead>Configuration</TableHead>
                  <TableHead>Webhook Health</TableHead>
                  <TableHead className="text-right">Recent Events (24h)</TableHead>
                  <TableHead className="text-right">Failures (24h)</TableHead>
                  <TableHead className="pr-6 text-right">Last Event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerStatus.providers.map((p) => (
                  <TableRow key={p.provider}>
                    <TableCell className="pl-6 text-xs font-medium capitalize">{p.provider}</TableCell>
                    <TableCell>{configBadge(p.configState)}</TableCell>
                    <TableCell>{healthBadge(p.health)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{p.recentEvents}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{p.recentFailures}</TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(p.lastEventAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="px-6 pb-3 pt-2 text-[10px] text-muted-foreground">
            Configuration state reflects env var presence only. Health is derived from PaymentWebhook evidence (last 24h, ≥5 events required). HEALTHY is never claimed from env var presence alone.
          </p>
        </CardContent>
      </Card>

      {/* ─── Subscriptions ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Subscriptions
            <span className="ml-auto text-[11px] text-muted-foreground">{subscriptions?.total ?? 0} total</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!subscriptions || subscriptions.subscriptions.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No subscriptions recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead className="text-right">Current Period</TableHead>
                  <TableHead className="pr-6 text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.subscriptions.slice(0, 10).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-6">
                      <p className="truncate text-xs font-medium max-w-[180px]">{s.userName || '—'}</p>
                      <p className="truncate text-[11px] text-muted-foreground max-w-[180px]">{s.userEmail}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] capitalize">{s.plan}</Badge>
                    </TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{s.provider === 'none' ? '—' : s.provider}</TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{s.billingCycle}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {s.currentPeriodStart ? `${fmtDate(s.currentPeriodStart)} → ${fmtDate(s.currentPeriodEnd)}` : '—'}
                    </TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(s.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Invoices ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Invoices
            <span className="ml-auto text-[11px] text-muted-foreground">{invoices?.total ?? 0} total</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!invoices || invoices.invoices.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No invoices recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="pr-6 text-right">Issued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.invoices.slice(0, 10).map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="pl-6 text-xs font-medium">{inv.invoiceNumber}</TableCell>
                    <TableCell>
                      <p className="truncate text-xs max-w-[180px]">{inv.userName || inv.userEmail}</p>
                    </TableCell>
                    <TableCell>{inv.status ? statusBadge(inv.status) : <Badge variant="outline" className="text-[11px]">—</Badge>}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtMoney(inv.total, inv.currency)}</TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDate(inv.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Payments / Transactions ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Payments / Transactions
            <span className="ml-auto text-[11px] text-muted-foreground">{payments?.total ?? 0} total</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!payments || payments.payments.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No payment orders recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.payments.slice(0, 10).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-6">
                      <p className="truncate text-xs font-medium max-w-[180px]">{p.userName || '—'}</p>
                      <p className="truncate text-[11px] text-muted-foreground max-w-[180px]">{p.userEmail}</p>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[11px] capitalize">{p.plan}</Badge></TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{p.provider}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground truncate max-w-[140px]">{p.providerPaymentId || '—'}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtMoney(p.amount, p.currency)}</TableCell>
                    <TableCell>{statusBadge(p.status)}</TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Failed Payments (preserved) ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
            Failed Payments (latest)
            <span className="ml-auto text-[11px] text-muted-foreground">{failed?.total ?? 0} total</span>
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

      {/* ─── Refunds ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Repeat className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Refund History
            <span className="ml-auto text-[11px] text-muted-foreground">
              {refunds?.total ?? 0} refunded · {refunds ? fmtMoney(refunds.totalRefundedAmount) : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!refunds || refunds.refunds.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No refunds recorded. Refund execution requires billing.refund permission (super_admin only) via POST /api/admin/refund.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Customer</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Refunded Amount</TableHead>
                  <TableHead className="pr-6 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.refunds.slice(0, 10).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6">
                      <p className="truncate text-xs font-medium max-w-[180px]">{r.userName || '—'}</p>
                      <p className="truncate text-[11px] text-muted-foreground max-w-[180px]">{r.userEmail}</p>
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{r.provider}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground truncate max-w-[140px]">{r.providerPaymentId || '—'}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtMoney(r.amount, r.currency)}</TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(r.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Credits Overview ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Credits Overview
            <span className="ml-auto text-[11px] text-muted-foreground">
              Total balance: {credits?.totalCreditBalance ?? 0} · {credits?.totalLedgerEntries ?? 0} ledger entries
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!credits || credits.recentEntries.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No credit ledger entries recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="pr-6 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credits.recentEntries.slice(0, 10).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6">
                      <p className="truncate text-xs font-medium max-w-[180px]">{e.userName || e.userEmail}</p>
                    </TableCell>
                    <TableCell className="text-xs">{e.action}</TableCell>
                    <TableCell className={`text-right text-xs tabular-nums ${e.credits < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {e.credits > 0 ? '+' : ''}{e.credits}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{e.balance}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground truncate max-w-[200px]">{e.description || '—'}</TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── AI Usage Overview ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            AI / Model Usage
            <span className="ml-auto text-[11px] text-muted-foreground">
              {aiUsage?.totals.invocations ?? 0} invocations · {aiUsage?.totals.tokens ?? 0} tokens · {aiUsage?.totals.completed ?? 0} completed · {aiUsage?.totals.failed ?? 0} failed
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* By provider aggregate */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase text-muted-foreground">By Provider</p>
            {!aiUsage || aiUsage.byProvider.length === 0 ? (
              <p className="text-xs text-muted-foreground">No AI usage recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Invocations</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiUsage.byProvider.map((p) => (
                    <TableRow key={p.provider}>
                      <TableCell className="text-xs font-medium">{p.provider}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{p.invocations}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{p.tokens}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {/* Recent invocations */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase text-muted-foreground">Recent Invocations</p>
            {!aiUsage || aiUsage.recent.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent AI invocations.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Provider / Model</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Duration (ms)</TableHead>
                    <TableHead className="pr-6 text-right">Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiUsage.recent.slice(0, 10).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-6">
                        <p className="text-xs font-medium">{r.provider}</p>
                        <p className="text-[11px] text-muted-foreground">{r.model}</p>
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{r.tokensUsed ?? '—'}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{r.durationMs ?? '—'}</TableCell>
                      <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(r.startedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Billing Events ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ScrollText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Billing Events
            <span className="ml-auto text-[11px] text-muted-foreground">{events?.total ?? 0} total</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!events || events.events.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No billing events recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="pr-6 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.events.slice(0, 10).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6 text-xs font-medium">{e.action}</TableCell>
                    <TableCell className="text-[11px] capitalize text-muted-foreground">{e.resource || '—'}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground truncate max-w-[280px]">{e.details || '—'}</TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Webhook Monitoring (preserved) ─── */}
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
