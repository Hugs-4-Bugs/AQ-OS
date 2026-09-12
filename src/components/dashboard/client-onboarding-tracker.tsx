'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Send,
  SkipForward,
  LayoutGrid,
  List,
  Filter,
  TrendingUp,
  Calendar,
  Users,
  Star,
  FileCheck,
  ShieldCheck,
  Settings,
  Plug,
  GraduationCap,
  ArrowRight,
  BarChart3,
  Mail,
} from 'lucide-react';

/* ===== Types ===== */
type StageId = 'application' | 'review' | 'verification' | 'activation' | 'complete';
type ViewMode = 'pipeline' | 'timeline';
type TaskStatus = 'completed' | 'pending' | 'in_progress';

interface OnboardingStage {
  id: StageId;
  name: string;
  icon: React.ElementType;
  clients: number;
  dropOffRate: number;
  color: string;
  bgColor: string;
}

interface OnboardingClient {
  id: string;
  name: string;
  company: string;
  initials: string;
  avatarColor: string;
  currentStage: StageId;
  stageProgress: number;
  startedDate: string;
  daysInStage: number;
}

interface OnboardingTask {
  id: string;
  label: string;
  icon: React.ElementType;
  status: TaskStatus;
}

/* ===== Data — fetched from API ===== */

/* ===== Loading Skeleton ===== */
function OnboardingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
        <div className="h-6 bg-muted rounded w-64 mb-2" />
        <div className="h-4 bg-muted rounded w-48" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
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

