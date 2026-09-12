'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  Mail,
  Inbox,
  Phone,
  PhoneIncoming,
  FileText,
  ArrowRightCircle,
  TrendingUp,
  Handshake,
  Bell,
  Tag,
  Brain,
  Send,
  Clock,
  Filter,
  Activity,
  UserCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────

interface Activity {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  actorName?: string;
  metadata?: Record<string, any>;
}

interface LeadActivityTimelineProps {
  activities: Activity[];
  loading?: boolean;
}

// ─── Activity Type Configuration ─────────────────────────────

interface ActivityTypeConfig {
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  label: string;
}

const ACTIVITY_TYPE_CONFIG: Record<string, ActivityTypeConfig> = {
  email_sent: {
    icon: Mail,
    color: 'text-blue-500 dark:text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    label: 'Email Sent',
  },
  email_received: {
    icon: Inbox,
    color: 'text-cyan-500 dark:text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    label: 'Email Received',
  },
  call_made: {
    icon: Phone,
    color: 'text-green-500 dark:text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    label: 'Call Made',
  },
  call_received: {
    icon: PhoneIncoming,
    color: 'text-emerald-500 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    label: 'Call Received',
  },
  note_added: {
    icon: FileText,
    color: 'text-amber-500 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    label: 'Note',
  },
  stage_changed: {
    icon: ArrowRightCircle,
    color: 'text-purple-500 dark:text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    label: 'Stage Change',
  },
  score_updated: {
    icon: TrendingUp,
    color: 'text-orange-500 dark:text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    label: 'Score Update',
  },
  deal_created: {
    icon: Handshake,
    color: 'text-pink-500 dark:text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
    label: 'Deal Created',
  },
  reminder_set: {
    icon: Bell,
    color: 'text-indigo-500 dark:text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    label: 'Reminder',
  },
  tag_added: {
    icon: Tag,
    color: 'text-slate-500 dark:text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    label: 'Tag Added',
  },
  analysis_run: {
    icon: Brain,
    color: 'text-violet-500 dark:text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    label: 'AI Analysis',
  },
  outreach_sent: {
    icon: Send,
    color: 'text-blue-500 dark:text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    label: 'Outreach Sent',
  },
};

// ─── Filter Configuration ────────────────────────────────────

type FilterCategory = 'all' | 'emails' | 'calls' | 'notes' | 'changes';

interface FilterChip {
  key: FilterCategory;
  label: string;
  types: string[];
}

const FILTER_CHIPS: FilterChip[] = [
  { key: 'all', label: 'All', types: [] },
  {
    key: 'emails',
    label: 'Emails',
    types: ['email_sent', 'email_received'],
  },
  {
    key: 'calls',
    label: 'Calls',
    types: ['call_made', 'call_received'],
  },
  {
    key: 'notes',
    label: 'Notes',
    types: ['note_added', 'reminder_set', 'tag_added'],
  },
  {
    key: 'changes',
    label: 'Changes',
    types: ['stage_changed', 'score_updated', 'deal_created', 'analysis_run', 'outreach_sent'],
  },
];

// ─── Relative Time Formatting ────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatAbsoluteTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── Animation Variants ──────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    filter: 'blur(4px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24,
    },
  },
};

const filterVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: {
      delay: i * 0.04,
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  }),
};

// ─── Data (fetched from API) ─────────────────────────────

export const activities: Activity[] = [];

// ─── Sub-Components ──────────────────────────────────────────

function ActivityIcon({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' }) {
  const config = ACTIVITY_TYPE_CONFIG[type] || {
    icon: Activity,
    color: 'text-slate-500',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    label: 'Activity',
  };

  const Icon = config.icon;
  const sizeClasses = size === 'sm' ? 'h-7 w-7' : 'h-10 w-10';
  const iconSizeClasses = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';

  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-full border',
        sizeClasses,
        config.bg,
        config.border
      )}
    >
      <Icon className={cn(iconSizeClasses, config.color)} />
      {/* Pulse ring for recent items */}
      {size === 'md' && (
        <span
          className={cn(
            'absolute inset-0 rounded-full animate-ping opacity-20',
            config.bg
          )}
        />
      )}
    </div>
  );
}

