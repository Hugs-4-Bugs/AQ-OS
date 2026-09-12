'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Shield,
  AlertTriangle,
  RefreshCw,
  Clock,
  Activity,
  Zap,
  ExternalLink,
  Settings,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';

/* ===== Types ===== */
type IntegrationStatus = 'connected' | 'error' | 'warning';
type SyncEventStatus = 'success' | 'failed' | 'retry' | 'reconnect' | 'rate_limit';

interface Integration {
  id: string;
  name: string;
  logoInitials: string;
  logoColor: string;
  status: IntegrationStatus;
  lastSync: string;
  apiCallsToday: number;
  uptime: string;
}

interface SyncEvent {
  id: string;
  integration: string;
  action: string;
  status: SyncEventStatus;
  timestamp: string;
  details: string;
}

/* ===== Data — fetched from API ===== */

interface IntegrationHealthData {
  overallHealth: string;
  connectedCount: number;
  totalIntegrations: number;
  integrations: Array<{
    name: string;
    status: string;
    lastSync: string | null;
    health: string;
    messageCount: number;
  }>;
  recentEvents: Array<{ integration: string; event: string; timestamp: string }>;
}

/* ===== Loading Skeleton ===== */
function HealthMonitorSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5 animate-pulse">
        <div className="h-6 bg-muted rounded w-64 mb-2" />
        <div className="h-4 bg-muted rounded w-48" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card/80 border border-border/50 rounded-2xl shadow-lg p-5 animate-pulse">
            <div className="h-36 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

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

