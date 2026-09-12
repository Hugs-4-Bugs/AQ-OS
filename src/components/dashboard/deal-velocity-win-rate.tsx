'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Zap,
  Users,
  Activity,
  Clock,
} from 'lucide-react';

/* ===== Types ===== */
type PeriodOption = 'month' | 'quarter' | 'year';

interface DealStageDays {
  name: string;
  days: number;
  color: string;
}

interface RepPerformance {
  name: string;
  initials: string;
  color: string;
  won: number;
  lost: number;
  winRate: number;
  avgDealSize: string;
}

interface ConversionStage {
  name: string;
  value: number;
  rate: number | null;
}

/* Data loaded from API */
const WIN_RATE = 34;

const VELOCITY_DATA = [
  { week: 'W1', deals: 4 },
  { week: 'W2', deals: 7 },
  { week: 'W3', deals: 5 },
  { week: 'W4', deals: 9 },
  { week: 'W5', deals: 6 },
  { week: 'W6', deals: 11 },
  { week: 'W7', deals: 8 },
  { week: 'W8', deals: 13 },
];

const DEAL_STAGES: DealStageDays[] = [
  { name: 'Prospect', days: 5, color: '#6366f1' },
  { name: 'Qualify', days: 8, color: '#8b5cf6' },
  { name: 'Demo', days: 12, color: '#3b82f6' },
  { name: 'Proposal', days: 7, color: '#06b6d4' },
  { name: 'Negotiate', days: 10, color: '#f59e0b' },
  { name: 'Close', days: 4, color: '#10b981' },
];

const WIN_SOURCES = [
  { name: 'Referral', percentage: 42, color: '#10b981' },
  { name: 'Outbound', percentage: 28, color: '#3b82f6' },
  { name: 'Inbound', percentage: 18, color: '#8b5cf6' },
  { name: 'Partner', percentage: 12, color: '#f59e0b' },
];

const WON_COUNT = 34;
const LOST_COUNT = 66;

const TOP_REPS: RepPerformance[] = [];

const FUNNEL_STAGES: ConversionStage[] = [
  { name: 'Leads', value: 200, rate: null },
  { name: 'Qualified', value: 140, rate: 70 },
  { name: 'Demo', value: 84, rate: 60 },
  { name: 'Proposal', value: 50, rate: 60 },
  { name: 'Negotiation', value: 34, rate: 68 },
  { name: 'Closed Won', value: 34, rate: 100 },
];

const PERIODS: { id: PeriodOption; label: string }[] = [
  { id: 'month', label: 'This Month' },
  { id: 'quarter', label: 'This Quarter' },
  { id: 'year', label: 'This Year' },
];

/* ===== Animation Variants ===== */
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ===== Win Rate Gauge (SVG Semicircle) ===== */
function WinRateGauge({ value }: { value: number }) {
  const radius = 80;
  const strokeWidth = 16;
  const center = 90;
  const cy = 95;

  const polarToCartesian = (angle: number) => {
    const rad = ((angle - 180) * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  /* Build arc path from start angle to end angle */
  const describeArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(startAngle);
    const end = polarToCartesian(endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  const gaugeColor = value < 25 ? '#ef4444' : value <= 40 ? '#f59e0b' : '#10b981';
  const gaugeBgColor = value < 25 ? 'rgba(239,68,68,0.1)' : value <= 40 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)';

  /* Zone arcs: red 0-25%, amber 25-40%, green 40-100% */
  const redEnd = Math.max(0, Math.min(value, 25)) * 1.8;
  const amberStart = Math.max(0, Math.min(value, 25)) * 1.8;
  const amberEnd = Math.max(25, Math.min(value, 40)) * 1.8;
  const greenStart = Math.max(25, Math.min(value, 40)) * 1.8;
  const greenEnd = value * 1.8;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 130" className="w-full max-w-[200px]">
        {/* Background arc */}
        <path d={describeArc(0, 180)} fill="none" stroke="rgba(100,116,139,0.15)" strokeWidth={strokeWidth} strokeLinecap="round" />

        {/* Color zones */}
        {value > 0 && value <= 25 && (
          <motion.path d={describeArc(0, redEnd)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} style={{ pathLength: 1 }} />
        )}
        {value > 25 && (
          <motion.path d={describeArc(0, 45)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} strokeLinecap="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
        )}
        {value > 25 && value <= 40 && (
          <motion.path d={describeArc(45, amberEnd)} fill="none" stroke="#f59e0b" strokeWidth={strokeWidth} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: 'easeOut' }} style={{ pathLength: 1 }} />
        )}
        {value > 25 && value > 40 && (
          <>
            <motion.path d={describeArc(45, 72)} fill="none" stroke="#f59e0b" strokeWidth={strokeWidth} strokeLinecap="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
            <motion.path d={describeArc(72, greenEnd)} fill="none" stroke="#10b981" strokeWidth={strokeWidth} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: 'easeOut' }} style={{ pathLength: 1 }} />
          </>
        )}

        {/* Center text */}
        <text x={center} y={cy - 5} textAnchor="middle" className="fill-foreground" fontSize="28" fontWeight="800">
          {value}%
        </text>
        <text x={center} y={cy + 14} textAnchor="middle" className="fill-muted-foreground" fontSize="10" fontWeight="500">
          Win Rate
        </text>

        {/* Zone labels */}
        <text x={25} y={120} textAnchor="middle" className="fill-red-400" fontSize="7">&lt;25%</text>
        <text x={center} y={120} textAnchor="middle" className="fill-amber-400" fontSize="7">25-40%</text>
        <text x={155} y={120} textAnchor="middle" className="fill-emerald-400" fontSize="7">&gt;40%</text>
      </svg>
      <Badge className={cn('text-[9px] h-5 px-2 border', value < 25 ? 'bg-red-500/10 text-red-500 border-red-500/20' : value <= 40 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20')}>
        {value < 25 ? 'Needs Improvement' : value <= 40 ? 'On Track' : 'Strong Performance'}
      </Badge>
    </div>
  );
}

