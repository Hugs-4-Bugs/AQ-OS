'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  MapPin,
  TrendingUp,
  Inbox,
  ChevronRight,
  Activity,
  ArrowDown,
  Users,
  DollarSign,
  Clock,
  BarChart3,
  Search,
  Upload,
  Eye,
  MoreHorizontal,
  Send,
  Sparkles,
  Timer,
  GripVertical,
  LayoutGrid,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetchLeads } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_COLORS,
  type Lead,
  type LeadStage,
} from '@/lib/types';
import { toast } from 'sonner';

// ─── Revenue Value Mapping ───────────────────────────────
const REVENUE_VALUE: Record<string, number> = {
  premium: 10000,
  high: 5000,
  medium: 2000,
  low: 500,
};

const URGENCY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-slate-400',
};

const REVENUE_BADGE: Record<string, string> = {
  premium: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  high: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

// Stage colors for column headers
const STAGE_HEADER_COLORS: Record<string, string> = {
  discovered: 'bg-slate-500',
  analyzed: 'bg-cyan-500',
  contacted: 'bg-blue-500',
  replied: 'bg-amber-500',
  discussion: 'bg-orange-500',
  proposal: 'bg-purple-500',
  negotiation: 'bg-pink-500',
  won: 'bg-emerald-500',
  lost: 'bg-red-500',
};

// ─── Helper Functions ────────────────────────────────────
function getDaysInStage(lead: Lead): number {
  const updated = new Date(lead.updatedAt);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24)));
}

function getScoreGradient(score: number): string {
  if (score >= 75) return 'from-emerald-500/[0.04] to-transparent';
  if (score >= 50) return 'from-blue-500/[0.04] to-transparent';
  if (score >= 25) return 'from-amber-500/[0.04] to-transparent';
  return 'from-transparent to-transparent';
}

