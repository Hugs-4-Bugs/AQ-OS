'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Tab
//
// Separate automation surface (own sidebar tab — NOT part of the
// per-lead Workflows UI). The user configures:
//   name · MULTIPLE niches (existing discovery vocabulary) · geography
//   (reuses COUNTRY_OPTIONS/city) · the WorkflowDefinition Autopilot
//   must execute · schedule.
// Each run discovers NEW leads via the existing production discovery
// pipeline, deduplicates them server-side, and executes the linked
// workflow on each new lead. There is deliberately NO "run against a
// selected lead" flow here.
//
// Plan awareness: free/starter never reach this tab (PlanGate) and the
// server enforces the 3/7 active-slot limits authoritatively — the UI
// only mirrors what the API returns.
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import {
  Rocket, Plus, Play, Pause, Trash2, RefreshCw, Pencil, ChevronDown,
  Clock, CheckCircle2, XCircle, AlertTriangle, Layers, Globe2, Workflow as WorkflowIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { NICHE_OPTIONS, COUNTRY_OPTIONS } from '@/lib/types';

interface AutopilotListItem {
  id: string;
  name: string;
  status: string;
  niches: string[];
  geography: { country?: string; city?: string };
  workflowId: string;
  schedule: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  runCount: number;
  totalDiscovered: number;
  totalSaved: number;
  totalProcessed: number;
  totalExecutions: number;
  createdAt: string;
}

interface WorkflowOption {
  id: string;
  name: string;
  status: string;
}

interface AutopilotRun {
  id: string;
  status: string;
  trigger: string;
  discovered: number;
  saved: number;
  skippedDupes: number;
  processed: number;
  executionsCreated: number;
  // Phase 18 — ONE parent execution per run + per-lead outcome aggregates.
  executionId?: string | null;
  runKey?: string | null;
  leadsCompleted?: number;
  leadsFailed?: number;
  error: string | null;
  createdAt: string;
}

const SCHEDULES: Array<{ value: string; label: string }> = [
  { value: 'hourly', label: 'Every hour' },
  { value: 'every_6_hours', label: 'Every 6 hours' },
  { value: 'every_12_hours', label: 'Every 12 hours' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  RUNNING: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  PAUSED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  COMPLETED: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
  DISABLED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  CANCELLED: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  QUEUED: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_STYLES[status] || '')}>
      {status}
    </Badge>
  );
}

