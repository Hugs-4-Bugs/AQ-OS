'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS v3.8.0 — Lead Source Analytics
// Donut chart with source quality breakdown and trend comparison
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe,
  Users,
  Linkedin,
  Megaphone,
  CalendarDays,
  HandshakeIcon,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
interface LeadSource {
  name: string;
  count: number;
  percentage: number;
  trend: number; // % change vs last period
  color: string;
  icon: React.ElementType;
  quality: {
    hot: number;
    warm: number;
    cold: number;
  };
  qualityScore: number; // 0-100
}

/* ===== Icon Map for API data ===== */
const ICON_MAP: Record<string, React.ElementType> = {
  Website: Globe,
  Referral: Users,
  LinkedIn: Linkedin,
  'Cold Outreach': Megaphone,
  Events: CalendarDays,
  Partnerships: HandshakeIcon,
};

function getSourceIcon(name: string): React.ElementType {
  return ICON_MAP[name] ?? Globe;
}

/* ===== Custom Tooltip ===== */
function SourceTooltip({ active, payload, totalLeads }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; color: string } }>; totalLeads: number }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-popover/95 backdrop-blur-sm p-2.5 shadow-xl text-xs">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
        <span className="font-semibold text-foreground">{d.name}</span>
      </div>
      <p className="text-muted-foreground">{d.value} leads ({totalLeads > 0 ? ((d.value / totalLeads) * 100).toFixed(1) : '0'}%)</p>
    </div>
  );
}

/* ===== Quality Bar ===== */
function QualityBar({ hot, warm, cold, total }: { hot: number; warm: number; cold: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted mt-1.5">
      {hot > 0 && (
        <div className="bg-red-500 transition-all duration-500" style={{ width: `${(hot / total) * 100}%` }} />
      )}
      {warm > 0 && (
        <div className="bg-amber-500 transition-all duration-500" style={{ width: `${(warm / total) * 100}%` }} />
      )}
      {cold > 0 && (
        <div className="bg-sky-500 transition-all duration-500" style={{ width: `${(cold / total) * 100}%` }} />
      )}
    </div>
  );
}

