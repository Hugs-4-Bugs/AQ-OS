'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Plus,
  DollarSign,
  Loader2,
  Eye,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Search,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Handshake,
  Filter,
  Download,
  Copy,
  FileDown,
  RefreshCw,
  Timer,
  BarChart3,
  AlertTriangle,
  StickyNote,
  ArrowUpDown,
  Trophy,
  Target,
  CalendarClock,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { fetchLeads, fetchDeals, createDeal, updateDeal, generateProposal } from '@/lib/api';
import { exportDealsToCSV, downloadCSV } from '@/lib/export';
import { cn } from '@/lib/utils';
import type { Deal } from '@/lib/types';
import { toast } from 'sonner';
import ErrorFallback from './error-fallback';

// ─── Status Configuration ────────────────────────────────────

const DEAL_STATUS_CONFIG: Record<Deal['status'], {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  icon: React.ElementType;
  gradient: string;
  hexColor: string;
}> = {
  draft: {
    label: 'Draft',
    color: 'bg-slate-500',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-l-slate-500',
    textColor: 'text-slate-600',
    icon: FileText,
    gradient: 'stat-card-gradient-emerald',
    hexColor: '#64748b',
  },
  sent: {
    label: 'Sent',
    color: 'bg-sky-500',
    bgColor: 'bg-sky-500/10',
    borderColor: 'border-l-sky-500',
    textColor: 'text-sky-600',
    icon: Send,
    gradient: 'stat-card-gradient-blue',
    hexColor: '#0ea5e9',
  },
  viewed: {
    label: 'Viewed',
    color: 'bg-cyan-500',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-l-cyan-500',
    textColor: 'text-cyan-600',
    icon: Eye,
    gradient: 'stat-card-gradient-blue',
    hexColor: '#06b6d4',
  },
  negotiating: {
    label: 'Negotiating',
    color: 'bg-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-l-amber-500',
    textColor: 'text-amber-600',
    icon: Clock,
    gradient: 'stat-card-gradient-amber',
    hexColor: '#f59e0b',
  },
  accepted: {
    label: 'Accepted',
    color: 'bg-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-l-emerald-500',
    textColor: 'text-emerald-600',
    icon: CheckCircle2,
    gradient: 'stat-card-gradient-emerald',
    hexColor: '#10b981',
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-l-red-500',
    textColor: 'text-red-600',
    icon: XCircle,
    gradient: 'stat-card-gradient-red',
    hexColor: '#ef4444',
  },
};

const STATUS_ORDER: Deal['status'][] = ['draft', 'sent', 'viewed', 'negotiating', 'accepted', 'rejected'];
const FUNNEL_STAGES: Deal['status'][] = ['draft', 'sent', 'viewed', 'negotiating', 'accepted'];

// Status progression: what can advance to what
const STATUS_ADVANCEMENT: Record<string, Deal['status'] | null> = {
  draft: 'sent',
  sent: 'viewed',
  viewed: 'negotiating',
  negotiating: 'accepted',
  accepted: null,
  rejected: null,
};

// ─── Deal Aging Thresholds ────────────────────────────────────

const DEAL_AGING_THRESHOLDS: Record<string, { warning: number; color: string; glowClass: string }> = {
  draft: { warning: 3, color: 'text-amber-500', glowClass: 'shadow-[-3px_0_8px_-2px_rgba(245,158,11,0.4)]' },
  sent: { warning: 5, color: 'text-amber-500', glowClass: 'shadow-[-3px_0_8px_-2px_rgba(245,158,11,0.4)]' },
  negotiating: { warning: 10, color: 'text-red-500', glowClass: 'shadow-[-3px_0_8px_-2px_rgba(239,68,68,0.4)]' },
  viewed: { warning: 7, color: 'text-amber-500', glowClass: 'shadow-[-3px_0_8px_-2px_rgba(245,158,11,0.4)]' },
  accepted: { warning: Infinity, color: '', glowClass: '' },
  rejected: { warning: Infinity, color: '', glowClass: '' },
};

// ─── Deal Probability by Status ───────────────────────────────

const DEAL_PROBABILITY: Record<string, number> = {
  draft: 10,
  sent: 30,
  viewed: 45,
  negotiating: 70,
  accepted: 100,
  rejected: 0,
};

// ─── Sort Configuration ──────────────────────────────────────

type SortOption = 'newest' | 'oldest' | 'value-high' | 'value-low' | 'stage';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'value-high', label: 'Value (High→Low)' },
  { value: 'value-low', label: 'Value (Low→High)' },
  { value: 'stage', label: 'Stage' },
];

// ─── Deal Value Formatting ───────────────────────────────────

