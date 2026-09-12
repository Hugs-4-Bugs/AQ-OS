'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS v3.8.0 — Revenue Forecast Chart
// 6-month revenue forecast with confidence intervals & summary KPIs
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  DollarSign,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
interface ForecastDataPoint {
  month: string;
  projected: number;
  actual: number | null;
  upperBound: number;
  lowerBound: number;
  target: number;
}

/* ===== Mock Data removed — fetched from API ===== */

/* ===== Custom Tooltip ===== */
function ForecastTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-popover/95 backdrop-blur-sm p-3 shadow-xl text-xs space-y-1.5">
      <p className="font-semibold text-foreground">{label} Forecast</p>
      {payload.map((entry) => {
        const labelMap: Record<string, string> = {
          actual: 'Actual Revenue',
          projected: 'Projected Revenue',
          upperBound: 'Upper Bound',
          lowerBound: 'Lower Bound',
          target: 'Monthly Target',
        };
        if (entry.dataKey === 'confidence' || entry.dataKey === 'targetArea') return null;
        return (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{labelMap[entry.dataKey] ?? entry.dataKey}</span>
            <span className="font-medium tabular-nums text-foreground">
              ${entry.value.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ===== Summary Stat Cards ===== */
function SummaryCard({
  icon: Icon,
  label,
  value,
  subtext,
  trend,
  trendUp,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtext: string;
  trend: string;
  trendUp: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, type: 'spring', stiffness: 300, damping: 24 }}
      className="rounded-xl border border-border/40 bg-background/60 backdrop-blur-sm p-3 group hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="rounded-md p-1.5 bg-gradient-to-br from-emerald-500 to-teal-500">
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums tracking-tight">{value}</p>
      <div className="flex items-center gap-1 mt-1">
        <span className={cn(
          'text-[10px] font-semibold flex items-center gap-0.5',
          trendUp ? 'text-emerald-500' : 'text-red-500'
        )}>
          {trendUp ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
          {trend}
        </span>
        <span className="text-[10px] text-muted-foreground">{subtext}</span>
      </div>
    </motion.div>
  );
}

/* ===== Loading Skeleton ===== */
function RevenueForecastSkeleton() {
  return (
    <Card className="card-glow glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[240px] w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

/* ===== Empty State ===== */
function EmptyState() {
  return (
    <Card className="card-glow glass-card overflow-hidden">
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <TrendingUp className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">No forecast data available</p>
        <p className="text-xs mt-1">Revenue projections will appear here once deals are tracked.</p>
      </CardContent>
    </Card>
  );
}

/* ===== Main Component ===== */
export default function RevenueForecastChart() {
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<ForecastDataPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/dashboard/revenue-forecast')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((res) => {
        if (res.data && Array.isArray(res.data)) setForecastData(res.data);
        else setForecastData([]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const data = useMemo(() => forecastData ?? [], [forecastData]);

  const summaryStats = useMemo(() => {
    const totalForecast = data.reduce((s, d) => s + d.projected, 0);
    const actuals = data.filter((d) => d.actual !== null);
    const lastActual = actuals[actuals.length - 1];
    const prevActual = actuals[actuals.length - 2];
    const growthRate = prevActual && lastActual
      ? (((lastActual.actual! - prevActual.actual!) / prevActual.actual!) * 100).toFixed(1)
      : '8.4';
    const bestMonth = data.reduce((best, d) => (d.actual ?? d.projected) > (best.actual ?? best.projected) ? d : best, data[0]);
    return {
      totalForecast: `$${(totalForecast / 1000).toFixed(0)}K`,
      growthRate: `${growthRate}%`,
      bestMonth: bestMonth.month,
    };
  }, [data]);

  if (loading) return <RevenueForecastSkeleton />;
  if (error) return <div className="p-6 text-destructive">Error: {error}</div>;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Card className="card-glow glass-card overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm relative group">
        <div className="absolute inset-0 rounded-xl border border-primary/10 group-hover:border-primary/20 transition-colors duration-500 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

        <CardHeader className="pb-3 relative">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-1.5 bg-emerald-500/10">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
                Revenue Forecast
              </CardTitle>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>Next 6 months projection</span>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-1">
                  <Info className="h-2.5 w-2.5" />
                  90% CI
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Actual</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-sky-500" />
                <span className="text-muted-foreground">Projected</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-6 rounded-sm bg-emerald-500/10 border border-dashed border-emerald-500/30" />
                <span className="text-muted-foreground">Target</span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <SummaryCard
              icon={DollarSign}
              label="Total Forecast"
              value={summaryStats.totalForecast}
              subtext="6-month total"
              trend="+12.3%"
              trendUp={true}
              delay={0.15}
            />
            <SummaryCard
              icon={TrendingUp}
              label="Growth Rate"
              value={summaryStats.growthRate}
              subtext="MoM avg."
              trend="+2.1%"
              trendUp={true}
              delay={0.2}
            />
            <SummaryCard
              icon={Calendar}
              label="Best Month"
              value={summaryStats.bestMonth}
              subtext="projected peak"
              trend="Q2"
              trendUp={true}
              delay={0.25}
            />
          </div>

          {/* Chart */}
          <div className="h-[220px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
                onMouseMove={(e) => {
                  if (e?.activePayload?.[0]) {
                    setHoveredMonth(e.activePayload[0].payload.month);
                  }
                }}
                onMouseLeave={() => setHoveredMonth(null)}
              >
                <defs>
                  <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="projectedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />

                {/* Confidence interval area */}
                <Area
                  type="monotone"
                  dataKey="upperBound"
                  stroke="none"
                  fill="url(#confidenceGradient)"
                  fillOpacity={1}
                  isAnimationActive={true}
                  animationDuration={800}
                />
                {/* Target reference line */}
                <ReferenceLine
                  stroke="#10b981"
                  strokeDasharray="6 4"
                  strokeWidth={1}
                  strokeOpacity={0.4}
                  dataKey="target"
                />

                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'oklch(0.55 0 0)' }}
                  axisLine={false}
                  tickLine={false}
                  dy={8}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'oklch(0.55 0 0)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                  dx={-4}
                />
                <Tooltip content={<ForecastTooltip />} />

                {/* Lower bound for confidence shading */}
                <Line
                  type="monotone"
                  dataKey="lowerBound"
                  stroke="none"
                  dot={false}
                />

                {/* Projected line */}
                <Line
                  type="monotone"
                  dataKey="projected"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  strokeDasharray={hoveredMonth ? '0' : '5 5'}
                  dot={(props: Record<string, unknown>) => {
                    const cx = props.cx as number;
                    const cy = props.cy as number;
                    const payload = props.payload as ForecastDataPoint;
                    if (!payload) return <g key="none" />;
                    if (payload.actual !== null) return <g key="none" />;
                    return (
                      <g key={`dot-${payload.month}`}>
                        <circle cx={cx} cy={cy} r={3} fill="#0ea5e9" stroke="white" strokeWidth={1.5} opacity={0.8} />
                      </g>
                    );
                  }}
                  activeDot={{ r: 5, fill: '#0ea5e9', stroke: 'white', strokeWidth: 2 }}
                  animationDuration={1000}
                />

                {/* Actual line */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={(props: Record<string, unknown>) => {
                    const cx = props.cx as number;
                    const cy = props.cy as number;
                    const payload = props.payload as ForecastDataPoint;
                    if (!payload || payload.actual === null) return <g key="none" />;
                    return (
                      <g key={`actual-dot-${payload.month}`}>
                        <circle cx={cx} cy={cy} r={4} fill="#10b981" stroke="white" strokeWidth={2} />
                      </g>
                    );
                  }}
                  connectNulls={false}
                  activeDot={{ r: 5, fill: '#10b981', stroke: 'white', strokeWidth: 2 }}
                  animationDuration={1000}
                  animationBegin={200}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
