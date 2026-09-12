'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Wrench,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  XCircle,
  Sparkles,
  Activity,
  BarChart3,
  RefreshCw,
  Zap,
  Info,
  ChevronRight,
} from 'lucide-react';

/* ===== Types ===== */
type Severity = 'critical' | 'high' | 'medium' | 'low';

interface QualityDimension {
  id: string;
  name: string;
  score: number;
  color: string;
  gradient: string;
  trend: 'up' | 'down' | 'stable';
}

interface DataIssue {
  id: string;
  fieldName: string;
  issueType: string;
  affectedRecords: number;
  severity: Severity;
  fixAction: string;
}

interface EnrichmentSuggestion {
  id: string;
  fieldName: string;
  suggestion: string;
  potentialImpact: number;
  icon: React.ElementType;
}

interface QualityTrendPoint {
  day: number;
  score: number;
}

interface DataQualityData {
  overallScore: number;
  qualityDimensions: QualityDimension[];
  issueSummary: { severity: Severity; count: number; color: string; bg: string; border: string }[];
  donutData: { severity: string; count: number; color: string }[];
  topIssues: DataIssue[];
  enrichmentSuggestions: EnrichmentSuggestion[];
  qualityTrend: QualityTrendPoint[];
}

/* ===== Animation Variants ===== */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ===== Circular Gauge Component ===== */
function QualityGauge({ score }: { score: number }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;
  const centerX = 90;
  const centerY = 90;

  useEffect(() => {
    const duration = 1200;
    const startTime = performance.now();
    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(score * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [score]);

  const scoreColor = score >= 90 ? '#10b981' : score >= 80 ? '#3b82f6' : score >= 70 ? '#f59e0b' : '#ef4444';
  const scoreLabel = score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 70 ? 'Fair' : 'Needs Work';

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="180" viewBox="0 0 180 180" className="transform -rotate-90">
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <filter id="gaugeGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Background track */}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-muted/30"
        />
        {/* Score arc */}
        <motion.circle
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          filter="url(#gaugeGlow)"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: 180, height: 180 }}>
        <span className="text-3xl font-extrabold tabular-nums" style={{ color: scoreColor }}>
          {animatedScore}
        </span>
        <span className="text-[10px] text-muted-foreground font-medium">out of 100</span>
      </div>
      <div className="mt-2">
        <Badge className={cn('text-[10px] px-2', score >= 90 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : score >= 80 ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20')}>
          {scoreLabel}
        </Badge>
      </div>
    </div>
  );
}

/* ===== Donut Chart Component ===== */
function SeverityDonut({ data }: { data: { severity: string; count: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const centerX = 60;
  const centerY = 60;
  const radius = 40;
  const innerRadius = 28;

  const segments = useMemo(() => {
    let angle = 0;
    return data.map((segment) => {
      const startAngle = angle;
      const segmentAngle = (segment.count / total) * 360;
      angle += segmentAngle;
      return { ...segment, startAngle, segmentAngle };
    });
  }, [data, total]);

  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {segments.map((segment, index) => {
          const { startAngle, segmentAngle } = segment;

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

          return (
            <motion.path
              key={segment.severity}
              d={pathData}
              fill={segment.color}
              opacity={0.85}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 0.85, scale: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            />
          );
        })}
        <text x={centerX} y={centerY - 4} textAnchor="middle" className="fill-foreground text-sm font-bold">
          {total}
        </text>
        <text x={centerX} y={centerY + 10} textAnchor="middle" className="fill-muted-foreground text-[8px]">
          issues
        </text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {data.map((segment) => (
          <div key={segment.severity} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: segment.color }} />
            <span className="text-[10px] text-muted-foreground w-16">{segment.severity}</span>
            <span className="text-[10px] font-bold tabular-nums">{segment.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Quality Trend Mini Chart ===== */
function QualityTrendChart({ data }: { data: QualityTrendPoint[] }) {
  const width = 320;
  const height = 80;
  const padding = { top: 10, right: 10, bottom: 10, left: 30 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const minScore = Math.min(...data.map((d) => d.score)) - 2;
  const maxScore = Math.max(...data.map((d) => d.score)) + 2;

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartWidth,
    y: padding.top + chartHeight - ((d.score - minScore) / (maxScore - minScore)) * chartHeight,
    score: d.score,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[75, 80, 85, 90].map((val) => {
        const y = padding.top + chartHeight - ((val - minScore) / (maxScore - minScore)) * chartHeight;
        return (
          <g key={val}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" strokeWidth="0.5" className="text-border" />
            <text x={padding.left - 4} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[7px]">
              {val}
            </text>
          </g>
        );
      })}
      {/* Area fill */}
      <path d={areaPath} fill="url(#trendGradient)" />
      {/* Line */}
      <motion.path
        d={linePath}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
      {/* Last point */}
      <motion.circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="3"
        fill="#3b82f6"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1, duration: 0.3 }}
      />
    </svg>
  );
}

/* ===== Progress Bar Component ===== */
function DimensionProgressBar({ dimension, index }: { dimension: QualityDimension; index: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0">
        <p className="text-xs font-medium truncate">{dimension.name}</p>
      </div>
      <div className="flex-1">
        <div className="w-full h-2.5 bg-muted/40 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${dimension.score}%` }}
            transition={{ duration: 0.8, delay: 0.2 + index * 0.08, ease: 'easeOut' }}
            className={cn('h-full rounded-full bg-gradient-to-r', dimension.gradient)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 w-20 justify-end">
        <span className="text-xs font-bold tabular-nums">{dimension.score}%</span>
        {dimension.trend === 'up' && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
        {dimension.trend === 'down' && <ArrowDownRight className="h-3 w-3 text-red-400" />}
        {dimension.trend === 'stable' && <span className="w-3 h-3 rounded-full bg-muted-foreground/30" />}
      </div>
    </div>
  );
}

/* ===== Severity Badge Component ===== */
function SeverityBadge({ severity }: { severity: Severity }) {
  const config = {
    critical: { label: 'Critical', className: 'bg-red-500/10 text-red-500 border-red-500/20' },
    high: { label: 'High', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
    medium: { label: 'Medium', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    low: { label: 'Low', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  };
  const c = config[severity];
  return <Badge className={cn('text-[9px] h-5 px-1.5 border', c.className)}>{c.label}</Badge>;
}

/* ===== Loading Skeleton ===== */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-5 w-48 mb-1" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5 flex flex-col items-center">
          <Skeleton className="h-4 w-32 mb-4" />
          <Skeleton className="h-[180px] w-[180px] rounded-full" />
        </div>
        <div className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
          <Skeleton className="h-4 w-36 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Main Component ===== */
export default function DataQualityDashboard() {
  const [data, setData] = useState<DataQualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [auditProgress, setAuditProgress] = useState(0);
  const auditIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoFixTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/data-quality')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Cleanup intervals and timers on unmount
  useEffect(() => {
    return () => {
      if (auditIntervalRef.current) {
        clearInterval(auditIntervalRef.current);
        auditIntervalRef.current = null;
      }
      if (autoFixTimerRef.current) {
        clearTimeout(autoFixTimerRef.current);
        autoFixTimerRef.current = null;
      }
    };
  }, []);

  const handleRunAudit = () => {
    // Clear any existing interval
    if (auditIntervalRef.current) {
      clearInterval(auditIntervalRef.current);
    }
    setIsAuditing(true);
    setAuditProgress(0);
    auditIntervalRef.current = setInterval(() => {
      setAuditProgress((prev) => {
        if (prev >= 100) {
          if (auditIntervalRef.current) {
            clearInterval(auditIntervalRef.current);
            auditIntervalRef.current = null;
          }
          setIsAuditing(false);
          return 100;
        }
        return prev + 8;
      });
    }, 300);
  };

  const handleAutoFix = () => {
    setIsAutoFixing(true);
    autoFixTimerRef.current = setTimeout(() => setIsAutoFixing(false), 2000);
  };

  if (loading) return <DashboardSkeleton />;

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Data Quality Dashboard</h2>
                <p className="text-xs text-muted-foreground">No data quality data available</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const qualityDimensions = data.qualityDimensions ?? [];
  const issueSummary = data.issueSummary ?? [];
  const donutData = data.donutData ?? [];
  const topIssues = data.topIssues ?? [];
  const enrichmentSuggestions = data.enrichmentSuggestions ?? [];
  const qualityTrend = data.qualityTrend ?? [];
  const totalIssues = issueSummary.reduce((sum, item) => sum + item.count, 0);

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
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Data Quality Dashboard</h2>
              <p className="text-xs text-muted-foreground">Monitor and improve your data integrity</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              onClick={handleAutoFix}
              disabled={isAutoFixing}
            >
              {isAutoFixing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              {isAutoFixing ? 'Fixing...' : 'Auto-Fix Issues'}
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 hover:shadow-lg hover:shadow-emerald-500/20"
              onClick={handleRunAudit}
              disabled={isAuditing}
            >
              {isAuditing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Activity className="h-3.5 w-3.5" />
              )}
              {isAuditing ? `Running... ${Math.min(Math.round(auditProgress), 100)}%` : 'Run Full Audit'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Main Score + Dimensions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overall Score */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5 flex flex-col items-center justify-center"
        >
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Overall Quality Score</h3>
          <div className="relative">
            <QualityGauge score={data.overallScore ?? 0} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
              <ArrowUpRight className="h-2.5 w-2.5 mr-1" />
              Quality tracked
            </Badge>
          </div>
        </motion.div>

        {/* Quality Dimensions */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-bold">Quality Dimensions</h3>
          </div>
          {qualityDimensions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <BarChart3 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">No quality dimensions available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {qualityDimensions.map((dimension, index) => (
                <DimensionProgressBar key={dimension.id} dimension={dimension} index={index} />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Issues Summary + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Issue Summary Cards */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-bold">Issues Summary</h3>
            </div>
            <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">
              {totalIssues} total issues
            </Badge>
          </div>
          {issueSummary.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">No issue data available</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {issueSummary.map((item) => (
                <motion.div
                  key={item.severity}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-xl border cursor-default',
                    item.bg, item.border
                  )}
                >
                  <span className={cn('text-2xl font-extrabold tabular-nums', item.color)}>{item.count}</span>
                  <span className={cn('text-[10px] font-medium capitalize', item.color)}>{item.severity}</span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Donut Chart */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="h-4 w-4 text-rose-500" />
            <h3 className="text-sm font-bold">Issue Breakdown</h3>
          </div>
          {donutData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">No issue breakdown available</p>
            </div>
          ) : (
            <div className="flex justify-center">
              <SeverityDonut data={donutData} />
            </div>
          )}
        </motion.div>
      </div>

      {/* Top Issues Table */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.25 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-bold">Top Data Issues</h3>
          </div>
          <Badge variant="outline" className="text-[10px] h-5 px-2 bg-red-500/5 text-red-500 border-red-500/20">
            Priority order
          </Badge>
        </div>
        {topIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <XCircle className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No data issues found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Field</th>
                  <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Issue Type</th>
                  <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Records</th>
                  <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Severity</th>
                  <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {topIssues.map((issue) => (
                  <tr key={issue.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 pr-4">
                      <code className="text-xs font-mono text-violet-500 bg-violet-500/5 px-1.5 py-0.5 rounded">{issue.fieldName}</code>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs text-muted-foreground">{issue.issueType}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs font-bold tabular-nums">{issue.affectedRecords.toLocaleString()}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <SeverityBadge severity={issue.severity} />
                    </td>
                    <td className="py-2.5 text-right">
                      <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 text-violet-500 hover:text-violet-600 hover:bg-violet-500/10">
                        <Wrench className="h-3 w-3 mr-1" />
                        {issue.fixAction}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Enrichment Suggestions + Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrichment Suggestions */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold">Data Enrichment Suggestions</h3>
          </div>
          {enrichmentSuggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Sparkles className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">No enrichment suggestions available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {enrichmentSuggestions.map((suggestion) => {
                const Icon = suggestion.icon;
                return (
                  <div key={suggestion.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/30 hover:border-violet-500/20 hover:bg-accent/20 transition-all duration-200 group">
                    <div className="rounded-lg p-2 bg-violet-500/10 shrink-0 group-hover:scale-110 transition-transform">
                      <Icon className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{suggestion.fieldName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{suggestion.suggestion}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] h-4 px-1.5">
                        +{suggestion.potentialImpact}%
                      </Badge>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-violet-500 transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Quality Trend */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.35 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-bold">Quality Trend</h3>
            </div>
            <Badge variant="outline" className="text-[10px] h-5 px-2 bg-blue-500/5 text-blue-500 border-blue-500/20">
              Last 30 days
            </Badge>
          </div>
          {qualityTrend.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">No trend data available</p>
            </div>
          ) : (
            <>
              <QualityTrendChart data={qualityTrend} />
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Info className="h-3 w-3" />
                  Quality score over time
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] h-4 px-1.5">
                  <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                  Tracked
                </Badge>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
