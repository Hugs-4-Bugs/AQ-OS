'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  DollarSign,
  Handshake,
  Target,
  Clock,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/* ===== Types ===== */

interface StatItem {
  label: string;
  value: string | number;
  change?: number; // percentage change, positive = green, negative = red
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}

interface QuickStatsWidgetProps {
  stats: StatItem[];
  loading?: boolean;
  compact?: boolean;
  className?: string;
}

/* ===== Animated Count-Up Hook ===== */

function useCountUp(
  target: number,
  duration: number = 1200,
): number {
  const [display, setDisplay] = useState(0);
  const stateRef = useRef({ rafId: null as number | null, startTime: 0 });

  useEffect(() => {
    const state = stateRef.current;
    state.startTime = 0;

    const tick = (timestamp: number) => {
      if (state.startTime === 0) state.startTime = timestamp;
      const elapsed = timestamp - state.startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(eased * target);

      if (progress < 1) {
        state.rafId = requestAnimationFrame(tick);
      }
    };

    state.rafId = requestAnimationFrame(tick);
    return () => {
      if (state.rafId) cancelAnimationFrame(state.rafId);
    };
  }, [target, duration]);

  return display;
}

/* ===== Helpers ===== */

/** Determine if a negative change is "good" (e.g. avg response time dropping). */
function isPositiveChange(change: number | undefined, trend?: 'up' | 'down' | 'neutral'): boolean {
  if (trend === 'down') return change !== undefined && change < 0;
  if (trend === 'up') return change !== undefined && change > 0;
  return change !== undefined && change >= 0;
}

/** Format a numeric value for display based on string heuristics. */
function formatNumericValue(value: string | number): string {
  if (typeof value === 'string') return value;
  return value.toLocaleString();
}

/* ===== Skeleton Placeholder ===== */

function StatSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl p-3',
        'bg-muted/40 border border-border/30',
      )}
    >
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted/60" />
      <div className="flex flex-col gap-1.5 min-w-0">
        {!compact && <div className="h-3 w-16 animate-pulse rounded bg-muted/60" />}
        <div className={cn('h-5 w-20 animate-pulse rounded bg-muted/60', compact && 'h-4 w-14')} />
        {!compact && <div className="h-3 w-12 animate-pulse rounded bg-muted/60" />}
      </div>
    </div>
  );
}

/* ===== Single Stat Item ===== */

function StatItemCard({
  stat,
  index,
  compact,
}: {
  stat: StatItem;
  index: number;
  compact?: boolean;
}) {
  const Icon = stat.icon;
  const numericValue = typeof stat.value === 'number' ? stat.value : parseFloat(String(stat.value));
  const isNumeric = !isNaN(numericValue);
  const animatedValue = useCountUp(isNumeric ? numericValue : 0, 1000 + index * 200);

  const positive = isPositiveChange(stat.change, stat.trend);
  const hasChange = stat.change !== undefined;

  // Color for the icon background
  const iconBgColors: Record<number, string> = {
    0: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    1: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    2: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    3: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  };
  const iconColor = iconBgColors[index % 4];

  // Determine display value
  let displayValue: string;
  if (isNumeric) {
    // If the original value has a $ prefix, preserve it
    const strVal = String(stat.value);
    if (strVal.startsWith('$')) {
      const suffix = strVal.endsWith('K') || strVal.endsWith('M')
        ? strVal.slice(-1)
        : '';
      const rawNum = parseFloat(strVal.replace(/[$KM%]/g, ''));
      if (suffix) {
        displayValue = `$${Math.round(animatedValue).toLocaleString()}${suffix}`;
      } else {
        displayValue = `$${Math.round(animatedValue).toLocaleString()}`;
      }
    } else if (strVal.endsWith('%')) {
      displayValue = `${animatedValue.toFixed(1)}%`;
    } else if (strVal.endsWith('h')) {
      displayValue = `${animatedValue.toFixed(1)}h`;
    } else {
      displayValue = Math.round(animatedValue).toLocaleString();
    }
  } else {
    displayValue = String(stat.value);
  }

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
        'group relative flex items-center gap-3 rounded-xl p-3',
        'border border-border/40 bg-background/50 backdrop-blur-sm',
        'transition-all duration-300',
        'card-hover-reveal hover-glow-primary',
        'depth-shadow-sm',
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          'transition-transform duration-300 group-hover:scale-110',
          iconColor,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>

      {/* Label + Value + Change */}
      <div className="flex flex-col gap-0.5 min-w-0">
        {!compact && (
          <span className="text-xs font-medium text-muted-foreground leading-tight truncate">
            {stat.label}
          </span>
        )}

        <span
          className={cn(
            'font-bold tracking-tight tabular-nums leading-none',
            compact ? 'text-lg' : 'text-xl',
            'text-gradient-primary',
          )}
        >
          {displayValue}
        </span>

        {hasChange && !compact && (
          <div
            className={cn(
              'flex items-center gap-0.5 mt-0.5',
              positive ? 'text-emerald-500' : 'text-red-500',
            )}
          >
            {positive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span className="text-[11px] font-semibold tabular-nums">
              {Math.abs(stat.change!).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ===== Main Component ===== */

export default function QuickStatsWidget({
  stats,
  loading = false,
  compact = false,
  className,
}: QuickStatsWidgetProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn('animate-fade-in-up', className)}
      aria-label="Quick statistics overview"
    >
      <div
        className={cn(
          'grid grid-cols-2 lg:grid-cols-4 gap-3',
          'rounded-2xl p-3',
          'surface-elevated',
          'border border-border/30',
          'backdrop-blur-md',
        )}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <StatSkeleton key={i} compact={compact} />
            ))
          : stats.slice(0, 4).map((stat, index) => (
              <StatItemCard
                key={stat.label}
                stat={stat}
                index={index}
                compact={compact}
              />
            ))}
      </div>
    </motion.section>
  );
}

/* ===== Default Export with Mock Data ===== */

QuickStatsWidget.defaultProps = {
  stats: [
    {
      label: 'Total Revenue',
      value: '$284K',
      change: 12.2,
      icon: DollarSign,
      trend: 'up',
    },
    {
      label: 'Active Deals',
      value: 46,
      change: 9.1,
      icon: Handshake,
      trend: 'up',
    },
    {
      label: 'Conversion Rate',
      value: '24.2%',
      change: 3.2,
      icon: Target,
      trend: 'up',
    },
    {
      label: 'Avg Response',
      value: '2.4h',
      change: -16.4,
      icon: Clock,
      trend: 'down',
    },
  ],
  loading: false,
  compact: false,
};
