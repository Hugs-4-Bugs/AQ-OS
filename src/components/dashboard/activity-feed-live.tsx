'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  UserPlus,
  Trophy,
  Send,
  Mail,
  Phone,
  FileText,
  Clock,
  Filter,
  ChevronDown,
  TrendingUp,
  ArrowRight,
  Sparkles,
  HandshakeIcon,
  Rss,
  MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/* ================================================================
   Types
   ================================================================ */

type ActivityCategory = 'all' | 'leads' | 'deals' | 'emails' | 'calls';

type LiveActivityType =
  | 'lead_created'
  | 'lead_updated'
  | 'deal_created'
  | 'deal_won'
  | 'deal_updated'
  | 'email_sent'
  | 'email_reply'
  | 'call_made'
  | 'call_completed'
  | 'note_added'
  | 'stage_changed';

interface LiveActivity {
  id: string;
  type: LiveActivityType;
  title: string;
  description: string;
  userName: string;
  userInitials: string;
  userColor: string;
  timestamp: Date;
  category: ActivityCategory;
}

/* ================================================================
   Type Config
   ================================================================ */

const TYPE_CONFIG: Record<LiveActivityType, { icon: React.ElementType; color: string; bg: string; border: string; category: ActivityCategory }> = {
  lead_created: { icon: UserPlus, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-l-emerald-500', category: 'leads' },
  lead_updated: { icon: FileText, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-l-sky-500', category: 'leads' },
  deal_created: { icon: HandshakeIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-l-amber-500', category: 'deals' },
  deal_won: { icon: Trophy, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-l-green-500', category: 'deals' },
  deal_updated: { icon: TrendingUp, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-l-violet-500', category: 'deals' },
  email_sent: { icon: Send, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-l-blue-500', category: 'emails' },
  email_reply: { icon: Mail, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-l-cyan-500', category: 'emails' },
  call_made: { icon: Phone, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-l-orange-500', category: 'calls' },
  call_completed: { icon: Phone, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-l-amber-500', category: 'calls' },
  note_added: { icon: FileText, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-l-slate-500', category: 'leads' },
  stage_changed: { icon: ArrowRight, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-l-purple-500', category: 'deals' },
};

const FILTER_TABS: { value: ActivityCategory; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'All', icon: Rss },
  { value: 'leads', label: 'Leads', icon: UserPlus },
  { value: 'deals', label: 'Deals', icon: HandshakeIcon },
  { value: 'emails', label: 'Emails', icon: Mail },
  { value: 'calls', label: 'Calls', icon: Phone },
];

/* ================================================================
   Helpers
   ================================================================ */

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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isRecent(date: Date): boolean {
  return Date.now() - date.getTime() < 5 * 60 * 1000;
}

/* ================================================================
   Activity Data — fetched from API
   ================================================================ */

/* ================================================================
   Pulse Dot
   ================================================================ */

function PulseDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  );
}

/* ================================================================
   Skeleton
   ================================================================ */

function FeedSkeleton() {
  return (
    <div className="space-y-1 px-1 py-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-2.5 px-2">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-4 w-12 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

/* ================================================================
   Empty State
   ================================================================ */

function EmptyFeed() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-10 px-4"
    >
      <div className="relative mb-3">
        <div className="absolute inset-0 rounded-full bg-primary/5 animate-ping" />
        <Activity className="h-10 w-10 text-muted-foreground/25 relative" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">No recent activity</p>
      <p className="text-xs text-muted-foreground/50 mt-1 text-center max-w-[200px]">
        Events will appear here as your team works
      </p>
    </motion.div>
  );
}

/* ================================================================
   Activity Row
   ================================================================ */

function ActivityRow({ item, index }: { item: LiveActivity; index: number }) {
  const config = TYPE_CONFIG[item.type];
  const Icon = config.icon;
  const recent = isRecent(item.timestamp);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, height: 0 }}
      transition={{
        duration: 0.25,
        delay: index * 0.03,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        'group relative flex items-start gap-3 px-2.5 py-2.5 rounded-lg cursor-pointer',
        'border-l-[3px] transition-all duration-200',
        'hover:bg-accent/40',
        config.border
      )}
    >
      {/* User avatar */}
      <div className="relative shrink-0 mt-0.5">
        <div className={cn(
          'flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-br text-white text-[10px] font-bold',
          item.userColor
        )}>
          {item.userInitials}
        </div>
        {recent && (
          <div className="absolute -top-0.5 -right-0.5">
            <PulseDot />
          </div>
        )}
      </div>

      {/* Icon */}
      <div className={cn(
        'flex items-center justify-center rounded-lg shrink-0 h-7 w-7 mt-0.5 transition-transform duration-200 group-hover:scale-110',
        config.bg
      )}>
        <Icon className={cn('h-3.5 w-3.5', config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-foreground truncate leading-tight">
            {item.title}
          </p>
          {recent && (
            <Badge className="text-[8px] px-1 py-0 h-3.5 bg-emerald-500/15 text-emerald-500 border-emerald-500/25 border shrink-0">
              NEW
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1">
          {item.description}
        </p>
        <p className="text-[10px] text-muted-foreground/50">
          {item.userName}
        </p>
      </div>

      {/* Timestamp */}
      <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
        <span className="text-[10px] text-muted-foreground/60 tabular-nums whitespace-nowrap">
          {formatRelativeTime(item.timestamp)}
        </span>
        <MessageSquare className="h-2.5 w-2.5 text-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );
}

/* ================================================================
   Main Component
   ================================================================ */

export default function ActivityFeedLive({ className }: { className?: string }) {
  const [activities, setActivities] = useState<LiveActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  // Fetch activities from API
  useEffect(() => {
    const colorPalette = [
      'from-violet-500 to-purple-600',
      'from-emerald-500 to-teal-600',
      'from-amber-500 to-orange-600',
      'from-rose-500 to-pink-600',
      'from-cyan-500 to-sky-600',
    ];
    fetch('/api/dashboard/activities?limit=20')
      .then(r => { if (!r.ok) throw new Error('Failed to load activities'); return r.json(); })
      .then(res => {
        const data = res.data || [];
        const mapped: LiveActivity[] = data.map((a: Record<string, unknown>, i: number) => {
          // Map API activity type to LiveActivityType
          const typeMap: Record<string, LiveActivityType> = {
            created: 'lead_created',
            updated: 'lead_updated',
            scored: 'lead_updated',
            contacted: 'lead_updated',
            replied: 'email_reply',
            stage_changed: 'stage_changed',
            deal_created: 'deal_created',
            deal_won: 'deal_won',
            deal_lost: 'deal_updated',
            note_added: 'note_added',
            email_sent: 'email_sent',
          };
          return {
            id: a.id as string || `act-${i}`,
            type: typeMap[a.type as string] || 'lead_created',
            title: a.title as string || '',
            description: a.description as string || '',
            userName: a.userName as string || 'System',
            userInitials: a.userInitials as string || 'SY',
            userColor: colorPalette[i % colorPalette.length],
            timestamp: new Date(a.timestamp as string || Date.now()),
            category: (a.category as ActivityCategory) || 'leads',
          };
        });
        setActivities(mapped);
      })
      .catch(e => setActivitiesError(e.message))
      .finally(() => setActivitiesLoading(false));
  }, []);

  const [activeFilter, setActiveFilter] = useState<ActivityCategory>('all');
  const [visibleCount, setVisibleCount] = useState(8);

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return activities;
    return activities.filter(a => a.category === activeFilter);
  }, [activities, activeFilter]);

  const displayed = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Count per tab
  const tabCounts = useMemo(() => {
    const counts: Record<ActivityCategory, number> = {
      all: activities.length,
      leads: 0,
      deals: 0,
      emails: 0,
      calls: 0,
    };
    for (const a of activities) {
      counts[a.category]++;
    }
    return counts;
  }, [activities]);

  // Simulate a new activity arriving (pulse on latest) — dev only
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    // Only run simulation in development to prevent resource waste in production
    if (process.env.NODE_ENV !== 'development') return;
    const timer = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      <Card className="glass-card-enhanced card-glow overflow-hidden">
        {/* Header */}
        <CardHeader className="pb-2 pt-5 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="relative">
                <Activity className="h-4 w-4 text-primary" />
                {pulse && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                )}
              </div>
              <span>Live Activity Feed</span>
            </CardTitle>
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-5 bg-primary/10 text-primary font-semibold tabular-nums"
            >
              {filtered.length} events
            </Badge>
          </div>
        </CardHeader>

        {/* Filter Tabs */}
        <div className="px-5 pt-2 pb-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/40">
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab.value;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => { setActiveFilter(tab.value); setVisibleCount(8); }}
                  className={cn(
                    'relative flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  <TabIcon className={cn('h-3 w-3', isActive && 'text-primary')} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {!isActive && tabCounts[tab.value] > 0 && (
                    <span className="hidden sm:inline text-[9px] tabular-nums text-muted-foreground/50">
                      {tabCounts[tab.value]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <CardContent className="px-0 pb-0 pt-1">
          {activitiesLoading ? (
            <FeedSkeleton />
          ) : activitiesError ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <Activity className="h-10 w-10 text-red-500/25 mb-3" />
              <p className="text-sm text-red-500 font-medium">{activitiesError}</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyFeed />
          ) : (
            <ScrollArea className="max-h-[420px]">
              <div className="px-2 pb-2">
                <AnimatePresence initial={false} mode="popLayout">
                  {displayed.map((item, i) => (
                    <ActivityRow key={item.id} item={item} index={i} />
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </CardContent>

        {/* Load More */}
        {hasMore && (
          <div className="border-t border-border/40 px-5 py-3 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-primary gap-1"
              onClick={() => setVisibleCount(prev => prev + 5)}
            >
              <ChevronDown className="h-3 w-3" />
              Load more ({filtered.length - visibleCount} remaining)
            </Button>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border/30 px-5 py-2.5 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/40">
            Updated just now
          </p>
          <div className="flex items-center gap-1 text-emerald-500">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-medium">Live</span>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