/* ===== Velocity Trend Line Chart (SVG) ===== */
function VelocityTrendChart() {
  const data = VELOCITY_DATA;
  const width = 300;
  const height = 140;
  const padding = { top: 20, right: 20, bottom: 30, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map(d => d.deals));
  const minVal = 0;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
  const getY = (v: number) => padding.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

  /* Build line path */
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.deals)}`).join(' ');

  /* Area fill path */
  const areaPath = `${linePath} L ${getX(data.length - 1)} ${padding.top + chartH} L ${getX(0)} ${padding.top + chartH} Z`;

  /* Grid lines */
  const gridLines = [0, 3, 6, 9, 12].filter(v => v <= maxVal);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Grid lines */}
      {gridLines.map(val => (
        <g key={val}>
          <line x1={padding.left} y1={getY(val)} x2={width - padding.right} y2={getY(val)} stroke="rgba(100,116,139,0.1)" strokeWidth={0.5} />
          <text x={padding.left - 6} y={getY(val) + 3} textAnchor="end" className="fill-muted-foreground" fontSize="7">{val}</text>
        </g>
      ))}

      {/* Area gradient */}
      <defs>
        <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={areaPath}
        fill="url(#velocityGrad)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />

      {/* Line */}
      <motion.path
        d={linePath}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      {/* Data points + labels */}
      {data.map((d, i) => (
        <g key={d.week}>
          <motion.circle
            cx={getX(i)}
            cy={getY(d.deals)}
            r={3.5}
            fill="#3b82f6"
            stroke="#0f172a"
            strokeWidth={1.5}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.8 + i * 0.08 }}
          />
          <text
            x={getX(i)}
            y={height - 8}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="8"
          >
            {d.week}
          </text>
          <motion.text
            x={getX(i)}
            y={getY(d.deals) - 10}
            textAnchor="middle"
            className="fill-foreground"
            fontSize="8"
            fontWeight="600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 + i * 0.08 }}
          >
            {d.deals}
          </motion.text>
        </g>
      ))}

      {/* Axis labels */}
      <text x={width / 2} y={height - 0} textAnchor="middle" className="fill-muted-foreground" fontSize="7">Weeks</text>
      <text x={6} y={height / 2} textAnchor="middle" className="fill-muted-foreground" fontSize="7" transform={`rotate(-90, 6, ${height / 2})`}>Deals</text>
    </svg>
  );
}

/* ===== Deal Cycle Horizontal Bars ===== */
function DealCycleBars() {
  const maxDays = Math.max(...DEAL_STAGES.map(s => s.days));

  return (
    <div className="space-y-3">
      {DEAL_STAGES.map((stage, i) => (
        <motion.div
          key={stage.name}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className="flex items-center gap-3"
        >
          <span className="text-[10px] font-medium text-muted-foreground w-[72px] text-right shrink-0">{stage.name}</span>
          <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden relative">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: stage.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(stage.days / maxDays) * 100}%` }}
              transition={{ duration: 0.8, delay: i * 0.08, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[10px] font-semibold tabular-nums w-[28px] shrink-0">{stage.days}d</span>
        </motion.div>
      ))}
      <div className="flex items-center justify-between pt-1 px-[78px]">
        <span className="text-[9px] text-muted-foreground">Avg total cycle: <strong className="text-foreground">{DEAL_STAGES.reduce((s, st) => s + st.days, 0)} days</strong></span>
      </div>
    </div>
  );
}

