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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchLeads, updateLead } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { Lead, LeadStage } from '@/lib/types';
import LeadImportDialog from './lead-import-dialog';
import { toast } from 'sonner';

// ─── Discovery Source Config ─────────────────────────────
const DISCOVERY_SOURCES = [
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

function Star(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
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
  }>;
  createdAt: string;
  completedAt?: string;
  message?: string;
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

  useEffect(() => {
    if (currentJob.status !== 'running' && currentJob.status !== 'pending') return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/leads/discover/status/${currentJob.id}`);
        if (res.ok) {
          const data = await res.json();
          const updatedJob = data.job as DiscoveryJob;
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
        }
      } catch {}
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
              {currentJob.leadsAdded} leads found
            </span>
          )}
          {currentJob.status === 'failed' && currentJob.message && (
            <span className="text-red-500 truncate max-w-[200px]">{currentJob.message}</span>
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

  // Form state
  const [source, setSource] = useState<string>('ai_search');
  const [niche, setNiche] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');

  // Jobs state
  const [activeJob, setActiveJob] = useState<DiscoveryJob | null>(null);
  const [discoveredLeads, setDiscoveredLeads] = useState<Lead[]>([]);
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

  // Fetch recently discovered leads
  const { data: allLeadsResult } = useQuery({
    queryKey: ['leads', { source: 'discovery' }],
    queryFn: () => fetchLeads({ limit: 20 }),
  });

  const recentlyDiscovered = allLeadsResult?.leads
    ?.filter((l: Lead) => l.source === 'discovery')
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

  // Start discovery mutation
  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/leads/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, country, city: city || undefined, source }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start discovery');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const job: DiscoveryJob = {
        id: data.jobId,
        status: data.status || 'pending',
        source,
        niche,
        country,
        city: city || undefined,
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

      toast.success('Discovery job started!', { description: `Searching ${niche} in ${country}...` });
    },
    onError: (error: Error) => {
      toast.error('Failed to start discovery', { description: error.message });
    },
  });

  // Handle job completion
  const handleJobComplete = useCallback((completedJob: DiscoveryJob) => {
    setActiveJob(completedJob);

    if (completedJob.status === 'completed') {
      toast.success('Discovery complete!', {
        description: `Found ${completedJob.leadsAdded} leads`,
      });
      queryClient.invalidateQueries({ queryKey: ['leads'] });

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
  }, [queryClient, discoveryHistory]);

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

  const canDiscover = niche.trim() && country.trim() && source;

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
                    return (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5', s.color)} />
                          {s.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
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

            {/* Country Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Country
              </label>
              <Input
                placeholder="e.g. USA, India, UAE..."
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="border-primary/20 focus:ring-primary/30"
              />
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
              onClick={() => discoverMutation.mutate()}
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

      {/* Discovered Leads Results */}
      {discoveredLeads.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Discovered {discoveredLeads.length} leads
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setDiscoveredLeads([])}
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
    </div>
  );
}
