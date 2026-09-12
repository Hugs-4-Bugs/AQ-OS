'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle, RotateCcw, Trash2, Eye, Search, AlertCircle, Loader2, ShieldAlert,
  MoreHorizontal, Play, Clock, BarChart3, RefreshCw, Timer, AlertOctagon, TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// ─── Local type (mirrors workflow domain models) ────────────────

interface WorkflowExecution {
  id: string;
  status: string;
  workflow?: { name?: string } | null;
  currentStep?: number;
  totalSteps?: number;
  maxRetries?: number;
  retryCount: number;
  error?: string | null;
  deadLetterReason?: string | null;
  durationMs?: number;
  updatedAt?: string;
  triggerData?: Record<string, unknown>;
  isDeadLetter?: boolean;
  [key: string]: unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function parseExecution(raw: Record<string, unknown>): WorkflowExecution {
  return {
    ...raw,
    status: 'dead_letter' as const,
    triggerData: typeof raw.triggerData === 'string' ? JSON.parse(raw.triggerData as string) : (raw.triggerData as Record<string, unknown> || {}),
    isDeadLetter: true,
  } as WorkflowExecution;
}

// ── Step type labels for replay menu ──────────────────────────────────

const STEP_TYPE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  action: 'Action',
  condition: 'Condition',
  delay: 'Delay',
  ai_action: 'AI Action',
  webhook: 'Webhook',
  send_email: 'Send Email',
  send_whatsapp: 'Send WhatsApp',
  send_telegram: 'Send Telegram',
  send_gmail_draft: 'Send Gmail Draft',
  send_gmail_reply: 'Send Gmail Reply',
  move_to_stage: 'Move to Stage',
  add_note: 'Add Note',
  add_tag: 'Add Tag',
  generate_ai_message: 'AI Message',
  conditional_branch: 'Conditional Branch',
  wait_delay: 'Wait/Delay',
  webhook_call: 'Webhook Call',
  ai_analyze: 'AI Analyze',
  update_lead_field: 'Update Lead Field',
  credit_check: 'Credit Check',
};

// ── Component ─────────────────────────────────────────────────────────

