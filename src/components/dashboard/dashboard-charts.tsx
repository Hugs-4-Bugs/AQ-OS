'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  CreditCard,
  TrendingUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { STAGE_LABELS, type LeadStage } from '@/lib/types';
import { fetchStats, fetchLeads } from '@/lib/api';

/* ===== Types ===== */
type Period = '7d' | '30d' | '90d';

interface StageBarData {
  stage: string;
  label: string;
  count: number;
  color: string;
  percentage: number;
}

interface CreditDayData {
  date: string;
  label: string;
  credits: number;
}

interface FunnelStage {
  label: string;
  count: number;
  color: string;
  percentage: number;
}

/* ===== Stage hex colors (matching existing project) ===== */
const STAGE_HEX_COLORS: Record<string, string> = {
  discovered: '#64748b',
  analyzed: '#06b6d4',
  contacted: '#3b82f6',
  replied: '#f59e0b',
  discussion: '#f97316',
  proposal: '#a855f7',
  negotiation: '#ec4899',
  won: '#10b981',
  lost: '#ef4444',
};

const FUNNEL_STAGES: { key: string; label: string; color: string }[] = [
  { key: 'discovered', label: 'Leads', color: '#64748b' },
  { key: 'analyzed', label: 'Qualified', color: '#06b6d4' },
  { key: 'proposal', label: 'Proposal', color: '#a855f7' },
  { key: 'negotiation', label: 'Negotiation', color: '#ec4899' },
  { key: 'won', label: 'Won', color: '#10b981' },
];

/* ===== Period Selector Component ===== */
function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const periods: Period[] = ['7d', '30d', '90d'];
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
      {periods.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            'px-2.5 py-1 text-[10px] sm:text-xs font-semibold rounded-md transition-all duration-200',
            value === p
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

/* ===== Chart Card Skeleton ===== */
function ChartSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-7 w-24" />
      </div>
      <Skeleton className="h-[180px] w-full rounded-lg" />
    </div>
  );
}

/* ===== Animated Bar Component ===== */
function AnimatedBar({
  height,
  color,
  delay,
  label,
  value,
}: {
  height: number;
  color: string;
  delay: number;
  label: string;
  value: number;
}) {
  const [animatedHeight, setAnimatedHeight] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedHeight(height);
    }, delay);
    return () => clearTimeout(timer);
  }, [height, delay]);

  return (
    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
      <span className="text-[10px] font-bold tabular-nums text-foreground">{value}</span>
      <div
        className="w-full max-w-[36px] rounded-t-md transition-all duration-700 ease-out relative overflow-hidden group cursor-default"
        style={{ height: `${animatedHeight}px`, backgroundColor: color }}
      >
        {/* Glass shine overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
      <span
        className="text-[9px] sm:text-[10px] text-muted-foreground font-medium text-center leading-tight truncate w-full max-w-[48px]"
        title={label}
      >
        {label}
      </span>
    </div>
  );
}

/* ===== SVG Line Chart Component ===== */
function SVGLineChart({ data, color }: { data: CreditDayData[]; color: string }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[160px] text-muted-foreground text-xs">
        No credit data available
      </div>
    );
  }

  const width = 100;
  const height = 100;
  const padding = { top: 8, right: 4, bottom: 16, left: 4 };

  const maxCredits = Math.max(...data.map((d) => d.credits), 1);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth,
    y: padding.top + chartHeight - (d.credits / maxCredits) * chartHeight,
  }));

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  const gradientId = `creditGradient-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-[160px] sm:h-[180px]"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
        <line
          key={frac}
          x1={padding.left}
          y1={padding.top + chartHeight * (1 - frac)}
          x2={width - padding.right}
          y2={padding.top + chartHeight * (1 - frac)}
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.3}
          strokeDasharray={frac === 0 ? '0' : '1 1'}
        />
      ))}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`}>
        <animate attributeName="opacity" from="0" to="1" dur="0.8s" fill="freeze" />
      </path>

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="200"
          to="0"
          dur="1s"
          fill="freeze"
        />
        <animate
          attributeName="stroke-dasharray"
          from="200"
          to="200"
          dur="1s"
          fill="freeze"
        />
      </path>

      {/* Data points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={1.2}
          fill={color}
          className="opacity-0"
        >
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.3s"
            begin={`${0.5 + i * 0.05}s`}
            fill="freeze"
          />
        </circle>
      ))}

      {/* X axis labels */}
      {data.map((d, i) => {
        const showEvery = data.length > 14 ? 3 : data.length > 7 ? 2 : 1;
        if (i % showEvery !== 0 && i !== data.length - 1) return null;
        const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
        return (
          <text
            key={i}
            x={x}
            y={height - 2}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={data.length > 14 ? 2.2 : 3}
            fontWeight={500}
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

/* ===== Funnel Bar Component ===== */
function FunnelBar({
  label,
  count,
  color,
  percentage,
  maxCount,
  delay,
}: {
  label: string;
  count: number;
  color: string;
  percentage: number;
  maxCount: number;
  delay: number;
}) {
  const [width, setWidth] = useState(0);
  const barPercentage = maxCount > 0 ? (count / maxCount) * 100 : 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      setWidth(barPercentage);
    }, delay);
    return () => clearTimeout(timer);
  }, [barPercentage, delay]);

  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] sm:text-xs font-medium text-muted-foreground w-[80px] sm:w-[90px] shrink-0 text-right">
        {label}
      </span>
      <div className="flex-1 h-7 sm:h-8 bg-muted/30 rounded-md overflow-hidden relative">
        <div
          className="h-full rounded-md transition-all duration-700 ease-out relative overflow-hidden group"
          style={{ width: `${width}%`, backgroundColor: color }}
        >
          {/* Glass shine */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs font-bold tabular-nums text-foreground/80">
          {count} <span className="text-muted-foreground font-normal">({percentage}%)</span>
        </span>
      </div>
    </div>
  );
}

