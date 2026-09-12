'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Workflow,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  ExternalLink,
  Download,
  BarChart3,
  Activity,
  Play,
  Pause,
  FileEdit,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';

/* ===== Types ===== */
type WorkflowStatus = 'active' | 'paused' | 'draft';
type Period = '7d' | '30d' | '90d' | '1y';

interface KPI {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

interface WorkflowRow {
  id: string;
  name: string;
  status: WorkflowStatus;
  triggers: number;
  successRate: number;
  avgTime: string;
  lastRun: string;
  trend: number[];
}

interface FailedExecution {
  id: string;
  workflowName: string;
  errorMessage: string;
  timestamp: string;
  retryCount: number;
}

/* ===== Data — fetched from API ===== */

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: '1y', label: '1 Year' },
];

const STATUS_CONFIG: Record<WorkflowStatus, { label: string; color: string; bg: string; border: string }> = {
  active: { label: 'Active', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  paused: { label: 'Paused', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  draft: { label: 'Draft', color: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-border/40' },
};

/* ===== Demo Data ===== */
const KPI_DATA: KPI[] = [
  { label: 'Total Executions', value: '48,210', change: '+12.4%', positive: true, icon: Activity, color: 'text-blue-500', bgColor: 'from-blue-500/20 to-blue-500/5' },
  { label: 'Success Rate', value: '96.8%', change: '+1.2%', positive: true, icon: CheckCircle2, color: 'text-emerald-500', bgColor: 'from-emerald-500/20 to-emerald-500/5' },
  { label: 'Avg Duration', value: '2.4s', change: '-0.3s', positive: true, icon: Clock, color: 'text-violet-500', bgColor: 'from-violet-500/20 to-violet-500/5' },
  { label: 'Failed Runs', value: '154', change: '+8', positive: false, icon: AlertCircle, color: 'text-red-500', bgColor: 'from-red-500/20 to-red-500/5' },
];

const EXECUTION_TREND: number[] = [
  1200, 1350, 1180, 1420, 1510, 1380, 1620, 1740, 1580, 1710, 1850, 1790, 1940, 2060, 1980, 2150, 2240, 2110, 2320, 2410, 2280, 2450, 2560, 2490, 2620, 2740, 2610, 2820, 2910, 3050,
];

const DONUT_DATA: { label: string; value: number; color: string }[] = [
  { label: 'Lead Enrichment', value: 18200, color: '#3b82f6' },
  { label: 'Email Sequences', value: 14500, color: '#10b981' },
  { label: 'CRM Sync', value: 9800, color: '#8b5cf6' },
  { label: 'Follow-up Reminders', value: 5710, color: '#f59e0b' },
];

const donutData: { label: string; value: number; color: string }[] = DONUT_DATA;

const WORKFLOWS: WorkflowRow[] = [
  { id: 'wf-001', name: 'New Lead Enrichment', status: 'active', triggers: 12480, successRate: 97, avgTime: '1.8s', lastRun: '2 min ago', trend: [320, 380, 350, 420, 460, 440, 510] },
  { id: 'wf-002', name: 'Welcome Email Sequence', status: 'active', triggers: 8930, successRate: 99, avgTime: '0.9s', lastRun: '5 min ago', trend: [210, 260, 240, 300, 280, 330, 360] },
  { id: 'wf-003', name: 'Stale Deal Nudge', status: 'paused', triggers: 4210, successRate: 91, avgTime: '3.2s', lastRun: '1 hr ago', trend: [180, 160, 170, 150, 140, 130, 120] },
  { id: 'wf-004', name: 'Invoice Sync', status: 'active', triggers: 6720, successRate: 94, avgTime: '2.1s', lastRun: '12 min ago', trend: [90, 110, 105, 130, 125, 150, 160] },
  { id: 'wf-005', name: 'Quarterly Report Builder', status: 'draft', triggers: 0, successRate: 0, avgTime: '—', lastRun: 'Never', trend: [] },
];

const TRIGGER_DATA: { label: string; count: number; maxCount: number }[] = [
  { label: 'Lead Created', count: 8420, maxCount: 8420 },
  { label: 'Form Submitted', count: 6210, maxCount: 8420 },
  { label: 'Stage Changed', count: 4890, maxCount: 8420 },
  { label: 'Email Opened', count: 3540, maxCount: 8420 },
  { label: 'Schedule (Daily)', count: 2100, maxCount: 8420 },
];

const FAILED_EXECUTIONS: FailedExecution[] = [
  { id: 'fx-001', workflowName: 'New Lead Enrichment', errorMessage: 'Enrichment API rate limit exceeded (429). Retry scheduled with backoff.', timestamp: '3 min ago', retryCount: 2 },
  { id: 'fx-002', workflowName: 'Invoice Sync', errorMessage: 'Connection to billing service timed out after 30s.', timestamp: '26 min ago', retryCount: 1 },
  { id: 'fx-003', workflowName: 'Welcome Email Sequence', errorMessage: 'Invalid recipient address: no MX record found for domain.', timestamp: '1 hr ago', retryCount: 3 },
];

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

/* ===== Helper: Build sparkline SVG path ===== */
function buildSparklinePath(data: number[], width = 80, height = 24): string {
  if (data.length < 2) return '';
  const max = Math.max(...data, 1);
  const stepX = width / (data.length - 1);
  return data
    .map((val, i) => {
      const x = i * stepX;
      const y = height - (val / max) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/* ===== Helper: Build area chart SVG ===== */
function buildAreaChart(points: number[], width = 600, height = 120): { pathD: string; areaD: string } {
  if (points.length < 2) return { pathD: '', areaD: '' };
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points.map((val, i) => ({
    x: i * stepX,
    y: height - ((val - min) / range) * (height - 10) - 5,
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;
  return { pathD, areaD };
}

/* ===== Helper: Donut chart ===== */
function buildDonutPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/* ===== Main Component ===== */
export default function WorkflowAnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>('30d');
  const [workflowStatuses, setWorkflowStatuses] = useState<Record<string, boolean>>({});

  const toggleWorkflow = (id: string) => {
    setWorkflowStatuses((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const totalExecutions = DONUT_DATA.reduce((sum, d) => sum + d.value, 0);
  const { pathD: trendLine, areaD: trendArea } = buildAreaChart(EXECUTION_TREND, 600, 120);

  // Donut segments
  const donutSegments = donutData.reduce<{ items: { startAngle: number; endAngle: number; label: string; value: number; color: string }[]; cumulative: number }>(
    (acc, d) => {
      const angle = totalExecutions > 0 ? (d.value / totalExecutions) * 360 : 0;
      const start = acc.cumulative;
      acc.cumulative += angle;
      acc.items.push({ ...d, startAngle: start, endAngle: acc.cumulative });
      return acc;
    },
    { items: [], cumulative: 0 },
  ).items;

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
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <Workflow className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Workflow Analytics</h2>
              <p className="text-xs text-muted-foreground">Automation performance & insights</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Period Toggle */}
            <div className="flex items-center bg-muted/40 rounded-lg border border-border/50 p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={cn(
                    'px-2.5 py-1.5 text-[10px] font-medium rounded-md transition-all cursor-pointer',
                    period === p.key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_DATA.length === 0 ? (
          <div className="col-span-full">
            <EmptyStateMessage icon={Workflow} message="No workflow KPI data available yet. Create workflows to track performance." />
          </div>
        ) : KPI_DATA.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.06 + idx * 0.06 }}
              className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className={cn('rounded-lg p-2 bg-gradient-to-br', kpi.bgColor)}>
                  <Icon className={cn('h-4 w-4', kpi.color)} />
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] h-5 px-1.5 border',
                    kpi.positive ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5' : 'text-red-500 border-red-500/30 bg-red-500/5'
                  )}
                >
                  {kpi.positive ? <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="h-2.5 w-2.5 mr-0.5" />}
                  {kpi.change}
                </Badge>
              </div>
              <p className="text-2xl font-bold mt-3">{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Workflow Performance Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border/30">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-500" />
            Workflow Performance
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/20">
                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Workflow</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Triggers</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Success %</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Time</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Trend</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Last Run</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Toggle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {WORKFLOWS.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyStateMessage icon={BarChart3} message="No workflows configured. Create your first workflow automation." />
                  </td>
                </tr>
              ) : WORKFLOWS.map((wf, idx) => {
                const statusCfg = STATUS_CONFIG[wf.status];
                const isEnabled = workflowStatuses[wf.id];
                const sparkPath = buildSparklinePath(wf.trend);
                const sparkColor = wf.trend[wf.trend.length - 1] >= wf.trend[0] ? '#10b981' : '#ef4444';
                return (
                  <tr key={wf.id} className={cn('transition-colors hover:bg-muted/20', idx % 2 === 1 && 'bg-muted/[0.02]')}>
                    <td className="px-5 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {wf.status === 'active' ? (
                          <Play className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : wf.status === 'paused' ? (
                          <Pause className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <FileEdit className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        {wf.name}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge className={cn('text-[9px] h-5 px-2 border', statusCfg.bg, statusCfg.color, statusCfg.border)}>
                        {statusCfg.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-muted-foreground">{wf.triggers.toLocaleString()}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn('font-medium', wf.successRate >= 95 ? 'text-emerald-500' : wf.successRate >= 90 ? 'text-amber-500' : wf.successRate > 0 ? 'text-red-500' : 'text-muted-foreground')}>
                        {wf.successRate > 0 ? `${wf.successRate}%` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-muted-foreground">{wf.avgTime}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        {sparkPath ? (
                          <svg width="80" height="24" viewBox="0 0 80 24">
                            <path d={sparkPath} fill="none" stroke={sparkColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <span className="text-muted-foreground/40 text-[10px]">No data</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-[10px] text-muted-foreground">{wf.lastRun}</td>
                    <td className="px-3 py-3 text-center">
                      {wf.status !== 'draft' ? (
                        <button
                          onClick={() => toggleWorkflow(wf.id)}
                          className={cn(
                            'relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer inline-block',
                            isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                          )}
                        >
                          <div className={cn(
                            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                            isEnabled ? 'translate-x-4' : 'translate-x-0.5'
                          )} />
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Charts Row: Execution Trend + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Area Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.36 }}
          className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Execution Trend
            </h3>
            <span className="text-[10px] text-muted-foreground">Last 30 days</span>
          </div>
          <svg viewBox="0 0 600 120" className="w-full h-auto" preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            {[0, 30, 60, 90, 120].map((y) => (
              <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="currentColor" strokeWidth="0.5" className="text-border/30" />
            ))}
            {/* Area */}
            {trendArea && <path d={trendArea} fill="url(#areaGrad)" />}
            {/* Line */}
            {trendLine && <path d={trendLine} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
            {/* Latest point */}
            {(() => {
              const last = EXECUTION_TREND[EXECUTION_TREND.length - 1];
              const max = Math.max(...EXECUTION_TREND, 1);
              const min = Math.min(...EXECUTION_TREND);
              const range = max - min || 1;
              const x = 600;
              const y = 120 - ((last - min) / range) * 110 - 5;
              return (
                <>
                  <circle cx={x} cy={y} r="3" fill="#3b82f6" />
                  <circle cx={x} cy={y} r="6" fill="#3b82f6" opacity="0.2" />
                </>
              );
            })()}
          </svg>
          <div className="flex items-center justify-between mt-2 text-[9px] text-muted-foreground/60 px-1">
            <span>Jan 1</span>
            <span>Jan 8</span>
            <span>Jan 15</span>
            <span>Jan 22</span>
            <span>Jan 30</span>
          </div>
        </motion.div>

        {/* Donut Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            Distribution
          </h3>
          <div className="flex items-center justify-center mb-4">
            <svg viewBox="0 0 140 140" className="w-36 h-36">
              {donutSegments.map((seg, i) => (
                <path
                  key={i}
                  d={buildDonutPath(70, 70, 50, seg.startAngle, seg.endAngle)}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="20"
                  strokeLinecap="butt"
                  opacity="0.85"
                />
              ))}
              <text x="70" y="66" textAnchor="middle" className="text-[16px] font-bold fill-foreground">
                {totalExecutions.toLocaleString()}
              </text>
              <text x="70" y="80" textAnchor="middle" className="text-[8px] fill-muted-foreground">
                total
              </text>
            </svg>
          </div>
          <div className="space-y-2">
            {DONUT_DATA.map((d) => (
              <div key={d.label} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground">{d.label}</span>
                </div>
                <span className="font-medium">{d.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Top Triggers + Failed Executions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Triggers Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.44 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-amber-500" />
            Top Triggers
          </h3>
          <div className="space-y-3">
            {TRIGGER_DATA.map((trigger) => {
              const pct = (trigger.count / trigger.maxCount) * 100;
              return (
                <div key={trigger.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-foreground">{trigger.label}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{trigger.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Failed Executions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.48 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <AlertCircle className="h-4 w-4 text-red-500" />
            Recent Failures
          </h3>
          <div className="space-y-3">
            {FAILED_EXECUTIONS.length === 0 ? (
              <EmptyStateMessage icon={CheckCircle2} message="No recent failures. All executions completed successfully." />
            ) : FAILED_EXECUTIONS.map((failure) => (
              <div key={failure.id} className="p-3 rounded-xl border border-red-500/20 bg-red-500/[0.03]">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className="text-xs font-semibold text-red-500">{failure.workflowName}</h4>
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap">{failure.timestamp}</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">{failure.errorMessage}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground/60">
                    Retried {failure.retryCount} time{failure.retryCount > 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[9px] gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Retry
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.52 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-0.5">Quick Actions</h3>
            <p className="text-[10px] text-muted-foreground">Manage your workflow automations</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="text-xs gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0 text-white shadow-md">
              <Plus className="h-3.5 w-3.5" />
              Create Workflow
            </Button>
            <Button variant="outline" size="sm" className="text-xs gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              View All
            </Button>
            <Button variant="outline" size="sm" className="text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export Report
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
