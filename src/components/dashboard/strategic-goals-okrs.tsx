'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Plus,
  Edit3,
  Eye,
  BarChart3,
  Shield,
  Users,
  Lightbulb,
  ArrowRight,
  Building2,
  UserCircle,
  Zap,
  CircleDot,
  Globe,
  AlertOctagon,
} from 'lucide-react';

/* ===== Types ===== */
type KRStatus = 'on_track' | 'at_risk' | 'behind';
type RiskSeverity = 'high' | 'medium' | 'low';

interface KeyResult {
  id: string;
  title: string;
  current: number;
  target: number;
  unit: string;
  status: KRStatus;
  progress: number;
}

interface StrategicGoal {
  id: string;
  title: string;
  progress: number;
  icon: React.ElementType;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  objective: string;
  keyResults: KeyResult[];
}

interface AlignmentItem {
  level: string;
  label: string;
  icon: React.ElementType;
  items: string[];
}

interface RiskItem {
  id: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  mitigation: string;
  icon: React.ElementType;
}

/* ===== Animation Variants ===== */
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ===== Empty State ===== */
function EmptyStateMessage({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-muted/20 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

/* ===== KR Status Badge ===== */
function KRStatusBadge({ status }: { status: KRStatus }) {
  const config = {
    on_track: { label: 'On Track', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', dotClass: 'bg-emerald-500' },
    at_risk: { label: 'At Risk', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dotClass: 'bg-amber-500' },
    behind: { label: 'Behind', className: 'bg-red-500/10 text-red-500 border-red-500/20', dotClass: 'bg-red-500' },
  };
  const c = config[status];
  return (
    <Badge className={cn('text-[8px] h-4 px-1.5 border flex items-center gap-1', c.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dotClass)} />
      {c.label}
    </Badge>
  );
}

/* ===== Risk Severity Badge ===== */
function RiskSeverityBadge({ severity }: { severity: RiskSeverity }) {
  const config = {
    high: { className: 'bg-red-500/10 text-red-500 border-red-500/20', dotClass: 'bg-red-500', label: 'High' },
    medium: { className: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dotClass: 'bg-amber-500', label: 'Medium' },
    low: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', dotClass: 'bg-blue-500', label: 'Low' },
  };
  const c = config[severity];
  return (
    <Badge className={cn('text-[8px] h-4 px-1.5 border flex items-center gap-1', c.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dotClass)} />
      {c.label}
    </Badge>
  );
}

/* ===== Progress Bar with Animation ===== */
function AnimatedProgressBar({
  progress,
  color,
  delay,
}: {
  progress: number;
  color: string;
  delay?: number;
}) {
  return (
    <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(progress, 100)}%` }}
        transition={{ duration: 0.8, delay: delay ?? 0, ease: 'easeOut' }}
        className={cn('h-full rounded-full', color)}
      />
    </div>
  );
}

/* ===== Quarterly Comparison SVG Chart ===== */
function QuarterlyComparisonChart({ data }: { data: { quarter: string; goals: number[] }[] }) {
  if (!data.length) {
    return <EmptyStateMessage icon={BarChart3} message="No quarterly comparison data available yet" />;
  }
  const svgWidth = 520;
  const svgHeight = 220;
  const padding = { top: 30, right: 20, bottom: 40, left: 50 };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = svgHeight - padding.top - padding.bottom;
  const goalNames = ['Revenue', 'Market', 'Retention', 'Innovation'];
  const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'];
  const quarterColors = ['#94a3b8', '#60a5fa', '#a78bfa'];
  const groupWidth = chartW / goalNames.length;
  const barWidth = 20;
  const barGap = 4;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        <defs>
          {quarterColors.map((color, i) => (
            <linearGradient key={i} id={`qGrad${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.9" />
              <stop offset="100%" stopColor={color} stopOpacity="0.5" />
            </linearGradient>
          ))}
        </defs>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(val => {
          const y = padding.top + chartH - (val / 100) * chartH;
          return (
            <g key={val}>
              <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize="9">{val}%</text>
            </g>
          );
        })}
        {/* Bars */}
        {data.map((qData, qi) => {
          return qData.goals.map((val, gi) => {
            const groupX = padding.left + gi * groupWidth;
            const barsInGroup = data.length;
            const totalBarsWidth = barsInGroup * barWidth + (barsInGroup - 1) * barGap;
            const startX = groupX + (groupWidth - totalBarsWidth) / 2;
            const barX = startX + qi * (barWidth + barGap);
            const barH = (val / 100) * chartH;
            const barY = padding.top + chartH - barH;
            return (
              <motion.rect
                key={`q${qi}-g${gi}`}
                x={barX}
                y={barY}
                width={barWidth}
                height={barH}
                rx={4}
                fill={`url(#qGrad${qi})`}
                initial={{ height: 0, y: padding.top + chartH }}
                animate={{ height: barH, y: barY }}
                transition={{ duration: 0.6, delay: (qi * 4 + gi) * 0.05 }}
              />
            );
          });
        })}
        {/* Goal labels */}
        {goalNames.map((name, gi) => {
          const x = padding.left + gi * groupWidth + groupWidth / 2;
          return (
            <text key={name} x={x} y={svgHeight - 10} textAnchor="middle" className="fill-muted-foreground" fontSize="10" fontWeight="500">
              {name}
            </text>
          );
        })}
        {/* Quarter legend */}
        {data.map((q, qi) => {
          const x = padding.left + qi * 60;
          return (
            <g key={q.quarter}>
              <rect x={x} y={4} width={10} height={10} rx={2} fill={quarterColors[qi]} />
              <text x={x + 14} y={12} className="fill-muted-foreground" fontSize="9">{q.quarter}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ===== Goal Alignment Cascading View ===== */
function GoalAlignmentView({ data }: { data: AlignmentItem[] }) {
  if (!data.length) {
    return <EmptyStateMessage icon={Shield} message="No alignment data configured yet" />;
  }
  return (
    <div className="space-y-4">
      {data.map((level, levelIndex) => {
        const LevelIcon = level.icon;
        return (
          <motion.div
            key={level.level}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: levelIndex * 0.1 }}
          >
            <div className="flex items-start gap-3">
              {/* Connector */}
              <div className="flex flex-col items-center pt-1">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                  level.level === 'company' ? 'bg-emerald-500/10 border-emerald-500/20' :
                  level.level === 'team' ? 'bg-blue-500/10 border-blue-500/20' :
                  'bg-violet-500/10 border-violet-500/20'
                )}>
                  <LevelIcon className={cn(
                    'h-4 w-4',
                    level.level === 'company' ? 'text-emerald-500' :
                    level.level === 'team' ? 'text-blue-500' :
                    'text-violet-500'
                  )} />
                </div>
                {levelIndex < data.length - 1 && (
                  <div className="w-px flex-1 bg-border/30 min-h-[20px] mt-2" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold capitalize">{level.label}</span>
                  <Badge className={cn(
                    'text-[8px] h-4 px-1.5 border',
                    level.level === 'company' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                    level.level === 'team' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                    'bg-violet-500/10 text-violet-500 border-violet-500/20'
                  )}>
                    {level.items.length} goals
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {level.items.map((item, itemIndex) => (
                    <motion.div
                      key={itemIndex}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: levelIndex * 0.1 + itemIndex * 0.05 }}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/10 border border-border/20"
                    >
                      <CircleDot className={cn(
                        'h-3 w-3 shrink-0',
                        level.level === 'company' ? 'text-emerald-500' :
                        level.level === 'team' ? 'text-blue-500' :
                        'text-violet-500'
                      )} />
                      <span className="text-[11px] text-muted-foreground">{item}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/30 ml-auto shrink-0" />
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ===== Main Component ===== */
export default function StrategicGoalsOKRs() {
  const [goals] = useState<StrategicGoal[]>([]);
  const [alignment] = useState<AlignmentItem[]>([]);
  const [risks] = useState<RiskItem[]>([]);
  const [quarterlyData] = useState<{ quarter: string; goals: number[] }[]>([]);
  const [expandedGoalId, setExpandedGoalId] = useState<string>('');
  const [showAlignment, setShowAlignment] = useState(false);
  const [showChart, setShowChart] = useState(true);

  const expandedGoal = goals.find(g => g.id === expandedGoalId);

  const getProgressColor = (progress: number) => {
    if (progress >= 75) return 'bg-emerald-500';
    if (progress >= 50) return 'bg-blue-500';
    if (progress >= 30) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const getProgressTextColor = (progress: number) => {
    if (progress >= 75) return 'text-emerald-500';
    if (progress >= 50) return 'text-blue-500';
    if (progress >= 30) return 'text-amber-500';
    return 'text-red-500';
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
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-violet-500 to-pink-600 shadow-lg shadow-violet-500/20">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Strategic Goals & OKRs</h2>
              <p className="text-xs text-muted-foreground">Track company objectives, key results, and strategic alignment</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Goal
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1.5 bg-gradient-to-r from-violet-500 to-pink-500 text-white border-0 hover:shadow-lg hover:shadow-violet-500/20"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Update Progress
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
            >
              <Eye className="h-3.5 w-3.5" />
              View All OKRs
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {goals.length === 0 ? (
          <div className="col-span-full">
            <EmptyStateMessage icon={Target} message="No strategic goals defined yet. Click 'Add Goal' to get started." />
          </div>
        ) : goals.map((goal, i) => {
          const GoalIcon = goal.icon;
          const isExpanded = expandedGoalId === goal.id;
          return (
            <motion.div
              key={goal.id}
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.02, y: -2 }}
              onClick={() => setExpandedGoalId(isExpanded ? '' : goal.id)}
              className={cn(
                'bg-card/80 backdrop-blur-xl border rounded-2xl shadow-lg p-5 cursor-pointer transition-all',
                isExpanded ? 'border-blue-500/40 shadow-blue-500/5 ring-1 ring-blue-500/20' : 'border-border/50 hover:border-border/70'
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={cn('rounded-xl p-2 bg-gradient-to-br shadow-md', goal.gradientFrom, goal.gradientTo)}>
                  <GoalIcon className="h-4 w-4 text-white" />
                </div>
                <div className="flex items-center gap-1">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
              <h3 className="text-sm font-bold mb-1">{goal.title}</h3>
              <div className="flex items-end gap-1 mb-3">
                <span className={cn('text-2xl font-extrabold tabular-nums', getProgressTextColor(goal.progress))}>{goal.progress}%</span>
                <span className="text-[10px] text-muted-foreground mb-1">complete</span>
              </div>
              <AnimatedProgressBar progress={goal.progress} color={getProgressColor(goal.progress)} delay={i * 0.05} />
              <div className="mt-3 flex items-center justify-between">
                <Badge className={cn(
                  'text-[8px] h-4 px-1.5',
                  goal.progress >= 75 ? 'bg-emerald-500/10 text-emerald-500' :
                  goal.progress >= 50 ? 'bg-blue-500/10 text-blue-500' :
                  goal.progress >= 30 ? 'bg-amber-500/10 text-amber-500' :
                  'bg-red-500/10 text-red-500'
                )}>
                  {goal.progress >= 75 ? 'On Track' : goal.progress >= 50 ? 'Progressing' : 'Needs Attention'}
                </Badge>
                <span className="text-[9px] text-muted-foreground">{goal.keyResults.length} KRs</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* OKR Details + Alignment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* OKR Details Panel */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 space-y-6"
        >
          {/* Expanded OKR */}
          {expandedGoal && (
            <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Target className={cn('h-4 w-4', expandedGoal.color)} />
                  <h3 className="text-sm font-bold">OKR Details</h3>
                  <Badge className={cn(
                    'text-[9px] h-4 px-1.5 border',
                    expandedGoal.color === 'text-emerald-500' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                    expandedGoal.color === 'text-blue-500' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                    expandedGoal.color === 'text-violet-500' ? 'bg-violet-500/10 text-violet-500 border-violet-500/20' :
                    'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  )}>
                    {expandedGoal.title}
                  </Badge>
                </div>
              </div>

              {/* Objective */}
              <div className="mb-5 p-4 rounded-xl bg-muted/10 border border-border/20">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className={cn('h-3.5 w-3.5', expandedGoal.color)} />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Objective</span>
                </div>
                <p className="text-sm font-bold">{expandedGoal.objective}</p>
              </div>

              {/* Key Results */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Key Results</span>
                </div>
                {expandedGoal.keyResults.map((kr, krIndex) => (
                  <motion.div
                    key={kr.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: krIndex * 0.08 }}
                    className="p-4 rounded-xl border border-border/20 bg-background/50 hover:border-border/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground">KR{krIndex + 1}</span>
                        <span className="text-xs font-semibold">{kr.title}</span>
                      </div>
                      <KRStatusBadge status={kr.status} />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <AnimatedProgressBar
                          progress={kr.progress}
                          color={getProgressColor(kr.progress)}
                          delay={krIndex * 0.08 + 0.2}
                        />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={cn('text-sm font-bold tabular-nums', getProgressTextColor(kr.progress))}>
                          {kr.current}
                        </span>
                        <span className="text-[10px] text-muted-foreground">/ {kr.target} {kr.unit}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Quarterly Progress Comparison */}
          <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-bold">Quarterly Progress</h3>
                <Badge className="text-[9px] h-4 px-1.5 bg-blue-500/10 text-blue-500 border-blue-500/20">
                  Q1 → Q2 → Q3
                </Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-[10px] h-6 px-2 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 gap-1"
                onClick={() => setShowChart(!showChart)}
              >
                {showChart ? 'Hide' : 'Show'} Chart
              </Button>
            </div>
            <AnimatePresence>
              {showChart && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <QuarterlyComparisonChart data={quarterlyData} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Sidebar: Alignment + Risks */}
        <div className="space-y-6">
          {/* Goal Alignment */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.25 }}
            className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-violet-500" />
                <h3 className="text-sm font-bold">Goal Alignment</h3>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-[10px] h-6 px-2 text-violet-500 hover:text-violet-600 hover:bg-violet-500/10 gap-1"
                onClick={() => setShowAlignment(!showAlignment)}
              >
                {showAlignment ? 'Collapse' : 'Expand'}
              </Button>
            </div>
            <AnimatePresence>
              {showAlignment ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <GoalAlignmentView data={alignment} />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="space-y-2">
                    {alignment.length === 0 ? (
                      <EmptyStateMessage icon={Shield} message="No alignment levels configured" />
                    ) : alignment.map(level => {
                      const LevelIcon = level.icon;
                      return (
                        <div key={level.level} className="flex items-center gap-2 p-2 rounded-lg bg-muted/10 border border-border/20">
                          <LevelIcon className={cn(
                            'h-3.5 w-3.5',
                            level.level === 'company' ? 'text-emerald-500' :
                            level.level === 'team' ? 'text-blue-500' :
                            'text-violet-500'
                          )} />
                          <span className="text-[11px] font-semibold capitalize">{level.label}</span>
                          <Badge className="text-[8px] h-3 px-1 ml-auto bg-muted/30 border-border/30">{level.items.length}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Risk Items */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
            className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-bold">Risks & Mitigations</h3>
                <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">
                  {risks.length} items
                </Badge>
              </div>
            </div>
            <div className="space-y-3">
              {risks.length === 0 ? (
                <EmptyStateMessage icon={AlertTriangle} message="No risks identified. Add risks to track mitigations." />
              ) : risks.map((risk, riskIndex) => {
                const RiskIcon = risk.icon;
                return (
                  <motion.div
                    key={risk.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: riskIndex * 0.08 + 0.3 }}
                    className={cn(
                      'p-3.5 rounded-xl border transition-colors',
                      risk.severity === 'high' ? 'bg-red-500/5 border-red-500/15' :
                      risk.severity === 'medium' ? 'bg-amber-500/5 border-amber-500/15' :
                      'bg-blue-500/5 border-blue-500/15'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn(
                        'rounded-lg p-1.5 shrink-0',
                        risk.severity === 'high' ? 'bg-red-500/10' :
                        risk.severity === 'medium' ? 'bg-amber-500/10' :
                        'bg-blue-500/10'
                      )}>
                        <RiskIcon className={cn(
                          'h-3.5 w-3.5',
                          risk.severity === 'high' ? 'text-red-500' :
                          risk.severity === 'medium' ? 'text-amber-500' :
                          'text-blue-500'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold truncate">{risk.title}</span>
                          <RiskSeverityBadge severity={risk.severity} />
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">{risk.description}</p>
                    <div className="p-2 rounded-lg bg-muted/10 border border-border/15">
                      <div className="flex items-center gap-1 mb-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span className="text-[9px] font-semibold text-emerald-500">Mitigation</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground leading-relaxed">{risk.mitigation}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
