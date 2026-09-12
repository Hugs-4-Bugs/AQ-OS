'use client';

import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Mail,
  Phone,
  Globe,
  MapPin,
  Tag,
  TrendingUp,
  TrendingDown,
  Trophy,
  AlertTriangle,
  Clock,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Lead, LeadStage } from '@/lib/types';
import { STAGE_LABELS, STAGE_COLORS } from '@/lib/types';

interface LeadCompareDialogProps {
  leads: Lead[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Stage badge styling with better contrast (matches leads-tab)
const STAGE_BADGE_STYLES: Record<string, string> = {
  discovered: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  analyzed: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  contacted: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  replied: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  discussion: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  proposal: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  negotiation: 'bg-pink-500/15 text-pink-400 border-pink-500/25',
  won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  lost: 'bg-red-500/15 text-red-400 border-red-500/25',
};

const URGENCY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-500 border-red-500/25',
  high: 'bg-orange-500/15 text-orange-500 border-orange-500/25',
  medium: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/25',
  low: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

const REVENUE_COLORS: Record<string, string> = {
  premium: 'text-emerald-500',
  high: 'text-blue-500',
  medium: 'text-amber-500',
  low: 'text-slate-500',
};

function MiniScoreBar({ value, max = 100, isBest = false }: { value: number; max?: number; isBest?: boolean }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isBest ? 'bg-emerald-500' : pct >= 75 ? 'score-bar-gradient-high' : pct >= 50 ? 'score-bar-gradient-medium' : 'score-bar-gradient-low'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('text-xs font-mono tabular-nums', isBest && 'text-emerald-500 font-semibold')}>{value}</span>
    </div>
  );
}

function ComparisonArrow({ isAbove, isBelow }: { isAbove: boolean; isBelow: boolean }) {
  if (isAbove) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-emerald-500"><TrendingUp className="h-3.5 w-3.5" /></span>
        </TooltipTrigger>
        <TooltipContent>Above average</TooltipContent>
      </Tooltip>
    );
  }
  if (isBelow) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-red-400"><TrendingDown className="h-3.5 w-3.5" /></span>
        </TooltipTrigger>
        <TooltipContent>Below average</TooltipContent>
      </Tooltip>
    );
  }
  return null;
}

