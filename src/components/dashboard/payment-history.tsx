// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment History Component
// Phase 5: Payments System
//
// Displays payment transaction history with status badges, provider
// info, and links to invoices.
// ═══════════════════════════════════════════════════════════════════

'use client';

import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  ChevronDown,
  Loader2,
  History,
  Calendar,
  AlertCircle,
  Search,
  ExternalLink,
  RefreshCcw,
  IndianRupee,
  Globe,
  Zap,
  Tag,
  FileText,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface PaymentHistoryEntry {
  id: string;
  amount: number;
  currency: string;
  plan: string;
  billingCycle: string;
  provider: string;
  status: string;
  couponCode: string | null;
  discountAmount: number;
  taxAmount: number;
  createdAt: string;
}

interface PaymentHistoryProps {
  className?: string;
  onRetryPayment?: (orderId: string) => void;
}

// ─── Status badge ───────────────────────────────────────────────────────────────

function PaymentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon?: React.ReactNode }> = {
    pending: {
      label: 'Pending',
      className: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
    },
    completed: {
      label: 'Completed',
      className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    },
    failed: {
      label: 'Failed',
      className: 'bg-red-500/10 text-red-500 border-red-500/20',
    },
    refunded: {
      label: 'Refunded',
      className: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
    },
  };

  const { label, className, icon } = config[status] || {
    label: status,
    className: 'bg-muted text-muted-foreground border-muted',
  };

  return (
    <Badge className={cn('text-[10px] gap-0.5', className)}>
      {icon}
      {label}
    </Badge>
  );
}

// ─── Provider badge ─────────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: string }) {
  const isRazorpay = provider === 'razorpay';
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] gap-1',
              isRazorpay
                ? 'border-blue-500/20 text-blue-500'
                : 'border-purple-500/20 text-purple-500'
            )}
          >
            {isRazorpay ? (
              <IndianRupee className="h-2.5 w-2.5" />
            ) : (
              <Globe className="h-2.5 w-2.5" />
            )}
            {isRazorpay ? 'Razorpay' : 'Stripe'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Payment processed via {isRazorpay ? 'Razorpay (INR)' : 'Stripe (USD)'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function PaymentHistory({ className, onRetryPayment }: PaymentHistoryProps) {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const limit = 10;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payment-history', page],
    queryFn: async () => {
      const res = await fetch(`/api/payments/history?page=${page}&limit=${limit}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch payment history');
      return res.json() as Promise<{
        orders: PaymentHistoryEntry[];
        pagination: { page: number; limit: number; total: number; hasMore: boolean };
      }>;
    },
    staleTime: 60 * 1000,
  });

  const filteredOrders = (data?.orders || []).filter((order) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      order.id.toLowerCase().includes(q) ||
      order.plan.toLowerCase().includes(q) ||
      order.provider.toLowerCase().includes(q) ||
      order.status.toLowerCase().includes(q)
    );
  });

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (error) {
    return (
      <div className={cn('rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center', className)}>
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-500 font-medium">Failed to load payment history</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 gap-1.5"
          onClick={() => refetch()}
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <History className="h-4 w-4 text-primary" />
          Payment History
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search payments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
              aria-label="Search payment history"
            />
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => refetch()}
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No payment history</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your payment transactions will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Order ID</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-[10px] text-muted-foreground max-w-[120px] truncate">
                      {order.id.slice(0, 12)}...
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1">
                        <Zap className="h-3 w-3 text-primary" />
                        <span className="capitalize">{order.plan}</span>
                        <span className="text-muted-foreground">({order.billingCycle})</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {formatCurrency(order.amount, order.currency)}
                    </TableCell>
                    <TableCell>
                      <ProviderBadge provider={order.provider} />
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {order.status === 'failed' && onRetryPayment && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-primary"
                                  onClick={() => onRetryPayment(order.id)}
                                >
                                  <RefreshCcw className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Retry payment</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {order.status === 'completed' && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground"
                                  onClick={() => {
                                    toast.info('Invoice details coming soon');
                                  }}
                                >
                                  <FileText className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View invoice</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filteredOrders.map((order) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium capitalize">{order.plan}</span>
                    <span className="text-xs text-muted-foreground">({order.billingCycle})</span>
                  </div>
                  <PaymentStatusBadge status={order.status} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <ProviderBadge provider={order.provider} />
                  </div>
                  <span className="font-semibold text-sm">
                    {formatCurrency(order.amount, order.currency)}
                  </span>
                </div>
                {order.couponCode && (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-500">
                    <Tag className="h-2.5 w-2.5" />
                    Coupon: {order.couponCode}
                  </div>
                )}
                {order.status === 'failed' && onRetryPayment && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-xs mt-1"
                    onClick={() => onRetryPayment(order.id)}
                  >
                    <RefreshCcw className="h-3 w-3" />
                    Retry Payment
                  </Button>
                )}
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {data?.pagination && data.pagination.hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
