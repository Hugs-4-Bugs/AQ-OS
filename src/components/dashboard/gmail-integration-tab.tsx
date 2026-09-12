'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  Mail,
  Link2,
  Unlink,
  RefreshCw,
  Send,
  Inbox,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Shield,
  Clock,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────

type ConnectionStatus = 'connected' | 'disconnected' | 'syncing';
type SyncFrequency = 'realtime' | 'every_5_minutes' | 'every_15_minutes' | 'every_hour' | 'manual';

interface GmailLabel {
  name: string;
  enabled: boolean;
  count: number;
}

interface EmailStats {
  emailsSynced: number;
  sentViaAO: number;
  autoRepliesCreated: number;
  leadsMatched: number;
}

interface RecentActivity {
  id: string;
  type: 'received' | 'sent' | 'auto_reply' | 'matched' | 'label';
  description: string;
  timestamp: string;
}

interface GmailIntegrationData {
  connected: boolean;
  email: string | null;
  lastSync: string | null;
  syncFrequency: SyncFrequency;
  autoReply: boolean;
  leadMatching: boolean;
  labels: GmailLabel[];
  stats: EmailStats;
  recentActivity: RecentActivity[];
  oauthScopes: string[];
}

// ─── Constants ──────────────────────────────────────────────────

const SYNC_OPTIONS: { value: SyncFrequency; label: string; description: string }[] = [
  { value: 'realtime', label: 'Real-time', description: 'Instant sync via push notifications' },
  { value: 'every_5_minutes', label: 'Every 5 minutes', description: 'Near real-time polling' },
  { value: 'every_15_minutes', label: 'Every 15 minutes', description: 'Balanced frequency' },
  { value: 'every_hour', label: 'Every hour', description: 'Periodic hourly sync' },
  { value: 'manual', label: 'Manual only', description: 'Sync only when you click Sync Now' },
];

const OAUTH_SCOPE_LABELS: Record<string, string> = {
  read: 'Read emails',
  send: 'Send emails',
  manage_labels: 'Manage labels',
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  received: Inbox,
  sent: Send,
  auto_reply: Mail,
  matched: Link2,
  label: CheckCircle2,
};

const ACTIVITY_COLORS: Record<string, string> = {
  received: 'text-sky-500',
  sent: 'text-emerald-500',
  auto_reply: 'text-amber-500',
  matched: 'text-purple-500',
  label: 'text-teal-500',
};

// ─── Relative Time Helper ──────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString();
}

// ─── Framer Motion Variants ────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 24 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

// ─── Main Component ────────────────────────────────────────────

