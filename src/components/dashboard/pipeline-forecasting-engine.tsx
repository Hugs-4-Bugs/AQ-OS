'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Target,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Calendar,
  GitBranch,
  Zap,
  FileText,
  Settings,
  Triangle,
  DollarSign,
  Percent,
  Clock,
  ChevronRight,
  Shield,
  XCircle,
} from 'lucide-react';

/* ===== Types ===== */
interface ForecastMonth {
  month: string;
  optimistic: number;
  realistic: number;
  pessimistic: number;
}

interface PipelineStage {
  id: string;
  name: string;
  dealCount: number;
  totalValue: string;
  weightedValue: string;
  conversionRate: number;
  avgDays: number;
  color: string;
}

interface MovementWeek {
  week: string;
  added: number;
  lost: number;
}

interface Scenario {
  id: string;
  label: string;
  value: string;
  probability: number;
  color: string;
  bg: string;
  border: string;
  icon: React.ElementType;
  description: string;
}

interface Assumption {
  id: string;
  label: string;
  value: string;
  description: string;
  enabled: boolean;
  icon: React.ElementType;
}

interface AtRiskDeal {
  id: string;
  name: string;
  company: string;
  value: string;
  riskFactor: string;
  probabilityDrop: number;
  severity: 'high' | 'medium' | 'low';
}

/* Data loaded from API */
const FORECAST_SUMMARY = {
  predictedRevenue: '$2.4M',
  variance: '±15%',
  confidence: 78,
  period: 'Q3 2026',
};

const CONFIDENCE_DATA: ForecastMonth[] = [
  { month: 'Apr', optimistic: 320, realistic: 280, pessimistic: 200 },
  { month: 'May', optimistic: 410, realistic: 350, pessimistic: 250 },
  { month: 'Jun', optimistic: 520, realistic: 420, pessimistic: 300 },
  { month: 'Jul', optimistic: 600, realistic: 480, pessimistic: 350 },
  { month: 'Aug', optimistic: 680, realistic: 520, pessimistic: 380 },
  { month: 'Sep', optimistic: 750, realistic: 580, pessimistic: 400 },
];

const PIPELINE_STAGES: PipelineStage[] = [
  { id: 's1', name: 'Discovery', dealCount: 42, totalValue: '$3.8M', weightedValue: '$760K', conversionRate: 62, avgDays: 14, color: '#64748b' },
  { id: 's2', name: 'Qualification', dealCount: 28, totalValue: '$2.9M', weightedValue: '$870K', conversionRate: 55, avgDays: 21, color: '#06b6d4' },
  { id: 's3', name: 'Proposal', dealCount: 18, totalValue: '$2.1M', weightedValue: '$1.05M', conversionRate: 48, avgDays: 28, color: '#3b82f6' },
  { id: 's4', name: 'Negotiation', dealCount: 12, totalValue: '$1.6M', weightedValue: '$960K', conversionRate: 65, avgDays: 18, color: '#f59e0b' },
  { id: 's5', name: 'Closing', dealCount: 8, totalValue: '$1.2M', weightedValue: '$960K', conversionRate: 72, avgDays: 10, color: '#a855f7' },
  { id: 's6', name: 'Won', dealCount: 5, totalValue: '$890K', weightedValue: '$890K', conversionRate: 100, avgDays: 0, color: '#10b981' },
];

const MOVEMENT_DATA: MovementWeek[] = [
  { week: 'W1', added: 12, lost: 3 },
  { week: 'W2', added: 8, lost: 5 },
  { week: 'W3', added: 15, lost: 2 },
  { week: 'W4', added: 10, lost: 4 },
  { week: 'W5', added: 14, lost: 6 },
  { week: 'W6', added: 9, lost: 3 },
  { week: 'W7', added: 16, lost: 5 },
  { week: 'W8', added: 11, lost: 2 },
];

const SCENARIOS: Scenario[] = [
  { id: 'sc1', label: 'Best Case', value: '$2.9M', probability: 25, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: TrendingUp, description: 'All at-risk deals close + bonus deals' },
  { id: 'sc2', label: 'Likely', value: '$2.4M', probability: 45, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Target, description: 'Normal conversion rate maintained' },
  { id: 'sc3', label: 'Conservative', value: '$1.8M', probability: 20, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: BarChart3, description: 'Slower cycle, some deals slip' },
  { id: 'sc4', label: 'Downside', value: '$1.2M', probability: 10, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: AlertTriangle, description: 'Major deal losses expected' },
];

