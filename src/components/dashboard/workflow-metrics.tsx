'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Zap, Activity, Clock, AlertTriangle, ArrowUpRight, TrendingUp, Loader2, AlertCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ─── Local types (mirrors workflow domain models) ───────────────

interface WorkflowMetricsType {
  totalWorkflows: number;
  activeWorkflows: number;
  totalExecutions: number;
  successRate: number;
  avgRuntimeMs: number;
  executionsByStatus: Record<string, number>;
  recentFailures: number;
  queueDepth: number;
  throughputLast24h: number;
}

interface Workflow {
  id: string;
  name: string;
  runCount: number;
  successCount: number;
  nodes?: unknown[];
  edges?: unknown[];
  triggerConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

function parseWorkflow(raw: Record<string, unknown>): Workflow {
  return {
    ...raw,
    nodes: typeof raw.nodes === 'string' ? JSON.parse(raw.nodes as string) : (raw.nodes as Workflow['nodes'] || []),
    edges: typeof raw.edges === 'string' ? JSON.parse(raw.edges as string) : (raw.edges as Workflow['edges'] || []),
    triggerConfig: typeof raw.triggerConfig === 'string' ? JSON.parse(raw.triggerConfig as string) : (raw.triggerConfig as Workflow['triggerConfig'] || {}),
  } as Workflow;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  running: 'bg-amber-500',
  queued: 'bg-blue-500',
  paused: 'bg-slate-400',
  cancelled: 'bg-slate-300',
  dead_letter: 'bg-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  failed: 'Failed',
  running: 'Running',
  queued: 'Queued',
  paused: 'Paused',
  cancelled: 'Cancelled',
  dead_letter: 'Dead Letter',
};

interface TimelineEntry {
  date: string;
  completed: number;
  failed: number;
  running: number;
  other: number;
  total: number;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Custom tooltip for the chart
function TimelineTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold mb-1.5">{label ? formatDateLabel(label) : ''}</p>
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WorkflowMetrics() {
  const [metrics, setMetrics] = useState<WorkflowMetricsType | null>(null);
  const [topWorkflows, setTopWorkflows] = useState<Workflow[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [metricsRes, workflowsRes, timelineRes] = await Promise.all([
        fetch('/api/workflows/metrics'),
        fetch('/api/workflows?limit=5&sort=runCount'),
        fetch('/api/workflows/metrics/timeline'),
      ]);

      if (!metricsRes.ok) throw new Error('Failed to fetch metrics');
      const metricsData = await metricsRes.json();
      setMetrics(metricsData.metrics || metricsData.data || metricsData);

      if (workflowsRes.ok) {
        const wfData = await workflowsRes.json();
        const items = (wfData.workflows || wfData.data || []).map(parseWorkflow);
        setTopWorkflows(items);
      }

      if (timelineRes.ok) {
        const tlData = await timelineRes.json();
        setTimeline(tlData.timeline || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const formatRuntime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between text-xs">
            {error}
            <Badge variant="outline" className="cursor-pointer" onClick={fetchMetrics}>Retry</Badge>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const m = metrics || {
    totalWorkflows: 0,
    activeWorkflows: 0,
    totalExecutions: 0,
    successRate: 0,
    avgRuntimeMs: 0,
    executionsByStatus: {},
    recentFailures: 0,
    queueDepth: 0,
    throughputLast24h: 0,
  };

  // Compute status distribution for chart
  const statusEntries = Object.entries(m.executionsByStatus || {}).sort((a, b) => b[1] - a[1]);
  const maxStatusCount = Math.max(...statusEntries.map(([, v]) => v), 1);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{m.totalWorkflows}</p>
              <p className="text-xs text-muted-foreground">Total Workflows</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{m.activeWorkflows}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{m.totalExecutions}</p>
              <p className="text-xs text-muted-foreground">Total Executions</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{m.successRate.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Avg Runtime</span>
          </div>
          <p className="text-lg font-bold mt-1">{formatRuntime(m.avgRuntimeMs)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Queue Depth</span>
          </div>
          <p className="text-lg font-bold mt-1">{m.queueDepth}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Throughput (24h)</span>
          </div>
          <p className="text-lg font-bold mt-1">{m.throughputLast24h}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Recent Failures</span>
          </div>
          <p className="text-lg font-bold mt-1">{m.recentFailures}</p>
        </Card>
      </div>

      {/* Execution Timeline Chart */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold">Execution Timeline (Last 7 Days)</h4>
          {timeline.length > 0 && (
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Completed</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-muted-foreground">Failed</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">Running</span>
              </div>
            </div>
          )}
        </div>
        {timeline.length > 0 ? (
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateLabel}
                  tick={{ fontSize: 10 }}
                  className="text-muted-foreground"
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  className="text-muted-foreground"
                  allowDecimals={false}
                />
                <Tooltip content={<TimelineTooltip />} />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="failed" name="Failed" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="running" name="Running" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <BarChart3 className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No execution data for the last 7 days</p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Status Distribution */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-4">Execution Status Distribution</h4>
          {statusEntries.length > 0 ? (
            <div className="space-y-3">
              {statusEntries.map(([status, count]) => (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className={cn('h-2.5 w-2.5 rounded-full', STATUS_COLORS[status] || 'bg-slate-400')} />
                      <span>{STATUS_LABELS[status] || status}</span>
                    </div>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', STATUS_COLORS[status] || 'bg-slate-400')}
                      style={{ width: `${Math.max(2, (count / maxStatusCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No execution data yet</p>
          )}
        </Card>

        {/* Top Workflows */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-4">Top Workflows by Runs</h4>
          {topWorkflows.length > 0 ? (
            <div className="space-y-3">
              {topWorkflows.map((wf, i) => {
                const successRate = wf.runCount > 0 ? Math.round((wf.successCount / wf.runCount) * 100) : 0;
                return (
                  <div key={wf.id} className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold">{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{wf.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{wf.runCount} runs</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={successRate} className="h-1.5 flex-1" />
                        <span className="text-[10px] text-muted-foreground shrink-0">{successRate}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No workflow data yet</p>
          )}
        </Card>
      </div>
    </div>
  );
}
