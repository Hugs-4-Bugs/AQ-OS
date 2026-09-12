'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Plus,
  ArrowUpRight,
  Building2,
  RefreshCw,
  FileEdit,
  Rocket,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

/* ===== Types ===== */
interface KPI {
  label: string;
  value: number;
  trend: string;
  up: boolean;
  icon: React.ElementType;
  color: string;
  bg: string;
}

interface GrowthPoint {
  month: string;
  newAccounts: number;
  expanded: number;
}

interface TopAccount {
  name: string;
  industry: string;
  original: number;
  current: number;
  growth: number;
  spark: number[];
  type: string;
}

interface HealthSegment {
  name: string;
  value: number;
  color: string;
}

interface PipelineItem {
  name: string;
  value: number;
  probability: number;
  closeDate: string;
  stage: number;
}

interface AccountGrowthData {
  kpis: KPI[];
  growthTrend: GrowthPoint[];
  topAccounts: TopAccount[];
  healthDistribution: HealthSegment[];
  expansionPipeline: PipelineItem[];
}

const TIME_RANGES = ['30d', '90d', '1y'] as const;
type TimeRange = (typeof TIME_RANGES)[number];

/* ===== KPI Mini Card ===== */
function KpiMiniCard({ kpi }: { kpi: KPI }) {
  const Icon = kpi.icon;
  return (
    <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20 hover:border-white/20 transition-all duration-300">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={cn('rounded-lg p-2', kpi.bg)}>
            <Icon className={cn('h-4 w-4', kpi.color)} />
          </div>
          <div className="flex items-center gap-0.5 text-xs font-bold text-emerald-500">
            <ArrowUpRight className="h-3 w-3" />
            {kpi.trend}
          </div>
        </div>
        <p className="text-2xl font-extrabold tracking-tight tabular-nums">{kpi.value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
      </CardContent>
    </Card>
  );
}

/* ===== Growth Sparkline Mini ===== */
function GrowthSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 56;
  const h = 20;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  const fillPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg width={w} height={h} className="shrink-0" viewBox={`0 0 ${w} ${h}`}>
      <polygon points={fillPoints} fill={color} fillOpacity={0.15} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ===== Expansion Type Badge ===== */
function ExpansionBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    Upsell: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
    'Cross-sell': 'bg-sky-500/15 text-sky-500 border-sky-500/25',
    Upgrade: 'bg-violet-500/15 text-violet-500 border-violet-500/25',
  };
  return (
    <Badge variant="outline" className={cn('text-[9px] h-5 px-1.5 border font-medium', colors[type] ?? 'bg-muted text-muted-foreground border-border')}>
      {type}
    </Badge>
  );
}

