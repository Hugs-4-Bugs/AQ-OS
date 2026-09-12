'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  TrendingUp,
  Users,
  DollarSign,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Zap,
  BarChart3,
  Clock,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
interface StatItem {
  id: string;
  label: string;
  value: number;
  trend: number;
  icon: React.ElementType;
  color: string;
  format: 'number' | 'currency' | 'percent' | 'time';
}

interface StatWithSparkline extends StatItem {
  sparkline: number[];
  prevValue: number;
}

/* ===== Icon Map for API data ===== */
const ICON_MAP: Record<string, React.ElementType> = {
  Users,
  Target,
  DollarSign,
  TrendingUp,
  Clock,
  Zap,
  Activity,
  BarChart3,
};

/* ===== Constants ===== */
const SPARKLINE_WIDTH = 60;
const SPARKLINE_HEIGHT = 24;
const SPARKLINE_POINTS = 10;
const UPDATE_INTERVAL_MS = 5000;

/* ===== Helpers ===== */

/** Generate a deterministic sparkline from a stat's value using sine wave. */
function generateSparkline(baseValue: number, _format: StatItem['format']): number[] {
  const data: number[] = [];
  for (let i = 0; i < SPARKLINE_POINTS; i++) {
    const wave = Math.sin((i / SPARKLINE_POINTS) * Math.PI * 2) * (baseValue * 0.15);
    const trend = (i / SPARKLINE_POINTS) * baseValue * 0.1;
    data.push(Math.max(0, Math.round(baseValue + wave + trend)));
  }
  return data;
}

/** Format a raw numeric value for display. */
function formatValue(value: number, format: StatItem['format']): string {
  switch (format) {
    case 'number':
      return Math.round(value).toLocaleString();
    case 'currency':
      if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
      return `$${Math.round(value).toLocaleString()}`;
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'time':
      return `${value.toFixed(1)}h`;
    default:
      return String(Math.round(value));
  }
}

/** Build an SVG sparkline path string from data points. */
function buildSparklinePath(points: number[]): { linePath: string; fillPath: string } {
  if (points.length < 2) return { linePath: '', fillPath: '' };

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const padding = 2;

  const coords = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (SPARKLINE_WIDTH - padding * 2);
    const y = SPARKLINE_HEIGHT - padding - ((p - min) / range) * (SPARKLINE_HEIGHT - padding * 2);
    return { x, y };
  });

  // Smooth bezier curve through points
  const lineParts: string[] = [`M ${coords[0].x},${coords[0].y}`];
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
    const cpx2 = prev.x + (curr.x - prev.x) * 0.6;
    lineParts.push(`C ${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`);
  }
  const linePath = lineParts.join(' ');

  // Fill path closes to bottom
  const lastCoord = coords[coords.length - 1];
  const firstCoord = coords[0];
  const fillPath = `${linePath} L ${lastCoord.x},${SPARKLINE_HEIGHT} L ${firstCoord.x},${SPARKLINE_HEIGHT} Z`;

  return { linePath, fillPath };
}

/** Extract gradient color classes into actual hex colors for SVG gradients. */
const GRADIENT_HEX: Record<string, [string, string]> = {
  'from-blue-500 to-cyan-500': ['#3b82f6', '#06b6d4'],
  'from-purple-500 to-pink-500': ['#a855f7', '#ec4899'],
  'from-emerald-500 to-green-500': ['#10b981', '#22c55e'],
  'from-amber-500 to-orange-500': ['#f59e0b', '#f97316'],
  'from-rose-500 to-red-500': ['#f43f5e', '#ef4444'],
  'from-violet-500 to-purple-500': ['#8b5cf6', '#a855f7'],
};

