// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Invoice History Component
// Phase 5: Payments System
//
// Displays list of invoices with expandable detail, download button,
// and pagination.
// ═══════════════════════════════════════════════════════════════════

'use client';

import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  Loader2,
  Receipt,
  Calendar,
  IndianRupee,
  Globe,
  AlertCircle,
  Search,
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface InvoiceEntry {
  id: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  createdAt: string;
  pdfUrl?: string | null;
  status: string;
  plan: string;
  billingCycle: string;
  // Nested for expanded detail (may not always be present)
  discountAmount?: number;
  couponCode?: string | null;
}

interface InvoiceHistoryProps {
  className?: string;
}

// ─── Status badge ───────────────────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    completed: {
      label: 'Paid',
      className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    },
    pending: {
      label: 'Pending',
      className: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
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

  const { label, className } = config[status] || {
    label: status,
    className: 'bg-muted text-muted-foreground border-muted',
  };

  return <Badge className={cn('text-[10px]', className)}>{label}</Badge>;
}

// ─── Expandable invoice row ─────────────────────────────────────────────────────

function InvoiceRow({ invoice, isExpanded, onToggle }: {
  invoice: InvoiceEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const formatCurrency = (amount: number, currency: string) => {
    if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const dateStr = new Date(invoice.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <TableCell className="font-mono text-xs">
          {invoice.invoiceNumber}
        </TableCell>
        <TableCell className="text-xs">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            {dateStr}
          </div>
        </TableCell>
        <TableCell className="text-xs capitalize">
          {invoice.paymentOrder.plan} / {invoice.paymentOrder.billingCycle}
        </TableCell>
        <TableCell className="text-xs font-medium">
          {formatCurrency(invoice.total, invoice.currency)}
        </TableCell>
        <TableCell>
          <InvoiceStatusBadge status={invoice.paymentOrder.status} />
        </TableCell>
        <TableCell className="w-8">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
      </TableRow>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <TableRow>
            <TableCell colSpan={6} className="p-0 border-b-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-muted/20 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Subtotal</p>
                      <p className="font-medium">{formatCurrency(invoice.subtotal, invoice.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tax ({(invoice.taxRate * 100).toFixed(0)}%)</p>
                      <p className="font-medium">{formatCurrency(invoice.taxAmount, invoice.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
                      <p className="font-bold text-primary">{formatCurrency(invoice.total, invoice.currency)}</p>
                    </div>
                    {invoice.paymentOrder.couponCode && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Coupon</p>
                        <p className="font-medium text-emerald-500">{invoice.paymentOrder.couponCode}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (invoice.pdfUrl) {
                          window.open(invoice.pdfUrl, '_blank');
                        } else {
                          toast.info('Invoice PDF generation is coming soon.');
                        }
                      }}
                    >
                      <Download className="h-3 w-3" />
                      Download PDF
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Copy invoice number
                        navigator.clipboard.writeText(invoice.invoiceNumber);
                        toast.success('Invoice number copied!');
                      }}
                    >
                      Copy Invoice #
                    </Button>
                  </div>
                </div>
              </motion.div>
            </TableCell>
          </TableRow>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Mobile card view ───────────────────────────────────────────────────────────

function InvoiceCard({ invoice, isExpanded, onToggle }: {
  invoice: InvoiceEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const formatCurrency = (amount: number, currency: string) => {
    if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const dateStr = new Date(invoice.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all cursor-pointer',
        isExpanded ? 'border-primary/30 bg-primary/5' : 'hover:border-primary/20'
      )}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs text-muted-foreground">{invoice.invoiceNumber}</span>
        <InvoiceStatusBadge status={invoice.paymentOrder.status} />
      </div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium capitalize">{invoice.paymentOrder.plan}</span>
        <span className="text-sm font-bold">{formatCurrency(invoice.total, invoice.currency)}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {dateStr}
        </span>
        <span className="capitalize">{invoice.paymentOrder.billingCycle}</span>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Separator className="my-3" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
              </div>
              {invoice.paymentOrder.couponCode && (
                <div className="flex justify-between text-emerald-500">
                  <span>Coupon ({invoice.paymentOrder.couponCode})</span>
                  <span>-{formatCurrency(invoice.paymentOrder.discountAmount, invoice.currency)}</span>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (invoice.pdfUrl) {
                      window.open(invoice.pdfUrl, '_blank');
                    } else {
                      toast.info('Invoice PDF generation is coming soon.');
                    }
                  }}
                >
                  <Download className="h-3 w-3" />
                  Download
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function InvoiceHistory({ className }: InvoiceHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const limit = 10;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['invoices', page],
    queryFn: async () => {
      const offset = (page - 1) * limit;
      const res = await fetch(`/api/payments/invoices?limit=${limit}&offset=${offset}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch invoices');
      return res.json() as Promise<{
        invoices: InvoiceEntry[];
        total: number;
      }>;
    },
    staleTime: 60 * 1000,
  });

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const filteredInvoices = (data?.invoices || []).filter((inv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.paymentOrder?.plan || '').toLowerCase().includes(q) ||
      (inv.paymentOrder?.status || '').toLowerCase().includes(q) ||
      (inv.plan || '').toLowerCase().includes(q) ||
      (inv.status || '').toLowerCase().includes(q)
    );
  });

  if (error) {
    return (
      <div className={cn('rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center', className)}>
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-500 font-medium">Failed to load invoices</p>
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
          <FileText className="h-4 w-4 text-primary" />
          Invoices
        </h3>
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
            aria-label="Search invoices"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No invoices yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Invoices will appear here after your first payment.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    isExpanded={expandedId === invoice.id}
                    onToggle={() => toggleExpand(invoice.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filteredInvoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                isExpanded={expandedId === invoice.id}
                onToggle={() => toggleExpand(invoice.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {data && page * limit < data.total && (
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
