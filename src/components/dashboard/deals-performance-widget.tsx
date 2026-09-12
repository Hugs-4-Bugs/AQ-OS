'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  Trophy,
  Target,
  BarChart3,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/* ===== Types ===== */

interface DealPerformanceWidgetProps {
  className?: string;
  compact?: boolean;
}

interface MetricData {
  label: string;
  value: string;
  rawValue: number;
  change: number;
  icon: React.ElementType;
}

interface PipelineStage {
  stage: string;
  count: number;
  color: string;
}

/* ===== API Data Types ===== */

interface MetricsData {
  totalPipeline: number;
  wonDeals: number;
  winRate: number;
  avgDealSize: number;
  pipelineChange: number;
  wonChange: number;
  winRateChange: number;
  avgSizeChange: number;
  pipelineStages: PipelineStage[];
}

/* ===== Helpers ===== */

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

/* ===== Loading Skeleton ===== */

function PerformanceSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl p-4 space-y-4',
        'surface-elevated border border-border/30',
      )}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted/50" />
            <div className="h-6 w-24 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted/40" />
          </div>
        ))}
      </div>
      {!compact && (
        <>
          <div className="h-20 w-full animate-pulse rounded-xl bg-muted/40" />
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 animate-pulse rounded-full bg-muted/40" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted/50" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted/40" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ===== Trend Indicator ===== */

function TrendIndicator({ change }: { change: number }) {
  const isPositive = change >= 0;
  return (
    <div
      className={cn(
        'flex items-center gap-0.5',
        isPositive ? 'text-emerald-500' : 'text-red-500',
      )}
    >
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      <span className="text-[11px] font-semibold tabular-nums">
        {Math.abs(change).toFixed(1)}%
      </span>
    </div>
  );
}

/* ===== Metric Card ===== */

function MetricCard({
  metric,
  index,
}: {
  metric: MetricData;
  index: number;
}) {
  const Icon = metric.icon;

  const iconBgColors: Record<number, string> = {
    0: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    1: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    2: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    3: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.08,
        duration: 0.45,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={cn(
        'group relative flex flex-col gap-1.5 rounded-xl p-3',
        'border border-border/40 bg-background/50 backdrop-blur-sm',
        'transition-all duration-300',
        'card-hover-reveal hover-glow-primary',
        'depth-shadow-sm',
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            'transition-transform duration-300 group-hover:scale-110',
            iconBgColors[index % 4],
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <TrendIndicator change={metric.change} />
      </div>
      <span className="text-xs font-medium text-muted-foreground leading-tight">
        {metric.label}
      </span>
      <span className="text-xl font-bold tracking-tight tabular-nums text-gradient-primary leading-none">
        {metric.value}
      </span>
    </motion.div>
  );
}

/* ===== Pipeline Funnel ===== */

function PipelineFunnel({ stages }: { stages: PipelineStage[] }) {
  const maxCount = useMemo(
    () => Math.max(...stages.map((s) => s.count)),
    [stages],
  );
  const totalCount = useMemo(
    () => stages.reduce((sum, s) => sum + s.count, 0),
    [stages],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.5 }}
      className="space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Pipeline Funnel
        </h4>
        <span className="text-xs text-muted-foreground tabular-nums">
          {totalCount} total deals
        </span>
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {stages.map((stage, i) => {
          const widthPercent = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
          return (
            <motion.div
              key={stage.stage}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{
                delay: 0.45 + i * 0.08,
                duration: 0.4,
                ease: 'easeOut',
              }}
              className="flex flex-1 flex-col items-center gap-1"
              style={{ transformOrigin: 'bottom' }}
            >
              <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                {stage.count}
              </span>
              <div
                className={cn(
                  'w-full rounded-t-md transition-all duration-500',
                  stage.color,
                )}
                style={{ height: `${widthPercent}%`, minHeight: '8px' }}
              />
              <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                {stage.stage}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ===== Win Rate Gauge ===== */

function WinRateGauge({ rate, change }: { rate: number; change: number }) {
  const radius = 40;
  const strokeWidth = 6;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (rate / 100) * circumference;

  const getRateColor = (r: number) => {
    if (r >= 40) return { ring: '#10b981', text: 'text-emerald-500', label: 'Excellent' };
    if (r >= 25) return { ring: '#6366f1', text: 'text-violet-500', label: 'Good' };
    if (r >= 15) return { ring: '#f59e0b', text: 'text-amber-500', label: 'Average' };
    return { ring: '#ef4444', text: 'text-red-500', label: 'Low' };
  };

  const { ring, text, label } = getRateColor(rate);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className="flex items-center gap-4"
    >
      <div className="relative flex-shrink-0">
        <svg
          height={radius * 2}
          width={radius * 2}
          className="-rotate-90"
          aria-label={`Win rate gauge: ${rate}%`}
        >
          {/* Background track */}
          <circle
            stroke="currentColor"
            className="text-muted/30"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          {/* Progress arc */}
          <motion.circle
            stroke={ring}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ delay: 0.8, duration: 1.2, ease: 'easeOut' }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Target className="h-3.5 w-3.5 text-muted-foreground mb-0.5" />
          <span className={cn('text-sm font-bold tabular-nums leading-none', text)}>
            {rate.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <div>
          <span className="text-sm font-semibold text-foreground">Win Rate</span>
          <span
            className={cn(
              'ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
              rate >= 25
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            )}
          >
            {label}
          </span>
        </div>
        <TrendIndicator change={change} />
        <p className="text-[11px] text-muted-foreground">
          {rate >= 25
            ? 'Win rate is above target benchmark'
            : 'Consider optimizing conversion funnel'}
        </p>
      </div>
    </motion.div>
  );
}

/* ===== Main Component ===== */

export default function DealPerformanceWidget({
  className,
  compact = false,
}: DealPerformanceWidgetProps) {
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/dashboard/deals-performance')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((res) => {
        if (res.data) setMetricsData(res.data);
        else setError('No data returned');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const metrics: MetricData[] = useMemo(
    () =>
      metricsData
        ? [
            {
              label: 'Total Pipeline',
              value: formatCurrency(metricsData.totalPipeline),
              rawValue: metricsData.totalPipeline,
              change: metricsData.pipelineChange,
              icon: DollarSign,
            },
            {
              label: 'Won Deals',
              value: String(metricsData.wonDeals),
              rawValue: metricsData.wonDeals,
              change: metricsData.wonChange,
              icon: Trophy,
            },
            {
              label: 'Win Rate',
              value: `${metricsData.winRate.toFixed(1)}%`,
              rawValue: metricsData.winRate,
              change: metricsData.winRateChange,
              icon: Target,
            },
            {
              label: 'Avg Deal Size',
              value: formatCurrency(metricsData.avgDealSize),
              rawValue: metricsData.avgDealSize,
              change: metricsData.avgSizeChange,
              icon: BarChart3,
            },
          ]
        : [],
    [metricsData],
  );

  if (loading) return <PerformanceSkeleton compact={compact} />;
  if (error) return <div className="p-6 text-destructive">Error: {error}</div>;
  if (!metricsData) return <div className="p-6 text-muted-foreground">No data available yet.</div>;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn('animate-fade-in-up', className)}
      aria-label="Deals performance metrics"
    >
      <div
        className={cn(
          'rounded-2xl p-4 space-y-4',
          'surface-elevated border border-border/30',
          'backdrop-blur-md',
        )}
      >
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Deals Performance
          </h3>
          {!compact && (
            <span className="text-[11px] text-muted-foreground">
              Last 30 days
            </span>
          )}
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {metrics.map((metric, index) => (
            <MetricCard key={metric.label} metric={metric} index={index} />
          ))}
        </div>

        {/* Funnel + Gauge (hidden in compact mode) */}
        {!compact && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            <PipelineFunnel stages={metricsData.pipelineStages} />
            <WinRateGauge
              rate={metricsData.winRate}
              change={metricsData.winRateChange}
            />
          </div>
        )}
      </div>
    </motion.section>
  );
}

/* ===== Skeleton Export for Loading State ===== */

export { PerformanceSkeleton as DealPerformanceSkeleton };