const ASSUMPTIONS: Assumption[] = [
  { id: 'a1', label: 'Average deal cycle time', value: '34 days', description: 'Based on last 90 day rolling average', enabled: true, icon: Clock },
  { id: 'a2', label: 'Historical win rate', value: '42%', description: 'Weighted by deal size and stage', enabled: true, icon: Percent },
  { id: 'a3', label: 'Seasonal adjustment', value: '+8% uplift', description: 'Q3 historical seasonal boost factor', enabled: true, icon: Calendar },
  { id: 'a4', label: 'Market conditions', value: 'Neutral', description: 'Current macroeconomic outlook factor', enabled: false, icon: Settings },
];

const AT_RISK_DEALS: AtRiskDeal[] = [];

/* ===== Animation Variants ===== */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ===== Confidence Interval Area Chart ===== */
function ConfidenceIntervalChart({ data }: { data: ForecastMonth[] }) {
  const width = 500;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap((d) => [d.optimistic, d.realistic, d.pessimistic]);
  const minVal = Math.min(...allValues) - 50;
  const maxVal = Math.max(...allValues) + 50;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * chartWidth;
  const getY = (val: number) => padding.top + chartHeight - ((val - minVal) / (maxVal - minVal)) * chartHeight;

  // Build area paths
  const optimisticArea = [
    `M ${getX(0)} ${getY(data[0].optimistic)}`,
    ...data.slice(1).map((d, i) => `L ${getX(i + 1)} ${getY(d.optimistic)}`),
    ...data.slice().reverse().map((d, i) => `L ${getX(data.length - 1 - i)} ${getY(d.realistic)}`),
    'Z',
  ].join(' ');

  const pessimisticArea = [
    `M ${getX(0)} ${getY(data[0].realistic)}`,
    ...data.slice(1).map((d, i) => `L ${getX(i + 1)} ${getY(d.realistic)}`),
    ...data.slice().reverse().map((d, i) => `L ${getX(data.length - 1 - i)} ${getY(d.pessimistic)}`),
    'Z',
  ].join(' ');

  const realisticLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.realistic)}`).join(' ');
  const optimisticLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.optimistic)}`).join(' ');
  const pessimisticLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.pessimistic)}`).join(' ');

  // Grid lines
  const gridSteps = 5;
  const gridValues = Array.from({ length: gridSteps }, (_, i) =>
    Math.round(minVal + ((maxVal - minVal) / (gridSteps - 1)) * i)
  );

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id="optimisticGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
        </linearGradient>
        <linearGradient id="pessimisticGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
          <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
        </linearGradient>
        <linearGradient id="realisticLineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {gridValues.map((val) => {
        const y = getY(val);
        return (
          <g key={val}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" strokeWidth="0.5" className="text-border" strokeDasharray="4 4" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[8px]">
              ${(val / 100).toFixed(1)}M
            </text>
          </g>
        );
      })}

      {/* Optimistic area (realistic to optimistic) */}
      <motion.path d={optimisticArea} fill="url(#optimisticGrad)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }} />

      {/* Pessimistic area (pessimistic to realistic) */}
      <motion.path d={pessimisticArea} fill="url(#pessimisticGrad)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }} />

      {/* Optimistic line */}
      <motion.path d={optimisticLine} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.4 }} />

      {/* Pessimistic line */}
      <motion.path d={pessimisticLine} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.4 }} />

      {/* Realistic line (main) */}
      <motion.path d={realisticLine} fill="none" stroke="url(#realisticLineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.2 }} />

      {/* Realistic dots */}
      {data.map((d, i) => (
        <motion.circle key={i} cx={getX(i)} cy={getY(d.realistic)} r="3" fill="#8b5cf6" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8 + i * 0.08, duration: 0.2 }} />
      ))}

      {/* Month labels */}
      {data.map((d, i) => (
        <text key={i} x={getX(i)} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">
          {d.month}
        </text>
      ))}
    </svg>
  );
}

/* ===== Deal Movement Trend Chart ===== */
function DealMovementChart({ data }: { data: MovementWeek[] }) {
  const width = 500;
  const height = 140;
  const padding = { top: 15, right: 15, bottom: 25, left: 35 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap((d) => [d.added, d.lost]);
  const minVal = 0;
  const maxVal = Math.max(...allValues) + 3;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * chartWidth;
  const getY = (val: number) => padding.top + chartHeight - ((val - minVal) / (maxVal - minVal)) * chartHeight;

  const addedLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.added)}`).join(' ');
  const lostLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.lost)}`).join(' ');

  const addedArea = `${addedLine} L ${getX(data.length - 1)} ${getY(0)} L ${getX(0)} ${getY(0)} Z`;
  const lostArea = `${lostLine} L ${getX(data.length - 1)} ${getY(0)} L ${getX(0)} ${getY(0)} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id="addedGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
        </linearGradient>
        <linearGradient id="lostGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
          <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Grid */}
      {[0, 5, 10, 15].map((val) => {
        const y = getY(val);
        return (
          <g key={val}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" strokeWidth="0.5" className="text-border" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[7px]">
              {val}
            </text>
          </g>
        );
      })}

      {/* Added area */}
      <motion.path d={addedArea} fill="url(#addedGrad)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
      {/* Lost area */}
      <motion.path d={lostArea} fill="url(#lostGrad)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.1 }} />

      {/* Added line */}
      <motion.path d={addedLine} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />

      {/* Lost line */}
      <motion.path d={lostLine} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: 0.1 }} />

      {/* Added dots */}
      {data.map((d, i) => (
        <motion.circle key={`a-${i}`} cx={getX(i)} cy={getY(d.added)} r="2.5" fill="#10b981" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + i * 0.06 }} />
      ))}
      {/* Lost dots */}
      {data.map((d, i) => (
        <motion.circle key={`l-${i}`} cx={getX(i)} cy={getY(d.lost)} r="2.5" fill="#ef4444" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + i * 0.06 }} />
      ))}

      {/* Week labels */}
      {data.map((d, i) => (
        <text key={i} x={getX(i)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[8px]">
          {d.week}
        </text>
      ))}
    </svg>
  );
}

