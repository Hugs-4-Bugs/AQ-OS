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
  Clock, CheckCircle2, XCircle, AlertTriangle, Layers, Globe2, Workflow as WorkflowIcon, Link2,
  Sparkles, Search, X,
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
import { NICHE_OPTIONS } from '@/lib/types';
// Phase 22 — canonical schedule display helpers (pure module — the
// server remains the authoritative validator/computer; these mirror it
// for presentation only).
import {
  parsePersistedSchedule,
  scheduleLabel,
  formatNextRunInScheduleTz,
  type ScheduleConfig,
} from '@/lib/autopilot/schedule';

interface AutopilotListItem {
  id: string;
  name: string;
  status: string;
  niches: string[];
  geography: { country?: string; city?: string; countries?: string[] };
  workflowId: string;
  // Phase 19 — linked-workflow health from the API: null = deleted/
  // unavailable; present-but-inactive = paused/draft/archived. Drives
  // the clear recoverable state + Relink action (config is kept).
  workflow: { id: string; name: string; status: string } | null;
  workflowEligible: boolean;
  // Phase 20 — persisted niche → Business Profile mapping (normalized
  // niche key → profile id).
  profileMappings?: Record<string, string>;
  schedule: string;
  // Phase 22 — canonical schedule config + human label from the API.
  scheduleConfig?: ScheduleConfig;
  scheduleLabel?: string;
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
  description: string | null;
  status: string;
  stepCount: number;
}

// Phase 20 — a saved custom niche from GET /api/autopilot/niches.
interface CustomNicheOption {
  id: string;
  name: string;
  nicheKey: string;
}

// Phase 20 — a saved Business Profile (for the niche → profile mapping).
interface ProfileOption {
  id: string;
  name: string;
  status: string;
  isDefault?: boolean;
}

// Phase 21 — one catalog country from GET /api/autopilot/countries
// (ISO 3166-1 alpha-2 code + canonical name, deterministic catalog order).
interface CountryCatalogItem {
  code: string;
  name: string;
}

/** Phase 21 — human label for a persisted geography (list rows):
 * Worldwide · "India" · "Mumbai, India + 2 more" · legacy single-country. */
function geographyLabelOf(geo: { country?: string; city?: string; countries?: string[] } | undefined): string {
  if (!geo) return 'Worldwide';
  const countries = Array.isArray(geo.countries) ? geo.countries.filter((c) => !!c && !!c.trim()) : [];
  const city = typeof geo.city === 'string' ? geo.city.trim() : '';
  if (countries.length > 0) {
    const head = [city, countries[0]].filter(Boolean).join(', ');
    return countries.length > 1 ? `${head} + ${countries.length - 1} more` : head;
  }
  if (geo.country && geo.country.trim()) return [city, geo.country.trim()].filter(Boolean).join(', ');
  return city || 'Worldwide';
}

/** Client-side mirror of the server's niche normalization (display only —
 * the server re-validates authoritatively on every submit). */
function nicheKeyOf(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
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

// Phase 22 — configurable scheduling UI state (create dialog + per-row
// editor). One shared datalist serves both timezone inputs; the server
// re-validates everything authoritatively.
interface ScheduleFormState {
  every: string;
  unit: 'HOURS' | 'DAYS' | 'WEEKS';
  startAt: string;
  timezone: string;
}

const TIMEZONES: string[] = (() => {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    return intl.supportedValuesOf?.('timeZone') ?? ['UTC'];
  } catch {
    return ['UTC'];
  }
})();

const DEFAULT_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