export default function AutopilotTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [autopilots, setAutopilots] = useState<AutopilotListItem[]>([]);
  const [entitlement, setEntitlement] = useState<{ limit: number; used: number; allowed: boolean }>({ limit: 0, used: 0, allowed: false });
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, AutopilotRun[]>>({});

  // create form state
  const [name, setName] = useState('');
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [country, setCountry] = useState<string>('none');
  const [city, setCity] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [schedule, setSchedule] = useState('daily');
  const [activateNow, setActivateNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/autopilot');
      if (!res.ok) throw new Error('Failed to load Autopilot configuration');
      const data = await res.json();
      setAutopilots(data.autopilots || []);
      setEntitlement(data.entitlement || { limit: 0, used: 0, allowed: false });
    } catch (e) {
      toast({
        title: 'Could not load Autopilot',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchState();
    // load the user's ACTIVE workflows for the selector
    fetch('/api/workflows?status=active&limit=50')
      .then((r) => (r.ok ? r.json() : { workflows: [] }))
      .then((d) => setWorkflows(d.workflows || []))
      .catch(() => setWorkflows([]));
  }, [fetchState]);

  const toggleNiche = (niche: string) => {
    setSelectedNiches((prev) =>
      prev.includes(niche) ? prev.filter((n) => n !== niche) : [...prev, niche]
    );
  };

  const resetForm = () => {
    setName('');
    setSelectedNiches([]);
    setCountry('none');
    setCity('');
    setWorkflowId('');
    setSchedule('daily');
    setActivateNow(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (selectedNiches.length === 0) {
      toast({ title: 'Select at least one niche', variant: 'destructive' });
      return;
    }
    if (!workflowId) {
      toast({ title: 'Select the workflow to execute', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          niches: selectedNiches,
          geography: {
            ...(country !== 'none' ? { country } : {}),
            ...(city.trim() ? { city: city.trim() } : {}),
          },
          workflowId,
          schedule,
          activate: activateNow,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create Autopilot');
      }
      toast({ title: 'Autopilot created', description: `${data.name} (${data.status})` });
      setCreateOpen(false);
      resetForm();
      fetchState();
    } catch (e) {
      toast({
        title: 'Create failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const patchStatus = async (id: string, status: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/autopilot/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Status change failed');
      toast({ title: `Autopilot is now ${data.status}` });
      fetchState();
    } catch (e) {
      toast({
        title: 'Status change failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRun = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/autopilot/${id}/run`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Run failed');
      if (data.duplicate) {
        toast({
          title: 'Run already in progress',
          description: 'This invocation was already processed — no duplicate run created.',
        });
      } else {
        toast({
          title: data.status === 'FAILED' ? 'Run finished with failures' : data.status === 'CANCELLED' ? 'Run cancelled' : 'Run completed',
          description: `Discovered ${data.discovered ?? 0} · imported ${data.saved ?? 0} · leads executed under ${data.executionsCreated ?? 0} parent workflow execution${(data.executionsCreated ?? 0) === 1 ? '' : 's'}`,
          variant: data.status === 'FAILED' ? 'destructive' : 'default',
        });
      }
      fetchState();
      if (expandedId === id) loadRuns(id);
    } catch (e) {
      toast({
        title: 'Run failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
      fetchState();
    } finally {
      setBusyId(null);
    }
  };

  // Phase 18 — cancel a QUEUED/RUNNING run (atomic for QUEUED; the parent
  // execution stops at its next step boundary for RUNNING runs).
  const handleCancelRun = async (autopilotId: string, runId: string) => {
    setBusyId(runId);
    try {
      const res = await fetch(`/api/autopilot/${autopilotId}/cancel-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Cancel failed');
      toast({ title: 'Run cancelled', description: 'The run will stop; per-lead results are settled honestly.' });
      loadRuns(autopilotId);
      fetchState();
    } catch (e) {
      toast({
        title: 'Cancel failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/autopilot/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      toast({ title: 'Autopilot deleted' });
      fetchState();
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const loadRuns = async (id: string) => {
    try {
      const res = await fetch(`/api/autopilot/${id}`);
      if (!res.ok) throw new Error('Failed to load run history');
      const data = await res.json();
      setRuns((prev) => ({ ...prev, [id]: data.runs || [] }));
    } catch (e) {
      toast({
        title: 'Run history unavailable',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!runs[id]) loadRuns(id);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Rocket className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Autopilot</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Automated niche-based acquisition: Autopilot discovers new leads in your selected
              niches via the existing discovery pipeline, deduplicates them, and executes your
              configured workflow on each new lead — on your schedule.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            Active slots: {entitlement.used} / {entitlement.limit}
          </Badge>
          <Button onClick={() => setCreateOpen(true)} disabled={!entitlement.allowed}>
            <Plus className="h-4 w-4 mr-1.5" /> New Autopilot
          </Button>
        </div>
      </div>

      {/* list */}
      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Loading Autopilot…</CardContent>
        </Card>
      ) : autopilots.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Rocket className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="font-medium">No Autopilot workflows yet</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Create one, pick the niches to target, link an active workflow, and Autopilot will
              discover and work new leads automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {autopilots.map((ap) => (
            <Card key={ap.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{ap.name}</CardTitle>
                      <StatusBadge status={ap.status} />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" /> {ap.niches.join(', ')}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Globe2 className="h-3.5 w-3.5" />
                        {[ap.geography?.city, ap.geography?.country].filter(Boolean).join(', ') || 'Worldwide'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {SCHEDULES.find((s) => s.value === ap.schedule)?.label || ap.schedule}
                        {ap.nextRunAt ? ` · next ${new Date(ap.nextRunAt).toLocaleString()}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(ap.status === 'ACTIVE') && (
                      <Button size="sm" variant="outline" disabled={busyId === ap.id} onClick={() => handleRun(ap.id)}>
                        {busyId === ap.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        <span className="ml-1">Run now</span>
                      </Button>
                    )}
                    {(ap.status === 'ACTIVE') && (
                      <Button size="sm" variant="outline" disabled={busyId === ap.id} onClick={() => patchStatus(ap.id, 'PAUSED')}>
                        <Pause className="h-4 w-4" />
                      </Button>
                    )}
                    {(ap.status === 'PAUSED' || ap.status === 'FAILED' || ap.status === 'DRAFT') && (
                      <Button size="sm" variant="outline" disabled={busyId === ap.id} onClick={() => patchStatus(ap.id, 'ACTIVE')}>
                        <Play className="h-4 w-4" />
                        <span className="ml-1">Activate</span>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busyId === ap.id} onClick={() => handleDelete(ap.id)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleExpand(ap.id)}>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', expandedId === ap.id && 'rotate-180')} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg border p-2.5">
                    <p className="text-xs text-muted-foreground">Discovered</p>
                    <p className="text-lg font-semibold">{ap.totalDiscovered}</p>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <p className="text-xs text-muted-foreground">New leads imported</p>
                    <p className="text-lg font-semibold">{ap.totalSaved}</p>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <p className="text-xs text-muted-foreground">Workflow runs</p>
                    <p className="text-lg font-semibold">{ap.totalExecutions}</p>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <p className="text-xs text-muted-foreground">Total runs</p>
                    <p className="text-lg font-semibold">{ap.runCount}</p>
                  </div>
                </div>
                {ap.workflowId && (
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <WorkflowIcon className="h-3.5 w-3.5" />
                    Executes: {workflows.find((w) => w.id === ap.workflowId)?.name || ap.workflowId}
                  </p>
                )}
                {ap.lastError && (
                  <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="break-words">{ap.lastError}</span>
                  </div>
                )}

                {expandedId === ap.id && (
                  <div className="rounded-lg border divide-y">
                    {(runs[ap.id] || []).length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground">No runs yet.</p>
                    ) : (
                      runs[ap.id].map((run) => (
                        <div key={run.id} className="p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-xs">
                          <span className="inline-flex items-center gap-1.5 font-medium w-24 shrink-0">
                            {run.status === 'COMPLETED' ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            ) : run.status === 'FAILED' ? (
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            ) : run.status === 'CANCELLED' ? (
                              <XCircle className="h-3.5 w-3.5 text-orange-400" />
                            ) : run.status === 'QUEUED' ? (
                              <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                            )}
                            {run.status}
                          </span>
                          <span className="text-muted-foreground w-20 shrink-0">{run.trigger}</span>
                          <span className="text-muted-foreground">
                            {new Date(run.createdAt).toLocaleString()}
                          </span>
                          <span>
                            found {run.discovered} · imported {run.saved} · dupes {run.skippedDupes} · processed {run.processed} · executions {run.executionsCreated}
                            {/* Phase 18 — ONE parent execution + per-lead outcomes */}
                            {(run.leadsCompleted ?? 0) + (run.leadsFailed ?? 0) > 0 && (
                              <span className="text-muted-foreground">
                                {' '}· leads completed {run.leadsCompleted ?? 0} / failed {run.leadsFailed ?? 0}
                              </span>
                            )}
                            {run.executionId && (
                              <span className="text-muted-foreground">{' '}· one parent execution</span>
                            )}
                          </span>
                          {(run.status === 'QUEUED' || run.status === 'RUNNING') && (
                            <button
                              type="button"
                              disabled={busyId === run.id}
                              onClick={() => handleCancelRun(ap.id, run.id)}
                              className="ml-auto rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-orange-400 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
                            >
                              {busyId === run.id ? 'Cancelling…' : 'Cancel run'}
                            </button>
                          )}
                          {run.error && (
                            <span className="text-red-400 break-words min-w-0">{run.error}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Autopilot</DialogTitle>
            <DialogDescription>
              Pick the niches to target and the workflow to execute. Discovery runs through the
              existing pipeline (≈20 leads per niche per run) and every new lead goes through your
              workflow automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ap-name">Name</Label>
              <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dental clinics — daily" />
            </div>
            <div className="space-y-1.5">
              <Label>Niches (select multiple)</Label>
              <div className="flex flex-wrap gap-1.5">
                {NICHE_OPTIONS.map((niche) => {
                  const active = selectedNiches.includes(niche);
                  return (
                    <button
                      key={niche}
                      type="button"
                      onClick={() => toggleNiche(niche)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-transparent text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {niche}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{selectedNiches.length} selected</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger><SelectValue placeholder="Worldwide" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Worldwide</SelectItem>
                    {COUNTRY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-city">City (optional)</Label>
                <Input id="ap-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Mumbai" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Workflow to execute</Label>
              <Select value={workflowId || undefined} onValueChange={setWorkflowId}>
                <SelectTrigger><SelectValue placeholder="Select an active workflow" /></SelectTrigger>
                <SelectContent>
                  {workflows.length === 0 && (
                    <SelectItem value="none-available" disabled>
                      No active workflows — create one in Workflows first
                    </SelectItem>
                  )}
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The workflow runs against each NEW discovered lead with your saved configuration —
                exactly as configured, nothing added or skipped.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Schedule</Label>
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCHEDULES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={activateNow} onCheckedChange={(v) => setActivateNow(v === true)} />
              Activate immediately (uses one active slot: {entitlement.used}/{entitlement.limit})
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : <Pencil className="h-4 w-4 mr-1.5" />}
              Create Autopilot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
