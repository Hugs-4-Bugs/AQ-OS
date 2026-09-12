'use client';

import { useState, useEffect } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  Gauge, TrendingUp, Timer, AlertTriangle, Clock, Target,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

/* ===== Types ===== */
type Period = 'this-month' | 'last-3-months' | 'this-year';

interface FunnelStage {
  name: string;
  count: number;
  color: string;
}

interface StageDuration {
  name: string;
  days: number;
  benchmark: number;
  color: string;
}

interface VelocityTrend {
  month: string;
  score: number;
}

interface BottleneckAlert {
  stage: string;
  days: number;
  multiplier: number;
  suggestion: string;
}

interface FunnelData {
  stages: FunnelStage[];
  stageDurations: StageDuration[];
  velocityScore: number;
  conversionRate: number;
  avgStageTime: number;
  bottleneck: BottleneckAlert | null;
  trend: VelocityTrend[];
}

/* ===== Period Toggle ===== */
const PERIODS: { label: string; value: Period }[] = [
  { label: 'This Month', value: 'this-month' },
  { label: 'Last 3 Months', value: 'last-3-months' },
  { label: 'This Year', value: 'this-year' },
];

/* ===== Shared Stage Durations ===== */
const SHARED_DURATIONS: StageDuration[] = [
  { name: 'Leads → Qualified', days: 3.2, benchmark: 4.0, color: '#10b981' },
  { name: 'Qualified → Proposal', days: 5.1, benchmark: 5.0, color: '#f59e0b' },
  { name: 'Proposal → Negotiation', days: 12.3, benchmark: 3.8, color: '#ef4444' },
  { name: 'Negotiation → Won', days: 6.4, benchmark: 5.0, color: '#f59e0b' },
];

const SHARED_BOTTLENECK: BottleneckAlert = {
  stage: 'Proposal → Negotiation',
  days: 12.3,
  multiplier: 3.2,
  suggestion:
    'Consider automating proposal follow-ups and adding a decision-maker outreach step to accelerate this stage.',
};

const SHARED_TREND: VelocityTrend[] = [
  { month: 'Dec', score: 45 },
  { month: 'Jan', score: 51 },
  { month: 'Feb', score: 48 },
  { month: 'Mar', score: 55 },
  { month: 'Apr', score: 58 },
  { month: 'May', score: 62 },
];

/* ===== Funnel Data per Period ===== */
const MOCK: Record<Period, FunnelData> = {
  'this-month': {
    stages: [
      { name: 'Leads', count: 342, color: '#06b6d4' },
      { name: 'Qualified', count: 186, color: '#3b82f6' },
      { name: 'Proposal', count: 94, color: '#a855f7' },
      { name: 'Negotiation', count: 47, color: '#f97316' },
      { name: 'Won', count: 21, color: '#10b981' },
    ],
    stageDurations: SHARED_DURATIONS,
    velocityScore: 62,
    conversionRate: 6.1,
    avgStageTime: 6.75,
    bottleneck: SHARED_BOTTLENECK,
    trend: SHARED_TREND,
  },
  'last-3-months': {
    stages: [
      { name: 'Leads', count: 1024, color: '#06b6d4' },
      { name: 'Qualified', count: 548, color: '#3b82f6' },
      { name: 'Proposal', count: 287, color: '#a855f7' },
      { name: 'Negotiation', count: 134, color: '#f97316' },
      { name: 'Won', count: 58, color: '#10b981' },
    ],
    stageDurations: SHARED_DURATIONS.map((d, i) => ({
      ...d,
      days: Math.round((d.days + Math.sin(i * 0.5) * d.days * 0.02) * 10) / 10,
    })),
    velocityScore: 57,
    conversionRate: 5.7,
    avgStageTime: 6.95,
    bottleneck: { ...SHARED_BOTTLENECK, days: 11.6, multiplier: 3.1 },
    trend: SHARED_TREND,
  },
  'this-year': {
    stages: [
      { name: 'Leads', count: 3847, color: '#06b6d4' },
      { name: 'Qualified', count: 2091, color: '#3b82f6' },
      { name: 'Proposal', count: 1089, color: '#a855f7' },
      { name: 'Negotiation', count: 502, color: '#f97316' },
      { name: 'Won', count: 218, color: '#10b981' },
    ],
    stageDurations: SHARED_DURATIONS,
    velocityScore: 59,
    conversionRate: 5.7,
    avgStageTime: 6.88,
    bottleneck: { ...SHARED_BOTTLENECK, days: 11.9 },
    trend: [
      { month: 'Dec', score: 42 },
      { month: 'Jan', score: 48 },
      { month: 'Feb', score: 51 },
      { month: 'Mar', score: 55 },
      { month: 'Apr', score: 58 },
      { month: 'May', score: 62 },
    ],
  },
};

/* ===== Animation Variants ===== */
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