/** Effective schedule config of a list row (API value, tolerant fallback). */
function effectiveScheduleConfig(ap: AutopilotListItem): ScheduleConfig {
  return ap.scheduleConfig ?? parsePersistedSchedule(ap.schedule);
}

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
  const [entitlement, setEntitlement] = useState<{ limit: number; used: number; allowed: boolean; overLimit?: boolean }>({ limit: 0, used: 0, allowed: false });
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  // Phase 19 — selector data lifecycle: loading | ready | error (an API
  // failure is NOT silently shown as "no workflows" — it gets its own
  // state + retry so the user can recover).
  const [wfLoadState, setWfLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, AutopilotRun[]>>({});
  // Phase 19 — relink (recoverable state for deleted/disabled links).
  const [relinkTarget, setRelinkTarget] = useState<AutopilotListItem | null>(null);
  const [relinkWorkflowId, setRelinkWorkflowId] = useState('');
  const [relinkSubmitting, setRelinkSubmitting] = useState(false);

  // Phase 20 — saved custom niches + Business Profiles for the selector.
  const [customNiches, setCustomNiches] = useState<CustomNicheOption[]>([]);
  const [nichesLoadState, setNichesLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [addingNiche, setAddingNiche] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  // Phase 20 — selected niche → profile mapping (nicheKey → profileId).
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  // create form state
  const [name, setName] = useState('');
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  // Phase 21 — multi-country selection: Worldwide (default) or up to
  // maxCountrySelection individual countries. The catalog itself loads
  // from the canonical server route (never a hard-coded country list).
  const [worldwide, setWorldwide] = useState(true);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [countryQuery, setCountryQuery] = useState('');
  const [countryCatalog, setCountryCatalog] = useState<CountryCatalogItem[]>([]);
  const [countriesLoadState, setCountriesLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [maxCountrySelection, setMaxCountrySelection] = useState(30);
  const [city, setCity] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  // Phase 22 — configurable schedule (replaces the fixed 5-option
  // select): interval count + unit + optional anchored start time +
  // IANA timezone. The server validates/computes authoritatively.
  const [schedEvery, setSchedEvery] = useState('1');
  const [schedUnit, setSchedUnit] = useState<'HOURS' | 'DAYS' | 'WEEKS'>('DAYS');
  const [schedStartAt, setSchedStartAt] = useState('');
  const [schedTimezone, setSchedTimezone] = useState(DEFAULT_TIMEZONE);
  const [activateNow, setActivateNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Phase 22 — per-autopilot schedule editor state (keyed by id) + saving flag.
  const [editSched, setEditSched] = useState<Record<string, ScheduleFormState>>({});
  const [schedSavingId, setSchedSavingId] = useState<string | null>(null);

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

  // Phase 19 — eligible-workflow loader (server-side canonical rule:
  // owned + active; derived live so new workflows appear automatically).
  const fetchWorkflows = useCallback(async () => {
    setWfLoadState('loading');
    try {
      const res = await fetch('/api/autopilot/workflows');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWorkflows(data.workflows || []);
      setWfLoadState('ready');
    } catch {
      setWorkflows([]);
      setWfLoadState('error');
    }
  }, []);

  // Phase 20 — saved custom-niche loader (server-side canonical list,
  // user-scoped). Separate lifecycle states: an API failure is shown as
  // an error with retry, never as "no custom niches".
  const fetchCustomNiches = useCallback(async () => {
    setNichesLoadState('loading');
    try {
      const res = await fetch('/api/autopilot/niches');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCustomNiches(data.niches || []);
      setNichesLoadState('ready');
    } catch {
      setCustomNiches([]);
      setNichesLoadState('error');
    }
  }, []);

  // Phase 20 — Business Profiles for the niche → profile mapping rows
  // (active only; the mapping is optional per niche).
  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/business-profiles');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: ProfileOption[] = (data.profiles || []).filter(
        (p: ProfileOption) => p.status === 'active'
      );
      setProfiles(list);
    } catch {
      // Mapping stays usable-less but the form still works — profile
      // mapping is optional; a retry happens when the dialog reopens.
      setProfiles([]);
    }
  }, []);

  // Phase 21 — canonical country-catalog loader (server-served ISO
  // dataset + the server-enforced selection bound). Separate lifecycle
  // states: an API failure is shown as an error with retry, never as
  // "no countries".
  const fetchCountryCatalog = useCallback(async () => {
    setCountriesLoadState('loading');
    try {
      const res = await fetch('/api/autopilot/countries');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCountryCatalog(data.countries || []);
      if (typeof data.maxSelection === 'number' && data.maxSelection > 0) {
        setMaxCountrySelection(data.maxSelection);
      }
      setCountriesLoadState('ready');
    } catch {
      setCountryCatalog([]);
      setCountriesLoadState('error');
    }
  }, []);

  useEffect(() => {
    fetchState();
    fetchWorkflows();
    fetchCustomNiches();
    fetchProfiles();
    fetchCountryCatalog();
  }, [fetchState, fetchWorkflows, fetchCustomNiches, fetchProfiles, fetchCountryCatalog]);

  const toggleNiche = (niche: string) => {
    setSelectedNiches((prev) =>
      prev.includes(niche) ? prev.filter((n) => n !== niche) : [...prev, niche]
    );
  };

  // ── Phase 21 — country selection handlers (server re-validates all
  // of this authoritatively on submit; these mirror the same rules).
  const toggleCountry = (name: string) => {
    setSelectedCountries((prev) =>
      prev.includes(name)
        ? prev.filter((c) => c !== name)
        : prev.length >= maxCountrySelection
          ? prev
          : [...prev, name]
    );
    setWorldwide(false);
  };

  const selectWorldwide = () => {
    setSelectedCountries([]);
    setWorldwide(true);
  };

  const clearAllCountries = () => {
    setSelectedCountries([]);
    setWorldwide(true);
  };

  // Select every country in the CURRENT filtered view (merged with the
  // already-selected ones), bounded by the server cap — an explicit
  // toast when the cap truncates the selection (never silent loss).
  const selectAllFiltered = () => {
    const q = countryQuery.trim().toLowerCase();
    const visible = q
      ? countryCatalog.filter(
          (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q
        )
      : countryCatalog;
    setSelectedCountries((prev) => {
      const merged = Array.from(new Set([...prev, ...visible.map((c) => c.name)]));
      if (merged.length > maxCountrySelection) {
        toast({
          title: 'Country selection capped',
          description: `Only the first ${maxCountrySelection} countries were selected (from ${merged.length}) — use Worldwide for global discovery.`,
        });
        return merged.slice(0, maxCountrySelection);
      }
      return merged;
    });
    setWorldwide(false);
  };

  // Phase 21 — the visible (search-filtered) country list. Selected
  // countries that fall outside the current filter REMAIN selected
  // (visible as chips below) — filtering never loses a selection.
  const visibleCountries: CountryCatalogItem[] = (() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return countryCatalog;
    return countryCatalog.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q
    );
  })();

  // Phase 20 — save a custom niche server-side, then auto-select it.
  // Duplicate detection happens in the canonical niche service (any
  // casing/whitespace variation of an existing save is the SAME niche);
  // the warning is surfaced inline without losing the typed value.
  const handleAddCustomNiche = async () => {
    const typed = customInput.trim().replace(/\s+/g, ' ');
    if (!typed) {
      toast({ title: 'Type a niche name first', variant: 'destructive' });
      return;
    }
    setDuplicateWarning(null);
    setAddingNiche(true);
    try {
      const res = await fetch('/api/autopilot/niches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 || data.code === 'DUPLICATE' || data.code === 'PREDEFINED') {
        setDuplicateWarning(data.error || 'You already saved this niche');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to save custom niche');
      setCustomNiches((prev) =>
        [...prev, { id: data.id, name: data.name, nicheKey: data.nicheKey }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setSelectedNiches((prev) =>
        prev.includes(data.name) ? prev : [...prev, data.name]
      );
      setCustomInput('');
      toast({ title: 'Custom niche saved', description: data.name });
    } catch (e) {
      toast({
        title: 'Could not save custom niche',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAddingNiche(false);
    }
  };

  const resetForm = () => {
    setName('');
    setSelectedNiches([]);
    setWorldwide(true);
    setSelectedCountries([]);
    setCountryQuery('');
    setCity('');
    setWorkflowId('');
    setSchedEvery('1');
    setSchedUnit('DAYS');
    setSchedStartAt('');
    setSchedTimezone(DEFAULT_TIMEZONE);
    setActivateNow(true);
    setCustomInput('');
    setDuplicateWarning(null);
    setProfileMap({});
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
      // Phase 20 — only non-empty mapping entries are submitted; the
      // server re-validates every key (selected niche) and every value
      // (caller-owned active profile) authoritatively.
      const profileMappings: Record<string, string> = {};
      for (const niche of selectedNiches) {
        const mapped = profileMap[nicheKeyOf(niche)];
        if (mapped) profileMappings[nicheKeyOf(niche)] = mapped;
      }
      const res = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          niches: selectedNiches,
          geography: {
            // Phase 21 — multi-country selection (canonical names;
            // Worldwide = no countries key, identical to the legacy shape).
            ...(worldwide ? {} : { countries: selectedCountries }),
            ...(city.trim() ? { city: city.trim() } : {}),
          },
          workflowId,
          // Phase 22 — canonical schedule object (server-validated:
          // interval bounds, unit whitelist, IANA timezone, HH:mm anchor).
          schedule: {
            every: Number(schedEvery),
            unit: schedUnit,
            timezone: schedTimezone.trim() || 'UTC',
            startAt: schedStartAt || null,
          },
          activate: activateNow,
          ...(Object.keys(profileMappings).length > 0 ? { profileMappings } : {}),
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

  // Phase 19 — open the relink dialog for an autopilot whose linked
  // workflow is deleted/disabled (recoverable state: config preserved).
  const openRelink = (ap: AutopilotListItem) => {
    setRelinkTarget(ap);
    setRelinkWorkflowId('');
    if (wfLoadState !== 'ready') fetchWorkflows();
  };

  const handleRelink = async () => {
    if (!relinkTarget || !relinkWorkflowId) return;
    setRelinkSubmitting(true);
    try {
      const res = await fetch(`/api/autopilot/${relinkTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: relinkWorkflowId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Relink failed');
      toast({
        title: 'Workflow relinked',
        description: `${relinkTarget.name} now executes "${workflows.find((w) => w.id === relinkWorkflowId)?.name}"`,
      });
      setRelinkTarget(null);
      setRelinkWorkflowId('');
      fetchState();
    } catch (e) {
      toast({
        title: 'Relink failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRelinkSubmitting(false);
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

  const toggleExpand = (ap: AutopilotListItem) => {
    if (expandedId === ap.id) {
      setExpandedId(null);
    } else {
      setExpandedId(ap.id);
      if (!runs[ap.id]) loadRuns(ap.id);
      // Phase 22 — seed the schedule editor from the persisted config
      // (API-provided, tolerant fallback to a client-side parse).
      const cfg = effectiveScheduleConfig(ap);
      setEditSched((prev) => ({
        ...prev,
        [ap.id]: {
          every: String(cfg.every),
          unit: cfg.unit,
          startAt: cfg.startAt ?? '',
          timezone: cfg.timezone,
        },
      }));
    }
  };

  // Phase 22 — save a schedule edit (PATCH /api/autopilot/[id] with a
  // canonical schedule object) and/or flip the scheduling on/off switch
  // (`enabled`). Ownership is enforced server-side; a 400 surfaces the
  // server's validation message verbatim.
  const saveSchedule = async (ap: AutopilotListItem, enabledOverride?: boolean) => {
    const form = editSched[ap.id];
    if (!form) return;
    const every = Number(form.every);
    if (!Number.isInteger(every) || every < 1) {
      toast({
        title: 'Invalid interval',
        description: 'The interval count must be a whole number of 1 or more.',
        variant: 'destructive',
      });
      return;
    }
    if (!form.timezone.trim()) {
      toast({
        title: 'Timezone required',
        description: 'Pick a timezone (e.g. Asia/Kolkata, America/New_York, UTC).',
        variant: 'destructive',
      });
      return;
    }
    setSchedSavingId(ap.id);
    try {
      const res = await fetch(`/api/autopilot/${ap.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule: {
            every,
            unit: form.unit,
            timezone: form.timezone.trim(),
            startAt: form.startAt || null,
            enabled: enabledOverride ?? effectiveScheduleConfig(ap).enabled,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save schedule');
      toast({
        title:
          enabledOverride === false ? 'Schedule disabled' :
          enabledOverride === true ? 'Schedule enabled' :
          'Schedule updated',
        description:
          'Niches, geography, profiles and workflow are untouched — only the schedule changed. Scheduling itself costs 0 credits.',
      });
      fetchState();
    } catch (e) {
      toast({
        title: 'Schedule save failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSchedSavingId(null);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Phase 22 — one shared timezone datalist for the create dialog +
          per-row schedule editors (native datalist; server validates). */}
      <datalist id="autopilot-timezones">
        {TIMEZONES.map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
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

      {/* Phase 23 — entitlement / downgrade clarity banner.
          Server enforcement is authoritative (the scheduler + manual-run
          gates block ineligible plans regardless of UI state). This banner
          only surfaces the canonical state to the user: either Autopilot is
          not in their plan at all (Free/Standard) or a downgrade left them
          with more configurations than the new plan permits. Configurations
          are PRESERVED — never auto-deleted — and re-activate naturally on
          upgrade. */}
      {!entitlement.allowed && autopilots.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Your current plan no longer includes Autopilot
          </p>
          <p className="text-amber-800 dark:text-amber-200/80 mt-0.5">
            Your {autopilots.length} Autopilot configuration{autopilots.length === 1 ? '' : 's'} {autopilots.length === 1 ? 'is' : 'are'} preserved — the scheduler will not fire
            them on this plan. Upgrade to <strong>Pro</strong> or <strong>Elite</strong> to resume scheduled execution.
            No data is deleted; re-activation is automatic on upgrade.
          </p>
        </div>
      )}
      {entitlement.allowed && entitlement.overLimit && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Active Autopilot count exceeds your plan limit
          </p>
          <p className="text-amber-800 dark:text-amber-200/80 mt-0.5">
            You have {entitlement.used} active Autopilot{entitlement.used === 1 ? '' : 's'}; your plan allows {entitlement.limit}.
            Existing configurations are preserved (never deleted), but you cannot create or activate more until you
            pause some or upgrade. Scheduled execution continues for the slots your plan permits.
          </p>
        </div>
      )}

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
                        {geographyLabelOf(ap.geography)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {ap.scheduleLabel || scheduleLabel(ap.schedule)}
                        {ap.status === 'ACTIVE'
                          ? (ap.scheduleConfig?.enabled ?? true) && ap.nextRunAt
                            ? ` · next ${formatNextRunInScheduleTz(ap.nextRunAt, effectiveScheduleConfig(ap))}`
                            : (ap.scheduleConfig?.enabled ?? true)
                              ? ''
                              : ' · scheduling off'
                          : ''}
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
                    <Button size="sm" variant="ghost" onClick={() => toggleExpand(ap)}>
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
                {ap.workflowEligible && ap.workflow ? (
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <WorkflowIcon className="h-3.5 w-3.5" />
                    Executes: {ap.workflow.name}
                  </p>
                ) : (
                  <div className="flex items-start justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-500">
                    <span className="inline-flex items-start gap-1.5 break-words">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      {ap.workflow
                        ? `Linked workflow "${ap.workflow.name}" is ${ap.workflow.status} — reactivate it or relink to keep Autopilot running.`
                        : 'Linked workflow is no longer available (deleted) — relink a valid workflow to keep Autopilot running.'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 border-amber-500/40 text-amber-500 hover:text-amber-400"
                      disabled={busyId === ap.id}
                      onClick={() => openRelink(ap)}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      <span className="ml-1">Relink</span>
                    </Button>
                  </div>
                )}
                {ap.lastError && (
                  <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="break-words">{ap.lastError}</span>
                  </div>
                )}

                {/* ── Phase 22 — schedule editor (expanded row) ── */}
                {expandedId === ap.id && (
                  <div className="rounded-lg border p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> Schedule
                      </span>
                      <div className="flex items-center gap-2">
                        {(effectiveScheduleConfig(ap).enabled) ? (
                          <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/15">Scheduling on</Badge>
                        ) : (
                          <Badge variant="outline" className="text-zinc-400 border-zinc-500/30 bg-zinc-500/15">Scheduling off</Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={schedSavingId === ap.id}
                          onClick={() => saveSchedule(ap, !effectiveScheduleConfig(ap).enabled)}
                        >
                          {schedSavingId === ap.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                          <span className="ml-1">{effectiveScheduleConfig(ap).enabled ? 'Disable' : 'Enable'}</span>
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {ap.status === 'RUNNING'
                        ? 'A run is in progress — the next run is scheduled after it completes.'
                        : ap.status === 'ACTIVE'
                          ? effectiveScheduleConfig(ap).enabled
                            ? ap.nextRunAt
                              ? `Next run: ${formatNextRunInScheduleTz(ap.nextRunAt, effectiveScheduleConfig(ap))} (${effectiveScheduleConfig(ap).timezone})`
                              : 'Next run: being calculated on the next scheduler tick.'
                            : 'Scheduling is disabled — no scheduled runs. Manual "Run now" still works.'
                          : ap.status === 'PAUSED'
                            ? 'Paused — schedule configuration kept; resuming recalculates the next run.'
                            : ap.status === 'FAILED'
                              ? 'Last run failed — schedule configuration kept; re-activating recalculates the next run.'
                              : `Status ${ap.status} — schedule configuration kept.`}
                    </p>

                    {editSched[ap.id] && (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Every</Label>
                            <Input
                              type="number"
                              min={1}
                              value={editSched[ap.id].every}
                              onChange={(e) =>
                                setEditSched((prev) => ({
                                  ...prev,
                                  [ap.id]: { ...prev[ap.id], every: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Unit</Label>
                            <Select
                              value={editSched[ap.id].unit}
                              onValueChange={(v) =>
                                setEditSched((prev) => ({
                                  ...prev,
                                  [ap.id]: { ...prev[ap.id], unit: v as ScheduleFormState['unit'] },
                                }))
                              }
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="HOURS">hours</SelectItem>
                                <SelectItem value="DAYS">days</SelectItem>
                                <SelectItem value="WEEKS">weeks</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Start at (optional)</Label>
                            <Input
                              type="time"
                              value={editSched[ap.id].startAt}
                              onChange={(e) =>
                                setEditSched((prev) => ({
                                  ...prev,
                                  [ap.id]: { ...prev[ap.id], startAt: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Timezone</Label>
                            <Input
                              list="autopilot-timezones"
                              value={editSched[ap.id].timezone}
                              placeholder="Asia/Kolkata"
                              onChange={(e) =>
                                setEditSched((prev) => ({
                                  ...prev,
                                  [ap.id]: { ...prev[ap.id], timezone: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-muted-foreground max-w-md">
                            Anchored schedules fire at the start time in the chosen timezone (DST-safe).
                            The server validates the interval, timezone and start time — scheduling itself
                            costs 0 credits; each actual run bills the standard flat execution fee.
                          </p>
                          <Button size="sm" disabled={schedSavingId === ap.id} onClick={() => saveSchedule(ap)}>
                            {schedSavingId === ap.id ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null}
                            Save schedule
                          </Button>
                        </div>
                      </>
                    )}
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
      {/* Phase 19 — Relink dialog: recoverable state for an autopilot whose
          linked workflow was deleted/disabled. The configuration is preserved;
          only the workflow link changes (PATCH /api/autopilot/[id]). */}
      <Dialog open={!!relinkTarget} onOpenChange={(o) => !o && setRelinkTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Relink workflow</DialogTitle>
            <DialogDescription>
              Pick a new active workflow for “{relinkTarget?.name}”. Your Autopilot configuration
              (niches, geography, schedule) is kept — only the linked workflow changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {relinkTarget && !relinkTarget.workflowEligible && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-500">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="break-words">
                  {relinkTarget.workflow
                    ? `Current link “${relinkTarget.workflow.name}” is ${relinkTarget.workflow.status}.`
                    : 'Current linked workflow was deleted.'}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>New workflow</Label>
                {wfLoadState === 'error' && (
                  <button
                    type="button"
                    onClick={fetchWorkflows}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                )}
              </div>
              <Select value={relinkWorkflowId || undefined} onValueChange={setRelinkWorkflowId} disabled={wfLoadState === 'loading'}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      wfLoadState === 'loading' ? 'Loading your workflows…'
                      : wfLoadState === 'error' ? 'Could not load workflows'
                      : 'Select an active workflow'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {wfLoadState === 'loading' && (
                    <SelectItem value="rwf-loading" disabled>Loading your workflows…</SelectItem>
                  )}
                  {wfLoadState === 'error' && (
                    <SelectItem value="rwf-error" disabled>
                      Failed to load workflows — use Retry above
                    </SelectItem>
                  )}
                  {wfLoadState === 'ready' && workflows.length === 0 && (
                    <SelectItem value="rwf-none" disabled>
                      No active workflows — create one in Workflows first
                    </SelectItem>
                  )}
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRelinkTarget(null)} disabled={relinkSubmitting}>Cancel</Button>
            <Button onClick={handleRelink} disabled={relinkSubmitting || !relinkWorkflowId}>
              {relinkSubmitting ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : <Link2 className="h-4 w-4 mr-1.5" />}
              Save link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {/* Phase 20 — saved custom niches (user-scoped, persistent).
                  Clicking toggles selection; deselecting NEVER deletes the
                  saved niche. */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {nichesLoadState === 'loading' && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Loading your custom niches…
                  </span>
                )}
                {nichesLoadState === 'error' && (
                  <span className="text-xs text-amber-500 inline-flex items-center gap-1">
                    Could not load custom niches.
                    <button
                      type="button"
                      onClick={fetchCustomNiches}
                      className="text-primary hover:underline"
                    >
                      Retry
                    </button>
                  </span>
                )}
                {nichesLoadState === 'ready' && customNiches.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No saved custom niches yet — add one below (e.g. “AI SaaS companies”).
                  </span>
                )}
                {nichesLoadState === 'ready' && customNiches.map((nicheOpt) => {
                  const active = selectedNiches.includes(nicheOpt.name);
                  return (
                    <button
                      key={nicheOpt.id}
                      type="button"
                      onClick={() => toggleNiche(nicheOpt.name)}
                      title="Toggle selection — deselecting never deletes the saved niche"
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors inline-flex items-center gap-1',
                        active
                          ? 'bg-violet-500/20 text-violet-300 border-violet-500/50'
                          : 'bg-transparent text-muted-foreground border-dashed hover:bg-muted'
                      )}
                    >
                      <Sparkles className="h-3 w-3" />
                      {nicheOpt.name}
                    </button>
                  );
                })}
              </div>
              {/* Phase 20 — custom niche input + save. Duplicates (any
                  casing/whitespace variation) are prevented server-side and
                  surfaced as an inline warning. */}
              <div className="flex gap-1.5 pt-1">
                <Input
                  value={customInput}
                  onChange={(e) => {
                    setCustomInput(e.target.value);
                    setDuplicateWarning(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomNiche();
                    }
                  }}
                  placeholder="Add a custom niche (e.g. Solar installation companies)"
                  className="h-8 text-xs"
                  maxLength={200}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={handleAddCustomNiche}
                  disabled={addingNiche || !customInput.trim()}
                >
                  {addingNiche ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Save
                </Button>
              </div>
              {duplicateWarning && (
                <p className="text-xs text-amber-500 inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {duplicateWarning}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {selectedNiches.length} selected (max 10)
              </p>
            </div>
            {/* Phase 20 — per-niche Business Profile mapping (optional).
                Each selected niche can use a specific saved profile;
                unmapped niches use the workflow's profile or your default. */}
            {selectedNiches.length > 0 && profiles.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Profile per niche (optional — defaults to the workflow's profile)
                </Label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {selectedNiches.map((niche) => {
                    const key = nicheKeyOf(niche);
                    const mapped = profileMap[key] || 'auto';
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground truncate w-32 shrink-0">
                          {niche}
                        </span>
                        <Select
                          value={mapped}
                          onValueChange={(v) =>
                            setProfileMap((prev) => {
                              const next = { ...prev };
                              if (v === 'auto') delete next[key];
                              else next[key] = v;
                              return next;
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto" className="text-xs">
                              Auto (workflow / default)
                            </SelectItem>
                            {profiles.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.name}
                                {p.isDefault ? ' (default)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Phase 21 — multi-country selector: Worldwide (special,
                visually distinct) OR a searchable, multi-selectable
                country list with Select All / Clear All, count, and
                catalog loading/error/retry states. */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Target countries</Label>
                <span className="text-xs text-muted-foreground">
                  {worldwide
                    ? 'Worldwide — global discovery'
                    : `${selectedCountries.length} of ${maxCountrySelection} selected`}
                </span>
              </div>

              {/* Worldwide — the special global selection */}
              <button
                type="button"
                onClick={selectWorldwide}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border p-3 text-left transition-colors',
                  worldwide
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-border hover:border-emerald-500/30'
                )}
              >
                <Globe2 className={cn('h-4 w-4 shrink-0', worldwide ? 'text-emerald-400' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Worldwide</p>
                  <p className="text-xs text-muted-foreground">Global discovery — no country constraint</p>
                </div>
                {worldwide && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
              </button>

              {/* Individual countries — searchable checkbox list */}
              <div className="rounded-lg border">
                <div className="flex items-center gap-2 border-b p-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    value={countryQuery}
                    onChange={(e) => setCountryQuery(e.target.value)}
                    placeholder={`Search ${countryCatalog.length || '…'} countries…`}
                    className="h-7 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-xs"
                  />
                </div>
                {countriesLoadState === 'loading' ? (
                  <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading country catalog…
                  </div>
                ) : countriesLoadState === 'error' ? (
                  <div className="space-y-2 p-4 text-center">
                    <p className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      Could not load the country catalog
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={fetchCountryCatalog}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" /> Retry
                    </Button>
                  </div>
                ) : visibleCountries.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No countries match “{countryQuery}”
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between border-b px-3 py-1.5">
                      <span className="text-xs text-muted-foreground">
                        {visibleCountries.length} of {countryCatalog.length} shown
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={selectAllFiltered}
                        >
                          Select all
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={clearAllCountries}
                          disabled={selectedCountries.length === 0}
                        >
                          Clear all
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto p-1">
                      {visibleCountries.map((c) => {
                        const checked = selectedCountries.includes(c.name);
                        const atCap =
                          !worldwide &&
                          !checked &&
                          selectedCountries.length >= maxCountrySelection;
                        return (
                          <label
                            key={c.code}
                            className={cn(
                              'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                              atCap ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent'
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={atCap}
                              onCheckedChange={() => toggleCountry(c.name)}
                            />
                            <span className="flex-1 truncate">{c.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Selected-country chips (persisted verbatim on submit) */}
              {!worldwide && selectedCountries.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedCountries.map((name) => (
                    <Badge key={name} variant="outline" className="gap-1 pr-1">
                      {name}
                      <button
                        type="button"
                        aria-label={`Remove ${name}`}
                        onClick={() => toggleCountry(name)}
                        className="rounded-full p-0.5 hover:bg-accent"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {!worldwide && selectedCountries.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No individual countries selected — this run will target Worldwide.
                </p>
              )}
              {!worldwide && selectedCountries.length >= maxCountrySelection && (
                <p className="inline-flex items-center gap-1 text-xs text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Maximum {maxCountrySelection} countries — use Worldwide for global discovery.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-city">City (optional — applied to every selected country)</Label>
              <Input id="ap-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Mumbai" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Workflow to execute</Label>
                {wfLoadState === 'error' && (
                  <button
                    type="button"
                    onClick={fetchWorkflows}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                )}
              </div>
              <Select value={workflowId || undefined} onValueChange={setWorkflowId} disabled={wfLoadState === 'loading'}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      wfLoadState === 'loading' ? 'Loading your workflows…'
                      : wfLoadState === 'error' ? 'Could not load workflows'
                      : 'Select an active workflow'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {wfLoadState === 'loading' && (
                    <SelectItem value="wf-loading" disabled>Loading your workflows…</SelectItem>
                  )}
                  {wfLoadState === 'error' && (
                    <SelectItem value="wf-error" disabled>
                      Failed to load workflows — use Retry above
                    </SelectItem>
                  )}
                  {wfLoadState === 'ready' && workflows.length === 0 && (
                    <SelectItem value="none-available" disabled>
                      No active workflows — create one in Workflows first
                    </SelectItem>
                  )}
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <span className="flex flex-col">
                        <span>{w.name}</span>
                        {w.description && (
                          <span className="text-[11px] leading-tight text-muted-foreground line-clamp-1">
                            {w.description.length > 70 ? `${w.description.slice(0, 70)}…` : w.description}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only your active workflows are eligible — the list updates automatically as you
                create or activate workflows. The selected workflow runs against each NEW
                discovered lead with your saved configuration — exactly as configured, nothing
                added or skipped.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Schedule</Label>
              {/* Phase 22 — configurable schedule: interval count + unit +
                  optional anchored start time + IANA timezone (replaces the
                  fixed 5-option select). Server validates + computes the
                  next run authoritatively. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">Every</span>
                  <Input
                    type="number"
                    min={1}
                    value={schedEvery}
                    onChange={(e) => setSchedEvery(e.target.value)}
                    aria-label="Interval count"
                  />
                </div>
                <Select value={schedUnit} onValueChange={(v) => setSchedUnit(v as ScheduleFormState['unit'])}>
                  <SelectTrigger aria-label="Interval unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOURS">hours</SelectItem>
                    <SelectItem value="DAYS">days</SelectItem>
                    <SelectItem value="WEEKS">weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Start at (optional)</Label>
                  <Input
                    type="time"
                    value={schedStartAt}
                    onChange={(e) => setSchedStartAt(e.target.value)}
                    aria-label="Start time"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Timezone</Label>
                  <Input
                    list="autopilot-timezones"
                    value={schedTimezone}
                    placeholder="Asia/Kolkata"
                    onChange={(e) => setSchedTimezone(e.target.value)}
                    aria-label="Schedule timezone"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                With a start time, runs fire at that local time in the chosen timezone (DST-safe);
                without one, the interval runs from activation. The server validates the interval,
                timezone and start time — scheduling itself costs 0 credits.
              </p>
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