/* ===== Forecast Summary Card ===== */
function ForecastSummaryCard() {
  const [animatedConfidence, setAnimatedConfidence] = useState(0);

  useEffect(() => {
    const duration = 1200;
    const startTime = performance.now();
    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedConfidence(Math.round(FORECAST_SUMMARY.confidence * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, []);

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="rounded-lg p-2 bg-gradient-to-br from-violet-500 to-blue-500">
          <TrendingUp className="h-4 w-4 text-white" />
        </div>
        <h3 className="text-sm font-bold">Forecast Summary</h3>
      </div>
      <div className="space-y-4">
        {/* Predicted Revenue */}
        <div className="p-3 rounded-xl bg-gradient-to-r from-violet-500/5 to-blue-500/5 border border-violet-500/10">
          <p className="text-[10px] text-muted-foreground mb-1">Predicted Revenue</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-extrabold tabular-nums">{FORECAST_SUMMARY.predictedRevenue}</span>
            <Badge className="text-[9px] h-5 px-1.5 bg-muted/50 text-muted-foreground border-0 mb-0.5">
              {FORECAST_SUMMARY.variance}
            </Badge>
          </div>
        </div>

        {/* Confidence & Period */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-muted/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="h-3 w-3 text-blue-500" />
              <p className="text-[10px] text-muted-foreground">Confidence</p>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-lg font-extrabold tabular-nums text-blue-500">{animatedConfidence}%</span>
            </div>
            {/* Mini confidence bar */}
            <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden mt-1.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${FORECAST_SUMMARY.confidence}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
              />
            </div>
          </div>
          <div className="p-3 rounded-xl bg-muted/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className="h-3 w-3 text-emerald-500" />
              <p className="text-[10px] text-muted-foreground">Period</p>
            </div>
            <span className="text-lg font-extrabold">{FORECAST_SUMMARY.period}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ===== Scenario Cards ===== */
function ScenarioCards() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {SCENARIOS.map((scenario, index) => {
        const Icon = scenario.icon;
        return (
          <motion.div
            key={scenario.id}
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -2 }}
            className={cn(
              'p-3 rounded-xl border cursor-default transition-all duration-200',
              scenario.bg, scenario.border
            )}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Icon className={cn('h-3.5 w-3.5', scenario.color)} />
              <span className="text-[10px] font-semibold text-muted-foreground">{scenario.label}</span>
            </div>
            <p className={cn('text-lg font-extrabold tabular-nums', scenario.color)}>{scenario.value}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[9px] text-muted-foreground">{scenario.description}</span>
            </div>
            <Badge variant="outline" className={cn('text-[8px] h-4 px-1.5 border mt-1.5', scenario.bg, scenario.border, scenario.color)}>
              {scenario.probability}% probability
            </Badge>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ===== Assumption Toggle Component ===== */
function AssumptionItem({
  assumption,
  onToggle,
}: {
  assumption: Assumption;
  onToggle: (id: string) => void;
}) {
  const Icon = assumption.icon;
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl border transition-all duration-200',
      assumption.enabled
        ? 'border-violet-500/20 bg-violet-500/[0.03]'
        : 'border-border/30 bg-muted/10 opacity-60'
    )}>
      <button
        onClick={() => onToggle(assumption.id)}
        className={cn(
          'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer',
          assumption.enabled
            ? 'bg-violet-500 border-violet-500'
            : 'border-muted-foreground/30 hover:border-muted-foreground/50'
        )}
      >
        {assumption.enabled && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <Icon className={cn('h-4 w-4 shrink-0', assumption.enabled ? 'text-violet-500' : 'text-muted-foreground')} />
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-semibold', assumption.enabled ? 'text-foreground' : 'text-muted-foreground')}>{assumption.label}</p>
        <p className="text-[10px] text-muted-foreground truncate">{assumption.description}</p>
      </div>
      <Badge variant="outline" className={cn('text-[9px] h-5 px-1.5 border-0 shrink-0', assumption.enabled ? 'bg-violet-500/10 text-violet-500' : 'bg-muted/30 text-muted-foreground')}>
        {assumption.value}
      </Badge>
    </div>
  );
}

/* ===== Main Component ===== */
export default function PipelineForecastingEngine() {
  const [assumptions, setAssumptions] = useState(ASSUMPTIONS);
  const [isGenerating, setIsGenerating] = useState(false);

  const toggleAssumption = (id: string) => {
    setAssumptions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  };

  const handleGenerateReport = () => {
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 2500);
  };

  const enabledCount = assumptions.filter((a) => a.enabled).length;

  const severityConfig = {
    high: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: XCircle },
    medium: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: AlertTriangle },
    low: { color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Shield },
  };

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
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/20">
              <GitBranch className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Pipeline Forecasting Engine</h2>
              <p className="text-xs text-muted-foreground">AI-powered revenue predictions & scenario analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
            >
              <Settings className="h-3.5 w-3.5" />
              Adjust Assumptions
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1.5 bg-gradient-to-r from-violet-500 to-blue-500 text-white border-0 hover:shadow-lg hover:shadow-violet-500/20"
              onClick={handleGenerateReport}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Triangle className="h-3.5 w-3.5 animate-pulse" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {isGenerating ? 'Generating...' : 'Generate Report'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Forecast Summary + Confidence Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ForecastSummaryCard />

        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-500" />
              <h3 className="text-sm font-bold">Confidence Interval</h3>
            </div>
            <div className="flex items-center gap-3 text-[9px]">
              <div className="flex items-center gap-1">
                <div className="w-4 h-0.5 bg-emerald-500" style={{ borderTop: '1px dashed #10b981' }} />
                <span className="text-muted-foreground">Optimistic</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-0.5 bg-gradient-to-r from-violet-500 to-blue-500" />
                <span className="text-muted-foreground">Realistic</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-0.5 bg-red-500" style={{ borderTop: '1px dashed #ef4444' }} />
                <span className="text-muted-foreground">Pessimistic</span>
              </div>
            </div>
          </div>
          <ConfidenceIntervalChart data={CONFIDENCE_DATA} />
        </motion.div>
      </div>

      {/* Risk-Adjusted Scenarios */}
      <motion.div variants={itemVariants} initial="hidden" animate="visible" transition={{ delay: 0.15 }}>
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-bold">Risk-Adjusted Forecast Scenarios</h3>
        </div>
        <ScenarioCards />
      </motion.div>

      {/* Pipeline Stages Breakdown */}
      <motion.div variants={itemVariants} initial="hidden" animate="visible" transition={{ delay: 0.2 }} className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-cyan-500" />
            <h3 className="text-sm font-bold">Pipeline Stages Breakdown</h3>
          </div>
          <Badge variant="outline" className="text-[10px] h-5 px-2 bg-cyan-500/5 text-cyan-500 border-cyan-500/20">
            {PIPELINE_STAGES.reduce((s, p) => s + p.dealCount, 0)} total deals
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Stage</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Deals</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Total Value</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Weighted</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Conversion</th>
                <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2">Avg Days</th>
              </tr>
            </thead>
            <tbody>
              {PIPELINE_STAGES.map((stage) => (
                <tr key={stage.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-xs font-semibold">{stage.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="text-xs font-bold tabular-nums">{stage.dealCount}</span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="text-xs font-bold tabular-nums">{stage.totalValue}</span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="text-xs font-bold tabular-nums text-violet-500">{stage.weightedValue}</span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${stage.conversionRate}%` }}
                          transition={{ duration: 0.6 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                      </div>
                      <span className="text-[10px] font-medium tabular-nums">{stage.conversionRate}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="text-xs tabular-nums text-muted-foreground">{stage.avgDays > 0 ? `${stage.avgDays}d` : '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Deal Movement Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants} initial="hidden" animate="visible" transition={{ delay: 0.25 }} className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-bold">Deal Movement Trend</h3>
            </div>
            <Badge variant="outline" className="text-[10px] h-5 px-2 bg-muted/50 text-muted-foreground">8 weeks</Badge>
          </div>
          <DealMovementChart data={MOVEMENT_DATA} />
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-[9px]">
              <div className="w-3 h-3 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <ArrowUpRight className="h-2 w-2 text-emerald-500" />
              </div>
              <span className="text-muted-foreground">New deals</span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px]">
              <div className="w-3 h-3 rounded-full bg-red-500/20 flex items-center justify-center">
                <ArrowDownRight className="h-2 w-2 text-red-500" />
              </div>
              <span className="text-muted-foreground">Deals lost</span>
            </div>
          </div>
        </motion.div>

        {/* Key Assumptions */}
        <motion.div variants={itemVariants} initial="hidden" animate="visible" transition={{ delay: 0.3 }} className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-bold">Key Assumptions</h3>
            </div>
            <Badge variant="outline" className="text-[10px] h-5 px-2 bg-amber-500/5 text-amber-500 border-amber-500/20">
              {enabledCount}/{ASSUMPTIONS.length} active
            </Badge>
          </div>
          <div className="space-y-2">
            {assumptions.map((assumption) => (
              <AssumptionItem key={assumption.id} assumption={assumption} onToggle={toggleAssumption} />
            ))}
          </div>
        </motion.div>
      </div>

      {/* At-Risk Deals */}
      <motion.div variants={itemVariants} initial="hidden" animate="visible" transition={{ delay: 0.35 }} className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-bold">Top At-Risk Deals</h3>
          </div>
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">
            {AT_RISK_DEALS.length} deals flagged
          </Badge>
        </div>
        <div className="space-y-2">
          {AT_RISK_DEALS.map((deal) => {
            const config = severityConfig[deal.severity];
            const SeverityIcon = config.icon;
            return (
              <div
                key={deal.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border transition-all duration-200',
                  config.bg, config.border
                )}
              >
                <div className={cn('rounded-lg p-2 shrink-0', config.bg)}>
                  <SeverityIcon className={cn('h-4 w-4', config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold truncate">{deal.name}</p>
                    <Badge className={cn('text-[8px] h-4 px-1.5 border shrink-0', config.bg, config.border, config.color)}>
                      {deal.severity}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{deal.company} · {deal.riskFactor}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold tabular-nums">{deal.value}</p>
                  <div className="flex items-center gap-1 justify-end">
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                    <span className="text-[10px] font-medium text-red-500">-{deal.probabilityDrop}%</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
