'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CreditCard,
  Zap,
  Calendar,
  Download,
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  RefreshCw,
  Crown,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';

// ── Types ──

interface Invoice {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  pdfUrl: string | null;
  lineItems: string | null;
  createdAt: string;
}

interface PaymentOrder {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  plan: string;
  billingCycle: string;
  status: string;
  couponCode: string | null;
  discountAmount: number | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  createdAt: string;
  updatedAt: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
    currency: string;
    pdfUrl: string | null;
    createdAt: string;
  } | null;
}

interface SubscriptionInfo {
  id: string;
  plan: string;
  status: string;
  billingCycle: string;
  creditsTotal: number | null;
  creditsUsed: number | null;
  creditsRemaining: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isTrial: boolean;
  trialEndsAt: string | null;
}

interface BillingHistoryData {
  orders: PaymentOrder[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
  invoices: Invoice[];
  subscription: SubscriptionInfo | null;
  nextBillingDate: string | null;
  creditLedger: Array<{
    id: string;
    action: string;
    credits: number;
    balance: number;
    description: string;
    referenceId: string | null;
    createdAt: string;
  }>;
  planChanges: Array<{
    id: string;
    action: string;
    details: unknown;
    createdAt: string;
  }>;
  refunds: Array<{
    id: string;
    amount: number;
    currency: string;
    plan: string;
    refundedAt: string;
  }>;
}

// ── Helpers ──

function formatCurrency(amount: number, currency: string): string {
  const cur = currency?.toUpperCase() || 'INR';
  const value = cur === 'INR' ? amount : Math.round(amount / 100);
  return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPlanDisplayName(plan: string): string {
  switch (plan) {
    case 'pro':
      return 'Pro';
    case 'elite':
      return 'Elite';
    case 'enterprise':
      return 'Enterprise';
    default:
      return plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Free';
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case 'pending':
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case 'refunded':
      return (
        <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0 text-xs">
          Refunded
        </Badge>
      );
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function getSubscriptionStatusBadge(status: string, isTrial: boolean) {
  if (isTrial) {
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">
        Trial
      </Badge>
    );
  }
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
          Active
        </Badge>
      );
    case 'past_due':
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
          Past Due
        </Badge>
      );
    case 'canceled':
      return (
        <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0">
          Canceled
        </Badge>
      );
    case 'expired':
      return (
        <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0">
          Expired
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ── Main Component ──

export default function BillingHistoryPage() {
  const router = useRouter();
  const [data, setData] = useState<BillingHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);

  const handleGenerateInvoice = async (paymentOrderId: string) => {
    setGeneratingInvoice(paymentOrderId);
    try {
      const res = await fetch('/api/payments/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentOrderId, sendEmail: true }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchBillingHistory(page);
      }
    } catch (err) {
      console.error('Failed to generate invoice:', err);
    } finally {
      setGeneratingInvoice(null);
    }
  };

  const handleResendEmail = async (paymentOrderId: string) => {
    setResendingEmail(paymentOrderId);
    try {
      const res = await fetch('/api/payments/invoices/resend-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentOrderId }),
      });
      const data = await res.json();
      if (data.success) {
        // Could show a toast here
      }
    } catch (err) {
      console.error('Failed to resend email:', err);
    } finally {
      setResendingEmail(null);
    }
  };

  const handleDownloadInvoice = async (paymentOrderId: string) => {
    try {
      const downloadUrl = `/api/payments/invoice/${paymentOrderId}`;
      window.open(downloadUrl, '_blank');
    } catch (err) {
      console.error('Failed to download invoice:', err);
    }
  };

  const fetchBillingHistory = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/billing/history?page=${pageNum}&limit=20`);
      if (!res.ok) {
        throw new Error('Failed to fetch billing history');
      }
      const billingData: BillingHistoryData = await res.json();
      setData(billingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBillingHistory(page);
    return () => { cancelled = true; };
  }, [page, fetchBillingHistory]);

  // ── Loading State ──
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
            <h2 className="text-lg font-semibold mb-1">Loading Billing History</h2>
            <p className="text-sm text-muted-foreground">Fetching your billing data...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Error State ──
  if (error && !data) {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-10 w-10 text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-1">Failed to Load Billing Data</h2>
            <p className="text-sm text-muted-foreground text-center mb-4">{error}</p>
            <Button onClick={() => fetchBillingHistory(page)} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subscription = data?.subscription;
  const orders = data?.orders || [];
  const invoices = data?.invoices || [];
  const creditLedger = data?.creditLedger || [];

  return (
    <div className="min-h-screen bg-muted/40 dark:bg-background">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header — FIX 5: flex-wrap + min-w-0 so the title reflows on small
            screens without horizontal overflow or clipping behind any
            fixed/sticky browser chrome. */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-words">Billing & Payments</h1>
            <p className="text-sm text-muted-foreground break-words">
              Manage your subscription, view invoices, and track credit usage
            </p>
          </div>
        </div>

        {/* ── Plan Overview ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Current Plan Card */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Crown className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {subscription ? getPlanDisplayName(subscription.plan) : 'Free'} Plan
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {subscription?.billingCycle === 'yearly' ? 'Annual' : 'Monthly'} billing
                    </CardDescription>
                  </div>
                </div>
                {subscription && getSubscriptionStatusBadge(subscription.status, subscription.isTrial)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Credits Used</p>
                  <p className="text-lg font-semibold">
                    {subscription?.creditsUsed ?? 0}
                    <span className="text-sm text-muted-foreground font-normal">
                      {' '}/ {subscription?.creditsTotal ?? 50}
                    </span>
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Credits Remaining</p>
                  <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                    {subscription?.creditsRemaining ?? 0}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Period End</p>
                  <p className="text-sm font-medium">
                    {subscription?.currentPeriodEnd
                      ? formatDate(subscription.currentPeriodEnd)
                      : 'N/A'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Next Billing</p>
                  <p className="text-sm font-medium">
                    {data?.nextBillingDate
                      ? formatDate(data.nextBillingDate)
                      : 'N/A'}
                  </p>
                </div>
              </div>

              {subscription?.cancelAtPeriodEnd && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Your subscription will cancel at the end of the current billing period.
                  </p>
                </div>
              )}

              <Button
                className="w-full sm:w-auto gap-2"
                onClick={() => router.push('/')}
              >
                <TrendingUp className="h-4 w-4" />
                {subscription?.plan === 'free' ? 'Upgrade Plan' : 'Change Plan'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Credit Usage Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Credits</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center text-center">
                <div className="relative h-24 w-24 mb-3">
                  <svg className="h-24 w-24 transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="text-muted/30"
                    />
                    <path
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray={`${((subscription?.creditsRemaining ?? 50) / (subscription?.creditsTotal ?? 50)) * 100}, 100`}
                      className="text-primary"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold">
                      {subscription?.creditsRemaining ?? 0}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-medium">
                  {(subscription?.creditsRemaining ?? 50) > (subscription?.creditsTotal ?? 50) * 0.5
                    ? 'Credits Available'
                    : 'Running Low'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {subscription?.creditsTotal ?? 50} total this period
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Payment History ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Payment History</CardTitle>
              </div>
              <div className="flex items-center gap-3">
                {data?.pagination && (
                  <p className="text-xs text-muted-foreground">
                    {data.pagination.totalItems} payment{data.pagination.totalItems !== 1 ? 's' : ''}
                  </p>
                )}
                {orders.some(o => o.status === 'completed' && !o.invoice?.pdfUrl) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={async () => {
                      const completedWithoutInvoice = orders.filter(o => o.status === 'completed' && !o.invoice?.pdfUrl);
                      for (const order of completedWithoutInvoice) {
                        await handleGenerateInvoice(order.id);
                      }
                    }}
                    disabled={generatingInvoice !== null}
                  >
                    {generatingInvoice ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    Generate Missing
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No payments yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your payment history will appear here after your first purchase.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Plan</TableHead>
                        <TableHead className="text-xs">Cycle</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Invoice</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="text-xs py-3">
                            {formatDate(order.createdAt)}
                          </TableCell>
                          <TableCell className="text-xs py-3 font-medium">
                            {getPlanDisplayName(order.plan)}
                          </TableCell>
                          <TableCell className="text-xs py-3 capitalize">
                            {order.billingCycle}
                          </TableCell>
                          <TableCell className="text-xs py-3 font-medium">
                            {formatCurrency(order.amount, order.currency)}
                          </TableCell>
                          <TableCell className="text-xs py-3">
                            {getStatusBadge(order.status)}
                          </TableCell>
                          <TableCell className="text-xs py-3">
                            {order.invoice?.invoiceNumber ? (
                              <span className="font-mono text-muted-foreground">
                                {order.invoice.invoiceNumber}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {order.invoice?.pdfUrl ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() => handleDownloadInvoice(order.id)}
                                  title="Download Invoice PDF"
                                >
                                  <Download className="h-3 w-3" />
                                  PDF
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 text-xs text-primary"
                                  onClick={() => handleGenerateInvoice(order.id)}
                                  disabled={generatingInvoice === order.id}
                                  title="Generate Invoice"
                                >
                                  {generatingInvoice === order.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <FileText className="h-3 w-3" />
                                  )}
                                  Generate
                                </Button>
                              )}
                              {order.invoice && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() => handleResendEmail(order.id)}
                                  disabled={resendingEmail === order.id}
                                  title="Resend Invoice Email"
                                >
                                  {resendingEmail === order.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3 w-3" />
                                  )}
                                  Email
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden space-y-3 max-h-96 overflow-y-auto">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            {getPlanDisplayName(order.plan)} Plan
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {order.billingCycle} · {formatDate(order.createdAt)}
                          </p>
                        </div>
                        {getStatusBadge(order.status)}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">
                          {formatCurrency(order.amount, order.currency)}
                        </p>
                        {order.invoice?.pdfUrl ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => handleDownloadInvoice(order.id)}
                          >
                            <Download className="h-3 w-3" />
                            PDF
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs text-primary"
                            onClick={() => handleGenerateInvoice(order.id)}
                            disabled={generatingInvoice === order.id}
                          >
                            {generatingInvoice === order.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <FileText className="h-3 w-3" />
                            )}
                            Generate
                          </Button>
                        )}
                        {order.invoice && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => handleResendEmail(order.id)}
                            disabled={resendingEmail === order.id}
                          >
                            {resendingEmail === order.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Email
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {data?.pagination && data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {page} of {data.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= data.pagination.totalPages || loading}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Recent Credit Activity ── */}
        {creditLedger.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Credit Activity</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {creditLedger.slice(0, 15).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p
                        className={`text-sm font-semibold ${
                          entry.credits > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {entry.credits > 0 ? '+' : ''}
                        {entry.credits}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Balance: {entry.balance}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Invoices List ── */}
        {invoices.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Invoices</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium font-mono">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(inv.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold">
                        {formatCurrency(inv.total, inv.currency)}
                      </p>
                      {inv.pdfUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => window.open('/api/billing/invoices/' + inv.id + '/download', '_blank')}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-xs text-center text-muted-foreground pb-4">
          Need help with billing? Contact{' '}
          <a
            href="mailto:support@acquisitionos.com"
            className="text-primary hover:text-primary/80 underline"
          >
            support@acquisitionos.com
          </a>
        </p>
      </div>
    </div>
  );
}