/* ===== Conversion Funnel SVG ===== */
function ConversionFunnel({ stages }: { stages: OnboardingStage[] }) {
  if (stages.length === 0) return <p className="text-xs text-muted-foreground text-center py-6">No stage data for funnel</p>;
  const maxClients = Math.max(...stages.map(s => s.clients));
  const svgWidth = 500;
  const svgHeight = 200;
  const stageWidth = svgWidth / stages.length;
  const padding = 12;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="funnelGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
          <linearGradient id="funnelGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id="funnelGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="funnelGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <linearGradient id="funnelGrad5" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
          <filter id="funnelShadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.1" />
          </filter>
        </defs>
        {stages.map((stage, i) => {
          const barHeight = (stage.clients / maxClients) * (svgHeight - 60);
          const y = svgHeight - 30 - barHeight;
          const x = i * stageWidth + padding;
          const w = stageWidth - padding * 2;
          const gradIds = ['funnelGrad1', 'funnelGrad2', 'funnelGrad3', 'funnelGrad4', 'funnelGrad5'];
          return (
            <g key={stage.id}>
              <motion.rect
                x={x}
                y={y}
                width={w}
                height={barHeight}
                rx={6}
                fill={`url(#${gradIds[i]})`}
                filter="url(#funnelShadow)"
                initial={{ height: 0, y: svgHeight - 30 }}
                animate={{ height: barHeight, y }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: 'easeOut' }}
              />
              <text
                x={x + w / 2}
                y={svgHeight - 10}
                textAnchor="middle"
                className="text-[10px] fill-muted-foreground"
                fontSize="10"
              >
                {stage.name}
              </text>
              <text
                x={x + w / 2}
                y={y - 8}
                textAnchor="middle"
                className="text-[11px] fill-foreground font-semibold"
                fontSize="11"
                fontWeight="600"
              >
                {stage.clients}
              </text>
              {stage.dropOffRate > 0 && i < stages.length - 1 && (
                <g>
                  <motion.text
                    x={x + w + padding / 2}
                    y={y + barHeight / 2 + 4}
                    textAnchor="middle"
                    className="text-[8px] fill-red-400"
                    fontSize="8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.1 + 0.4 }}
                  >
                    -{stage.dropOffRate}%
                  </motion.text>
                  <motion.line
                    x1={x + w + 2}
                    y1={y + barHeight / 2 - 2}
                    x2={x + w + padding - 2}
                    y2={y + barHeight / 2 - 2}
                    stroke="#f87171"
                    strokeWidth="0.5"
                    strokeDasharray="2 1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    transition={{ delay: i * 0.1 + 0.4 }}
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ===== Stage Progress Bar ===== */
function StageProgressBar({ stages, currentStage }: { stages: OnboardingStage[]; currentStage: StageId }) {
  const currentIndex = stages.findIndex(s => s.id === currentStage);
  return (
    <div className="flex items-center gap-1 w-full">
      {stages.map((stage, i) => (
        <div key={stage.id} className="flex-1 flex items-center gap-1">
          <motion.div
            className="h-2 rounded-full flex-1"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            style={{ transformOrigin: 'left' }}
          >
            <div
              className={cn(
                'h-full rounded-full transition-colors',
                i < currentIndex
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                  : i === currentIndex
                    ? 'bg-gradient-to-r from-blue-500 to-violet-500'
                    : 'bg-muted/30'
              )}
            />
          </motion.div>
          {i < stages.length - 1 && (
            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

/* ===== Pipeline View ===== */
function PipelineView({
  clients,
  stages,
  searchQuery,
  onSelectClient,
  selectedClientId,
}: {
  clients: OnboardingClient[];
  stages: OnboardingStage[];
  searchQuery: string;
  onSelectClient: (id: string) => void;
  selectedClientId: string | null;
}) {
  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-3">
      {stages.map((stage) => {
        const StageIcon = stage.icon;
        const stageClients = filteredClients.filter(c => c.currentStage === stage.id);
        return (
          <motion.div
            key={stage.id}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border/30">
              <div className={cn('rounded-lg p-1.5', stage.bgColor.split(' ')[0])}>
                <StageIcon className={cn('h-3.5 w-3.5', stage.color)} />
              </div>
              <span className="text-xs font-semibold">{stage.name}</span>
              <Badge className="text-[9px] h-4 px-1.5 bg-muted/40 border-border/30">{stageClients.length}</Badge>
              {stage.dropOffRate > 0 && (
                <span className="text-[9px] text-muted-foreground ml-auto">-{stage.dropOffRate}% drop-off</span>
              )}
            </div>
            <div className="p-2 space-y-1.5">
              {stageClients.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-3">No clients in this stage</p>
              ) : (
                stageClients.map((client) => (
                  <motion.button
                    key={client.id}
                    whileHover={{ scale: 1.01, x: 2 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onSelectClient(client.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left',
                      selectedClientId === client.id
                        ? 'bg-blue-500/10 border-blue-500/30 shadow-sm'
                        : 'bg-background/50 border-border/20 hover:border-border/40 hover:bg-muted/20'
                    )}
                  >
                    <div className={cn('w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0 shadow-sm', client.avatarColor)}>
                      <span className="text-[10px] font-bold text-white">{client.initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate">{client.name}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{client.company}</p>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <div className="w-16 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${client.stageProgress}%` }}
                          transition={{ duration: 0.6 }}
                          className={cn(
                            'h-full rounded-full',
                            client.stageProgress >= 80 ? 'bg-emerald-500' :
                            client.stageProgress >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                          )}
                        />
                      </div>
                      <span className="text-[8px] text-muted-foreground mt-1">{client.stageProgress}%</span>
                    </div>
                    <div className="flex flex-col items-end shrink-0 ml-1">
                      <span className="text-[9px] text-muted-foreground">{client.daysInStage}d</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                    </div>
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ===== Timeline View ===== */
function TimelineView({ clients, searchQuery, stages }: { clients: OnboardingClient[]; searchQuery: string; stages: OnboardingStage[] }) {
  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.company.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const sorted = [...filteredClients].sort((a, b) => b.daysInStage - a.daysInStage);

  return (
    <div className="space-y-0">
      {sorted.map((client, index) => {
        const stageConfig = stages.find(s => s.id === client.currentStage);
        if (!stageConfig) return null;
        const StageIcon = stageConfig.icon;
        return (
          <motion.div
            key={client.id}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: index * 0.05 }}
            className="flex gap-3 group"
          >
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-8 h-8 rounded-full border border-border/50 bg-background flex items-center justify-center shrink-0 group-hover:border-blue-500/30 transition-colors',
              )}>
                <StageIcon className={cn('h-3.5 w-3.5', stageConfig.color)} />
              </div>
              {index < sorted.length - 1 && (
                <div className="w-px flex-1 bg-border/30 min-h-[16px]" />
              )}
            </div>
            <div className="pb-4 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className={cn('w-5 h-5 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0', client.avatarColor)}>
                  <span className="text-[7px] font-bold text-white">{client.initials}</span>
                </div>
                <span className="text-[11px] font-semibold">{client.name}</span>
                <Badge className="text-[8px] h-4 px-1.5 bg-muted/30 border-border/30">{client.company}</Badge>
              </div>
              <div className="flex items-center gap-3 mb-1.5">
                <Badge className={cn('text-[8px] h-4 px-1.5 border', stageConfig.bgColor)}>
                  {stageConfig.name}
                </Badge>
                <div className="w-20 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${client.stageProgress}%` }}
                    transition={{ duration: 0.6, delay: index * 0.05 }}
                    className="h-full rounded-full bg-blue-500"
                  />
                </div>
                <span className="text-[9px] text-muted-foreground">{client.stageProgress}%</span>
              </div>
              <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Started {client.startedDate}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {client.daysInStage} days in stage
                </span>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ===== Task Checklist ===== */
function TaskChecklist({ tasks, onToggleTask }: { tasks: OnboardingTask[]; onToggleTask: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const Icon = task.icon;
        const isCompleted = task.status === 'completed';
        const isInProgress = task.status === 'in_progress';
        return (
          <motion.button
            key={task.id}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onToggleTask(task.id)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
              isCompleted
                ? 'bg-emerald-500/5 border-emerald-500/15'
                : isInProgress
                  ? 'bg-blue-500/5 border-blue-500/15'
                  : 'bg-muted/10 border-border/20 hover:border-border/40'
            )}
          >
            <div className={cn(
              'rounded-lg p-1.5 shrink-0',
              isCompleted ? 'bg-emerald-500/10' :
              isInProgress ? 'bg-blue-500/10' : 'bg-muted/30'
            )}>
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : isInProgress ? (
                <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              ) : (
                <Icon className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <span className={cn(
              'text-xs font-medium flex-1',
              isCompleted ? 'line-through text-muted-foreground' : ''
            )}>
              {task.label}
            </span>
            {isCompleted && (
              <Badge className="text-[8px] h-4 px-1.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Done</Badge>
            )}
            {isInProgress && (
              <Badge className="text-[8px] h-4 px-1.5 bg-blue-500/10 text-blue-500 border-blue-500/20">In Progress</Badge>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ===== Main Component ===== */
export default function ClientOnboardingTracker() {
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [reminderSent, setReminderSent] = useState<string | null>(null);
  const [showFunnel, setShowFunnel] = useState(true);
  const [STAGES, setStages] = useState<OnboardingStage[]>([]);
  const [CLIENTS, setClients] = useState<OnboardingClient[]>([]);
  const [METRICS, setMetrics] = useState<Array<{ label: string; value: string; icon: React.ElementType; color: string; bgColor: string }>>([]);
  const [onbLoading, setOnbLoading] = useState(true);
  const [onbError, setOnbError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/client-onboarding')
      .then(r => { if (!r.ok) throw new Error('Failed to load onboarding data'); return r.json(); })
      .then(res => {
        const d = res.data;
        if (d) {
          const mappedStages: OnboardingStage[] = (d.stages || []).map((s: Record<string, unknown>, i: number) => {
            const name = s.name as string || '';
            const icons: Record<string, React.ElementType> = {
              'Contract Signed': FileCheck,
              'Welcome Email Sent': Mail,
              'Onboarding Call Scheduled': Calendar,
              'Initial Setup Complete': Settings,
              'First Value Delivered': CheckCircle2,
            };
            const colors = ['text-blue-500', 'text-violet-500', 'text-amber-500', 'text-emerald-500', 'text-cyan-500'];
            const bgColors = ['bg-blue-500/10 border-blue-500/20', 'bg-violet-500/10 border-violet-500/20', 'bg-amber-500/10 border-amber-500/20', 'bg-emerald-500/10 border-emerald-500/20', 'bg-cyan-500/10 border-cyan-500/20'];
            return {
              id: s.id as string || `s-${i}`,
              name,
              icon: icons[name] || FileCheck,
              clients: 0,
              dropOffRate: 0,
              color: colors[i % 5],
              bgColor: bgColors[i % 5],
            };
          });
          setStages(mappedStages);

          const mappedClients: OnboardingClient[] = (d.recentOnboardings || []).map((c: Record<string, unknown>, i: number) => {
            const colors = ['from-blue-500 to-indigo-600', 'from-violet-500 to-purple-600', 'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600', 'from-cyan-500 to-blue-600', 'from-pink-500 to-rose-600'];
            const name = c.name as string || 'Unknown';
            return {
              id: `c-${i}`,
              name,
              company: name,
              initials: name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
              avatarColor: colors[i % colors.length],
              currentStage: 'complete' as StageId,
              stageProgress: 100,
              startedDate: c.startDate ? new Date(c.startDate as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
              daysInStage: 0,
            };
          });
          setClients(mappedClients);

          const metrics = d.metrics;
          setMetrics([
            { label: 'Total Onboarded', value: String(metrics?.totalOnboarded ?? '—'), icon: Users, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
            { label: 'Completion Rate', value: metrics?.completionRate ? `${metrics.completionRate}%` : '—', icon: CheckCircle2, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
            { label: 'Avg. Days to Complete', value: String(metrics?.avgOnboardingDays ?? '—'), icon: Clock, color: 'text-violet-500', bgColor: 'bg-violet-500/10' },
            { label: 'Overall Progress', value: d.overallProgress ? `${d.overallProgress}%` : '—', icon: Star, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
          ]);

          setTasks([
            { id: 't1', label: 'Documents Received', icon: FileCheck, status: 'completed' as TaskStatus },
            { id: 't2', label: 'KYC Verified', icon: ShieldCheck, status: 'completed' as TaskStatus },
            { id: 't3', label: 'Account Setup', icon: Settings, status: 'in_progress' as TaskStatus },
            { id: 't4', label: 'Integration Config', icon: Plug, status: 'pending' as TaskStatus },
            { id: 't5', label: 'Training Scheduled', icon: GraduationCap, status: 'pending' as TaskStatus },
          ]);
        }
      })
      .catch(e => setOnbError(e.message))
      .finally(() => setOnbLoading(false));
  }, []);

  if (onbLoading) return <OnboardingSkeleton />;
  if (onbError) return <div className="p-6 text-destructive">Error: {onbError}</div>;

  const selectedClient = CLIENTS.find(c => c.id === selectedClientId);

  const handleToggleTask = (taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const nextStatus: Record<TaskStatus, TaskStatus> = {
        completed: 'pending',
        in_progress: 'completed',
        pending: 'in_progress',
      };
      return { ...t, status: nextStatus[t.status] };
    }));
  };

  const handleSendReminder = (clientId: string) => {
    setReminderSent(clientId);
    setTimeout(() => setReminderSent(null), 2000);
  };

  const handleSkipStage = (clientId: string) => {
    const client = CLIENTS.find(c => c.id === clientId);
    if (!client) return;
    const stageIndex = STAGES.findIndex(s => s.id === client.currentStage);
    if (stageIndex < STAGES.length - 1) {
      const nextStage = STAGES[stageIndex + 1];
      setClients(prev => prev.map(c =>
        c.id === clientId ? { ...c, currentStage: nextStage.id, stageProgress: 0, daysInStage: 0 } : c
      ));
      setSelectedClientId(clientId);
    }
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
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
              <UserPlus className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Client Onboarding Tracker</h2>
              <p className="text-xs text-muted-foreground">Monitor and manage client onboarding pipeline across all stages</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-3 text-xs bg-muted/30 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/30 placeholder:text-muted-foreground/50 w-48"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className={cn('text-xs gap-1.5', viewMode === 'pipeline' && 'bg-blue-500/10 border-blue-500/30 text-blue-500')}
              onClick={() => setViewMode('pipeline')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Pipeline
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn('text-xs gap-1.5', viewMode === 'timeline' && 'bg-blue-500/10 border-blue-500/30 text-blue-500')}
              onClick={() => setViewMode('timeline')}
            >
              <List className="h-3.5 w-3.5" />
              Timeline
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map((metric, i) => {
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
              <div className="flex items-center gap-3">
                <div className={cn('rounded-xl p-2', metric.bgColor)}>
                  <Icon className={cn('h-4 w-4', metric.color)} />
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums">{metric.value}</p>
                  <p className="text-[10px] text-muted-foreground">{metric.label}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Main Content: Client List + Task Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client List (2 cols) */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 space-y-4"
        >
          {/* View header */}
          <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-bold">
                  {viewMode === 'pipeline' ? 'Pipeline View' : 'Timeline View'}
                </h3>
                <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]">
                  {CLIENTS.length} clients
                </Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-[10px] h-6 px-2 text-violet-500 hover:text-violet-600 hover:bg-violet-500/10 gap-1"
                onClick={() => setShowFunnel(!showFunnel)}
              >
                <BarChart3 className="h-3 w-3" />
                {showFunnel ? 'Hide Funnel' : 'Show Funnel'}
              </Button>
            </div>

            {/* Conversion Funnel */}
            <AnimatePresence>
              {showFunnel && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mb-4 p-4 rounded-xl bg-muted/10 border border-border/20 overflow-hidden"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Stage Conversion Funnel</span>
                  </div>
                  <ConversionFunnel stages={STAGES} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Client Views */}
            {viewMode === 'pipeline' ? (
              <PipelineView
                clients={CLIENTS}
                stages={STAGES}
                searchQuery={searchQuery}
                onSelectClient={setSelectedClientId}
                selectedClientId={selectedClientId}
              />
            ) : (
              <TimelineView clients={CLIENTS} searchQuery={searchQuery} stages={STAGES} />
            )}
          </div>
        </motion.div>

        {/* Task & Detail Panel */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
          className="space-y-4"
        >
          {/* Selected Client Details */}
          {selectedClient && (
            <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-bold">Selected Client</h3>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className={cn('w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md', selectedClient.avatarColor)}>
                  <span className="text-sm font-bold text-white">{selectedClient.initials}</span>
                </div>
                <div>
                  <p className="text-sm font-bold">{selectedClient.name}</p>
                  <p className="text-[11px] text-muted-foreground">{selectedClient.company}</p>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Current Stage</span>
                  <Badge className={cn('text-[9px] h-5 px-2 border', STAGES.find(s => s.id === selectedClient.currentStage)?.bgColor)}>
                    {STAGES.find(s => s.id === selectedClient.currentStage)?.name}
                  </Badge>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground mb-1.5 block">Progress</span>
                  <StageProgressBar stages={STAGES} currentStage={selectedClient.currentStage} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Stage Progress</span>
                  <span className="text-xs font-bold tabular-nums">{selectedClient.stageProgress}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Days in Stage</span>
                  <span className="text-xs font-bold tabular-nums">{selectedClient.daysInStage}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Started</span>
                  <span className="text-xs text-muted-foreground">{selectedClient.startedDate}</span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden mb-4">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${selectedClient.stageProgress}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-[10px] gap-1.5"
                  onClick={() => handleSendReminder(selectedClient.id)}
                >
                  {reminderSent === selectedClient.id ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {reminderSent === selectedClient.id ? 'Reminder Sent!' : 'Send Reminder'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-[10px] gap-1.5"
                  onClick={() => handleSkipStage(selectedClient.id)}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Skip Stage
                </Button>
              </div>
            </div>
          )}

          {/* Task Checklist */}
          <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-bold">Stage Tasks</h3>
              </div>
              <Badge className="text-[10px] h-5 px-2 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                {tasks.filter(t => t.status === 'completed').length}/{tasks.length}
              </Badge>
            </div>
            <TaskChecklist tasks={tasks} onToggleTask={handleToggleTask} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
