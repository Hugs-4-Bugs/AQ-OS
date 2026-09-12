'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Briefcase,
  Sparkles,
  Clock,
  CalendarDays,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
type WorkloadStatus = 'On Track' | 'At Capacity' | 'Overloaded';
type TimePeriod = 'week' | 'month';

interface TaskBadge {
  text: string;
}

interface TeamMember {
  id: string;
  name: string;
  initials: string;
  role: string;
  activeDeals: number;
  maxCapacity: number;
  utilization: number;
  tasks: TaskBadge[];
  status: WorkloadStatus;
}

interface TaskCategory {
  name: string;
  count: number;
  color: string;
}

interface SuggestedAction {
  id: string;
  message: string;
  priority: 'high' | 'medium';
}

interface WorkloadData {
  period: TimePeriod;
  overallUtilization: number;
  availableCapacity: number;
  overbooked: number;
  members: TeamMember[];
  taskCategories: TaskCategory[];
  suggestedActions: SuggestedAction[];
}

/* ===== Mock Data removed — fetched from API ===== */

/* ===== Utility Functions ===== */
function getStatusConfig(status: WorkloadStatus) {
  switch (status) {
    case 'Overloaded':
      return { color: 'text-red-500', bg: 'bg-red-500/10', badge: 'bg-red-500/15 text-red-500 border-red-500/25 border' };
    case 'At Capacity':
      return { color: 'text-amber-500', bg: 'bg-amber-500/10', badge: 'bg-amber-500/15 text-amber-500 border-amber-500/25 border' };
    case 'On Track':
      return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', badge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25 border' };
  }
}

function getUtilizationColor(util: number): string {
  if (util > 85) return 'bg-red-500';
  if (util > 60) return 'bg-amber-500';
  return 'bg-emerald-500';
}

