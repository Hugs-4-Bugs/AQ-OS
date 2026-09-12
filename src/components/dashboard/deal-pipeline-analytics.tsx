'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Target,
  BarChart3,
  ArrowRight,
  CircleDot,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { LeadStage } from '@/lib/types';

/* ================================================================
   Pipeline Stage Configuration
   ================================================================ */

const PIPELINE_STAGES: {
  key: LeadStage;
  label: string;
  color: string;
  gradient: string;
}[] = [
  { key: 'discovered', label: 'Discovery', color: '#64748b', gradient: 'from-slate-500 to-slate-600' },
  { key: 'contacted', label: 'Qualified', color: '#06b6d4', gradient: 'from-cyan-500 to-cyan-600' },
  { key: 'discussion', label: 'Proposal', color: '#a855f7', gradient: 'from-violet-500 to-violet-600' },
  { key: 'negotiation', label: 'Negotiation', color: '#f97316', gradient: 'from-orange-500 to-orange-600' },
  { key: 'won', label: 'Won', color: '#10b981', gradient: 'from-emerald-500 to-emerald-600' },
  { key: 'lost', label: 'Lost', color: '#ef4444', gradient: 'from-red-500 to-red-600' },
];

/* ================================================================
   Animated Circular Progress (Win Rate)
   ================================================================ */

function WinRateCircle({ percentage, isLoading }: { percentage: number; isLoading: boolean }) {
  const [animated, setAnimated] = useState(0);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animated / 100) * circumference;

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => setAnimated(percentage), 150);
    return () => clearTimeout(timer);
  }, [percentage, isLoading]);

  return (
    <div className="relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
        {/* Background circle */}
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted/30"
        />
        {/* Progress arc */}
        <motion.circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke="url(#winRateGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
        <defs>
          <linearGradient id="winRateGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {isLoading ? (
          <Skeleton className="h-7 w-10 rounded" />
        ) : (
          <>
            <span className="text-xl sm:text-2xl font-extrabold tabular-nums leading-none">
              {Math.round(animated)}%
            </span>
            <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium mt-0.5">
              Win Rate
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Monthly Pipeline Trend Bar Chart
   ================================================================ */

function MonthlyTrendChart({ data }: { data: { month: string; value: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[100px] text-muted-foreground">
        <BarChart3 className="h-6 w-6 text-muted-foreground/30 mb-1" />
        <p className="text-[10px]">No trend data yet</p>
      </div>
    );
  }
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <ResponsiveContainer width="100%" height={100}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Pipeline']}
        />
        <Bar
          dataKey="value"
          fill="url(#barGradient)"
          radius={[4, 4, 0, 0]}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ================================================================
   Conversion Rate Arrow Between Stages
   ================================================================ */

function ConversionArrow({
  fromLabel,
  fromCount,
  toCount,
}: {
  fromLabel: string;
  fromCount: number;
  toCount: number;
}) {
  const rate = fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0;
  const isGood = rate >= 30;

  return (
    <div className="flex items-center gap-1.5 py-1.5">
      <div className="flex-1 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground truncate">{fromLabel}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0 mx-1" />
        <span className="text-[10px] font-medium text-foreground">{toCount}</span>
      </div>
      <Badge
        variant="outline"
        className={cn(
          'text-[9px] px-1.5 py-0 h-4 shrink-0 tabular-nums font-semibold',
          isGood
            ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5'
            : 'text-amber-500 border-amber-500/30 bg-amber-500/5'
        )}
      >
        {rate}%
      </Badge>
    </div>
  );
}

/* ================================================================
   Loading Skeleton
   ================================================================ */

function PipelineAnalyticsSkeleton() {
  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-40 rounded" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stage bars */}
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-5 flex-1 rounded-full" />
              <Skeleton className="h-5 w-10 rounded" />
            </div>
          ))}
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        {/* Chart */}
        <Skeleton className="h-28 rounded-xl" />
      </CardContent>
    </Card>
  );
}

/* ================================================================
   Empty State Component
   ================================================================ */

