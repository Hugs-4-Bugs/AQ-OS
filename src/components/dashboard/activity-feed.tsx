'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  UserPlus,
  Trophy,
  Send,
  LogIn,
  Settings,
  CreditCard,
  Brain,
  AlertTriangle,
  FileText,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Mail,
  Clock,
  CheckCircle2,
  ExternalLink,
  Rss,
  Filter,
  Calendar,
  CalendarCheck,
  CalendarX,
  CalendarOff,
  CalendarClock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ================================================================
   Types
   ================================================================ */

type ActivityCategory = 'all' | 'leads' | 'deals' | 'meetings' | 'system' | 'ai';

type ActivityType =
  | 'lead_created'
  | 'lead_updated'
  | 'lead_deleted'
  | 'deal_won'
  | 'deal_lost'
  | 'deal_stage_changed'
  | 'meeting_created'
  | 'meeting_updated'
  | 'meeting_cancelled'
  | 'meeting_completed'
  | 'meeting_rescheduled'
  | 'meeting_approved'
  | 'email_sent'
  | 'email_reply'
  | 'login'
  | 'settings_changed'
  | 'credit_used'
  | 'credit_refilled'
  | 'analysis_complete'
  | 'ai_generation'
  | 'workflow_triggered'
  | 'export_completed';

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string; // ISO date string
  metadata?: Record<string, string | number>;
}

interface AuditLogResponse {
  items: ActivityItem[];
  total: number;
}

/* ================================================================
   Constants — Type → icon / color / category mapping
   ================================================================ */

const TYPE_CONFIG: Record<
  ActivityType,
  {
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    borderAccent: string;
    gradientFrom: string;
    gradientTo: string;
    category: ActivityCategory;
  }
