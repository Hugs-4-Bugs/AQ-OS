'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  HardDrive,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
  Users,
  BarChart3,
  Timer,
  Globe,
  Shield,
  XCircle,
  Loader2,
  Server,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ===== TYPES =====

interface SystemHealth {
  uptime: number;
  uptimeFormatted: string;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    heapUsagePercent: number;
    external: number;
    arrayBuffers: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  nodeVersion: string;
  pid: number;
  environment: string;
}

interface ApplicationMetrics {
  requests: {
    total: number;
    errors: number;
    errorRate: number;
    requestsPerMinute: number;
    avgResponseTimeMs: number;
    statusCodeDistribution: Record<string, number>;
  };
  slowEndpoints: Array<{ route: string; method: string; avgMs: number; p95Ms: number }>;
  requestVolumeTimeline: Array<{ timestamp: number; count: number }>;
  topEndpoints: Array<{
    route: string;
    method: string;
    avgMs: number;
    p95Ms: number;
    p99Ms: number;
    errorRate: number;
  }>;
}

interface DbMetrics {
  totalQueries: number;
  slowQueries: number;
  avgQueryTimeMs: number;
  queriesByOperation: Record<string, { count: number; avgMs: number }>;
  recentSlowQueries: Array<{ query: string; durationMs: number; timestamp: string }>;
  connectionPool: {
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    waitingCount: number;
  };
}

interface BusinessMetrics {
  totalLeads: number;
  activeLeads: number;
  totalDeals: number;
  wonDeals: number;
  totalDealValue: number;
  activeUsers: number;
  totalCredits: number;
  creditsConsumedToday: number;
  activeWorkflows: number;
}

interface Alert {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'firing' | 'resolved';
  threshold: string;
  currentValue: string;
  firedAt: string;
  resolvedAt?: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
  error?: { name: string; message: string };
}

interface DashboardData {
  timestamp: string;
  version: string;
  systemHealth: SystemHealth;
  applicationMetrics: ApplicationMetrics;
  dbMetrics: DbMetrics;
  businessMetrics: BusinessMetrics;
  alerts: {
    active: Alert[];
    history: Alert[];
    summary: Record<string, number>;
  };
  logs: {
    recent: LogEntry[];
    counts: Record<string, number>;
  };
  traces: Array<{
    traceId: string;
    rootOperation: string;
    spanCount: number;
    totalDurationMs: number;
    status: string;
  }>;
}

// ===== HELPER FUNCTIONS =====

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-500';
    case 'high': return 'bg-orange-500';
    case 'medium': return 'bg-yellow-500';
    case 'low': return 'bg-blue-500';
    case 'info': return 'bg-slate-500';
    default: return 'bg-slate-500';
  }
}

function getSeverityBadgeVariant(severity: string): 'destructive' | 'default' | 'outline' | 'secondary' {
  switch (severity) {
    case 'critical': return 'destructive';
    case 'high': return 'destructive';
    case 'medium': return 'default';
    default: return 'secondary';
  }
}

function getLogLevelColor(level: string): string {
  switch (level) {
    case 'error': return 'text-red-500';
    case 'warn': return 'text-yellow-500';
    case 'info': return 'text-green-500';
    case 'debug': return 'text-slate-400';
    default: return 'text-slate-500';
  }
}

// ===== MINI CHART COMPONENT =====