/* ===== Win/Loss Ratio Bar ===== */
function WinLossBar() {
  const total = WON_COUNT + LOST_COUNT;
  const wonPct = ((WON_COUNT / total) * 100).toFixed(1);
  const lostPct = ((LOST_COUNT / total) * 100).toFixed(1);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold">Win/Loss Ratio</span>
        <span className="text-[10px] text-muted-foreground">{total} total deals</span>
      </div>
      <div className="flex h-7 rounded-full overflow-hidden bg-muted/30">
        <motion.div
          className="bg-emerald-500 flex items-center justify-center"
          initial={{ width: 0 }}
          animate={{ width: `${wonPct}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          <span className="text-[8px] font-bold text-white px-1.5">{WON_COUNT} Won</span>
        </motion.div>
        <motion.div
          className="bg-red-400 flex items-center justify-center"
          initial={{ width: 0 }}
          animate={{ width: `${lostPct}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          <span className="text-[8px] font-bold text-white px-1.5">{LOST_COUNT} Lost</span>
        </motion.div>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[8px] text-muted-foreground">{wonPct}%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-[8px] text-muted-foreground">{lostPct}%</span>
        </div>
      </div>
    </div>
  );
}

/* ===== Conversion Funnel ===== */
function ConversionFunnel() {
  const maxValue = FUNNEL_STAGES[0].value;

  return (
    <div className="space-y-1.5">
      {FUNNEL_STAGES.map((stage, i) => {
        const widthPct = Math.max(15, (stage.value / maxValue) * 100);
        return (
          <div key={stage.name}>
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex items-center gap-2 mb-0.5"
              style={{ transformOrigin: 'left' }}
            >
              <span className="text-[9px] text-muted-foreground w-[80px] text-right shrink-0">{stage.name}</span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-6 bg-muted/20 rounded-md overflow-hidden">
                  <motion.div
                    className="h-full rounded-md bg-gradient-to-r from-indigo-500/80 to-blue-500/80"
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPct}%` }}
                    transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                  />
                </div>
                <span className="text-[10px] font-semibold tabular-nums w-[32px] shrink-0">{stage.value}</span>
              </div>
            </motion.div>
            {stage.rate !== null && i < FUNNEL_STAGES.length - 1 && (
              <div className="flex items-center gap-2 mb-1">
                <span className="w-[80px]" />
                <div className="flex-1 flex items-center gap-1">
                  <div className="w-px h-3 bg-border/40 ml-[10%]" />
                  <Badge className={cn(
                    'text-[7px] h-4 px-1.5',
                    stage.rate >= 60 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                    stage.rate >= 50 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                    'bg-red-500/10 text-red-500 border-red-500/20'
                  )}>
                    {stage.rate}%
                  </Badge>
                  <span className="text-[7px] text-muted-foreground">conversion</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===== Win Rate by Source Donut Chart ===== */
function WinSourceDonut() {
  const cx = 80;
  const cy = 80;
  const outerR = 65;
  const innerR = 40;
  const total = WIN_SOURCES.reduce((s, src) => s + src.percentage, 0);

  let currentAngle = -90;

  const segments = WIN_SOURCES.map(src => {
    const angle = (src.percentage / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = ((startAngle + angle) * Math.PI) / 180;

    const x1o = cx + outerR * Math.cos(startRad);
    const y1o = cy + outerR * Math.sin(startRad);
    const x2o = cx + outerR * Math.cos(endRad);
    const y2o = cy + outerR * Math.sin(endRad);
    const x1i = cx + innerR * Math.cos(endRad);
    const y1i = cy + innerR * Math.sin(endRad);
    const x2i = cx + innerR * Math.cos(startRad);
    const y2i = cy + innerR * Math.sin(startRad);

    const largeArc = angle > 180 ? 1 : 0;

    const path = `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i} Z`;

    /* Label position */
    const midAngle = startAngle + angle / 2;
    const midRad = (midAngle * Math.PI) / 180;
    const labelR = (outerR + innerR) / 2;
    const labelX = cx + labelR * Math.cos(midRad);
    const labelY = cy + labelR * Math.sin(midRad);

    return { ...src, path, labelX, labelY, angle };
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 160 160" className="w-40 h-40 shrink-0">
        {/* Donut segments */}
        {segments.map((seg, i) => (
          <motion.path
            key={seg.name}
            d={seg.path}
            fill={seg.color}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.9 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          />
        ))}
        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-foreground" fontSize="16" fontWeight="700">100%</text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-muted-foreground" fontSize="8">Total</text>
      </svg>
      <div className="space-y-2.5">
        {WIN_SOURCES.map((src, i) => (
          <motion.div
            key={src.name}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.08 }}
            className="flex items-center gap-2"
          >
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
            <span className="text-[10px] text-muted-foreground w-[52px]">{src.name}</span>
            <span className="text-[11px] font-bold tabular-nums">{src.percentage}%</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ===== Top Reps Table ===== */
function TopRepsTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/30">
            <th className="text-[9px] font-semibold text-muted-foreground text-left pb-2 pr-2">Rep</th>
            <th className="text-[9px] font-semibold text-muted-foreground text-center pb-2 px-2">Won</th>
            <th className="text-[9px] font-semibold text-muted-foreground text-center pb-2 px-2">Lost</th>
            <th className="text-[9px] font-semibold text-muted-foreground text-center pb-2 px-2">Win Rate</th>
            <th className="text-[9px] font-semibold text-muted-foreground text-right pb-2 pl-2">Avg Deal</th>
          </tr>
        </thead>
        <tbody>
          {TOP_REPS.map((rep, i) => (
            <motion.tr
              key={rep.name}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="border-b border-border/10 last:border-0"
            >
              <td className="py-2.5 pr-2">
                <div className="flex items-center gap-2">
                  <div className={cn('w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0', rep.color)}>
                    <span className="text-[7px] font-bold text-white">{rep.initials}</span>
                  </div>
                  <span className="text-[10px] font-medium">{rep.name}</span>
                </div>
              </td>
              <td className="py-2.5 px-2 text-center">
                <span className="text-[10px] font-semibold text-emerald-500 tabular-nums">{rep.won}</span>
              </td>
              <td className="py-2.5 px-2 text-center">
                <span className="text-[10px] font-semibold text-red-400 tabular-nums">{rep.lost}</span>
              </td>
              <td className="py-2.5 px-2 text-center">
                <Badge className={cn(
                  'text-[8px] h-5 px-1.5 mx-auto',
                  rep.winRate >= 50 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                  rep.winRate >= 30 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                  'bg-red-500/10 text-red-500 border-red-500/20'
                )}>
                  {rep.winRate}%
                </Badge>
              </td>
              <td className="py-2.5 pl-2 text-right">
                <span className="text-[10px] font-semibold tabular-nums">{rep.avgDealSize}</span>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ===== Main Component ===== */
export default function DealVelocityWinRateAnalyzer() {
  const [period, setPeriod] = useState<PeriodOption>('month');

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Deal Velocity & Win Rate</h2>
              <p className="text-xs text-muted-foreground">Analyze conversion rates, deal speed, and rep performance</p>
            </div>
          </div>
          <div className="flex items-center rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  'px-3 py-1.5 text-[10px] font-medium transition-colors',
                  period === p.id
                    ? 'bg-blue-500/10 text-blue-500'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Top Row: Gauge + Velocity + Win/Loss */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Win Rate Gauge */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.05 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold">Win Rate</h3>
          </div>
          <WinRateGauge value={WIN_RATE} />
        </motion.div>

        {/* Velocity Trend */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-bold">Velocity Trend</h3>
            </div>
            <Badge className="text-[9px] h-4 px-1.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-0.5">
              <TrendingUp className="h-2.5 w-2.5" />
              +38%
            </Badge>
          </div>
          <VelocityTrendChart />
        </motion.div>

        {/* Win/Loss + Sources */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-bold">Win/Loss Analysis</h3>
          </div>
          <WinLossBar />
          <div className="mt-5">
            <h4 className="text-[10px] font-semibold text-muted-foreground mb-3">Win Rate by Source</h4>
            <WinSourceDonut />
          </div>
        </motion.div>
      </div>

      {/* Middle Row: Deal Cycle + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Average Deal Cycle */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold">Average Deal Cycle</h3>
            </div>
            <Badge className="text-[9px] h-4 px-1.5 bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
              {DEAL_STAGES.reduce((s, st) => s + st.days, 0)} days avg
            </Badge>
          </div>
          <DealCycleBars />
        </motion.div>

        {/* Stage Conversion Funnel */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.25 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-bold">Stage Conversion Funnel</h3>
            </div>
            <Badge className="text-[9px] h-4 px-1.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              {((FUNNEL_STAGES[FUNNEL_STAGES.length - 1].value / FUNNEL_STAGES[0].value) * 100).toFixed(0)}% overall
            </Badge>
          </div>
          <ConversionFunnel />
        </motion.div>
      </div>

      {/* Bottom Row: Top Reps */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.3 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Top Reps by Win Rate</h3>
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
              {TOP_REPS.length} reps
            </Badge>
          </div>
          <Badge className="text-[9px] h-4 px-1.5 bg-blue-500/10 text-blue-500 border-blue-500/20 gap-0.5">
            <TrendingUp className="h-2.5 w-2.5" />
            Team avg: {Math.round(TOP_REPS.reduce((s, r) => s + r.winRate, 0) / TOP_REPS.length)}%
          </Badge>
        </div>
        <TopRepsTable />
      </motion.div>
    </div>
  );
}