function EmptyPipelineState() {
  return (
    <Card className="glass-card-enhanced card-glow overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="rounded-lg p-1.5 bg-gradient-to-br from-violet-500 to-purple-600">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <span className="gradient-text">Pipeline Analytics</span>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-xl p-4 bg-muted/20 mb-4">
            <Target className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No pipeline data available yet</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Add leads and deals to see pipeline analytics</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================
   Main Component
   ================================================================ */

export default function DealPipelineAnalytics() {
  const [analytics, setAnalytics] = useState<{
    stages: { key: string; count: number; value: number }[];
    winRate: number;
    avgDealSize: number;
    avgDealTrend: number;
    timeToClose: Record<string, number>;
    monthlyTrend: { month: string; value: number }[];
    totalPipelineValue: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/deals-performance')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(res => {
        const d = res.data;
        if (!d) return;
        // Map API pipelineStages to component format
        const stageKeyMap: Record<string, LeadStage> = {
          'Discovered': 'discovered',
          'Contacted': 'contacted',
          'Discussion': 'discussion',
          'Negotiation': 'negotiation',
          'Won': 'won',
          'Lost': 'lost',
          'Draft': 'discovered',
          'Proposed': 'discussion',
          'Accepted': 'won',
          'Closed_won': 'won',
          'Closed_lost': 'lost',
        };
        const stageCounts: Record<string, number> = {};
        for (const ps of d.pipelineStages || []) {
          const key = stageKeyMap[ps.stage] || 'discovered';
          stageCounts[key] = (stageCounts[key] ?? 0) + ps.count;
        }
        const stages = PIPELINE_STAGES.map(s => ({
          key: s.key,
          count: stageCounts[s.key] ?? 0,
          value: (stageCounts[s.key] ?? 0) * (d.avgDealSize || 0),
        }));
        const totalPipelineValue = d.totalPipeline || 0;
        setAnalytics({
          stages,
          winRate: Math.round(d.winRate || 0),
          avgDealSize: Math.round(d.avgDealSize || 0),
          avgDealTrend: d.avgSizeChange || 0,
          timeToClose: { discovered: 0, contacted: 0, discussion: 0, negotiation: 0 },
          monthlyTrend: [],
          totalPipelineValue,
        });
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  if (!isLoading && !analytics) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <EmptyPipelineState />
      </motion.div>
    );
  }

  if (isLoading) {
    return <PipelineAnalyticsSkeleton />;
  }

  const totalPipeline = analytics.stages.reduce((sum, s) => sum + s.count, 0) || 1;
  const trendUp = analytics.avgDealTrend >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
        <Card className="glass-card-enhanced card-glow overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-1.5 bg-gradient-to-br from-violet-500 to-purple-600">
                  <BarChart3 className="h-4 w-4 text-white" />
                </div>
                <span className="gradient-text">Pipeline Analytics</span>
              </CardTitle>
              <Badge
                variant="secondary"
                className="text-[10px] px-2 py-0.5 h-5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-semibold"
              >
                ${Math.round(analytics.totalPipelineValue / 1000)}k pipeline
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* ===== Pipeline Value by Stage ===== */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                <Target className="h-3 w-3" />
                Pipeline Value by Stage
              </p>
              <div className="space-y-2.5">
                {analytics.stages.map((stage) => {
                  const stageConfig = PIPELINE_STAGES.find(s => s.key === stage.key);
                  const pct = Math.round((stage.count / totalPipeline) * 100);
                  return (
                    <div key={stage.key} className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-muted-foreground w-[72px] sm:w-20 truncate text-right">
                        {stageConfig?.label ?? stage.key}
                      </span>
                      <div className="flex-1 h-6 bg-muted/60 rounded-full overflow-hidden relative group">
                        <motion.div
                          className="h-full rounded-full relative overflow-hidden"
                          style={{ backgroundColor: stageConfig?.color ?? '#8884d8' }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
                        </motion.div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 w-[80px] sm:w-[100px] justify-end">
                        <span className="text-[11px] font-bold tabular-nums text-foreground">
                          ${Math.round(stage.value / 1000)}k
                        </span>
                        <span className="text-[9px] text-muted-foreground tabular-nums w-8 text-right">
                          ({stage.count})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ===== KPI Row: Win Rate, Avg Deal Size, Time-to-Close ===== */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Win Rate */}
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 border border-border/30">
                <WinRateCircle percentage={analytics.winRate} isLoading={false} />
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Deals Won vs Lost</p>
                </div>
              </div>

              {/* Avg Deal Size */}
              <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-muted/30 border border-border/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="rounded-lg p-1.5 bg-gradient-to-br from-emerald-500 to-teal-500">
                    <DollarSign className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">Avg Deal Size</span>
                </div>
                <p className="text-2xl font-extrabold tabular-nums tracking-tight">
                  ${analytics.avgDealSize.toLocaleString()}
                </p>
                <div
                  className={cn(
                    'flex items-center gap-0.5 text-xs font-medium',
                    trendUp ? 'text-emerald-500' : 'text-red-500'
                  )}
                >
                  {trendUp ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {trendUp ? '+' : ''}{analytics.avgDealTrend}% vs last month
                </div>
              </div>

              {/* Time to Close */}
              <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-muted/30 border border-border/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="rounded-lg p-1.5 bg-gradient-to-br from-amber-500 to-orange-500">
                    <Clock className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">Avg Days/Stage</span>
                </div>
                <div className="space-y-1.5 w-full">
                  {Object.entries(analytics.timeToClose).map(([stage, days]) => {
                    const config = PIPELINE_STAGES.find(s => s.key === stage);
                    return (
                      <div key={stage} className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground truncate">{config?.label ?? stage}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
                              style={{ width: `${(days / 14) * 100}%` }}
                            />
                          </div>
                          <span className="text-foreground font-semibold tabular-nums w-4 text-right">{days}d</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ===== Monthly Pipeline Trend ===== */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                <CircleDot className="h-3 w-3" />
                Monthly Pipeline Trend (Last 6 Months)
              </p>
              <div className="p-3 rounded-xl bg-muted/20 border border-border/20">
                <MonthlyTrendChart data={analytics.monthlyTrend} />
              </div>
            </div>

            {/* ===== Stage Conversion Rates ===== */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                <ArrowRight className="h-3 w-3" />
                Stage Conversion Rates
              </p>
              <div className="p-3 rounded-xl bg-muted/20 border border-border/20 divide-y divide-border/40">
                {analytics.stages.slice(0, -1).map((stage, i) => {
                  const nextStage = analytics.stages[i + 1];
                  if (!nextStage) return null;
                  const stageConfig = PIPELINE_STAGES.find(s => s.key === stage.key);
                  return (
                    <ConversionArrow
                      key={stage.key}
                      fromLabel={stageConfig?.label ?? stage.key}
                      fromCount={stage.count}
                      toCount={nextStage.count}
                    />
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
    </motion.div>
  );
}
