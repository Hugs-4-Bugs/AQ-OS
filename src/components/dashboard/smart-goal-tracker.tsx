'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  CalendarPlus,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────
type Period = 'monthly' | 'quarterly' | 'annual';

interface GoalData {
  id: string;
  name: string;
  icon: React.ElementType;
  current: number;
  target: number;
  unit: string;
  trend: number;
  color: string;
  ringColor: string;
  bgColor: string;
}

interface Milestone {
  id: string;
  label: string;
  date: string;
  status: 'completed' | 'active' | 'upcoming';
}

// ── Data (fetched from API) ─────────────────────────────────────

// ── Helpers ────────────────────────────────────────────────────────
function getPercentColor(pct: number): string {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
}

function formatValue(val: number, unit: string): string {
  if (unit) return `${val} ${unit}`;
  return val >= 1000 ? `$${(val / 1000).toFixed(0)}K` : `$${val}`;
}

// ── Progress Ring Component ────────────────────────────────────────
function ProgressRing({
  percentage,
  color,
  size = 80,
  strokeWidth = 6,
}: {
  percentage: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const [animatedPct, setAnimatedPct] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (animatedPct / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPct(percentage), 200);
    return () => clearTimeout(timer);
  }, [percentage]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: getPercentColor(percentage) }}
        >
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}

// ── Goal Card ──────────────────────────────────────────────────────
function GoalCard({ goal, index }: { goal: GoalData; index: number }) {
  const Icon = goal.icon;
  const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
  const trendUp = goal.trend >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12, duration: 0.4, type: 'spring', stiffness: 300, damping: 24 }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
    >
      <Card className="glass-card card-glow overflow-hidden h-full">
        <CardContent className="p-4 flex items-center gap-4">
          <ProgressRing percentage={pct} color={getPercentColor(pct)} size={76} strokeWidth={5} />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className={cn('rounded-lg p-1.5', goal.bgColor)}>
                <Icon className={cn('h-3.5 w-3.5', goal.color)} />
              </div>
              <p className="text-sm font-semibold truncate">{goal.name}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{formatValue(goal.current, goal.unit)}</span>
              {' / '}
              {formatValue(goal.target, goal.unit)}
            </p>
            <div
              className={cn(
                'flex items-center gap-0.5 text-[11px] font-medium',
                trendUp ? 'text-emerald-500' : 'text-red-400'
              )}
            >
              {trendUp ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>{trendUp ? '+' : ''}{goal.trend}% vs prev.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Milestone Timeline ─────────────────────────────────────────────
function MilestoneTimeline({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="relative">
      {/* Connecting line */}
      <div className="absolute top-3 left-4 right-4 h-px bg-border" />

      <div className="flex items-start justify-between gap-2">
        {milestones.map((ms, i) => {
          const isActive = ms.status === 'active';
          const isCompleted = ms.status === 'completed';

          return (
            <motion.div
              key={ms.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.3 }}
              className="relative flex flex-col items-center text-center flex-1 min-w-0"
            >
              {/* Dot */}
              <div className="relative z-10 mb-2">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                    isCompleted
                      ? 'bg-emerald-500 border-emerald-500'
                      : isActive
                        ? 'bg-primary border-primary animate-pulse-ring'
                        : 'bg-background border-muted-foreground/30'
                  )}
                >
                  {isCompleted && <CheckCircle2 className="h-3 w-3 text-white" />}
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                </div>
              </div>

              <p
                className={cn(
                  'text-[10px] sm:text-[11px] font-medium truncate w-full',
                  isCompleted ? 'text-emerald-600 dark:text-emerald-400' : isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {ms.label}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{ms.date}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-8 w-56" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function SmartGoalTracker() {
  const [period, setPeriod] = useState<Period>('monthly');
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // goals and milestones loaded via state (API integration pending)

  const overallPct = useMemo(() => {
    if (goals.length === 0) return 0;
    const total = goals.reduce((s, g) => s + Math.min(100, (g.current / g.target) * 100), 0);
    return Math.round(total / goals.length);
  }, [goals]);

  if (!mounted) return <LoadingSkeleton />;

  const periodTabs: { key: Period; label: string }[] = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'annual', label: 'Annual' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="glass-card card-glow overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="gradient-text">Acquisition Goals</span>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono ml-1">
                {overallPct}%
              </Badge>
            </CardTitle>

            {/* Period Tabs */}
            <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
              {periodTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setPeriod(tab.key)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-md transition-all duration-200',
                    period === tab.key
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Goal Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <AnimatePresence mode="wait">
              {goals.length === 0 ? (
                <div className="col-span-3 flex flex-col items-center justify-center py-8 text-center">
                  <Target className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">No acquisition goals set for this period. Click 'Set New Goal' to get started.</p>
                </div>
              ) : goals.map((goal, i) => (
                <GoalCard key={goal.id} goal={goal} index={i} />
              ))}
            </AnimatePresence>
          </div>

          {/* Milestone Timeline */}
          <div className="p-4 rounded-xl bg-muted/20 border border-border/40">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Milestones
              </span>
            </div>
            <MilestoneTimeline milestones={milestones} />
            {milestones.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-3">No milestones defined for this period.</p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 h-9 touch-target"
              onClick={() => {}}
            >
              <RefreshCw className="h-3 w-3" />
              Update Progress
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 h-9 touch-target"
              onClick={() => {}}
            >
              <CalendarPlus className="h-3 w-3" />
              Set New Goal
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
