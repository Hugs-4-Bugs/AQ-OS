'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  RefreshCw,
  Download,
  CalendarClock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  ArrowRight,
  Clock,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip as TooltipUI,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
type HealthStatus = 'Healthy' | 'Attention' | 'Critical';
type StageHealth = 'healthy' | 'slow' | 'stalled';

interface HealthScoreCard {
  id: string;
  label: string;
  score: number;
  subtitle: string;
  trend: 'up' | 'down' | 'flat';
  sparkline: number[];
}

interface PipelineStage {
  name: string;
  activeDeals: number;
  totalValue: number;
  avgDays: number;
  benchmark: number;
  health: StageHealth;
  lastActivity: string;
}

interface Bottleneck {
  id: string;
  stage: string;
  deals: number;
  avgDays: number;
  benchmark: number;
  severity: 'high' | 'medium';
  action: string;
}

interface PipelineWeek {
  week: string;
  value: number;
}

interface PipelineData {
  overallStatus: HealthStatus;
  healthCards: HealthScoreCard[];
  stages: PipelineStage[];
  bottlenecks: Bottleneck[];
  valueTrend: PipelineWeek[];
}

/* ===== Loading Skeleton ===== */
function PipelineHealthSkeleton() {
  return (
    <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20 rounded-2xl overflow-hidden h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-muted/50" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted/40" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 flex-1">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
        <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
        <div className="h-24 animate-pulse rounded-lg bg-muted/30" />
        <div className="h-[120px] animate-pulse rounded-lg bg-muted/30" />
      </CardContent>
    </Card>
  );
}

/* ===== Utility Functions ===== */
function getHealthScoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function getHealthScoreBg(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function getOverallStatusClasses(status: HealthStatus): string {
  switch (status) {
    case 'Healthy':
      return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25 border';
    case 'Attention':
      return 'bg-amber-500/15 text-amber-500 border-amber-500/25 border';
    case 'Critical':
      return 'bg-red-500/15 text-red-500 border-red-500/25 border';
  }
}

function getStageHealthDot(health: StageHealth): string {
  switch (health) {
    case 'healthy': return 'bg-emerald-500';
    case 'slow': return 'bg-amber-500';
    case 'stalled': return 'bg-red-500';
  }
}

function getStageHealthBg(health: StageHealth): string {
  switch (health) {
    case 'healthy': return 'bg-emerald-500/5 hover:bg-emerald-500/10';
    case 'slow': return 'bg-amber-500/5 hover:bg-amber-500/10';
    case 'stalled': return 'bg-red-500/5 hover:bg-red-500/10';
  }
}

/* ===== Mini Sparkline ===== */
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <div className="h-8 w-16">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ===== Health Score Card ===== */
function HealthScoreCardComponent({ card }: { card: HealthScoreCard }) {
  const TrendIcon = card.trend === 'up' ? TrendingUp : card.trend === 'down' ? TrendingDown : Activity;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-3 rounded-xl bg-muted/20 border border-border/30"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs font-semibold">{card.label}</p>
          <p className="text-[10px] text-muted-foreground">{card.subtitle}</p>
        </div>
        <TrendIcon className={cn(
          'h-3.5 w-3.5',
          card.trend === 'up' ? 'text-emerald-500' : card.trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
        )} />
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className={cn('text-xl font-extrabold tabular-nums', getHealthScoreColor(card.score))}>
            {card.score}
          </span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
        <MiniSparkline
          data={card.sparkline}
          color={card.score >= 70 ? '#10b981' : card.score >= 40 ? '#f59e0b' : '#ef4444'}
        />
      </div>
      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', getHealthScoreBg(card.score))}
          initial={{ width: 0 }}
          animate={{ width: `${card.score}%` }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />
      </div>
    </motion.div>
  );
}

/* ===== Stage Health Row ===== */
function StageHealthRow({ stage }: { stage: PipelineStage }) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer',
      getStageHealthBg(stage.health)
    )}>
      <div className={cn('h-2 w-2 rounded-full shrink-0', getStageHealthDot(stage.health))} />
      <span className="text-xs font-medium w-20 shrink-0">{stage.name}</span>
      <span className="text-xs tabular-nums font-semibold w-8 text-center">{stage.activeDeals}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums flex-1 truncate">
        ${(stage.totalValue / 1000000).toFixed(1)}M
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className={cn(
          'text-[11px] tabular-nums',
          stage.benchmark > 0 && stage.avgDays > stage.benchmark * 1.5 ? 'text-red-400 font-semibold' : 'text-muted-foreground'
        )}>
          {stage.avgDays}d
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground hidden sm:inline shrink-0 w-24 text-right">{stage.lastActivity}</span>
    </div>
  );
}

