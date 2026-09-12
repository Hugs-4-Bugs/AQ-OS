'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  Globe,
  MapPin,
  Mail,
  Phone,
  Star,
  TrendingUp,
  Target,
  Zap,
  BarChart3,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Crown,
  Flame,
  HandshakeIcon,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { Lead } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/types';

interface LeadComparisonViewProps {
  leads: Lead[];
  onClose?: () => void;
}

/* ── Score comparison bar ──────────────────────────────────── */
function ScoreComparisonBar({ label, scores, maxScore = 100 }: { label: string; scores: { value: number; name: string }[]; maxScore?: number }) {
  const maxVal = Math.max(...scores.map((s) => s.value), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className="space-y-1.5">
        {scores.map((score, i) => {
          const pct = Math.min((score.value / maxScore) * 100, 100);
          const gradientClass = pct >= 75 ? 'from-emerald-500 to-teal-400' : pct >= 50 ? 'from-amber-500 to-yellow-400' : 'from-red-400 to-orange-400';
          const isHighest = score.value === maxVal && scores.length > 1;

          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-20 sm:w-24 truncate font-medium">{score.name}</span>
              <div className="flex-1 h-5 bg-muted/50 rounded-full overflow-hidden relative group">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: i * 0.15, ease: [0.34, 1.56, 0.64, 1] }}
                  className={cn('h-full rounded-full bg-gradient-to-r relative', gradientClass)}
                >
                  {isHighest && (
                    <Crown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-amber-500 drop-shadow-sm" />
                  )}
                </motion.div>
              </div>
              <span className={cn('text-xs font-bold tabular-nums w-8 text-right', isHighest ? 'text-primary' : 'text-muted-foreground')}>
                {score.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Metric difference indicator ──────────────────────────── */
function MetricDiff({ value, label }: { value: number | undefined; label: string }) {
  if (value === undefined || value === 0) {
    return <span className="text-xs text-muted-foreground">{label}</span>;
  }
  const isPositive = value > 0;

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', isPositive ? 'text-emerald-500' : 'text-red-400')}>
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value)}%
      </span>
  );
}

/* ── Comparison category card ─────────────────────────────── */
function ComparisonCategoryCard({
  title,
  icon: Icon,
  color,
  children,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="glass-card card-hover-border overflow-hidden">
        <CardHeader className="pb-3 px-4 pt-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <div className={cn('rounded-lg p-1.5', color)}>
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-4">{children}</div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ── Info row for two or three leads ──────────────────────── */
function InfoRow({ label, values }: { label: string; values: (string | undefined | number)[] }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `120px repeat(${values.length}, 1fr)` }}>
      <span className="text-xs font-semibold text-muted-foreground pt-0.5">{label}</span>
      {values.map((val, i) => (
        <span key={i} className="text-xs font-medium truncate">{val != null ? String(val) : '—'}</span>
      ))}
    </div>
  );
}

