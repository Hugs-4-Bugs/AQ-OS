'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Send,
  CheckCheck,
  Eye,
  XCircle,
  RefreshCw,
  Download,
  Filter,
  Search,
  RotateCcw,
  Mail,
  MessageCircle,
  Loader2,
  Clock,
  ArrowUpDown,
  X,
  Activity,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────

type DeliveryChannel = 'email' | 'telegram' | 'whatsapp';
type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

interface DeliveryRecord {
  id: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  recipient: string;
  contentPreview: string;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  retryCount: number;
  errorMessage?: string;
  templateName?: string;
}

interface DeliveryStats {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  byChannel: {
    email: { sent: number; delivered: number; read: number; failed: number };
    telegram: { sent: number; delivered: number; read: number; failed: number };
    whatsapp: { sent: number; delivered: number; read: number; failed: number };
  };
}

// ─── Constants ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DeliveryStatus, { icon: React.ElementType; label: string; color: string; bgColor: string }> = {
  sent: { icon: Send, label: 'Sent', color: 'text-emerald-600', bgColor: 'bg-emerald-500/10 border-emerald-500/20' },
  delivered: { icon: CheckCheck, label: 'Delivered', color: 'text-teal-600', bgColor: 'bg-teal-500/10 border-teal-500/20' },
  read: { icon: Eye, label: 'Read', color: 'text-purple-600', bgColor: 'bg-purple-500/10 border-purple-500/20' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-red-600', bgColor: 'bg-red-500/10 border-red-500/20' },
};

const CHANNEL_ICONS: Record<DeliveryChannel, React.ElementType> = {
  email: Mail,
  telegram: Send,
  whatsapp: MessageCircle,
};

// ─── Skeleton ─────────────────────────────────────────────────────

function DeliveryPageSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('text-[10px] h-5 gap-1', config.bgColor, config.color)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', color)}>
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export default function WhatsappDeliveryPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [stats, setStats] = useState<DeliveryStats | null>(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<DeliveryChannel | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch deliveries
  const fetchDeliveries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/deliveries?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        // Cap to 100 items to prevent unbounded memory growth
        const raw = (data.deliveries ?? data ?? []) as any[];
        setDeliveries(raw.slice(0, 100));
        if (data.stats) setStats(data.stats);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [channelFilter, statusFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchDeliveries, 15000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchDeliveries]);

  // Retry failed delivery
  const handleRetry = async (id: string) => {
    setRetrying(id);
    try {
      const res = await fetch(`/api/deliveries/${id}/retry`, { method: 'POST' });
      if (!res.ok) throw new Error('Retry failed');
      toast({ title: 'Retry Sent', description: 'The message has been queued for retry.' });
      fetchDeliveries();
    } catch {
      toast({ title: 'Retry Failed', description: 'Could not retry delivery.', variant: 'destructive' });
    } finally {
      setRetrying(null);
    }
  };

  // Export CSV
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('format', 'csv');

      const res = await fetch(`/api/deliveries/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deliveries-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Export Complete', description: 'CSV file downloaded.' });
    } catch {
      toast({ title: 'Export Failed', description: 'Could not export deliveries.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  // Filtered deliveries (client-side additional filter for search)
  const filteredDeliveries = useMemo(() => {
    if (!search.trim()) return deliveries;
    const q = search.toLowerCase();
    return deliveries.filter(
      (d) =>
        d.recipient.toLowerCase().includes(q) ||
        d.contentPreview.toLowerCase().includes(q) ||
        d.templateName?.toLowerCase().includes(q)
    );
  }, [deliveries, search]);

  // Computed stats fallback
  const computedStats = useMemo<DeliveryStats>(() => {
    if (stats) return stats;
    const byChannel = {
      email: { sent: 0, delivered: 0, read: 0, failed: 0 },
      telegram: { sent: 0, delivered: 0, read: 0, failed: 0 },
      whatsapp: { sent: 0, delivered: 0, read: 0, failed: 0 },
    };
    let sent = 0, delivered = 0, read = 0, failed = 0;
    for (const d of deliveries) {
      if (d.status === 'sent') { sent++; byChannel[d.channel].sent++; }
      else if (d.status === 'delivered') { delivered++; byChannel[d.channel].delivered++; }
      else if (d.status === 'read') { read++; byChannel[d.channel].read++; }
      else if (d.status === 'failed') { failed++; byChannel[d.channel].failed++; }
    }
    return { sent, delivered, read, failed, byChannel };
  }, [stats, deliveries]);

  const hasActiveFilters = channelFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo;

  if (loading) return <DeliveryPageSkeleton />;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Delivery Tracking</h2>
          <p className="text-sm text-muted-foreground">Track message delivery status across all channels</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto-refresh toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              className="data-[state=checked]:bg-emerald-600"
            />
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
              Auto-refresh
            </Label>
            {autoRefresh && (
              <Activity className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Send} label="Sent" value={computedStats.sent} color="bg-emerald-500" />
        <StatCard icon={CheckCheck} label="Delivered" value={computedStats.delivered} color="bg-teal-500" />
        <StatCard icon={Eye} label="Read" value={computedStats.read} color="bg-purple-500" />
        <StatCard icon={XCircle} label="Failed" value={computedStats.failed} color="bg-red-500" />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by recipient or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as DeliveryChannel | 'all')}>
              <SelectTrigger className="h-9 w-[120px] text-sm">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DeliveryStatus | 'all')}>
              <SelectTrigger className="h-9 w-[120px] text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Date range */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <span className="text-xs text-muted-foreground shrink-0">Date range:</span>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 text-sm flex-1"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 text-sm flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={fetchDeliveries}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export CSV
            </Button>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            {channelFilter !== 'all' && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {channelFilter}
                <button onClick={() => setChannelFilter('all')} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {statusFilter !== 'all' && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {statusFilter}
                <button onClick={() => setStatusFilter('all')} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {dateFrom && (
              <Badge variant="secondary" className="gap-1 text-xs">
                From: {dateFrom}
                <button onClick={() => setDateFrom('')} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {dateTo && (
              <Badge variant="secondary" className="gap-1 text-xs">
                To: {dateTo}
                <button onClick={() => setDateTo('')} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-muted-foreground"
              onClick={() => {
                setChannelFilter('all');
                setStatusFilter('all');
                setDateFrom('');
                setDateTo('');
              }}
            >
              Clear all
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Delivery list */}
      {filteredDeliveries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <ArrowUpDown className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No deliveries found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Messages you send will appear here with delivery status
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[calc(100vh-440px)]">
          <AnimatePresence mode="popLayout">
            <div className="space-y-2">
              {filteredDeliveries.map((delivery) => {
                const ChannelIcon = CHANNEL_ICONS[delivery.channel];
                const statusConfig = STATUS_CONFIG[delivery.status];
                return (
                  <motion.div
                    key={delivery.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-1">
                            {/* Recipient + channel */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <ChannelIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium truncate">{delivery.recipient}</span>
                              <StatusBadge status={delivery.status} />
                              {delivery.retryCount > 0 && (
                                <Badge variant="outline" className="text-[10px] h-5 gap-0.5 text-amber-600 border-amber-500/20">
                                  <RotateCcw className="h-2.5 w-2.5" />
                                  {delivery.retryCount}x
                                </Badge>
                              )}
                            </div>
                            {/* Content preview */}
                            <p className="text-xs text-muted-foreground line-clamp-1">{delivery.contentPreview}</p>
                            {/* Template name */}
                            {delivery.templateName && (
                              <p className="text-[10px] text-muted-foreground">
                                Template: {delivery.templateName}
                              </p>
                            )}
                            {/* Timestamps */}
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Sent: {new Date(delivery.sentAt).toLocaleString()}
                              </span>
                              {delivery.deliveredAt && (
                                <span>Delivered: {new Date(delivery.deliveredAt).toLocaleString()}</span>
                              )}
                              {delivery.readAt && (
                                <span>Read: {new Date(delivery.readAt).toLocaleString()}</span>
                              )}
                            </div>
                            {/* Error message */}
                            {delivery.errorMessage && (
                              <p className="text-[10px] text-red-500 line-clamp-1">{delivery.errorMessage}</p>
                            )}
                          </div>

                          {/* Retry button for failed */}
                          {delivery.status === 'failed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 text-[10px] shrink-0"
                              onClick={() => handleRetry(delivery.id)}
                              disabled={retrying === delivery.id}
                            >
                              {retrying === delivery.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              Retry
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        </ScrollArea>
      )}

      {/* Result count */}
      {filteredDeliveries.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filteredDeliveries.length} of {deliveries.length} deliveries
        </p>
      )}
    </div>
  );
}