// ─── Pipeline Summary Stats ──────────────────────────────
function PipelineSummaryStats({ leads }: { leads: Lead[] }) {
  const totalLeads = leads.length;
  const avgConversion = totalLeads > 0
    ? Math.round(leads.reduce((sum, l) => sum + l.conversionScore, 0) / totalLeads)
    : 0;
  const pipelineValue = leads.reduce((sum, l) => sum + (REVENUE_VALUE[l.revenuePotential] ?? 0), 0);

  const stats = [
    { icon: Users, label: 'Total Leads', value: totalLeads, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { icon: BarChart3, label: 'Avg Score', value: `${avgConversion}%`, color: 'text-sky-500', bg: 'bg-sky-500/10' },
    { icon: DollarSign, label: 'Pipeline Value', value: `$${pipelineValue.toLocaleString()}`, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { icon: Clock, label: 'Won', value: leads.filter(l => l.stage === 'won').length, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="card-glow glass-card">
              <CardContent className="p-2 sm:p-3 flex items-center gap-2 sm:gap-3">
                <div className={cn('rounded-lg p-2', stat.bg)}>
                  <Icon className={cn('h-4 w-4', stat.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm sm:text-lg font-bold tracking-tight tabular-nums">{stat.value}</p>
                  <p className="text-[9px] sm:text-[11px] text-muted-foreground truncate">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Sortable Pipeline Card ──────────────────────────────
function SortablePipelineCard({
  lead,
  onCardClick,
}: {
  lead: Lead;
  onCardClick: (lead: Lead) => void;
}) {
  const { setSelectedLeadId, setActiveTab } = useAppStore();
  const daysInStage = getDaysInStage(lead);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lead.id,
    data: { lead },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className={cn(
          'cursor-pointer hover:shadow-lg transition-all duration-200 hover:border-primary/30 hover:-translate-y-0.5 group',
          'bg-gradient-to-br',
          getScoreGradient(lead.conversionScore),
          isDragging && 'shadow-xl ring-2 ring-primary/40'
        )}
        onClick={() => onCardClick(lead)}
      >
        <CardContent className="p-2.5 sm:p-3 space-y-1.5 sm:space-y-2">
          <div className="flex items-start justify-between gap-1.5">
            <div className="flex items-start gap-1 min-w-0 flex-1">
              <button
                className="mt-0.5 cursor-grab active:cursor-grabbing touch-none"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
              </button>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium truncate">{lead.businessName}</p>
                {lead.ownerName && (
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{lead.ownerName}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {daysInStage > 0 && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[8px] sm:text-[9px] px-1 py-0 gap-0.5',
                    daysInStage >= 14
                      ? 'text-red-500 border-red-500/30 bg-red-500/10'
                      : daysInStage >= 7
                        ? 'text-amber-500 border-amber-500/30 bg-amber-500/10'
                        : 'text-muted-foreground border-muted'
                  )}
                >
                  <Timer className="h-2.5 w-2.5" />
                  {daysInStage}d
                </Badge>
              )}
              <div className={cn('h-2 w-2 rounded-full mt-1.5', URGENCY_DOT[lead.urgency])} />
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap pl-5">
            {lead.niche && (
              <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1 py-0">
                {lead.niche}
              </Badge>
            )}
            {lead.city && (
              <span className="flex items-center gap-0.5 text-[9px] sm:text-[10px] text-muted-foreground">
                <MapPin className="h-2 w-2 sm:h-2.5 sm:w-2.5" />{lead.city}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between pl-5">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary" />
              <span className="text-[10px] sm:text-xs font-mono font-medium text-primary">
                {lead.conversionScore}%
              </span>
            </div>
            <Badge variant="outline" className={cn('text-[9px] sm:text-[10px] px-1 py-0', REVENUE_BADGE[lead.revenuePotential])}>
              {lead.revenuePotential}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Stage Column ────────────────────────────────────────
function StageColumn({
  stage,
  leads,
  onCardClick,
}: {
  stage: LeadStage;
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
}) {
  const { setActiveTab } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);
  const stageValue = leads.reduce((sum, l) => sum + (REVENUE_VALUE[l.revenuePotential] ?? 0), 0);
  const avgConversion = leads.length > 0
    ? Math.round(leads.reduce((sum, l) => sum + l.conversionScore, 0) / leads.length)
    : 0;

  return (
    <div className="flex-1 min-w-[260px] sm:min-w-[280px] snap-start space-y-3">
      {/* Column Header */}
      <div className="sticky top-0 bg-background/80 backdrop-blur-sm py-2 z-10 rounded-lg">
        <div className="flex items-center gap-2">
          <div className={cn('h-3 w-3 rounded-full shrink-0', STAGE_HEADER_COLORS[stage])} />
          <h3 className="text-sm font-semibold">{STAGE_LABELS[stage]}</h3>
          <Badge className="text-[11px] px-2 py-0.5 ml-auto border-0 bg-primary/10 text-primary font-bold">
            {leads.length}
          </Badge>
          {/* Collapse toggle (mobile) */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 lg:hidden"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </Button>
        </div>
        {!collapsed && leads.length > 0 && (
          <div className="flex items-center justify-between mt-1.5 gap-2">
            {stageValue > 0 && (
              <span className="text-[10px] text-muted-foreground">${stageValue.toLocaleString()}</span>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <div className="h-1 w-12 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full',
                    avgConversion >= 75 ? 'bg-emerald-500' : avgConversion >= 50 ? 'bg-amber-500' : avgConversion >= 25 ? 'bg-orange-500' : 'bg-red-500'
                  )}
                  style={{ width: `${avgConversion}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground font-mono">{avgConversion}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Sortable Cards — internal scroll so the page doesn't scroll vertically */}
      {!collapsed && (
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          <div
            className="space-y-2 min-h-[60px] overflow-y-auto custom-scrollbar pr-1"
            style={{ maxHeight: 'calc(100vh - 200px)' }}
          >
            <AnimatePresence mode="popLayout">
              {leads.length > 0 ? (
                leads.map((lead) => (
                  <SortablePipelineCard
                    key={lead.id}
                    lead={lead}
                    onCardClick={onCardClick}
                  />
                ))
              ) : (
                <EmptyColumnState stage={stage} />
              )}
            </AnimatePresence>
          </div>
        </SortableContext>
      )}
    </div>
  );
}

// ─── Empty Column State ──────────────────────────────────
function EmptyColumnState({ stage }: { stage: LeadStage }) {
  const { setActiveTab } = useAppStore();
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="border border-dashed rounded-lg p-4 text-center space-y-2 group hover:border-primary/20 transition-colors">
        <Inbox className="h-5 w-5 text-muted-foreground/30 mx-auto" />
        <p className="text-xs text-muted-foreground">No leads in {STAGE_LABELS[stage]}</p>
        <Button
          variant="ghost"
          size="sm"
          className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity h-6"
          onClick={() => setActiveTab('discover')}
        >
          <Plus className="h-3 w-3 mr-1" /> Add lead
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Empty Pipeline State ────────────────────────────────
function EmptyPipelineState() {
  const { setActiveTab } = useAppStore();
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-16 px-4">
      <div className="relative mb-6">
        <div className="relative rounded-full bg-primary/10 p-6">
          <LayoutGrid className="h-12 w-12 text-primary" />
        </div>
      </div>
      <h3 className="text-2xl font-bold mb-2">Start Building Your Pipeline</h3>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-8">
        Discover new businesses and track your deals as they move through each stage.
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={() => setActiveTab('discover')} className="gap-2" size="lg">
          <Search className="h-4 w-4" />Discover Leads
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Drag Overlay Card ───────────────────────────────────
function DragOverlayCard({ lead }: { lead: Lead }) {
  return (
    <Card className="shadow-xl ring-2 ring-primary/40 bg-gradient-to-br max-w-[280px]" style={{ background: 'var(--card)' }}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{lead.businessName}</p>
            <p className="text-xs text-muted-foreground">{lead.niche}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-primary">{lead.conversionScore}%</span>
          <Badge variant="outline" className="text-[9px]">{STAGE_LABELS[lead.stage]}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Pipeline Tab ───────────────────────────────────
export default function PipelineTab() {
  const queryClient = useQueryClient();
  const { setSelectedLeadId, setActiveTab } = useAppStore();
  const [activeLeadId, setActiveLeadId] = useState<UniqueIdentifier | null>(null);

  const { data: leadsResult, isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => fetchLeads({ limit: 200 }),
  });
  const leads = leadsResult?.leads ?? [];

  // Group leads by stage (declared before use)
  const leadsByStage = React.useMemo(() => {
    const grouped: Record<string, Lead[]> = {};
    for (const stage of STAGE_ORDER) {
      grouped[stage] = [];
    }
    for (const lead of leads) {
      if (!grouped[lead.stage]) grouped[lead.stage] = [];
      grouped[lead.stage].push(lead);
    }
    for (const stage of Object.keys(grouped)) {
      grouped[stage].sort((a, b) => b.conversionScore - a.conversionScore);
    }
    return grouped;
  }, [leads]);

  // Move stage mutation using the dedicated endpoint
  const moveStageMutation = useMutation({
    mutationFn: async ({ leadId, stage }: { leadId: string; stage: string }) => {
      const res = await fetch(`/api/leads/${leadId}/move-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to move lead');
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Moved to ${STAGE_LABELS[variables.stage as LeadStage]}`);
    },
    onError: (error: Error) => {
      toast.error('Failed to move lead', { description: error.message });
    },
  });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveLeadId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveLeadId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const overId = over.id as string;

    let targetStage: string | null = null;

    // Check if overId is a stage name
    if (STAGE_ORDER.includes(overId as LeadStage)) {
      targetStage = overId;
    } else {
      // Find the stage of the lead we dropped on
      for (const [stage, stageLeads] of Object.entries(leadsByStage)) {
        if (stageLeads.some(l => l.id === overId)) {
          targetStage = stage;
          break;
        }
      }
    }

    if (targetStage) {
      const lead = leads.find(l => l.id === leadId);
      if (lead && lead.stage !== targetStage) {
        moveStageMutation.mutate({ leadId, stage: targetStage });
      }
    }
  }, [leads, leadsByStage, moveStageMutation]);

  const handleCardClick = useCallback((lead: Lead) => {
    setSelectedLeadId(lead.id);
    setActiveTab('leads');
  }, [setSelectedLeadId, setActiveTab]);

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {STAGE_ORDER.slice(0, 5).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-8 w-24" />
              {Array.from({ length: 2 }).map((_, j) => (
                <Skeleton key={j} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <ScrollArea className="h-full custom-scrollbar">
        <div className="p-4 lg:p-6">
          <EmptyPipelineState />
        </div>
      </ScrollArea>
    );
  }

  const activeLead = leads.find(l => l.id === activeLeadId);

  return (
    <ScrollArea className="h-full custom-scrollbar">
      <div className="p-4 lg:p-6 space-y-4 pb-20 lg:pb-6">
        {/* Pipeline Stats */}
        <PipelineSummaryStats leads={leads} />

        {/* Mobile scroll hint */}
        <div className="lg:hidden mb-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            ← Scroll horizontally to see all stages →
          </p>
        </div>

        {/* Kanban Board */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex items-start gap-3 overflow-x-auto pb-4 lg:overflow-visible snap-x snap-mandatory [-webkit-overflow-scrolling:touch] scrollbar-none">
            {STAGE_ORDER.map((stage) => (
              <StageColumn
                key={stage}
                stage={stage}
                leads={leadsByStage[stage] || []}
                onCardClick={handleCardClick}
              />
            ))}
          </div>

          <DragOverlay>
            {activeLead && <DragOverlayCard lead={activeLead} />}
          </DragOverlay>
        </DndContext>
      </div>
    </ScrollArea>
  );
}