/* ===== Weekly Pipeline Chart ===== */
function WeeklyPipelineChart({ period }: { period: Period }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });

  const { data: leadsResult } = useQuery({
    queryKey: ['leads', { sortBy: 'conversionScore' }],
    queryFn: () => fetchLeads({ sortBy: 'conversionScore', sortOrder: 'desc' }),
  });

  const leads = leadsResult?.leads;

  const pipelineData = useMemo<StageBarData[]>(() => {
    if (!stats?.stageBreakdown && !leads) return [];

    const stageOrder: LeadStage[] = [
      'discovered', 'analyzed', 'contacted', 'replied',
      'discussion', 'proposal', 'negotiation', 'won',
    ];

    const breakdown = stats?.stageBreakdown ?? {};
    const breakdownTotal = Object.values(breakdown).reduce((s: number, c) => s + c, 0);
    const total = (leads?.length ?? breakdownTotal) || 1;

    return stageOrder.map((stage) => {
      const count = breakdown[stage] ?? leads?.filter((l) => l.stage === stage).length ?? 0;
      return {
        stage,
        label: STAGE_LABELS[stage],
        count,
        color: STAGE_HEX_COLORS[stage] ?? '#64748b',
        percentage: Math.round((count / total) * 100),
      };
    });
  }, [stats, leads]);

  const maxCount = Math.max(...pipelineData.map((d) => d.count), 1);
  const maxBarHeight = 140;

  const subtitle = period === '7d' ? 'Leads per stage this week' : period === '30d' ? 'Leads per stage this month' : 'Leads per stage this quarter';

  if (isLoading) return <ChartSkeleton />;

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Pipeline Overview
          </h4>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-end justify-around gap-1 sm:gap-2 h-[180px] sm:h-[200px] pt-2">
        {pipelineData.map((item, index) => (
          <AnimatedBar
            key={item.stage}
            height={item.count > 0 ? Math.max((item.count / maxCount) * maxBarHeight, 6) : 3}
            color={item.color}
            delay={index * 80 + 100}
            label={item.label}
            value={item.count}
          />
        ))}
      </div>
    </div>
  );
}

/* ===== Credit Usage Chart ===== */
function CreditUsageChart({ period }: { period: Period }) {
  const { data: creditHistory, isLoading } = useQuery({
    queryKey: ['credits-history', period],
    queryFn: async () => {
      try {
        const now = new Date();
        const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
        const res = await fetch(
          `/api/credits/history?limit=100&startDate=${startDate.toISOString().slice(0, 10)}`
        );
        if (!res.ok) return { entries: [] };
        return res.json() as Promise<{
          entries: { action: string; credits: number; createdAt: string }[];
        }>;
      } catch {
        return { entries: [] };
      }
    },
    refetchOnWindowFocus: false,
  });

  const creditData = useMemo<CreditDayData[]>(() => {
    const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const now = new Date();
    const entries = creditHistory?.entries ?? [];

    // Build day buckets
    const days: CreditDayData[] = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const dayCredits = entries
        .filter((e) => e.createdAt.slice(0, 10) === dateStr && e.credits < 0)
        .reduce((sum, e) => sum + Math.abs(e.credits), 0);
      days.push({
        date: dateStr,
        label: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        credits: dayCredits,
      });
    }

    return days;
  }, [creditHistory, period]);

  const totalCredits = creditData.reduce((s, d) => s + d.credits, 0);
  const avgCredits = creditData.length > 0 ? Math.round(totalCredits / creditData.length) : 0;
  const subtitle = period === '7d' ? 'Daily credit spend (7 days)' : period === '30d' ? 'Daily credit spend (30 days)' : 'Daily credit spend (90 days)';

  if (isLoading) return <ChartSkeleton />;

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-amber-500" />
            Credit Usage
          </h4>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] sm:text-xs">
          <div className="text-right">
            <p className="font-bold tabular-nums">{totalCredits}</p>
            <p className="text-muted-foreground">Total</p>
          </div>
          <div className="text-right">
            <p className="font-bold tabular-nums">{avgCredits}</p>
            <p className="text-muted-foreground">Avg/day</p>
          </div>
        </div>
      </div>

      <SVGLineChart data={creditData} color="#f59e0b" />
    </div>
  );
}

