'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  Lightbulb,
  Clock,
  Phone,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Zap,
  Target,
  MessageSquare,
  Send,
  ChevronRight,
  ChevronDown,
  Globe,
  Filter,
  Activity,
  Gauge,
  Flame,
  Rocket,
  Layers,
  Grid3X3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fetchInsights, fetchStats } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { STAGE_LABELS, STAGE_COLORS, type LeadStage, type TabId } from '@/lib/types';
import ErrorFallback from './error-fallback';

/* ===== Animated Counter Hook ===== */
function useAnimatedCounter(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;

    const start = 0;
    const diff = target - start;
    const startTime = performance.now();

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + diff * eased));
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }, [target, duration]);

  return count;
}

/* ===== Animation Variants ===== */
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const CHANNEL_COLORS = ['#10b981', '#06b6d4', '#f59e0b', '#ec4899', '#a855f7', '#64748b'];
const NICHE_COLORS = ['#10b981', '#059669', '#047857', '#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4'];

/* ===== Country Flag Map ===== */
const COUNTRY_FLAGS: Record<string, string> = {
  India: '🇮🇳',
  UAE: '🇦🇪',
  USA: '🇺🇸',
  UK: '🇬🇧',
  Canada: '🇨🇦',
  Australia: '🇦🇺',
  Germany: '🇩🇪',
  France: '🇫🇷',
  Brazil: '🇧🇷',
  Mexico: '🇲🇽',
};

/* ===== Recommendation Icon Map ===== */
const REC_ICON_MAP: Record<string, React.ElementType> = {
  clock: Clock,
  phone: Phone,
  target: Target,
  message: MessageSquare,
  dollar: DollarSign,
  zap: Zap,
  trending: TrendingUp,
  send: Send,
  filter: Filter,
};

/* ===== Priority Styling ===== */
const PRIORITY_STYLES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  high: {
    bg: 'bg-red-500/5',
    border: 'border-l-red-500',
    text: 'text-red-500',
    badge: 'bg-red-500/15 text-red-500 border-red-500/20',
  },
  medium: {
    bg: 'bg-amber-500/5',
    border: 'border-l-amber-500',
    text: 'text-amber-500',
    badge: 'bg-amber-500/15 text-amber-500 border-amber-500/20',
  },
  low: {
    bg: 'bg-emerald-500/5',
    border: 'border-l-emerald-500',
    text: 'text-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
  },
};

/* ===== Tooltip Styles ===== */
const tooltipStyle = {
  backgroundColor: 'oklch(0.15 0.015 162.48)',
  border: '1px solid oklch(1 0 0 / 0.1)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'oklch(0.985 0 0)',
};

const tooltipStyleLight = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
};

/* ===== Heatmap Color Helper ===== */
function getHeatmapColor(score: number): string {
  if (score >= 60) return 'oklch(0.696 0.17 162.48)'; // emerald
  if (score >= 30) return 'oklch(0.75 0.15 70)'; // amber
  return 'oklch(0.6 0.22 25)'; // red
}

function getHeatmapBg(score: number): string {
  if (score >= 60) return 'bg-emerald-500/30';
  if (score >= 30) return 'bg-amber-500/30';
  return 'bg-red-500/30';
}

function getHeatmapTextColor(score: number): string {
  if (score >= 60) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 30) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

