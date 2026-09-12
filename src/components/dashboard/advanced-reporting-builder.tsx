'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  LineChart,
  PieChart as PieChartIcon,
  AreaChart as AreaChartIcon,
  ScatterChart as ScatterIcon,
  Table2,
  Save,
  Download,
  Calendar,
  ChevronDown,
  Check,
  Database,
  FileBarChart,
  Clock,
  Mail,
  Users,
  Target,
  DollarSign,
  TrendingUp,
  Percent,
  Activity,
  Timer,
  Star,
  Briefcase,
  Zap,
  Settings,
} from 'lucide-react';

/* ===== Types ===== */
type ReportType = 'pipeline' | 'revenue' | 'conversion' | 'team' | 'custom';
type DataSource = 'pipeline' | 'crm' | 'financial';
type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'table';
type DateRange = 'week' | 'month' | 'quarter' | 'year' | 'custom';

interface MetricOption {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
}

interface RecentReport {
  id: string;
  name: string;
  type: ReportType;
  lastRun: string;
  status: 'Ready' | 'Running' | 'Failed';
}

/* ===== Constants ===== */
const REPORT_TYPES: { key: ReportType; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'pipeline', label: 'Pipeline Report', icon: Briefcase, color: 'text-sky-500' },
  { key: 'revenue', label: 'Revenue Analysis', icon: DollarSign, color: 'text-emerald-500' },
  { key: 'conversion', label: 'Lead Conversion', icon: TrendingUp, color: 'text-violet-500' },
  { key: 'team', label: 'Team Performance', icon: Users, color: 'text-amber-500' },
  { key: 'custom', label: 'Custom Report', icon: Settings, color: 'text-muted-foreground' },
];

const DATA_SOURCES: { key: DataSource; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'pipeline', label: 'Pipeline Data', icon: Target, color: 'text-sky-500' },
  { key: 'crm', label: 'CRM Data', icon: Users, color: 'text-emerald-500' },
  { key: 'financial', label: 'Financial Data', icon: DollarSign, color: 'text-amber-500' },
];

const CHART_TYPES: { key: ChartType; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'bar', label: 'Bar', icon: BarChart3, color: 'text-sky-500' },
  { key: 'line', label: 'Line', icon: LineChart, color: 'text-emerald-500' },
  { key: 'pie', label: 'Pie', icon: PieChartIcon, color: 'text-violet-500' },
  { key: 'area', label: 'Area', icon: AreaChartIcon, color: 'text-amber-500' },
  { key: 'scatter', label: 'Scatter', icon: ScatterIcon, color: 'text-rose-500' },
  { key: 'table', label: 'Table', icon: Table2, color: 'text-muted-foreground' },
];

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

const METRICS: MetricOption[] = [
  { id: 'revenue', label: 'Revenue', icon: DollarSign, color: 'text-emerald-500' },
  { id: 'deals', label: 'Deals', icon: Briefcase, color: 'text-sky-500' },
  { id: 'leads', label: 'Leads', icon: Users, color: 'text-violet-500' },
  { id: 'conversion_rate', label: 'Conversion Rate', icon: Percent, color: 'text-amber-500' },
  { id: 'avg_deal_size', label: 'Avg Deal Size', icon: Target, color: 'text-rose-500' },
  { id: 'win_rate', label: 'Win Rate', icon: Star, color: 'text-yellow-500' },
  { id: 'pipeline_value', label: 'Pipeline Value', icon: TrendingUp, color: 'text-cyan-500' },
  { id: 'activity_count', label: 'Activity Count', icon: Activity, color: 'text-orange-500' },
  { id: 'response_time', label: 'Response Time', icon: Timer, color: 'text-teal-500' },
  { id: 'nps_score', label: 'NPS Score', icon: Zap, color: 'text-pink-500' },
];

const DEFAULT_RECENT_REPORTS: RecentReport[] = [];