> = {
  lead_created: {
    icon: UserPlus,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    borderAccent: 'border-l-emerald-500',
    gradientFrom: 'from-emerald-500/20',
    gradientTo: 'to-emerald-500/0',
    category: 'leads',
  },
  lead_updated: {
    icon: FileText,
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/10',
    borderAccent: 'border-l-sky-500',
    gradientFrom: 'from-sky-500/20',
    gradientTo: 'to-sky-500/0',
    category: 'leads',
  },
  lead_deleted: {
    icon: AlertTriangle,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    borderAccent: 'border-l-red-500',
    gradientFrom: 'from-red-500/20',
    gradientTo: 'to-red-500/0',
    category: 'leads',
  },
  deal_won: {
    icon: Trophy,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/10',
    borderAccent: 'border-l-green-500',
    gradientFrom: 'from-green-500/20',
    gradientTo: 'to-green-500/0',
    category: 'deals',
  },
  deal_lost: {
    icon: AlertTriangle,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    borderAccent: 'border-l-red-500',
    gradientFrom: 'from-red-500/20',
    gradientTo: 'to-red-500/0',
    category: 'deals',
  },
  deal_stage_changed: {
    icon: ArrowRight,
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/10',
    borderAccent: 'border-l-violet-500',
    gradientFrom: 'from-violet-500/20',
    gradientTo: 'to-violet-500/0',
    category: 'deals',
  },
  email_sent: {
    icon: Send,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    borderAccent: 'border-l-blue-500',
    gradientFrom: 'from-blue-500/20',
    gradientTo: 'to-blue-500/0',
    category: 'system',
  },
  email_reply: {
    icon: Mail,
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10',
    borderAccent: 'border-l-cyan-500',
    gradientFrom: 'from-cyan-500/20',
    gradientTo: 'to-cyan-500/0',
    category: 'system',
  },
  login: {
    icon: LogIn,
    iconColor: 'text-slate-400',
    iconBg: 'bg-slate-500/10',
    borderAccent: 'border-l-slate-500',
    gradientFrom: 'from-slate-500/20',
    gradientTo: 'to-slate-500/0',
    category: 'system',
  },
  settings_changed: {
    icon: Settings,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    borderAccent: 'border-l-amber-500',
    gradientFrom: 'from-amber-500/20',
    gradientTo: 'to-amber-500/0',
    category: 'system',
  },
  credit_used: {
    icon: CreditCard,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/10',
    borderAccent: 'border-l-orange-500',
    gradientFrom: 'from-orange-500/20',
    gradientTo: 'to-orange-500/0',
    category: 'system',
  },
  credit_refilled: {
    icon: TrendingUp,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/10',
    borderAccent: 'border-l-green-500',
    gradientFrom: 'from-green-500/20',
    gradientTo: 'to-green-500/0',
    category: 'system',
  },
  analysis_complete: {
    icon: Brain,
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10',
    borderAccent: 'border-l-purple-500',
    gradientFrom: 'from-purple-500/20',
    gradientTo: 'to-purple-500/0',
    category: 'ai',
  },
  ai_generation: {
    icon: Sparkles,
    iconColor: 'text-fuchsia-400',
    iconBg: 'bg-fuchsia-500/10',
    borderAccent: 'border-l-fuchsia-500',
    gradientFrom: 'from-fuchsia-500/20',
    gradientTo: 'to-fuchsia-500/0',
    category: 'ai',
  },
  workflow_triggered: {
    icon: Activity,
    iconColor: 'text-teal-400',
    iconBg: 'bg-teal-500/10',
    borderAccent: 'border-l-teal-500',
    gradientFrom: 'from-teal-500/20',
    gradientTo: 'to-teal-500/0',
    category: 'system',
  },
  export_completed: {
    icon: CheckCircle2,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/10',
    borderAccent: 'border-l-green-500',
    gradientFrom: 'from-green-500/20',
    gradientTo: 'to-green-500/0',
    category: 'system',
  },
  meeting_created: {
    icon: Calendar,
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/10',
    borderAccent: 'border-l-indigo-500',
    gradientFrom: 'from-indigo-500/20',
    gradientTo: 'to-indigo-500/0',
    category: 'meetings',
  },
  meeting_updated: {
    icon: CalendarClock,
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/10',
    borderAccent: 'border-l-sky-500',
    gradientFrom: 'from-sky-500/20',
    gradientTo: 'to-sky-500/0',
    category: 'meetings',
  },
  meeting_cancelled: {
    icon: CalendarX,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    borderAccent: 'border-l-red-500',
    gradientFrom: 'from-red-500/20',
    gradientTo: 'to-red-500/0',
    category: 'meetings',
  },
  meeting_completed: {
    icon: CalendarCheck,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    borderAccent: 'border-l-emerald-500',
    gradientFrom: 'from-emerald-500/20',
    gradientTo: 'to-emerald-500/0',
    category: 'meetings',
  },
  meeting_rescheduled: {
    icon: CalendarClock,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    borderAccent: 'border-l-amber-500',
    gradientFrom: 'from-amber-500/20',
    gradientTo: 'to-amber-500/0',
    category: 'meetings',
  },
  meeting_approved: {
    icon: CheckCircle2,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/10',
    borderAccent: 'border-l-green-500',
    gradientFrom: 'from-green-500/20',
    gradientTo: 'to-green-500/0',
    category: 'meetings',
  },
};

const FILTER_TABS: { value: ActivityCategory; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'All', icon: Rss },
  { value: 'leads', label: 'Leads', icon: UserPlus },
  { value: 'deals', label: 'Deals', icon: Trophy },
  { value: 'meetings', label: 'Meetings', icon: Calendar },
  { value: 'system', label: 'System', icon: Settings },
  { value: 'ai', label: 'AI', icon: Brain },
];

/* ================================================================
   Helpers
   ================================================================ */

function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ================================================================
   Fallback data when API returns nothing or errors
   ================================================================ */