export default function LeadCompareDialog({ leads, open, onOpenChange }: LeadCompareDialogProps) {
  // Compute overall scores and find best pick
  const { bestPickIndex, avgScores } = useMemo(() => {
    if (leads.length === 0) return { bestPickIndex: -1, avgScores: { reply: 0, conversion: 0, urgency: 0, revenue: 0 } };

    const totals = leads.reduce(
      (acc, lead) => ({
        reply: acc.reply + lead.replyScore,
        conversion: acc.conversion + lead.conversionScore,
        urgency: acc.urgency + lead.urgencyScore,
        revenue: acc.revenue + lead.revenuePotentialScore,
      }),
      { reply: 0, conversion: 0, urgency: 0, revenue: 0 }
    );

    const n = leads.length;
    const avg = {
      reply: totals.reply / n,
      conversion: totals.conversion / n,
      urgency: totals.urgency / n,
      revenue: totals.revenue / n,
    };

    // Find best pick: highest sum of normalized scores
    let bestIdx = 0;
    let bestTotal = -1;
    leads.forEach((lead, idx) => {
      const total = lead.replyScore + lead.conversionScore + lead.urgencyScore + lead.revenuePotentialScore;
      if (total > bestTotal) {
        bestTotal = total;
        bestIdx = idx;
      }
    });

    return { bestPickIndex: bestIdx, avgScores: avg };
  }, [leads]);

  // Check if a row value is clearly the best among leads
  const isBestInRow = (values: (number | undefined)[], currentIdx: number): boolean => {
    const definedVals = values.filter((v): v is number => v !== undefined);
    if (definedVals.length < 2) return false;
    const max = Math.max(...definedVals);
    const min = Math.min(...definedVals);
    // Only highlight if there's a meaningful difference (>10% of range)
    if (max - min < 5) return false;
    const val = values[currentIdx];
    return val !== undefined && val === max;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Lead Comparison
          </DialogTitle>
          <DialogDescription>
            Compare {leads.length} leads side by side to identify the best opportunity
          </DialogDescription>
        </DialogHeader>

        {leads.length >= 2 && leads.length <= 3 && (
          <div className="mt-2">
            {/* Column headers */}
            <div className={cn('grid gap-3', leads.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
              {leads.map((lead, idx) => (
                <div
                  key={lead.id}
                  className={cn(
                    'rounded-lg border p-4 transition-all',
                    idx === bestPickIndex
                      ? 'border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20'
                      : 'border-border'
                  )}
                >
                  {/* Best Pick Badge */}
                  {idx === bestPickIndex && (
                    <div className="flex items-center gap-1 mb-2">
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 text-[10px] px-1.5 py-0">
                        <Trophy className="h-3 w-3 mr-0.5" /> Best Pick
                      </Badge>
                    </div>
                  )}

                  {/* Business Name + Owner */}
                  <h3 className="font-semibold text-sm truncate">{lead.businessName}</h3>
                  {lead.ownerName && (
                    <p className="text-xs text-muted-foreground truncate">{lead.ownerName}</p>
                  )}

                  {/* Stage */}
                  <div className="mt-2">
                    <Badge variant="outline" className={cn('text-xs border', STAGE_BADGE_STYLES[lead.stage] ?? 'text-white')}>
                      {STAGE_LABELS[lead.stage as LeadStage] ?? lead.stage}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Comparison rows */}
            <div className="mt-4 space-y-1">
              {/* Scores Section */}
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-3">Scores</div>

              {(['replyScore', 'conversionScore', 'urgencyScore', 'revenuePotentialScore'] as const).map((field) => {
                const label = field === 'replyScore' ? 'Reply Score'
                  : field === 'conversionScore' ? 'Conversion Score'
                  : field === 'urgencyScore' ? 'Urgency Score'
                  : 'Revenue Potential Score';

                const values = leads.map((l) => l[field]);
                const avg = field === 'replyScore' ? avgScores.reply
                  : field === 'conversionScore' ? avgScores.conversion
                  : field === 'urgencyScore' ? avgScores.urgency
                  : avgScores.revenue;

                return (
                  <div key={field} className={cn('grid gap-3 items-center py-2 px-3 rounded-md', leads.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                    {leads.map((lead, idx) => {
                      const val = lead[field];
                      const best = isBestInRow(values, idx);
                      const aboveAvg = val > avg;
                      const belowAvg = val < avg;

                      return (
                        <div
                          key={lead.id}
                          className={cn(
                            'flex items-center justify-between gap-1 rounded px-2 py-1 transition-colors',
                            best && 'bg-emerald-500/5'
                          )}
                        >
                          <MiniScoreBar value={val} isBest={best} />
                          <ComparisonArrow isAbove={aboveAvg} isBelow={belowAvg} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Row labels shown above each comparison row group */}
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-5">Details</div>

              {/* Urgency Label */}
              <div className="grid gap-3 items-center py-2 px-3" style={{ gridTemplateColumns: `repeat(${leads.length}, 1fr)` }}>
                {leads.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Badge variant="outline" className={cn('text-xs border', URGENCY_COLORS[lead.urgency])}>{lead.urgency}</Badge>
                  </div>
                ))}
              </div>

              {/* Revenue Potential Label */}
              <div className="grid gap-3 items-center py-2 px-3" style={{ gridTemplateColumns: `repeat(${leads.length}, 1fr)` }}>
                {leads.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-2">
                    <span className={cn('text-sm font-medium', REVENUE_COLORS[lead.revenuePotential])}>{lead.revenuePotential}</span>
                  </div>
                ))}
              </div>

              {/* Contact Info */}
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-5">Contact</div>

              {/* Email */}
              <div className="grid gap-3 items-center py-1.5 px-3" style={{ gridTemplateColumns: `repeat(${leads.length}, 1fr)` }}>
                {leads.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-1.5 text-xs truncate">
                    <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                    {lead.email ? <span className="truncate">{lead.email}</span> : <span className="text-muted-foreground">—</span>}
                  </div>
                ))}
              </div>

              {/* Phone */}
              <div className="grid gap-3 items-center py-1.5 px-3" style={{ gridTemplateColumns: `repeat(${leads.length}, 1fr)` }}>
                {leads.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-1.5 text-xs truncate">
                    <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                    {lead.phone ? <span className="truncate">{lead.phone}</span> : <span className="text-muted-foreground">—</span>}
                  </div>
                ))}
              </div>

              {/* Website */}
              <div className="grid gap-3 items-center py-1.5 px-3" style={{ gridTemplateColumns: `repeat(${leads.length}, 1fr)` }}>
                {leads.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-1.5 text-xs truncate">
                    <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                    {lead.website ? <span className="truncate">{lead.website}</span> : <span className="text-muted-foreground">—</span>}
                  </div>
                ))}
              </div>

              {/* More Details */}
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-5">Other</div>

              {/* Niche + Country */}
              <div className="grid gap-3 items-center py-1.5 px-3" style={{ gridTemplateColumns: `repeat(${leads.length}, 1fr)` }}>
                {leads.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-1.5 text-xs">
                    <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
                    {lead.niche && <Badge variant="secondary" className="text-[10px] font-normal px-1.5">{lead.niche}</Badge>}
                    {lead.country && (
                      <span className="flex items-center gap-0.5 text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {lead.city ? `${lead.city}, ` : ''}{lead.country}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Digital Weaknesses Count */}
              <div className="grid gap-3 items-center py-1.5 px-3" style={{ gridTemplateColumns: `repeat(${leads.length}, 1fr)` }}>
                {leads.map((lead) => {
                  const count = lead.digitalWeaknesses?.length ?? 0;
                  return (
                    <div key={lead.id} className="flex items-center gap-1.5 text-xs">
                      <AlertTriangle className={cn('h-3 w-3 shrink-0', count > 3 ? 'text-red-400' : count > 1 ? 'text-amber-400' : 'text-emerald-400')} />
                      <span>{count} weakness{count !== 1 ? 'es' : ''}</span>
                    </div>
                  );
                })}
              </div>

              {/* Website Quality */}
              <div className="grid gap-3 items-center py-1.5 px-3" style={{ gridTemplateColumns: `repeat(${leads.length}, 1fr)` }}>
                {leads.map((lead) => {
                  const quality = lead.websiteQuality ?? (lead.hasWebsite ? 'basic' : 'none');
                  const qColors: Record<string, string> = {
                    excellent: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
                    good: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
                    basic: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
                    poor: 'bg-red-500/15 text-red-400 border-red-500/25',
                    none: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
                  };
                  return (
                    <div key={lead.id} className="flex items-center gap-1.5 text-xs">
                      <Badge variant="outline" className={cn('text-[10px] border', qColors[quality] ?? qColors.none)}>
                        {quality}
                      </Badge>
                    </div>
                  );
                })}
              </div>

              {/* Best Channel */}
              <div className="grid gap-3 items-center py-1.5 px-3" style={{ gridTemplateColumns: `repeat(${leads.length}, 1fr)` }}>
                {leads.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-1.5 text-xs">
                    <Zap className="h-3 w-3 text-muted-foreground shrink-0" />
                    {lead.bestChannel ? <span>{lead.bestChannel}</span> : <span className="text-muted-foreground">—</span>}
                  </div>
                ))}
              </div>

              {/* Best Timing */}
              <div className="grid gap-3 items-center py-1.5 px-3" style={{ gridTemplateColumns: `repeat(${leads.length}, 1fr)` }}>
                {leads.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-1.5 text-xs">
                    <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    {lead.bestTiming ? <span>{lead.bestTiming}</span> : <span className="text-muted-foreground">—</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
