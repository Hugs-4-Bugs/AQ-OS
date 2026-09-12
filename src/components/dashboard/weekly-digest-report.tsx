'use client';

import { useState, useEffect } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  CalendarDays,
  TrendingUp,
  Users,
  Trophy,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Phone,
  Mail,
  UsersRound,
  FileText,
  MessageCircle,
  Star,
  Target,
  ChevronLeft,
  ChevronRight,
  Zap,
  Clock,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
interface KPIMetric {
  label: string;
  value: number;
  change: number;
  icon: React.ElementType;
  format: 'number' | 'currency';
}

interface ActivityBreakdown {
  name: string;
  hours: number;
  color: string;
  icon: React.ElementType;
}

interface TopPerformer {
  name: string;
  initials: string;
  dealsClosed: number;
  revenue: number;
  badge: 'star' | 'rising' | 'consistent';
}

interface WeeklyHighlight {
  icon: React.ElementType;
  text: string;
  color: string;
}

interface WeeklyDigestData {
  weekRange: string;
  previousWeekRange: string;
  kpis: KPIMetric[];
  activityBreakdown: ActivityBreakdown[];
  topPerformers: TopPerformer[];
  highlights: WeeklyHighlight[];
  goalProgress: number;
  goalTarget: string;
  goalLabel: string;
}

/* ===== Data (fetched from API) ===== */

/* ===== Animation Variants ===== */
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariant: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/* ===== Format Helpers ===== */
function formatValue(value: number, format: 'number' | 'currency'): string {
  if (format === 'currency') {
    if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
    return `$${value.toLocaleString()}`;
  }
  return value.toLocaleString();
}

function getBadgeStyle(badge: 'star' | 'rising' | 'consistent') {
  switch (badge) {
    case 'star':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25';
    case 'rising':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25';
    case 'consistent':
      return 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/25';
  }
}

function getBadgeLabel(badge: 'star' | 'rising' | 'consistent') {
  switch (badge) {
    case 'star': return 'Top Performer';
    case 'rising': return 'Rising Star';
    case 'consistent': return 'Consistent';
  }
}

/* ===== Loading Skeleton ===== */
function LoadingSkeleton() {
  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </Card>
  );
}

/* ===== KPI Card ===== */
function KPICard({ metric, index }: { metric: KPIMetric; index: number }) {
  const Icon = metric.icon;
  const isPositive = metric.change >= 0;

  return (
    <motion.div variants={itemVariant} custom={index}>
      <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20 transition-all duration-200 hover:bg-white/8 hover:border-white/15">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg p-1.5 bg-primary/10">
              <Icon className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
          </div>
          <div className={cn(
            'flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
            isPositive
              ? 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400'
              : 'text-red-600 bg-red-500/10 dark:text-red-400'
          )}>
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(metric.change)}%
          </div>
        </div>
        <p className="text-xl font-bold tracking-tight tabular-nums">
          {formatValue(metric.value, metric.format)}
        </p>
      </div>
    </motion.div>
  );
}

/* ===== Main Component ===== */
export default function WeeklyDigestReport() {
  const [showPrevious, setShowPrevious] = useState(false);
  const [data, setData] = useState<WeeklyDigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/weekly-digest?week=${showPrevious ? 'previous' : 'current'}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((res) => {
        if (res.data) setData(res.data);
        else setError('No data returned');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [showPrevious]);

  if (loading || !data) return <LoadingSkeleton />;
  if (error) return <div className="p-6 text-destructive">Error: {error}</div>;

  const totalActivityHours = data.activityBreakdown.reduce((s, a) => s + a.hours, 0);

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="show"
    >
      <Card className="rounded-2xl overflow-hidden card-glow glass-card">
        {/* Header */}
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg p-2 bg-primary/10">
                <CalendarDays className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">Weekly Digest</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{data.weekRange}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPrevious(!showPrevious)}
              className="text-xs gap-1.5 shrink-0"
            >
              {showPrevious ? (
                <>
                  <ChevronRight className="h-3 w-3" />
                  Back to This Week
                </>
              ) : (
                <>
                  <ChevronLeft className="h-3 w-3" />
                  Previous Week
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* KPI Summary Row */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            {data.kpis.map((kpi, i) => (
              <KPICard key={kpi.label} metric={kpi} index={i} />
            ))}
          </motion.div>

          {/* Activity Breakdown */}
          <motion.div variants={itemVariant} initial="hidden" animate="show">
            <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
              <p className="text-sm font-semibold mb-3">Activity Breakdown</p>
              <div className="h-4 w-full flex overflow-hidden rounded-full">
                {data.activityBreakdown.map((activity) => (
                  <div
                    key={activity.name}
                    className="transition-all duration-500"
                    style={{
                      width: `${(activity.hours / totalActivityHours) * 100}%`,
                      backgroundColor: activity.color,
                    }}
                    title={`${activity.name}: ${activity.hours}h`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                {data.activityBreakdown.map((activity) => {
                  const Icon = activity.icon;
                  return (
                    <div key={activity.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="h-3 w-3" style={{ color: activity.color }} />
                      <span>{activity.name}</span>
                      <span className="font-medium text-foreground tabular-nums">{activity.hours}h</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* Top Performers */}
          <motion.div variants={itemVariant} initial="hidden" animate="show">
            <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
              <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                Top Performers
              </p>
              <div className="space-y-2.5">
                {data.topPerformers.map((performer, idx) => (
                  <div key={performer.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                    <span className="text-sm font-bold text-muted-foreground w-4 text-center">{idx + 1}</span>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                        {performer.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{performer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {performer.dealsClosed} deal{performer.dealsClosed !== 1 ? 's' : ''} · ${((performer.revenue) / 1000).toFixed(0)}K
                      </p>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] px-2 py-0 h-5 border', getBadgeStyle(performer.badge))}>
                      {getBadgeLabel(performer.badge)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Key Highlights */}
          <motion.div variants={itemVariant} initial="hidden" animate="show">
            <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
              <p className="text-sm font-semibold mb-3">Key Highlights</p>
              <div className="space-y-2">
                {data.highlights.map((highlight, idx) => {
                  const Icon = highlight.icon;
                  return (
                    <div key={idx} className="flex items-start gap-2.5 text-sm">
                      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', highlight.color)} />
                      <span className="text-muted-foreground">{highlight.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* Weekly Goal Progress */}
          <motion.div variants={itemVariant} initial="hidden" animate="show">
            <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">{data.goalLabel}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tabular-nums">{data.goalProgress}%</span>
                  <span className="text-xs text-muted-foreground">of {data.goalTarget}</span>
                </div>
              </div>
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full score-bar-gradient-high"
                  initial={{ width: 0 }}
                  animate={{ width: `${data.goalProgress}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {data.goalProgress >= 100
                  ? '🎉 Target achieved! Outstanding week.'
                  : data.goalProgress >= 75
                    ? `Almost there — $${Math.round(((100 - data.goalProgress) / 100) * 365)}K remaining.`
                    : `${data.goalProgress}% complete. Keep pushing!`}
              </p>
            </div>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