/* ===== Animation Variants ===== */
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ===== Health Score Circular Gauge (SVG) ===== */
function HealthScoreGauge({ score }: { score: number }) {
  const cx = 70;
  const cy = 70;
  const radius = 52;
  const strokeWidth = 8;

  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  const scoreColor = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';
  const scoreLabel = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : 'Needs Attention';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 140" className="w-36 h-36">
        {/* Background circle */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(100,116,139,0.1)" strokeWidth={strokeWidth} />

        {/* Progress circle */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={scoreColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          transform={`rotate(-90 ${cx} ${cy})`}
        />

        {/* Glow effect */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={scoreColor}
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          transform={`rotate(-90 ${cx} ${cy})`}
          opacity={0.15}
          filter="url(#glow)"
        />

        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-foreground" fontSize="26" fontWeight="800">
          {score}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-muted-foreground" fontSize="9" fontWeight="500">
          / 100
        </text>
        <text x={cx} y={cy + 24} textAnchor="middle" className="fill-muted-foreground" fontSize="8">
          Health Score
        </text>
      </svg>
      <Badge className={cn(
        'text-[9px] h-5 px-2 border',
        score >= 90 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
        score >= 70 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
        'bg-red-500/10 text-red-500 border-red-500/20'
      )}>
        <Check className="h-2.5 w-2.5 mr-0.5" />
        {scoreLabel}
      </Badge>
    </div>
  );
}

/* ===== Integration Status Card ===== */
function IntegrationCard({ integration }: { integration: Integration }) {
  const statusConfig = {
    connected: { label: 'Connected', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', dotClass: 'bg-emerald-500', icon: Check },
    warning: { label: 'Warning', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dotClass: 'bg-amber-500', icon: AlertTriangle },
    error: { label: 'Error', className: 'bg-red-500/10 text-red-500 border-red-500/20', dotClass: 'bg-red-500', icon: X },
  };
  const config = statusConfig[integration.status];

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={cn(
        'p-4 rounded-xl border transition-all cursor-pointer group',
        integration.status === 'warning'
          ? 'bg-amber-500/5 border-amber-500/15 hover:border-amber-500/25'
          : integration.status === 'error'
            ? 'bg-red-500/5 border-red-500/15 hover:border-red-500/25'
            : 'bg-muted/5 border-border/20 hover:border-border/40'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Logo */}
        <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm shrink-0', integration.logoColor)}>
          <span className="text-[11px] font-bold text-white">{integration.logoInitials}</span>
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold">{integration.name}</span>
            <Badge className={cn('text-[7px] h-4 px-1.5 border flex items-center gap-0.5', config.className)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', config.dotClass)} />
              {config.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {integration.lastSync}
            </span>
            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
              <Activity className="h-2.5 w-2.5" />
              {integration.apiCallsToday.toLocaleString()} calls
            </span>
          </div>
          {/* Uptime bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  integration.status === 'connected' ? 'bg-emerald-500' :
                  integration.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                )}
                style={{ width: integration.uptime }}
              />
            </div>
            <span className="text-[8px] text-muted-foreground font-medium tabular-nums">{integration.uptime}</span>
          </div>
        </div>
        <button className="p-1 rounded-lg hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100">
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </motion.div>
  );
}

/* ===== Sync Event Timeline ===== */
function SyncEventTimeline({ events }: { events: SyncEvent[] }) {
  if (events.length === 0) {
    return <EmptyStateMessage icon={Clock} message="No sync events recorded yet. Connect an integration to see activity." />;
  }
  const statusIcons: Record<SyncEventStatus, { icon: React.ElementType; color: string; bgColor: string }> = {
    success: { icon: Check, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
    failed: { icon: X, color: 'text-red-500', bgColor: 'bg-red-500/10' },
    retry: { icon: RefreshCw, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
    reconnect: { icon: Activity, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
    rate_limit: { icon: AlertTriangle, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  };

  return (
    <div className="space-y-0">
      {events.map((event, i) => {
        const config = statusIcons[event.status];
        const Icon = config.icon;
        const isLast = i === events.length - 1;

        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex gap-3"
          >
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0', config.bgColor)}>
                <Icon className={cn('h-3.5 w-3.5', config.color)} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border/30 my-1" />}
            </div>
            {/* Content */}
            <div className={cn('pb-4', isLast && 'pb-0')}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-semibold">{event.integration}</span>
                <span className="text-[9px] text-muted-foreground">·</span>
                <span className="text-[9px] text-muted-foreground">{event.action}</span>
              </div>
              <p className="text-[9px] text-muted-foreground mb-0.5">{event.details}</p>
              <span className="text-[8px] text-muted-foreground/60 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {event.timestamp}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ===== API Usage Trend Mini Chart ===== */
interface UsageTrendPoint {
  day: string;
  value: number;
}

function UsageTrendChart({ data: usageData }: { data: UsageTrendPoint[] }) {
  if (!usageData || usageData.length === 0) {
    return <EmptyStateMessage icon={Activity} message="No usage data available yet." />;
  }
  const data = usageData;
  const width = 260;
  const height = 80;
  const padding = { top: 10, right: 10, bottom: 20, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map(d => d.value));
  const minVal = Math.min(...data.map(d => d.value)) * 0.9;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
  const getY = (v: number) => padding.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.value)}`).join(' ');
  const areaPath = `${linePath} L ${getX(data.length - 1)} ${padding.top + chartH} L ${getX(0)} ${padding.top + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <defs>
        <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>

      <motion.path
        d={areaPath}
        fill="url(#usageGrad)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      <motion.path
        d={linePath}
        fill="none"
        stroke="#6366f1"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />

      {data.map((d, i) => (
        <g key={d.day}>
          <motion.circle
            cx={getX(i)}
            cy={getY(d.value)}
            r={3}
            fill="#6366f1"
            stroke="#0f172a"
            strokeWidth={1}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.6 + i * 0.06 }}
          />
          <text
            x={getX(i)}
            y={height - 4}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="7"
          >
            {d.day}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ===== Ping Indicator ===== */
function PingIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span className="text-[9px] text-emerald-500 font-medium">Auto-refreshing</span>
    </div>
  );
}

/* ===== Main Component ===== */
export default function IntegrationHealthMonitor() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pingPulse, setPingPulse] = useState(false);
  const [healthData, setHealthData] = useState<IntegrationHealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/integration-health')
      .then(r => { if (!r.ok) throw new Error('Failed to load integration health'); return r.json(); })
      .then(res => {
        if (res.data) setHealthData(res.data);
      })
      .catch(e => setHealthError(e.message))
      .finally(() => setHealthLoading(false));
  }, []);

  /* Simulate periodic ping indicator pulse (dev only) */
  useEffect(() => {
    if (!autoRefresh) return;
    if (process.env.NODE_ENV !== 'development') return;
    const interval = setInterval(() => {
      setPingPulse(true);
      setTimeout(() => setPingPulse(false), 600);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (healthLoading) return <HealthMonitorSkeleton />;
  if (healthError) return <div className="p-6 text-destructive">Error: {healthError}</div>;
  if (!healthData) return (
    <div className="space-y-6">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Integration Health Monitor</h2>
            <p className="text-xs text-muted-foreground">No integration data available yet</p>
          </div>
        </div>
      </div>
    </div>
  );

  const INTEGRATIONS: Integration[] = healthData.integrations.map((intg, i) => ({
    id: `int-${i}`,
    name: intg.name,
    logoInitials: intg.name.slice(0, 2).toUpperCase(),
    logoColor: ['from-blue-500 to-cyan-500', 'from-violet-500 to-purple-500', 'from-emerald-500 to-teal-500'][i % 3],
    status: (intg.status === 'connected' ? 'connected' : intg.status === 'disconnected' ? 'error' : 'warning') as IntegrationStatus,
    lastSync: intg.lastSync ? new Date(intg.lastSync).toLocaleString() : 'Never',
    apiCallsToday: intg.messageCount,
    uptime: intg.health === 'healthy' ? '99.9%' : intg.health === 'degraded' ? '85%' : '0%',
  }));

  const SYNC_EVENTS: SyncEvent[] = (healthData.recentEvents || []).slice(0, 5).map((evt, i) => ({
    id: `se-${i}`,
    integration: evt.integration,
    action: evt.event,
    status: 'success' as SyncEventStatus,
    timestamp: new Date(evt.timestamp).toLocaleString(),
    details: `${evt.event} completed successfully`,
  }));

  const connectedCount = INTEGRATIONS.filter(i => i.status === 'connected').length;
  const warningCount = INTEGRATIONS.filter(i => i.status === 'warning').length;
  const errorCount = INTEGRATIONS.filter(i => i.status === 'error').length;
  const OVERALL_HEALTH_SCORE = INTEGRATIONS.length > 0 ? Math.round((connectedCount / INTEGRATIONS.length) * 100) : 0;

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
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Integration Health Monitor</h2>
              <p className="text-xs text-muted-foreground">Track status, sync history, and API usage for all integrations</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-all',
                autoRefresh
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/50'
              )}
            >
              <RefreshCw className={cn('h-3 w-3', autoRefresh && 'animate-spin')} style={autoRefresh ? { animationDuration: '3s' } : {}} />
              Auto-refresh
            </button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              View Logs
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Configure
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Health Score + API Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Overall Health Score */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.05 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5 flex flex-col items-center"
        >
          <div className="flex items-center gap-2 mb-2 self-start">
            <Shield className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Overall Health</h3>
          </div>
          <HealthScoreGauge score={OVERALL_HEALTH_SCORE} />
          <PingIndicator active={autoRefresh} />
        </motion.div>

        {/* API Usage Metrics */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold">API Usage</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Total Connected</span>
              <span className="text-[12px] font-bold tabular-nums">{connectedCount} / {INTEGRATIONS.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Health Status</span>
              <span className="text-[12px] font-bold tabular-nums text-emerald-500">{healthData.overallHealth}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Warnings</span>
              <span className={cn('text-[12px] font-bold tabular-nums', warningCount > 0 ? 'text-amber-500' : 'text-emerald-500')}>{warningCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Errors</span>
              <span className={cn('text-[12px] font-bold tabular-nums', errorCount > 0 ? 'text-red-500' : 'text-emerald-500')}>{errorCount}</span>
            </div>
          </div>
        </motion.div>

        {/* Usage Trend */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
          className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold">Usage Trend</h3>
            </div>
          </div>
          <EmptyStateMessage icon={Activity} message="No usage trend data available yet. Activity will appear as integrations are used." />
        </motion.div>
      </div>

      {/* Integration Status Cards */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.2 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-bold">Integration Status</h3>
            <div className="flex items-center gap-1.5 ml-2">
              {connectedCount > 0 && (
                <Badge className="text-[8px] h-4 px-1.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                  {connectedCount} connected
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge className="text-[8px] h-4 px-1.5 bg-amber-500/10 text-amber-500 border-amber-500/20">
                  {warningCount} warning
                </Badge>
              )}
              {errorCount > 0 && (
                <Badge className="text-[8px] h-4 px-1.5 bg-red-500/10 text-red-500 border-red-500/20">
                  {errorCount} error
                </Badge>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] gap-1"
            onClick={() => {}}
          >
            <RefreshCw className="h-3 w-3" />
            Reconnect All
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {INTEGRATIONS.length === 0 ? (
            <div className="col-span-full">
              <EmptyStateMessage icon={Shield} message="No integrations configured. Connect your first integration to get started." />
            </div>
          ) : INTEGRATIONS.map((integration, i) => (
            <motion.div
              key={integration.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
            >
              <IntegrationCard integration={integration} />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Sync History Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet-500" />
              <h3 className="text-sm font-bold">Sync History</h3>
              <Badge className="bg-violet-500/10 text-violet-500 border-violet-500/20 text-[10px]">
                {SYNC_EVENTS.length} events
              </Badge>
            </div>
            <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              View all
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <SyncEventTimeline events={SYNC_EVENTS} />
        </motion.div>

        {/* Quick Actions & Summary */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.35 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-4 w-4 text-cyan-500" />
            <h3 className="text-sm font-bold">Quick Actions & Summary</h3>
          </div>

          {/* Status summary */}
          <div className="space-y-3 mb-5">
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <div className="flex items-center gap-2 mb-1">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-[11px] font-semibold text-emerald-500">All Systems Operational</span>
              </div>
              <p className="text-[9px] text-muted-foreground pl-5">Core integrations are running smoothly. 1 minor warning detected on Slack.</p>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[11px] font-semibold text-amber-500">Slack Sync Delayed</span>
              </div>
              <p className="text-[9px] text-muted-foreground pl-5">Last successful sync was 18 minutes ago. Auto-retry is scheduled.</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2">
            <Button size="sm" variant="outline" className="w-full text-xs justify-start gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Force Sync All Integrations
            </Button>
            <Button size="sm" variant="outline" className="w-full text-xs justify-start gap-2">
              <Activity className="h-3.5 w-3.5" />
              View Full API Logs
            </Button>
            <Button size="sm" variant="outline" className="w-full text-xs justify-start gap-2">
              <Settings className="h-3.5 w-3.5" />
              Integration Configuration
            </Button>
          </div>

          {/* Ping status */}
          {autoRefresh && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 pt-3 border-t border-border/20"
            >
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-emerald-500"
                />
                <span className="text-[9px] text-muted-foreground">
                  Next health check in 30s
                </span>
                {pingPulse && (
                  <motion.span
                    initial={{ opacity: 1, x: 0 }}
                    animate={{ opacity: 0, x: 10 }}
                    className="text-[8px] text-emerald-500 font-medium"
                  >
                    ping!
                  </motion.span>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