/* ===== Sparkline SVG Component ===== */
function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  const { linePath, fillPath } = useMemo(() => buildSparklinePath(points), [points]);
  const [startHex, endHex] = GRADIENT_HEX[color] ?? ['#6366f1', '#8b5cf6'];
  const gradientId = useMemo(() => `spark-${points.map(p => p).join('')}`, [points]);

  if (!linePath) return null;

  return (
    <svg
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      className="shrink-0 opacity-80"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={startHex} stopOpacity={0.3} />
          <stop offset="100%" stopColor={endHex} stopOpacity={0.3} />
        </linearGradient>
        <linearGradient id={`${gradientId}-line`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={startHex} />
          <stop offset="100%" stopColor={endHex} />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={`url(#${gradientId}-line)`} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

/* ===== Single Stat Card ===== */
function StatCard({
  stat,
  index,
  lastUpdated,
}: {
  stat: StatWithSparkline;
  index: number;
  lastUpdated: number;
}) {
  const Icon = stat.icon;
  const isPositive = stat.trend >= 0;
  const isDeals = stat.id === 'deals';
  const valueChanged = stat.prevValue !== stat.value;
  const secondsAgo = Math.floor((Date.now() - lastUpdated) / 1000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.08,
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="snap-center shrink-0 w-[160px] sm:w-[170px] lg:w-auto lg:flex-1"
    >
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card
              className={cn(
                'relative overflow-hidden rounded-xl border border-border/50 bg-background/60 backdrop-blur-md',
                'transition-all duration-300 hover:bg-accent/40 hover:border-border',
                'glass-card-hover',
                isDeals &&
                  valueChanged &&
                  'ring-2 ring-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]',
              )}
            >
              {/* Subtle gradient accent at top */}
              <div
                className={cn(
                  'absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r opacity-60',
                  stat.color,
                )}
              />

              <CardContent className="p-4 flex flex-col gap-3">
                {/* Header row: icon + label */}
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br text-white shadow-sm',
                      stat.color,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground leading-tight">
                    {stat.label}
                  </span>
                </div>

                {/* Value + trend */}
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <motion.p
                      key={stat.value}
                      initial={{ opacity: 0.6, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-xl font-bold tracking-tight tabular-nums leading-none"
                    >
                      {formatValue(stat.value, stat.format)}
                    </motion.p>

                    <div
                      className={cn(
                        'flex items-center gap-0.5 mt-1.5',
                        isPositive ? 'text-emerald-500' : 'text-red-500',
                      )}
                    >
                      {isPositive ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      <span className="text-[11px] font-semibold tabular-nums">
                        {Math.abs(stat.trend).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <MiniSparkline points={stat.sparkline} color={stat.color} />
                </div>
              </CardContent>

              {/* Deals card pulse glow */}
              {isDeals && valueChanged && (
                <motion.div
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 pointer-events-none"
                />
              )}
            </Card>
          </TooltipTrigger>

          <TooltipContent side="bottom" className="text-xs">
            <span>Updated {secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`}</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </motion.div>
  );
}

/* ===== Main Component ===== */
export default function LiveStatsBar() {
  const [stats, setStats] = useState<StatWithSparkline[]>([]);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/realtime')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => {
        const initialStats: StatItem[] = (d?.stats ?? d ?? []).map((s: Record<string, unknown>) => ({
          ...s,
          icon: typeof s.icon === 'string' ? (ICON_MAP[s.icon as string] ?? Activity) : (s.icon as React.ElementType) ?? Activity,
        }));
        const withSparklines = initialStats.map((s) => ({
          ...s,
          sparkline: generateSparkline(s.value, s.format),
          prevValue: s.value,
        }));
        setStats(withSparklines);
      })
      .catch(() => {
        // graceful fallback — leave stats empty
      })
      .finally(() => setLoading(false));
  }, []);

  const simulateLiveUpdate = useCallback(() => {
    setStats((prev) =>
      prev.map((stat) => {
        const variance =
          stat.format === 'currency'
            ? stat.value * 0.015
            : stat.format === 'percent' || stat.format === 'time'
              ? stat.value * 0.05
              : Math.max(stat.value * 0.02, 3);

        // Deterministic slight shift using sine wave
        const tick = Date.now() / 1000;
        const trendShift = Math.sin(tick * 0.5) * 0.5;
        const newValue = stat.value + Math.sin(tick * 0.7) * variance * 0.3;

        // Clamp to sane ranges
        let clamped = newValue;
        if (stat.format === 'time') clamped = Math.max(0.5, Math.min(24, clamped));
        if (stat.format === 'percent') clamped = Math.max(1, Math.min(99, clamped));
        if (stat.format === 'currency') clamped = Math.max(0, clamped);
        if (stat.format === 'number') clamped = Math.max(0, Math.round(clamped));

        // Shift sparkline — drop oldest, append new
        const shifted = [...stat.sparkline.slice(1), clamped];

        return {
          ...stat,
          value: clamped,
          prevValue: stat.value,
          trend: stat.trend + trendShift,
          sparkline: shifted,
        };
      }),
    );
    setLastUpdated(Date.now());
  }, []);

  useEffect(() => {
    // Only run live simulation in development to prevent memory/resource waste in production
    if (process.env.NODE_ENV !== 'development') return;
    if (stats.length === 0) return;
    intervalRef.current = setInterval(simulateLiveUpdate, UPDATE_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [simulateLiveUpdate, stats.length]);

  if (loading) {
    return (
      <section aria-label="Live statistics overview">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-primary" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] w-[160px] sm:w-[170px] rounded-xl shrink-0" />
          ))}
        </div>
      </section>
    );
  }

  if (stats.length === 0) {
    return (
      <section aria-label="Live statistics overview">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight">Live Overview</h2>
        </div>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <BarChart3 className="h-8 w-8 mb-2 opacity-30 mr-2" />
          <p className="text-xs">No live stats available</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Live statistics overview">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-tight">Live Overview</h2>
        <motion.div
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="h-1.5 w-1.5 rounded-full bg-emerald-500"
          aria-label="Live indicator"
        />
        <span className="text-[10px] text-muted-foreground ml-auto hidden sm:inline">
          Auto-updates every 5s
        </span>
      </div>

      {/* Scrollable card row */}
      <div
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none lg:overflow-x-visible lg:snap-none"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {stats.map((stat, index) => (
          <StatCard
            key={stat.id}
            stat={stat}
            index={index}
            lastUpdated={lastUpdated}
          />
        ))}
      </div>

      {/* Mobile scroll hint dots */}
      <div className="flex items-center justify-center gap-1.5 mt-2 lg:hidden">
        {stats.map((stat, i) => (
          <div
            key={stat.id}
            className={cn(
              'h-1 rounded-full transition-all duration-300',
              i === 0 ? 'w-4 bg-primary/60' : 'w-1 bg-muted-foreground/30',
            )}
          />
        ))}
      </div>
    </section>
  );
}