/* ===== Enhanced Stat Card Component ===== */
function EnhancedStatCard({
  label,
  value,
  suffix,
  icon: Icon,
  color,
  bg,
  gradient,
  trend,
  trendUp,
  sparkle,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  gradient: string;
  trend: string;
  trendUp: boolean;
  sparkle?: boolean;
}) {
  const animatedValue = useAnimatedCounter(value);

  return (
    <motion.div variants={itemVariants}>
      <Card
        className={cn(
          'relative overflow-hidden card-glow group',
          sparkle && 'animate-sparkle'
        )}
      >
        <div className={cn('absolute inset-0', gradient)} />
        <CardContent className="relative p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div
              className={cn(
                'rounded-lg p-2.5 transition-colors',
                bg
              )}
            >
              <Icon className={cn('h-4 w-4', color)} />
            </div>
            <div
              className={cn(
                'flex items-center gap-0.5 text-xs font-medium',
                trendUp ? 'text-emerald-500' : 'text-red-500'
              )}
            >
              {trendUp ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {trend}
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums">
            {animatedValue}
            {suffix && <span className="text-base font-medium text-muted-foreground">{suffix}</span>}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ===== Enhanced Stage Funnel Component with Drop-offs ===== */
function StageFunnel({ data }: { data: { stage: string; label: string; count: number; percentage: number; color: string }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Compute drop-off data between stages
  const dropOffs = useMemo(() => {
    const result: { fromIndex: number; toIndex: number; dropPercent: number; conversionRate: number }[] = [];
    for (let i = 0; i < data.length - 1; i++) {
      const from = data[i].count;
      const to = data[i + 1].count;
      if (from > 0) {
        const dropPercent = Math.round(((from - to) / from) * 100);
        const conversionRate = Math.round((to / from) * 100);
        result.push({ fromIndex: i, toIndex: i + 1, dropPercent, conversionRate });
      }
    }
    return result;
  }, [data]);

  function getDropOffColor(dropPercent: number): string {
    if (dropPercent < 20) return 'text-emerald-500';
    if (dropPercent <= 50) return 'text-amber-500';
    return 'text-red-500';
  }

  return (
    <div className="space-y-1">
      {data.map((item, index) => {
        const widthPercent = Math.max((item.count / maxCount) * 100, 8);
        const isHovered = hoveredIndex === index;
        return (
          <React.Fragment key={item.stage}>
            <TooltipProvider>
              <UiTooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.06 }}
                    className="flex items-center gap-3 cursor-default"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <div className="w-16 sm:w-20 text-[10px] sm:text-xs text-muted-foreground text-right shrink-0">
                      {item.label}
                    </div>
                    <div className="flex-1 relative h-8 bg-muted/50 rounded-md overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${widthPercent}%` }}
                        transition={{ duration: 0.8, delay: index * 0.06, ease: 'easeOut' }}
                        className="h-full rounded-md flex items-center justify-end pr-2 relative overflow-hidden"
                        style={{ backgroundColor: item.color, minWidth: '2rem' }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/10" />
                        <span className="text-xs font-bold text-white drop-shadow-sm relative z-10">
                          {item.count}
                        </span>
                      </motion.div>
                    </div>
                    <div className="w-10 sm:w-12 text-[10px] sm:text-xs text-muted-foreground shrink-0">
                      {item.percentage}%
                    </div>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  <div className="font-semibold">{item.label}</div>
                  <div>{item.count} leads ({item.percentage}% of total)</div>
                  {index > 0 && (() => {
                    const prevCount = data[index - 1].count;
                    if (prevCount > 0) {
                      const convRate = Math.round((item.count / prevCount) * 100);
                      return <div className="text-emerald-400">Stage conversion: {convRate}%</div>;
                    }
                    return null;
                  })()}
                </TooltipContent>
              </UiTooltip>
            </TooltipProvider>

            {/* Drop-off indicator between stages */}
            {index < data.length - 1 && dropOffs[index] && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.06 + 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-16 sm:w-20 shrink-0" />
                <div className="flex-1 flex items-center gap-1.5 pl-2 py-0.5">
                  <ChevronDown className={cn('h-3 w-3', getDropOffColor(dropOffs[index].dropPercent))} />
                  <span className={cn('text-[10px] font-medium', getDropOffColor(dropOffs[index].dropPercent))}>
                    {dropOffs[index].dropPercent > 0 ? `${dropOffs[index].dropPercent}% drop` : 'No drop'}
                  </span>
                  {dropOffs[index].conversionRate > 0 && (
                    <>
                      <span className="text-[10px] text-muted-foreground mx-0.5">·</span>
                      <span className="text-[10px] font-medium text-emerald-500/80">
                        {dropOffs[index].conversionRate}% →
                      </span>
                    </>
                  )}
                </div>
                <div className="w-10 sm:w-12 shrink-0" />
              </motion.div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ===== Mini Progress Bar ===== */
function MiniProgressBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn('h-full rounded-full', colorClass)}
      />
    </div>
  );
}

/* ===== Lead Score Heatmap Component ===== */
function LeadScoreHeatmap({ data }: { data: { niche: string; country: string; avgScore: number; leadCount: number }[] }) {
  // Extract unique niches and countries from data
  const niches = useMemo(() => [...new Set(data.map((d) => d.niche))].sort(), [data]);
  const countries = useMemo(() => [...new Set(data.map((d) => d.country))].sort(), [data]);

  // Build lookup map
  const cellMap = useMemo(() => {
    const map: Record<string, Record<string, { avgScore: number; leadCount: number }>> = {};
    for (const item of data) {
      if (!map[item.niche]) map[item.niche] = {};
      map[item.niche][item.country] = { avgScore: item.avgScore, leadCount: item.leadCount };
    }
    return map;
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mx-auto mb-3">
          <Grid3X3 className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No heatmap data available</p>
        <p className="text-xs text-muted-foreground mt-1">Leads with niche and country will appear here</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <div className="min-w-fit">
        {/* Header row with country labels */}
        <div className="flex items-center gap-1 mb-1">
          <div className="w-24 shrink-0" />
          {countries.map((country) => (
            <div key={country} className="w-16 shrink-0 text-center">
              <span className="text-[10px] text-muted-foreground" title={country}>
                {COUNTRY_FLAGS[country] || '🌍'}
              </span>
            </div>
          ))}
        </div>

        {/* Rows: one per niche */}
        {niches.map((niche) => (
          <div key={niche} className="flex items-center gap-1 mb-1">
            <div className="w-24 shrink-0 text-right pr-2">
              <span className="text-[10px] text-muted-foreground truncate block" title={niche}>
                {niche}
              </span>
            </div>
            {countries.map((country) => {
              const cell = cellMap[niche]?.[country];
              if (!cell) {
                return (
                  <div key={`${niche}-${country}`} className="w-16 h-8 shrink-0 rounded-md bg-muted/20" />
                );
              }
              return (
                <TooltipProvider key={`${niche}-${country}`}>
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          'w-16 h-8 shrink-0 rounded-md flex items-center justify-center cursor-default transition-all hover:scale-105 hover:shadow-md',
                          getHeatmapBg(cell.avgScore)
                        )}
                      >
                        <span className={cn('text-[10px] font-bold', getHeatmapTextColor(cell.avgScore))}>
                          {cell.avgScore}
                        </span>
                      </motion.div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <div className="font-semibold">{niche} · {country}</div>
                      <div>Avg Score: {cell.avgScore}</div>
                      <div>{cell.leadCount} lead{cell.leadCount !== 1 ? 's' : ''}</div>
                    </TooltipContent>
                  </UiTooltip>
                </TooltipProvider>
              );
            })}
          </div>
        ))}

        {/* Color legend */}
        <div className="flex items-center justify-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-red-500/30" />
            <span className="text-[10px] text-muted-foreground">0–29</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-amber-500/30" />
            <span className="text-[10px] text-muted-foreground">30–59</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-emerald-500/30" />
            <span className="text-[10px] text-muted-foreground">60–100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Trend Indicator Component ===== */
function TrendIndicator({ value }: { value: number }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <div className={cn(
      'flex items-center gap-0.5 text-[10px] font-medium shrink-0',
      isPositive ? 'text-emerald-500' : 'text-red-500'
    )}>
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {isPositive ? '+' : ''}{value}%
    </div>
  );
}

/* ===== Main Component ===== */
export default function InsightsTab() {
  const { setActiveTab, setSelectedLeadId } = useAppStore();

  const { data: insights, isLoading: insightsLoading, error: insightsError, refetch: refetchInsights } = useQuery({
    queryKey: ['insights'],
    queryFn: fetchInsights,
  });

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });

  // Performance trends from API
  const trends = insights?.performanceTrends;

  if (insightsLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  // Error state — insights are the primary data source
  if (insightsError && !insights) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorFallback
          error={insightsError instanceof Error ? insightsError : null}
          onRetry={() => refetchInsights()}
          title="Failed to Load Insights"
          description="We couldn't load your analytics data. Please try again."
          className="min-h-[300px]"
        />
      </div>
    );
  }

  /* ===== Metric Cards Data with dynamic trends ===== */
  const metricCards = [
    {
      label: 'Reply Rate',
      value: stats?.replyRate ?? 0,
      suffix: '%',
      icon: Phone,
      color: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
      gradient: 'stat-card-gradient-blue',
      trend: trends ? `${trends.reply.trend > 0 ? '+' : ''}${trends.reply.trend}%` : '+5%',
      trendUp: trends ? trends.reply.trend >= 0 : true,
    },
    {
      label: 'Close Rate',
      value: stats?.closeRate ?? 0,
      suffix: '%',
      icon: TrendingUp,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      gradient: 'stat-card-gradient-emerald',
      trend: trends ? `${trends.deals.trend > 0 ? '+' : ''}${trends.deals.trend}%` : '+12%',
      trendUp: trends ? trends.deals.trend >= 0 : true,
    },
    {
      label: 'Avg Deal Value',
      value: stats?.avgDealValue ?? 0,
      suffix: '',
      icon: DollarSign,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      gradient: 'stat-card-gradient-amber',
      trend: trends ? `${trends.pipeline.trend > 0 ? '+' : ''}${trends.pipeline.trend}%` : '+8%',
      trendUp: trends ? trends.pipeline.trend >= 0 : true,
    },
    {
      label: 'Total Deals',
      value: stats?.totalDeals ?? 0,
      suffix: '',
      icon: BarChart3,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      gradient: 'stat-card-gradient-purple',
      trend: trends ? `${trends.leads.trend > 0 ? '+' : ''}${trends.leads.trend}%` : '+3%',
      trendUp: trends ? trends.leads.trend >= 0 : true,
      sparkle: true,
    },
  ];

  return (
    <ScrollArea className="h-full custom-scrollbar">
      <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6">
        {/* ═══ Quick Stats Row ═══ */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          {[
            {
              label: 'Avg Response Time',
              value: '2.4h',
              icon: Clock,
              color: 'text-sky-500',
              bg: 'bg-sky-500/10',
              trend: '-18%',
              trendUp: true,
            },
            {
              label: 'Best Channel',
              value: 'LinkedIn',
              icon: Send,
              color: 'text-violet-500',
              bg: 'bg-violet-500/10',
              trend: '+24%',
              trendUp: true,
            },
            {
              label: 'Hot Leads %',
              value: '32%',
              icon: Flame,
              color: 'text-orange-500',
              bg: 'bg-orange-500/10',
              trend: '+5%',
              trendUp: true,
            },
            {
              label: 'Pipeline Velocity',
              value: '$48k/wk',
              icon: Rocket,
              color: 'text-emerald-500',
              bg: 'bg-emerald-500/10',
              trend: trends ? `${trends.pipeline.trend > 0 ? '+' : ''}${trends.pipeline.trend}%` : '+12%',
              trendUp: trends ? trends.pipeline.trend >= 0 : true,
            },
          ].map((stat) => (
            <motion.div key={stat.label} variants={itemVariants}>
              <Card className="card-glow group">
                <CardContent className="p-2 sm:p-3 flex items-center gap-2 sm:gap-3">
                  <div className={cn('rounded-lg p-1.5 sm:p-2 shrink-0', stat.bg)}>
                    <stat.icon className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', stat.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.label}</p>
                    <p className="text-sm sm:text-base font-bold truncate">{stat.value}</p>
                  </div>
                  <div className={cn(
                    'flex items-center gap-0.5 text-[10px] font-medium shrink-0',
                    stat.trendUp ? 'text-emerald-500' : 'text-red-500'
                  )}>
                    {stat.trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {stat.trend}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* ═══ 1. Enhanced Metric Cards ═══ */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4"
        >
          {metricCards.map((metric) => (
            <EnhancedStatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              suffix={metric.suffix}
              icon={metric.icon}
              color={metric.color}
              bg={metric.bg}
              gradient={metric.gradient}
              trend={metric.trend}
              trendUp={metric.trendUp}
              sparkle={metric.sparkle}
            />
          ))}
        </motion.div>

        {/* ═══ Conversion Rate Trend Sparkline ═══ */}
        <Card className="card-glow">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-0.5">Lead-to-Deal Conversion Rate (8 weeks)</p>
                <p className="text-base sm:text-lg font-bold text-emerald-500">
                  −%
                </p>
              </div>
              <div className="mini-sparkline hidden sm:block">
                <svg width="160" height="40" viewBox="0 0 160 40">
                  {(() => {
                    const data: number[] = [];
                    if (data.length === 0) {
                      return (
                        <text x="80" y="24" textAnchor="middle" className="fill-muted-foreground/40" fontSize="10">
                          No data yet
                        </text>
                      );
                    }
                    const max = Math.max(...data);
                    const min = Math.min(...data);
                    const range = max - min || 1;
                    const w = 160;
                    const h = 40;
                    const points = data.map((v, i) => {
                      const x = (i / (data.length - 1)) * w;
                      const y = h - ((v - min) / range) * (h - 8) - 4;
                      return `${x},${y}`;
                    }).join(' ');
                    const areaPoints = `0,${h} ${points} ${w},${h}`;
                    return (
                      <>
                        <defs>
                          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>
                        <polygon points={areaPoints} fill="url(#sparkGrad)" />
                        <polyline
                          points={points}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {data.map((v, i) => {
                          const x = (i / (data.length - 1)) * w;
                          const y = h - ((v - min) / range) * (h - 8) - 4;
                          return (
                            <circle key={i} cx={x} cy={y} r={i === data.length - 1 ? 3.5 : 2} fill="#10b981" stroke="white" strokeWidth={i === data.length - 1 ? 2 : 1} />
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              </div>
              <div className="flex items-center gap-0.5 text-emerald-500 text-[10px] sm:text-xs font-medium">
                <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                +16% vs prev period
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══ 2. Stage Funnel + Score Distribution ═══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Stage Funnel with Drop-offs */}
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                Stage Funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StageFunnel data={insights?.stageFunnel ?? []} />
            </CardContent>
          </Card>

          {/* Score Distribution Donut Chart */}
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Score Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={insights?.scoreDistribution ?? []}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="range"
                      strokeWidth={0}
                    >
                      {(insights?.scoreDistribution ?? []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number, name: string) => [`${value} leads`, `Score ${name}`]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => (
                        <span className="text-xs text-muted-foreground">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Score range legend with counts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {(insights?.scoreDistribution ?? []).map((item) => (
                  <div key={item.range} className="text-center">
                    <div
                      className="h-1.5 rounded-full mx-auto mb-1"
                      style={{ backgroundColor: item.fill, width: '60%' }}
                    />
                    <p className="text-[10px] text-muted-foreground">{item.range}</p>
                    <p className="text-xs font-semibold">{item.count}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ 3. Charts Row: Outreach Channels + Conversion by Niche ═══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Best Outreach Channels */}
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                Best Outreach Channels
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={insights?.bestChannels ?? []}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis
                      type="category"
                      dataKey="channel"
                      tick={{ fontSize: 12 }}
                      width={80}
                      className="fill-muted-foreground"
                    />
                    <Tooltip
                      contentStyle={tooltipStyleLight}
                      formatter={(value: number) => [`${value}%`, 'Success Rate']}
                    />
                    <Bar dataKey="successRate" radius={[0, 4, 4, 0]}>
                      {(insights?.bestChannels ?? []).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Conversion by Niche */}
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Conversion by Niche
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={insights?.conversionByNiche ?? []}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis
                      type="category"
                      dataKey="niche"
                      tick={{ fontSize: 12 }}
                      width={90}
                      className="fill-muted-foreground"
                    />
                    <Tooltip
                      contentStyle={tooltipStyleLight}
                      formatter={(value: number) => [`${value}%`, 'Conversion']}
                    />
                    <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                      {(insights?.conversionByNiche ?? []).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={NICHE_COLORS[index % NICHE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ 4. Weekly Performance Line Chart ═══ */}
        <Card className="card-glow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Weekly Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={insights?.weeklyPerformance ?? []}
                  margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={tooltipStyleLight} />
                  <Line
                    type="monotone"
                    dataKey="newLeads"
                    name="New Leads"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#10b981' }}
                    activeDot={{ r: 6, fill: '#10b981' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="dealsClosed"
                    name="Deals Closed"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#f59e0b' }}
                    activeDot={{ r: 6, fill: '#f59e0b' }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ═══ 5. Lead Score Heatmap ═══ */}
        <Card className="card-glow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-primary" />
              Lead Score Heatmap
              <span className="text-xs text-muted-foreground font-normal ml-1">Niche × Country avg conversion score</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeadScoreHeatmap data={insights?.leadScoreHeatmap ?? []} />
          </CardContent>
        </Card>

        {/* ═══ 6. Enhanced Performance by Country ═══ */}
        <Card className="card-glow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Performance by Country
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(insights?.performanceByCountry ?? []).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {insights!.performanceByCountry.map((country, index) => {
                  const flag = COUNTRY_FLAGS[country.country] || '🌍';
                  const maxConversion = 100;
                  return (
                    <motion.div
                      key={country.country}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-3 sm:p-4 rounded-xl border bg-card hover:shadow-md transition-all group hover-lift-enhanced"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl" role="img" aria-label={country.country}>{flag}</span>
                        <div>
                          <p className="text-sm font-semibold">{country.country}</p>
                        </div>
                        <div className="ml-auto flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                            {country.leads} leads
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {country.won} won
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Conversion</span>
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-emerald-500">{country.conversion}%</span>
                            </div>
                          </div>
                          <MiniProgressBar
                            value={country.conversion}
                            max={maxConversion}
                            colorClass="score-bar-gradient-high"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Reply Rate</span>
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-cyan-500">{country.replyRate}%</span>
                            </div>
                          </div>
                          <MiniProgressBar
                            value={country.replyRate}
                            max={maxConversion}
                            colorClass="bg-gradient-to-r from-cyan-500 to-cyan-400"
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No country data available</p>
            )}
          </CardContent>
        </Card>

        {/* ═══ 7. Lead Source Tracking ═══ */}
        <Card className="card-glow glow-pulse-emerald">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Lead Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(insights?.sourceEffectiveness ?? []).length > 0 ? (
              <div className="space-y-5">
                {/* Horizontal Bar Chart */}
                <div className="space-y-3">
                  {(() => {
                    const sources = insights?.sourceEffectiveness ?? [];
                    const maxLeadCount = Math.max(...sources.map((s) => s.leadCount), 1);
                    const sourceColors: Record<string, string> = {
                      discovered: 'oklch(0.6 0.15 250)',
                      imported: 'oklch(0.696 0.17 162.48)',
                      manual: 'oklch(0.75 0.15 70)',
                      referral: 'oklch(0.6 0.2 300)',
                    };
                    const sourceIcons: Record<string, string> = {
                      discovered: '🔍',
                      imported: '📥',
                      manual: '✍️',
                      referral: '🤝',
                    };
                    return sources.map((item, index) => {
                      const barWidth = Math.max((item.leadCount / maxLeadCount) * 100, 8);
                      const color = sourceColors[item.source.toLowerCase()] ?? 'oklch(0.556 0 0)';
                      const icon = sourceIcons[item.source.toLowerCase()] ?? '📊';
                      const conversionRate = item.leadCount > 0
                        ? Math.round((item.dealsWon / item.leadCount) * 100)
                        : 0;
                      return (
                        <motion.div
                          key={item.source}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.08, duration: 0.4 }}
                          className="space-y-1.5 fade-in-up"
                          style={{ animationDelay: `${index * 80}ms` }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{icon}</span>
                              <span className="text-sm font-medium capitalize">{item.source}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground">
                                {item.leadCount} lead{item.leadCount !== 1 ? 's' : ''}
                              </span>
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                                {conversionRate}% conv.
                              </Badge>
                              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                                ${item.pipelineValue.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="relative h-8 rounded-md overflow-hidden border border-border/30">
                            <div className="absolute inset-0 rounded-md bg-muted/30" />
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${barWidth}%` }}
                              transition={{
                                duration: 0.8,
                                delay: index * 0.08,
                                ease: 'easeOut',
                              }}
                              className="h-full rounded-md relative overflow-hidden"
                              style={{
                                background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                                minWidth: '2rem',
                              }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-white/5" />
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/90 tabular-nums">
                                {item.leadCount}
                              </span>
                            </motion.div>
                          </div>
                          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                            <span>Avg Conv. Score: <span className="font-mono font-medium text-foreground">{item.avgConversionScore}%</span></span>
                            <span>Deals Won: <span className="font-mono font-medium text-emerald-500">{item.dealsWon}</span></span>
                            <span>Reply Score: <span className="font-mono font-medium text-foreground">{item.avgReplyScore}%</span></span>
                          </div>
                        </motion.div>
                      );
                    });
                  })()}
                </div>

                {/* Summary */}
                <div className="pt-3 border-t flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Total sources: {(insights?.sourceEffectiveness ?? []).length}
                  </span>
                  <span className="text-xs font-medium text-primary">
                    {(insights?.sourceEffectiveness ?? []).reduce((sum, s) => sum + s.leadCount, 0)} total leads
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mx-auto mb-3">
                  <Layers className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No source data available yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Leads with a source attribute will appear here
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ 8. Bottom Section: Top Leads, Follow-ups, Recommendations ═══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Enhanced Top Leads to Contact */}
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-primary" />
                Top Leads to Contact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-96 custom-scrollbar">
                <div className="space-y-2">
                  {(insights?.topLeadsToContact ?? []).length > 0 ? (
                    insights!.topLeadsToContact.map((lead, i) => (
                      <div
                        key={lead.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer group table-row-hover"
                        onClick={() => {
                          setSelectedLeadId(lead.id);
                          setActiveTab('leads');
                        }}
                      >
                        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
                          {i + 1}
                          {/* Urgency indicator dot */}
                          {lead.urgencyScore > 70 && (
                            <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-card animate-pulse" />
                          )}
                          {lead.urgencyScore <= 70 && lead.urgencyScore > 40 && (
                            <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 border-2 border-card" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                            {lead.businessName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {lead.niche} · {lead.country}
                          </p>
                          {/* Mini progress bar for conversion score */}
                          <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                lead.conversionScore >= 75
                                  ? 'score-bar-gradient-high'
                                  : lead.conversionScore >= 50
                                    ? 'score-bar-gradient-medium'
                                    : 'score-bar-gradient-low'
                              )}
                              style={{ width: `${lead.conversionScore}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs font-semibold text-primary">{lead.conversionScore}%</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-primary hover:text-primary hover:bg-primary/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLeadId(lead.id);
                              setActiveTab('outreach');
                            }}
                          >
                            Contact
                            <ArrowRight className="h-3 w-3 ml-0.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No pending leads to contact
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Follow-ups Needed */}
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Follow-ups Needed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-96 custom-scrollbar">
                <div className="space-y-2">
                  {(insights?.followUpsNeeded ?? []).length > 0 ? (
                    insights!.followUpsNeeded.map((lead) => (
                      <div
                        key={lead.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer group table-row-hover"
                        onClick={() => {
                          setSelectedLeadId(lead.id);
                          setActiveTab('leads');
                        }}
                      >
                        <div className="relative">
                          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                          {lead.daysSinceContact > 7 && (
                            <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                            {lead.businessName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {lead.daysSinceContact}d ago
                            {lead.bestChannel ? ` · via ${lead.bestChannel}` : ''}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-xs text-primary hover:text-primary hover:bg-primary/10 min-h-[28px] active:scale-95 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLeadId(lead.id);
                            setActiveTab('outreach');
                          }}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No follow-ups needed
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Enhanced AI Recommendations */}
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                AI Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-96 custom-scrollbar">
                <div className="space-y-2.5">
                  {(insights?.recommendations ?? []).length > 0 ? (
                    insights!.recommendations.map((rec) => {
                      const Icon = REC_ICON_MAP[rec.icon] || Lightbulb;
                      const priorityStyle = PRIORITY_STYLES[rec.priority] || PRIORITY_STYLES.low;
                      return (
                        <div
                          key={rec.id}
                          className={cn(
                            'flex gap-3 p-3 rounded-lg border-l-3 transition-colors',
                            priorityStyle.bg,
                            priorityStyle.border
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-full shrink-0',
                              priorityStyle.badge
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-foreground leading-snug">{rec.text}</p>
                              {rec.actionTab && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    'shrink-0 h-6 px-2 text-[10px] min-h-[24px] active:scale-95 transition-all',
                                    priorityStyle.text,
                                    'hover:bg-transparent'
                                  )}
                                  onClick={() => setActiveTab(rec.actionTab as TabId)}
                                >
                                  Go
                                  <ChevronRight className="h-3 w-3 ml-0.5" />
                                </Button>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={cn('mt-1.5 text-[9px] px-1.5 py-0 border', priorityStyle.badge)}
                            >
                              {rec.priority}
                            </Badge>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No recommendations yet
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