/* ===== Source Detail Panel ===== */
function SourceDetailPanel({ source, onClose }: { source: LeadSource | null; onClose: () => void }) {
  if (!source) return null;
  const Icon = source.icon;
  const total = source.quality.hot + source.quality.warm + source.quality.cold;

  const scoreColor = source.qualityScore >= 75
    ? 'text-emerald-500'
    : source.qualityScore >= 50
      ? 'text-amber-500'
      : 'text-red-500';

  const scoreBg = source.qualityScore >= 75
    ? 'bg-emerald-500/10'
    : source.qualityScore >= 50
      ? 'bg-amber-500/10'
      : 'bg-red-500/10';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div className="p-3 pt-2 border-t border-border/40 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5" style={{ backgroundColor: `${source.color}20` }}>
                <Icon className="h-3.5 w-3.5" style={{ color: source.color }} />
              </div>
              <span className="text-sm font-semibold">{source.name}</span>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                {source.count} leads
              </Badge>
            </div>
            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>

          {/* Quality Score */}
          <div className="flex items-center gap-3">
            <div className={cn('rounded-lg p-2 text-center min-w-[56px]', scoreBg)}>
              <p className={cn('text-lg font-bold tabular-nums', scoreColor)}>{source.qualityScore}</p>
              <p className="text-[8px] text-muted-foreground font-medium">Score</p>
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">Hot</span>
                </div>
                <span className="font-semibold tabular-nums">{source.quality.hot}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">Warm</span>
                </div>
                <span className="font-semibold tabular-nums">{source.quality.warm}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-sky-500" />
                  <span className="text-muted-foreground">Cold</span>
                </div>
                <span className="font-semibold tabular-nums">{source.quality.cold}</span>
              </div>
            </div>
          </div>

          <QualityBar hot={source.quality.hot} warm={source.quality.warm} cold={source.quality.cold} total={total} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ===== Loading Skeleton ===== */
function LeadSourceSkeleton() {
  return (
    <Card className="card-glow glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <Skeleton className="h-44 w-44 rounded-full" />
          <div className="flex-1 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Empty State ===== */
function EmptyState() {
  return (
    <Card className="card-glow glass-card overflow-hidden">
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <PieChartIcon className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">No lead source data</p>
        <p className="text-xs mt-1">Sources will appear as leads are added.</p>
      </CardContent>
    </Card>
  );
}

/* ===== Main Component ===== */
export default function LeadSourceAnalytics() {
  const [sources, setSources] = useState<LeadSource[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<LeadSource | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/lead-sources')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => {
        // Normalize icon from API (string → React.ElementType)
        const normalized = (d?.sources ?? d ?? []).map((s: Record<string, unknown>) => ({
          ...s,
          icon: typeof s.icon === 'string' ? getSourceIcon(s.icon as string) : (s.icon ?? getSourceIcon(s.name as string)),
        }));
        setSources(normalized);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalLeads = useMemo(() => (sources ?? []).reduce((s, src) => s + src.count, 0), [sources]);

  const chartData = useMemo(() => (sources ?? []).map((s) => ({ name: s.name, value: s.count, color: s.color })), [sources]);

  if (loading) return <LeadSourceSkeleton />;
  if (!sources || sources.length === 0) return <EmptyState />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
    >
      <Card className="card-glow glass-card overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm relative group">
        <div className="absolute inset-0 rounded-xl border border-primary/10 group-hover:border-primary/20 transition-colors duration-500 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />

        <CardHeader className="pb-2 relative">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="rounded-lg p-1.5 bg-violet-500/10">
                <PieChartIcon className="h-4 w-4 text-violet-500" />
              </div>
              Lead Source Analytics
            </CardTitle>
            <Badge variant="outline" className="text-[9px] h-5 px-2 font-medium">
              {totalLeads} total leads
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="relative">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Donut Chart */}
            <div className="relative w-[160px] h-[160px] sm:w-[180px] sm:h-[180px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                    animationBegin={0}
                    animationDuration={800}
                    onClick={(data: Record<string, unknown>) => {
                      const src = sources.find((s) => s.name === data.name);
                      if (src) setSelectedSource(src === selectedSource ? null : src);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        stroke="none"
                        opacity={selectedSource && selectedSource.name !== entry.name ? 0.35 : 1}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<SourceTooltip totalLeads={totalLeads} />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-xl font-bold tabular-nums">{totalLeads}</p>
                  <p className="text-[9px] text-muted-foreground font-medium">Leads</p>
                </div>
              </div>
            </div>

            {/* Source List */}
            <div className="flex-1 w-full min-w-0">
              <ScrollArea className="max-h-[200px] sm:max-h-[240px] custom-scrollbar">
                <div className="space-y-1">
                  {sources.map((source, index) => {
                    const Icon = source.icon;
                    const isSelected = selectedSource?.name === source.name;

                    return (
                      <motion.button
                        key={source.name}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.06, duration: 0.25 }}
                        onClick={() => setSelectedSource(isSelected ? null : source)}
                        className={cn(
                          'flex items-center gap-2.5 p-2 rounded-lg w-full text-left transition-all duration-200 group/row',
                          isSelected
                            ? 'bg-accent shadow-sm'
                            : 'hover:bg-accent/50'
                        )}
                      >
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: source.color }} />
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium flex-1 truncate">{source.name}</span>
                        <span className="text-xs font-bold tabular-nums">{source.count}</span>
                        <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums">
                          {source.percentage}%
                        </span>
                        <span className={cn(
                          'text-[10px] font-semibold flex items-center gap-0.5 w-14 justify-end',
                          source.trend >= 0 ? 'text-emerald-500' : 'text-red-500'
                        )}>
                          {source.trend >= 0 ? (
                            <ArrowUpRight className="h-2.5 w-2.5" />
                          ) : (
                            <ArrowDownRight className="h-2.5 w-2.5" />
                          )}
                          {Math.abs(source.trend)}%
                        </span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      </motion.button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Source Detail Panel */}
          <SourceDetailPanel
            source={selectedSource}
            onClose={() => setSelectedSource(null)}
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}