export default function GmailIntegrationTab() {
  // ── Connection State ──
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [oauthScopes, setOauthScopes] = useState<string[]>([]);

  // ── Sync Settings ──
  const [syncFrequency, setSyncFrequency] = useState<SyncFrequency>('every_15_minutes');
  const [autoReply, setAutoReply] = useState(false);
  const [leadMatching, setLeadMatching] = useState(false);
  const [labels, setLabels] = useState<GmailLabel[]>([
    { name: 'Inbox', enabled: true, count: 0 },
    { name: 'Sent', enabled: true, count: 0 },
    { name: 'Drafts', enabled: false, count: 0 },
    { name: 'Leads', enabled: true, count: 0 },
    { name: 'Follow-ups', enabled: true, count: 0 },
  ]);

  // ── Stats & Activity ──
  const [stats, setStats] = useState<EmailStats>({
    emailsSynced: 0,
    sentViaAO: 0,
    autoRepliesCreated: 0,
    leadsMatched: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  // ── UI State ──
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // ── Fetch Gmail Integration Data ──
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/integrations/gmail', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch Gmail integration');
        const data: GmailIntegrationData = await res.json();
        if (cancelled) return;

        setConnectionStatus(data.connected ? 'connected' : 'disconnected');
        setConnectedEmail(data.email);
        setLastSync(data.lastSync);
        setSyncFrequency(data.syncFrequency);
        setAutoReply(data.autoReply);
        setLeadMatching(data.leadMatching);
        setLabels(data.labels);
        setStats(data.stats);
        setRecentActivity(data.recentActivity);
        setOauthScopes(data.oauthScopes);
      } catch {
        if (!cancelled) {
          setConnectionStatus('disconnected');
          setLabels([
          { name: 'Inbox', enabled: true, count: 0 },
          { name: 'Sent', enabled: true, count: 0 },
          { name: 'Drafts', enabled: false, count: 0 },
          { name: 'Leads', enabled: true, count: 0 },
          { name: 'Follow-ups', enabled: true, count: 0 },
        ]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  // ── Connect Gmail ──
  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const res = await fetch('/api/integrations/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'connect' }),
      });
      if (!res.ok) throw new Error('Failed to connect Gmail');
      const data = await res.json();

      // Use real API response data instead of simulated values
      if (data.connected) {
        setConnectionStatus('connected');
        setConnectedEmail(data.email || null);
        setLastSync(data.lastSync || new Date().toISOString());
        setOauthScopes(data.oauthScopes || []);
        setStats(data.stats || { emailsSynced: 0, sentViaAO: 0, autoRepliesCreated: 0, leadsMatched: 0 });
        setLabels(data.labels || labels);
        setRecentActivity(data.recentActivity || []);
        toast.success('Gmail connected successfully!');
      } else {
        // Connection initiated, show syncing state
        setConnectionStatus('syncing');
        toast.info('Gmail connection initiated...');
      }
    } catch {
      toast.error('Failed to connect Gmail. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // ── Disconnect Gmail ──
  const handleDisconnect = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'disconnect' }),
      });
      if (!res.ok) throw new Error('Failed to disconnect');

      setConnectionStatus('disconnected');
      setConnectedEmail(null);
      setLastSync(null);
      setStats({ emailsSynced: 0, sentViaAO: 0, autoRepliesCreated: 0, leadsMatched: 0 });
      setLabels([
        { name: 'Inbox', enabled: true, count: 0 },
        { name: 'Sent', enabled: true, count: 0 },
        { name: 'Drafts', enabled: false, count: 0 },
        { name: 'Leads', enabled: true, count: 0 },
        { name: 'Follow-ups', enabled: true, count: 0 },
      ]);
      setRecentActivity([]);
      toast.success('Gmail disconnected successfully');
    } catch {
      toast.error('Failed to disconnect Gmail');
    }
  }, []);

  // ── Sync Now ──
  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/integrations/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'sync' }),
      });
      if (!res.ok) throw new Error('Sync failed');

      const data = await res.json();
      setLastSync(new Date().toISOString());
      if (data.stats) setStats(data.stats);
      if (data.recentActivity) setRecentActivity(data.recentActivity);
      if (data.labels) setLabels(data.labels);
      setIsSyncing(false);
      toast.success(data.message || 'Gmail sync completed');
    } catch {
      setIsSyncing(false);
      toast.error('Sync failed. Please try again.');
    }
  }, []);

  // ── Update Settings ──
  const handleUpdateSettings = useCallback(
    async (newSettings: Record<string, unknown>) => {
      try {
        const res = await fetch('/api/integrations/gmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'update_settings', ...newSettings }),
        });
        if (!res.ok) throw new Error('Failed to update settings');
        toast.success('Settings updated');
      } catch {
        toast.error('Failed to update settings');
      }
    },
    [],
  );

  // ── Toggle Label ──
  const toggleLabel = useCallback(
    (labelName: string) => {
      const updated = labels.map((l) =>
        l.name === labelName ? { ...l, enabled: !l.enabled } : l,
      );
      setLabels(updated);
      handleUpdateSettings({ labels: updated });
    },
    [labels, handleUpdateSettings],
  );

  // ── Connection Status Config ──
  const statusConfig = {
    connected: {
      dot: 'bg-emerald-500',
      ring: 'ring-emerald-500/20',
      label: 'Connected',
      labelColor: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
    disconnected: {
      dot: 'bg-red-500',
      ring: 'ring-red-500/20',
      label: 'Not Connected',
      labelColor: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-500/10',
    },
    syncing: {
      dot: 'bg-amber-500',
      ring: 'ring-amber-500/20',
      label: 'Syncing...',
      labelColor: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-500/10',
    },
  };

  const currentStatus = statusConfig[connectionStatus];

  // ─── Loading Skeleton ─────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ═══════════════════════════════════════════════════════════
          SECTION 1: Connection Status
          ═══════════════════════════════════════════════════════════ */}
      <motion.div variants={cardVariants}>
        <Card className="glass-card card-glow overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-rose-500" />
              Gmail Connection
            </CardTitle>
            <CardDescription>
              Connect your Gmail account to sync emails, auto-reply to leads, and track communications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Indicator */}
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'relative flex items-center justify-center h-12 w-12 rounded-full ring-4',
                  currentStatus.ring,
                  currentStatus.bgColor,
                )}
              >
                {connectionStatus === 'syncing' ? (
                  <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                ) : connectionStatus === 'connected' ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-red-500" />
                )}
                <span
                  className={cn(
                    'absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card',
                    connectionStatus === 'syncing' ? 'bg-amber-500 animate-pulse' : currentStatus.dot,
                  )}
                />
              </div>
              <div>
                <p className={cn('text-lg font-semibold', currentStatus.labelColor)}>
                  {currentStatus.label}
                </p>
                {lastSync && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    Last synced: {formatRelativeTime(lastSync)}
                  </p>
                )}
                {connectedEmail && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                    {connectedEmail}
                    <Badge
                      variant="outline"
                      className="text-[10px] gap-1 px-1.5 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    >
                      <Shield className="h-2.5 w-2.5" />
                      Secure
                    </Badge>
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {connectionStatus !== 'connected' && connectionStatus !== 'syncing' && (
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="gap-2 bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {isConnecting ? 'Connecting...' : 'Connect Gmail'}
                </Button>
              )}

              {connectionStatus === 'connected' && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="gap-2"
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
                    )}
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="gap-2">
                        <Unlink className="h-4 w-4" />
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Gmail?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will revoke Gmail access and stop all email syncing. Auto-replies and
                          lead matching will be paused. Your existing emails and leads data will be
                          preserved.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDisconnect}
                          className="bg-destructive text-white hover:bg-destructive/90"
                        >
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3" />
                    Google Account
                  </Button>
                </>
              )}

              {connectionStatus === 'syncing' && (
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Syncing your emails...
                </div>
              )}
            </div>

            {/* OAuth Scopes */}
            {connectionStatus === 'connected' && oauthScopes.length > 0 && (
              <>
                <Separator />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground font-medium">Permissions:</span>
                  {oauthScopes.map((scope) => (
                    <Badge
                      key={scope}
                      variant="secondary"
                      className="text-[10px] gap-1 px-2 py-0.5"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                      {OAUTH_SCOPE_LABELS[scope] || scope}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 2: Sync Settings
          ═══════════════════════════════════════════════════════════ */}
      <motion.div variants={cardVariants}>
        <Card className="glass-card">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4 text-sky-500" />
              Sync Settings
            </CardTitle>
            <CardDescription>
              Configure how AcquisitionOS syncs with your Gmail account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sync Frequency */}
              <motion.div variants={itemVariants} className="space-y-2">
                <Label className="text-sm font-medium">Sync Frequency</Label>
                <Select
                  value={syncFrequency}
                  onValueChange={(v) => {
                    setSyncFrequency(v as SyncFrequency);
                    handleUpdateSettings({ syncFrequency: v });
                  }}
                  disabled={connectionStatus !== 'connected'}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYNC_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col">
                          <span className="text-sm">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {connectionStatus !== 'connected' && (
                  <p className="text-[10px] text-muted-foreground">Connect Gmail to enable sync</p>
                )}
              </motion.div>

              {/* Auto-Reply Toggle */}
              <motion.div variants={itemVariants} className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-amber-500" />
                      Auto-Reply
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically create draft replies for incoming lead emails
                    </p>
                  </div>
                  <Switch
                    checked={autoReply}
                    onCheckedChange={(checked) => {
                      setAutoReply(checked);
                      handleUpdateSettings({ autoReply: checked });
                    }}
                    disabled={connectionStatus !== 'connected'}
                  />
                </div>
              </motion.div>

              {/* Lead Matching Toggle */}
              <motion.div variants={itemVariants} className="md:col-span-2">
                <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5 text-purple-500" />
                      Lead Matching
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Auto-match incoming emails to existing leads by email domain and address
                    </p>
                  </div>
                  <Switch
                    checked={leadMatching}
                    onCheckedChange={(checked) => {
                      setLeadMatching(checked);
                      handleUpdateSettings({ leadMatching: checked });
                    }}
                    disabled={connectionStatus !== 'connected'}
                  />
                </div>
              </motion.div>

              {/* Label Management */}
              <motion.div variants={itemVariants} className="md:col-span-2 space-y-3">
                <Label className="text-sm font-medium">Gmail Labels to Sync</Label>
                <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                  {labels.map((label) => (
                    <div
                      key={label.name}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={label.enabled}
                          onCheckedChange={() => toggleLabel(label.name)}
                          disabled={connectionStatus !== 'connected'}
                        />
                        <span className="text-sm font-medium">{label.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] tabular-nums',
                            label.enabled ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'text-muted-foreground',
                          )}
                        >
                          {label.count.toLocaleString()} emails
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
                {connectionStatus !== 'connected' && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Connect Gmail to manage labels
                  </p>
                )}
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 3: Email Stats & Activity
          ═══════════════════════════════════════════════════════════ */}
      <motion.div variants={cardVariants}>
        <Card className="glass-card">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Inbox className="h-4 w-4 text-emerald-500" />
                  Email Stats
                </CardTitle>
                <CardDescription className="mt-1">This month&apos;s email activity overview</CardDescription>
              </div>
              {connectionStatus === 'connected' && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Live
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  icon: Inbox,
                  label: 'Emails Synced',
                  value: stats.emailsSynced,
                  color: 'text-sky-500',
                  bgColor: 'bg-sky-500/10',
                },
                {
                  icon: Send,
                  label: 'Sent via AO',
                  value: stats.sentViaAO,
                  color: 'text-emerald-500',
                  bgColor: 'bg-emerald-500/10',
                },
                {
                  icon: Mail,
                  label: 'Auto-Replies',
                  value: stats.autoRepliesCreated,
                  color: 'text-amber-500',
                  bgColor: 'bg-amber-500/10',
                },
                {
                  icon: Link2,
                  label: 'Leads Matched',
                  value: stats.leadsMatched,
                  color: 'text-purple-500',
                  bgColor: 'bg-purple-500/10',
                },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    variants={itemVariants}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors group"
                  >
                    <div
                      className={cn(
                        'h-9 w-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110',
                        stat.bgColor,
                      )}
                    >
                      <Icon className={cn('h-4 w-4', stat.color)} />
                    </div>
                    <p className="text-2xl font-bold tabular-nums">{stat.value.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground text-center">{stat.label}</p>
                  </motion.div>
                );
              })}
            </div>

            {/* Recent Activity Timeline */}
            {recentActivity.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Recent Activity</h4>
                  <div className="relative space-y-0 max-h-52 overflow-y-auto custom-scrollbar">
                    {/* Timeline line */}
                    <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

                    <AnimatePresence>
                      {recentActivity.map((activity, index) => {
                        const ActivityIcon = ACTIVITY_ICONS[activity.type] || Mail;
                        const activityColor = ACTIVITY_COLORS[activity.type] || 'text-muted-foreground';

                        return (
                          <motion.div
                            key={activity.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8 }}
                            transition={{ delay: index * 0.06, type: 'spring', stiffness: 300, damping: 24 }}
                            className="relative flex items-start gap-3 py-2 pl-1 group"
                          >
                            <div className="relative z-10 mt-0.5 h-[31px] w-[31px] rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                              <ActivityIcon className={cn('h-3.5 w-3.5', activityColor)} />
                            </div>
                            <div className="flex-1 min-w-0 pt-1">
                              <p className="text-sm text-foreground truncate group-hover:text-primary transition-colors">
                                {activity.description}
                              </p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {formatRelativeTime(activity.timestamp)}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              </>
            )}

            {/* Empty State */}
            {connectionStatus !== 'connected' && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <Mail className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Connect Gmail to see your email stats and activity
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