function formatDealValue(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value}`;
}

// ─── Time in Stage Badge Info ────────────────────────────────

function getTimeInStageInfo(updatedAt: string, status: string): { label: string; color: string; needsAttention: boolean; days: number } {
  const now = new Date();
  const updated = new Date(updatedAt);
  const diffMs = now.getTime() - updated.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const threshold = DEAL_AGING_THRESHOLDS[status];
  const isAging = threshold ? days >= threshold.warning : false;

  if (days < 1) return { label: 'New', color: 'text-emerald-500', needsAttention: false, days };
  if (isAging) return { label: `${days}d`, color: threshold?.color || 'text-red-500', needsAttention: true, days };
  return { label: `${days}d`, color: 'text-muted-foreground', needsAttention: false, days };
}

// ─── Helper: Time in stage ───────────────────────────────────

function getTimeInStage(updatedAt: string): string {
  const now = new Date();
  const updated = new Date(updatedAt);
  const diffMs = now.getTime() - updated.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'Just now';
}

// ─── Mini Sparkline Component ────────────────────────────────

function MiniSparkline({ data, color = 'emerald', className }: { data: number[]; color?: string; className?: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'oklch(0.696 0.17 162.48)',
    amber: 'oklch(0.75 0.15 70)',
    red: 'oklch(0.6 0.22 25)',
    sky: 'oklch(0.6 0.15 250)',
    slate: 'oklch(0.556 0 0)',
  };
  const strokeColor = colorMap[color] || colorMap.emerald;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 24;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className={cn('opacity-60', className)}>
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Deal Timeline Steps Component ───────────────────────────

function DealTimelineSteps({ currentStatus }: { currentStatus: Deal['status'] }) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const linearSteps = ['draft', 'sent', 'viewed', 'negotiating'] as Deal['status'][];
  const isTerminal = currentStatus === 'accepted' || currentStatus === 'rejected';

  return (
    <div className="flex items-center gap-0.5 mt-2">
      {linearSteps.map((step, i) => {
        const stepIndex = STATUS_ORDER.indexOf(step);
        const isCompleted = currentIndex >= stepIndex && !isTerminal;
        const isCurrent = currentStatus === step;
        const config = DEAL_STATUS_CONFIG[step];

        return (
          <React.Fragment key={step}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'h-2 w-2 rounded-full transition-all duration-300',
                    isCurrent && 'ring-2 ring-offset-1 scale-125',
                    isCurrent && `ring-${step === 'draft' ? 'slate' : step === 'sent' ? 'sky' : step === 'viewed' ? 'cyan' : 'amber'}-500/50`,
                    isCompleted && !isCurrent ? config.color : '',
                    !isCompleted && !isCurrent ? 'bg-muted-foreground/20' : ''
                  )}
                  style={isCurrent ? { boxShadow: `0 0 6px ${config.hexColor}` } : undefined}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {config.label}
              </TooltipContent>
            </Tooltip>
            {i < linearSteps.length - 1 && (
              <div
                className={cn(
                  'h-px w-3 transition-colors',
                  isCompleted && i < currentIndex ? 'bg-emerald-500/60' : 'bg-muted-foreground/15'
                )}
              />
            )}
          </React.Fragment>
        );
      })}
      {/* Terminal state indicator */}
      {isTerminal && (
        <>
          <div className="h-px w-3 bg-emerald-500/60" />
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  currentStatus === 'accepted' ? 'bg-emerald-500' : 'bg-red-500'
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {DEAL_STATUS_CONFIG[currentStatus].label}
            </TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}

// ─── Pipeline Funnel Component ───────────────────────────────

function PipelineFunnel({ deals }: { deals: Deal[] | undefined }) {
  const funnelData = useMemo(() => {
    return FUNNEL_STAGES.map((status) => {
      const statusDeals = deals?.filter((d) => d.status === status) ?? [];
      const config = DEAL_STATUS_CONFIG[status];
      return {
        status,
        label: config.label,
        count: statusDeals.length,
        value: statusDeals.reduce((sum, d) => sum + (d.proposedPrice ?? 0), 0),
        hexColor: config.hexColor,
        bgColor: config.bgColor,
      };
    });
  }, [deals]);

  const maxCount = Math.max(...funnelData.map((d) => d.count), 1);
  const hasDeals = funnelData.some((d) => d.count > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Filter className="h-4 w-4 text-emerald-500" />
          Deal Pipeline Funnel
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasDeals ? (
          <div className="flex items-center justify-center py-6">
            <div className="flex items-end gap-1 opacity-20">
              {funnelData.map((stage) => (
                <div
                  key={stage.status}
                  className="bg-muted-foreground rounded-t h-8 border border-dashed border-muted-foreground/30"
                  style={{ width: 60, height: 32 - funnelData.indexOf(stage) * 4 }}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground ml-4">No deals in pipeline yet</p>
          </div>
        ) : (
          <div className="flex items-end justify-center gap-1 py-2">
            {funnelData.map((stage, i) => {
              const widthPct = maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 20) : 20;
              const heightVal = 48 - i * 4;
              return (
                <Tooltip key={stage.status}>
                  <TooltipTrigger asChild>
                    <motion.div
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={{ scaleY: 1, opacity: 1 }}
                      transition={{ delay: i * 0.08, duration: 0.3 }}
                      className="flex flex-col items-center gap-1 origin-bottom cursor-pointer"
                    >
                      <span className="text-[10px] font-semibold" style={{ color: stage.hexColor }}>
                        {stage.count}
                      </span>
                      <div
                        className="rounded-t relative overflow-hidden transition-all duration-300 hover:opacity-90"
                        style={{
                          width: `${widthPct}px`,
                          height: `${heightVal}px`,
                          background: `linear-gradient(180deg, ${stage.hexColor}, ${stage.hexColor}cc)`,
                          opacity: 0.85,
                          clipPath: 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)',
                        }}
                      >
                        {stage.value > 0 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90">
                            {formatDealValue(stage.value)}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground mt-0.5">{stage.label}</span>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <div className="text-center">
                      <div className="font-semibold">{stage.label}</div>
                      <div>{stage.count} deal{stage.count !== 1 ? 's' : ''}</div>
                      {stage.value > 0 && <div>${stage.value.toLocaleString()}</div>}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Win/Loss Analysis Card ──────────────────────────────────

function WinLossAnalysis({ deals }: { deals: Deal[] | undefined }) {
  const analysis = useMemo(() => {
    if (!deals || deals.length === 0) return null;

    const total = deals.length;
    const won = deals.filter((d) => d.status === 'accepted').length;
    const lost = deals.filter((d) => d.status === 'rejected').length;
    const active = total - won - lost;
    const winRate = total > 0 ? Math.round((won / total) * 100) : 0;

    // Average cycle time for won deals (createdAt to updatedAt)
    const wonDeals = deals.filter((d) => d.status === 'accepted');
    let avgCycleDays = 0;
    if (wonDeals.length > 0) {
      const totalDays = wonDeals.reduce((sum, d) => {
        const created = new Date(d.createdAt);
        const updated = new Date(d.updatedAt);
        return sum + (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      }, 0);
      avgCycleDays = Math.round(totalDays / wonDeals.length);
    }

    // Average deal value for won deals
    const avgWonValue = wonDeals.length > 0
      ? wonDeals.reduce((sum, d) => sum + (d.finalPrice ?? d.proposedPrice ?? 0), 0) / wonDeals.length
      : 0;

    return { total, won, lost, active, winRate, avgCycleDays, avgWonValue };
  }, [deals]);

  if (!analysis) return null;

  const chartData = [
    { name: 'Won', value: analysis.won, color: '#10b981' },
    { name: 'Lost', value: analysis.lost, color: '#ef4444' },
    { name: 'Active', value: analysis.active, color: '#0ea5e9' },
  ].filter((d) => d.value > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-emerald-500" />
          Win/Loss Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          {/* Donut Chart */}
          <div className="relative shrink-0">
            <ResponsiveContainer width={100} height={100}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={45}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-600">{analysis.winRate}%</p>
                <p className="text-[8px] text-muted-foreground leading-none">Win Rate</p>
              </div>
            </div>
          </div>

          {/* Stats with count-up animation */}
          <div className="flex-1 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Avg Cycle Time</span>
              </div>
              <span className="text-sm font-semibold count-up-animate">
                {analysis.avgCycleDays > 0 ? `${analysis.avgCycleDays}d` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Avg Won Value</span>
              </div>
              <span className="text-sm font-semibold count-up-animate">
                {analysis.avgWonValue > 0 ? `$${Math.round(analysis.avgWonValue).toLocaleString()}` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              {chartData.map((item) => (
                <div key={item.name} className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] text-muted-foreground">{item.name} (<span className="font-semibold count-up-animate">{item.value}</span>)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function DealsTab() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [proposalPreview, setProposalPreview] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Deal['status'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dealNotes, setDealNotes] = useState<Record<string, string>>({});
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  // New deal form
  const [newLeadId, setNewLeadId] = useState('');
  const [newProjectType, setNewProjectType] = useState('');
  const [newScope, setNewScope] = useState('');
  const [newPricing, setNewPricing] = useState('');

  const { data: leadsResult } = useQuery({
    queryKey: ['leads'],
    queryFn: () => fetchLeads({ limit: 100 }),
  });
  const leads = leadsResult?.leads;

  const { data: deals, isLoading, error: dealsError, refetch: refetchDeals } = useQuery({
    queryKey: ['deals'],
    queryFn: () => fetchDeals(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createDeal(newLeadId, {
        projectType: newProjectType,
        projectScope: newScope,
        proposedPrice: Number(newPricing),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      setCreateOpen(false);
      setNewLeadId('');
      setNewProjectType('');
      setNewScope('');
      setNewPricing('');
    },
  });

  const updateDealMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status?: string; proposedPrice?: number; finalPrice?: number; notes?: string } }) =>
      updateDeal(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal updated');
    },
  });

  const proposalMutation = useMutation({
    mutationFn: () => generateProposal(selectedDealId!),
    onSuccess: (proposal) => {
      setProposalPreview(proposal);
      toast.success('Proposal generated successfully');
    },
    onError: (error) => {
      toast.error('Failed to generate proposal: ' + error.message);
    },
  });

  const selectedDeal = deals?.find((d) => d.id === selectedDealId);
  const selectedDealLead = selectedDeal
    ? (selectedDeal.lead ?? leads?.find((l) => l.id === selectedDeal.leadId))
    : null;

  // ─── Computed Values ────────────────────────────────────────

  const filteredDeals = useMemo(() => {
    if (!deals) return [];
    return deals.filter((deal) => {
      // Status filter
      if (statusFilter !== 'all' && deal.status !== statusFilter) return false;
      // Search filter
      if (searchQuery) {
        const dealLead = deal.lead ?? leads?.find((l) => l.id === deal.leadId);
        const q = searchQuery.toLowerCase();
        const matchesName = dealLead?.businessName?.toLowerCase().includes(q);
        const matchesProject = deal.projectType?.toLowerCase().includes(q);
        if (!matchesName && !matchesProject) return false;
      }
      return true;
    });
  }, [deals, statusFilter, searchQuery, leads]);

  // ─── Sorted Deals ──────────────────────────────────────────

  const sortedDeals = useMemo(() => {
    const sorted = [...filteredDeals];
    switch (sortOption) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case 'value-high':
        return sorted.sort((a, b) => (b.proposedPrice ?? 0) - (a.proposedPrice ?? 0));
      case 'value-low':
        return sorted.sort((a, b) => (a.proposedPrice ?? 0) - (b.proposedPrice ?? 0));
      case 'stage':
        return sorted.sort((a, b) => STATUS_ORDER.indexOf(a.status as Deal['status']) - STATUS_ORDER.indexOf(b.status as Deal['status']));
      default:
        return sorted;
    }
  }, [filteredDeals, sortOption]);

  const totalRevenue = deals
    ?.filter((d) => d.status === 'accepted')
    .reduce((sum, d) => sum + (d.finalPrice ?? d.proposedPrice ?? 0), 0) ?? 0;

  const pipelineRevenue = deals
    ?.filter((d) => ['sent', 'viewed', 'negotiating'].includes(d.status))
    .reduce((sum, d) => sum + (d.proposedPrice ?? 0), 0) ?? 0;

  const acceptedCount = deals?.filter((d) => d.status === 'accepted').length ?? 0;
  const totalCount = deals?.length ?? 0;
  const avgDealValue = totalCount > 0
    ? deals!.reduce((sum, d) => sum + (d.proposedPrice ?? 0), 0) / totalCount
    : 0;

  // Deal Velocity: average time from draft to accepted
  const dealVelocity = useMemo(() => {
    const acceptedDeals = deals?.filter((d) => d.status === 'accepted') ?? [];
    if (acceptedDeals.length === 0) return null;
    const totalDays = acceptedDeals.reduce((sum, d) => {
      const created = new Date(d.createdAt);
      const updated = new Date(d.updatedAt);
      return sum + (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round(totalDays / acceptedDeals.length);
  }, [deals]);

  // Status counts and values for the flow section
  const statusCounts = useMemo(() => {
    const counts: Record<string, { count: number; value: number }> = {};
    STATUS_ORDER.forEach((s) => {
      const statusDeals = deals?.filter((d) => d.status === s) ?? [];
      counts[s] = {
        count: statusDeals.length,
        value: statusDeals.reduce((sum, d) => sum + (d.proposedPrice ?? 0), 0),
      };
    });
    return counts;
  }, [deals]);

  // ─── Loading State ──────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4 pb-20 lg:pb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  // Error state
  if (dealsError && !deals) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorFallback
          error={dealsError instanceof Error ? dealsError : null}
          onRetry={() => refetchDeals()}
          title="Failed to Load Deals"
          description="We couldn't load your deals data. Please try again."
          className="min-h-[300px]"
        />
      </div>
    );
  }

  // ─── Handle Status Advancement ─────────────────────────────

  const handleAdvanceStatus = (dealId: string, currentStatus: Deal['status']) => {
    const nextStatus = STATUS_ADVANCEMENT[currentStatus];
    if (!nextStatus) return;
    updateDealMutation.mutate({ id: dealId, data: { status: nextStatus } });
  };

  const handleSetRejected = (dealId: string) => {
    updateDealMutation.mutate({ id: dealId, data: { status: 'rejected' } });
  };

  // ─── Render ────────────────────────────────────────────────

  return (
    <ScrollArea className="h-full">
      <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold gradient-text">Deal Management</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 active:scale-95 transition-all min-h-[36px]"
              onClick={() => {
                if (!deals || deals.length === 0) {
                  toast.error('No deals to export');
                  return;
                }
                const csv = exportDealsToCSV(deals);
                const timestamp = new Date().toISOString().slice(0, 10);
                downloadCSV(csv, `deals-export-${timestamp}.csv`);
                toast.success(`Exported ${deals.length} deal${deals.length !== 1 ? 's' : ''} to CSV`);
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="active:scale-95 transition-all min-h-[36px]">
                  <Plus className="h-4 w-4 mr-2" />
                  New Deal
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Deal</DialogTitle>
                <DialogDescription>Define the project scope and pricing for a new deal.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Lead</label>
                  <Select value={newLeadId} onValueChange={setNewLeadId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a lead..." />
                    </SelectTrigger>
                    <SelectContent>
                      {leads?.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.businessName} — {lead.niche}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Project Type</label>
                  <Input
                    placeholder="e.g., Full Digital Transformation"
                    value={newProjectType}
                    onChange={(e) => setNewProjectType(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scope</label>
                  <Textarea
                    placeholder="Describe the project scope..."
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Pricing ($)</label>
                  <Input
                    type="number"
                    placeholder="e.g., 25000"
                    value={newPricing}
                    onChange={(e) => setNewPricing(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!newLeadId || !newProjectType || !newPricing || createMutation.isPending}
                  className="w-full active:scale-95 transition-all min-h-[44px]"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Deal'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Revenue Metrics - Enhanced */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0 }}
          >
            <Card className={cn('relative overflow-hidden hover-lift', 'stat-card-gradient-emerald')}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                        <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
                      </div>
                    </div>
                    <p className="text-lg sm:text-xl font-bold">${totalRevenue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <MiniSparkline data={[20, 35, 28, 45, 52, 68, 75]} color="emerald" className="hidden sm:block" />
                    <div className="flex items-center gap-0.5 text-emerald-600">
                      <TrendingUp className="h-3 w-3" />
                      <span className="text-[10px] font-medium">+12.5%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <Card className={cn('relative overflow-hidden hover-lift', 'stat-card-gradient-amber')}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                        <Handshake className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
                      </div>
                    </div>
                    <p className="text-lg sm:text-xl font-bold">${pipelineRevenue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Pipeline Value</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <MiniSparkline data={[40, 32, 38, 25, 30, 35, 42]} color="amber" className="hidden sm:block" />
                    <div className="flex items-center gap-0.5 text-amber-600">
                      <TrendingDown className="h-3 w-3" />
                      <span className="text-[10px] font-medium">-3.2%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className={cn('relative overflow-hidden hover-lift', 'stat-card-gradient-emerald')}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
                      </div>
                    </div>
                    <p className="text-lg sm:text-xl font-bold">{acceptedCount}</p>
                    <p className="text-xs text-muted-foreground">Deals Won</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <MiniSparkline data={[1, 2, 1, 3, 2, 4, 3]} color="emerald" className="hidden sm:block" />
                    <div className="flex items-center gap-0.5 text-emerald-600">
                      <TrendingUp className="h-3 w-3" />
                      <span className="text-[10px] font-medium">+8.1%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card className={cn('relative overflow-hidden hover-lift', 'stat-card-gradient-orange')}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
                        <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-500" />
                      </div>
                    </div>
                    <p className="text-lg sm:text-xl font-bold">${Math.round(avgDealValue).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Avg Deal Value</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <MiniSparkline data={[50, 45, 55, 48, 52, 60, 58]} color="slate" className="hidden sm:block" />
                    <div className="flex items-center gap-0.5 text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      <span className="text-[10px] font-medium">+4.7%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Pipeline Funnel + Win/Loss Analysis Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PipelineFunnel deals={deals} />
          <WinLossAnalysis deals={deals} />
        </div>

        {/* Deal Velocity Sparkline */}
        {deals && deals.length > 0 && (
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                  Deal Velocity
                </CardTitle>
                {dealVelocity !== null && (
                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25 border text-xs">
                    {dealVelocity}d avg cycle
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-end gap-1 h-16">
                    {(() => {
                      // Last 8 weeks deal creation data
                      const now = new Date();
                      const weekData = Array.from({ length: 8 }).map((_, i) => {
                        const weekStart = new Date(now);
                        weekStart.setDate(weekStart.getDate() - (7 - i) * 7);
                        const weekEnd = new Date(weekStart);
                        weekEnd.setDate(weekEnd.getDate() + 7);
                        return deals.filter((d) => {
                          const created = new Date(d.createdAt);
                          return created >= weekStart && created < weekEnd;
                        }).length;
                      });
                      const maxVal = Math.max(...weekData, 1);
                      return weekData.map((count, i) => {
                        const heightPct = (count / maxVal) * 100;
                        return (
                          <motion.div
                            key={i}
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            transition={{ delay: i * 0.06, duration: 0.3 }}
                            className="flex-1 origin-bottom flex flex-col items-center gap-1"
                          >
                            <span className="text-[9px] text-muted-foreground tabular-nums">{count}</span>
                            <div
                              className="w-full rounded-t transition-all duration-300"
                              style={{
                                height: `${Math.max(heightPct, 8)}%`,
                                background: `linear-gradient(180deg, oklch(0.75 0.15 70), oklch(0.696 0.17 162.48))`,
                                minHeight: '4px',
                              }}
                            />
                          </motion.div>
                        );
                      });
                    })()}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-muted-foreground">8 weeks ago</span>
                    <span className="text-[9px] text-muted-foreground">This week</span>
                  </div>
                </div>
                <MiniSparkline
                  data={Array.from({ length: 10 }).map((_, i) => (i * 3 + 2) % 8)}
                  color="amber"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Revenue Waterfall + Deal Velocity */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-500" />
              Revenue Waterfall
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(() => {
                const waterfallData = STATUS_ORDER.map((status) => {
                  const statusDeals = deals?.filter((d) => d.status === status) ?? [];
                  const value = statusDeals.reduce((sum, d) => sum + (d.proposedPrice ?? 0), 0);
                  return { status, value, count: statusDeals.length, config: DEAL_STATUS_CONFIG[status] };
                }).filter((d) => d.count > 0);

                const maxValue = Math.max(...waterfallData.map((d) => d.value), 1);

                return waterfallData.map((item, i) => {
                  const pct = (item.value / maxValue) * 100;
                  return (
                    <div key={item.status} className="flex items-center gap-3">
                      <div className={cn('h-3 w-3 rounded-full shrink-0', item.config.color)} />
                      <span className="text-xs w-20 shrink-0 text-muted-foreground">{item.config.label}</span>
                      <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden relative">
                        <div
                          className={cn('waterfall-bar h-full rounded', item.config.color, 'opacity-80')}
                          style={{ width: `${pct}%`, animationDelay: `${i * 100}ms` }}
                        />
                        <span className="absolute inset-0 flex items-center px-2 text-[10px] font-mono font-medium text-foreground/80">
                          ${item.value.toLocaleString()}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
                        {item.count}
                      </Badge>
                    </div>
                  );
                });
              })()}
            </div>
            {/* Deal Velocity */}
            {dealVelocity !== null && (
              <div className="mt-4 pt-3 border-t flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Deal Velocity</span>
                <span className="text-sm font-bold text-primary">{dealVelocity}d</span>
                <span className="text-[10px] text-muted-foreground">avg draft → accepted</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deal Flow - Enhanced with clickable nodes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-emerald-500" />
              Deal Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 overflow-x-auto pb-2 flex-wrap sm:flex-nowrap">
              {STATUS_ORDER.map((status, i) => {
                const config = DEAL_STATUS_CONFIG[status];
                const Icon = config.icon;
                const count = statusCounts[status]?.count ?? 0;
                const value = statusCounts[status]?.value ?? 0;
                const isActive = statusFilter === status;
                const isTerminal = status === 'accepted' || status === 'rejected';

                return (
                  <React.Fragment key={status}>
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setStatusFilter(isActive ? 'all' : status)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 min-w-[64px] sm:min-w-[80px] p-2 sm:p-3 rounded-xl transition-all duration-200 cursor-pointer active:scale-95',
                        isActive
                          ? 'bg-primary/10 ring-2 ring-primary/30 shadow-sm'
                          : 'hover:bg-muted/50',
                      )}
                    >
                      <div className={cn(
                        'h-7 w-7 sm:h-9 sm:w-9 rounded-full flex items-center justify-center transition-shadow breathing-pulse',
                        config.color,
                        isActive && 'shadow-lg ring-2 ring-offset-2 ring-offset-background',
                        isActive && status === 'draft' && 'ring-slate-500/40',
                        isActive && status === 'sent' && 'ring-sky-500/40',
                        isActive && status === 'viewed' && 'ring-cyan-500/40',
                        isActive && status === 'negotiating' && 'ring-amber-500/40',
                        isActive && status === 'accepted' && 'ring-emerald-500/40',
                        isActive && status === 'rejected' && 'ring-red-500/40',
                      )}>
                        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                      </div>
                      <span className="text-xs font-medium">{config.label}</span>
                      <div className="flex flex-col items-center gap-0.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                          {count}
                        </Badge>
                        {value > 0 && (
                          <span className="text-[9px] text-muted-foreground">
                            ${(value / 1000).toFixed(0)}k
                          </span>
                        )}
                      </div>
                    </motion.button>
                    {i < STATUS_ORDER.length - 1 && !isTerminal && (
                      <div className="flex items-center gap-0 min-w-[24px]">
                        <div className="h-px flex-1 bg-border" />
                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 -mx-1" />
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    {isTerminal && i < STATUS_ORDER.length - 1 && status === 'accepted' && (
                      <div className="flex items-center gap-0 min-w-[24px]">
                        <div className="h-px flex-1 bg-border" />
                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 -mx-1" />
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            {statusFilter !== 'all' && (
              <div className="mt-3 pt-2 border-t flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Filtering by: <strong>{DEAL_STATUS_CONFIG[statusFilter].label}</strong>
                  {' '}({filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setStatusFilter('all')}
                >
                  Clear filter
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by business name or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 gradient-border-focus"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setStatusFilter('all')}
            >
              All ({totalCount})
            </Button>
            {STATUS_ORDER.map((status) => {
              const config = DEAL_STATUS_CONFIG[status];
              const count = statusCounts[status]?.count ?? 0;
              if (count === 0) return null;
              return (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'h-8 text-xs gap-1',
                    statusFilter === status && config.color,
                  )}
                  onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
                >
                  <config.icon className="h-3 w-3" />
                  {config.label} ({count})
                </Button>
              );
            })}
            {/* Sort Dropdown */}
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="h-8 w-[130px] sm:w-[160px] text-xs">
                <ArrowUpDown className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Deals List - Enhanced */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {sortedDeals.length > 0 ? (
              sortedDeals.map((deal) => {
                const dealLead = deal.lead ?? leads?.find((l) => l.id === deal.leadId);
                const statusConfig = DEAL_STATUS_CONFIG[deal.status as keyof typeof DEAL_STATUS_CONFIG] ?? DEAL_STATUS_CONFIG.draft;
                const isSelected = selectedDealId === deal.id;
                const nextStatus = STATUS_ADVANCEMENT[deal.status];
                const canAdvance = nextStatus !== null && nextStatus !== undefined;
                const agingInfo = getTimeInStageInfo(deal.updatedAt, deal.status);
                const isAging = agingInfo.needsAttention;
                const agingThreshold = DEAL_AGING_THRESHOLDS[deal.status];
                const agingGlow = isAging && agingThreshold ? agingThreshold.glowClass : '';

                return (
                  <motion.div
                    key={deal.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    layout
                  >
                    <Card
                      className={cn(
                        'transition-all duration-200 cursor-pointer hover:shadow-xl hover:-translate-y-1 lift-3d',
                        'border-l-4',
                        statusConfig.borderColor,
                        isSelected && 'ring-2 ring-primary/30 shadow-lg',
                        agingGlow,
                        deal.status === 'negotiating' && 'glow-pulse-amber',
                      )}
                      onClick={() => {
                        setSelectedDealId(isSelected ? null : deal.id);
                        setProposalPreview(null);
                      }}
                    >
                      {/* Deal Probability Bar */}
                      <div className="h-[3px] w-full bg-muted/30 rounded-t-lg overflow-hidden">
                        <div
                          className="deal-probability-bar h-full rounded-t-lg"
                          style={{ width: `${DEAL_PROBABILITY[deal.status] ?? 0}%` }}
                        />
                      </div>
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="text-sm font-semibold">{deal.projectType || 'Untitled Deal'}</h4>
                              <Badge className={cn('text-[10px] text-white', statusConfig.color)}>
                                {statusConfig.label}
                              </Badge>
                              {/* Deal Aging Badge */}
                              {agingInfo.days > 0 && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] gap-0.5 font-medium',
                                    isAging
                                      ? 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {isAging && <CalendarClock className="h-3 w-3" />}
                                  ⏰ {agingInfo.label}
                                </Badge>
                              )}
                              {agingInfo.days < 1 && (
                                <span className={cn('text-[10px] font-medium flex items-center gap-0.5', agingInfo.color)}>
                                  {agingInfo.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              For: {dealLead?.businessName ?? 'Unknown'} · {dealLead?.niche ?? ''}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 truncate">{
                              (() => {
                                try {
                                  const parsed = JSON.parse(deal.projectScope || '{}');
                                  if (parsed.items && Array.isArray(parsed.items)) return parsed.items.join(', ');
                                  return deal.projectScope || deal.projectType || '';
                                } catch {
                                  return deal.projectScope || deal.projectType || '';
                                }
                              })()
                            }</p>
                            {/* Mini Timeline Steps */}
                            <DealTimelineSteps currentStatus={deal.status as Deal['status']} />
                          </div>
                          <div className="text-right shrink-0">
                            <div className="flex items-center gap-1 justify-end">
                              <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                {formatDealValue(deal.proposedPrice ?? 0)}
                              </p>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{deal.currency}</p>
                            <div className="flex items-center gap-1 justify-end mt-1">
                              <Clock className="h-3 w-3 text-muted-foreground/50" />
                              <span className="text-[10px] text-muted-foreground">
                                {getTimeInStage(deal.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Expanded Deal Details */}
                        <AnimatePresence>
                          {isSelected && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div className="mt-4 pt-4 border-t space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <h5 className="text-xs font-semibold text-muted-foreground uppercase">Details</h5>
                                    <div className="space-y-1.5 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Project</span>
                                        <span className="font-medium">{deal.projectType}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Client</span>
                                        <span className="font-medium">{dealLead?.businessName ?? 'Unknown'}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Value</span>
                                        <span className="font-semibold text-emerald-600">${(deal.proposedPrice ?? 0).toLocaleString()} {deal.currency}</span>
                                      </div>
                                      {deal.finalPrice && (
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Final Price</span>
                                          <span className="font-semibold text-emerald-600">${deal.finalPrice.toLocaleString()} {deal.currency}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Status</span>
                                        <Badge className={cn('text-[10px] text-white', statusConfig.color)}>
                                          {statusConfig.label}
                                        </Badge>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Created</span>
                                        <span className="text-xs">{new Date(deal.createdAt).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <h5 className="text-xs font-semibold text-muted-foreground uppercase">Scope</h5>
                                    <p className="text-sm text-muted-foreground">{
                                      (() => {
                                        try {
                                          const parsed = JSON.parse(deal.projectScope || '{}');
                                          if (parsed.items && Array.isArray(parsed.items)) return parsed.items.join(', ');
                                          return deal.projectScope || 'No scope defined';
                                        } catch {
                                          return deal.projectScope || 'No scope defined';
                                        }
                                      })()
                                    }</p>
                                  </div>
                                </div>

                                {/* Status Advancement Buttons */}
                                <div className="flex flex-wrap gap-2">

                                  {/* Deal Notes */}
                                  <div className="w-full mb-2">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <StickyNote className="h-3.5 w-3.5 text-primary" />
                                      <h5 className="text-xs font-semibold text-muted-foreground uppercase">Deal Notes</h5>
                                    </div>
                                    <Textarea
                                      placeholder="Add notes about this deal..."
                                      value={dealNotes[deal.id] ?? deal.notes ?? ''}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        setDealNotes(prev => ({ ...prev, [deal.id]: e.target.value }));
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      rows={2}
                                      className="text-sm resize-none border-primary/20 focus:ring-primary/30"
                                    />
                                    {(dealNotes[deal.id] !== undefined && dealNotes[deal.id] !== (deal.notes ?? '')) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="mt-1.5 text-xs gap-1 border-primary/20"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updateDealMutation.mutate({
                                            id: deal.id,
                                            data: { notes: dealNotes[deal.id] },
                                          });
                                        }}
                                        disabled={updateDealMutation.isPending}
                                      >
                                        {updateDealMutation.isPending ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          'Save Notes'
                                        )}
                                      </Button>
                                    )}
                                  </div>

                                  {canAdvance && (
                                    <Button
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAdvanceStatus(deal.id, deal.status as Deal['status']);
                                      }}
                                      disabled={updateDealMutation.isPending}
                                      className="gap-1 active:scale-95 transition-all min-h-[36px]"
                                    >
                                      {updateDealMutation.isPending ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <ArrowRight className="h-3.5 w-3.5" />
                                      )}
                                      Move to {DEAL_STATUS_CONFIG[nextStatus]?.label}
                                    </Button>
                                  )}
                                  {deal.status !== 'rejected' && deal.status !== 'accepted' && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSetRejected(deal.id);
                                      }}
                                      disabled={updateDealMutation.isPending}
                                      className="gap-1 active:scale-95 transition-all min-h-[36px]"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                      Reject
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDealId(deal.id);
                                      proposalMutation.mutate();
                                    }}
                                    disabled={proposalMutation.isPending}
                                    className="gap-1 active:scale-95 transition-all min-h-[36px]"
                                  >
                                    {proposalMutation.isPending ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Sparkles className="h-3.5 w-3.5" />
                                    )}
                                    AI Proposal
                                  </Button>
                                </div>

                                {/* AI Proposal Loading State */}
                                {proposalMutation.isPending && !proposalPreview && (
                                  <div className="mt-4 p-4 bg-muted rounded-lg space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Sparkles className="h-4 w-4 text-emerald-500 animate-pulse" />
                                      <h5 className="text-xs font-semibold text-muted-foreground uppercase">
                                        Generating AI Proposal...
                                      </h5>
                                    </div>
                                    <div className="space-y-2">
                                      <Skeleton className="h-5 w-2/3" />
                                      <Skeleton className="h-4 w-full" />
                                      <Skeleton className="h-4 w-5/6" />
                                      <Skeleton className="h-4 w-4/6" />
                                      <div className="pt-2" />
                                      <Skeleton className="h-5 w-1/2" />
                                      <Skeleton className="h-4 w-full" />
                                      <Skeleton className="h-4 w-3/4" />
                                    </div>
                                  </div>
                                )}

                                {/* AI Proposal Preview */}
                                {proposalPreview && (
                                  <div className="mt-4 border rounded-lg overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-500/10 border-b">
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-emerald-500" />
                                        <h5 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">
                                          AI-Generated Proposal
                                        </h5>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs gap-1"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(proposalPreview);
                                            toast.success('Proposal copied to clipboard');
                                          }}
                                        >
                                          <Copy className="h-3 w-3" />
                                          Copy
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs gap-1"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const blob = new Blob([proposalPreview], { type: 'text/markdown' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `proposal-${selectedDeal?.projectType?.replace(/\s+/g, '-').toLowerCase() || 'deal'}.md`;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);
                                            toast.success('Proposal downloaded');
                                          }}
                                        >
                                          <FileDown className="h-3 w-3" />
                                          Download
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs gap-1"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            proposalMutation.mutate();
                                          }}
                                          disabled={proposalMutation.isPending}
                                        >
                                          {proposalMutation.isPending ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <RefreshCw className="h-3 w-3" />
                                          )}
                                          Regenerate
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="p-4 bg-muted/50 max-h-96 overflow-y-auto custom-scrollbar">
                                      <div className="prose prose-sm dark:prose-invert max-w-none">
                                        <ReactMarkdown>{proposalPreview}</ReactMarkdown>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      {statusFilter !== 'all' || searchQuery
                        ? 'No Matching Deals'
                        : 'No Deals Yet'}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      {statusFilter !== 'all' || searchQuery
                        ? 'Try adjusting your filters or search query to find deals.'
                        : 'Create your first deal to start tracking proposals and revenue.'}
                    </p>
                    {(statusFilter !== 'all' || searchQuery) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 active:scale-95 transition-all min-h-[36px]"
                        onClick={() => {
                          setStatusFilter('all');
                          setSearchQuery('');
                        }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ScrollArea>
  );
}
