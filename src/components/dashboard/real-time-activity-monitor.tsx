'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Pause,
  Play,
  Download,
  Search,
  LogIn,
  FileEdit,
  Mail,
  UserPlus,
  AlertTriangle,
  Settings,
  ShoppingCart,
  MessageSquare,
  BarChart3,
  Users,
  Clock,
  Zap,
  TrendingUp,
  ChevronRight,
  Circle,
  Globe,
  Shield,
  Headphones,
  Megaphone,
  CheckCircle2,
} from 'lucide-react';

/* ===== Types ===== */
type EventCategory = 'sales' | 'marketing' | 'support' | 'system' | 'all';
type EventSeverity = 'info' | 'warning' | 'success' | 'error';
type PeriodOption = 'today' | 'week' | 'month';

interface ActivityEvent {
  id: string;
  timestamp: string;
  user: string;
  userInitials: string;
  avatarColor: string;
  action: string;
  description: string;
  entity: string;
  category: EventCategory;
  severity: EventSeverity;
  icon: React.ElementType;
}

interface ActiveUser {
  id: string;
  name: string;
  role: string;
  lastAction: string;
  status: 'online' | 'idle' | 'away';
  initials: string;
  avatarColor: string;
}

interface HeatmapCell {
  day: string;
  hour: number;
  intensity: number;
}

/* ===== Default empty data ===== */
const DEFAULT_HEATMAP: HeatmapCell[] = [];

/* ===== Demo heatmap intensity data (day × hour grid) ===== */
const heatmapData: HeatmapCell[] = [
  { day: 'Mon', hour: 9, intensity: 0.4 }, { day: 'Mon', hour: 10, intensity: 0.62 }, { day: 'Mon', hour: 11, intensity: 0.75 },
  { day: 'Mon', hour: 14, intensity: 0.55 }, { day: 'Mon', hour: 15, intensity: 0.42 }, { day: 'Mon', hour: 16, intensity: 0.3 },
  { day: 'Tue', hour: 9, intensity: 0.52 }, { day: 'Tue', hour: 10, intensity: 0.8 }, { day: 'Tue', hour: 11, intensity: 0.9 },
  { day: 'Tue', hour: 13, intensity: 0.48 }, { day: 'Tue', hour: 15, intensity: 0.66 }, { day: 'Tue', hour: 17, intensity: 0.25 },
  { day: 'Wed', hour: 8, intensity: 0.3 }, { day: 'Wed', hour: 10, intensity: 0.7 }, { day: 'Wed', hour: 11, intensity: 0.85 },
  { day: 'Wed', hour: 14, intensity: 0.6 }, { day: 'Wed', hour: 16, intensity: 0.5 }, { day: 'Wed', hour: 18, intensity: 0.2 },
  { day: 'Thu', hour: 9, intensity: 0.45 }, { day: 'Thu', hour: 10, intensity: 0.75 }, { day: 'Thu', hour: 11, intensity: 0.88 },
  { day: 'Thu', hour: 13, intensity: 0.58 }, { day: 'Thu', hour: 15, intensity: 0.7 }, { day: 'Thu', hour: 16, intensity: 0.35 },
  { day: 'Fri', hour: 9, intensity: 0.5 }, { day: 'Fri', hour: 10, intensity: 0.68 }, { day: 'Fri', hour: 11, intensity: 0.72 },
  { day: 'Fri', hour: 14, intensity: 0.4 }, { day: 'Fri', hour: 15, intensity: 0.28 }, { day: 'Fri', hour: 16, intensity: 0.15 },
  { day: 'Sat', hour: 10, intensity: 0.2 }, { day: 'Sat', hour: 12, intensity: 0.32 }, { day: 'Sat', hour: 14, intensity: 0.18 },
  { day: 'Sun', hour: 11, intensity: 0.22 }, { day: 'Sun', hour: 13, intensity: 0.28 }, { day: 'Sun', hour: 17, intensity: 0.12 },
];

const CATEGORY_TABS: { id: EventCategory; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'All', icon: Globe },
  { id: 'sales', label: 'Sales', icon: ShoppingCart },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'support', label: 'Support', icon: Headphones },
  { id: 'system', label: 'System', icon: Shield },
];