/* ── Main component ────────────────────────────────────────── */
export default function LeadComparisonView({ leads, onClose }: LeadComparisonViewProps) {
  const leadCount = leads.length;

  // ── Score metrics for comparison
  const scoreMetrics = useMemo(() => {
    if (leadCount < 2) return { conversionScores: [], replyScores: [], urgencyScores: [], revenueScores: [] };
    return {
      conversionScores: leads.map((l) => ({ value: l.conversionScore, name: l.businessName })),
      replyScores: leads.map((l) => ({ value: l.replyScore, name: l.businessName })),
      urgencyScores: leads.map((l) => ({ value: l.urgencyScore, name: l.businessName })),
      revenueScores: leads.map((l) => ({ value: l.revenuePotentialScore, name: l.businessName })),
    };
  }, [leads, leadCount]);

  // ── Overall composite score (average of all scores)
  const compositeScores = useMemo(
    () =>
      leads.map((l) => ({
        value: Math.round((l.conversionScore + l.replyScore + l.urgencyScore + l.revenuePotentialScore) / 4),
        name: l.businessName,
      })),
    [leads]
  );

  // ── Determine the "best" lead per category
  const bestConversion = scoreMetrics.conversionScores.reduce((a, b) => (a.value > b.value ? a : b), scoreMetrics.conversionScores[0]);
  const bestReply = scoreMetrics.replyScores.reduce((a, b) => (a.value > b.value ? a : b), scoreMetrics.replyScores[0]);
  const bestUrgency = scoreMetrics.urgencyScores.reduce((a, b) => (a.value > b.value ? a : b), scoreMetrics.urgencyScores[0]);
  const bestRevenue = scoreMetrics.revenueScores.reduce((a, b) => (a.value > b.value ? a : b), scoreMetrics.revenueScores[0]);

  // ── Color palette for lead columns
  const leadColors = [
    'from-primary/20 to-primary/5 text-primary border-primary/30',
    'from-emerald-500/20 to-emerald-500/5 text-emerald-600 border-emerald-500/30',
    'from-amber-500/20 to-amber-500/5 text-amber-600 border-amber-500/30',
  ];
  const leadDots = ['bg-primary', 'bg-emerald-500', 'bg-amber-500'];

  if (leadCount < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Target className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">Select 2-3 leads to compare</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold gradient-text">Lead Comparison</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Comparing {leadCount} leads side by side</p>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* Lead name columns legend */}
      <div className="flex gap-2">
        {leads.map((lead, i) => (
          <div
            key={lead.id}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border bg-gradient-to-r flex-1 min-w-0',
              leadColors[i]
            )}
          >
            <div className={cn('w-2 h-2 rounded-full shrink-0', leadDots[i])} />
            <span className="text-xs font-bold truncate">{lead.businessName}</span>
            {lead.stage && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 ml-auto shrink-0">
                {STAGE_LABELS[lead.stage]}
              </Badge>
            )}
          </div>
        ))}
      </div>

      <ScrollArea className="max-h-[600px]">
        <div className="space-y-4 pr-3">
          {/* ── 1. Basic Info ── */}
          <ComparisonCategoryCard title="Basic Info" icon={Building2} color="bg-gradient-to-br from-primary to-purple-600">
            <InfoRow label="Business" values={leads.map((l) => l.businessName)} />
            <InfoRow label="Contact" values={leads.map((l) => l.ownerName)} />
            <InfoRow label="Niche" values={leads.map((l) => l.niche)} />
            <InfoRow label="Location" values={leads.map((l) => l.city && l.country ? `${l.city}, ${l.country}` : l.country)} />
            <InfoRow label="Email" values={leads.map((l) => l.email)} />
            <InfoRow label="Phone" values={leads.map((l) => l.phone)} />
            <InfoRow label="Website" values={leads.map((l) => l.website)} />
          </ComparisonCategoryCard>

          {/* ── 2. Score Analysis ── */}
          <ComparisonCategoryCard title="Score Analysis" icon={BarChart3} color="bg-gradient-to-br from-amber-500 to-orange-500">
            <ScoreComparisonBar label="Overall Composite" scores={compositeScores} />
            <Separator className="my-2" />
            <ScoreComparisonBar label="Conversion Score" scores={scoreMetrics.conversionScores} />
            <ScoreComparisonBar label="Reply Score" scores={scoreMetrics.replyScores} />
            <ScoreComparisonBar label="Urgency Score" scores={scoreMetrics.urgencyScores} />
            <ScoreComparisonBar label="Revenue Potential" scores={scoreMetrics.revenueScores} />

            {/* Score comparison summary */}
            {leadCount === 2 && (
              <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Score Differences</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Conversion</p>
                    <MetricDiff value={leads[1].conversionScore - leads[0].conversionScore} label="Equal" />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Reply</p>
                    <MetricDiff value={leads[1].replyScore - leads[0].replyScore} label="Equal" />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Urgency</p>
                    <MetricDiff value={leads[1].urgencyScore - leads[0].urgencyScore} label="Equal" />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Revenue</p>
                    <MetricDiff value={leads[1].revenuePotentialScore - leads[0].revenuePotentialScore} label="Equal" />
                  </div>
                </div>
              </div>
            )}

            {/* Best in category highlights */}
            <div className="mt-3 flex flex-wrap gap-2">
              {bestConversion && (
                <div className="badge-dot bg-emerald-500/15 text-emerald-600 border border-emerald-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Best Conversion: {bestConversion.name}
                </div>
              )}
              {bestReply && (
                <div className="badge-dot bg-sky-500/15 text-sky-600 border border-sky-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                  Best Reply: {bestReply.name}
                </div>
              )}
              {bestUrgency && (
                <div className="badge-dot bg-amber-500/15 text-amber-600 border border-amber-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Highest Urgency: {bestUrgency.name}
                </div>
              )}
              {bestRevenue && (
                <div className="badge-dot bg-violet-500/15 text-violet-600 border border-violet-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  Best Revenue: {bestRevenue.name}
                </div>
              )}
            </div>
          </ComparisonCategoryCard>

          {/* ── 3. Activity ── */}
          <ComparisonCategoryCard title="Activity" icon={Activity} color="bg-gradient-to-br from-sky-500 to-cyan-500">
            <InfoRow label="Stage" values={leads.map((l) => STAGE_LABELS[l.stage])} />
            <InfoRow label="Revenue" values={leads.map((l) => l.revenuePotential)} />
            <InfoRow label="Urgency" values={leads.map((l) => l.urgency)} />
            <InfoRow label="Has Website" values={leads.map((l) => l.hasWebsite ? 'Yes' : 'No')} />
            <InfoRow label="Source" values={leads.map((l) => l.source)} />
            <InfoRow label="Last Contact" values={leads.map((l) => (l.lastContact ? new Date(l.lastContact).toLocaleDateString() : 'Never'))} />
            <InfoRow label="Created" values={leads.map((l) => new Date(l.createdAt).toLocaleDateString())} />
            <InfoRow label="Updated" values={leads.map((l) => new Date(l.updatedAt).toLocaleDateString())} />
            <InfoRow label="Tags" values={leads.map((l) => l.tags?.join(', ') || 'None')} />
            <InfoRow label="Comms" values={leads.map((l) => `${l.communications?.length ?? 0}`)} />

            {/* Activity score bar — composite of stage + recency */}
            <div className="mt-2">
              <ScoreComparisonBar
                label="Engagement Index"
                scores={leads.map((l) => ({
                  value: Math.round(
                    (l.communications?.length ?? 0) * 10 +
                    (l.conversionScore * 0.3) +
                    (l.replyScore * 0.3)
                  ),
                  name: l.businessName,
                }))}
              />
            </div>
          </ComparisonCategoryCard>

          {/* ── 4. Deal Potential ── */}
          <ComparisonCategoryCard title="Deal Potential" icon={HandshakeIcon} color="bg-gradient-to-br from-emerald-500 to-teal-500">
            <InfoRow label="Best Contact" values={leads.map((l) => l.bestContactPerson)} />
            <InfoRow label="Best Channel" values={leads.map((l) => l.bestChannel)} />
            <InfoRow label="Best Timing" values={leads.map((l) => l.bestTiming)} />
            <InfoRow label="Outreach Style" values={leads.map((l) => l.outreachStyle)} />
            <InfoRow label="Rating" values={leads.map((l) => l.rating ? `${l.rating}/5` : '—')} />
            <InfoRow label="Deals" values={leads.map((l) => `${l.deals?.length ?? 0}`)} />
            <InfoRow label="Notes" values={leads.map((l) => l.opportunityNotes?.slice(0, 60) ?? '—')} />

            {/* Deal potential composite */}
            <div className="mt-2">
              <ScoreComparisonBar
                label="Deal Potential Index"
                scores={leads.map((l) => ({
                  value: Math.round(
                    l.conversionScore * 0.35 +
                    l.replyScore * 0.25 +
                    l.revenuePotentialScore * 0.25 +
                    (l.urgency === 'critical' ? 80 : l.urgency === 'high' ? 60 : l.urgency === 'medium' ? 40 : 20) * 0.15
                  ),
                  name: l.businessName,
                }))}
              />
            </div>

            {/* Hot lead flag */}
            <div className="mt-3 flex flex-wrap gap-2">
              {leads.map((lead, i) =>
                lead.conversionScore >= 75 || lead.replyScore >= 80 ? (
                  <div key={lead.id} className={cn('badge-dot border', leadColors[i])}>
                    <Flame className="h-3 w-3" />
                    Hot Lead
                  </div>
                ) : null
              )}
            </div>
          </ComparisonCategoryCard>
        </div>
      </ScrollArea>
    </div>
  );
}
