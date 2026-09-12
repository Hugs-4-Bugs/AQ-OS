'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eraser,
  Globe,
  Loader2,
  Radio,
  RefreshCw,
  Send,
  Timer,
  Unplug,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { type TelegramStatus } from './telegram-connect-card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface TelegramHealthViewProps {
  status: TelegramStatus;
  onStatusUpdate: (status: TelegramStatus) => void;
}

// ─── Telegram API (local wrappers) ──────────────────────────────

interface TelegramHealthDetail {
  uptime: number;
  errorRate: number;
  webhookResponseTime?: number;
  recentErrors: { time: string; message: string }[];
  recentWebhookEvents: { id?: string; type: string; receivedAt: string }[];
  reconnectionLog: { success: boolean; attemptedAt: string; reason?: string | null }[];
}

async function fetchTelegramHealthDetail(): Promise<TelegramHealthDetail> {
  const res = await fetch('/api/telegram/health');
  if (!res.ok) throw new Error('Failed to fetch Telegram health detail');
  return (await res.json()) as TelegramHealthDetail;
}

async function forceTelegramReconnect(): Promise<TelegramStatus> {
  const res = await fetch('/api/telegram/reconnect', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to force reconnect');
  const data = (await res.json()) as Record<string, unknown>;
  return { ...data, connected: Boolean(data.isConnected ?? data.connected) } as TelegramStatus;
}

async function clearTelegramErrors(): Promise<void> {
  const res = await fetch('/api/telegram/clear-errors', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to clear errors');
}

async function testTelegramWebhook(): Promise<{ success: boolean; responseTime?: number }> {
  const res = await fetch('/api/telegram/webhook-test', { method: 'POST' });
  if (!res.ok) return { success: false };
  return (await res.json()) as { success: boolean; responseTime?: number };
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}m ${seconds % 60}s`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const days = Math.floor(hr / 24);
  return `${days}d ${hr % 24}h`;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// Simple error rate bar chart
function ErrorRateChart({ errors }: { errors: { time: string; message: string }[] }) {
  if (errors.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
        No recent errors
      </div>
    );
  }

  // Group errors by hour
  const hourBuckets: Record<string, number> = {};
  const now = Date.now();
  // Initialize last 12 hours
  for (let i = 11; i >= 0; i--) {
    const bucketTime = new Date(now - i * 3600000);
    const key = `${bucketTime.getUTCDate()}-${bucketTime.getUTCHours()}h`;
    hourBuckets[key] = 0;
  }

  errors.forEach((err) => {
    const errDate = new Date(err.time);
    const key = `${errDate.getUTCDate()}-${errDate.getUTCHours()}h`;
    if (key in hourBuckets) {
      hourBuckets[key]++;
    }
  });

  const maxCount = Math.max(...Object.values(hourBuckets), 1);
  const entries = Object.entries(hourBuckets);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-20">
        {entries.map(([key, count]) => (
          <div key={key} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className={cn(
                'w-full rounded-t-sm transition-all min-h-[2px]',
                count > 0 ? 'bg-red-400' : 'bg-muted/50'
              )}
              style={{ height: `${Math.max(2, (count / maxCount) * 60)}px` }}
              title={`${count} error${count !== 1 ? 's' : ''}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {entries.map(([key], i) => {
          // Only show label for every 3rd bar
          const hour = key.split('-')[1];
          return (
            <div key={key} className="flex-1 text-center">
              {i % 3 === 0 && (
                <span className="text-[8px] text-muted-foreground">{hour}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TelegramHealthView({ status, onStatusUpdate }: TelegramHealthViewProps) {
  const [detail, setDetail] = useState<TelegramHealthDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; responseTime?: number } | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchTelegramHealthDetail();
      setDetail(d);
    } catch {
      // Failed to load detail - stay null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadDetail();
    return () => { cancelled = true; };
  }, [loadDetail]);

  const handleForceReconnect = async () => {
    setReconnecting(true);
    try {
      const s = await forceTelegramReconnect();
      onStatusUpdate(s);
      toast.success('Reconnect initiated');
      loadDetail();
    } catch {
      toast.error('Failed to force reconnect');
    } finally {
      setReconnecting(false);
    }
  };

  const handleClearErrors = async () => {
    setClearing(true);
    try {
      await clearTelegramErrors();
      toast.success('Errors cleared');
      loadDetail();
    } catch {
      toast.error('Failed to clear errors');
    } finally {
      setClearing(false);
    }
  };

  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const result = await testTelegramWebhook();
      setWebhookTestResult(result);
      if (result.success) {
        toast.success(`Webhook test passed (${result.responseTime ?? '?'}ms)`);
      } else {
        toast.error('Webhook test failed');
      }
    } catch {
      toast.error('Failed to test webhook');
      setWebhookTestResult({ success: false });
    } finally {
      setTestingWebhook(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-3 rounded-lg bg-muted/20 border border-border/50">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-center">
        <p className="text-sm text-muted-foreground">Failed to load health details</p>
        <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={loadDetail}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  const uptimePercent = detail.uptime > 0 ? Math.min(100, ((detail.uptime) / (detail.uptime + 1)) * 100) : 0;
  const errorRatePercent = detail.errorRate * 100;

  return (
    <div className="space-y-4 p-3 rounded-lg bg-muted/20 border border-border/50">
      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Uptime */}
        <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
          <Timer className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase">Uptime</p>
          <p className="text-sm font-bold text-emerald-600">{formatUptime(detail.uptime)}</p>
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${uptimePercent}%` }}
            />
          </div>
        </div>

        {/* Webhook response time */}
        <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
          <Globe className="h-4 w-4 text-teal-500 mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase">Response</p>
          <p className="text-sm font-bold text-teal-600">
            {detail.webhookResponseTime !== undefined ? `${detail.webhookResponseTime}ms` : 'N/A'}
          </p>
          {detail.webhookResponseTime !== undefined && (
            <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  detail.webhookResponseTime < 500
                    ? 'bg-emerald-500'
                    : detail.webhookResponseTime < 2000
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                )}
                style={{ width: `${Math.min(100, (detail.webhookResponseTime / 5000) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Error rate */}
        <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
          <AlertTriangle className={cn('h-4 w-4 mx-auto mb-1', errorRatePercent > 5 ? 'text-red-500' : 'text-amber-500')} />
          <p className="text-[10px] text-muted-foreground uppercase">Error Rate</p>
          <p className={cn('text-sm font-bold', errorRatePercent > 5 ? 'text-red-600' : errorRatePercent > 0 ? 'text-amber-600' : 'text-emerald-600')}>
            {errorRatePercent.toFixed(1)}%
          </p>
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                errorRatePercent > 5 ? 'bg-red-500' : errorRatePercent > 0 ? 'bg-amber-500' : 'bg-emerald-500'
              )}
              style={{ width: `${Math.min(100, errorRatePercent * 10)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Error rate chart */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" />
          Recent Errors (12h)
        </h4>
        <div className="p-3 rounded-lg bg-background border border-border/50">
          <ErrorRateChart errors={detail.recentErrors} />
          {detail.recentErrors.length > 0 && (
            <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
              {detail.recentErrors.slice(0, 5).map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground whitespace-nowrap shrink-0">
                    {formatRelativeTime(err.time)}
                  </span>
                  <span className="text-red-500/80 truncate">{err.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent webhook events */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Radio className="h-3 w-3" />
          Recent Webhook Events
        </h4>
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {detail.recentWebhookEvents.length > 0 ? (
            detail.recentWebhookEvents.map((event, i) => (
              <div
                key={event.id || i}
                className="flex items-center gap-2 p-2 rounded-md bg-background border border-border/50 text-xs"
              >
                <ArrowRight className="h-3 w-3 text-teal-500 shrink-0" />
                <span className="font-medium text-foreground truncate flex-1">{event.type}</span>
                <span className="text-muted-foreground whitespace-nowrap shrink-0">
                  {formatRelativeTime(event.receivedAt)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">No recent webhook events</p>
          )}
        </div>
      </div>

      {/* Reconnection log */}
      {detail.reconnectionLog.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3" />
            Reconnection Log
          </h4>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {detail.reconnectionLog.map((log, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 rounded-md bg-background border border-border/50 text-xs"
              >
                {log.success ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                )}
                <span className="text-muted-foreground whitespace-nowrap shrink-0">
                  {formatRelativeTime(log.attemptedAt)}
                </span>
                <span className={cn('truncate', log.success ? 'text-emerald-600' : 'text-red-500')}>
                  {log.success ? 'Success' : `Failed: ${log.reason || 'Unknown'}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Webhook test result */}
      {webhookTestResult && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-3 rounded-lg border flex items-center gap-2',
            webhookTestResult.success
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-red-500/5 border-red-500/20'
          )}
        >
          {webhookTestResult.success ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          )}
          <div className="text-xs">
            <span className={cn('font-medium', webhookTestResult.success ? 'text-emerald-600' : 'text-red-600')}>
              {webhookTestResult.success ? 'Webhook test passed' : 'Webhook test failed'}
            </span>
            {webhookTestResult.responseTime !== undefined && (
              <span className="text-muted-foreground ml-1">({webhookTestResult.responseTime}ms)</span>
            )}
          </div>
        </motion.div>
      )}

      <Separator />

      {/* Quick actions */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Actions</h4>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-[11px] gap-1.5"
            onClick={handleForceReconnect}
            disabled={reconnecting}
          >
            {reconnecting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Unplug className="h-3 w-3" />
            )}
            Reconnect
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-[11px] gap-1.5"
            onClick={handleClearErrors}
            disabled={clearing}
          >
            {clearing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Eraser className="h-3 w-3" />
            )}
            Clear Errors
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-[11px] gap-1.5"
            onClick={handleTestWebhook}
            disabled={testingWebhook || status.mode !== 'webhook'}
          >
            {testingWebhook ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Test Hook
          </Button>
        </div>
      </div>
    </div>
  );
}
