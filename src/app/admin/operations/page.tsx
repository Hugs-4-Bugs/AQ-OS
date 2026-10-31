'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Dashboard: Operations / Support / Integrations
//
// Phase 32: Production-grade operational visibility + controlled actions.
//
// Surfaces the existing admin-operations-service through its API actions:
//   • system-health    — DB ping, sessions, error counts, integration summary
//   • events           — SystemEvent list with filters + resolve buttons
//   • integrations     — per-provider config + reachability + health
//   • audit            — AuditLog paginated search
//   • metrics          — operational KPIs (signups, signins, workflows)
//
// All endpoints are RBAC-gated server-side (system.health.read /
// integrations.read / audit.read / system.events.resolve /
// integrations.control / system.operations.retry).
//
// HEALTHY is NEVER claimed from env var presence alone — every health
// state is evidence-based.
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  AlertTriangle,
  ShieldCheck,
  Plug,
  RefreshCw,
  Search,
  CheckCircle2,
  Loader2,
  ServerCog,
} from 'lucide-react';

interface SystemHealthData {
  database: { state: string; latencyMs: number | null; tableCount: number };
  sessions: { activeCount: number; last24hCount: number };
  errors: {
    unresolvedEvents: number;
    criticalEvents24h: number;
    errorEvents24h: number;
    warningEvents24h: number;
  };
  audit: { events24h: number; sensitiveActions24h: number };
  integrations: {
    configured: number;
    notConfigured: number;
    healthy: number;
    degraded: number;
    down: number;
    unknown: number;
  };
  overallHealth: string;
}

interface OperationalEventsData {
  events: {
    id: string;
    type: string;
    source: string;
    message: string;
    details: string | null;
    resolved: boolean;
    resolvedAt: string | null;
    createdAt: string;
  }[];
  total: number;
}

interface IntegrationsData {
  providers: {
    provider: string;
    category: string;
    configState: string;
    reachability: string;
    health: string;
    evidence: {
      configuredAccounts: number;
      recentSuccessfulEvents: number;
      recentFailedEvents: number;
      lastEventAt: string | null;
      lastFailureAt: string | null;
    };
    notes: string | null;
  }[];
  summary: {
    total: number;
    configured: number;
    healthy: number;
    degraded: number;
    down: number;
    unknown: number;
  };
  overallHealth: string;
}

interface AuditData {
  entries: {
    id: string;
    userId: string;
    action: string;
    details: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    resource: string | null;
    resourceId: string | null;
    createdAt: string;
    metadata: string | null;
  }[];
  total: number;
}