/* ===== Account Health Donut ===== */
function AccountHealthDonut({ healthDistribution }: { healthDistribution: HealthSegment[] }) {
  const total = healthDistribution.reduce((s, d) => s + d.value, 0);

  if (healthDistribution.length === 0) {
    return (
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-sky-500" />
            Account Health Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Building2 className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No health data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4 text-sky-500" />
          Account Health Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative flex items-center justify-center">
          <div className="h-48 w-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={healthDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={78}
                  dataKey="value"
                  strokeWidth={2}
                  stroke="transparent"
                >
                  {healthDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-extrabold tabular-nums">{total}</p>
            <p className="text-[10px] text-muted-foreground">Total Accounts</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {healthDistribution.map((seg) => (
            <div key={seg.name} className="flex items-center gap-2 text-xs">
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-muted-foreground">{seg.name}</span>
              <span className="font-bold ml-auto tabular-nums">{seg.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Loading Skeleton ===== */
function TrackerSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div>
          <Skeleton className="h-5 w-36 mb-1" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/* ===== KPI Icon Map ===== */
const KPI_ICONS: Record<string, React.ElementType> = {
  Plus,
  TrendingUp,
  FileEdit,
  Rocket,
};

/* ===== Main Component ===== */
export default function AccountGrowthTracker() {
  const [data, setData] = useState<AccountGrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('1y');

  useEffect(() => {
    fetch('/api/dashboard/account-growth')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stageColor = (stage: number) =>
    stage >= 75 ? '[&>div]:bg-emerald-500' : stage >= 40 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-400';

  if (loading) return <TrackerSkeleton />;

  const KPIS: KPI[] = (data?.kpis ?? []).map(kpi => ({
    ...kpi,
    icon: typeof kpi.icon === 'string'
      ? (KPI_ICONS[kpi.icon as string] ?? Plus)
      : (kpi.icon ?? Plus),
  }));

  const GROWTH_TREND = data?.growthTrend ?? [];
  const TOP_ACCOUNTS = data?.topAccounts ?? [];
  const HEALTH_DISTRIBUTION = data?.healthDistribution ?? [];
  const EXPANSION_PIPELINE = data?.expansionPipeline ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-2 bg-emerald-500/10">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Account Growth</h2>
            <p className="text-xs text-muted-foreground">Track account expansion over time</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm p-0.5">
            {TIME_RANGES.map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
                  timeRange === range
                    ? 'bg-emerald-500/20 text-emerald-500 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {range}
              </button>
            ))}
          </div>
          <Button size="sm" className="h-9 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add Account
          </Button>
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {KPIS.map((kpi) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <KpiMiniCard kpi={kpi} />
          </motion.div>
        ))}
      </div>

      {/* Growth Trend Chart + Health Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Growth Trend
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">New accounts vs expansions (monthly)</p>
          </CardHeader>
          <CardContent>
            {GROWTH_TREND.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-muted-foreground">
                <TrendingUp className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">No growth trend data available</p>
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={GROWTH_TREND} margin={{ left: -10, right: 10 }}>
                    <defs>
                      <linearGradient id="newAccGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="expandedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <RTooltip
                      contentStyle={{
                        backgroundColor: 'hsl(240 10% 3.9%)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'hsl(0 0% 98%)',
                      }}
                    />
                    <Area type="monotone" dataKey="newAccounts" stroke="#10b981" fill="url(#newAccGrad)" strokeWidth={2} name="New Accounts" />
                    <Area type="monotone" dataKey="expanded" stroke="#3b82f6" fill="url(#expandedGrad)" strokeWidth={2} name="Expanded" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                New Accounts
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-sky-500" />
                Expanded
              </div>
            </div>
          </CardContent>
        </Card>
        <AccountHealthDonut healthDistribution={HEALTH_DISTRIBUTION} />
      </div>

      {/* Top Growing Accounts */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Rocket className="h-4 w-4 text-amber-500" />
            Top Growing Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {TOP_ACCOUNTS.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Rocket className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">No account growth data available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {TOP_ACCOUNTS.map((account, i) => (
                <motion.div
                  key={account.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.06 }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-sky-500/20 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                      #{i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-emerald-500 transition-colors">{account.name}</p>
                      <p className="text-[10px] text-muted-foreground">{account.industry}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 mr-2">
                    <p className="text-xs font-medium tabular-nums">
                      <span className="text-muted-foreground">${(account.original / 1000).toFixed(0)}k</span>
                      <span className="mx-1 text-muted-foreground/50">→</span>
                      <span className="font-bold">${(account.current / 1000).toFixed(0)}k</span>
                    </p>
                  </div>
                  <GrowthSparkline data={account.spark} color="#10b981" />
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-bold text-emerald-500 border-emerald-500/25">
                      +{account.growth}%
                    </Badge>
                    <ExpansionBadge type={account.type} />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expansion Pipeline */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-violet-500" />
            Expansion Pipeline
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Pending expansion opportunities</p>
        </CardHeader>
        <CardContent>
          {EXPANSION_PIPELINE.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">No expansion pipeline data available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {EXPANSION_PIPELINE.map((item, i) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  className="space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <Badge variant="outline" className="text-[9px] h-4 px-1 border-border/50 font-mono shrink-0">
                        {item.probability}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold tabular-nums">${(item.value / 1000).toFixed(0)}k</span>
                      <span className="text-[10px] text-muted-foreground">{item.closeDate}</span>
                    </div>
                  </div>
                  <Progress value={item.stage} className={cn('h-1.5', stageColor(item.stage))} />
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
