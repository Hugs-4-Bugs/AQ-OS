'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Clock, CheckCircle, XCircle, AlertTriangle, Pause, Play, RotateCcw,
  ChevronDown, ChevronRight, Loader2, Activity, X as XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

// ─── Local types (mirrors workflow domain models) ───────────────

type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'dead_letter';

interface WorkflowStepLog {
  id: string;
  stepName: string;
  stepType: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  durationMs?: number | null;
  [key: string]: unknown;
}

interface WorkflowExecution {
  id: string;
  status: ExecutionStatus;
  workflow?: { name?: string } | null;
  currentStep?: number;
  totalSteps?: number;
  retryCount: number;
  error?: string | null;
  durationMs?: number | null;
  startedAt?: string;
  createdAt?: string;
  triggerData?: Record<string, unknown>;
  isDeadLetter?: boolean;
  [key: string]: unknown;
}

const STATUS_CONFIG: Record<ExecutionStatus, { color: string; icon: React.ElementType; label: string }> = {
  queued: { color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', icon: Clock, label: 'Queued' },
  running: { color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', icon: Loader2, label: 'Running' },
  completed: { color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', icon: CheckCircle, label: 'Completed' },
  failed: { color: 'bg-red-500/10 text-red-600 dark:text-red-400', icon: XCircle, label: 'Failed' },
  cancelled: { color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400', icon: XIcon, label: 'Cancelled' },
  paused: { color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', icon: Pause, label: 'Paused' },
  dead_letter: { color: 'bg-red-500/10 text-red-600 dark:text-red-400', icon: AlertTriangle, label: 'Dead Letter' },
};

const STEP_STATUS_COLORS: Record<string, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-red-600 dark:text-red-400',
  skipped: 'text-slate-400',
  retrying: 'text-amber-600 dark:text-amber-400',
};

function formatDuration(ms?: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

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

function parseExecution(raw: Record<string, unknown>): WorkflowExecution {
  return {
    ...raw,
    status: (raw.status as ExecutionStatus) || 'queued',
    triggerData: typeof raw.triggerData === 'string' ? JSON.parse(raw.triggerData as string) : (raw.triggerData as Record<string, unknown> || {}),
    isDeadLetter: Boolean(raw.isDeadLetter),
  } as WorkflowExecution;
}

export default function WorkflowExecutionHistory() {
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [stepLogs, setStepLogs] = useState<Record<string, WorkflowStepLog[]>>({});
  const [logsLoading, setLogsLoading] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const limit = 15;

  const fetchExecutions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/workflows/executions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch executions');
      const data = await res.json();
      const items = (data.executions || data.data || []).map(parseExecution);
      setExecutions(items);
      setTotalPages(data.totalPages || Math.ceil((data.total || items.length) / limit) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load executions');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    let cancelled = false;
    fetchExecutions();
    return () => { cancelled = true; };
  }, [fetchExecutions]);

  const toggleExpanded = async (execId: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(execId)) {
      newExpanded.delete(execId);
      setExpandedIds(newExpanded);
      return;
    }
    newExpanded.add(execId);
    setExpandedIds(newExpanded);

    // Fetch step logs if not already loaded
    if (!stepLogs[execId]) {
      setLogsLoading((prev) => new Set(prev).add(execId));
      try {
        const res = await fetch(`/api/workflows/executions/${execId}/logs`);
        if (res.ok) {
          const data = await res.json();
          setStepLogs((prev) => ({ ...prev, [execId]: data.logs || data.data || [] }));
        }
      } catch {
        // silently ignore
      } finally {
        setLogsLoading((prev) => {
          const next = new Set(prev);
          next.delete(execId);
          return next;
        });
      }
    }
  };

  const handleAction = async (execId: string, action: string) => {
    setActionLoading(execId + action);
    try {
      const res = await fetch(`/api/workflows/executions/${execId}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Action failed');
      }
      await fetchExecutions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by workflow name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between text-xs">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && executions.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 px-6 border-dashed">
          <Activity className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <h3 className="text-lg font-semibold mb-1">No executions yet</h3>
          <p className="text-sm text-muted-foreground">Workflow executions will appear here when they run.</p>
        </Card>
      )}

      {/* Execution list */}
      {!loading && executions.length > 0 && (
        <div className="space-y-2">
          {executions.map((exec) => {
            const statusConf = STATUS_CONFIG[exec.status] || STATUS_CONFIG.queued;
            const StatusIcon = statusConf.icon;
            const isExpanded = expandedIds.has(exec.id);
            const logs = stepLogs[exec.id] || [];

            return (
              <Card key={exec.id} className="overflow-hidden">
                <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(exec.id)}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                      <div className="shrink-0">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <StatusIcon className={cn('h-4 w-4 shrink-0', statusConf.color, exec.status === 'running' && 'animate-spin')} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{exec.workflow?.name || 'Unknown Workflow'}</span>
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5', statusConf.color)}>
                            {statusConf.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span>Steps: {exec.currentStep}/{exec.totalSteps}</span>
                          <span>Duration: {formatDuration(exec.durationMs)}</span>
                          <span>{formatRelativeTime(exec.startedAt || exec.createdAt)}</span>
                          {exec.retryCount > 0 && <span className="text-amber-500">Retries: {exec.retryCount}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {exec.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleAction(exec.id, 'retry')}
                            disabled={actionLoading === exec.id + 'retry'}
                            title="Retry"
                          >
                            {actionLoading === exec.id + 'retry' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        {exec.status === 'running' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleAction(exec.id, 'cancel')}
                            disabled={actionLoading === exec.id + 'cancel'}
                            title="Cancel"
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {exec.status === 'running' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleAction(exec.id, 'pause')}
                            disabled={actionLoading === exec.id + 'pause'}
                            title="Pause"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {exec.status === 'paused' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleAction(exec.id, 'resume')}
                            disabled={actionLoading === exec.id + 'resume'}
                            title="Resume"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t px-4 py-3 bg-muted/20">
                      {/* Error message */}
                      {exec.error && (
                        <div className="mb-3 p-2 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-xs">
                          <strong>Error:</strong> {exec.error}
                        </div>
                      )}

                      {/* Step logs */}
                      {logsLoading.has(exec.id) ? (
                        <div className="space-y-2">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-8 w-full" />
                          ))}
                        </div>
                      ) : logs.length > 0 ? (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step Logs</h4>
                          <div className="relative pl-4 space-y-2">
                            {/* Timeline line */}
                            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                            {logs.map((log, i) => {
                              const stepColor = STEP_STATUS_COLORS[log.status] || STEP_STATUS_COLORS.skipped;
                              return (
                                <div key={log.id} className="relative flex items-start gap-3 py-1">
                                  {/* Timeline dot */}
                                  <div className={cn(
                                    'absolute left-[-12px] top-2 h-3 w-3 rounded-full border-2 border-background',
                                    log.status === 'success' ? 'bg-emerald-500' :
                                    log.status === 'failed' ? 'bg-red-500' :
                                    log.status === 'retrying' ? 'bg-amber-500' : 'bg-slate-300'
                                  )} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium">{log.stepName}</span>
                                      <Badge variant="outline" className="text-[9px] h-4 px-1">{log.stepType}</Badge>
                                      <span className={cn('text-[10px] font-medium', stepColor)}>{log.status}</span>
                                      {log.durationMs != null && (
                                        <span className="text-[10px] text-muted-foreground">{formatDuration(log.durationMs)}</span>
                                      )}
                                    </div>
                                    {log.error && (
                                      <p className="text-[10px] text-red-500 mt-0.5">{log.error}</p>
                                    )}
                                    {/* Input/Output collapsible */}
                                    {(log.input || log.output) && (
                                      <StepLogDetail log={log} />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No step logs available.</p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>
              &larr;
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
              &rarr;
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Step log detail with collapsible input/output
function StepLogDetail({ log }: { log: WorkflowStepLog }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="mt-1">
      <button onClick={() => setShowDetail(!showDetail)} className="text-[10px] text-primary hover:underline">
        {showDetail ? 'Hide details' : 'Show details'}
      </button>
      {showDetail && (
        <div className="mt-1 space-y-1">
          {log.input && (
            <div>
              <span className="text-[9px] font-semibold text-muted-foreground">INPUT:</span>
              <pre className="text-[9px] bg-muted/50 rounded p-1.5 mt-0.5 overflow-x-auto max-h-32">
                {JSON.stringify(log.input, null, 2)}
              </pre>
            </div>
          )}
          {log.output && (
            <div>
              <span className="text-[9px] font-semibold text-muted-foreground">OUTPUT:</span>
              <pre className="text-[9px] bg-muted/50 rounded p-1.5 mt-0.5 overflow-x-auto max-h-32">
                {JSON.stringify(log.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
