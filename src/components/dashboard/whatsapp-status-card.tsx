'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  Cloud,
  Phone,
  Shield,
  RefreshCw,
  Send,
  Unplug,
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  Activity,
  FileText,
  PhoneCall,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────

type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
type Provider = 'meta' | 'twilio';

interface WhatsappStatusData {
  connected: boolean;
  provider: Provider | null;
  phoneNumber: string;
  healthStatus: HealthStatus;
  monthlyUsed: number;
  monthlyQuota: number;
  lastWebhookAt: string | null;
  templateSyncStatus: 'idle' | 'syncing' | 'error' | 'never';
  lastTemplateSyncAt: string | null;
  errorMessage: string | null;
  reconnectAttempts: number;
}

interface WhatsappStatusCardProps {
  onQuickSend?: () => void;
}

// ─── Health indicator ─────────────────────────────────────────────

function HealthIndicator({ status, showLabel = true }: { status: HealthStatus; showLabel?: boolean }) {
  const config: Record<HealthStatus, { color: string; bg: string; label: string; pulse: boolean }> = {
    healthy: { color: 'text-emerald-500', bg: 'bg-emerald-500', label: 'Healthy', pulse: true },
    degraded: { color: 'text-amber-500', bg: 'bg-amber-500', label: 'Degraded', pulse: true },
    down: { color: 'text-red-500', bg: 'bg-red-500', label: 'Down', pulse: false },
    unknown: { color: 'text-gray-400', bg: 'bg-gray-400', label: 'Unknown', pulse: false },
  };
  const { color, bg, label, pulse } = config[status];

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('inline-block h-2 w-2 rounded-full', bg, pulse && 'animate-pulse')} />
      {showLabel && <span className={cn('text-xs font-medium', color)}>{label}</span>}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────

function StatusCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value, valueClassName }: { icon: React.ElementType; label: string; value: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className={cn('text-xs font-medium text-right', valueClassName)}>{value}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export default function WhatsappStatusCard({ onQuickSend }: WhatsappStatusCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [status, setStatus] = useState<WhatsappStatusData | null>(null);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data as WhatsappStatusData);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchStatus();
    return () => { cancelled = true; };
  }, [fetchStatus]);

  // Reconnect
  const handleReconnect = async () => {
    if (!status?.provider) return;
    setReconnecting(true);
    try {
      const endpoint = status.provider === 'meta'
        ? '/api/whatsapp/meta/reconnect'
        : '/api/whatsapp/twilio/reconnect';
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) throw new Error('Reconnect failed');
      toast({ title: 'Reconnecting', description: 'WhatsApp is reconnecting. This may take a moment.' });
      // Poll for reconnection
      setTimeout(fetchStatus, 2000);
      setTimeout(fetchStatus, 5000);
    } catch {
      toast({ title: 'Reconnect Failed', description: 'Could not reconnect WhatsApp. Please try disconnecting and reconnecting.', variant: 'destructive' });
    } finally {
      setReconnecting(false);
    }
  };

  if (loading) return <StatusCardSkeleton />;

  // Disconnected state
  if (!status?.connected) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mx-auto mb-3">
            <MessageCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">WhatsApp Not Connected</p>
          <p className="text-xs text-muted-foreground mt-1">Connect your WhatsApp account to see status here</p>
        </CardContent>
      </Card>
    );
  }

  const quotaPercent = Math.min(100, Math.round((status.monthlyUsed / status.monthlyQuota) * 100));
  const quotaColor =
    quotaPercent >= 90 ? 'text-red-500' : quotaPercent >= 70 ? 'text-amber-500' : 'text-emerald-500';
  const quotaBarColor =
    quotaPercent >= 90
      ? '[&>[data-slot=progress-indicator]]:bg-red-500'
      : quotaPercent >= 70
        ? '[&>[data-slot=progress-indicator]]:bg-amber-500'
        : '[&>[data-slot=progress-indicator]]:bg-emerald-500';

  const syncStatusConfig: Record<string, { label: string; color: string }> = {
    idle: { label: 'Up to date', color: 'text-emerald-500' },
    syncing: { label: 'Syncing...', color: 'text-amber-500' },
    error: { label: 'Sync error', color: 'text-red-500' },
    never: { label: 'Never synced', color: 'text-gray-400' },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              WhatsApp Status
            </CardTitle>
            <HealthIndicator status={status.healthStatus} />
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Provider badge + connection status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                {status.provider === 'meta' ? (
                  <><Cloud className="h-3 w-3" /> Meta Cloud</>
                ) : (
                  <><Phone className="h-3 w-3" /> Twilio</>
                )}
              </Badge>
              <Badge variant="outline" className="text-[10px] h-5 gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <Check className="h-3 w-3" />
                Connected
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Phone number */}
          <InfoRow icon={PhoneCall} label="Phone Number" value={status.phoneNumber} />

          {/* Quota usage */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Quota Usage</span>
              </div>
              <span className={cn('text-xs font-medium', quotaColor)}>
                {status.monthlyUsed.toLocaleString()} / {status.monthlyQuota.toLocaleString()}
              </span>
            </div>
            <Progress value={quotaPercent} className={cn('h-2', quotaBarColor)} />
            {quotaPercent >= 90 && (
              <p className="text-[10px] text-red-500">Quota nearly exhausted. Consider upgrading your plan.</p>
            )}
          </div>

          {/* Last webhook */}
          <InfoRow
            icon={Clock}
            label="Last Webhook"
            value={status.lastWebhookAt ? new Date(status.lastWebhookAt).toLocaleString() : 'Never'}
          />

          {/* Template sync status */}
          <InfoRow
            icon={FileText}
            label="Template Sync"
            value={
              <span className={syncStatusConfig[status.templateSyncStatus]?.color || 'text-gray-400'}>
                {syncStatusConfig[status.templateSyncStatus]?.label || 'Unknown'}
              </span>
            }
          />

          {/* Error message */}
          {status.errorMessage && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400">{status.errorMessage}</p>
            </div>
          )}

          {/* Reconnect attempts warning */}
          {status.reconnectAttempts > 2 && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {status.reconnectAttempts} reconnect attempts. Consider disconnecting and reconnecting manually.
              </p>
            </div>
          )}

          <Separator />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 gap-1.5 text-xs"
              onClick={handleReconnect}
              disabled={reconnecting || status.healthStatus === 'healthy'}
            >
              {reconnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Reconnect
            </Button>
            {onQuickSend && (
              <Button
                size="sm"
                className="flex-1 h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onQuickSend}
              >
                <Send className="h-3.5 w-3.5" />
                Quick Send
              </Button>
            )}
          </div>

          {/* Security note */}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Shield className="h-3 w-3 text-emerald-500 shrink-0" />
            <span>End-to-end encrypted &bull; Tokens encrypted at rest</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