function TimelineCard({ activity, index }: { activity: Activity; index: number }) {
  const config = ACTIVITY_TYPE_CONFIG[activity.type] || ACTIVITY_TYPE_CONFIG.note_added;
  const isLeft = index % 2 === 0;
  const Icon = config.icon;

  return (
    <motion.div
      variants={itemVariants}
      className="relative flex items-start w-full"
    >
      {/* Desktop: alternating layout */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] gap-4 w-full items-start">
        {/* Left content */}
        <div className={cn('flex justify-end', isLeft ? 'pr-4' : 'pr-4')}>
          {isLeft && (
            <div className="glass-card-enhanced depth-shadow-sm hover-glow-primary rounded-xl p-4 max-w-sm w-full animate-fade-in-up transition-all duration-300">
              <TimelineCardContent activity={activity} config={config} Icon={Icon} />
            </div>
          )}
        </div>

        {/* Center dot + connector */}
        <div className="flex flex-col items-center relative">
          <ActivityIcon type={activity.type} size="md" />
        </div>

        {/* Right content */}
        <div className={cn('flex justify-start', !isLeft ? 'pl-4' : 'pl-4')}>
          {!isLeft && (
            <div className="glass-card-enhanced depth-shadow-sm hover-glow-primary rounded-xl p-4 max-w-sm w-full animate-fade-in-up transition-all duration-300">
              <TimelineCardContent activity={activity} config={config} Icon={Icon} />
            </div>
          )}
        </div>
      </div>

      {/* Mobile: single column layout */}
      <div className="flex md:hidden gap-3 w-full">
        <div className="flex flex-col items-center relative shrink-0">
          <ActivityIcon type={activity.type} size="sm" />
          {/* Vertical connector line */}
          <div className="w-px flex-1 min-h-[16px] bg-gradient-to-b from-primary/20 to-transparent mt-2" />
        </div>
        <div className="glass-card-enhanced depth-shadow-sm hover-glow-primary rounded-xl p-3 flex-1 min-w-0 animate-fade-in-up transition-all duration-300">
          <TimelineCardContent activity={activity} config={config} Icon={Icon} compact />
        </div>
      </div>
    </motion.div>
  );
}

