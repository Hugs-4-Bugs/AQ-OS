'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Filter, Play, Copy, Pause, PlayCircle, Archive, MoreHorizontal,
  Zap, Clock, ChevronLeft, ChevronRight, GitBranch, Loader2, AlertCircle,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

// ─── Local types (mirrors workflow domain models) ───────────────

type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';

type WorkflowTriggerType =
  | 'lead_discovered'
  | 'lead_stage_change'
  | 'lead_reply'
  | 'score_change'
  | 'email_received'
  | 'payment_success'
  | 'payment_failed'
  | 'ai_completed'
  | 'webhook_trigger'
  | 'scheduled'
  | 'manual'
  | 'credit_low';

interface WorkflowType {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  triggerType: WorkflowTriggerType;
  nodes?: unknown[];
  edges?: unknown[];
  triggerConfig?: Record<string, unknown>;
  runCount: number;
  successCount: number;
  lastRunAt?: string;
  [key: string]: unknown;
}

// Helpers
const TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  lead_discovered: 'Lead Discovered',
  lead_stage_change: 'Stage Change',
  lead_reply: 'Lead Reply',
  score_change: 'Score Change',
  email_received: 'Email Received',
  payment_success: 'Payment Success',
  payment_failed: 'Payment Failed',
  ai_completed: 'AI Completed',
  webhook_trigger: 'Webhook',
  scheduled: 'Scheduled',
  manual: 'Manual',
  credit_low: 'Credit Low',
};

const STATUS_COLORS: Record<WorkflowStatus, string> = {
  draft: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700',
  paused: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700',
  archived: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700',
};

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function parseWorkflow(raw: Record<string, unknown>): WorkflowType {
  return {
    ...raw,
    nodes: typeof raw.nodes === 'string' ? JSON.parse(raw.nodes as string) : (raw.nodes as WorkflowType['nodes'] || []),
    edges: typeof raw.edges === 'string' ? JSON.parse(raw.edges as string) : (raw.edges as WorkflowType['edges'] || []),
    triggerConfig: typeof raw.triggerConfig === 'string' ? JSON.parse(raw.triggerConfig as string) : (raw.triggerConfig as WorkflowType['triggerConfig'] || {}),
    status: (raw.status as WorkflowStatus) || 'draft',
    triggerType: (raw.triggerType as WorkflowTriggerType) || 'manual',
  } as WorkflowType;
}

interface WorkflowListProps {
  onNewWorkflow: () => void;
  onEditWorkflow: (workflow: WorkflowType) => void;
}

export default function WorkflowList({ onNewWorkflow, onEditWorkflow }: WorkflowListProps) {
  const [workflows, setWorkflows] = useState<WorkflowType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [triggerFilter, setTriggerFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const limit = 10;

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (triggerFilter !== 'all') params.set('triggerType', triggerFilter);

      const res = await fetch(`/api/workflows?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch workflows');
      const data = await res.json();
      const items = (data.workflows || data.data || []).map(parseWorkflow);
      setWorkflows(items);
      setTotalPages(data.totalPages || Math.ceil((data.total || items.length) / limit) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, triggerFilter]);

  useEffect(() => {
    let cancelled = false;
    fetchWorkflows();
    return () => { cancelled = true; };
  }, [fetchWorkflows]);

  const handleAction = async (id: string, action: string, body?: Record<string, unknown>) => {
    setActionLoading(id + action);
    try {
      let res: Response;
      if (action === 'execute') {
        res = await fetch(`/api/workflows/${id}/execute`, { method: 'POST' });
      } else if (action === 'duplicate') {
        res = await fetch(`/api/workflows/${id}/duplicate`, { method: 'POST' });
      } else {
        res = await fetch(`/api/workflows/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
        });
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Action failed');
      }
      await fetchWorkflows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const getSuccessRate = (w: WorkflowType) => {
    const total = w.runCount;
    if (total === 0) return 0;
    return Math.round((w.successCount / total) * 100);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search workflows..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={triggerFilter} onValueChange={(v) => { setTriggerFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[150px] h-9 hidden sm:flex">
              <SelectValue placeholder="Trigger" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Triggers</SelectItem>
              {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={onNewWorkflow} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Workflow
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && workflows.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 px-6 border-dashed">
          <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <Workflow className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No workflows yet</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
            Create your first workflow to automate repetitive tasks like lead nurturing, follow-ups, and notifications.
          </p>
          <Button onClick={onNewWorkflow} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Your First Workflow
          </Button>
        </Card>
      )}

      {/* Workflow Cards (mobile & desktop) */}
      {!loading && workflows.length > 0 && (
        <div className="space-y-3">
          {workflows.map((w) => {
            const successRate = getSuccessRate(w);
            return (
              <Card
                key={w.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => onEditWorkflow(w)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={cn(
                      'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                      w.status === 'active' ? 'bg-emerald-500/10' :
                      w.status === 'paused' ? 'bg-amber-500/10' :
                      w.status === 'archived' ? 'bg-red-500/10' : 'bg-slate-500/10'
                    )}>
                      <Zap className={cn(
                        'h-4 w-4',
                        w.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' :
                        w.status === 'paused' ? 'text-amber-600 dark:text-amber-400' :
                        w.status === 'archived' ? 'text-red-600 dark:text-red-400' : 'text-slate-500'
                      )} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm truncate">{w.name}</h4>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5', STATUS_COLORS[w.status])}>
                          {w.status}
                        </Badge>
                      </div>
                      {w.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{w.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          {TRIGGER_LABELS[w.triggerType] || w.triggerType}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(w.lastRunAt)}
                        </span>
                        <span>{w.runCount} runs</span>
                        {w.runCount > 0 && (
                          <span className="flex items-center gap-1.5">
                            <span>Success:</span>
                            <Progress value={successRate} className="w-16 h-1.5" />
                            <span>{successRate}%</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => onEditWorkflow(w)}>
                        Edit
                      </DropdownMenuItem>
                      {w.status === 'active' && (
                        <DropdownMenuItem
                          onClick={() => handleAction(w.id, 'update', { status: 'paused' })}
                          disabled={actionLoading === w.id + 'update'}
                        >
                          {actionLoading === w.id + 'update' ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Pause className="h-3 w-3 mr-2" />}
                          Pause
                        </DropdownMenuItem>
                      )}
                      {w.status === 'paused' && (
                        <DropdownMenuItem
                          onClick={() => handleAction(w.id, 'update', { status: 'active' })}
                          disabled={actionLoading === w.id + 'update'}
                        >
                          <PlayCircle className="h-3 w-3 mr-2" />
                          Resume
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleAction(w.id, 'execute')}
                        disabled={actionLoading === w.id + 'execute' || w.status === 'draft'}
                      >
                        {actionLoading === w.id + 'execute' ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Play className="h-3 w-3 mr-2" />}
                        Execute
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleAction(w.id, 'duplicate')}
                        disabled={actionLoading === w.id + 'duplicate'}
                      >
                        {actionLoading === w.id + 'duplicate' ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Copy className="h-3 w-3 mr-2" />}
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 dark:text-red-400"
                        onClick={() => handleAction(w.id, 'update', { status: 'archived' })}
                        disabled={actionLoading === w.id + 'update'}
                      >
                        <Archive className="h-3 w-3 mr-2" />
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
