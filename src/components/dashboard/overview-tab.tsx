'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Flame,
  Phone,
  MessageSquare,
  TrendingUp,
  Trophy,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Search,
  Send,
  Target,
  Activity,
  ArrowRight,
  HandshakeIcon,
  Sparkles,
  UserPlus,
  Mail,
  RefreshCw,
  Video,
  Calendar,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchStats, fetchLeads, fetchDeals, fetchReminders } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { STAGE_LABELS, STAGE_CHART_COLORS, type LeadStage } from '@/lib/types';
import ErrorFallback from './error-fallback';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

/* ===== Animated Counter Hook ===== */
function useAnimatedCounter(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;

    const start = 0;
    const diff = target - start;
    const startTime = performance.now();

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.round(start + diff * eased));
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }, [target, duration]);

  return count;
}

/* ===== Stat Card Component with animated counter ===== */
function StatCard({ stat }: { stat: { label: string; value: number; icon: React.ElementType; trend: string; trendUp: boolean; color: string; bg: string; gradient: string; sparkle?: boolean } }) {
  const Icon = stat.icon;
  const animatedValue = useAnimatedCounter(stat.value);

  return (
    <motion.div variants={itemVariants}>
      <Card className={cn(
        'relative overflow-hidden card-glow glass-card group',
        stat.sparkle && 'animate-sparkle'
      )}>
        <div className={cn('absolute inset-0', stat.gradient)} />
        <CardContent className="relative p-3 sm:p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <div className={cn('rounded-lg p-1.5 sm:p-2 transition-colors', stat.bg)}>
              <Icon className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', stat.color)} />
            </div>
            <div
              className={cn(
                'flex items-center gap-0.5 text-[10px] sm:text-xs font-medium',
                stat.trendUp ? 'text-emerald-500' : 'text-red-500'
              )}
            >
              {stat.trendUp ? (
                <ArrowUpRight className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              ) : (
                <ArrowDownRight className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              )}
              {stat.trend}
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-bold tracking-tight tabular-nums shimmer">{animatedValue}</p>
          <p className="text-[10px] sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 leading-tight">{stat.label}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ===== Revenue Trend Mini Sparkline ===== */
function RevenueTrendSparkline({ leads }: { leads: { updatedAt: string }[] }) {
  const sparkData = useMemo(() => {
    const now = new Date();
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const count = leads.filter((l) => l.updatedAt.slice(0, 10) === dateStr).length;
      days.push({ day: dateStr, count });
    }
    return days;
  }, [leads]);

  return (
    <div className="h-8 w-16 sm:h-10 sm:w-24 ml-auto hidden sm:block">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="count"
            stroke="#10b981"
            strokeWidth={1.5}
            fill="url(#sparklineGradient)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ===== Revenue Pipeline Bar ===== */
function RevenuePipelineBar({ leads }: { leads: { stage: string }[] }) {
  const stageOrder: LeadStage[] = ['discovered', 'analyzed', 'contacted', 'replied', 'discussion', 'proposal', 'negotiation', 'won'];
  const stageHexColors: Record<string, string> = {
    discovered: '#64748b',
    analyzed: '#06b6d4',
    contacted: '#3b82f6',
    replied: '#f59e0b',
    discussion: '#f97316',
    proposal: '#a855f7',
    negotiation: '#ec4899',
    won: '#10b981',
  };

  const counts = stageOrder.map((stage) => ({
    stage,
    count: leads.filter((l) => l.stage === stage).length,
    color: stageHexColors[stage] ?? '#64748b',
  }));
  const total = counts.reduce((s, c) => s + c.count, 0) || 1;

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 sm:h-3 w-full overflow-hidden rounded-full bg-muted">
        {counts.map((seg) =>
          seg.count > 0 ? (
            <div
              key={seg.stage}
              className="pipeline-segment-animated first:rounded-l-full last:rounded-r-full group/seg relative"
              style={{
                width: `${(seg.count / total) * 100}%`,
                backgroundColor: seg.color,
              }}
              title={`${STAGE_LABELS[seg.stage]}: ${seg.count} (${Math.round((seg.count / total) * 100)}%)`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-2 sm:gap-x-3 gap-y-1">
        {counts.filter((s) => s.count > 0).map((seg) => (
          <div key={seg.stage} className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span>{STAGE_LABELS[seg.stage]}</span>
            <span className="font-mono font-medium text-foreground">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Activity Heatmap ===== */
function ActivityHeatmap({ leads }: { leads: { updatedAt: string }[] }) {
  // Generate last 12 weeks (7x12 grid)
  const weeks = 12;
  const days = 7;
  const now = new Date();

  const cells: { count: number; date: string }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    for (let d = 0; d < days; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() - (w * 7 + (6 - d)));
      const dateStr = date.toISOString().slice(0, 10);
      const count = leads.filter((l) => l.updatedAt.slice(0, 10) === dateStr).length;
      cells.push({ count, date: dateStr });
    }
  }

  const maxCount = Math.max(...cells.map((c) => c.count), 1);

  const getOpacity = (count: number) => {
    if (count === 0) return 0.06;
    return 0.2 + (count / maxCount) * 0.8;
  };

  return (
    <div className="flex gap-0.5 overflow-x-auto pb-1">
      {Array.from({ length: weeks }).map((_, w) => (
        <div key={w} className="flex flex-col gap-0.5">
          {Array.from({ length: days }).map((_, d) => {
            const cell = cells[w * days + d];
            return (
              <div
                key={d}
                className="heatmap-cell h-2.5 w-2.5"
                style={{
                  backgroundColor: `oklch(0.696 0.17 162.48 / ${getOpacity(cell?.count ?? 0)})`,
                }}
                title={`${cell?.date ?? ''}: ${cell?.count ?? 0} updates`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ===== Enhanced Activity Feed Types ===== */
type ActivityType = 'stage_change' | 'deal_created' | 'deal_won' | 'outreach_sent' | 'analysis_complete' | 'lead_created' | 'meeting_scheduled' | 'meeting_completed' | 'meeting_cancelled';

interface ActivityItem {
  id: string;
  type: ActivityType;
  businessName: string;
  description: string;
  timestamp: Date;
  leadId?: string;
  channel?: string;
  amount?: number;
}

const ACTIVITY_CONFIG: Record<ActivityType, { icon: React.ElementType; color: string; borderColor: string; bgColor: string }> = {
  stage_change: { icon: ArrowRight, color: 'text-emerald-500', borderColor: 'border-l-emerald-500', bgColor: 'bg-emerald-500/10' },
  deal_created: { icon: HandshakeIcon, color: 'text-amber-500', borderColor: 'border-l-amber-500', bgColor: 'bg-amber-500/10' },
  deal_won: { icon: Trophy, color: 'text-emerald-500', borderColor: 'border-l-emerald-500', bgColor: 'bg-emerald-500/10' },
  outreach_sent: { icon: Send, color: 'text-sky-500', borderColor: 'border-l-sky-500', bgColor: 'bg-sky-500/10' },
  analysis_complete: { icon: Sparkles, color: 'text-violet-500', borderColor: 'border-l-violet-500', bgColor: 'bg-violet-500/10' },
  lead_created: { icon: UserPlus, color: 'text-primary', borderColor: 'border-l-primary', bgColor: 'bg-primary/10' },
  meeting_scheduled: { icon: Video, color: 'text-teal-500', borderColor: 'border-l-teal-500', bgColor: 'bg-teal-500/10' },
  meeting_completed: { icon: CheckCircle2, color: 'text-emerald-500', borderColor: 'border-l-emerald-500', bgColor: 'bg-emerald-500/10' },
  meeting_cancelled: { icon: XCircle, color: 'text-red-500', borderColor: 'border-l-red-500', bgColor: 'bg-red-500/10' },
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

/* ===== Time in Stage Badge ===== */
function TimeInStageBadge({ createdAt }: { createdAt: string }) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 24) {
    return (
      <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500/15 text-emerald-500 border-emerald-500/25 border hover:bg-emerald-500/20">
        New
      </Badge>
    );
  }

  if (diffDays <= 7) {
    return (
      <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-500/15 text-amber-500 border-amber-500/25 border hover:bg-amber-500/20">
        {diffDays}d
      </Badge>
    );
  }

  return (
    <Badge className="text-[9px] px-1.5 py-0 h-4 bg-red-500/15 text-red-400 border-red-500/25 border hover:bg-red-500/20">
      {diffDays}d · Stale
    </Badge>
  );
}

/* ===== Deal Velocity Card ===== */
function DealVelocityCard({ leads }: { leads: { createdAt: string }[] }) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const dealsLast7 = leads.filter((l) => new Date(l.createdAt) >= sevenDaysAgo).length;
  const dealsPrev7 = leads.filter((l) => {
    const d = new Date(l.createdAt);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  }).length;

  const trendUp = dealsLast7 >= dealsPrev7;
  const trendPct = dealsPrev7 > 0 ? Math.round(((dealsLast7 - dealsPrev7) / dealsPrev7) * 100) : (dealsLast7 > 0 ? 100 : 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
    >
      <Card className="card-glow glass-card overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-2 bg-amber-500/10">
                <Flame className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Deal Velocity</p>
                <p className="text-[11px] text-muted-foreground">Last 7 days</p>
              </div>
            </div>
            <div className={cn(
              'flex items-center gap-0.5 text-xs font-medium',
              trendUp ? 'text-emerald-500' : 'text-red-500'
            )}>
              {trendUp ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {trendPct > 0 ? `+${trendPct}%` : `${trendPct}%`}
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums">{dealsLast7}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            vs {dealsPrev7} previous 7 days
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ===== Meeting Activity Item Type ===== */
interface MeetingActivityItem {
  id: string;
  title: string;
  status: string;
  startTime: string;
  lead?: { businessName: string } | null;
  createdAt: string;
  updatedAt: string;
}

/* ===== Enhanced Activity Feed Component ===== */
function EnhancedActivityFeed({ leads, deals, meetings }: { leads: { id: string; businessName: string; stage: string; updatedAt: string; createdAt: string; communications?: { channel: string; direction: string; createdAt: string }[] }[]; deals: { lead?: { businessName: string }; projectType?: string; status: string; proposedPrice?: number; finalPrice?: number; createdAt: string; updatedAt: string }[]; meetings?: MeetingActivityItem[] }) {
  const { setActiveTab, setSelectedLeadId } = useAppStore();

  // Generate activity items from leads, deals, and meetings data
  const activities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    // 1. Stage changes from leads
    leads.forEach((lead) => {
      const updatedDate = new Date(lead.updatedAt);
      const createdDate = new Date(lead.createdAt);

      // If updated significantly after creation, treat as a stage change
      if (updatedDate.getTime() - createdDate.getTime() > 60 * 60 * 1000) {
        items.push({
          id: `stage-${lead.id}`,
          type: 'stage_change',
          businessName: lead.businessName,
          description: `Lead moved to ${STAGE_LABELS[lead.stage as LeadStage] ?? lead.stage}`,
          timestamp: updatedDate,
          leadId: lead.id,
        });
      }

      // Lead creation
      items.push({
        id: `created-${lead.id}`,
        type: 'lead_created',
        businessName: lead.businessName,
        description: 'New lead discovered',
        timestamp: createdDate,
        leadId: lead.id,
      });

      // Outreach sent from communications
      if (lead.communications && lead.communications.length > 0) {
        const outboundComms = lead.communications.filter((c) => c.direction === 'outbound');
        outboundComms.forEach((comm, idx) => {
          items.push({
            id: `outreach-${lead.id}-${idx}`,
            type: 'outreach_sent',
            businessName: lead.businessName,
            description: `Outreach sent via ${comm.channel}`,
            timestamp: new Date(comm.createdAt),
            leadId: lead.id,
            channel: comm.channel,
          });
        });

        // If lead is in analyzed stage, add analysis activity
        if (lead.stage === 'analyzed' || lead.stage === 'contacted' || lead.stage === 'replied' || lead.stage === 'discussion') {
          const firstComm = outboundComms[0];
          if (firstComm) {
            const analysisDate = new Date(new Date(lead.createdAt).getTime() + (new Date(firstComm.createdAt).getTime() - new Date(lead.createdAt).getTime()) / 2);
            items.push({
              id: `analysis-${lead.id}`,
              type: 'analysis_complete',
              businessName: lead.businessName,
              description: 'Analysis completed',
              timestamp: analysisDate,
              leadId: lead.id,
            });
          }
        }
      }
    });

    // 2. Deal activities
    deals.forEach((deal, idx) => {
      const dealDate = new Date(deal.createdAt);

      items.push({
        id: `deal-created-${idx}`,
        type: 'deal_created',
        businessName: deal.lead?.businessName ?? 'Unknown Business',
        description: `Deal created: ${deal.projectType ?? 'General Project'}`,
        timestamp: dealDate,
        amount: deal.proposedPrice,
      });

      if (deal.status === 'accepted' || deal.status === 'won') {
        items.push({
          id: `deal-won-${idx}`,
          type: 'deal_won',
          businessName: deal.lead?.businessName ?? 'Unknown Business',
          description: `Deal won: $${(deal.finalPrice ?? deal.proposedPrice ?? 0).toLocaleString()}`,
          timestamp: new Date(deal.updatedAt),
          amount: deal.finalPrice ?? deal.proposedPrice,
        });
      }
    });

    // 3. Meeting activities
    (meetings ?? []).forEach((meeting) => {
      const businessName = meeting.lead?.businessName ?? meeting.title;
      if (meeting.status === 'scheduled' || meeting.status === 'confirmed') {
        items.push({
          id: `meeting-scheduled-${meeting.id}`,
          type: 'meeting_scheduled',
          businessName,
          description: `Meeting scheduled with ${businessName}`,
          timestamp: new Date(meeting.createdAt),
        });
      }
      if (meeting.status === 'completed') {
        items.push({
          id: `meeting-completed-${meeting.id}`,
          type: 'meeting_completed',
          businessName,
          description: `Meeting completed with ${businessName}`,
          timestamp: new Date(meeting.updatedAt),
        });
      }
      if (meeting.status === 'cancelled') {
        items.push({
          id: `meeting-cancelled-${meeting.id}`,
          type: 'meeting_cancelled',
          businessName,
          description: `Meeting cancelled with ${businessName}`,
          timestamp: new Date(meeting.updatedAt),
        });
      }
    });

    // Sort by most recent first and take top items
    return items
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 12);
  }, [leads, deals, meetings]);

  // Show max 8 initially
  const [showAll, setShowAll] = useState(false);
  const displayedActivities = showAll ? activities : activities.slice(0, 8);

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No recent activity</p>
      </div>
    );
  }

  return (
    <div>
      <ScrollArea className="max-h-64 sm:max-h-96 custom-scrollbar">
        <div className="relative">
          {/* Timeline connecting line */}
          <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />

          <div className="space-y-1">
            <AnimatePresence mode="popLayout">
              {displayedActivities.map((activity, index) => {
                const config = ACTIVITY_CONFIG[activity.type];
                const Icon = config.icon;

                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    className={cn(
                      'relative flex items-start gap-3 p-2.5 rounded-lg border-l-2 cursor-pointer group transition-all duration-200',
                      'hover:bg-accent/50',
                      config.borderColor
                    )}
                    onClick={() => {
                      if (activity.leadId) {
                        setSelectedLeadId(activity.leadId);
                        setActiveTab('leads');
                      }
                    }}
                  >
                    {/* Icon circle on timeline */}
                    <div className={cn(
                      'relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2 border-background transition-transform duration-200 group-hover:scale-110',
                      config.bgColor
                    )}>
                      <Icon className={cn('h-3.5 w-3.5', config.color)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {activity.businessName}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 break-words overflow-hidden" style={{ wordBreak: 'break-word' }}>
                        {activity.description}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground whitespace-nowrap shrink-0 pt-1 hidden min-[420px]:inline">
                      {formatRelativeTime(activity.timestamp)}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </ScrollArea>

      {/* View all toggle */}
      {activities.length > 8 && (
        <div className="mt-2 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-primary"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show less' : `View all (${activities.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ===== Welcome Banner Component ===== */
function WelcomeBanner({ stats, leads, deals }: { stats?: { totalLeads: number; hotLeads: number; wonLeads: number; totalDeals: number } | null; leads?: { stage: string }[] | null; deals?: { status: string }[] | null }) {
  const { setActiveTab } = useAppStore();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vantage-welcome-dismissed') === 'true';
    }
    return false;
  });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => {
      setDismissed(true);
      localStorage.setItem('vantage-welcome-dismissed', 'true');
    }, 300);
  };

  if (dismissed) return null;

  const activePipeline = leads?.filter(l => !['won', 'lost'].includes(l.stage)).length ?? 0;
  const wonDeals = deals?.filter(d => d.status === 'accepted').length ?? 0;
  const hotCount = stats?.hotLeads ?? 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20, transition: { duration: 0.3 } }}
          className="relative rounded-xl overflow-hidden gradient-border-animated-2"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-teal-500/8 to-primary/10" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-emerald-500/5" />

          <div className="relative p-3 sm:p-4 lg:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="shrink-0">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-30" />
                  <div className="relative rounded-full bg-primary/15 p-3">
                    <Zap className="h-6 w-6 text-primary animate-pulse" />
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-base sm:text-lg font-bold gradient-text responsive-text">
                  Your AI Market Intelligence Platform
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Reveal opportunities, automate outreach, and close deals — powered by AI.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <Button
                  onClick={() => setActiveTab('discover')}
                  size="sm"
                  className="touch-target flex-1 sm:flex-initial min-h-[44px] sm:min-h-0"
                >
                  <Search className="h-4 w-4 mr-1.5" />
                  Start Prospecting
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={handleDismiss}
                  aria-label="Dismiss banner"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
              {[
                { label: 'Total Leads', value: stats?.totalLeads ?? 0, icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                { label: 'Hot Leads', value: hotCount, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                { label: 'Active Pipeline', value: activePipeline, icon: TrendingUp, color: 'text-sky-500', bg: 'bg-sky-500/10' },
                { label: 'Deals Won', value: wonDeals, icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-500/10' },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-background/50 backdrop-blur-sm border border-primary/5">
                    <div className={cn('rounded-lg p-1.5 shrink-0', stat.bg)}>
                      <Icon className={cn('h-3.5 w-3.5', stat.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold tabular-nums">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{stat.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function OverviewTab() {
  const { setActiveTab } = useAppStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });

  const { data: leadsResult, error: leadsError, refetch: refetchLeads } = useQuery({
    queryKey: ['leads', { sortBy: 'conversionScore' }],
    queryFn: () => fetchLeads({ sortBy: 'conversionScore', sortOrder: 'desc' }),
  });
  const leads = leadsResult?.leads;

  // Fetch deals for activity feed
  const { data: deals } = useQuery({
    queryKey: ['deals'],
    queryFn: () => fetchDeals(),
  });

  // Fetch reminders for Quick Stats widget
  const { data: reminders } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => fetchReminders(true),
  });

  // Fetch meetings for activity feed
  const { data: meetingsResult } = useQuery({
    queryKey: ['meetings-overview'],
    queryFn: async () => {
      const res = await fetch('/api/meetings');
      if (!res.ok) throw new Error('Failed to fetch meetings');
      return res.json() as Promise<{ meetings: MeetingActivityItem[] }>;
    },
  });
  const meetings = meetingsResult?.meetings;

  // Fetch meeting stats
  const { data: meetingStatsResult } = useQuery({
    queryKey: ['meeting-stats'],
    queryFn: async () => {
      const res = await fetch('/api/meetings/stats');
      if (!res.ok) throw new Error('Failed to fetch meeting stats');
      return res.json() as Promise<{ stats: { total: number; scheduled: number; completed: number; cancelled: number; thisWeek: number; completedThisWeek: number; avgDurationMinutes: number; trend: { direction: string; value: number } } }>;
    },
  });
  const meetingStats = meetingStatsResult?.stats;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const statCards = stats
    ? [
        {
          label: 'Total Leads',
          value: stats.totalLeads,
          icon: Users,
          trend: '−',
          trendUp: true,
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10',
          gradient: 'stat-card-gradient-emerald',
        },
        {
          label: 'Hot Leads',
          value: stats.hotLeads,
          icon: Flame,
          trend: '−',
          trendUp: true,
          color: 'text-orange-500',
          bg: 'bg-orange-500/10',
          gradient: 'stat-card-gradient-orange',
          sparkle: true,
        },
        {
          label: 'Contacted',
          value: stats.contactedLeads,
          icon: Phone,
          trend: '−',
          trendUp: true,
          color: 'text-blue-500',
          bg: 'bg-blue-500/10',
          gradient: 'stat-card-gradient-blue',
        },
        {
          label: 'Replied',
          value: stats.repliedLeads,
          icon: MessageSquare,
          trend: '−',
          trendUp: true,
          color: 'text-amber-500',
          bg: 'bg-amber-500/10',
          gradient: 'stat-card-gradient-amber',
        },
        {
          label: 'Interested',
          value: stats.interestedLeads,
          icon: TrendingUp,
          trend: '−',
          trendUp: true,
          color: 'text-purple-500',
          bg: 'bg-purple-500/10',
          gradient: 'stat-card-gradient-purple',
        },
        {
          label: 'Deals Won',
          value: stats.wonLeads,
          icon: Trophy,
          trend: '−',
          trendUp: true,
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10',
          gradient: 'stat-card-gradient-emerald',
        },
        {
          label: 'Deals Lost',
          value: stats.lostLeads,
          icon: XCircle,
          trend: '−',
          trendUp: false,
          color: 'text-red-500',
          bg: 'bg-red-500/10',
          gradient: 'stat-card-gradient-red',
        },
      ]
    : [];

  // Pipeline data for chart
  // FIX (2026-09-09): Defensive against undefined stage values and
  // any transient undefined in the STAGE_* lookup maps. Previously
  // `STAGE_LABELS[stage]` could throw "Cannot read properties of
  // undefined (reading 'discovered')" if the map was undefined at
  // runtime. Now uses optional chaining + nullish coalescing.
  const pipelineData = leads
    ? Object.entries(
        leads.reduce<Record<string, number>>((acc, lead) => {
          const s = lead?.stage ?? '__unknown__';
          acc[s] = (acc[s] ?? 0) + 1;
          return acc;
        }, {})
      ).map(([stage, count]) => ({
        stage: (STAGE_LABELS?.[stage as LeadStage] ?? stage) || stage,
        count,
        fill: STAGE_CHART_COLORS?.[stage as LeadStage] ?? '#64748b',
      }))
    : [];

  // Score distribution data
  const scoreDistribution = leads
    ? [
        { range: '0-25', count: leads.filter((l) => l.conversionScore <= 25).length, fill: '#ef4444' },
        { range: '26-50', count: leads.filter((l) => l.conversionScore > 25 && l.conversionScore <= 50).length, fill: '#f59e0b' },
        { range: '51-75', count: leads.filter((l) => l.conversionScore > 50 && l.conversionScore <= 75).length, fill: '#3b82f6' },
        { range: '76-100', count: leads.filter((l) => l.conversionScore > 75).length, fill: '#10b981' },
      ]
    : [];

  // Top opportunities
  const topOpportunities = leads ? leads.slice(0, 5) : [];

  // Count total activity items for badge
  const activityCount = useMemo(() => {
    if (!leads) return 0;
    let count = leads.length; // lead_created
    leads.forEach((l) => {
      const updatedDate = new Date(l.updatedAt);
      const createdDate = new Date(l.createdAt);
      if (updatedDate.getTime() - createdDate.getTime() > 60 * 60 * 1000) {
        count++; // stage_change
      }
      if (l.communications) {
        count += l.communications.filter((c) => c.direction === 'outbound').length; // outreach_sent
      }
    });
    count += (deals ?? []).length; // deal_created
    count += (deals ?? []).filter((d) => d.status === 'accepted' || d.status === 'won').length; // deal_won
    return count;
  }, [leads, deals]);

  // Quick action counts for badges
  const quickActionCounts = useMemo(() => ({
    discover: leads?.length ?? 0,
    outreach: leads?.filter((l) => l.communications && l.communications.length > 0).length ?? 0,
    pipeline: leads?.filter((l) => !['won', 'lost'].includes(l.stage)).length ?? 0,
    assistant: 0,
  }), [leads]);

  // Show error state if stats query fails (the primary data source)
  if (statsError && !statsLoading) {
    return (
      <ErrorFallback
        error={statsError instanceof Error ? statsError : null}
        onRetry={() => { refetchStats(); refetchLeads(); }}
        title="Failed to Load Dashboard"
        description="We couldn't load your dashboard data. Please try again."
        className="min-h-[400px]"
      />
    );
  }

  // Urgency color mapping
  const urgencyDotColor: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-slate-400',
  };

  if (statsLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        {/* Skeleton welcome banner */}
        <div className="rounded-xl overflow-hidden">
          <div className="p-4 lg:p-5 space-y-3 skeleton-wave rounded-xl border">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-48 sm:w-72 rounded" />
                <Skeleton className="h-4 w-64 sm:w-96 rounded" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border skeleton-wave">
                  <Skeleton className="h-3 w-16 rounded mb-2" />
                  <Skeleton className="h-6 w-12 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Skeleton stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 stagger-children">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton-stat-card skeleton-wave p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <div className="skeleton-icon skeleton-wave" />
                <Skeleton className="h-4 w-10 rounded" />
              </div>
              <div className="skeleton-value skeleton-wave mb-1" />
              <div className="skeleton-label skeleton-wave" />
            </div>
          ))}
        </div>
        {/* Skeleton charts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="rounded-lg border skeleton-wave h-80" />
          <div className="rounded-lg border skeleton-wave h-80" />
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full custom-scrollbar">
      <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6 dot-pattern min-h-full">
        {/* Header with Refresh */}
        <div className="flex items-center justify-between">
          <div />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground touch-target"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'refresh-spinning')} />
            <span className="text-xs hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
        </div>

        {/* Welcome Banner */}
        <WelcomeBanner stats={stats} leads={leads} deals={deals} />

        {/* Stat Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-3 lg:gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory lg:snap-none -mx-4 px-4 lg:mx-0 lg:px-0"
        >
          {statCards.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </motion.div>

        {/* Meeting Analytics */}
        {meetingStats && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="rounded-lg p-1.5 bg-teal-500/10">
                <Video className="h-3.5 w-3.5 text-teal-500" />
              </div>
              <h3 className="text-sm font-semibold">Meeting Analytics</h3>
            </div>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3"
            >
              {[
                {
                  label: 'Total Meetings',
                  value: meetingStats.total,
                  icon: Calendar,
                  trend: meetingStats.trend?.direction === 'up' ? `+${meetingStats.trend.value}%` : `${meetingStats.trend?.value ?? 0}%`,
                  trendUp: meetingStats.trend?.direction === 'up',
                  color: 'text-teal-500',
                  bg: 'bg-teal-500/10',
                  gradient: 'stat-card-gradient-emerald',
                },
                {
                  label: 'Upcoming',
                  value: meetingStats.scheduled,
                  icon: Clock,
                  trend: '+0%',
                  trendUp: true,
                  color: 'text-blue-500',
                  bg: 'bg-blue-500/10',
                  gradient: 'stat-card-gradient-blue',
                },
                {
                  label: 'Completed',
                  value: meetingStats.completed,
                  icon: CheckCircle2,
                  trend: '+0%',
                  trendUp: true,
                  color: 'text-emerald-500',
                  bg: 'bg-emerald-500/10',
                  gradient: 'stat-card-gradient-emerald',
                },
                {
                  label: 'This Week',
                  value: meetingStats.thisWeek,
                  icon: TrendingUp,
                  trend: '+0%',
                  trendUp: true,
                  color: 'text-amber-500',
                  bg: 'bg-amber-500/10',
                  gradient: 'stat-card-gradient-amber',
                },
              ].map((stat) => (
                <StatCard key={stat.label} stat={stat} />
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* Deal Velocity Card + Revenue Pipeline Bar */}
        {leads && leads.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
            {/* Deal Velocity - small card */}
            <div className="sm:col-span-1">
              <DealVelocityCard leads={leads} />
            </div>

            {/* Revenue Pipeline Bar - wider card with sparkline */}
            <Card className="sm:col-span-3 card-glow glass-card">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Revenue Pipeline
                  </CardTitle>
                  <RevenueTrendSparkline leads={leads} />
                </div>
              </CardHeader>
              <CardContent>
                <RevenuePipelineBar leads={leads} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Today's Focus - Enhanced Quick Stats */}
        {leads && leads.length > 0 && (
          <Card className="card-glow glass-card glow-pulse-emerald">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Today&apos;s Focus
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(() => {
                  const hotLeads = leads.filter((l) => l.replyScore >= 80);
                  const followUpLeads = leads.filter((l) => {
                    if (!l.followUpAt) return false;
                    const followUpDate = new Date(l.followUpAt);
                    return followUpDate <= new Date();
                  });
                  const overdueReminders = reminders?.filter((r) => !r.completed) ?? [];
                  const negotiatingDeals = deals?.filter((d) => d.status === 'negotiating') ?? [];

                  const focusItems = [
                    {
                      icon: Flame,
                      label: 'Hot Leads to Contact',
                      count: hotLeads.length,
                      color: 'text-orange-500',
                      bg: 'bg-orange-500/10',
                      border: 'border-orange-500/20',
                      description: hotLeads.length > 0 ? `${hotLeads[0].businessName} +${hotLeads.length - 1} more` : 'None right now',
                      tab: 'leads' as const,
                    },
                    {
                      icon: Phone,
                      label: 'Follow-ups Needed',
                      count: followUpLeads.length,
                      color: 'text-sky-500',
                      bg: 'bg-sky-500/10',
                      border: 'border-sky-500/20',
                      description: followUpLeads.length > 0 ? `${followUpLeads[0].businessName} +${followUpLeads.length - 1} more` : 'All caught up',
                      tab: 'leads' as const,
                    },
                    {
                      icon: Activity,
                      label: 'Overdue Reminders',
                      count: overdueReminders.length,
                      color: 'text-red-500',
                      bg: 'bg-red-500/10',
                      border: 'border-red-500/20',
                      description: overdueReminders.length > 0 ? overdueReminders[0].message : 'No overdue items',
                      tab: 'leads' as const,
                    },
                    {
                      icon: HandshakeIcon,
                      label: 'Deals Closing Soon',
                      count: negotiatingDeals.length,
                      color: 'text-amber-500',
                      bg: 'bg-amber-500/10',
                      border: 'border-amber-500/20',
                      description: negotiatingDeals.length > 0 ? `${(negotiatingDeals[0].lead?.businessName ?? 'Unknown')} +${negotiatingDeals.length - 1} more` : 'None in negotiation',
                      tab: 'deals' as const,
                    },
                  ];

                  return focusItems.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1, duration: 0.3 }}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 hover:shadow-md cursor-pointer fade-in-up',
                          item.border, 'hover:-translate-y-0.5'
                        )}
                        style={{ animationDelay: `${i * 100}ms` }}
                        onClick={() => {
                          setActiveTab(item.tab);
                        }}
                      >
                        <div className={cn('shrink-0 rounded-lg p-2', item.bg)}>
                          <Icon className={cn('h-4 w-4', item.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{item.label}</span>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{item.count}</Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.description}</p>
                        </div>
                      </motion.div>
                    );
                  });
                })()}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {/* Pipeline Breakdown */}
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Pipeline Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40 sm:h-48 md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="stage"
                      tick={{ fontSize: 10 }}
                      angle={-35}
                      textAnchor="end"
                      height={60}
                      className="fill-muted-foreground"
                    />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <Tooltip
                      cursor={false}
                      contentStyle={{
                        backgroundColor: 'oklch(0.15 0.015 162.48)',
                        border: '1px solid oklch(1 0 0 / 0.1)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'oklch(0.985 0 0)',
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {pipelineData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Score Distribution */}
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Score Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40 sm:h-48 md:h-56 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      <linearGradient id="pieGradient1" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <Pie
                      data={scoreDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="range"
                      // FIX (2026-09-09): Removed inline `label` prop — the
                      // rendered labels ("0-25: 20", "76-100: 0", ...) were
                      // overlapping each other on the right side and
                      // bleeding outside the chart area. Counts/labels now
                      // shown in the clean legend grid below the chart.
                      strokeWidth={0}
                    >
                      {scoreDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'oklch(0.15 0.015 162.48)',
                        border: '1px solid oklch(1 0 0 / 0.1)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'oklch(0.985 0 0)',
                      }}
                      formatter={(value: number, name: string) => [`${value} leads`, `Score ${name}`]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Clean score-range legend with counts (replaces overlapping pie labels) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {scoreDistribution.map((item) => (
                  <div key={item.range} className="text-center rounded-md border border-border/50 bg-background/40 px-1.5 py-1.5">
                    <div
                      className="h-1.5 rounded-full mx-auto mb-1"
                      style={{ backgroundColor: item.fill, width: '60%' }}
                    />
                    <p className="text-[10px] text-muted-foreground">{item.range}</p>
                    <p className="text-xs font-semibold">{item.count}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Heatmap */}
        {leads && leads.length > 0 && (
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityHeatmap leads={leads} />
            </CardContent>
          </Card>
        )}

        {/* Bottom Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Top Opportunities */}
          <Card className="lg:col-span-1 card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Top Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-72 custom-scrollbar">
                <div className="space-y-2">
                  {topOpportunities.map((lead, i) => (
                    <div
                      key={lead.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg row-hover-emerald cursor-pointer group"
                      onClick={() => {
                        useAppStore.getState().setSelectedLeadId(lead.id);
                        setActiveTab('leads');
                      }}
                    >
                      <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                        {/* Urgency dot */}
                        <div className={cn(
                          'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-card',
                          urgencyDotColor[lead.urgency]
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{lead.businessName}</p>
                          <TimeInStageBadge createdAt={lead.createdAt} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {lead.niche} · {lead.country}
                        </p>
                        {/* Mini progress bar */}
                        <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              lead.conversionScore >= 75 ? 'score-bar-gradient-high' :
                              lead.conversionScore >= 50 ? 'score-bar-gradient-medium' :
                              'score-bar-gradient-low'
                            )}
                            style={{ width: `${lead.conversionScore}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-primary">{lead.conversionScore}%</p>
                        <p className="text-xs text-muted-foreground">conv.</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Enhanced Recent Activity */}
          <Card className="lg:col-span-1 card-glow overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Recent Activity
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Live indicator */}
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-[10px] font-medium text-emerald-500">Live</span>
                  </div>
                  {/* Activity count badge */}
                  {activityCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                      {activityCount}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden">
              <EnhancedActivityFeed
                leads={leads ?? []}
                deals={deals ?? []}
                meetings={meetings ?? []}
              />
            </CardContent>
          </Card>

          {/* Quick Actions - Enhanced */}
          <Card className="lg:col-span-1 card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Search, label: 'Discover', tab: 'discover' as const, count: quickActionCounts.discover, gradientFrom: 'from-emerald-500', gradientTo: 'to-teal-500' },
                  { icon: Send, label: 'Outreach', tab: 'outreach' as const, count: quickActionCounts.outreach, gradientFrom: 'from-sky-500', gradientTo: 'to-blue-500' },
                  { icon: Zap, label: 'Pipeline', tab: 'pipeline' as const, count: quickActionCounts.pipeline, gradientFrom: 'from-amber-500', gradientTo: 'to-orange-500' },
                  { icon: MessageSquare, label: 'Assistant', tab: 'assistant' as const, count: quickActionCounts.assistant, gradientFrom: 'from-violet-500', gradientTo: 'to-purple-500' },
                ].map((action) => {
                  const Icon = action.icon;
                  return (
                    <motion.div
                      key={action.label}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                      className="relative group/action"
                    >
                      <Button
                        variant="outline"
                        className="h-auto min-h-[56px] w-full px-3 py-2 flex flex-col items-center justify-center gap-1 group hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all duration-200 relative overflow-hidden"
                        onClick={() => setActiveTab(action.tab)}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-4 w-4 text-primary group-hover:scale-110 transition-transform duration-200" />
                          {action.count > 0 && (
                            <Badge variant="secondary" className="text-[9px] h-3.5 px-1 py-0 font-mono">
                              {action.count}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs">{action.label}</span>
                        {/* Gradient underline on hover */}
                        <div className={cn(
                          'absolute bottom-0 left-2 right-2 h-[2px] rounded-full opacity-0 group-hover/action:opacity-100 transition-opacity duration-300',
                          'bg-gradient-to-r',
                          action.gradientFrom,
                          action.gradientTo
                        )} />
                      </Button>
                    </motion.div>
                  );
                })}
              </div>

              {/* Key Metrics */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reply Rate</span>
                  <span className="font-semibold text-primary">{stats?.replyRate ?? 0}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="score-bar-gradient-high h-full rounded-full transition-all duration-700"
                    style={{ width: `${stats?.replyRate ?? 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Close Rate</span>
                  <span className="font-semibold text-primary">{stats?.closeRate ?? 0}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="score-bar-gradient-high h-full rounded-full transition-all duration-700"
                    style={{ width: `${stats?.closeRate ?? 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm pt-2 border-t">
                  <span className="text-muted-foreground">Avg Deal Value</span>
                  <span className="font-bold gradient-text">
                    ${(stats?.avgDealValue ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