const STATUS_CONFIG = {
  Ready: { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  Running: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  Failed: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

/* ===== CSS Animation Keyframes ===== */
const animationStyles = `
@keyframes rptFadeSlideIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes rptBarGrow {
  from { height: 0; }
}
@keyframes rptPieRotate {
  from { stroke-dashoffset: 200; }
}
@keyframes rptDotPop {
  from { opacity: 0; transform: scale(0); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes rptLineDraw {
  from { stroke-dashoffset: 300; }
}
.rpt-animate-in { animation: rptFadeSlideIn 0.5s ease-out both; }
.rpt-animate-delay-1 { animation: rptFadeSlideIn 0.5s ease-out 0.1s both; }
.rpt-animate-delay-2 { animation: rptFadeSlideIn 0.5s ease-out 0.2s both; }
.rpt-animate-delay-3 { animation: rptFadeSlideIn 0.5s ease-out 0.3s both; }
.rpt-bar-grow { animation: rptBarGrow 0.8s ease-out both; }
.rpt-pie-anim { animation: rptPieRotate 1s ease-out both; }
.rpt-dot-pop { animation: rptDotPop 0.4s ease-out both; }
.rpt-line-draw { animation: rptLineDraw 1s ease-out both; stroke-dasharray: 300; }
`;

/* ===== Chart Preview Components ===== */
function BarChartPreview() {
  const bars = [65, 42, 78, 55, 88, 35, 72, 48, 92, 60];
  return (
    <div className="flex items-end gap-2 h-full px-4 pb-4 pt-2">
      {bars.map((val, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-md bg-sky-500/70 hover:bg-sky-500 transition-colors duration-200 rpt-bar-grow cursor-pointer min-w-0"
          style={{ height: `${val}%`, animationDelay: `${i * 0.05}s` }}
          title={`${val}%`}
        />
      ))}
    </div>
  );
}

function LineChartPreview() {
  const points = [20, 35, 25, 50, 40, 65, 55, 70, 60, 80];
  const width = 280;
  const height = 120;
  const stepX = width / (points.length - 1);
  const maxY = Math.max(...points);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${height - (p / maxY) * (height - 20)}`).join(' ');
  const areaD = pathD + ` L ${(points.length - 1) * stepX} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full p-4">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#lineGrad)" className="transition-opacity duration-500" />
      <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rpt-line-draw" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={i * stepX}
          cy={height - (p / maxY) * (height - 20)}
          r="3"
          fill="#10b981"
          className="rpt-dot-pop"
          style={{ animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </svg>
  );
}

function PieChartPreview() {
  const segments = [
    { pct: 35, color: '#3b82f6' },
    { pct: 25, color: '#10b981' },
    { pct: 20, color: '#f59e0b' },
    { pct: 12, color: '#8b5cf6' },
    { pct: 8, color: '#ec4899' },
  ];
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex items-center justify-center h-full p-4">
      <svg width="100" height="100" viewBox="0 0 100 100">
        {segments.map((seg) => {
          const dash = (seg.pct / 100) * circumference;
          const gap = circumference - dash;
          const offset = -cumulative * (circumference / 100);
          cumulative += seg.pct;
          return (
            <circle
              key={seg.color}
              cx="50" cy="50" r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="16"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
              className="rpt-pie-anim transition-all duration-700"
              opacity={0.85}
            />
          );
        })}
        <text x="50" y="48" textAnchor="middle" className="fill-foreground" fontSize="11" fontWeight="bold">100%</text>
        <text x="50" y="60" textAnchor="middle" className="fill-muted-foreground" fontSize="7">Total</text>
      </svg>
    </div>
  );
}

function AreaChartPreview() {
  const points = [15, 30, 22, 45, 38, 60, 52, 68, 58, 75];
  const width = 280;
  const height = 120;
  const stepX = width / (points.length - 1);
  const maxY = Math.max(...points);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${height - (p / maxY) * (height - 20)}`).join(' ');
  const areaD = pathD + ` L ${(points.length - 1) * stepX} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full p-4">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#areaGrad)" className="transition-opacity duration-500" />
      <path d={pathD} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rpt-line-draw" />
    </svg>
  );
}

function ScatterChartPreview() {
  const dots = [
    { x: 20, y: 70 }, { x: 35, y: 45 }, { x: 55, y: 80 }, { x: 70, y: 30 },
    { x: 85, y: 60 }, { x: 45, y: 50 }, { x: 60, y: 25 }, { x: 30, y: 65 },
    { x: 75, y: 55 }, { x: 90, y: 40 }, { x: 15, y: 35 }, { x: 50, y: 75 },
  ];
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full p-4">
      {dots.map((dot, i) => (
        <circle
          key={i}
          cx={dot.x}
          cy={dot.y}
          r="2.5"
          fill="#ec4899"
          opacity={0.7}
          className="rpt-dot-pop hover:opacity-100 hover:r-3 transition-all cursor-pointer"
          style={{ animationDelay: `${i * 0.06}s` }}
        />
      ))}
      {/* Axes */}
      <line x1="10" y1="90" x2="95" y2="90" stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/30" />
      <line x1="10" y1="10" x2="10" y2="90" stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/30" />
    </svg>
  );
}

