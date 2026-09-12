'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Target,
  TrendingUp,
  TrendingDown,
  Crown,
  Star,
  Download,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  User,
  ChevronRight,
  DollarSign,
  Users,
  Handshake,
  Percent,
  PieChart,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Crosshair,
  FileText,
  CalendarClock,
  Zap,
} from 'lucide-react';

/* ===== Types ===== */
type Period = 'month' | 'quarter' | 'year';

interface BenchmarkMetric {
  label: string;
  target: number;
  actual: number;
  unit: string;
  icon: React.ElementType;
  color: string;
}

interface TeamMemberRanking {
  rank: number;
  name: string;
  avatar: string;
  score: number;
  target: number;
  achievement: number;
  trend: number;
}

interface IndustryMetric {
  label: string;
  yourValue: number;
  industryAvg: number;
  unit: string;
}

interface TrendDataPoint {
  month: string;
  actual: number;
  target: number;
}

interface GoalCard {
  quarter: string;
  target: string;
  status: 'on_track' | 'at_risk' | 'behind';
  completion: number;
  description: string;
}

/* ===== Data — fetched from API ===== */
const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
];

/* ===== Loading Skeleton ===== */
function BenchmarkSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5 animate-pulse">
        <div className="h-6 bg-muted rounded w-64 mb-2" />
        <div className="h-4 bg-muted rounded w-48" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card/80 border border-border/50 rounded-2xl shadow-lg p-4 animate-pulse">
            <div className="h-32 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

/* ===== Helper: Circular Progress Ring ===== */
function CircularProgressRing({ percentage, size = 72, strokeWidth = 6, color }: { percentage: number; size?: number; strokeWidth?: number; color: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  const getRingColor = () => {
    if (percentage >= 100) return '#22c55e';
    if (percentage >= 75) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/50"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={getRingColor()}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
    </svg>
  );
}

/* ===== Helper: Donut Chart ===== */
function GoalDonutChart({ onTrack, atRisk, behind }: { onTrack: number; atRisk: number; behind: number }) {
  const total = onTrack + atRisk + behind;
  const segments = [
    { value: onTrack, color: '#22c55e' },
    { value: atRisk, color: '#f59e0b' },
    { value: behind, color: '#ef4444' },
  ];

  let cumulativePercentage = 0;
  const svgSegments = segments.map((seg) => {
    const percentage = (seg.value / total) * 100;
    const startAngle = cumulativePercentage * 3.6;
    cumulativePercentage += percentage;
    const endAngle = cumulativePercentage * 3.6;
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);
    const r = 40;
    const cx = 50;
    const cy = 50;
    const largeArcFlag = percentage > 50 ? 1 : 0;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const gap = 2;
    const innerX1 = cx + (r - gap) * Math.cos(startRad);
    const innerY1 = cy + (r - gap) * Math.sin(startRad);
    const innerX2 = cx + (r - gap) * Math.cos(endRad);
    const innerY2 = cy + (r - gap) * Math.sin(endRad);

    return {
      path: `M ${innerX1} ${innerY1} A ${r - gap} ${r - gap} 0 ${largeArcFlag} 1 ${innerX2} ${innerY2} L ${x2} ${y2} A ${r} ${r} 0 ${largeArcFlag} 0 ${x1} ${y1} Z`,
      color: seg.color,
      percentage,
    };
  });

  return (
    <div className="flex items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 100 100">
        {svgSegments.map((seg, i) => (
          <path key={i} d={seg.path} fill={seg.color} opacity={0.85} />
        ))}
        <circle cx="50" cy="50" r="28" fill="currentColor" className="text-card" />
        <text x="50" y="47" textAnchor="middle" className="fill-foreground text-[10px] font-bold" style={{ fontSize: '11px' }}>
          {total}
        </text>
        <text x="50" y="58" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: '6px' }}>
          goals
        </text>
      </svg>
    </div>
  );
}