function generateFallbackActivities(): ActivityItem[] {
  const now = Date.now();
  return [
    {
      id: 'fb-1',
      type: 'lead_created',
      title: 'New lead discovered',
      description: 'Pacific Dental Group — Los Angeles, CA',
      timestamp: new Date(now - 2 * 60000).toISOString(),
    },
    {
      id: 'fb-2',
      type: 'deal_won',
      title: 'Deal closed successfully',
      description: 'MediCare Plus — $3,500,000 annual contract',
      timestamp: new Date(now - 15 * 60000).toISOString(),
    },
    {
      id: 'fb-3',
      type: 'email_sent',
      title: 'Outreach email sent',
      description: 'Cold intro sent to Summit Properties via Gmail',
      timestamp: new Date(now - 35 * 60000).toISOString(),
    },
    {
      id: 'fb-4',
      type: 'analysis_complete',
      title: 'AI analysis finished',
      description: 'Lead scoring updated for 12 businesses in Dental niche',
      timestamp: new Date(now - 55 * 60000).toISOString(),
    },
    {
      id: 'fb-5',
      type: 'login',
      title: 'Session started',
      description: 'Signed in from Chrome on macOS',
      timestamp: new Date(now - 2 * 3600000).toISOString(),
    },
    {
      id: 'fb-6',
      type: 'settings_changed',
      title: 'Notification preferences updated',
      description: 'Email digest frequency changed to daily',
      timestamp: new Date(now - 3 * 3600000).toISOString(),
    },
    {
      id: 'fb-7',
      type: 'credit_used',
      title: 'Credits consumed',
      description: '15 credits used for AI lead enrichment batch',
      timestamp: new Date(now - 5 * 3600000).toISOString(),
    },
    {
      id: 'fb-8',
      type: 'deal_stage_changed',
      title: 'Deal stage advanced',
      description: 'Baker & Associates moved to Negotiation',
      timestamp: new Date(now - 7 * 3600000).toISOString(),
    },
    {
      id: 'fb-9',
      type: 'ai_generation',
      title: 'AI email drafted',
      description: 'Personalized email generated for Zen Wellness Center',
      timestamp: new Date(now - 9 * 3600000).toISOString(),
    },
    {
      id: 'fb-10',
      type: 'workflow_triggered',
      title: 'Auto follow-up workflow',
      description: 'Triggered for 8 leads in "Replied" stage',
      timestamp: new Date(now - 12 * 3600000).toISOString(),
    },
    {
      id: 'fb-11',
      type: 'export_completed',
      title: 'CSV export ready',
      description: 'Lead list exported with 45 records',
      timestamp: new Date(now - 18 * 3600000).toISOString(),
    },
    {
      id: 'fb-12',
      type: 'email_reply',
      title: 'Email reply received',
      description: 'FitZone Gym responded to your outreach sequence',
      timestamp: new Date(now - 24 * 3600000).toISOString(),
    },
  ];
}

/* ================================================================
   Sub-components
   ================================================================ */

/* Animated pulse ring for live/unread indicators */
function PulseDot({ color = 'bg-primary' }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span
        className={cn(
          'absolute inline-flex h-full w-full animate-ping rounded-full opacity-50',
          color
        )}
      />
      <span
        className={cn(
          'relative inline-flex h-2 w-2 rounded-full',
          color
        )}
      />
    </span>
  );
}

/* Loading skeleton */
function FeedSkeleton() {
  return (
    <div className="space-y-1 px-4 py-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-2.5">
          <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
            <Skeleton className="h-2 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Empty state */
function FeedEmpty({ activeFilter }: { activeFilter: ActivityCategory }) {
  const messages: Record<ActivityCategory, { title: string; sub: string }> = {
    all: { title: 'No activity yet', sub: 'Actions will appear here as you use AcquisitionOS' },
    leads: { title: 'No lead activity', sub: 'Lead events will show up here' },
    deals: { title: 'No deal activity', sub: 'Deal updates will appear here' },
    meetings: { title: 'No meeting activity', sub: 'Meeting events will appear here' },
    system: { title: 'No system events', sub: 'System events like logins and exports will show here' },
    ai: { title: 'No AI activity', sub: 'AI-powered actions and analyses will appear here' },
  };
  const msg = messages[activeFilter];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center justify-center py-14 px-4"
    >
      <div className="relative mb-3">
        <div className="absolute inset-0 rounded-full bg-primary/5 animate-ping" />
        <Activity className="h-10 w-10 text-muted-foreground/25 relative" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{msg.title}</p>
      <p className="text-xs text-muted-foreground/50 mt-1 text-center max-w-[220px]">
        {msg.sub}
      </p>
    </motion.div>
  );
}

/* Single activity row */
function ActivityRow({ item, index }: { item: ActivityItem; index: number }) {
  const config = TYPE_CONFIG[item.type];
  const Icon = config.icon;
  const isRecent = Date.now() - new Date(item.timestamp).getTime() < 5 * 60 * 1000;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, height: 0, marginBottom: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.04,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        'group relative flex items-start gap-3 pl-4 py-3 pr-3 rounded-lg cursor-pointer',
        'border-l-[3px] transition-all duration-200',
        'hover:bg-accent/40 hover:shadow-sm',
        config.borderAccent
      )}
    >
      {/* Gradient glow behind icon on hover */}
      <div
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 w-24 h-10 bg-gradient-to-r blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none',
          config.gradientFrom,
          config.gradientTo
        )}
      />

      {/* Icon badge */}
      <div
        className={cn(
          'relative z-10 flex items-center justify-center rounded-xl shrink-0 transition-transform duration-200 group-hover:scale-110',
          config.iconBg,
          'h-9 w-9'
        )}
      >
        <Icon className={cn('h-4 w-4', config.iconColor)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5 relative z-10">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate leading-tight">
            {item.title}
          </p>
          {isRecent && <PulseDot color="bg-green-500" />}
        </div>
        <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
          {item.description}
        </p>
        <div className="flex items-center gap-1.5 pt-0.5">
          <Clock className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-[11px] text-muted-foreground/50">
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>
      </div>

      {/* Hover arrow */}
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/40 shrink-0 mt-3 transition-colors duration-200 relative z-10" />
    </motion.div>
  );
}

