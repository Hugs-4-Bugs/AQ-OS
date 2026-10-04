'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Sparkles,
  Plus,
  Loader2,
  MapPin,
  Tag,
  Building2,
  Zap,
  FileUp,
  Clock,
  Eye,
  Trash2,
  TrendingUp,
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ExternalLink,
  Layers,
  PencilLine,
  SlidersHorizontal,
  Users,
  ShieldCheck,
  Mail,
  Phone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { COUNTRIES } from '@/lib/countries';
import { pickResumableJobFromStorage } from '@/lib/discovery-resume';
import { fetchLeads, updateLead } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { Lead, LeadStage } from '@/lib/types';
import LeadImportDialog from './lead-import-dialog';
import { toast } from 'sonner';

// Resume-toast dedup across remounts within the same page session
// (StrictMode double-mount safe; module scope survives tab switches).
const resumeToastsShown = new Set<string>();

// ─── Discovery Source Config ─────────────────────────────
const DISCOVERY_SOURCES = [
  { value: 'all', label: 'All Sources', icon: Layers, color: 'text-primary' },
  { value: 'ai_search', label: 'AI Search', icon: Sparkles, color: 'text-violet-500' },
  { value: 'google_maps', label: 'Google Maps', icon: MapPin, color: 'text-red-500' },
  { value: 'google_business', label: 'Google Business', icon: Globe, color: 'text-blue-500' },
  { value: 'justdial', label: 'JustDial', icon: Search, color: 'text-yellow-500' },
  { value: 'indiamart', label: 'IndiaMart', icon: Building2, color: 'text-orange-500' },
  { value: 'yelp', label: 'Yelp', icon: Star, color: 'text-red-400' },
  { value: 'yellow_pages', label: 'Yellow Pages', icon: Search, color: 'text-yellow-600' },
  { value: 'sulekha', label: 'Sulekha', icon: Globe, color: 'text-teal-500' },
  { value: 'linkedin', label: 'LinkedIn', icon: Building2, color: 'text-blue-600' },
  { value: 'instagram', label: 'Instagram', icon: Globe, color: 'text-pink-500' },
  { value: 'facebook', label: 'Facebook', icon: Globe, color: 'text-blue-500' },
] as const;

// Sources fanned out when "All Sources" is selected (must match server-side ALL_DISCOVERY_SOURCES)
const ALL_SOURCES_COUNT = 7;

function Star(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// ─── Discovery Source Status (real-time from server env) ─────
interface DiscoverySourceStatus {
  id: string;
  label: string;
  type: 'ai' | 'api' | 'scrape';
  description: string;
  status: 'connected' | 'not_configured' | 'error';
  configMessage: string;
  requiredEnvVars: Array<{ name: string; label: string; required: boolean }>;
  optionalEnvVars: Array<{ name: string; label: string; required: boolean }>;
  signupUrl: string | null;
  notes: string | null;
  noSetupRequired: boolean;
}

// ─── Discovery Job Types ─────────────────────────────────
interface DiscoveryJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  source: string;
  niche: string;
  country: string;
  city?: string;
  totalFound: number;
  leadsAdded: number;
  duplicatesSkipped: number;
  errors: number;
  /** Candidates rejected by the server-side hard-criteria validator. */
  filteredOut?: number;
  resultData?: Array<{
    businessName: string;
    ownerName?: string;
    niche?: string;
    city?: string;
    country?: string;
    email?: string;
    phone?: string;
    website?: string;
    rating?: number;
    employeeCount?: number | null;
    employeeRange?: string | null;
  }>;
  createdAt: string;
  completedAt?: string;
  message?: string;
  errorMessage?: string;
}

/** The status API returns imported/duplicates/failed — normalize once so
 *  the UI never renders "undefined leads found" after completion. */
function normalizeJobFromApi(raw: Partial<DiscoveryJob> & Record<string, unknown>): DiscoveryJob {
  return {
    ...(raw as unknown as DiscoveryJob),
    leadsAdded: (raw.leadsAdded as number | undefined) ?? (raw.imported as number | undefined) ?? 0,
    duplicatesSkipped: (raw.duplicatesSkipped as number | undefined) ?? (raw.duplicates as number | undefined) ?? 0,
    errors: (raw.errors as number | undefined) ?? (raw.failed as number | undefined) ?? 0,
    filteredOut: (raw.filteredOut as number | undefined) ?? 0,
  };
}

// ─── AI Chat Mode Types ─────────────────────────────────
interface ParsedIntent {
  niche: string;
  location: string;
  country: string;
  city: string;
  /**
   * Explicitly requested lead count, or null when the user did not state
   * one. Mirrors the parser contract: no invented default — the job then
   * runs until the provider/data limits are exhausted instead of stopping
   * at 20.
   */
  count: number | null;
  requirements: string;
  /** Structured HARD criteria — enforced server-side after discovery. */
  criteria?: {
    employeeMin: number | null;
    employeeMax: number | null;
    exactEmployeeCount: number | null;
    website: 'required' | 'absent' | 'any';
    excludeTypes: string[];
    growthSignals: boolean;
    hiringSignals: boolean;
  };
}

interface DiscoveryVars {
  niche: string;
  country: string;
  city?: string;
  source: string;
  maxResults?: number;
  requirements?: string;
  criteria?: ParsedIntent['criteria'];
}