interface MetricsData {
  totals: {
    unresolvedEvents: number;
    criticalEvents: number;
    openSupportTickets: number;
    activeApiKeys: number;
    activeSessions: number;
  };
  last24h: {
    auditEvents: number;
    signups: number;
    signins: number;
    signinFailures: number;
    workflowExecutions: number;
    workflowFailures: number;
  };
  byEventSource: { source: string; count: number }[];
  byEventType: { type: string; count: number }[];
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

async function fetchAction<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load ${url.split('?')[0]} (${res.status})`);
  const json = await res.json();
  return json.data as T;
}

function healthBadge(state: string) {
  const s = state.toUpperCase();
  if (s === 'HEALTHY')
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">HEALTHY</Badge>;
  if (s === 'DEGRADED')
    return <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[11px] dark:text-amber-400">DEGRADED</Badge>;
  if (s === 'DOWN')
    return <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">DOWN</Badge>;
  return <Badge variant="outline" className="text-[11px]">UNKNOWN</Badge>;
}

function configBadge(state: string) {
  const s = state.toUpperCase();
  if (s === 'CONFIGURED')
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">CONFIGURED</Badge>;
  if (s === 'NOT_CONFIGURED')
    return <Badge variant="outline" className="bg-muted text-muted-foreground text-[11px]">NOT_CONFIGURED</Badge>;
  if (s === 'ERROR')
    return <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">ERROR</Badge>;
  return <Badge variant="outline" className="text-[11px]">UNKNOWN</Badge>;
}

function reachabilityBadge(state: string) {
  const s = state.toUpperCase();
  if (s === 'REACHABLE')
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">REACHABLE</Badge>;
  if (s === 'UNREACHABLE')
    return <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">UNREACHABLE</Badge>;
  return <Badge variant="outline" className="text-[11px]">UNKNOWN</Badge>;
}

function eventTypeBadge(type: string) {
  const t = type.toLowerCase();
  if (t === 'critical')
    return <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">critical</Badge>;
  if (t === 'error')
    return <Badge variant="outline" className="bg-rose-500/10 text-rose-600/90 border-rose-500/20 text-[11px] dark:text-rose-400/90">error</Badge>;
  if (t === 'warning')
    return <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[11px] dark:text-amber-400">warning</Badge>;
  return <Badge variant="outline" className="text-[11px]">{type}</Badge>;
}

export default function AdminOperationsPage() {
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [events, setEvents] = useState<OperationalEventsData | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsData | null>(null);
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState({ action: '', resource: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, ev, integ, aud, met] = await Promise.all([
        fetchAction<SystemHealthData>('/api/admin/operations/system-health'),
        fetchAction<OperationalEventsData>('/api/admin/operations/events?limit=20'),
        fetchAction<IntegrationsData>('/api/admin/operations/integrations'),
        fetchAction<AuditData>('/api/admin/operations/audit?limit=20'),
        fetchAction<MetricsData>('/api/admin/operations/metrics'),
      ]);
      setHealth(h); setEvents(ev); setIntegrations(integ); setAudit(aud); setMetrics(met);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load operational data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolveEvent = useCallback(async (eventId: string) => {
    setResolving(eventId);
    try {
      const res = await fetch(`/api/admin/operations/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'Resolved via admin operations console' }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to resolve (${res.status})`);
      const [ev, aud] = await Promise.all([
        fetchAction<OperationalEventsData>('/api/admin/operations/events?limit=20'),
        fetchAction<AuditData>('/api/admin/operations/audit?limit=20'),
      ]);
      setEvents(ev); setAudit(aud);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve event');
    } finally {
      setResolving(null);
    }
  }, []);

  const searchAudit = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (auditFilter.action) params.set('action', auditFilter.action);
      if (auditFilter.resource) params.set('resource', auditFilter.resource);
      const data = await fetchAction<AuditData>(`/api/admin/operations/audit?${params.toString()}`);
      setAudit(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audit search failed');
    }
  }, [auditFilter]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
          <p className="text-sm font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Operations / Support / Integrations</h1>
          <p className="text-xs text-muted-foreground">
            System health, operational events, integration status, audit log, controlled actions.
            All health states are evidence-based — HEALTHY is never claimed from env-var presence alone.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} aria-label="Refresh operations data">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Database</span>
              <ServerCog className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">
              {health?.database.state ? healthBadge(health.database.state) : '—'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {health?.database.latencyMs != null ? `${health.database.latencyMs}ms ping` : 'no ping'} · {health?.database.tableCount ?? 0} tables
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Active Sessions</span>
              <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{health?.sessions.activeCount ?? 0}</div>
            <p className="mt-1 text-xs text-muted-foreground">{health?.sessions.last24hCount ?? 0} issued in last 24h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Unresolved Events</span>
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{health?.errors.unresolvedEvents ?? 0}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {health?.errors.criticalEvents24h ?? 0} critical · {health?.errors.errorEvents24h ?? 0} errors · {health?.errors.warningEvents24h ?? 0} warnings (24h)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Overall System Health</span>
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">
              {health?.overallHealth ? healthBadge(health.overallHealth) : '—'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {health?.integrations.configured ?? 0} configured · {health?.integrations.healthy ?? 0} healthy · {health?.integrations.unknown ?? 0} unknown
            </p>
          </CardContent>
        </Card>
      </div>

      {metrics && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Operational Metrics (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Signups</p>
                <p className="text-lg font-semibold tabular-nums">{metrics.last24h.signups}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Signins</p>
                <p className="text-lg font-semibold tabular-nums">{metrics.last24h.signins}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Signin Failures</p>
                <p className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">{metrics.last24h.signinFailures}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Workflow Runs</p>
                <p className="text-lg font-semibold tabular-nums">{metrics.last24h.workflowExecutions}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Workflow Failures</p>
                <p className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">{metrics.last24h.workflowFailures}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Audit Events</p>
                <p className="text-lg font-semibold tabular-nums">{metrics.last24h.auditEvents}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Open Support Tickets</p>
                <p className="text-lg font-semibold tabular-nums">{metrics.totals.openSupportTickets}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Active API Keys</p>
                <p className="text-lg font-semibold tabular-nums">{metrics.totals.activeApiKeys}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Critical Events</p>
                <p className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">{metrics.totals.criticalEvents}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Plug className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Integration / Provider Status
            <span className="ml-auto text-[11px] text-muted-foreground">Overall:</span>
            {integrations && healthBadge(integrations.overallHealth)}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!integrations || integrations.providers.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No integrations registered.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Provider</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Configuration</TableHead>
                  <TableHead>Reachability</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="text-right">Recent (24h)</TableHead>
                  <TableHead className="pr-6 text-right">Last Event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.providers.map((p) => (
                  <TableRow key={p.provider}>
                    <TableCell className="pl-6 text-xs font-medium">{p.provider}</TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{p.category}</TableCell>
                    <TableCell>{configBadge(p.configState)}</TableCell>
                    <TableCell>{reachabilityBadge(p.reachability)}</TableCell>
                    <TableCell>{healthBadge(p.health)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">{p.evidence.recentSuccessfulEvents}</span>
                      {' / '}
                      <span className="text-rose-600 dark:text-rose-400">{p.evidence.recentFailedEvents}</span>
                    </TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(p.evidence.lastEventAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="px-6 pb-3 pt-2 text-[10px] text-muted-foreground">
            Configuration reflects env var presence or configured-account count. Reachability is derived from recent successful events. Health is derived from recent failure rate (last 24h, ≥5 events required for HEALTHY). HEALTHY is never claimed from env var presence alone.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Operational Events
            <span className="ml-auto text-[11px] text-muted-foreground">{events?.total ?? 0} total</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!events || events.events.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No operational events recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">When</TableHead>
                  <TableHead className="pr-6 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.events.slice(0, 10).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6">{eventTypeBadge(e.type)}</TableCell>
                    <TableCell className="text-xs">{e.source}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[280px]">{e.message}</TableCell>
                    <TableCell>
                      {e.resolved ? (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">resolved</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[11px] dark:text-amber-400">unresolved</Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</TableCell>
                    <TableCell className="pr-6 text-right">
                      {!e.resolved && (
                        <Button size="sm" variant="outline" disabled={resolving === e.id} onClick={() => resolveEvent(e.id)} className="h-7 text-[11px]">
                          {resolving === e.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                          Resolve
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Audit Log Search
            <span className="ml-auto text-[11px] text-muted-foreground">{audit?.total ?? 0} total</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input type="text" placeholder="Action (substring, e.g. refund, signin, workflow)" value={auditFilter.action} onChange={(e) => setAuditFilter((f) => ({ ...f, action: e.target.value }))} className="h-8 flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 text-xs" />
            <input type="text" placeholder="Resource (e.g. user, system_event)" value={auditFilter.resource} onChange={(e) => setAuditFilter((f) => ({ ...f, resource: e.target.value }))} className="h-8 flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 text-xs" />
            <Button size="sm" variant="outline" onClick={searchAudit}>
              <Search className="mr-1 h-3 w-3" aria-hidden="true" />
              Search
            </Button>
          </div>
          {!audit || audit.entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No audit entries match the current filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Resource ID</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="pr-6 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.entries.slice(0, 10).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6 text-xs font-medium">{e.action}</TableCell>
                    <TableCell className="text-[11px] capitalize text-muted-foreground">{e.resource || '—'}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground truncate max-w-[120px]">{e.resourceId || '—'}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{e.ipAddress || '—'}</TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
