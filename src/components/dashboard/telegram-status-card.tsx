'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Shield,
  XCircle,
  Wifi,
  WifiOff,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { type TelegramStatus } from './telegram-connect-card';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import TelegramHealthView from './telegram-health-view';

// ─── Telegram API (local wrappers) ──────────────────────────────

async function fetchTelegramStatus(): Promise<TelegramStatus> {
  const res = await fetch('/api/telegram/status');
  if (!res.ok) throw new Error('Failed to fetch Telegram status');
  const data = (await res.json()) as Record<string, unknown>;
  return { ...data, connected: Boolean(data.isConnected ?? data.connected) } as TelegramStatus;
}

async function checkTelegramHealth(): Promise<TelegramStatus> {
  const res = await fetch('/api/telegram/health', { method: 'POST' }).catch(() => null);
  if (res && res.ok) {
    const data = (await res.json()) as Record<string, unknown>;
    return { ...data, connected: Boolean(data.isConnected ?? data.connected) } as TelegramStatus;
  }
  return fetchTelegramStatus();
}

async function toggleTelegramPause(): Promise<TelegramStatus> {
  const res = await fetch('/api/telegram/pause', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to toggle pause');
  const data = (await res.json()) as Record<string, unknown>;
  return { ...data, connected: Boolean(data.isConnected ?? data.connected) } as TelegramStatus;
}

type HealthStatus = TelegramStatus['healthStatus'];

const HEALTH_CONFIG: Record<HealthStatus, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  healthy: { color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2, label: 'Healthy' },
  degraded: { color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/20', icon: AlertTriangle, label: 'Degraded' },
  down: { color: 'text-red-600', bg: 'bg-red-500/10 border-red-500/20', icon: XCircle, label: 'Down' },
  unknown: { color: 'text-muted-foreground', bg: 'bg-muted/30 border-border/50', icon: Shield, label: 'Unknown' },
};

function getRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
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

export default function TelegramStatusCard() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const [showHealthDetail, setShowHealthDetail] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchTelegramStatus();
      setStatus(s);
    } catch {
      // Silently handle - status remains null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Auto-refresh every 30 seconds when connected
  useEffect(() => {
    if (status?.connected) {
      intervalRef.current = setInterval(loadStatus, 30000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status?.connected, loadStatus]);

  const handleHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      const s = await checkTelegramHealth();
      setStatus(s);
      toast.success(`Health check: ${s.healthStatus}`);
    } catch {
      toast.error('Failed to check Telegram health');
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleTogglePause = async () => {
    setTogglingPause(true);
    try {
      const s = await toggleTelegramPause();
      setStatus(s);
      toast.success(s.isPaused ? 'Telegram bot paused' : 'Telegram bot resumed');
    } catch {
      toast.error('Failed to toggle pause');
    } finally {
      setTogglingPause(false);
    }
  };

  // ─── Loading skeleton ─────────────────────────────────────
  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Not connected ────────────────────────────────────────
  if (!status?.connected) {
    return (
      <Card className="border-muted/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <WifiOff className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Telegram Status</CardTitle>
          </div>
          <CardDescription>Connect a Telegram bot to see status and health information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/20 border border-border/50">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <WifiOff className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No bot connected</p>
              <p className="text-xs text-muted-foreground">Set up a Telegram bot to monitor its health status</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const health = HEALTH_CONFIG[status.healthStatus];
  const HealthIcon = health.icon;

  return (
    <Card className={cn('overflow-hidden', status.isPaused && 'opacity-80')}>
      {/* Status header bar */}
      <div className={cn('px-6 py-3 border-b flex items-center justify-between', health.bg)}>
        <div className="flex items-center gap-2">
          <HealthIcon className={cn('h-4 w-4', health.color)} />
          <span className={cn('text-sm font-medium', health.color)}>{health.label}</span>
          {status.isPaused && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600">
              Paused
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Pause/Resume toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={handleTogglePause}
            disabled={togglingPause}
          >
            {togglingPause ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : status.isPaused ? (
              <Play className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Pause className="h-3.5 w-3.5 text-amber-500" />
            )}
            {status.isPaused ? 'Resume' : 'Pause'}
          </Button>

          {/* Health check button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={handleHealthCheck}
            disabled={checkingHealth}
          >
            {checkingHealth ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Check
          </Button>
        </div>
      </div>

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-emerald-500" />
            <CardTitle className="text-base">Telegram Bot Status</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={loadStatus}
            aria-label="Refresh status"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <CardDescription>@{status.botUsername || 'Unknown Bot'}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
              status.connected ? 'bg-emerald-500/10' : 'bg-red-500/10'
            )}>
              {status.connected ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Connection</p>
              <p className={cn('text-sm font-medium', status.connected ? 'text-emerald-600' : 'text-red-600')}>
                {status.connected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </div>

          {/* Health status */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', health.bg)}>
              <HealthIcon className={cn('h-4 w-4', health.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Health</p>
              <p className={cn('text-sm font-medium', health.color)}>{health.label}</p>
            </div>
          </div>

          {/* Mode */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-teal-500/10">
              <Radio className="h-4 w-4 text-teal-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Mode</p>
              <p className="text-sm font-medium capitalize">{status.mode}</p>
            </div>
          </div>

          {/* Reconnect attempts */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
              status.reconnectAttempts > 0 ? 'bg-amber-500/10' : 'bg-muted/30'
            )}>
              <RefreshCw className={cn('h-4 w-4', status.reconnectAttempts > 0 ? 'text-amber-500' : 'text-muted-foreground')} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Reconnects</p>
              <p className="text-sm font-medium">{status.reconnectAttempts}</p>
            </div>
          </div>
        </div>

        {/* Webhook info */}
        {status.mode === 'webhook' && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Webhook Info</h4>
            <div className="space-y-2 p-3 rounded-lg bg-muted/20 border border-border/50">
              {status.webhookUrl && (
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate flex-1">{status.webhookUrl}</span>
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'h-2 w-2 rounded-full',
                    status.webhookVerified ? 'bg-emerald-500' : 'bg-amber-500'
                  )} />
                  <span className="text-xs text-muted-foreground">
                    {status.webhookVerified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
                {status.pendingUpdateCount !== undefined && status.pendingUpdateCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-amber-600">
                      {status.pendingUpdateCount} pending
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Last webhook: {getRelativeTime(status.lastWebhookAt)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {status.errorMessage && (
          <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-red-600 dark:text-red-400">Error</p>
                <p className="text-xs text-red-500/80 mt-0.5">{status.errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Last health check */}
        {status.lastHealthCheckAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Last health check: {getRelativeTime(status.lastHealthCheckAt)}
          </div>
        )}

        <Separator />

        {/* Expand/collapse health detail */}
        <button
          type="button"
          onClick={() => setShowHealthDetail(!showHealthDetail)}
          className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          <span className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" />
            Health Details
          </span>
          {showHealthDetail ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        <AnimatePresence>
          {showHealthDetail && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <TelegramHealthView status={status} onStatusUpdate={setStatus} />
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
