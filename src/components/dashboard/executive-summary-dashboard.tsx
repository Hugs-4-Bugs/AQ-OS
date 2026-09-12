'use client';

import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  FileText,
  ArrowRight,
  Clock,
  DollarSign,
  Target,
  Users,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
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
interface HealthFactor {
  label: string;
  score: number;
  trend: 'up' | 'down' | 'neutral';
}

interface RiskItem {
  id: string;
  message: string;
  severity: 'High' | 'Medium' | 'Low';
}

interface Milestone {
  id: string;
  title: string;
  date: string;
  type: 'deal' | 'review' | 'deadline';
}

interface ExecutiveSummaryData {
  portfolioScore: number;
  healthFactors: HealthFactor[];
  currentRevenue: number;
  revenueTarget: number;
  yoyGrowth: number;
  revenueTrend: { month: string; revenue: number }[];
  activeDeals: number;
  pipelineValue: number;
  stageDistribution: { stage: string; count: number; color: string }[];
  avgDealSize: number;
  avgDaysToClose: number;
  risks: RiskItem[];
  milestones: Milestone[];
}

/* ===== Data (fetched from API) ===== */
const EMPTY_DATA: ExecutiveSummaryData = {
  portfolioScore: 0,
  healthFactors: [],
  currentRevenue: 0,
  revenueTarget: 0,
  yoyGrowth: 0,
  revenueTrend: [],
  activeDeals: 0,
  pipelineValue: 0,
  stageDistribution: [],
  avgDealSize: 0,
  avgDaysToClose: 0,
  risks: [],
  milestones: [],
};

