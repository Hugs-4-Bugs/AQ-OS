'use client';

import { useEffect, useRef, useState } from 'react';
import { Flame, Snowflake, Sun, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

type GaugeSize = 'sm' | 'md' | 'lg';
type ScoreTier = 'cold' | 'warm' | 'hot' | 'premium';

interface LeadScoreGaugeProps {
  score: number;
  label?: string;
  size?: GaugeSize;
  showLabel?: boolean;
  className?: string;
}

const SIZE_CONFIG: Record<GaugeSize, { diameter: number; strokeWidth: number; fontSize: string; labelSize: string; badgeSize: string }> = {
  sm: { diameter: 80, strokeWidth: 6, fontSize: 'text-lg', labelSize: 'text-[10px]', badgeSize: 'text-[9px]' },
  md: { diameter: 120, strokeWidth: 8, fontSize: 'text-2xl', labelSize: 'text-xs', badgeSize: 'text-[10px]' },
  lg: { diameter: 160, strokeWidth: 10, fontSize: 'text-4xl', labelSize: 'text-sm', badgeSize: 'text-xs' },
};

const TIER_CONFIG: Record<ScoreTier, {
  gradientFrom: string;
  gradientTo: string;
  glowColor: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
  icon: typeof Snowflake;
}> = {
  cold: {
    gradientFrom: '#ef4444',
    gradientTo: '#f97316',
    glowColor: 'rgba(239, 68, 68, 0.5)',
    badge: 'Cold',
    badgeBg: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400',
    badgeText: 'border-rose-200 dark:border-rose-800',
    icon: Snowflake,
  },
  warm: {
    gradientFrom: '#f59e0b',
    gradientTo: '#eab308',
    glowColor: 'rgba(245, 158, 11, 0.5)',
    badge: 'Warm',
    badgeBg: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    badgeText: 'border-amber-200 dark:border-amber-800',
    icon: Sun,
  },
  hot: {
    gradientFrom: '#22c55e',
    gradientTo: '#10b981',
    glowColor: 'rgba(34, 197, 94, 0.5)',
    badge: 'Hot',
    badgeBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
    badgeText: 'border-emerald-200 dark:border-emerald-800',
    icon: Flame,
  },
  premium: {
    gradientFrom: '#06b6d4',
    gradientTo: '#8b5cf6',
    glowColor: 'rgba(6, 182, 212, 0.5)',
    badge: 'Premium',
    badgeBg: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400',
    badgeText: 'border-cyan-200 dark:border-cyan-800',
    icon: Star,
  },
};

function getTier(score: number): ScoreTier {
  if (score <= 30) return 'cold';
  if (score <= 60) return 'warm';
  if (score <= 80) return 'hot';
  return 'premium';
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function LeadScoreGauge({
  score,
  label = 'Lead Score',
  size = 'md',
  showLabel = true,
  className,
}: LeadScoreGaugeProps) {
  const clampedScore = clampScore(score);
  const tier = getTier(clampedScore);
  const config = SIZE_CONFIG[size];
  const tierConfig = TIER_CONFIG[tier];
  const TierIcon = tierConfig.icon;

  const radius = (config.diameter - config.strokeWidth) / 2;
  const safeRadius = Math.max(0.01, radius);
  const safeCircumference = 2 * Math.PI * safeRadius;
  const offset = safeCircumference - (clampedScore / 100) * safeCircumference;

  const [displayScore, setDisplayScore] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    setIsAnimating(true);
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const duration = 1200;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(eased * clampedScore));

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [clampedScore]);

  const gradientId = `gauge-gradient-${size}-${clampedScore}`;

  return (
    <div
      className={cn(
        'group flex flex-col items-center gap-2 transition-transform duration-300 ease-out',
        'hover:scale-105',
        className,
      )}
    >
      {/* SVG Gauge */}
      <div
        className="relative"
        style={{
          width: config.diameter,
          height: config.diameter,
        }}
      >
        {/* Animated glow ring */}
        <div
          className="absolute inset-0 rounded-full opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-70"
          style={{
            background: `conic-gradient(${tierConfig.gradientFrom}, ${tierConfig.gradientTo}, ${tierConfig.gradientFrom})`,
            opacity: isAnimating ? 0.5 : 0,
          }}
        />

        <svg
          width={config.diameter}
          height={config.diameter}
          viewBox={`0 0 ${config.diameter} ${config.diameter}`}
          className="transform -rotate-90 drop-shadow-sm"
          role="img"
          aria-label={`${label}: ${clampedScore} out of 100`}
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor={tierConfig.gradientFrom} />
              <stop offset="100%" stopColor={tierConfig.gradientTo} />
            </linearGradient>
            {/* Glow filter */}
            <filter id={`glow-${size}`}>
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background track */}
          <circle
            cx={config.diameter / 2}
            cy={config.diameter / 2}
            r={safeRadius}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            className="text-muted/30"
          />

          {/* Foreground progress arc */}
          <circle
            cx={config.diameter / 2}
            cy={config.diameter / 2}
            r={safeRadius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={safeCircumference}
            strokeDashoffset={offset}
            filter={`url(#glow-${size})`}
            style={{
              transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>

        {/* Center content overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'font-bold tabular-nums tracking-tight leading-none',
              config.fontSize,
            )}
            style={{
              background: `linear-gradient(135deg, ${tierConfig.gradientFrom}, ${tierConfig.gradientTo})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {displayScore}
          </span>
          {showLabel && size !== 'sm' && (
            <span
              className={cn(
                'text-muted-foreground mt-0.5 font-medium leading-none',
                config.labelSize,
              )}
            >
              {label}
            </span>
          )}
        </div>
      </div>

      {/* Tier badge */}
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold transition-all duration-300',
          'group-hover:shadow-md',
          tierConfig.badgeBg,
          tierConfig.badgeText,
          config.badgeSize,
        )}
      >
        <TierIcon className="h-3 w-3" />
        <span>{tierConfig.badge}</span>
      </div>
    </div>
  );
}

export default LeadScoreGauge;
