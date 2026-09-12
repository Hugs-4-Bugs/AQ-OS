'use client';

import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Color palette for charts (NO blue/indigo)
const CHART_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899'];

// Tooltip styles
const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(var(--foreground))',
  padding: '8px 12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
};

/* ===== Shared Props ===== */
interface ChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  colors?: string[];
  height?: number;
  loading?: boolean;
}

/* ===== 1. AnalyticsLineChart — for trends over time ===== */
export function AnalyticsLineChart({
  data,
  xKey,
  yKeys,
  colors = CHART_COLORS,
  height = 280,
  loading,
}: ChartProps) {
  if (loading) {
    return <Skeleton className="w-full rounded-lg" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11 }}
          className="fill-muted-foreground"
        />
        <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '12px' }}
        />
        {yKeys.map((key, index) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
            stroke={colors[index % colors.length]}
            strokeWidth={2.5}
            dot={{ r: 4, fill: colors[index % colors.length] }}
            activeDot={{ r: 6, fill: colors[index % colors.length] }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ===== 2. AnalyticsAreaChart — for cumulative/volume trends ===== */
export function AnalyticsAreaChart({
  data,
  xKey,
  yKeys,
  colors = CHART_COLORS,
  height = 280,
  loading,
}: ChartProps) {
  if (loading) {
    return <Skeleton className="w-full rounded-lg" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
        <defs>
          {yKeys.map((key, index) => (
            <linearGradient key={key} id={`areaGrad-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors[index % colors.length]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors[index % colors.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11 }}
          className="fill-muted-foreground"
        />
        <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '12px' }}
        />
        {yKeys.map((key, index) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            name={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            fill={`url(#areaGrad-${key})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ===== 3. AnalyticsBarChart — for comparisons ===== */
export function AnalyticsBarChart({
  data,
  xKey,
  yKeys,
  colors = CHART_COLORS,
  height = 280,
  loading,
}: ChartProps) {
  if (loading) {
    return <Skeleton className="w-full rounded-lg" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11 }}
          className="fill-muted-foreground"
        />
        <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '12px' }}
        />
        {yKeys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            name={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
            fill={colors[index % colors.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ===== 4. AnalyticsPieChart — for distributions ===== */
interface PieChartProps extends ChartProps {
  nameKey: string;
}

export function AnalyticsPieChart({
  data,
  xKey,
  yKeys,
  nameKey,
  colors = CHART_COLORS,
  height = 280,
  loading,
}: PieChartProps) {
  if (loading) {
    return <Skeleton className="w-full rounded-lg" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data available
      </div>
    );
  }

  const valueKey = yKeys[0] || 'value';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={height * 0.2}
          outerRadius={height * 0.32}
          paddingAngle={3}
          dataKey={valueKey}
          nameKey={nameKey || xKey}
          strokeWidth={0}
        >
          {data.map((_entry, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
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
  );
}

/* ===== 5. AnalyticsFunnelChart — for pipeline/conversion funnels ===== */
interface FunnelChartProps {
  data: { name: string; value: number; fill?: string }[];
  loading?: boolean;
  height?: number;
}

export function AnalyticsFunnelChart({ data, loading, height = 280 }: FunnelChartProps) {
  if (loading) {
    return <Skeleton className="w-full rounded-lg" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-1.5" style={{ minHeight: height }}>
      {data.map((item, index) => {
        const widthPercent = Math.max((item.value / maxValue) * 100, 8);
        const fill = item.fill || CHART_COLORS[index % CHART_COLORS.length];
        const prevValue = index > 0 ? data[index - 1].value : 0;
        const conversionRate = prevValue > 0 ? Math.round((item.value / prevValue) * 100) : 100;
        const dropOff = prevValue > 0 ? Math.round(((prevValue - item.value) / prevValue) * 100) : 0;

        return (
          <React.Fragment key={item.name}>
            <div className="flex items-center gap-3">
              <div className="w-20 text-xs text-muted-foreground text-right shrink-0 truncate" title={item.name}>
                {item.name}
              </div>
              <div className="flex-1 relative h-8 bg-muted/50 rounded-md overflow-hidden">
                <div
                  className="h-full rounded-md flex items-center justify-end pr-2 relative overflow-hidden transition-all duration-700"
                  style={{ backgroundColor: fill, width: `${widthPercent}%`, minWidth: '2rem' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/10" />
                  <span className="text-xs font-bold text-white drop-shadow-sm relative z-10">
                    {item.value}
                  </span>
                </div>
              </div>
              <div className="w-16 text-xs text-muted-foreground shrink-0">
                {index > 0 && dropOff > 0 ? (
                  <span className={cn(
                    'font-medium',
                    dropOff < 20 ? 'text-emerald-500' : dropOff <= 50 ? 'text-amber-500' : 'text-red-500'
                  )}>
                    {conversionRate}% →
                  </span>
                ) : (
                  <span className="font-medium text-emerald-500">100%</span>
                )}
              </div>
            </div>
            {index < data.length - 1 && dropOff > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-20 shrink-0" />
                <div className="flex-1 pl-2 py-0.5">
                  <span className={cn(
                    'text-[10px] font-medium',
                    dropOff < 20 ? 'text-emerald-500' : dropOff <= 50 ? 'text-amber-500' : 'text-red-500'
                  )}>
                    {dropOff}% drop
                  </span>
                </div>
                <div className="w-16 shrink-0" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ===== 6. AnalyticsHeatmap — for niche/country matrix ===== */
interface HeatmapProps {
  data: { x: string; y: string; value: number }[];
  xLabels: string[];
  yLabels: string[];
  loading?: boolean;
  height?: number;
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

export function AnalyticsHeatmap({ data, xLabels, yLabels, loading, height }: HeatmapProps) {
  if (loading) {
    return <Skeleton className="w-full rounded-lg" style={{ height: height || 280 }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: height || 280 }}>
        No data available
      </div>
    );
  }

  // Build lookup map
  const cellMap = new Map<string, number>();
  for (const item of data) {
    cellMap.set(`${item.x}:${item.y}`, item.value);
  }

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <div className="min-w-fit">
        {/* Header row */}
        <div className="flex items-center gap-1 mb-1">
          <div className="w-24 shrink-0" />
          {xLabels.map((label) => (
            <div key={label} className="w-16 shrink-0 text-center">
              <span className="text-[10px] text-muted-foreground truncate block" title={label}>{label}</span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {yLabels.map((yLabel) => (
          <div key={yLabel} className="flex items-center gap-1 mb-1">
            <div className="w-24 shrink-0 text-right pr-2">
              <span className="text-[10px] text-muted-foreground truncate block" title={yLabel}>{yLabel}</span>
            </div>
            {xLabels.map((xLabel) => {
              const value = cellMap.get(`${xLabel}:${yLabel}`);
              if (value === undefined) {
                return <div key={`${xLabel}-${yLabel}`} className="w-16 h-8 shrink-0 rounded-md bg-muted/20" />;
              }
              return (
                <div
                  key={`${xLabel}-${yLabel}`}
                  className={cn(
                    'w-16 h-8 shrink-0 rounded-md flex items-center justify-center cursor-default transition-all hover:scale-105 hover:shadow-md',
                    getHeatmapBg(value)
                  )}
                  title={`${yLabel} × ${xLabel}: ${value}`}
                >
                  <span className={cn('text-[10px] font-bold', getHeatmapTextColor(value))}>
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        {/* Legend */}
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

/* ===== 7. AnalyticsTimeline — for event timelines ===== */
interface TimelineProps {
  events: { date: string; title: string; description: string; type: string }[];
  loading?: boolean;
  height?: number;
}

const TYPE_COLORS: Record<string, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-cyan-500',
  ai: 'bg-violet-500',
  workflow: 'bg-orange-500',
};

export function AnalyticsTimeline({ events, loading, height }: TimelineProps) {
  if (loading) {
    return <Skeleton className="w-full rounded-lg" style={{ height: height || 280 }} />;
  }

  if (!events || events.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: height || 280 }}>
        No events to display
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2" style={height ? { maxHeight: height } : undefined}>
      {events.map((event, index) => (
        <div key={`${event.date}-${index}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-3 h-3 rounded-full shrink-0 mt-1',
              TYPE_COLORS[event.type] || 'bg-muted-foreground'
            )} />
            {index < events.length - 1 && (
              <div className="w-px flex-1 bg-border mt-1" />
            )}
          </div>
          <div className="flex-1 min-w-0 pb-3">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-medium truncate">{event.title}</p>
              <span className="text-[10px] text-muted-foreground shrink-0">{event.date}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{event.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export { CHART_COLORS };