/* ===== Utility Functions ===== */
function getScoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function getScoreBg(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function getScoreStroke(score: number): string {
  if (score >= 70) return '#10b981';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function getSeverityClasses(severity: 'High' | 'Medium' | 'Low'): string {
  switch (severity) {
    case 'High':
      return 'bg-red-500/15 text-red-500 border-red-500/25 border';
    case 'Medium':
      return 'bg-amber-500/15 text-amber-500 border-amber-500/25 border';
    case 'Low':
      return 'bg-sky-500/15 text-sky-500 border-sky-500/25 border';
  }
}

function getMilestoneIcon(type: 'deal' | 'review' | 'deadline') {
  switch (type) {
    case 'deal':
      return Target;
    case 'review':
      return Users;
    case 'deadline':
      return Calendar;
  }
}

/* ===== Semi-Circular Gauge ===== */
function PortfolioGauge({ score }: { score: number }) {
  const radius = 70;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center">
      <svg width={180} height={100} viewBox="0 0 180 100" className="overflow-visible">
        {/* Background arc */}
        <path
          d={`M ${20} 90 A ${radius} ${radius} 0 0 1 ${160} 90`}
          fill="none"
          stroke="currentColor"
          strokeWidth={14}
          strokeLinecap="round"
          className="text-muted/30"
        />
        {/* Color zone arcs - red */}
        <path
          d={`M ${20} 90 A ${radius} ${radius} 0 0 1 ${20 + circumference * (40 / 100)} 90`}
          fill="none"
          stroke="#ef4444"
          strokeWidth={14}
          strokeLinecap="round"
          opacity={0.15}
        />
        {/* Color zone arcs - amber */}
        <path
          d={`M ${20 + circumference * (40 / 100) - 14} 90 A ${radius} ${radius} 0 0 1 ${20 + circumference * (70 / 100)} 90`}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={14}
          strokeLinecap="round"
          opacity={0.15}
        />
        {/* Value arc */}
        <motion.path
          d={`M ${20} 90 A ${radius} ${radius} 0 0 1 ${160} 90`}
          fill="none"
          stroke={getScoreStroke(score)}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute top-8 flex flex-col items-center">
        <motion.span
          className={cn('text-3xl font-extrabold tabular-nums', getScoreColor(score))}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {score}
        </motion.span>
        <span className="text-[10px] text-muted-foreground font-medium">/ 100</span>
      </div>
    </div>
  );
}

/* ===== Health Factor Mini Bar ===== */
function HealthFactorBar({ factor }: { factor: HealthFactor }) {
  const TrendIcon = factor.trend === 'up' ? TrendingUp : factor.trend === 'down' ? TrendingDown : TrendingUp;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground truncate">{factor.label}</span>
          <div className="flex items-center gap-1">
            <TrendIcon className={cn(
              'h-3 w-3',
              factor.trend === 'up' ? 'text-emerald-500' : factor.trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
            )} />
            <span className={cn('text-xs font-bold tabular-nums', getScoreColor(factor.score))}>
              {factor.score}
            </span>
          </div>
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <motion.div
            className={cn('h-full rounded-full', getScoreBg(factor.score))}
            initial={{ width: 0 }}
            animate={{ width: `${factor.score}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          />
        </div>
      </div>
    </div>
  );
}

/* ===== Main Component ===== */
export default function ExecutiveSummaryDashboard() {
  const data = EMPTY_DATA;
  const revenuePercent = data.revenueTarget > 0 ? Math.round((data.currentRevenue / data.revenueTarget) * 100) : 0;
  const lastUpdated = '';

  const hasData = data.activeDeals > 0 || data.revenueTrend.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20 rounded-2xl overflow-hidden">
        {/* Header */}
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
                <div className="rounded-lg p-1.5 bg-purple-500/10">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </div>
                Executive Summary
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Last updated: {lastUpdated}
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
              <FileText className="h-3.5 w-3.5" />
              Generate Report
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Top Row: Portfolio Health + Revenue Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Portfolio Health Score */}
            <div className="flex flex-col items-center p-4 rounded-xl bg-gradient-to-br from-purple-500/5 to-transparent border border-purple-500/10">
              <PortfolioGauge score={data.portfolioScore} />
              <span className="text-sm font-semibold mt-1">Portfolio Health Score</span>
              <div className="w-full space-y-3 mt-4">
                {data.healthFactors.map((factor) => (
                  <HealthFactorBar key={factor.label} factor={factor} />
                ))}
              </div>
            </div>

            {/* Revenue Overview */}
            <div className="space-y-4 p-4 rounded-xl bg-gradient-to-br from-emerald-500/5 to-transparent border border-emerald-500/10">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold">Revenue Overview</span>
              </div>

              <div>
                <div className="flex items-end gap-2">
                  <motion.span
                    className="text-2xl font-extrabold tabular-nums"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    ${(data.currentRevenue / 1000000).toFixed(2)}M
                  </motion.span>
                  <span className="text-xs text-muted-foreground mb-1">
                    of ${(data.revenueTarget / 1000000).toFixed(1)}M target
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={cn(
                    'text-[10px] px-1.5 py-0 h-5 border',
                    revenuePercent >= 80
                      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25'
                      : 'bg-amber-500/15 text-amber-500 border-amber-500/25'
                  )}>
                    {revenuePercent}% of target
                  </Badge>
                  <Badge className="text-[10px] px-1.5 py-0 h-5 bg-emerald-500/15 text-emerald-500 border-emerald-500/25 border">
                    <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                    {data.yoyGrowth}% YoY
                  </Badge>
                </div>
              </div>

              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="execRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v / 1000}k`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0,0,0,0.85)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#fff',
                      }}
                      formatter={(value: number) => [`$${(value / 1000).toFixed(0)}k`, 'Revenue']}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#execRevenueGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <Separator className="opacity-50" />

          {/* Active Deals Summary */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-semibold">Active Deals Summary</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Active Deals</p>
                <p className="text-lg font-bold tabular-nums">{data.activeDeals}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Pipeline Value</p>
                <p className="text-lg font-bold tabular-nums">${(data.pipelineValue / 1000000).toFixed(1)}M</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Avg Deal Size</p>
                <p className="text-lg font-bold tabular-nums">${(data.avgDealSize / 1000).toFixed(0)}k</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Avg Days to Close</p>
                <p className="text-lg font-bold tabular-nums">{data.avgDaysToClose}d</p>
              </div>
            </div>

            {/* Stage Distribution Horizontal Bars */}
            <div className="space-y-2">
              {data.stageDistribution.map((stage) => (
                <div key={stage.stage} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-24 text-muted-foreground shrink-0">{stage.stage}</span>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: stage.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(stage.count / data.activeDeals) * 100}%` }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                    />
                  </div>
                  <span className="text-xs font-bold tabular-nums w-6 text-right">{stage.count}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator className="opacity-50" />

          {/* Bottom Row: Risks + Milestones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Key Risk Items */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold">Key Risk Items</span>
              </div>
              <div className="space-y-2">
                {data.risks.map((risk) => (
                  <motion.div
                    key={risk.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/10"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-tight">{risk.message}</p>
                    </div>
                    <Badge className={cn('text-[9px] px-1.5 py-0 h-4 shrink-0', getSeverityClasses(risk.severity))}>
                      {risk.severity}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Upcoming Milestones */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-semibold">Upcoming Milestones</span>
              </div>
              <div className="space-y-2">
                {data.milestones.map((milestone) => {
                  const Icon = getMilestoneIcon(milestone.type);
                  return (
                    <motion.div
                      key={milestone.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
                    >
                      <div className="rounded-lg p-1.5 bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                        <Icon className="h-3.5 w-3.5 text-purple-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{milestone.title}</p>
                      </div>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0 text-muted-foreground">
                        {milestone.date}
                      </Badge>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