const itemVariant: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/* ===== SVG Funnel Visualization ===== */
function FunnelSVG({ stages }: { stages: FunnelStage[] }) {
  const maxCount = Math.max(...stages.map(s => s.count), 1);
  const H = 150;
  const W = 560;
  const SH = H / stages.length;
  const maxW = W - 40;
  const minW = 80;
  const cx = W / 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      {stages.map((stage, i) => {
        const w = minW + (maxW - minW) * (stage.count / maxCount);
        const y = i * SH;
        const nw =
          i < stages.length - 1
            ? minW + (maxW - minW) * (stages[i + 1].count / maxCount)
            : w;
        const drop =
          i < stages.length - 1
            ? Math.round((1 - stages[i + 1].count / stage.count) * 100)
            : 0;

        return (
          <g key={stage.name}>
            <motion.path
              d={`
                M ${cx - w / 2} ${y + 2}
                L ${cx + w / 2} ${y + 2}
                L ${cx + nw / 2} ${y + SH - 2}
                L ${cx - nw / 2} ${y + SH - 2}
                Z
              `}
              fill={stage.color}
              opacity={0.8}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              transition={{ delay: i * 0.12, duration: 0.4 }}
            />
            <motion.text
              x={cx}
              y={y + SH / 2 + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-white text-[11px] font-semibold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.12 + 0.1 }}
            >
              {stage.name} · {stage.count.toLocaleString()}
            </motion.text>
            {drop > 0 && (
              <motion.text
                x={cx + w / 2 + 8}
                y={y + SH - 6}
                className="fill-muted-foreground text-[9px]"
                dominantBaseline="middle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.12 + 0.2 }}
              >
                ↓ {drop}%
              </motion.text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ===== Velocity Gauge ===== */
function VelocityGauge({ score }: { score: number }) {
  const circ = 2 * Math.PI * 36;
  const offset = circ - (score / 100) * circ;
  const col = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const textCol =
    score >= 70 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative h-24 w-24">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="currentColor"
            className="text-muted/30"
            strokeWidth="6"
          />
          <motion.circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke={col}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-xl font-bold tabular-nums', textCol)}>
            {score}
          </span>
          <span className="text-[9px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground mt-1">
        Velocity Score
      </span>
    </div>
  );
}

/* ===== Loading Skeleton ===== */
function LoadingSkeleton() {
  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-md" />
            ))}
          </div>
        </div>
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </Card>
  );
}

/* ===== Main Component ===== */
export default function FunnelVelocityTracker() {
  const [period, setPeriod] = useState<Period>('this-month');
  const [data, setData] = useState<FunnelData | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const timer = setTimeout(() => {
      setData(MOCK[period]);
      setReady(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [period]);

  if (!ready || !data) return <LoadingSkeleton />;

  const maxDur = Math.max(...data.stageDurations.map(d => d.days), 1);

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="show">
      <Card className="rounded-2xl overflow-hidden card-glow glass-card">
        {/* Header */}
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg p-2 bg-cyan-500/10">
                <Gauge className="h-4 w-4 text-cyan-500" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">
                  Funnel Velocity
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lead-to-deal conversion tracking
                </p>
              </div>
            </div>
            <div className="flex gap-1.5">
              {PERIODS.map(p => (
                <Button
                  key={p.value}
                  variant={period === p.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPeriod(p.value)}
                  className="text-[11px] h-7 px-2.5"
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Visual Funnel */}
          <motion.div variants={itemVariant} initial="hidden" animate="show">
            <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
              <FunnelSVG stages={data.stages} />
              <div className="flex justify-center gap-4 mt-2">
                {data.stages.map(s => (
                  <div
                    key={s.name}
                    className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Velocity Metrics Row */}
          <motion.div
            variants={itemVariant}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
          >
            {/* Avg Time in Stage */}
            <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold">Avg Time in Stage</span>
              </div>
              <p className="text-xl font-bold tabular-nums">
                {data.avgStageTime}d
              </p>
              <p className="text-[10px] text-muted-foreground">
                days average per stage
              </p>
            </div>

            {/* Conversion Rate */}
            <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">Conversion Rate</span>
              </div>
              <p className="text-xl font-bold tabular-nums">
                {data.conversionRate}%
              </p>
              <p className="text-[10px] text-muted-foreground">
                leads → won overall
              </p>
            </div>

            {/* Velocity Score */}
            <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
              <VelocityGauge score={data.velocityScore} />
            </div>
          </motion.div>

          {/* Stage Duration Breakdown */}
          <motion.div variants={itemVariant} initial="hidden" animate="show">
            <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
              <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-purple-500" />
                Stage Duration Breakdown
              </p>
              <div className="space-y-3">
                {data.stageDurations.map(stage => (
                  <div key={stage.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {stage.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{ color: stage.color }}
                        >
                          {stage.days}d
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          (benchmark: {stage.benchmark}d)
                        </span>
                      </div>
                    </div>
                    <div className="relative h-3 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="absolute top-0 bottom-0 w-px bg-foreground/20 z-10"
                        style={{
                          left: `${(stage.benchmark / maxDur) * 100}%`,
                        }}
                      />
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: stage.color }}
                        initial={{ width: 0 }}
                        animate={{
                          width: `${(stage.days / maxDur) * 100}%`,
                        }}
                        transition={{
                          duration: 0.7,
                          ease: 'easeOut',
                          delay: 0.2,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 pt-2 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Under benchmark</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <span>Near benchmark</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <span>Over benchmark</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Bottleneck Alert */}
          {data.bottleneck && (
            <motion.div variants={itemVariant} initial="hidden" animate="show">
              <div className="rounded-xl p-4 bg-amber-500/8 border border-amber-500/20">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg p-2 bg-amber-500/15 shrink-0 mt-0.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                      Bottleneck: {data.bottleneck.stage}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Takes {data.bottleneck.days} days on average (
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {data.bottleneck.multiplier}x
                      </span>{' '}
                      industry avg)
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      💡 {data.bottleneck.suggestion}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Historical Trend */}
          <motion.div variants={itemVariant} initial="hidden" animate="show">
            <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
              <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                Velocity Trend (6 Months)
              </p>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.trend}
                    margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fontSize: 10,
                        fill: 'oklch(0.5 0.02 280)',
                      }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fontSize: 10,
                        fill: 'oklch(0.5 0.02 280)',
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'oklch(0.99 0.004 280)',
                        border: '1px solid oklch(0.91 0.01 280)',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }}
                      activeDot={{
                        r: 5,
                        stroke: '#10b981',
                        strokeWidth: 2,
                        fill: 'white',
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
