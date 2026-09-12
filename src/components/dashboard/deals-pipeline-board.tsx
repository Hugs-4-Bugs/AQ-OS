'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Deals Pipeline Board
// Phase 7: Kanban-style deal management board
//
// Features:
// - Pipeline columns with deal cards
// - Deal value badges with currency formatting
// - Drag-and-drop visual (click to move)
// - Stage summary with total values
// - Empty state for stages with no deals
// - Responsive horizontal scroll
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HandshakeIcon,
  DollarSign,
  Clock,
  ArrowRight,
  MoreHorizontal,
  Plus,
  Building2,
  User,
  Calendar,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  TrendingUp,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { fetchDeals } from '@/lib/api';

// ── Types ───────────────────────────────────────────────────────
interface DealCard {
  id: string;
  title: string;
  businessName: string;
  value: number;
  stage: string;
  contactName?: string;
  daysInStage: number;
  probability: number;
  lastActivity: string;
}

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  deals: DealCard[];
}

// ── Stage Config ────────────────────────────────────────────────
const STAGE_CONFIG = [
  { id: 'discovery', name: 'Discovery', color: 'text-slate-500', bgColor: 'bg-slate-500/15', borderColor: 'border-slate-500/30' },
  { id: 'qualified', name: 'Qualified', color: 'text-blue-500', bgColor: 'bg-blue-500/15', borderColor: 'border-blue-500/30' },
  { id: 'proposal', name: 'Proposal', color: 'text-amber-500', bgColor: 'bg-amber-500/15', borderColor: 'border-amber-500/30' },
  { id: 'negotiation', name: 'Negotiation', color: 'text-purple-500', bgColor: 'bg-purple-500/15', borderColor: 'border-purple-500/30' },
  { id: 'won', name: 'Won', color: 'text-emerald-500', bgColor: 'bg-emerald-500/15', borderColor: 'border-emerald-500/30' },
  { id: 'lost', name: 'Lost', color: 'text-red-500', bgColor: 'bg-red-500/15', borderColor: 'border-red-500/30' },
];

// ── Format Currency ─────────────────────────────────────────────
function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

// ── Deal Card Component ─────────────────────────────────────────
function DealCardComponent({ deal, index }: { deal: DealCard; index: number }) {
  const probColor = deal.probability >= 70 ? 'text-emerald-500' : deal.probability >= 40 ? 'text-amber-500' : 'text-red-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="p-3 rounded-lg bg-card border border-border/50 hover:border-primary/20 hover:shadow-md transition-all duration-200 cursor-pointer group"
    >
      {/* Business Name */}
      <p className="text-xs font-semibold truncate mb-1 group-hover:text-primary transition-colors">
        {deal.businessName}
      </p>

      {/* Deal Value */}
      <p className="text-sm font-bold tabular-nums mb-2">{formatCurrency(deal.value)}</p>

      {/* Meta Info */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
        {deal.contactName && (
          <span className="flex items-center gap-0.5">
            <User className="h-2.5 w-2.5" />
            {deal.contactName}
          </span>
        )}
        <span className="flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" />
          {deal.daysInStage}d
        </span>
      </div>

      {/* Probability */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${deal.probability}%` }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              className={cn('h-full rounded-full', deal.probability >= 70 ? 'bg-emerald-500' : deal.probability >= 40 ? 'bg-amber-500' : 'bg-red-500')}
            />
          </div>
        </div>
        <span className={cn('text-[9px] font-bold tabular-nums ml-2', probColor)}>
          {deal.probability}%
        </span>
      </div>

      {/* Last Activity */}
      <p className="text-[9px] text-muted-foreground/70 mt-2 truncate">
        {deal.lastActivity}
      </p>
    </motion.div>
  );
}

// ── Main Component ──────────────────────────────────────────────
export default function DealsPipelineBoard() {
  const { data: deals, isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: fetchDeals,
  });

  // Generate mock deal cards from real data or fallback
  const stages = useMemo((): PipelineStage[] => {
    const mockDeals: DealCard[] = (deals ?? []).map((deal: any, i: number) => ({
      id: deal.id || `deal-${i}`,
      title: deal.projectType || 'Website Redesign',
      businessName: deal.lead?.businessName || 'Unknown Company',
      value: deal.value || 0,
      stage: deal.status || 'discovery',
      contactName: deal.lead?.contactName || undefined,
      daysInStage: deal.daysInStage || 0,
      probability: deal.probability || 0,
      lastActivity: deal.lastActivity || '—',
    }));

    const allDeals = [...mockDeals];

    return STAGE_CONFIG.map(stage => ({
      ...stage,
      deals: allDeals.filter(d => d.stage === stage.id),
    }));
  }, [deals]);

  // Stage totals
  const stageTotals = useMemo(() =>
    stages.map(s => ({
      ...s,
      totalValue: s.deals.reduce((sum, d) => sum + d.value, 0),
      avgProbability: s.deals.length > 0 ? Math.round(s.deals.reduce((sum, d) => sum + d.probability, 0) / s.deals.length) : 0,
    })),
    [stages]
  );

  const totalPipelineValue = stageTotals.reduce((s, st) => s + st.totalValue, 0);
  const weightedPipeline = stageTotals.reduce((s, st) => s + Math.round(st.totalValue * st.avgProbability / 100), 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-72 h-[400px] rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <HandshakeIcon className="h-4 w-4 text-primary" />
            Pipeline Board
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stages.reduce((s, st) => s + st.deals.length, 0)} deals across {stages.length} stages
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-xs">
            <div className="text-center">
              <p className="font-bold tabular-nums">{formatCurrency(totalPipelineValue)}</p>
              <p className="text-[9px] text-muted-foreground">Pipeline</p>
            </div>
            <div className="text-center">
              <p className="font-bold tabular-nums text-primary">{formatCurrency(weightedPipeline)}</p>
              <p className="text-[9px] text-muted-foreground">Weighted</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Deal
          </Button>
        </div>
      </div>

      {/* Pipeline Columns */}
      <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
        {stageTotals.map((stage, stageIndex) => (
          <div
            key={stage.id}
            className="shrink-0 w-72 snap-start"
          >
            {/* Stage Header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <div className={cn('w-2 h-2 rounded-full', stage.bgColor.replace('/15', ''))} />
                <span className="text-xs font-semibold">{stage.name}</span>
                <Badge variant="outline" className="text-[9px] px-1 h-4 tabular-nums">
                  {stage.deals.length}
                </Badge>
              </div>
              <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                {formatCurrency(stage.totalValue)}
              </span>
            </div>

            {/* Stage Content */}
            <div className={cn(
              'rounded-xl p-2 min-h-[200px] border transition-colors',
              stage.bgColor, stage.borderColor
            )}>
              {stage.deals.length > 0 ? (
                <div className="space-y-2">
                  <AnimatePresence>
                    {stage.deals.map((deal, i) => (
                      <DealCardComponent key={deal.id} deal={deal} index={i} />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[120px] text-muted-foreground/40">
                  <Building2 className="h-8 w-8 mb-2" />
                  <p className="text-[10px]">No deals</p>
                </div>
              )}

              {/* Stage Footer */}
              {stage.deals.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground">
                    Avg: {stage.avgProbability}%
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-0.5 text-primary">
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