function TableChartPreview() {
  const rows = [
    ['Metric', 'Value', 'Change'],
    ['Revenue', '$245K', '+12%'],
    ['Deals', '34', '+8%'],
    ['Leads', '128', '+15%'],
    ['Win Rate', '67%', '+5%'],
  ];
  return (
    <div className="h-full flex items-center justify-center p-3">
      <table className="w-full text-[9px] border-collapse">
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className={rowIdx === 0 ? 'border-b border-border/30' : 'border-b border-border/10'}>
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  className={cn(
                    'px-3 py-1.5',
                    rowIdx === 0 ? 'font-semibold text-muted-foreground' : '',
                    cellIdx === 2 && rowIdx > 0 ? 'text-emerald-500' : ''
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CHART_PREVIEWS: Record<ChartType, React.FC> = {
  bar: BarChartPreview,
  line: LineChartPreview,
  pie: PieChartPreview,
  area: AreaChartPreview,
  scatter: ScatterChartPreview,
  table: TableChartPreview,
};

/* ===== Main Component ===== */
export default function AdvancedReportingBuilder() {
  const [reportType, setReportType] = useState<ReportType>('pipeline');
  const [dataSource, setDataSource] = useState<DataSource>('pipeline');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['revenue', 'deals', 'leads']);
  const [mounted, setMounted] = useState(false);
  const [showReportDropdown, setShowReportDropdown] = useState(false);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [recentReports, setRecentReports] = useState<RecentReport[]>(DEFAULT_RECENT_REPORTS);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    fetch('/api/dashboard/reports')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => {
        if (d.recentReports) setRecentReports(d.recentReports);
        if (d.reportTypes) { /* could override REPORT_TYPES if API provides them */ }
        if (d.metrics) { /* could override METRICS if API provides them */ }
      })
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const toggleMetric = useCallback((id: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }, []);

  const currentReportType = REPORT_TYPES.find((r) => r.key === reportType);
  const currentSource = DATA_SOURCES.find((s) => s.key === dataSource);
  const ChartPreviewComponent = CHART_PREVIEWS[chartType];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-6', mounted ? 'rpt-animate-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-violet-500 to-purple-600">
                  <FileBarChart className="h-4 w-4 text-white" />
                </div>
                Advanced Reporting Builder
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1.5"
                  onClick={() => showToast('Report saved successfully!')}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Report
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1.5"
                  onClick={() => showToast('Report exported as PDF', 'info')}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
                <Button
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={() => showToast('Report scheduled for weekly delivery', 'info')}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Schedule
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Configuration Panel */}
          <div className={cn('lg:col-span-4 space-y-4', mounted ? 'rpt-animate-delay-1' : 'opacity-0')}>
            {/* Report Type Selector */}
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <FileBarChart className="h-4 w-4 text-violet-500" />
                  Report Type
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {REPORT_TYPES.map((rt) => {
                  const Icon = rt.icon;
                  const isActive = reportType === rt.key;
                  return (
                    <button
                      key={rt.key}
                      onClick={() => setReportType(rt.key)}
                      className={cn(
                        'w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer',
                        isActive
                          ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border/30 hover:border-border/50 hover:bg-muted/20'
                      )}
                    >
                      <div className={cn('rounded-md p-1.5', isActive ? 'bg-primary/10' : 'bg-muted/40')}>
                        <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                      </div>
                      <span className={cn('text-xs font-semibold flex-1', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                        {rt.label}
                      </span>
                      {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Data Source */}
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Database className="h-4 w-4 text-sky-500" />
                  Data Source
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1.5">
                  {DATA_SOURCES.map((ds) => {
                    const Icon = ds.icon;
                    const isActive = dataSource === ds.key;
                    return (
                      <button
                        key={ds.key}
                        onClick={() => setDataSource(ds.key)}
                        className={cn(
                          'flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer',
                          isActive
                            ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                            : 'border-border/30 hover:border-border/50 hover:bg-muted/20'
                        )}
                      >
                        <Icon className={cn('h-4 w-4', isActive ? ds.color : 'text-muted-foreground')} />
                        <span className={cn('text-xs font-semibold flex-1', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                          {ds.label}
                        </span>
                        {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Date Range */}
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-amber-500" />
                  Date Range
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {DATE_RANGES.map((dr) => (
                    <button
                      key={dr.key}
                      onClick={() => setDateRange(dr.key)}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 cursor-pointer',
                        dateRange === dr.key
                          ? 'border-primary/50 bg-primary/5 text-foreground ring-1 ring-primary/20'
                          : 'border-border/30 text-muted-foreground hover:border-border/50 hover:bg-muted/20'
                      )}
                    >
                      {dr.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel: Chart + Metrics */}
          <div className={cn('lg:col-span-8 space-y-4', mounted ? 'rpt-animate-delay-2' : 'opacity-0')}>
            {/* Chart Type Selector + Preview */}
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    Preview
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] h-5">{currentReportType?.label}</Badge>
                    <Badge variant="outline" className="text-[10px] h-5">{currentSource?.label}</Badge>
                  </div>
                </div>
                {/* Chart type visual selector */}
                <div className="flex gap-1.5 mt-2">
                  {CHART_TYPES.map((ct) => {
                    const Icon = ct.icon;
                    const isActive = chartType === ct.key;
                    return (
                      <button
                        key={ct.key}
                        onClick={() => setChartType(ct.key)}
                        className={cn(
                          'flex flex-col items-center gap-1 p-2 rounded-lg border transition-all duration-200 cursor-pointer flex-1',
                          isActive
                            ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                            : 'border-border/30 hover:border-border/50 hover:bg-muted/20'
                        )}
                      >
                        <Icon className={cn('h-4 w-4', isActive ? ct.color : 'text-muted-foreground')} />
                        <span className={cn('text-[9px] font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}>{ct.label}</span>
                      </button>
                    );
                  })}
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-border/30 bg-muted/10 h-48 w-full overflow-hidden">
                  <ChartPreviewComponent />
                </div>
              </CardContent>
            </Card>

            {/* Metrics Selection */}
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Target className="h-4 w-4 text-rose-500" />
                    Metrics Selection
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {selectedMetrics.length} selected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {METRICS.map((metric) => {
                    const Icon = metric.icon;
                    const isSelected = selectedMetrics.includes(metric.id);
                    return (
                      <button
                        key={metric.id}
                        onClick={() => toggleMetric(metric.id)}
                        className={cn(
                          'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer',
                          isSelected
                            ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                            : 'border-border/30 hover:border-border/50 hover:bg-muted/20'
                        )}
                      >
                        <div className={cn(
                          'rounded-md p-1 transition-colors',
                          isSelected ? 'bg-primary/10' : 'bg-muted/40'
                        )}>
                          <Icon className={cn('h-3.5 w-3.5', isSelected ? metric.color : 'text-muted-foreground')} />
                        </div>
                        <span className={cn('text-[10px] font-semibold leading-tight', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                          {metric.label}
                        </span>
                        {isSelected && <Check className="h-3 w-3 text-primary ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Reports */}
        <Card className={cn('glass-card overflow-hidden', mounted ? 'rpt-animate-delay-3' : 'opacity-0')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dataLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                </div>
              ) : recentReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Clock className="h-5 w-5 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">No recent reports</p>
                </div>
              ) : recentReports.map((report) => {
                const reportConfig = REPORT_TYPES.find((r) => r.key === report.type);
                const statusConfig = STATUS_CONFIG[report.status];
                const Icon = reportConfig?.icon ?? FileBarChart;
                return (
                  <div
                    key={report.id}
                    className="group flex items-center gap-3 p-3 rounded-lg border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 cursor-pointer"
                  >
                    <div className={cn('rounded-md p-2 bg-muted/40 group-hover:bg-primary/10 transition-colors')}>
                      <Icon className={cn('h-4 w-4', reportConfig?.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate group-hover:text-primary transition-colors">{report.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{reportConfig?.label}</span>
                        <span className="text-border">•</span>
                        <span>{report.lastRun}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('text-[9px] h-5 shrink-0', statusConfig.color, statusConfig.bg, statusConfig.border)}>
                      {report.status}
                    </Badge>
                    <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      Run
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Toast notification */}
        {toast && (
          <div
            className={cn(
              'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-md rpt-animate-in',
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400'
            )}
          >
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