/* ===== Revenue Funnel Visualization ===== */
function RevenueFunnelChart({ period }: { period: Period }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });

  const { data: leadsResult } = useQuery({
    queryKey: ['leads', { sortBy: 'conversionScore' }],
    queryFn: () => fetchLeads({ sortBy: 'conversionScore', sortOrder: 'desc' }),
  });

  const leads = leadsResult?.leads;

  const funnelData = useMemo<FunnelStage[]>(() => {
    const breakdown = stats?.stageBreakdown ?? {};
    const breakdownTotal = Object.values(breakdown).reduce((s: number, c) => s + c, 0);
    const total = (leads?.length ?? breakdownTotal) || 1;

    return FUNNEL_STAGES.map((fs) => {
      const count = breakdown[fs.key] ?? leads?.filter((l) => l.stage === fs.key).length ?? 0;
      return {
        label: fs.label,
        count,
        color: fs.color,
        percentage: Math.round((count / total) * 100),
      };
    });
  }, [stats, leads]);

  const maxCount = Math.max(...funnelData.map((d) => d.count), 1);
  const subtitle = period === '7d' ? 'Conversion funnel this week' : period === '30d' ? 'Conversion funnel this month' : 'Conversion funnel this quarter';

  // Compute conversion rates between stages
  const conversionRates = useMemo(() => {
    const rates: string[] = [];
    for (let i = 1; i < funnelData.length; i++) {
      const prev = funnelData[i - 1].count;
      const curr = funnelData[i].count;
      if (prev > 0) {
        rates.push(`${Math.round((curr / prev) * 100)}%`);
      } else {
        rates.push('—');
      }
    }
    return rates;
  }, [funnelData]);

  if (isLoading) return <ChartSkeleton />;

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Revenue Funnel
          </h4>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="font-medium">{funnelData[0]?.count ?? 0} total</span>
        </div>
      </div>

      <div className="space-y-2">
        {funnelData.map((stage, index) => (
          <React.Fragment key={stage.label}>
            <FunnelBar
              label={stage.label}
              count={stage.count}
              color={stage.color}
              percentage={stage.percentage}
              maxCount={maxCount}
              delay={index * 120 + 100}
            />
            {index < funnelData.length - 1 && (
              <div className="flex items-center gap-3 pl-[90px] sm:pl-[100px]">
                <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground/60">
                  {conversionRates[index]} conversion
                </span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ===== Main Dashboard Charts Component ===== */
export default function DashboardCharts() {
  const [pipelinePeriod, setPipelinePeriod] = useState<Period>('7d');
  const [creditPeriod, setCreditPeriod] = useState<Period>('7d');
  const [funnelPeriod, setFunnelPeriod] = useState<Period>('7d');

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="space-y-5"
    >
      {/* Section Heading */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" />
          Pipeline Analytics
        </h3>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {/* Gradient underline */}
      <div className="h-[2px] rounded-full bg-gradient-to-r from-primary/40 via-primary/10 to-transparent -mt-3" />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Pipeline Chart */}
        <Card className="card-glow glass-card overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm relative group">
          {/* Gradient border effect */}
          <div className="absolute inset-0 rounded-xl border border-primary/10 group-hover:border-primary/20 transition-colors duration-500 pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <div className="relative">
            <div className="flex items-center justify-between px-4 pt-4 sm:px-5 sm:pt-5">
              <div />
              <PeriodSelector value={pipelinePeriod} onChange={setPipelinePeriod} />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={pipelinePeriod}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <WeeklyPipelineChart period={pipelinePeriod} />
              </motion.div>
            </AnimatePresence>
          </div>
        </Card>

        {/* Credit Usage Chart */}
        <Card className="card-glow glass-card overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm relative group">
          <div className="absolute inset-0 rounded-xl border border-primary/10 group-hover:border-primary/20 transition-colors duration-500 pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          <div className="relative">
            <div className="flex items-center justify-between px-4 pt-4 sm:px-5 sm:pt-5">
              <div />
              <PeriodSelector value={creditPeriod} onChange={setCreditPeriod} />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={creditPeriod}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <CreditUsageChart period={creditPeriod} />
              </motion.div>
            </AnimatePresence>
          </div>
        </Card>

        {/* Revenue Funnel - Full width */}
        <Card className="card-glow glass-card overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm relative group lg:col-span-2">
          <div className="absolute inset-0 rounded-xl border border-primary/10 group-hover:border-primary/20 transition-colors duration-500 pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
          <div className="relative">
            <div className="flex items-center justify-between px-4 pt-4 sm:px-5 sm:pt-5">
              <div />
              <PeriodSelector value={funnelPeriod} onChange={setFunnelPeriod} />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={funnelPeriod}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <RevenueFunnelChart period={funnelPeriod} />
              </motion.div>
            </AnimatePresence>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}