export default function WorkflowDeadLetter() {
  const [entries, setEntries] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<WorkflowExecution | null>(null);
  const [replayDialogEntry, setReplayDialogEntry] = useState<WorkflowExecution | null>(null);
  const [selectedStep, setSelectedStep] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [stats, setStats] = useState({
    total: 0,
    recent24h: 0,
    topErrors: [] as { error: string; count: number }[],
    avgTimeToFailure: 0,
    commonFailureStepType: '',
    retrySuccessRate: 0,
  });

  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDLQ = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search) params.set('search', search);

      const res = await fetch(`/api/workflows/dead-letter?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch dead letter queue');
      const data = await res.json();
      const items = (data.entries || data.data || data.executions || []).map(parseExecution);
      setEntries(items);
      setLastRefresh(new Date());

      // Compute stats from data
      const now = Date.now();
      const recent24h = items.filter((e) => {
        const updatedAt = new Date(e.updatedAt).getTime();
        return (now - updatedAt) < 86400000;
      }).length;

      // Group by error message
      const errorCounts: Record<string, number> = {};
      items.forEach((e) => {
        const key = (e.error || e.deadLetterReason || 'Unknown error').slice(0, 80);
        errorCounts[key] = (errorCounts[key] || 0) + 1;
      });
      const topErrors = Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([error, count]) => ({ error, count }));

      // Avg time to failure
      const failuresWithTime = items.filter((e) => e.durationMs && e.durationMs > 0);
      const avgTimeToFailure = failuresWithTime.length > 0
        ? Math.round(failuresWithTime.reduce((sum, e) => sum + (e.durationMs || 0), 0) / failuresWithTime.length)
        : 0;

      // Most common failure step type (from step logs if available, or from error text)
      const stepTypeCounts: Record<string, number> = {};
      items.forEach((e) => {
        // Try to extract step type from the stepLogs
        const logs = (e as WorkflowExecution & { stepLogs?: Array<{ stepType: string; status: string }> }).stepLogs;
        if (logs && logs.length > 0) {
          const failedLogs = logs.filter((l) => l.status === 'failed');
          failedLogs.forEach((l) => {
            stepTypeCounts[l.stepType] = (stepTypeCounts[l.stepType] || 0) + 1;
          });
        } else {
          // Fallback: infer from error message
          const errText = (e.error || e.deadLetterReason || '').toLowerCase();
          const matched = Object.keys(STEP_TYPE_LABELS).find((key) => errText.includes(key.replace(/_/g, ' ')));
          if (matched) {
            stepTypeCounts[matched] = (stepTypeCounts[matched] || 0) + 1;
          } else {
            stepTypeCounts['unknown'] = (stepTypeCounts['unknown'] || 0) + 1;
          }
        }
      });
      const commonFailureStepType = Object.entries(stepTypeCounts)
        .sort((a, b) => b[1] - a[1])[0];
      const commonFailureStepLabel = commonFailureStepType
        ? STEP_TYPE_LABELS[commonFailureStepType[0]] || commonFailureStepType[0]
        : '—';

      // Retry success rate: from retryCount field
      const retried = items.filter((e) => e.retryCount > 0);
      // These are currently in DLQ, so all retries failed. We need total attempts including successes.
      // Use a simple heuristic: total retry attempts = sum of retryCount, failures = items in DLQ
      // Success rate = 1 - (dlq entries / total retry attempts) when available
      const totalRetryAttempts = retried.reduce((sum, e) => sum + e.retryCount, 0);
      const retrySuccessRate = totalRetryAttempts > 0
        ? Math.round(((totalRetryAttempts - items.length) / totalRetryAttempts) * 100)
        : 0;

      setStats({
        total: items.length,
        recent24h,
        topErrors,
        avgTimeToFailure,
        commonFailureStepType: commonFailureStepLabel,
        retrySuccessRate: Math.max(0, retrySuccessRate),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dead letter queue');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchDLQ();
  }, [fetchDLQ]);

  // Auto-refresh logic
  useEffect(() => {
    const saved = localStorage.getItem('dlq-auto-refresh');
    if (saved === 'true') {
      setAutoRefresh(true);
    }
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      localStorage.setItem('dlq-auto-refresh', 'true');
      refreshIntervalRef.current = setInterval(() => {
        fetchDLQ();
      }, 30000);
    } else {
      localStorage.setItem('dlq-auto-refresh', 'false');
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, fetchDLQ]);

  const handleRetry = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/workflows/dead-letter/${id}`, { method: 'POST' });
      if (!res.ok) throw new Error('Retry failed');
      await fetchDLQ();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReplayFromStep = async (executionId: string, fromStep: number) => {
    setActionLoading(executionId);
    try {
      const res = await fetch(`/api/workflows/executions/${executionId}/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromStep }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Replay failed');
      }
      setReplayDialogEntry(null);
      await fetchDLQ();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replay failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePurgeAll = async () => {
    setActionLoading('purge');
    try {
      const res = await fetch('/api/workflows/dead-letter', { method: 'DELETE' });
      if (!res.ok) throw new Error('Purge failed');
      await fetchDLQ();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purge failed');
    } finally {
      setActionLoading(null);
    }
  };

  // Build step list for replay dialog
  const getStepList = (entry: WorkflowExecution) => {
    const steps: Array<{ index: number; name: string; type: string }> = [];
    // Generate step entries from totalSteps
    for (let i = 0; i < (entry.totalSteps || 0); i++) {
      steps.push({
        index: i,
        name: `Step ${i + 1}`,
        type: i === 0 ? 'start' : 'action',
      });
    }
    return steps;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Auto-refresh toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
              Auto-retry failed executions
            </Label>
          </div>
          {autoRefresh && (
            <Badge variant="outline" className="text-[10px] gap-1 h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
              <RefreshCw className="h-2.5 w-2.5 animate-spin" style={{ animationDuration: '3s' }} />
              30s
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Last updated: {lastRefresh.toLocaleTimeString()}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total DLQ</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.recent24h}</p>
              <p className="text-xs text-muted-foreground">Recent (24h)</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-500/10 flex items-center justify-center shrink-0">
              <AlertCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.topErrors.length}</p>
              <p className="text-xs text-muted-foreground">Error Types</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
              <Timer className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.avgTimeToFailure > 0 ? formatDuration(stats.avgTimeToFailure) : '—'}</p>
              <p className="text-xs text-muted-foreground">Avg Time to Fail</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
              <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-2xl font-bold truncate text-sm sm:text-2xl">{stats.commonFailureStepType}</p>
              <p className="text-xs text-muted-foreground">Common Fail Step</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.retrySuccessRate}%</p>
              <p className="text-xs text-muted-foreground">Retry Success</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Common errors */}
      {stats.topErrors.length > 0 && (
        <Card className="p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Most Common Errors</h4>
          <div className="space-y-1.5">
            {stats.topErrors.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate max-w-[80%] text-red-600 dark:text-red-400">{e.error}</span>
                <Badge variant="outline" className="text-[10px] h-5 shrink-0">{e.count}×</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Search + Actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by workflow name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => fetchDLQ()}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="gap-1" disabled={entries.length === 0 || actionLoading === 'purge'}>
              {actionLoading === 'purge' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Purge All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Purge Dead Letter Queue</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all {stats.total} entries from the dead letter queue. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handlePurgeAll} className="bg-red-600 hover:bg-red-700">
                Purge All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between text-xs">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && entries.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 px-6 border-dashed">
          <ShieldAlert className="h-10 w-10 text-emerald-500/30 mb-3" />
          <h3 className="text-lg font-semibold mb-1">Dead Letter Queue is empty</h3>
          <p className="text-sm text-muted-foreground">Failed executions that exhaust retries will appear here.</p>
        </Card>
      )}

      {/* DLQ Entries */}
      {!loading && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id} className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{entry.workflow?.name || 'Unknown Workflow'}</span>
                      <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800">
                        Dead Letter
                      </Badge>
                      {entry.retryCount > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                          {entry.retryCount} retries
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1">
                      <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">
                        {entry.error || entry.deadLetterReason || 'Unknown error'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      <span>Step: {entry.currentStep}/{entry.totalSteps}</span>
                      <span>Retries: {entry.retryCount}/{entry.maxRetries}</span>
                      <span>Failed: {formatRelativeTime(entry.updatedAt)}</span>
                      {entry.durationMs ? <span>Duration: {formatDuration(entry.durationMs)}</span> : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setDetailEntry(entry)}
                    title="View Details"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleRetry(entry.id)}
                    disabled={actionLoading === entry.id}
                    title="Retry from beginning"
                  >
                    {actionLoading === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="More options">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDetailEntry(entry)} className="gap-2 text-xs">
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRetry(entry.id)} className="gap-2 text-xs" disabled={actionLoading === entry.id}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        Retry from Beginning
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setReplayDialogEntry(entry);
                          setSelectedStep(0);
                        }}
                        className="gap-2 text-xs"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Replay from Step...
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailEntry} onOpenChange={(open) => { if (!open) setDetailEntry(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Execution Details</DialogTitle>
            <DialogDescription>{detailEntry?.workflow?.name || 'Unknown Workflow'}</DialogDescription>
          </DialogHeader>
          {detailEntry && (
            <ScrollArea className="max-h-80">
              <div className="space-y-3 pr-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p className="font-medium text-red-600">Dead Letter</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Priority</span>
                    <p className="font-medium">{detailEntry.priority}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Retries</span>
                    <p className="font-medium">{detailEntry.retryCount} / {detailEntry.maxRetries}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Current Step</span>
                    <p className="font-medium">{detailEntry.currentStep} / {detailEntry.totalSteps}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duration</span>
                    <p className="font-medium">{detailEntry.durationMs ? formatDuration(detailEntry.durationMs) : '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <p className="font-medium">{new Date(detailEntry.createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Updated</span>
                    <p className="font-medium">{new Date(detailEntry.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Error</span>
                  <pre className="mt-1 text-xs bg-red-500/5 border border-red-200 dark:border-red-800 rounded p-2 whitespace-pre-wrap break-words text-red-600 dark:text-red-400">
                    {detailEntry.error || detailEntry.deadLetterReason || 'No error details'}
                  </pre>
                </div>
                {detailEntry.deadLetterReason && detailEntry.error && detailEntry.deadLetterReason !== detailEntry.error && (
                  <div>
                    <span className="text-xs text-muted-foreground">Dead Letter Reason</span>
                    <pre className="mt-1 text-xs bg-muted rounded p-2 whitespace-pre-wrap break-words">
                      {detailEntry.deadLetterReason}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          <div className="flex justify-end gap-2 mt-4">
            {detailEntry && (
              <>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setReplayDialogEntry(detailEntry);
                    setSelectedStep(0);
                    setDetailEntry(null);
                  }}
                  disabled={actionLoading === detailEntry.id}
                >
                  <Play className="h-3.5 w-3.5" />
                  Replay from Step...
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => { handleRetry(detailEntry.id); setDetailEntry(null); }}
                  disabled={actionLoading === detailEntry.id}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry All
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Replay From Step Dialog */}
      <Dialog open={!!replayDialogEntry} onOpenChange={(open) => { if (!open) setReplayDialogEntry(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Replay from Step</DialogTitle>
            <DialogDescription>
              {replayDialogEntry?.workflow?.name || 'Unknown Workflow'} — Step {replayDialogEntry?.currentStep || 0} of {replayDialogEntry?.totalSteps || 0} failed
            </DialogDescription>
          </DialogHeader>
          {replayDialogEntry && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Select which step to resume execution from. Steps before this will keep their existing results.
              </p>
              <ScrollArea className="max-h-60">
                <div className="space-y-1 pr-4">
                  {getStepList(replayDialogEntry).map((step) => (
                    <button
                      key={step.index}
                      onClick={() => setSelectedStep(step.index)}
                      className={cn(
                        'w-full flex items-center gap-3 p-2 rounded-md text-xs transition-colors',
                        selectedStep === step.index
                          ? 'bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800'
                          : 'hover:bg-muted border border-transparent'
                      )}
                    >
                      <div className={cn(
                        'h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold',
                        selectedStep === step.index
                          ? 'bg-emerald-500 text-white'
                          : step.index < (replayDialogEntry.currentStep || 0)
                            ? 'bg-emerald-500/20 text-emerald-600'
                            : 'bg-red-500/20 text-red-600'
                      )}>
                        {step.index + 1}
                      </div>
                      <div className="flex-1 text-left">
                        <span className="font-medium">{step.name}</span>
                        {step.index < (replayDialogEntry.currentStep || 0) && (
                          <span className="ml-2 text-emerald-600 dark:text-emerald-400">(completed)</span>
                        )}
                        {step.index === (replayDialogEntry.currentStep || 0) && (
                          <span className="ml-2 text-red-600 dark:text-red-400">(failed)</span>
                        )}
                      </div>
                      {selectedStep === step.index && (
                        <Play className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
              <Separator />
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                <BarChart3 className="h-4 w-4 shrink-0" />
                <span>
                  {selectedStep === 0
                    ? 'Will re-run all steps from the beginning.'
                    : `Will keep results from steps 1–${selectedStep} and re-run from step ${selectedStep + 1}.`
                  }
                </span>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="ghost"
              onClick={() => setReplayDialogEntry(null)}
            >
              Cancel
            </Button>
            <Button
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                if (replayDialogEntry) {
                  handleReplayFromStep(replayDialogEntry.id, selectedStep);
                }
              }}
              disabled={actionLoading === replayDialogEntry?.id}
            >
              {actionLoading === replayDialogEntry?.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Replay from Step {selectedStep + 1}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
