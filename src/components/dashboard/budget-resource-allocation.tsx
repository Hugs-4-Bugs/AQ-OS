'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  DollarSign,
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Settings,
  Users,
  Briefcase,
  PieChart,
  BarChart3,
  Clock,
  Calendar,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Zap,
  Info,
} from 'lucide-react';

/* ===== Types ===== */
type Period = 'month' | 'quarter' | 'year';

interface DepartmentAllocation {
  id: string;
  name: string;
  budget: number;
  spent: number;
  color: string;
  gradient: string;
}

interface BudgetVsActual {
  department: string;
  planned: number;
  spent: number;
}

interface MonthlyBurnRate {
  month: string;
  rate: number;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  allocation: number;
  hoursThisWeek: number;
  projectCount: number;
  avatar: string;
}

interface ExpenseCategory {
  label: string;
  value: number;
  color: string;
}

/* ===== Data — fetched from API ===== */

/* ===== Loading Skeleton ===== */
function BudgetSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5 animate-pulse">
        <div className="h-6 bg-muted rounded w-64 mb-2" />
        <div className="h-4 bg-muted rounded w-48" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card/80 border border-border/50 rounded-2xl shadow-lg p-5 animate-pulse">
            <div className="h-64 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Animation Variants ===== */
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ===== Helper: Format Currency ===== */
function formatCurrency(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount}`;
}

function formatCurrencyFull(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

/* ===== Budget Progress Bar ===== */
function BudgetOverview({ budget, spent, remaining }: { budget: number; spent: number; remaining: number }) {
  const spentPercent = (spent / budget) * 100;
  const remainingPercent = (remaining / budget) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-extrabold tabular-nums">{formatCurrencyFull(budget)}</p>
          <p className="text-[10px] text-muted-foreground">Total Budget Allocated</p>
        </div>
        <div className="flex items-center gap-1">
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">
            <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" />
            12% YoY
          </Badge>
        </div>
      </div>
      {/* Progress bar */}
      <div className="w-full h-3 bg-muted/40 rounded-full overflow-hidden relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${spentPercent}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full"
        />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-blue-500 to-violet-500" />
            <span className="text-muted-foreground">Spent</span>
            <span className="font-bold tabular-nums">{formatCurrencyFull(spent)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-muted/60" />
            <span className="text-muted-foreground">Remaining</span>
            <span className="font-bold tabular-nums">{formatCurrencyFull(remaining)}</span>
          </div>
        </div>
        <span className="font-bold text-foreground">{Math.round(spentPercent)}%</span>
      </div>
    </div>
  );
}

/* ===== Department Allocation Bars ===== */
function DepartmentAllocationBar({ dept, index }: { dept: DepartmentAllocation; index: number }) {
  const percent = (dept.spent / dept.budget) * 100;
  const isOverBudget = percent > 90;

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 shrink-0">
        <p className="text-xs font-medium truncate">{dept.name}</p>
      </div>
      <div className="flex-1">
        <div className="w-full h-2.5 bg-muted/40 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.8, delay: 0.2 + index * 0.08, ease: 'easeOut' }}
            className={cn(
              'h-full rounded-full bg-gradient-to-r',
              dept.gradient,
              isOverBudget && 'opacity-75'
            )}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 w-28 justify-end">
        <span className="text-[11px] font-bold tabular-nums">{formatCurrency(dept.spent)}</span>
        <span className="text-[10px] text-muted-foreground">/</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(dept.budget)}</span>
      </div>
    </div>
  );
}

/* ===== Budget vs Actual Grouped Bar Chart (SVG) ===== */
function BudgetVsActualChart({ data }: { data: BudgetVsActual[] }) {
  const width = 420;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 35, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map((d) => Math.max(d.planned, d.spent))) * 1.15;
  const barGroupWidth = chartWidth / data.length;
  const barWidth = barGroupWidth * 0.3;
  const barGap = 4;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id="plannedGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 100, 200, 300].map((val) => {
        const y = padding.top + chartHeight - (val / maxVal) * chartHeight;
        return (
          <g key={val}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-border"
            />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[8px]">
              {val}
            </text>
          </g>
        );
      })}
      {/* Bars */}
      {data.map((item, i) => {
        const groupX = padding.left + i * barGroupWidth + barGroupWidth / 2;
        const plannedH = (item.planned / maxVal) * chartHeight;
        const actualH = (item.spent / maxVal) * chartHeight;
        const plannedY = padding.top + chartHeight - plannedH;
        const actualY = padding.top + chartHeight - actualH;

        return (
          <g key={item.department}>
            {/* Planned bar */}
            <motion.rect
              x={groupX - barWidth - barGap / 2}
              y={plannedY}
              width={barWidth}
              height={plannedH}
              fill="url(#plannedGrad)"
              rx={3}
              initial={{ height: 0, y: padding.top + chartHeight }}
              animate={{ height: plannedH, y: plannedY }}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.1 }}
            />
            {/* Actual bar */}
            <motion.rect
              x={groupX + barGap / 2}
              y={actualY}
              width={barWidth}
              height={actualH}
              fill="url(#actualGrad)"
              rx={3}
              initial={{ height: 0, y: padding.top + chartHeight }}
              animate={{ height: actualH, y: actualY }}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.1 }}
            />
            {/* Label */}
            <text
              x={groupX}
              y={height - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[8px] font-medium"
            >
              {item.department}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ===== Monthly Burn Rate Line Chart (SVG) ===== */
function BurnRateChart({ data }: { data: MonthlyBurnRate[] }) {
  const width = 400;
  const height = 140;
  const padding = { top: 15, right: 15, bottom: 25, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const minRate = Math.min(...data.map((d) => d.rate)) - 10;
  const maxRate = Math.max(...data.map((d) => d.rate)) + 10;

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartWidth,
    y: padding.top + chartHeight - ((d.rate - minRate) / (maxRate - minRate)) * chartHeight,
    rate: d.rate,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id="burnGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[80, 100, 120].map((val) => {
        const y = padding.top + chartHeight - ((val - minRate) / (maxRate - minRate)) * chartHeight;
        return (
          <g key={val}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" strokeWidth="0.5" className="text-border" />
            <text x={padding.left - 5} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[7px]">
              {val}
            </text>
          </g>
        );
      })}
      {/* Month labels */}
      {data.map((d, i) => {
        const x = padding.left + (i / (data.length - 1)) * chartWidth;
        return (
          <text key={d.month} x={x} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[8px]">
            {d.month}
          </text>
        );
      })}
      {/* Area */}
      <path d={areaPath} fill="url(#burnGradient)" />
      {/* Line */}
      <motion.path
        d={linePath}
        fill="none"
        stroke="#f59e0b"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
      {/* Data points */}
      {points.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3.5"
          fill="#f59e0b"
          stroke="white"
          strokeWidth="1.5"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.8 + i * 0.1, duration: 0.2 }}
        />
      ))}
      {/* Last point label */}
      <text
        x={points[points.length - 1].x}
        y={points[points.length - 1].y - 8}
        textAnchor="middle"
        className="fill-amber-500 text-[9px] font-bold"
      >
        ${data[data.length - 1].rate}K
      </text>
    </svg>
  );
}

/* ===== Expense Categories Donut ===== */
function ExpenseDonut({ data }: { data: ExpenseCategory[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const centerX = 60;
  const centerY = 60;
  const radius = 42;
  const innerRadius = 28;

  // Pre-compute segment angles to avoid mutating variable during render
  const segmentAngles = data.map(segment => (segment.value / total) * 360);
  const segments = data.map((segment, index) => {
    const startAngle = segmentAngles.slice(0, index).reduce((sum, a) => sum + a, 0);

    const segmentAngle = segmentAngles[index];
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((startAngle + segmentAngle - 90) * Math.PI) / 180;

    const outerStartX = centerX + radius * Math.cos(startRad);
    const outerStartY = centerY + radius * Math.sin(startRad);
    const outerEndX = centerX + radius * Math.cos(endRad);
    const outerEndY = centerY + radius * Math.sin(endRad);
    const innerEndX = centerX + innerRadius * Math.cos(endRad);
    const innerEndY = centerY + innerRadius * Math.sin(endRad);
    const innerStartX = centerX + innerRadius * Math.cos(startRad);
    const innerStartY = centerY + innerRadius * Math.sin(startRad);

    const largeArc = segmentAngle > 180 ? 1 : 0;

    const pathData = [
      `M ${outerStartX} ${outerStartY}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${outerEndX} ${outerEndY}`,
      `L ${innerEndX} ${innerEndY}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX} ${innerStartY}`,
      'Z',
    ].join(' ');

    return { ...segment, pathData };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {segments.map((segment, index) => (
          <motion.path
            key={segment.label}
            d={segment.pathData}
            fill={segment.color}
            opacity={0.85}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.85, scale: 1 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          />
        ))}
        <text x={centerX} y={centerY - 4} textAnchor="middle" className="fill-foreground text-sm font-bold">
          ${total}K
        </text>
        <text x={centerX} y={centerY + 10} textAnchor="middle" className="fill-muted-foreground text-[8px]">
          total
        </text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {data.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: segment.color }} />
            <span className="text-[10px] text-muted-foreground w-24">{segment.label}</span>
            <span className="text-[10px] font-bold tabular-nums">${segment.value}K</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Allocation Color Helper ===== */
function getAllocationColor(allocation: number): { className: string; barColor: string } {
  if (allocation >= 90) return { className: 'text-red-500', barColor: 'bg-red-500' };
  if (allocation >= 75) return { className: 'text-amber-500', barColor: 'bg-amber-500' };
  return { className: 'text-emerald-500', barColor: 'bg-emerald-500' };
}

/* ===== Main Component ===== */
export default function BudgetResourceAllocation() {
  const [period, setPeriod] = useState<Period>('quarter');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [budgetData, setBudgetData] = useState<{
    totalBudget: number;
    totalSpent: number;
    totalRemaining: number;
    departments: DepartmentAllocation[];
    budgetVsActual: BudgetVsActual[];
    monthlyBurnRate: MonthlyBurnRate[];
    teamMembers: TeamMember[];
    expenseCategories: ExpenseCategory[];
  } | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/budget')
      .then(r => { if (!r.ok) throw new Error('Failed to load budget data'); return r.json(); })
      .then(res => {
        const d = res.data;
        if (d) {
          const departments: DepartmentAllocation[] = (d.departments || []).map((dept: Record<string, unknown>, i: number) => ({
            id: dept.id as string || `d-${i}`,
            name: dept.name as string || 'Unknown',
            budget: (dept.budget as number) || 0,
            spent: (dept.spent as number) || 0,
            color: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'][i % 5],
            gradient: ['from-blue-400 to-blue-600', 'from-violet-400 to-violet-600', 'from-emerald-400 to-emerald-600', 'from-amber-400 to-amber-600', 'from-pink-400 to-pink-600'][i % 5],
          }));
          const totalBudget = (d.totalBudget as number) || 0;
          const totalSpent = (d.totalSpent as number) || 0;
          const budgetVsActual = departments.map(dept => ({
            department: dept.name,
            planned: Math.round(dept.budget / 1000),
            spent: Math.round(dept.spent / 1000),
          }));
          setBudgetData({
            totalBudget,
            totalSpent,
            totalRemaining: totalBudget - totalSpent,
            departments,
            budgetVsActual,
            monthlyBurnRate: [],
            teamMembers: [],
            expenseCategories: [],
          });
        }
      })
      .catch(e => setBudgetError(e.message))
      .finally(() => setBudgetLoading(false));
  }, []);

  const handleAdjustBudget = () => {
    setIsAdjusting(true);
    setTimeout(() => setIsAdjusting(false), 2000);
  };

  const handleExportReport = () => {
    setIsExporting(true);
    setTimeout(() => setIsExporting(false), 1500);
  };

  if (budgetLoading) return <BudgetSkeleton />;
  if (budgetError) return <div className="p-6 text-destructive">Error: {budgetError}</div>;
  if (!budgetData) return (
    <div className="space-y-6">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2.5 bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Budget & Resource Allocation</h2>
            <p className="text-xs text-muted-foreground">No budget data available yet</p>
          </div>
        </div>
      </div>
    </div>
  );

  const { totalBudget, totalSpent, totalRemaining, departments, budgetVsActual, monthlyBurnRate, teamMembers, expenseCategories } = budgetData;

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
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Budget & Resource Allocation</h2>
              <p className="text-xs text-muted-foreground">Track spending, utilization, and financial planning</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Period Toggle */}
            <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/30">
              {(['month', 'quarter', 'year'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'text-[10px] font-medium px-3 py-1.5 rounded-md transition-all capitalize',
                    period === p ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  This {p}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              onClick={handleExportReport}
              disabled={isExporting}
            >
              <Download className="h-3.5 w-3.5" />
              {isExporting ? 'Exporting...' : 'Export Report'}
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1.5 bg-gradient-to-r from-blue-500 to-violet-500 text-white border-0 hover:shadow-lg hover:shadow-blue-500/20"
              onClick={handleAdjustBudget}
              disabled={isAdjusting}
            >
              <Settings className="h-3.5 w-3.5" />
              {isAdjusting ? 'Adjusting...' : 'Adjust Budget'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Budget Overview + Department Allocations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Total Budget Overview */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-bold">Budget Overview</h3>
          </div>
          <BudgetOverview budget={totalBudget} spent={totalSpent} remaining={totalRemaining} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <div className="flex items-center gap-1 mb-1">
                <TrendingDown className="h-3 w-3 text-emerald-500" />
                <span className="text-[9px] text-emerald-500 font-medium">Under Budget</span>
              </div>
              <p className="text-xs font-bold text-emerald-600 tabular-nums">{formatCurrencyFull(totalRemaining)}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <div className="flex items-center gap-1 mb-1">
                <Clock className="h-3 w-3 text-amber-500" />
                <span className="text-[9px] text-amber-500 font-medium">Run Rate</span>
              </div>
              <p className="text-xs font-bold text-amber-600 tabular-nums">$103K/mo</p>
            </div>
          </div>
        </motion.div>

        {/* Department Allocations */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-500" />
              <h3 className="text-sm font-bold">Department Allocations</h3>
            </div>
            <Badge variant="outline" className="text-[10px] h-5 px-2 bg-violet-500/5 text-violet-500 border-violet-500/20">
              {departments.length} departments
            </Badge>
          </div>
          <div className="space-y-3">
            {departments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No department data available</p>
            ) : departments.map((dept, index) => (
              <DepartmentAllocationBar key={dept.id} dept={dept} index={index} />
            ))}
          </div>
        </motion.div>
      </div>

      {/* Budget vs Actual + Burn Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget vs Actual Grouped Bar Chart */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold">Budget vs Actual</h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-violet-500" />
                <span className="text-[10px] text-muted-foreground">Planned</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                <span className="text-[10px] text-muted-foreground">Spent</span>
              </div>
            </div>
          </div>
          <BudgetVsActualChart data={budgetVsActual} />
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
            <Info className="h-3 w-3" />
            Values in thousands (USD)
          </div>
        </motion.div>

        {/* Monthly Burn Rate */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-bold">Monthly Burn Rate</h3>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] h-4 px-1.5">
              <ArrowDownRight className="h-2.5 w-2.5 mr-0.5" />
              -28% from peak
            </Badge>
          </div>
          <BurnRateChart data={monthlyBurnRate} />
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Jan – Jun {new Date().getFullYear()}
          </div>
        </motion.div>
      </div>

      {/* Resource Utilization */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.25 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-cyan-500" />
            <h3 className="text-sm font-bold">Resource Utilization</h3>
            <Badge className="bg-cyan-500/10 text-cyan-500 border-cyan-500/20 text-[10px]">
              {teamMembers.length} team members
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Briefcase className="h-3 w-3" />
            Avg. 83% allocated
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Member</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Role</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Allocation</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Hours/Week</th>
                <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2">Projects</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">No team member data available</td></tr>
              ) : teamMembers.map((member) => {
                const allocConfig = getAllocationColor(member.allocation);
                return (
                  <tr key={member.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center border border-border/30">
                          <span className="text-[9px] font-bold">{member.avatar}</span>
                        </div>
                        <span className="text-xs font-semibold">{member.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-[11px] text-muted-foreground">{member.role}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2 w-32">
                        <div className="w-full h-2 bg-muted/40 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${member.allocation}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className={cn('h-full rounded-full', allocConfig.barColor)}
                          />
                        </div>
                        <span className={cn('text-[11px] font-bold tabular-nums w-8 text-right', allocConfig.className)}>
                          {member.allocation}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-[11px] font-medium tabular-nums">{member.hoursThisWeek}h</span>
                    </td>
                    <td className="py-2.5 text-right">
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-muted/30 border-border/30">
                        {member.projectCount} projects
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Expense Categories Donut */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.3 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-pink-500" />
            <h3 className="text-sm font-bold">Expense Categories</h3>
          </div>
          <Badge variant="outline" className="text-[10px] h-5 px-2 bg-pink-500/5 text-pink-500 border-pink-500/20">
            Q{Math.ceil((new Date().getMonth() + 1) / 3)} {new Date().getFullYear()}
          </Badge>
        </div>
        <div className="flex justify-center">
          <ExpenseDonut data={expenseCategories} />
        </div>
      </motion.div>
    </div>
  );
}