/** Human label for the parsed hard criteria (badges + honest notices). */
function describeCriteria(criteria?: ParsedIntent['criteria']): string {
  if (!criteria) return '';
  const parts: string[] = [];
  if (criteria.exactEmployeeCount != null) parts.push(`exactly ${criteria.exactEmployeeCount} employees`);
  else if (criteria.employeeMin != null && criteria.employeeMax != null) parts.push(`${criteria.employeeMin}–${criteria.employeeMax} employees`);
  else if (criteria.employeeMin != null) parts.push(`≥ ${criteria.employeeMin} employees`);
  else if (criteria.employeeMax != null) parts.push(`≤ ${criteria.employeeMax} employees`);
  if (criteria.website === 'required') parts.push('website required');
  if (criteria.website === 'absent') parts.push('no website');
  if (criteria.excludeTypes?.length) parts.push(`excludes: ${criteria.excludeTypes.join(', ')}`);
  return parts.join(' · ');
}

// ─── Helper Functions ────────────────────────────────────
function getScoreBorderColor(score: number): string {
  if (score >= 70) return 'border-t-emerald-500';
  if (score >= 40) return 'border-t-amber-500';
  return 'border-t-red-500';
}

function getScoreBarClass(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/25',
  running: 'bg-blue-500/15 text-blue-500 border-blue-500/25',
  completed: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  failed: 'bg-red-500/15 text-red-500 border-red-500/25',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

// ─── Recent Discovery Jobs List ──────────────────────────
function DiscoveryJobsList({ onJobClick }: { onJobClick: (job: DiscoveryJob) => void }) {
  const [jobs, setJobs] = useState<DiscoveryJob[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('acquisitionos_discovery_jobs');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const loading = false;

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) return null;

  return (
    <div className="space-y-2">
      {jobs.slice(0, 5).map((job) => {
        const StatusIcon = STATUS_ICONS[job.status] || Clock;
        return (
          <motion.button
            key={job.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => onJobClick(job)}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-primary/20 transition-colors text-left"
          >
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
              <StatusIcon className={cn('h-4 w-4', job.status === 'running' && 'animate-spin', STATUS_STYLES[job.status]?.split(' ')[1])} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">
                {job.niche} · {job.country}{job.city ? ` · ${job.city}` : ''}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={cn('text-[9px] border', STATUS_STYLES[job.status])}>
                  {job.status}
                </Badge>
                {job.status === 'completed' && (
                  <span className="text-[10px] text-muted-foreground">
                    {job.leadsAdded} leads found
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] text-muted-foreground">
                {formatRelativeTime(job.createdAt)}
              </p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Discovery Job Progress Card ─────────────────────────
function DiscoveryJobProgress({
  job,
  onComplete,
}: {
  job: DiscoveryJob;
  onComplete: (job: DiscoveryJob) => void;
}) {
  const [currentJob, setCurrentJob] = useState<DiscoveryJob>(job);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Consecutive status-poll failure cutoff — never poll a dead/404 job forever.
  // The job itself continues server-side; the UI says so instead of spinning.
  const pollFailuresRef = useRef(0);
  const [pollLost, setPollLost] = useState(false);
  const MAX_POLL_FAILURES = 5;

  useEffect(() => {
    if (currentJob.status !== 'running' && currentJob.status !== 'pending') return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/leads/discover/status/${currentJob.id}`);
        if (res.ok) {
          pollFailuresRef.current = 0;
          setPollLost(false);
          const data = await res.json();
          const updatedJob = normalizeJobFromApi(data.job);
          setCurrentJob(updatedJob);

          if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
            if (intervalRef.current) clearInterval(intervalRef.current);
            onComplete(updatedJob);

            // Update localStorage
            try {
              const stored = localStorage.getItem('acquisitionos_discovery_jobs');
              const jobs: DiscoveryJob[] = stored ? JSON.parse(stored) : [];
              const idx = jobs.findIndex(j => j.id === updatedJob.id);
              if (idx >= 0) jobs[idx] = updatedJob;
              else jobs.unshift(updatedJob);
              localStorage.setItem('acquisitionos_discovery_jobs', JSON.stringify(jobs.slice(0, 20)));
            } catch {}
          }
        } else {
          pollFailuresRef.current += 1;
        }
      } catch {
        pollFailuresRef.current += 1;
      }
      if (pollFailuresRef.current >= MAX_POLL_FAILURES && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setPollLost(true);
      }
    }, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentJob.id, currentJob.status, onComplete]);

  const progress = currentJob.status === 'completed' ? 100 :
    currentJob.status === 'running' ? 60 :
    currentJob.status === 'pending' ? 10 : 0;

  const progressSteps = [
    { label: 'Connecting', done: progress >= 10 },
    { label: 'Searching', done: progress >= 40 },
    { label: 'Analyzing', done: progress >= 60 },
    { label: 'Complete', done: progress >= 100 },
  ];

  return (
    <Card className="border-primary/20 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentJob.status === 'running' || currentJob.status === 'pending' ? (
              <div className="relative">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <div className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
              </div>
            ) : currentJob.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm font-medium">
              {currentJob.status === 'pending' ? 'Queuing discovery...' :
                currentJob.status === 'running' ? 'Discovering leads...' :
                currentJob.status === 'completed' ? 'Discovery complete!' :
                'Discovery failed'}
            </span>
          </div>
          <Badge variant="outline" className={cn('text-[10px] border', STATUS_STYLES[currentJob.status])}>
            {currentJob.status}
          </Badge>
        </div>
        <Progress value={progress} className="h-2" />
        {pollLost && currentJob.status !== 'completed' && currentJob.status !== 'failed' && (
          <p className="text-[10px] text-amber-600">
            Lost connection while checking progress — the discovery continues server-side. Reopen this tab or refresh to see results; you will not be charged again.
          </p>
        )}
        {/* Progress steps */}
        <div className="flex items-center gap-1">
          {progressSteps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-1 flex-1">
              <div className={cn(
                'h-1.5 w-1.5 rounded-full shrink-0 transition-colors',
                step.done ? 'bg-primary' : 'bg-muted-foreground/20'
              )} />
              <span className={cn(
                'text-[9px] truncate transition-colors',
                step.done ? 'text-primary font-medium' : 'text-muted-foreground/50'
              )}>{step.label}</span>
              {i < progressSteps.length - 1 && (
                <div className={cn('flex-1 h-px', step.done ? 'bg-primary/40' : 'bg-muted-foreground/10')} />
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{currentJob.niche} · {currentJob.country}{currentJob.city ? ` · ${currentJob.city}` : ''}</span>
          {currentJob.status === 'completed' && (
            <span className="text-emerald-500 font-medium">
              {currentJob.leadsAdded} verified lead{currentJob.leadsAdded === 1 ? '' : 's'} found
              {currentJob.filteredOut ? ` · ${currentJob.filteredOut} rejected by hard filters` : ''}
            </span>
          )}
          {currentJob.status === 'failed' && (currentJob.errorMessage || currentJob.message) && (
            <span className="text-red-500 truncate max-w-[280px]" title={currentJob.errorMessage || currentJob.message}>
              {currentJob.errorMessage || currentJob.message}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Discovered Lead Card ────────────────────────────────
function DiscoveredLeadCard({
  lead,
  onAddToPipeline,
  onViewDetails,
  isAdding,
  isAdded,
}: {
  lead: Lead;
  onAddToPipeline: (id: string) => void;
  onViewDetails: (id: string) => void;
  isAdding: boolean;
  isAdded: boolean;
}) {
  const scoreBorder = getScoreBorderColor(lead.conversionScore);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <Card className={cn('card-glow card-shine border-t-4 hover-lift transition-all cursor-pointer group', scoreBorder)}
        onClick={() => onViewDetails(lead.id)}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary font-bold text-sm shrink-0 group-hover:bg-primary/20 transition-colors">
              {lead.businessName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{lead.businessName}</h4>
              {lead.ownerName && (
                <p className="text-xs text-muted-foreground mt-0.5">{lead.ownerName}</p>
              )}
            </div>
            {lead.source && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {lead.source}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {[lead.city, lead.country].filter(Boolean).join(', ') || 'Unknown location'}
          </div>

          {/* CONTACT AVAILABILITY — honest, per-field badges from REAL stored
              data only. A lead without an email is never discarded: it stays
              fully usable for phone-based or manual follow-up. Nothing here
              is inferred or fabricated: a channel is shown ONLY when the
              corresponding field was actually returned by the source.
              verificationStatus distinguishes verified from unverified
              contact details (single-source listings are unverified). */}
          <div className="flex flex-wrap items-center gap-1.5">
            {lead.email ? (
              <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400">
                <Mail className="h-3 w-3" /> Email
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <XCircle className="h-3 w-3" /> No email
              </Badge>
            )}
            {lead.phone && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400">
                <Phone className="h-3 w-3" /> Phone
              </Badge>
            )}
            {lead.website && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400">
                <Globe className="h-3 w-3" /> Website
              </Badge>
            )}
            {(!lead.email && !lead.phone) && (
              <span className="text-[10px] text-muted-foreground">
                Manual / research follow-up required
              </span>
            )}
            {lead.verificationStatus === 'unverified' && (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <AlertCircle className="h-3 w-3" /> Unverified
              </Badge>
            )}
          </div>

          {/* ACTUAL employee data from the provider — never the requested range.
              A range (e.g. "51-100") is shown honestly as a provider range. */}
          {(typeof lead.employeeCount === 'number' || lead.employeeRange) && (
            <div className="flex items-center gap-2 text-xs">
              <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground">
                Employees: {typeof lead.employeeCount === 'number'
                  ? lead.employeeCount.toLocaleString()
                  : `${lead.employeeRange} (provider range)`}
              </span>
            </div>
          )}

          {lead.rating && (
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
              <span className="text-xs font-medium">{lead.rating.toFixed(1)}</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Conversion</span>
                <span className="font-mono font-medium text-emerald-500">{lead.conversionScore}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className={cn('rounded-full h-1.5 transition-all', getScoreBarClass(lead.conversionScore))}
                  style={{ width: `${lead.conversionScore}%` }}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 gap-1 active:scale-95 transition-all min-h-[36px]"
              disabled={isAdded || isAdding}
              onClick={(e) => {
                e.stopPropagation();
                onAddToPipeline(lead.id);
              }}
            >
              {isAdding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isAdded ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {isAdded ? 'In Pipeline' : 'Add to Pipeline'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(lead.id);
              }}
              className="gap-1 border-primary/20 hover:bg-primary/10 active:scale-95 transition-all min-h-[36px]"
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Discover Tab Component ─────────────────────────
export default function DiscoverTab() {
  const queryClient = useQueryClient();
  const { setSelectedLeadId, setActiveTab } = useAppStore();

  // Fetch real-time source configuration status (drives dropdown hints + config banner)
  const { data: sourceStatusData } = useQuery<DiscoverySourceStatus[]>({
    queryKey: ['discovery-source-status'],
    queryFn: async () => {
      const res = await fetch('/api/discovery/sources');
      if (!res.ok) throw new Error('Failed to load source status');
      const data = await res.json();
      return data.sources as DiscoverySourceStatus[];
    },
    staleTime: 60_000,
  });
  const sourceStatuses = sourceStatusData ?? [];
  const sourceStatusById = new Map(sourceStatuses.map((s) => [s.id, s]));

  // Form state
  const [source, setSource] = useState<string>('ai_search');
  const [niche, setNiche] = useState('');
  const [country, setCountry] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [city, setCity] = useState('');

  // ── Context / campaign selector (Discover page context feature) ────
  // 'none' = no override. Applies to BOTH filter and AI search modes;
  // resolved + ownership-checked server-side on /api/leads/discover.
  // Selection persists across visits (localStorage).
  const [contextMode, setContextMode] = useState<'none' | 'campaign' | 'business' | 'profile'>('none');
  const [contextCampaignId, setContextCampaignId] = useState<string>('');
  const [contextProfileId, setContextProfileId] = useState<string>('');
  useEffect(() => {
    try {
      const stored = localStorage.getItem('acquisitionos_discovery_context');
      if (stored) {
        const parsed = JSON.parse(stored) as { mode?: string; campaignId?: string; profileId?: string };
        if (parsed.mode === 'campaign' || parsed.mode === 'business' || parsed.mode === 'profile' || parsed.mode === 'none') {
          setContextMode(parsed.mode);
          if (parsed.campaignId) setContextCampaignId(parsed.campaignId);
          if (parsed.profileId) setContextProfileId(parsed.profileId);
        }
      }
    } catch {
      // Corrupted stored selection → fall back to 'none'.
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        'acquisitionos_discovery_context',
        JSON.stringify({ mode: contextMode, campaignId: contextCampaignId, profileId: contextProfileId })
      );
    } catch {}
  }, [contextMode, contextCampaignId, contextProfileId]);
  // Business Profiles for the context selector (Settings → Business Profiles).
  const { data: contextProfiles } = useQuery({
    queryKey: ['discovery-context-profiles'],
    queryFn: async () => {
      const res = await fetch('/api/business-profiles');
      if (!res.ok) return [] as Array<{ id: string; name: string; status: string }>;
      const data = await res.json();
      return (Array.isArray(data.profiles) ? data.profiles : []) as Array<{
        id: string;
        name: string;
        status: string;
      }>;
    },
    staleTime: 60_000,
  });
  const { data: contextCampaigns } = useQuery({
    queryKey: ['discovery-context-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/autonomous/campaign?limit=50');
      if (!res.ok) return [] as Array<{ id: string; niche: string | null; status: string }>;
      const data = await res.json();
      return (Array.isArray(data.campaigns) ? data.campaigns : []) as Array<{
        id: string;
        niche: string | null;
        status: string;
      }>;
    },
    staleTime: 60_000,
  });
  const selectedContextCampaign = (contextCampaigns ?? []).find((c) => c.id === contextCampaignId);

  // Search mode: classic filters or AI chat
  const [searchMode, setSearchMode] = useState<'filters' | 'ai'>('filters');
  const [aiQuery, setAiQuery] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null);

  // "All Sources" credit-cost confirmation
  const [allSourcesConfirmOpen, setAllSourcesConfirmOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<DiscoveryVars | undefined>(undefined);

  // The exact config message for the currently selected source (empty when usable).
  // Unconfigured sources are shown in the dropdown but can NEVER run — no fake data.
  const selectedSourceStatus =
    source !== 'all' ? sourceStatusById.get(source) : undefined;
  const selectedSourceBlocked =
    !!selectedSourceStatus && selectedSourceStatus.status !== 'connected';
  const selectedSourceConfigMessage = selectedSourceBlocked
    ? selectedSourceStatus!.configMessage ||
      `${selectedSourceStatus!.label} requires API configuration. Go to Settings → Integrations to connect this source.`
    : '';

  // Jobs state
  const [activeJob, setActiveJob] = useState<DiscoveryJob | null>(null);
  const [discoveredLeads, setDiscoveredLeads] = useState<Lead[]>([]);
  // Honest verified-matches notice — shown when hard filters returned fewer
  // verified companies than requested. Never padded with unverified leads.
  const [honestMatchNotice, setHonestMatchNotice] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [pipelineAddingIds, setPipelineAddingIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  // Discovery history
  const [discoveryHistory, setDiscoveryHistory] = useState<Array<{
    niche: string; country: string; city: string; resultCount: number; timestamp: number;
  }>>([]);

  // Load history
  useEffect(() => {
    try {
      const stored = localStorage.getItem('acquisitionos_discovery_history');
      if (stored) setDiscoveryHistory(JSON.parse(stored));
    } catch {}
  }, []);

  // ── Resume-on-navigation (spec: 1 operation = 1 job = 1 billing event) ──
  // A tab switch unmounts this component and a refresh clears React state, but
  // the server-side job keeps running. On mount, re-attach to the most recent
  // pending/running job from the persisted snapshot — WITHOUT issuing a new
  // discovery request. The first status poll reconciles real progress, and
  // completion flows through the normal handler. Navigation can therefore
  // never create a second job or a second credit charge.
  useEffect(() => {
    const resumable = pickResumableJobFromStorage(localStorage);
    if (!resumable) return;
    setActiveJob((prev) => {
      if (prev && (prev.status === 'running' || prev.status === 'pending')) return prev;
      return {
        id: resumable.id,
        status: resumable.status,
        source: resumable.source,
        niche: resumable.niche,
        country: resumable.country,
        city: resumable.city,
        totalFound: 0,
        leadsAdded: 0,
        duplicatesSkipped: 0,
        errors: 0,
        createdAt: resumable.createdAt,
        message: 'Reconnected to running discovery job',
      };
    });
    // Toast once per job per page session (StrictMode double-mount safe).
    if (!resumeToastsShown.has(resumable.id)) {
      resumeToastsShown.add(resumable.id);
      toast.info('Reconnected to your running discovery', {
        description: `${resumable.niche || 'Discovery'}${resumable.country ? ` in ${resumable.country}` : ''} is still processing — progress restored.`,
      });
    }
  }, []);

  // Fetch recently discovered leads
  const { data: allLeadsResult } = useQuery({
    queryKey: ['leads', { source: 'discovery' }],
    queryFn: () => fetchLeads({ limit: 20 }),
  });

  const recentlyDiscovered = allLeadsResult?.leads
    ?.filter((l: Lead) => l.source === 'discovery' || l.stage === 'discovered')
    ?.sort((a: Lead, b: Lead) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    ?.slice(0, 5) ?? [];

  // Popular niches from lead data
  const popularNiches = (() => {
    if (!allLeadsResult?.leads) return [];
    const nicheCounts: Record<string, number> = {};
    allLeadsResult.leads.forEach((l: Lead) => {
      if (l.niche) nicheCounts[l.niche] = (nicheCounts[l.niche] || 0) + 1;
    });
    return Object.entries(nicheCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  })();

  // Start discovery mutation — accepts explicit variables (AI Chat Mode) or falls back to filter state
  const discoverMutation = useMutation({
    mutationFn: async (vars?: DiscoveryVars) => {
      const payload = {
        niche: (vars?.niche ?? niche).trim(),
        country: (vars?.country ?? country).trim() || undefined,
        city: (vars?.city ?? city).trim() || undefined,
        source: vars?.source ?? source,
        maxResults: vars?.maxResults || undefined,
        requirements: vars?.requirements || undefined,
        // Structured HARD criteria from the AI parser — enforced server-side
        criteria: vars?.criteria || undefined,
        // Context / campaign selector override (server validates ownership;
        // 'none' sends nothing so legacy behaviour is byte-identical)
        context:
          contextMode === 'campaign' && contextCampaignId
            ? { mode: 'campaign', campaignId: contextCampaignId }
            : contextMode === 'business'
              ? { mode: 'business' }
              : contextMode === 'profile' && contextProfileId
                ? { mode: 'profile', profileId: contextProfileId }
                : undefined,
      };
      const res = await fetch('/api/leads/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start discovery');
      }
      const data = await res.json();
      return { data, payload };
    },
    onSuccess: ({ data, payload }) => {
      const job: DiscoveryJob = {
        id: data.jobId,
        status: data.status || 'pending',
        source: payload.source,
        niche: payload.niche,
        country: payload.country || '',
        city: payload.city,
        totalFound: 0,
        leadsAdded: 0,
        duplicatesSkipped: 0,
        errors: 0,
        createdAt: new Date().toISOString(),
        message: data.message,
      };
      setActiveJob(job);

      // Save to localStorage
      try {
        const stored = localStorage.getItem('acquisitionos_discovery_jobs');
        const jobs: DiscoveryJob[] = stored ? JSON.parse(stored) : [];
        jobs.unshift(job);
        localStorage.setItem('acquisitionos_discovery_jobs', JSON.stringify(jobs.slice(0, 20)));
      } catch {}

      toast.success('Discovery job started!', { description: `Searching ${payload.niche} in ${payload.country}...` });
    },
    onError: (error: Error) => {
      toast.error('Failed to start discovery', { description: error.message });
    },
  });

  // Central start handler — "All Sources" requires a credit-cost confirmation first
  const handleStartDiscovery = useCallback((vars?: DiscoveryVars) => {
    if ((vars?.source ?? source) === 'all') {
      setPendingStart(vars);
      setAllSourcesConfirmOpen(true);
      return;
    }
    discoverMutation.mutate(vars);
  }, [source, discoverMutation]);

  // ── AI Chat Mode handlers ────────────────────────────────
  const handleAiParse = async () => {
    const query = aiQuery.trim();
    if (!query || aiParsing) return;
    setAiParsing(true);
    setParsedIntent(null);
    try {
      const res = await fetch('/api/discovery/parse-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to read your request');
      setParsedIntent(data.parsed as ParsedIntent);
    } catch (err) {
      toast.error('Could not read your request', {
        description: err instanceof Error ? err.message : 'Please try rephrasing your description.',
      });
    } finally {
      setAiParsing(false);
    }
  };

  const handleEditFilters = () => {
    // Fill the existing filter fields with the parsed values and switch to Filter Mode
    if (parsedIntent) {
      setNiche(parsedIntent.niche);
      setCountry(parsedIntent.country);
      setCity(parsedIntent.city || '');
    }
    setSearchMode('filters');
  };

  // Credit-cost estimate shown in the "All Sources" confirmation
  const allSourcesCreditsEstimate = (() => {
    const explicitCount = searchMode === 'ai' && parsedIntent ? parsedIntent.count ?? 0 : 0;
    const perSource = explicitCount > 0 ? Math.max(5, Math.ceil(explicitCount / ALL_SOURCES_COUNT)) : 10;
    return ALL_SOURCES_COUNT * perSource;
  })();

  // Handle job completion
  const handleJobComplete = useCallback((completedJob: DiscoveryJob) => {
    setActiveJob(completedJob);

    if (completedJob.status === 'completed') {
      toast.success('Discovery complete!', {
        description: `Found ${completedJob.leadsAdded} verified leads${completedJob.filteredOut ? ` (${completedJob.filteredOut} rejected by hard filters)` : ''}`,
      });
      queryClient.invalidateQueries({ queryKey: ['leads'] });

      // Honest verified-matches notice: when the user asked for N companies
      // and hard-filter enforcement returned fewer, say so explicitly —
      // the remaining slots are NEVER filled with loosely-related companies.
      const requested = searchMode === 'ai' ? parsedIntent?.count ?? undefined : undefined;
      if (requested && completedJob.leadsAdded < requested) {
        setHonestMatchNotice(
          `${completedJob.leadsAdded} verified match${completedJob.leadsAdded === 1 ? '' : 'es'} found. We couldn't verify additional companies that meet all your criteria.`
        );
      } else {
        setHonestMatchNotice(null);
      }

      // Refresh discovered leads
      fetchLeads({ limit: 50 }).then((result) => {
        const newDiscovered = result.leads
          .filter((l: Lead) => l.source === 'discovery' || l.stage === 'discovered')
          .sort((a: Lead, b: Lead) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 20);
        setDiscoveredLeads(newDiscovered);
      });

      // Add to history
      try {
        const history = [...discoveryHistory];
        history.unshift({
          niche: completedJob.niche,
          country: completedJob.country,
          city: completedJob.city || '',
          resultCount: completedJob.leadsAdded,
          timestamp: Date.now(),
        });
        const trimmed = history.slice(0, 10);
        setDiscoveryHistory(trimmed);
        localStorage.setItem('acquisitionos_discovery_history', JSON.stringify(trimmed));
      } catch {}
    } else if (completedJob.status === 'failed') {
      toast.error('Discovery failed', {
        description: completedJob.message || 'Unknown error',
      });
    }
  }, [queryClient, discoveryHistory, searchMode, parsedIntent]);

  // Add lead to pipeline
  const handleAddToPipeline = useCallback(async (leadId: string) => {
    setPipelineAddingIds(prev => new Set(prev).add(leadId));
    try {
      await updateLead(leadId, { stage: 'analyzed' as LeadStage });
      setAddedIds(prev => new Set(prev).add(leadId));
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead added to pipeline');
    } catch {
      toast.error('Failed to add lead to pipeline');
    } finally {
      setPipelineAddingIds(prev => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    }
  }, [queryClient]);

  const handleViewDetails = useCallback((leadId: string) => {
    setSelectedLeadId(leadId);
    setActiveTab('leads');
  }, [setSelectedLeadId, setActiveTab]);

  const canDiscover =
    niche.trim() &&
    source &&
    // Country is optional — empty selection = Worldwide (spec §5).
    // An unconfigured source is NEVER run — it cannot return real data
    !selectedSourceBlocked;
  return (
    <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6">
      {/* Discovery Form */}
      <Card className="card-glow overflow-hidden">
        <div className="gradient-bg-animated px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-primary/20">
            <Search className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base sm:text-lg text-foreground">Lead Discovery Engine</CardTitle>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
              Find and analyze potential acquisition targets
            </p>
          </div>
        </div>

        <CardContent className="pt-5 space-y-4">
          {/* Search mode toggle: Filter Mode | AI Chat Mode */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/60 border border-border/50" role="tablist" aria-label="Search mode">
              <button
                type="button"
                role="tab"
                aria-selected={searchMode === 'filters'}
                onClick={() => setSearchMode('filters')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors active:scale-95',
                  searchMode === 'filters'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filter Mode
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={searchMode === 'ai'}
                onClick={() => setSearchMode('ai')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors active:scale-95',
                  searchMode === 'ai'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                AI Chat Mode
              </button>
            </div>
            {searchMode === 'ai' && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                Available on all plans
              </span>
            )}
          </div>

          {/* Context / campaign selector — visible in BOTH search modes.
              'None' keeps default behaviour; a campaign merges its custom
              instructions into this discovery run (ownership verified
              server-side); 'My business context' uses the user's own
              business/context settings for targeting. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-sm font-medium flex items-center gap-1.5 shrink-0">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Context
              <span className="text-muted-foreground font-normal hidden sm:inline">(optional override)</span>
            </label>
            <Select
              value={
                contextMode === 'campaign'
                  ? `campaign:${contextCampaignId}`
                  : contextMode === 'profile'
                    ? `profile:${contextProfileId}`
                    : contextMode
              }
              onValueChange={(v) => {
                if (v === 'none' || v === 'business') {
                  setContextMode(v);
                  setContextCampaignId('');
                  setContextProfileId('');
                } else if (v.startsWith('campaign:')) {
                  setContextMode('campaign');
                  setContextCampaignId(v.slice('campaign:'.length));
                  setContextProfileId('');
                } else if (v.startsWith('profile:')) {
                  setContextMode('profile');
                  setContextProfileId(v.slice('profile:'.length));
                  setContextCampaignId('');
                }
              }}
            >
              <SelectTrigger className="w-full sm:max-w-sm border-primary/20 focus:ring-primary/30">
                <SelectValue placeholder="No context override" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — no override</SelectItem>
                <SelectItem value="business">My business context</SelectItem>
                {(contextProfiles ?? []).length > 0 && (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    Business Profiles
                  </div>
                )}
                {(contextProfiles ?? []).map((p) => (
                  <SelectItem key={p.id} value={`profile:${p.id}`} disabled={p.status !== 'active'}>
                    Profile — {p.name}
                    {p.status !== 'active' ? ' (archived)' : ''}
                  </SelectItem>
                ))}
                {(contextCampaigns ?? []).length > 0 && (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    Campaigns
                  </div>
                )}
                {(contextCampaigns ?? []).map((c) => (
                  <SelectItem key={c.id} value={`campaign:${c.id}`}>
                    Campaign — {c.niche?.trim() || `ID ${c.id.slice(-6)}`}
                    {c.status ? ` (${c.status})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {contextMode === 'campaign' && !selectedContextCampaign && (
              <span className="text-[11px] text-yellow-600 dark:text-yellow-500">
                Selected campaign not in the recent list — it will still be resolved server-side.
              </span>
            )}
          </div>

          {searchMode === 'filters' ? (
            <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Source Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-primary" />
                Source
              </label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="border-primary/20 focus:ring-primary/30">
                  <SelectValue placeholder="Select source..." />
                </SelectTrigger>
                <SelectContent>
                  {DISCOVERY_SOURCES.map((s) => {
                    const Icon = s.icon;
                    const st = s.value === 'all' ? undefined : sourceStatusById.get(s.value);
                    return (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5', s.color)} />
                          {s.label}
                          {st && st.status !== 'connected' && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0"
                              title={`${st.label} requires API configuration`}
                            />
                          )}
                          {st && st.noSetupRequired && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"
                              title="No setup required"
                            />
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {/* Configuration notice — shown when the selected source has no API
                  credentials. The source stays in the dropdown but discovery is
                  blocked server-side too: it can never return fake data. */}
              {selectedSourceBlocked && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                      {selectedSourceConfigMessage}
                    </p>
                    {selectedSourceStatus!.requiredEnvVars.length > 0 && (
                      <p className="text-[11px] text-yellow-600/80 dark:text-yellow-500/70">
                        Required: {selectedSourceStatus!.requiredEnvVars.map((v) => v.name).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Niche Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-primary" />
                Niche
              </label>
              <Input
                placeholder="e.g. Restaurant, Dental, Gym..."
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="border-primary/20 focus:ring-primary/30"
              />
            </div>

            {/* Country selector — worldwide dataset (spec §5): searchable,
                ISO-complete, with an explicit Worldwide option (no country). */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Country <span className="text-muted-foreground font-normal">(or Worldwide)</span>
              </label>
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={countryOpen}
                    className="w-full justify-between border-primary/20 focus:ring-primary/30 font-normal"
                  >
                    <span className={cn('truncate', !country && 'text-muted-foreground')}>
                      {country || '🌍 Worldwide (all countries)'}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search countries..." />
                    <CommandList className="max-h-64 overflow-y-auto">
                      <CommandEmpty>No country found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="Worldwide all countries"
                          onSelect={() => {
                            setCountry('');
                            setCountryOpen(false);
                          }}
                        >
                          <Globe className="mr-2 h-4 w-4" />
                          <span className={cn('flex-1', !country && 'font-medium')}>Worldwide (all countries)</span>
                          {!country && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </CommandItem>
                      </CommandGroup>
                      <CommandGroup heading="Countries">
                        {COUNTRIES.map((c) => (
                          <CommandItem
                            key={c.code}
                            value={`${c.name} ${c.code}`}
                            onSelect={() => {
                              setCountry(c.name);
                              setCountryOpen(false);
                            }}
                          >
                            <span className={cn('flex-1', country === c.name && 'font-medium')}>{c.name}</span>
                            {country === c.name ? (
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            ) : (
                              <span className="text-xs text-muted-foreground">{c.code}</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* City Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                City <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                placeholder="Enter city..."
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="border-primary/20 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => handleStartDiscovery()}
              disabled={!canDiscover || discoverMutation.isPending}
              className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 active:scale-95 transition-all"
              size="lg"
            >
              {discoverMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting Discovery...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Start Discovery
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-primary/20 hover:border-primary/40 hover:bg-primary/5 active:scale-95 transition-all"
              onClick={() => setImportOpen(true)}
            >
              <FileUp className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          </div>
            </>
          ) : (
            /* ── AI Chat Mode ── */
            <div className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAiParse();
                }}
                className="space-y-3"
              >
                <div className="relative">
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60 pointer-events-none" />
                  <Input
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder="Describe what leads you're looking for... e.g. 'Find 20 restaurants in Dubai with no website and poor social media presence'"
                    className="pl-9 pr-28 h-11"
                    disabled={aiParsing || discoverMutation.isPending}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 gap-1"
                    disabled={!aiQuery.trim() || aiParsing || discoverMutation.isPending}
                  >
                    {aiParsing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    {aiParsing ? 'Reading…' : 'Read Request'}
                  </Button>
                </div>
              </form>

              <AnimatePresence>
                {parsedIntent && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Searching for:</span>
                        <Badge variant="outline" className="bg-primary/10 border-primary/25 gap-1">
                          <Search className="h-3 w-3" />
                          {parsedIntent.count != null ? `${parsedIntent.count} ` : ''}{parsedIntent.niche} in {parsedIntent.location}
                        </Badge>
                        {parsedIntent.requirements && (
                          <>
                            <span className="text-xs font-medium text-muted-foreground">|</span>
                            <span className="text-xs font-medium text-muted-foreground">Filter:</span>
                            <Badge
                              variant="outline"
                              className="bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400 gap-1"
                            >
                              <AlertCircle className="h-3 w-3" />
                              {parsedIntent.requirements}
                            </Badge>
                          </>
                        )}
                      </div>
                      {/* HARD CRITERIA — enforced server-side after discovery */}
                      {describeCriteria(parsedIntent.criteria) && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">Hard filters (strictly enforced):</span>
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 gap-1"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {describeCriteria(parsedIntent.criteria)}
                          </Badge>
                        </div>
                      )}
                      {parsedIntent.criteria && (parsedIntent.criteria.employeeMin != null || parsedIntent.criteria.employeeMax != null || parsedIntent.criteria.exactEmployeeCount != null) && (
                        <p className="text-[11px] text-muted-foreground">
                          Only companies whose employee count can be verified within this range will be returned — if fewer verified matches exist than you asked for, you'll see the honest count.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setHonestMatchNotice(null);
                            handleStartDiscovery({
                              niche: parsedIntent.niche,
                              country: parsedIntent.country,
                              city: parsedIntent.city || undefined,
                              source,
                              maxResults: parsedIntent.count ?? undefined,
                              requirements: parsedIntent.requirements || undefined,
                              criteria: parsedIntent.criteria,
                            });
                          }}
                          disabled={discoverMutation.isPending}
                          className="bg-primary hover:bg-primary/90 active:scale-95 transition-all"
                        >
                          {discoverMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Zap className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          {discoverMutation.isPending ? 'Starting Discovery...' : 'Start Discovery'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleEditFilters}
                          disabled={discoverMutation.isPending}
                          className="border-primary/20 hover:border-primary/40 hover:bg-primary/5 active:scale-95 transition-all"
                        >
                          <PencilLine className="h-3.5 w-3.5 mr-1.5" />
                          Edit Filters
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <p className="text-[11px] text-muted-foreground">
                Describe your ideal leads in plain English — AI fills the filters and starts the
                discovery for you. Uses your current source selection ({' '}
                {DISCOVERY_SOURCES.find((s) => s.value === source)?.label ?? source}).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Discovery Job Progress */}
      <AnimatePresence>
        {activeJob && (activeJob.status === 'running' || activeJob.status === 'pending') && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <DiscoveryJobProgress job={activeJob} onComplete={handleJobComplete} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discovery History */}
      <AnimatePresence>
        {discoveryHistory.length > 0 && !activeJob && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="card-glow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Recent Searches</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1.5"
                    onClick={() => {
                      try {
                        localStorage.removeItem('acquisitionos_discovery_history');
                        setDiscoveryHistory([]);
                        toast.success('Search history cleared');
                      } catch {}
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </Button>
                </div>
                <div className="space-y-2">
                  {discoveryHistory.slice(0, 5).map((item, i) => (
                    <motion.button
                      key={`${item.niche}-${item.country}-${item.timestamp}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => {
                        setNiche(item.niche);
                        setCountry(item.country);
                        setCity(item.city || '');
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-primary/20 transition-colors text-left"
                    >
                      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 shrink-0">
                        <Search className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {item.niche} · {item.country}{item.city ? ` · ${item.city}` : ''}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.resultCount} result{item.resultCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State (when no active job, no results, no history) */}
      {discoveredLeads.length === 0 && !activeJob && discoveryHistory.length === 0 && recentlyDiscovered.length === 0 && popularNiches.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center justify-center py-16 px-4"
        >
          <div className="relative mb-6">
            <div className="rounded-full bg-primary/10 p-6">
              <Search className="h-12 w-12 text-primary/40" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary/60" />
            </div>
          </div>
          <h3 className="text-xl font-bold mb-2">Find Your Next Lead</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            Use the search form above to discover potential acquisition targets across multiple sources.
          </p>
        </motion.div>
      )}

      {/* Honest verified-matches notice (hard filters returned fewer than requested) */}
      <AnimatePresence>
        {honestMatchNotice && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
              <ShieldCheck className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">{honestMatchNotice}</p>
                <p className="text-[11px] text-muted-foreground">
                  Hard filters (employee range, website, exclusions) are enforced server-side — every company above was
                  verified against them. The list is never padded with loosely related companies.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discovered Leads Results */}
      {discoveredLeads.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Discovered {discoveredLeads.length} verified lead{discoveredLeads.length === 1 ? '' : 's'}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => {
                setDiscoveredLeads([]);
                setHonestMatchNotice(null);
              }}
            >
              Clear results
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 stagger-children">
            {discoveredLeads.map((lead) => (
              <DiscoveredLeadCard
                key={lead.id}
                lead={lead}
                onAddToPipeline={handleAddToPipeline}
                onViewDetails={handleViewDetails}
                isAdding={pipelineAddingIds.has(lead.id)}
                isAdded={addedIds.has(lead.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recently Discovered */}
      {recentlyDiscovered.length > 0 && discoveredLeads.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="card-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Recently Discovered</h3>
              </div>
              <div className="space-y-2">
                {recentlyDiscovered.map((lead) => (
                  <motion.button
                    key={lead.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => handleViewDetails(lead.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-primary/20 transition-colors text-left"
                  >
                    <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 shrink-0">
                      <Building2 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{lead.businessName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {lead.niche} · {lead.country}{lead.city ? ` · ${lead.city}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono font-medium text-emerald-500">{lead.conversionScore}%</span>
                  </motion.button>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Popular Niches */}
      {popularNiches.length > 0 && discoveredLeads.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="card-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-semibold">Popular Niches</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {popularNiches.map((n) => (
                  <motion.button
                    key={n.name}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    onClick={() => { setNiche(n.name); setCity(''); }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-95',
                      niche === n.name
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-muted/50 text-foreground border-border hover:bg-muted hover:border-primary/20'
                    )}
                  >
                    {n.name}
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] font-mono">{n.count}</Badge>
                  </motion.button>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Import Dialog */}
      <LeadImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* All Sources — credit cost confirmation (Enhancement: All Sources Integration) */}
      <AlertDialog open={allSourcesConfirmOpen} onOpenChange={setAllSourcesConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Search all {ALL_SOURCES_COUNT} sources?</AlertDialogTitle>
            <AlertDialogDescription>
              Searching all {ALL_SOURCES_COUNT} sources (AI Search, Google Maps, LinkedIn, JustDial,
              IndiaMart, Yellow Pages and Sulekha) will use approximately{' '}
              <span className="font-semibold text-foreground">{allSourcesCreditsEstimate} credits</span>.
              Results are merged and deduplicated. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStart(undefined)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                discoverMutation.mutate(pendingStart);
                setPendingStart(undefined);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