/* ===== Helper: Trend Line Chart ===== */
function TrendLineChart({ data }: { data: TrendDataPoint[] }) {
  if (!data || data.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">No trend data available</p>;
  }
  const width = 400;
  const height = 160;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allValues = data.flatMap((d) => [d.actual, d.target]);
  const minVal = Math.min(...allValues) - 10;
  const maxVal = Math.max(...allValues) + 10;
  const range = maxVal - minVal;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
  const getY = (v: number) => padding.top + chartH - ((v - minVal) / range) * chartH;

  const actualPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.actual)}`).join(' ');
  const targetPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.target)}`).join(' ');

  const actualAreaPath = `${actualPath} L ${getX(data.length - 1)} ${padding.top + chartH} L ${getX(0)} ${padding.top + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((val) => {
        const y = getY(minVal + (range / 100) * val);
        return (
          <g key={val}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" className="text-border/30" strokeWidth="0.5" strokeDasharray="4 4" />
            <text x={padding.left - 8} y={y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: '7px' }}>
              {Math.round(minVal + (range / 100) * val)}
            </text>
          </g>
        );
      })}

      {/* Actual area fill */}
      <path d={actualAreaPath} fill="url(#areaGradient)" opacity="0.3" />
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Target line (dashed) */}
      <path d={targetPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 4" opacity="0.7" />

      {/* Actual line */}
      <path d={actualPath} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {data.map((d, i) => (
        <g key={d.month}>
          <circle cx={getX(i)} cy={getY(d.actual)} r="4" fill="#8b5cf6" stroke="white" strokeWidth="2" />
          <text x={getX(i)} y={padding.top + chartH + 16} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: '8px' }}>
            {d.month}
          </text>
          {/* Tooltip on hover via title */}
          <circle cx={getX(i)} cy={getY(d.actual)} r="12" fill="transparent">
            <title>{d.month}: Actual {d.actual} / Target {d.target}</title>
          </circle>
        </g>
      ))}

      {/* Legend */}
      <line x1={width - padding.right - 120} y1={12} x2={width - padding.right - 105} y2={12} stroke="#8b5cf6" strokeWidth="2" />
      <text x={width - padding.right - 100} y={15} className="fill-muted-foreground" style={{ fontSize: '7px' }}>Actual</text>
      <line x1={width - padding.right - 55} y1={12} x2={width - padding.right - 40} y2={12} stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />
      <text x={width - padding.right - 35} y={15} className="fill-muted-foreground" style={{ fontSize: '7px' }}>Target</text>
    </svg>
  );
}

/* ===== Main Component ===== */
export default function PerformanceBenchmark() {
  const [activePeriod, setActivePeriod] = useState<Period>('quarter');
  const [hoveredMember, setHoveredMember] = useState<string | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<{
    benchmarkMetrics: BenchmarkMetric[];
    teamRankings: TeamMemberRanking[];
    industryMetrics: IndustryMetric[];
    trendData: TrendDataPoint[];
    goalCards: GoalCard[];
  } | null>(null);
  const [benchLoading, setBenchLoading] = useState(true);
  const [benchError, setBenchError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/performance-benchmark')
      .then(r => { if (!r.ok) throw new Error('Failed to load benchmark data'); return r.json(); })
      .then(res => {
        const d = res.data;
        if (d) {
          const iconMap: Record<string, React.ElementType> = {
            'Leads Generated': Users,
            'Deals Closed': Handshake,
            'Revenue': DollarSign,
            'Conversion Rate': Percent,
          };
          const benchmarkMetrics: BenchmarkMetric[] = (d.benchmarkMetrics || []).map((m: Record<string, unknown>) => ({
            label: m.label as string || '',
            target: (m.target as number) || 0,
            actual: (m.actual as number) || 0,
            unit: (m.unit as string) || '',
            icon: iconMap[m.label as string] || Target,
            color: (m.color as string) || 'from-blue-500 to-cyan-400',
          }));
          const industryMetrics: IndustryMetric[] = (d.industryMetrics || []).map((m: Record<string, unknown>) => ({
            label: m.label as string || '',
            yourValue: (m.yourValue as number) || 0,
            industryAvg: (m.industryAvg as number) || 0,
            unit: (m.unit as string) || '',
          }));
          setBenchmarkData({
            benchmarkMetrics,
            teamRankings: [],
            industryMetrics,
            trendData: (d.trendData || []).map((t: Record<string, unknown>) => ({
              month: t.month as string || '',
              actual: (t.actual as number) || 0,
              target: (t.target as number) || 0,
            })),
            goalCards: (d.goalCards || []).map((g: Record<string, unknown>) => ({
              quarter: g.quarter as string || '',
              target: g.target as string || '',
              status: (g.status as 'on_track' | 'at_risk' | 'behind') || 'at_risk',
              completion: (g.completion as number) || 0,
              description: g.description as string || '',
            })),
          });
        }
      })
      .catch(e => setBenchError(e.message))
      .finally(() => setBenchLoading(false));
  }, []);

  const formatValue = (value: number, unit: string) => {
    if (unit === '$') {
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
      return `$${value}`;
    }
    if (unit === '%') return `${value}%`;
    if (unit === 'x') return `${value}x`;
    if (unit === 'd') return `${value}d`;
    if (unit === 'h') return `${value}h`;
    return value.toString();
  };

  const getAchievementColor = (percentage: number) => {
    if (percentage >= 100) return 'text-emerald-500';
    if (percentage >= 75) return 'text-amber-500';
    return 'text-red-500';
  };

  const getAchievementBg = (percentage: number) => {
    if (percentage >= 100) return 'bg-emerald-500/10 border-emerald-500/20';
    if (percentage >= 75) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-red-500/10 border-red-500/20';
  };

  const getStatusIcon = (status: 'on_track' | 'at_risk' | 'behind') => {
    switch (status) {
      case 'on_track': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'at_risk': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'behind': return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusLabel = (status: 'on_track' | 'at_risk' | 'behind') => {
    switch (status) {
      case 'on_track': return 'On Track';
      case 'at_risk': return 'At Risk';
      case 'behind': return 'Behind';
    }
  };

  if (benchLoading) return <BenchmarkSkeleton />;
  if (benchError) return <div className="p-6 text-destructive">Error: {benchError}</div>;
  if (!benchmarkData) return (
    <div className="space-y-6">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2.5 bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Performance Benchmarks</h2>
            <p className="text-xs text-muted-foreground">No benchmark data available yet</p>
          </div>
        </div>
      </div>
    </div>
  );

  const { benchmarkMetrics, teamRankings, industryMetrics, trendData, goalCards } = benchmarkData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Performance Benchmarks</h2>
              <p className="text-xs text-muted-foreground">Track performance against targets and industry benchmarks</p>
            </div>
          </div>
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActivePeriod(tab.key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer',
                  activePeriod === tab.key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Benchmark vs Actual Comparison */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {benchmarkMetrics.map((metric) => {
          const Icon = metric.icon;
          const achievement = Math.round((metric.actual / metric.target) * 100);
          const displayTarget = formatValue(metric.target, metric.unit);
          const displayActual = formatValue(metric.actual, metric.unit);
          return (
            <motion.div
              key={metric.label}
              variants={itemVariants}
              className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn('rounded-lg p-2 bg-gradient-to-br', metric.color, 'bg-opacity-10')}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                </div>
                <CircularProgressRing percentage={achievement} size={56} strokeWidth={5} color={metric.color} />
              </div>
              <p className="text-xs text-muted-foreground mb-1">{metric.label}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">{displayActual}</span>
                <span className="text-[10px] text-muted-foreground">/ {displayTarget}</span>
              </div>
              <div className={cn('inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full border text-[10px] font-medium', getAchievementBg(achievement), getAchievementColor(achievement))}>
                {achievement >= 100 ? <TrendingUp className="h-3 w-3" /> : achievement >= 75 ? <Minus className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {achievement}% achieved
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Team Benchmark Rankings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-bold">Team Rankings</h3>
          </div>
          <Badge className="bg-violet-500/10 text-violet-500 border-violet-500/20 text-[10px]">
            Target: 85 pts
          </Badge>
        </div>

        {teamRankings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Users className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground">No team ranking data available yet</p>
          </div>
        ) : teamRankings.map((member, index) => {
            const isTopPerformer = member.rank === 1;
            const isHovered = hoveredMember === member.name;
            return (
              <motion.div
                key={member.name}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.12 + index * 0.05 }}
                onMouseEnter={() => setHoveredMember(member.name)}
                onMouseLeave={() => setHoveredMember(null)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border transition-all duration-200',
                  isTopPerformer
                    ? 'bg-amber-500/[0.04] border-amber-500/20'
                    : isHovered
                      ? 'bg-muted/30 border-border/50'
                      : 'bg-muted/10 border-transparent'
                )}
              >
                {/* Rank */}
                <div className="w-7 text-center shrink-0">
                  {isTopPerformer ? (
                    <Crown className="h-5 w-5 text-amber-500 mx-auto" />
                  ) : (
                    <span className={cn('text-xs font-bold', member.rank <= 3 ? 'text-foreground' : 'text-muted-foreground')}>
                      #{member.rank}
                    </span>
                  )}
                </div>

                {/* Avatar */}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                  isTopPerformer
                    ? 'bg-gradient-to-br from-amber-500 to-orange-400'
                    : 'bg-gradient-to-br from-violet-500 to-purple-500'
                )}>
                  {member.avatar}
                </div>

                {/* Name & Info */}
                <div className="w-32 shrink-0">
                  <p className={cn('text-xs font-semibold truncate', isTopPerformer && 'text-amber-600')}>
                    {member.name}
                    {isTopPerformer && <Star className="h-3 w-3 inline ml-1 text-amber-500" />}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{member.score} pts</p>
                </div>

                {/* Horizontal Bar Comparison */}
                <div className="flex-1 min-w-0">
                  <div className="relative h-5 bg-muted/40 rounded-md overflow-hidden">
                    {/* Target line */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10"
                      style={{ left: `${(member.target / 100) * 100}%` }}
                      title={`Target: ${member.target}`}
                    />
                    {/* Score bar */}
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(member.score, 100)}%` }}
                      transition={{ duration: 0.6, delay: 0.2 + index * 0.06, ease: 'easeOut' }}
                      className={cn(
                        'h-full rounded-md',
                        member.achievement >= 100
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          : member.achievement >= 75
                            ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                            : 'bg-gradient-to-r from-red-500 to-rose-400'
                      )}
                    />
                  </div>
                </div>

                {/* Achievement % */}
                <div className="w-16 text-right shrink-0">
                  <p className={cn('text-xs font-bold', getAchievementColor(member.achievement))}>
                    {member.achievement}%
                  </p>
                </div>

                {/* Trend */}
                <div className="w-10 text-right shrink-0">
                  {member.trend > 0 ? (
                    <div className="flex items-center justify-end gap-0.5 text-emerald-500">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-medium">{member.trend}</span>
                    </div>
                  ) : member.trend < 0 ? (
                    <div className="flex items-center justify-end gap-0.5 text-red-500">
                      <ArrowDownRight className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-medium">{Math.abs(member.trend)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-0.5 text-muted-foreground">
                      <Minus className="h-3.5 w-3.5" />
                      <span className="text-[10px]">0</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
      </motion.div>

      {/* Industry Benchmark Comparison */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-bold">Industry Benchmark Comparison</h3>
          </div>
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]">
            SaaS Industry 2024
          </Badge>
        </div>

        <div className="space-y-4">
          {industryMetrics.map((metric) => {
            const isInverse = metric.label === 'Sales Cycle (days)' || metric.label === 'Response Time (hrs)';
            const diff = metric.yourValue - metric.industryAvg;
            const diffPct = Math.round((diff / metric.industryAvg) * 100);
            const isAbove = isInverse ? diff < 0 : diff > 0;
            const maxVal = Math.max(metric.yourValue, metric.industryAvg) * 1.2;

            return (
              <div key={metric.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium">{metric.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      You: <span className="font-bold text-foreground">{formatValue(metric.yourValue, metric.unit)}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Industry: {formatValue(metric.industryAvg, metric.unit)}
                    </span>
                    <div className={cn(
                      'flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                      isAbove ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'
                    )}>
                      {isAbove ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(diffPct)}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 h-6">
                  {/* Your bar */}
                  <div className="flex-1 flex items-center gap-1">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(metric.yourValue / maxVal) * 100}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className="h-4 rounded-md bg-gradient-to-r from-blue-500 to-cyan-400 flex items-center justify-end pr-2"
                    >
                      <span className="text-[8px] font-bold text-white">{formatValue(metric.yourValue, metric.unit)}</span>
                    </motion.div>
                  </div>
                  {/* Industry bar */}
                  <div className="flex-1 flex items-center gap-1">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(metric.industryAvg / maxVal) * 100}%` }}
                      transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
                      className="h-4 rounded-md bg-muted-foreground/20 flex items-center justify-end pr-2"
                    >
                      <span className="text-[8px] font-medium text-muted-foreground">{formatValue(metric.industryAvg, metric.unit)}</span>
                    </motion.div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Historical Trend */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.22 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-bold">Historical Trend</h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-violet-500 rounded" />
              Actual
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-amber-500 rounded" style={{ borderTop: '1px dashed', height: 0 }} />
              <div className="w-3 border-t border-dashed border-amber-500" />
              Target
            </div>
          </div>
        </div>
        <TrendLineChart data={trendData} />
      </motion.div>

      {/* Goal Progress Summary + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Goal Progress Donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.26 }}
          className="lg:col-span-1 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Goal Progress</h3>
          </div>

          <GoalDonutChart onTrack={goalCards.filter(g => g.status === 'on_track').length || 0} atRisk={goalCards.filter(g => g.status === 'at_risk').length || 0} behind={goalCards.filter(g => g.status === 'behind').length || 0} />

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              On Track
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              At Risk
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              Behind
            </div>
          </div>

          {/* Goal Cards */}
          <div className="space-y-2.5 mt-4">
            {goalCards.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No goals configured yet</p>
            ) : goalCards.map((goal) => (
              <div key={goal.quarter} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                {getStatusIcon(goal.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{goal.quarter} Target</span>
                    <Badge className={cn(
                      'text-[8px] border',
                      goal.status === 'on_track' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                      goal.status === 'at_risk' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                      'bg-red-500/10 text-red-500 border-red-500/20'
                    )}>
                      {getStatusLabel(goal.status)}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{goal.target} · {goal.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={cn('text-xs font-bold', getAchievementColor(goal.completion))}>
                    {goal.completion}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold">Quick Actions</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Set New Target */}
            <button className="group flex flex-col items-center gap-3 p-5 rounded-xl border border-border/50 bg-muted/10 hover:bg-violet-500/[0.04] hover:border-violet-500/20 transition-all duration-300 cursor-pointer">
              <div className="rounded-xl p-3 bg-violet-500/10 group-hover:bg-violet-500/20 transition-colors">
                <Target className="h-6 w-6 text-violet-500" />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold group-hover:text-violet-500 transition-colors">Set New Target</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Define new performance goals for your team</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-violet-500 transition-colors" />
            </button>

            {/* Export Report */}
            <button className="group flex flex-col items-center gap-3 p-5 rounded-xl border border-border/50 bg-muted/10 hover:bg-emerald-500/[0.04] hover:border-emerald-500/20 transition-all duration-300 cursor-pointer">
              <div className="rounded-xl p-3 bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                <Download className="h-6 w-6 text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold group-hover:text-emerald-500 transition-colors">Export Report</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Download benchmark report as PDF or CSV</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
            </button>

            {/* Schedule Review */}
            <button className="group flex flex-col items-center gap-3 p-5 rounded-xl border border-border/50 bg-muted/10 hover:bg-blue-500/[0.04] hover:border-blue-500/20 transition-all duration-300 cursor-pointer">
              <div className="rounded-xl p-3 bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
                <CalendarClock className="h-6 w-6 text-blue-500" />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold group-hover:text-blue-500 transition-colors">Schedule Review</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Book a performance review meeting</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
            </button>
          </div>

          {/* Performance Summary */}
          <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-violet-500/[0.06] to-purple-500/[0.06] border border-violet-500/10">
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold mb-1">Performance Summary</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Overall team performance is trending <span className="text-emerald-500 font-medium">above target</span> this quarter.
                  Revenue achievement needs attention.
                  Consider scheduling 1:1s with team members below target.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