function TimelineCardContent({
  activity,
  config,
  Icon,
  compact,
}: {
  activity: Activity;
  config: ActivityTypeConfig;
  Icon: React.ElementType;
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      {/* Header row: type badge + timestamp */}
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0 border',
            config.bg,
            config.color,
            config.border
          )}
        >
          <Icon className={cn('h-2.5 w-2.5 mr-1', config.color)} />
          {config.label}
        </Badge>
        <div className="flex items-center gap-1 text-muted-foreground shrink-0">
          <Clock className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          <span
            className={cn('tabular-nums', compact ? 'text-[10px]' : 'text-xs')}
            title={formatAbsoluteTime(activity.timestamp)}
          >
            {formatRelativeTime(activity.timestamp)}
          </span>
        </div>
      </div>

      {/* Title */}
      <h4
        className={cn(
          'font-semibold leading-snug text-foreground',
          compact ? 'text-xs' : 'text-sm'
        )}
      >
        {activity.title}
      </h4>

      {/* Description */}
      <p
        className={cn(
          'text-muted-foreground leading-relaxed',
          compact ? 'text-[11px] line-clamp-3' : 'text-xs line-clamp-4'
        )}
      >
        {activity.description}
      </p>

      {/* Actor + metadata row */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
        {activity.actorName && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <UserCircle
              className={cn(
                compact ? 'h-3 w-3' : 'h-3.5 w-3.5'
              )}
            />
            <span className={compact ? 'text-[10px]' : 'text-[11px] font-medium'}>
              {activity.actorName}
            </span>
          </div>
        )}

        {/* Metadata badges */}
        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {activity.metadata.value && (
              <Badge
                variant="secondary"
                className={cn(
                  'font-mono font-bold border-0',
                  compact ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0'
                )}
              >
                ${Number(activity.metadata.value).toLocaleString()}
              </Badge>
            )}
            {activity.metadata.duration && (
              <Badge
                variant="secondary"
                className={cn(
                  compact ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0'
                )}
              >
                {activity.metadata.duration}
              </Badge>
            )}
            {activity.metadata.newScore && (
              <Badge
                variant="secondary"
                className={cn(
                  'font-mono font-bold border-0',
                  compact ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0'
                )}
              >
                Score: {activity.metadata.newScore}/100
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterBar({
  activeFilter,
  onFilterChange,
  counts,
}: {
  activeFilter: FilterCategory;
  onFilterChange: (f: FilterCategory) => void;
  counts: Record<FilterCategory, number>;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {FILTER_CHIPS.map((chip, i) => {
        const isActive = activeFilter === chip.key;
        return (
          <motion.button
            key={chip.key}
            custom={i}
            variants={filterVariants}
            initial="hidden"
            animate="visible"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onFilterChange(chip.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200',
              isActive
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground border-border hover:border-primary/30 hover:text-foreground'
            )}
          >
            {chip.label}
            <span
              className={cn(
                'text-[10px] font-mono rounded-full px-1.5 py-0',
                isActive
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {counts[chip.key]}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4">
          <div className="skeleton-card !h-10 !w-10 rounded-full shrink-0" />
          <div className="skeleton-card flex-1" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <Activity className="h-7 w-7 text-muted-foreground/40" />
      </div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-1">
        No Activity Yet
      </h3>
      <p className="text-xs text-muted-foreground/60 max-w-[240px]">
        Activities will appear here once you start engaging with this lead.
        Send an email, make a call, or add a note to get started.
      </p>
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function LeadActivityTimeline({
  activities,
  loading = false,
}: LeadActivityTimelineProps) {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');

  // Compute filter counts
  const counts = useMemo(() => {
    const c: Record<FilterCategory, number> = {
      all: activities.length,
      emails: 0,
      calls: 0,
      notes: 0,
      changes: 0,
    };
    for (const activity of activities) {
      for (const chip of FILTER_CHIPS) {
        if (chip.key === 'all') continue;
        if (chip.types.includes(activity.type)) {
          c[chip.key]++;
        }
      }
    }
    return c;
  }, [activities]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    if (activeFilter === 'all') return activities;
    const chip = FILTER_CHIPS.find((c) => c.key === activeFilter);
    if (!chip) return activities;
    return activities.filter((a) => chip.types.includes(a.type));
  }, [activities, activeFilter]);

  // Sort by timestamp descending (most recent first)
  const sortedActivities = useMemo(
    () =>
      [...filteredActivities].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [filteredActivities]
  );

  // Group by date for visual separators (mobile)
  const groupedActivities = useMemo(() => {
    const groups: { dateLabel: string; items: Activity[] }[] = [];
    let currentLabel = '';

    for (const activity of sortedActivities) {
      const date = new Date(activity.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let label: string;
      if (date.toDateString() === today.toDateString()) {
        label = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        label = 'Yesterday';
      } else {
        label = date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
      }

      if (label !== currentLabel) {
        groups.push({ dateLabel: label, items: [] });
        currentLabel = label;
      }
      groups[groups.length - 1].items.push(activity);
    }

    return groups;
  }, [sortedActivities]);

  return (
    <div className="w-full space-y-4">
      {/* Filter bar */}
      {!loading && activities.length > 0 && (
        <FilterBar
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          counts={counts}
        />
      )}

      {/* Loading state */}
      {loading && <LoadingState />}

      {/* Empty state */}
      {!loading && activities.length === 0 && <EmptyState />}

      {/* Filtered empty state */}
      {!loading && activities.length > 0 && sortedActivities.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <p className="text-sm text-muted-foreground">
            No activities match the selected filter.
          </p>
        </motion.div>
      )}

      {/* Timeline content */}
      {!loading && sortedActivities.length > 0 && (
        <div className="relative">
          {/* Desktop vertical connecting line */}
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2">
            <div className="w-full h-full bg-gradient-to-b from-primary/20 via-primary/10 to-transparent" />
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 md:space-y-8 relative"
          >
            {/* Mobile: date-grouped layout */}
            <div className="md:hidden space-y-6">
              {groupedActivities.map((group) => (
                <div key={group.dateLabel}>
                  {/* Date separator */}
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 mb-3 ml-10"
                  >
                    <div className="h-px flex-1 bg-gradient-to-r from-primary/15 to-transparent" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                      {group.dateLabel}
                    </span>
                  </motion.div>

                  {/* Activity items */}
                  <div className="space-y-3 relative">
                    {/* Mobile vertical line */}
                    <div className="absolute left-[18px] top-0 bottom-0 w-px bg-gradient-to-b from-primary/20 via-primary/10 to-transparent" />

                    {group.items.map((activity, idx) => (
                      <TimelineCard
                        key={activity.id}
                        activity={activity}
                        index={idx}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: alternating layout */}
            <div className="hidden md:block space-y-8">
              {sortedActivities.map((activity, idx) => (
                <TimelineCard
                  key={activity.id}
                  activity={activity}
                  index={idx}
                />
              ))}
            </div>
          </motion.div>

          {/* End-of-timeline indicator */}
          {!loading && sortedActivities.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col items-center pt-8"
            >
              <div className="h-3 w-3 rounded-full bg-primary/20 border border-primary/30 mb-2" />
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                Lead created
              </span>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