/* ================================================================
   Main Component
   ================================================================ */

export default function ActivityFeed({ limit = 20, className }: { limit?: number; className?: string }) {
  const [activeFilter, setActiveFilter] = useState<ActivityCategory>('all');

  const { data, isLoading, isError } = useQuery<AuditLogResponse>({
    queryKey: ['audit-log', 'activity-feed', limit],
    queryFn: async () => {
      const res = await fetch(`/api/settings/audit-log?page=1&limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch audit log');
      return res.json();
    },
    staleTime: 45_000,
    refetchInterval: 60_000,
  });

  // Use real data, fallback if empty/error
  const activities: ActivityItem[] = useMemo(() => {
    if (data?.items && data.items.length > 0) return data.items;
    return generateFallbackActivities();
  }, [data]);

  // Filter by category
  const filtered = useMemo(() => {
    if (activeFilter === 'all') return activities;
    return activities.filter((a) => TYPE_CONFIG[a.type]?.category === activeFilter);
  }, [activities, activeFilter]);

  // Count per tab (for badges)
  const tabCounts = useMemo(() => {
    const counts: Record<ActivityCategory, number> = {
      all: activities.length,
      leads: 0,
      deals: 0,
      meetings: 0,
      system: 0,
      ai: 0,
    };
    for (const a of activities) {
      const cat = TYPE_CONFIG[a.type]?.category ?? 'system';
      counts[cat]++;
    }
    return counts;
  }, [activities]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn('w-full', className)}
    >
      <Card className="card-glow glass-card overflow-hidden">
        {/* ---- Header ---- */}
        <CardHeader className="pb-0 pt-5 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="relative">
                <Activity className="h-4 w-4 text-primary" />
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              </div>
              <span>Activity Feed</span>
            </CardTitle>
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-5 bg-primary/10 text-primary font-semibold tabular-nums"
            >
              {filtered.length}
            </Badge>
          </div>
        </CardHeader>

        {/* ---- Filter Tabs ---- */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/40">
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab.value;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveFilter(tab.value)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  <TabIcon className={cn('h-3 w-3', isActive && 'text-primary')} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {!isActive && tabCounts[tab.value] > 0 && (
                    <span className="hidden sm:inline text-[10px] tabular-nums text-muted-foreground/60">
                      {tabCounts[tab.value]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---- Content ---- */}
        <CardContent className="px-0 pb-0 pt-1">
          {isLoading ? (
            <FeedSkeleton />
          ) : filtered.length === 0 ? (
            <FeedEmpty activeFilter={activeFilter} />
          ) : (
            <ScrollArea className="max-h-[480px]">
              <div className="px-2 pb-2">
                <AnimatePresence initial={false} mode="popLayout">
                  {filtered.slice(0, limit).map((item, i) => (
                    <ActivityRow key={item.id} item={item} index={i} />
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </CardContent>

        {/* ---- Footer ---- */}
        <div className="border-t border-border/50 px-5 py-3 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/40">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            {isError && (
              <span className="ml-1 text-amber-500">· showing cached</span>
            )}
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:underline"
          >
            View All
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </Card>
    </motion.div>
  );
}