/* ===== Main Component ===== */
export default function PipelineHealthMonitor() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/dashboard/pipeline-health')
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
  }, []);

  if (loading) return <PipelineHealthSkeleton />;
  if (error) return <div className="p-6 text-destructive">Error: {error}</div>;
  if (!data) return <div className="p-6 text-muted-foreground">No data available yet.</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20 rounded-2xl overflow-hidden h-full flex flex-col">
        {/* Header */}
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
                <div className="rounded-lg p-1.5 bg-emerald-500/10">
                  <Activity className="h-4 w-4 text-emerald-500" />
                </div>
                Pipeline Health
              </CardTitle>
              <Badge className={cn('text-[10px] px-2 py-0.5 h-5 font-semibold', getOverallStatusClasses(data.overallStatus))}>
                <div className={cn(
                  'h-1.5 w-1.5 rounded-full mr-1',
                  data.overallStatus === 'Healthy' ? 'bg-emerald-500' : data.overallStatus === 'Attention' ? 'bg-amber-500' : 'bg-red-500'
                )} />
                {data.overallStatus}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 flex-1">
          {/* Health Score Cards Grid */}
          <div className="grid grid-cols-2 gap-3">
            {data.healthCards.map((card) => (
              <HealthScoreCardComponent key={card.id} card={card} />
            ))}
          </div>

          <Separator className="opacity-50" />

          {/* Stage Health Matrix */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stage Health Matrix</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /><span className="text-[9px] text-muted-foreground">Healthy</span></div>
                <div className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-amber-500" /><span className="text-[9px] text-muted-foreground">Slow</span></div>
                <div className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-red-500" /><span className="text-[9px] text-muted-foreground">Stalled</span></div>
              </div>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] text-muted-foreground font-medium">
              <div className="w-2" />
              <span className="w-20">Stage</span>
              <span className="w-8 text-center">Deals</span>
              <span className="flex-1">Value</span>
              <span className="shrink-0">Avg Days</span>
              <span className="w-24 text-right hidden sm:inline">Last Activity</span>
            </div>

            <div className="space-y-1">
              {data.stages.map((stage) => (
                <StageHealthRow key={stage.name} stage={stage} />
              ))}
            </div>
          </div>

          <Separator className="opacity-50" />

          {/* Bottleneck Detection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bottleneck Detection</span>
            </div>
            <div className="space-y-2">
              {data.bottlenecks.map((bottleneck, i) => (
                <motion.div
                  key={bottleneck.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className={cn(
                    'p-3 rounded-lg border',
                    bottleneck.severity === 'high'
                      ? 'bg-red-500/5 border-red-500/15'
                      : 'bg-amber-500/5 border-amber-500/15'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      'h-3.5 w-3.5 mt-0.5 shrink-0',
                      bottleneck.severity === 'high' ? 'text-red-400' : 'text-amber-400'
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold">{bottleneck.stage} stage</span>
                        <Badge className={cn(
                          'text-[9px] px-1.5 py-0 h-4',
                          bottleneck.severity === 'high'
                            ? 'bg-red-500/15 text-red-500 border border-red-500/25'
                            : 'bg-amber-500/15 text-amber-500 border border-amber-500/25'
                        )}>
                          {bottleneck.deals} deals, avg {bottleneck.avgDays}d ({Math.round(bottleneck.avgDays / bottleneck.benchmark)}x benchmark)
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{bottleneck.action}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <Separator className="opacity-50" />

          {/* Pipeline Value Trend */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pipeline Value Trend</span>
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.valueTrend} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pipeValueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.2} />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 9 }} className="fill-muted-foreground" tickFormatter={(v) => `$${(v / 1000000).toFixed(0)}M`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(0,0,0,0.85)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#fff',
                    }}
                    formatter={(value: number) => [`$${(value / 1000000).toFixed(1)}M`, 'Pipeline Value']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#pipeValueGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <Separator className="opacity-50" />

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5">
              <RefreshCw className="h-3 w-3" />
              Refresh Data
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5">
              <Download className="h-3 w-3" />
              Export Report
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5">
              <CalendarClock className="h-3 w-3" />
              Schedule Review
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