/* ===== Capacity Bar Component ===== */
function CapacityOverviewBar({ data }: { data: WorkloadData }) {
  const segments = [
    { label: 'Utilized', pct: data.overallUtilization, color: data.overallUtilization > 85 ? '#ef4444' : data.overallUtilization > 60 ? '#f59e0b' : '#10b981' },
    { label: 'Available', pct: data.availableCapacity, color: '#22c55e' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Team Utilization</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-muted-foreground">{data.availableCapacity}% available</span>
          </div>
          {data.overbooked > 0 && (
            <Badge className="text-[9px] px-1.5 py-0 h-4 bg-red-500/15 text-red-500 border border-red-500/25">
              {data.overbooked} overbooked
            </Badge>
          )}
        </div>
      </div>

      <div className="relative">
        {/* Background segments */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {/* Green zone indicator (0-60%) */}
          <div className="absolute left-0 top-0 h-full w-[60%] pointer-events-none" style={{ borderRight: '1px dashed rgba(16,185,129,0.4)' }} />
          {/* Amber zone indicator (60-85%) */}
          <div className="absolute left-[60%] top-0 h-full w-[25%] pointer-events-none" style={{ borderRight: '1px dashed rgba(245,158,11,0.4)' }} />
          {/* Actual utilization */}
          <motion.div
            className="h-full rounded-full transition-colors"
            style={{ backgroundColor: segments[0].color }}
            initial={{ width: 0 }}
            animate={{ width: `${segments[0].pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <motion.div
          className="absolute -top-5 text-xs font-bold tabular-nums"
          initial={{ left: '0%' }}
          animate={{ left: `${data.overallUtilization}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ transform: 'translateX(-50%)' }}
        >
          {data.overallUtilization}%
        </motion.div>
      </div>
    </div>
  );
}

/* ===== Team Member Row ===== */
function TeamMemberRow({ member, index }: { member: TeamMember; index: number }) {
  const statusConfig = getStatusConfig(member.status);

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors group"
    >
      <Avatar className="h-9 w-9 border border-border/50">
        <AvatarFallback className={cn('text-xs font-bold', statusConfig.bg, statusConfig.color)}>
          {member.initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{member.name}</span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">{member.role}</span>
          </div>
          <Badge className={cn('text-[9px] px-1.5 py-0 h-4 shrink-0', statusConfig.badge)}>
            {member.status === 'Overloaded' && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
            {member.status === 'At Capacity' && <Loader2 className="h-2.5 w-2.5 mr-0.5" />}
            {member.status === 'On Track' && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
            {member.status}
          </Badge>
        </div>

        {/* Utilization bar */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={cn('h-full rounded-full', getUtilizationColor(member.utilization))}
              initial={{ width: 0 }}
              animate={{ width: `${member.utilization}%` }}
              transition={{ duration: 0.6, delay: index * 0.08 + 0.2 }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {member.activeDeals}/{member.maxCapacity} deals
          </span>
        </div>

        {/* Task badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {member.tasks.map((task) => (
            <Badge key={task.text} variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal">
              {task.text}
            </Badge>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ===== Donut Chart ===== */
function WorkloadDonutChart({ categories }: { categories: TaskCategory[] }) {
  const total = categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[140px] w-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categories}
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={62}
              paddingAngle={3}
              dataKey="count"
              strokeWidth={0}
            >
              {categories.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums">{total}</span>
          <span className="text-[9px] text-muted-foreground">total tasks</span>
        </div>
      </div>

      <div className="flex-1 space-y-1.5">
        {categories.map((cat) => (
          <div key={cat.name} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-xs text-muted-foreground">{cat.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold tabular-nums">{cat.count}</span>
              <span className="text-[10px] text-muted-foreground">{Math.round((cat.count / total) * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Loading Skeleton ===== */
function TeamWorkloadSkeleton() {
  return (
    <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20 rounded-2xl overflow-hidden h-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 animate-pulse rounded bg-muted/50" />
          <div className="h-7 w-40 animate-pulse rounded-lg bg-muted/40" />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="h-12 animate-pulse rounded-lg bg-muted/30" />
        <div className="space-y-2">
          <div className="h-6 w-28 animate-pulse rounded bg-muted/30" />
          <div className="h-16 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-16 animate-pulse rounded-lg bg-muted/30" />
        </div>
        <div className="h-48 animate-pulse rounded-lg bg-muted/30" />
      </CardContent>
    </Card>
  );
}

/* ===== Main Component ===== */
export default function TeamWorkloadPlanner() {
  const [period, setPeriod] = useState<TimePeriod>('week');
  const [data, setData] = useState<WorkloadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/team-workload?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((res) => setData(res))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return <TeamWorkloadSkeleton />;
  if (error) return <div className="p-6 text-destructive">Error: {error}</div>;
  if (!data) return <div className="p-6 text-muted-foreground">No data available yet.</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20 rounded-2xl overflow-hidden h-full">
        {/* Header */}
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
              <div className="rounded-lg p-1.5 bg-cyan-500/10">
                <Users className="h-4 w-4 text-cyan-500" />
              </div>
              Team Workload
            </CardTitle>
            <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
              {(['week', 'month'] as const).map((p) => (
                <Button
                  key={p}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'text-[11px] h-7 px-3 capitalize',
                    period === p && 'bg-background shadow-sm font-semibold'
                  )}
                  onClick={() => setPeriod(p)}
                >
                  {p === 'week' ? 'This Week' : 'This Month'}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Capacity Overview */}
          <CapacityOverviewBar data={data} />

          <Separator className="opacity-50" />

          {/* Team Members */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Team Members</span>
              <Badge variant="outline" className="text-[10px] h-5">{data.members.length} members</Badge>
            </div>
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto custom-scrollbar">
              {data.members.map((member, i) => (
                <TeamMemberRow key={member.id} member={member} index={i} />
              ))}
            </div>
          </div>

          <Separator className="opacity-50" />

          {/* Workload Distribution */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Workload Distribution</span>
            <WorkloadDonutChart categories={data.taskCategories} />
          </div>

          <Separator className="opacity-50" />

          {/* Suggested Actions */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Suggestions</span>
            </div>
            <div className="space-y-2">
              {data.suggestedActions.map((action, i) => (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="flex items-start gap-2 p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/10"
                >
                  <Sparkles className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{action.message}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