function MiniBarChart({ data, maxBars = 20, height = 40, color = 'bg-primary' }: {
  data: number[];
  maxBars?: number;
  height?: number;
  color?: string;
}) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>No data</div>;
  }

  const sliced = data.slice(-maxBars);
  const max = Math.max(...sliced, 1);

  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {sliced.map((value, i) => (
        <div
          key={i}
          className={cn('flex-1 rounded-t-sm transition-all duration-300 min-w-[2px]', color)}
          style={{ height: `${(value / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

// ===== MAIN COMPONENT =====

export default function ObservabilityDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    system: true,
    api: true,
    db: true,
    business: true,
    alerts: true,
    logs: false,
    traces: false,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/metrics/dashboard');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchData();
    const interval = setInterval(fetchData, 30000); // Auto-refresh every 30s
    return () => { cancelled = true; clearInterval(interval); };
  }, [fetchData]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-sm font-medium">Failed to load metrics</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData} className="mt-4">
              <RefreshCw className="h-3 w-3 mr-1.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { systemHealth, applicationMetrics, dbMetrics, businessMetrics, alerts, logs, traces } = data;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            System Observability
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last refresh: {lastRefresh?.toLocaleTimeString() || '—'} · Auto-refresh: 30s
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* ── Active Alerts Banner ──────────────────────────────── */}
      {alerts.active.length > 0 && (
        <Card className="border-red-500/50 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                {alerts.active.length} Active Alert{alerts.active.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1.5">
              {alerts.active.map((alert) => (
                <div key={alert.id} className="flex items-start gap-2">
                  <div className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', getSeverityColor(alert.severity))} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{alert.name}: {alert.currentValue}</p>
                    <p className="text-xs text-muted-foreground">{alert.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── System Health Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* CPU */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">CPU</span>
            </div>
            <p className="text-lg font-bold">
              {((systemHealth.cpu.user + systemHealth.cpu.system) / 1000).toFixed(1)}s
            </p>
            <p className="text-[10px] text-muted-foreground">
              User: {(systemHealth.cpu.user / 1000).toFixed(0)}ms · Sys: {(systemHealth.cpu.system / 1000).toFixed(0)}ms
            </p>
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Memory</span>
            </div>
            <p className="text-lg font-bold">{systemHealth.memory.heapUsagePercent.toFixed(0)}%</p>
            <p className="text-[10px] text-muted-foreground">
              {systemHealth.memory.heapUsed}MB / {systemHealth.memory.heapTotal}MB
            </p>
            <Progress
              value={systemHealth.memory.heapUsagePercent}
              className={cn('h-1.5 mt-1.5', systemHealth.memory.heapUsagePercent > 85 ? '[&>div]:bg-red-500' : systemHealth.memory.heapUsagePercent > 70 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-emerald-500')}
            />
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Uptime</span>
            </div>
            <p className="text-lg font-bold">{systemHealth.uptimeFormatted}</p>
            <p className="text-[10px] text-muted-foreground">
              Node {systemHealth.nodeVersion} · PID {systemHealth.pid}
            </p>
          </CardContent>
        </Card>

        {/* RSS */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">RSS</span>
            </div>
            <p className="text-lg font-bold">{systemHealth.memory.rss}MB</p>
            <p className="text-[10px] text-muted-foreground">
              Env: {systemHealth.environment}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── API Performance Section ───────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection('api')}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              API Performance
            </CardTitle>
            {expandedSections.api ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {expandedSections.api && (
          <CardContent className="pt-0">
            {/* API Summary Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Requests</p>
                <p className="text-lg font-bold">{applicationMetrics.requests.total.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Error Rate</p>
                <p className={cn('text-lg font-bold', applicationMetrics.requests.errorRate > 5 ? 'text-red-500' : 'text-emerald-500')}>
                  {applicationMetrics.requests.errorRate.toFixed(2)}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Avg Response</p>
                <p className="text-lg font-bold">{applicationMetrics.requests.avgResponseTimeMs.toFixed(0)}ms</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Req/Min</p>
                <p className="text-lg font-bold">{applicationMetrics.requests.requestsPerMinute.toFixed(1)}</p>
              </div>
            </div>

            {/* Status Code Distribution */}
            <div className="mb-4">
              <p className="text-xs font-medium mb-2">Status Code Distribution</p>
              <div className="flex gap-2">
                {Object.entries(applicationMetrics.requests.statusCodeDistribution).map(([code, count]) => {
                  if (count === 0) return null;
                  const codeNum = parseInt(code.replace('xx', '00'));
                  const color = codeNum >= 500 ? 'bg-red-500' : codeNum >= 400 ? 'bg-yellow-500' : codeNum >= 300 ? 'bg-blue-500' : 'bg-emerald-500';
                  return (
                    <Badge key={code} variant="outline" className="text-xs">
                      <span className={cn('h-2 w-2 rounded-full mr-1.5', color)} />
                      {code}: {count}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {/* Request Volume Chart */}
            <div className="mb-4">
              <p className="text-xs font-medium mb-2">Request Volume (last 10 min)</p>
              <MiniBarChart
                data={applicationMetrics.requestVolumeTimeline.map(t => t.count)}
                height={60}
                color="bg-primary/70"
              />
            </div>

            {/* Top Endpoints */}
            {applicationMetrics.topEndpoints.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">Top Endpoints</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {applicationMetrics.topEndpoints.map((ep, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">{ep.method}</Badge>
                        <span className="truncate">{ep.route}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-muted-foreground">{ep.avgMs}ms avg</span>
                        <span className="text-muted-foreground">{ep.p95Ms}ms p95</span>
                        {ep.errorRate > 0 && (
                          <span className="text-red-500">{ep.errorRate.toFixed(1)}% err</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Slow Endpoints */}
            {applicationMetrics.slowEndpoints.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium mb-2 flex items-center gap-1">
                  <Timer className="h-3 w-3 text-yellow-500" />
                  Slow Endpoints (p95 &gt; 1s)
                </p>
                <div className="space-y-1.5">
                  {applicationMetrics.slowEndpoints.map((ep, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 bg-yellow-50/50 dark:bg-yellow-950/20 rounded px-2">
                      <span className="truncate">{ep.method} {ep.route}</span>
                      <span className="text-yellow-600 dark:text-yellow-400 shrink-0 ml-2">{ep.p95Ms}ms p95</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Database Metrics Section ──────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection('db')}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Database
            </CardTitle>
            {expandedSections.db ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {expandedSections.db && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Queries</p>
                <p className="text-lg font-bold">{dbMetrics.totalQueries.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Slow Queries</p>
                <p className={cn('text-lg font-bold', dbMetrics.slowQueries > 0 ? 'text-yellow-500' : 'text-emerald-500')}>
                  {dbMetrics.slowQueries}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Avg Query Time</p>
                <p className="text-lg font-bold">{dbMetrics.avgQueryTimeMs.toFixed(2)}ms</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Connections</p>
                <p className="text-lg font-bold">{dbMetrics.connectionPool.totalConnections}</p>
              </div>
            </div>

            {/* Query breakdown by operation */}
            {Object.keys(dbMetrics.queriesByOperation).length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium mb-2">Queries by Operation</p>
                <div className="space-y-1.5">
                  {Object.entries(dbMetrics.queriesByOperation).map(([op, stats]) => (
                    <div key={op} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                      <Badge variant="outline" className="text-[10px] h-4 px-1">{op}</Badge>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{stats.count} queries</span>
                        <span className="text-muted-foreground">{stats.avgMs.toFixed(2)}ms avg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Slow Queries */}
            {dbMetrics.recentSlowQueries.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2 flex items-center gap-1">
                  <Timer className="h-3 w-3 text-yellow-500" />
                  Recent Slow Queries (&gt;100ms)
                </p>
                <ScrollArea className="max-h-32">
                  <div className="space-y-1">
                    {dbMetrics.recentSlowQueries.map((q, i) => (
                      <div key={i} className="text-xs py-1 bg-yellow-50/50 dark:bg-yellow-950/20 rounded px-2">
                        <div className="flex items-center justify-between">
                          <span className="text-yellow-600 dark:text-yellow-400">{q.durationMs.toFixed(2)}ms</span>
                          <span className="text-muted-foreground text-[10px]">{new Date(q.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-muted-foreground truncate mt-0.5 font-mono text-[10px]">{q.query}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Business Metrics Section ──────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection('business')}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Business Metrics
            </CardTitle>
            {expandedSections.business ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {expandedSections.business && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                <Users className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-lg font-bold">{businessMetrics.activeUsers}</p>
                <p className="text-[10px] text-muted-foreground">Active Users</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                <Zap className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-lg font-bold">{businessMetrics.activeLeads}</p>
                <p className="text-[10px] text-muted-foreground">Active Leads</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                <TrendingUp className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{businessMetrics.wonDeals}</p>
                <p className="text-[10px] text-muted-foreground">Won Deals</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                <Shield className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{businessMetrics.creditsConsumedToday}</p>
                <p className="text-[10px] text-muted-foreground">Credits Today</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                <Activity className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{businessMetrics.activeWorkflows}</p>
                <p className="text-[10px] text-muted-foreground">Active Workflows</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Alerts Section ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection('alerts')}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Alerts
              {alerts.active.length > 0 && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5 ml-1">{alerts.active.length}</Badge>
              )}
            </CardTitle>
            {expandedSections.alerts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {expandedSections.alerts && (
          <CardContent className="pt-0">
            {/* Alert Summary */}
            <div className="flex gap-3 mb-4">
              {Object.entries(alerts.summary).map(([severity, count]) => (
                count > 0 && (
                  <div key={severity} className="flex items-center gap-1.5">
                    <div className={cn('h-2.5 w-2.5 rounded-full', getSeverityColor(severity))} />
                    <span className="text-xs">{severity}: {count}</span>
                  </div>
                )
              ))}
              {Object.values(alerts.summary).every(v => v === 0) && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">All clear — no active alerts</span>
                </div>
              )}
            </div>

            {/* Alert History */}
            <div>
              <p className="text-xs font-medium mb-2">Recent Alerts</p>
              <ScrollArea className="max-h-48">
                {alerts.history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No alerts recorded</p>
                ) : (
                  <div className="space-y-1.5">
                    {alerts.history.slice().reverse().map((alert) => (
                      <div key={alert.id} className={cn(
                        'text-xs py-1.5 px-2 rounded flex items-start gap-2',
                        alert.status === 'firing' ? 'bg-red-50/50 dark:bg-red-950/20' : 'bg-slate-50 dark:bg-slate-900'
                      )}>
                        <div className={cn('h-2 w-2 rounded-full mt-1 shrink-0', getSeverityColor(alert.severity))} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{alert.name}</span>
                            <Badge variant={getSeverityBadgeVariant(alert.severity)} className="text-[9px] h-3.5 px-1">
                              {alert.severity}
                            </Badge>
                            {alert.status === 'firing' ? (
                              <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-muted-foreground text-[10px] mt-0.5">
                            {alert.currentValue} (threshold: {alert.threshold}) · {new Date(alert.firedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Recent Logs Section ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection('logs')}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Recent Logs
              <div className="flex gap-1.5 ml-2">
                {Object.entries(logs.counts).map(([level, count]) => (
                  count > 0 && (
                    <Badge key={level} variant="outline" className={cn('text-[9px] h-4 px-1', getLogLevelColor(level))}>
                      {level}: {count}
                    </Badge>
                  )
                ))}
              </div>
            </CardTitle>
            {expandedSections.logs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {expandedSections.logs && (
          <CardContent className="pt-0">
            <ScrollArea className="max-h-64">
              {logs.recent.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No logs recorded</p>
              ) : (
                <div className="space-y-0.5 font-mono text-[11px]">
                  {logs.recent.slice().reverse().map((log, i) => (
                    <div key={i} className={cn(
                      'py-1 px-2 rounded flex items-start gap-2',
                      log.level === 'error' ? 'bg-red-50/50 dark:bg-red-950/20' : ''
                    )}>
                      <span className="text-muted-foreground shrink-0 w-16">
                        {log.timestamp.split('T')[1]?.split('.')[0] || ''}
                      </span>
                      <span className={cn('uppercase w-4 shrink-0 font-bold', getLogLevelColor(log.level))}>
                        {log.level[0]}
                      </span>
                      <span className="truncate min-w-0">{log.message}</span>
                      {log.error && (
                        <span className="text-red-500 shrink-0 ml-1">[{log.error.name}]</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        )}
      </Card>

      {/* ── Traces Section ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection('traces')}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Recent Traces
            </CardTitle>
            {expandedSections.traces ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {expandedSections.traces && (
          <CardContent className="pt-0">
            {traces.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No traces recorded</p>
            ) : (
              <div className="space-y-1.5">
                {traces.map((trace) => (
                  <div key={trace.traceId} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        'h-2 w-2 rounded-full shrink-0',
                        trace.status === 'ok' ? 'bg-emerald-500' : trace.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                      )} />
                      <span className="truncate">{trace.rootOperation}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-muted-foreground">{trace.spanCount} spans</span>
                      <span className="text-muted-foreground">{Math.round(trace.totalDurationMs)}ms</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{trace.traceId.substring(0, 8)}…</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