const PERIODS: { id: PeriodOption; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

/* ===== Animation Variants ===== */
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ===== Severity Badge ===== */
function SeverityBadge({ severity }: { severity: EventSeverity }) {
  const config = {
    info: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', dotClass: 'bg-blue-500' },
    warning: { className: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dotClass: 'bg-amber-500' },
    success: { className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', dotClass: 'bg-emerald-500' },
    error: { className: 'bg-red-500/10 text-red-500 border-red-500/20', dotClass: 'bg-red-500' },
  };
  const c = config[severity];
  return (
    <Badge className={cn('text-[8px] h-4 px-1.5 border flex items-center gap-1', c.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dotClass)} />
      {severity}
    </Badge>
  );
}

/* ===== Online Status Dot ===== */
function OnlineStatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    online: 'bg-emerald-500',
    idle: 'bg-amber-500',
    away: 'bg-muted-foreground/40',
  };
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === 'online' && (
        <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-40', colorMap[status])} />
      )}
      <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', colorMap[status])} />
    </span>
  );
}

/* ===== Activity Heatmap SVG ===== */
function ActivityHeatmap() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const cellSize = 14;
  const gap = 2;
  const labelWidth = 36;
  const topPadding = 20;
  const svgWidth = labelWidth + hours.length * (cellSize + gap) + 10;
  const svgHeight = topPadding + days.length * (cellSize + gap) + 10;

  function getColor(intensity: number): string {
    if (intensity < 0.15) return '#1e293b';
    if (intensity < 0.3) return '#1e3a5f';
    if (intensity < 0.5) return '#1d4ed8';
    if (intensity < 0.7) return '#2563eb';
    if (intensity < 0.85) return '#3b82f6';
    return '#60a5fa';
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        {/* Hour labels */}
        {hours.filter(h => h % 3 === 0).map(h => (
          <text
            key={`h-${h}`}
            x={labelWidth + h * (cellSize + gap) + cellSize / 2}
            y={topPadding - 6}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="8"
          >
            {h.toString().padStart(2, '0')}
          </text>
        ))}
        {/* Day labels + cells */}
        {days.map((day, di) => {
          return (
            <g key={day}>
              <text
                x={labelWidth - 6}
                y={topPadding + di * (cellSize + gap) + cellSize / 2 + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize="8"
              >
                {day}
              </text>
              {hours.map(hour => {
                const cell = heatmapData.find(d => d.day === day && d.hour === hour);
                const intensity = cell?.intensity ?? 0;
                const x = labelWidth + hour * (cellSize + gap);
                const y = topPadding + di * (cellSize + gap);
                return (
                  <motion.rect
                    key={`${day}-${hour}`}
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    rx={3}
                    fill={getColor(intensity)}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.15, delay: (di * 24 + hour) * 0.003 }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="flex items-center gap-2 mt-2 px-1">
        <span className="text-[8px] text-muted-foreground">Less</span>
        {[0.05, 0.2, 0.4, 0.6, 0.85].map((val, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: getColor(val) }}
          />
        ))}
        <span className="text-[8px] text-muted-foreground">More</span>
      </div>
    </div>
  );
}

/* ===== Live Event Feed ===== */
function LiveEventFeed({
  events,
  isPaused,
}: {
  events: ActivityEvent[];
  isPaused: boolean;
}) {
  return (
    <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
      {events.map((event, index) => {
        const Icon = event.icon;
        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: index * 0.03 }}
            className={cn(
              'flex items-start gap-3 p-3 rounded-xl border transition-all group',
              event.severity === 'warning' ? 'bg-amber-500/5 border-amber-500/15 hover:border-amber-500/25' :
              event.severity === 'error' ? 'bg-red-500/5 border-red-500/15 hover:border-red-500/25' :
              event.severity === 'success' ? 'bg-emerald-500/5 border-emerald-500/15 hover:border-emerald-500/25' :
              'bg-muted/5 border-border/20 hover:border-border/40'
            )}
          >
            <div className={cn(
              'w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0 shadow-sm',
              event.avatarColor
            )}>
              <span className="text-[9px] font-bold text-white">{event.userInitials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-[11px] font-semibold">{event.user}</span>
                <span className="text-[10px] text-muted-foreground">{event.action}</span>
                <SeverityBadge severity={event.severity} />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed mb-1">{event.description}</p>
              <div className="flex items-center gap-2">
                <Badge className="text-[8px] h-4 px-1.5 bg-muted/30 border-border/30 hover:bg-muted/50 transition-colors cursor-pointer">
                  <ChevronRight className="h-2.5 w-2.5 mr-0.5" />
                  {event.entity}
                </Badge>
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  {event.timestamp}
                </span>
              </div>
            </div>
            <div className={cn(
              'rounded-lg p-1.5 shrink-0 mt-0.5',
              event.severity === 'warning' ? 'bg-amber-500/10' :
              event.severity === 'error' ? 'bg-red-500/10' :
              event.severity === 'success' ? 'bg-emerald-500/10' :
              'bg-blue-500/10'
            )}>
              <Icon className={cn(
                'h-3.5 w-3.5',
                event.severity === 'warning' ? 'text-amber-500' :
                event.severity === 'error' ? 'text-red-500' :
                event.severity === 'success' ? 'text-emerald-500' :
                'text-blue-500'
              )} />
            </div>
          </motion.div>
        );
      })}
      {!isPaused && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center py-2"
        >
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Live feed active
          </div>
        </motion.div>
      )}
      {isPaused && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center py-2"
        >
          <div className="flex items-center gap-2 text-[10px] text-amber-500">
            <Pause className="h-3 w-3" />
            Feed paused
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ===== Main Component ===== */
export default function RealTimeActivityMonitor() {
  const [activeTab, setActiveTab] = useState<EventCategory>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[]>(DEFAULT_HEATMAP);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodOption>('today');
  const [autoScroll, setAutoScroll] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  // Fetch real-time data from API
  useEffect(() => {
    fetch('/api/dashboard/activities?limit=20&source=all')
      .then(r => { if (!r.ok) throw new Error('Failed to load activity data'); return r.json(); })
      .then(res => {
        const data = res.data || [];
        const categoryMap: Record<string, EventCategory> = {
          leads: 'sales', deals: 'sales', emails: 'marketing',
          calls: 'sales', system: 'system',
        };
        const actionIconMap: Record<string, React.ElementType> = {
          login: LogIn, logout: LogIn, email_sent: Mail,
          lead_created: UserPlus, deal_created: ShoppingCart, deal_won: ShoppingCart,
        };
        const severityMap: Record<string, EventSeverity> = {
          login: 'info', logout: 'info', email_sent: 'success',
          deal_won: 'success', deal_created: 'success', suspicious_login: 'error',
        };
        const mapped: ActivityEvent[] = data.map((a: Record<string, unknown>, i: number) => {
          const avatarColors = ['from-emerald-500 to-teal-600', 'from-blue-500 to-cyan-600', 'from-amber-500 to-orange-600', 'from-rose-500 to-pink-600'];
          return {
            id: a.id as string || `ev-${i}`,
            timestamp: a.timestamp ? new Date(a.timestamp as string).toLocaleTimeString() : '',
            user: a.userName as string || 'System',
            userInitials: a.userInitials as string || 'SY',
            avatarColor: avatarColors[i % avatarColors.length],
            action: a.title as string || '',
            description: a.description as string || '',
            entity: (a.category as string) || 'System',
            category: categoryMap[a.category as string] || 'system',
            severity: severityMap[a.type as string] || 'info',
            icon: actionIconMap[a.type as string] || Activity,
          };
        });
        setEvents(mapped);
      })
      .catch(e => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredEvents = events.filter(e => activeTab === 'all' || e.category === activeTab);

  /* Simulate new events every 8 seconds when not paused (dev only) */
  useEffect(() => {
    if (isPaused) return;
    // Only run simulation in development to prevent memory/resource waste in production
    if (process.env.NODE_ENV !== 'development') return;
    const interval = setInterval(() => {
      const randomActions: Partial<ActivityEvent>[] = [
        { action: 'Page Viewed', description: 'Viewed the sales dashboard', entity: 'Dashboard', category: 'system' as EventCategory, severity: 'info' as EventSeverity, icon: BarChart3 },
        { action: 'Note Added', description: 'Added internal note to client profile', entity: 'Client #781', category: 'sales' as EventCategory, severity: 'info' as EventSeverity, icon: MessageSquare },
        { action: 'Email Opened', description: 'Prospect opened pricing email', entity: 'Email #4521', category: 'marketing' as EventCategory, severity: 'success' as EventSeverity, icon: Mail },
        { action: 'Webhook Fired', description: 'CRM sync webhook triggered successfully', entity: 'Integration', category: 'system' as EventCategory, severity: 'info' as EventSeverity, icon: Zap },
        { action: 'Task Completed', description: 'Finished weekly report generation', entity: 'Task #129', category: 'system' as EventCategory, severity: 'success' as EventSeverity, icon: CheckCircle2 },
      ];
      const randomAction = randomActions[Math.floor(Math.random() * randomActions.length)];
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHour = hours % 12 || 12;
      const timestamp = `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;

      const newEvent: ActivityEvent = {
        id: `e${Date.now()}`,
        timestamp,
        user: 'System',
        userInitials: 'SY',
        avatarColor: 'from-emerald-500 to-teal-600',
        action: randomAction.action ?? 'Action',
        description: randomAction.description ?? '',
        entity: randomAction.entity ?? '',
        category: randomAction.category ?? 'system',
        severity: randomAction.severity ?? 'info',
        icon: randomAction.icon ?? Activity,
      };

      setEvents(prev => [newEvent, ...prev.slice(0, 19)]);
    }, 8000);
    return () => clearInterval(interval);
  }, [isPaused]);

  const handleExportLog = useCallback(() => {
    const csvContent = [
      'Timestamp,User,Action,Description,Entity,Category,Severity',
      ...events.map(e => `"${e.timestamp}","${e.user}","${e.action}","${e.description}","${e.entity}","${e.category}","${e.severity}"`)
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events]);

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
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-lg shadow-emerald-500/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Real-Time Activity Monitor</h2>
              <p className="text-xs text-muted-foreground">Live tracking of all user activities and system events</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            <Button
              size="sm"
              variant="outline"
              className={cn(
                'text-xs gap-1.5',
                isPaused && 'bg-amber-500/10 border-amber-500/30 text-amber-500'
              )}
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {isPaused ? 'Resume Feed' : 'Pause Feed'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              onClick={handleExportLog}
            >
              <Download className="h-3.5 w-3.5" />
              Export Log
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Activity Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Events Today', value: '142', icon: Activity, color: 'text-blue-500', bgColor: 'bg-blue-500/10', change: '+12%' },
          { label: 'Users Active', value: '23', icon: Users, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', change: '+3' },
          { label: 'Avg per Minute', value: '5.2', icon: Zap, color: 'text-violet-500', bgColor: 'bg-violet-500/10', change: '+0.8' },
          { label: 'Peak Activity', value: '2:30 PM', icon: TrendingUp, color: 'text-amber-500', bgColor: 'bg-amber-500/10', change: 'Today' },
        ].map((metric, i) => {
          const Icon = metric.icon;
          return (
            <motion.div
              key={metric.label}
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: i * 0.05 }}
              className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className={cn('rounded-xl p-2', metric.bgColor)}>
                  <Icon className={cn('h-4 w-4', metric.color)} />
                </div>
                <Badge className="text-[8px] h-4 px-1.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                  {metric.change}
                </Badge>
              </div>
              <p className="text-xl font-bold tabular-nums">{metric.value}</p>
              <p className="text-[10px] text-muted-foreground">{metric.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Main Content: Feed + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-bold">Activity Feed</h3>
              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                {filteredEvents.length} events
              </Badge>
              {!isPaused && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
            {CATEGORY_TABS.map(tab => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all shrink-0',
                    activeTab === tab.id
                      ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/20 border border-transparent'
                  )}
                >
                  <TabIcon className="h-3 w-3" />
                  {tab.label}
                  <span className="text-[8px] opacity-60">
                    ({tab.id === 'all' ? events.length : events.filter(e => e.category === tab.id).length})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Events */}
          <div ref={feedRef}>
            <LiveEventFeed events={filteredEvents} isPaused={isPaused} />
          </div>
        </motion.div>

        {/* Sidebar: Active Users + Heatmap */}
        <div className="space-y-6">
          {/* Active Users */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.15 }}
            className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-bold">Active Users</h3>
              </div>
              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                {activeUsers.filter(u => u.status === 'online').length} online
              </Badge>
            </div>
            <div className="space-y-2">
              {activeUsers.map(user => (
                <motion.div
                  key={user.id}
                  whileHover={{ scale: 1.01 }}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-border/20 bg-muted/5 hover:bg-muted/10 transition-colors"
                >
                  <div className="relative">
                    <div className={cn('w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center shadow-sm', user.avatarColor)}>
                      <span className="text-[9px] font-bold text-white">{user.initials}</span>
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5">
                      <OnlineStatusDot status={user.status} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate">{user.name}</p>
                    <p className="text-[9px] text-muted-foreground truncate">{user.role}</p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[9px] text-muted-foreground">{user.lastAction}</span>
                    <Badge className={cn(
                      'text-[7px] h-3 px-1 mt-0.5',
                      user.status === 'online' ? 'bg-emerald-500/10 text-emerald-500' :
                      user.status === 'idle' ? 'bg-amber-500/10 text-amber-500' :
                      'bg-muted/30 text-muted-foreground'
                    )}>
                      {user.status}
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Activity Heatmap */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
            className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-violet-500" />
              <h3 className="text-sm font-bold">Activity Heatmap</h3>
              <Badge className="text-[9px] h-4 px-1.5 bg-violet-500/10 text-violet-500 border-violet-500/20">
                7 days
              </Badge>
            </div>
            <ActivityHeatmap />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
