// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Empty State Components
// Reusable empty state illustrations for various dashboard tabs
// ═══════════════════════════════════════════════════════════════════

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  UserPlus,
  Handshake,
  Search,
  BellOff,
  Users,
  TrendingUp,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ===== Animation Variants =====
const fadeInScale = {
  initial: { opacity: 0, scale: 0.95, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const },
};

// ===== Shared Empty State Base =====
interface EmptyStateProps {
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  heading: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: React.ReactNode;
}

function EmptyState({
  icon: Icon,
  iconColor = 'text-primary/40',
  iconBgColor = 'bg-primary/5',
  heading,
  description,
  actionLabel,
  onAction,
  className,
  children,
}: EmptyStateProps) {
  return (
    <motion.div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4 text-center',
        className
      )}
      initial={fadeInScale.initial}
      animate={fadeInScale.animate}
      transition={fadeInScale.transition}
    >
      {/* Icon Container */}
      <div className={cn(
        'relative mb-6',
        'h-20 w-20 rounded-2xl flex items-center justify-center',
        iconBgColor
      )}>
        <Icon className={cn('h-9 w-9', iconColor)} />
        {/* Decorative ring */}
        <div className={cn(
          'absolute inset-0 rounded-2xl border border-dashed opacity-30',
          iconColor.replace('text-', 'border-').replace('/40', '/20')
        )} />
      </div>

      {/* Text */}
      <h3 className="text-base font-semibold text-foreground mb-1.5">
        {heading}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">
        {description}
      </p>

      {/* Action Button */}
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          size="sm"
          className="gap-2 h-9 px-5 text-sm"
        >
          {actionLabel}
        </Button>
      )}

      {/* Extra Children (e.g. secondary links) */}
      {children && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </motion.div>
  );
}

// ===== No Leads Empty State =====
interface NoLeadsEmptyStateProps {
  onAction?: () => void;
  className?: string;
}

export function NoLeadsEmptyState({ onAction, className }: NoLeadsEmptyStateProps) {
  return (
    <EmptyState
      icon={UserPlus}
      iconColor="text-primary/40"
      iconBgColor="bg-primary/5"
      heading="No leads yet"
      description="Start building your pipeline by adding your first lead. Import from CSV, discover prospects, or add them manually."
      actionLabel="Add your first lead"
      onAction={onAction}
      className={className}
    >
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          Import CSV
        </span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          Discover Prospects
        </span>
      </div>
    </EmptyState>
  );
}

// ===== No Deals Empty State =====
interface NoDealsEmptyStateProps {
  onAction?: () => void;
  className?: string;
}

export function NoDealsEmptyState({ onAction, className }: NoDealsEmptyStateProps) {
  return (
    <EmptyState
      icon={Handshake}
      iconColor="text-primary/40"
      iconBgColor="bg-primary/5"
      heading="No deals yet"
      description="Convert your leads into deals and track them through your pipeline. Create your first deal to get started."
      actionLabel="Create your first deal"
      onAction={onAction}
      className={className}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Inbox className="h-3 w-3" />
        <span>Deals will appear here once created from leads</span>
      </div>
    </EmptyState>
  );
}

// ===== No Results Empty State =====
interface NoResultsEmptyStateProps {
  message?: string;
  query?: string;
  className?: string;
}

export function NoResultsEmptyState({
  message,
  query,
  className,
}: NoResultsEmptyStateProps) {
  return (
    <EmptyState
      icon={Search}
      iconColor="text-muted-foreground/40"
      iconBgColor="bg-muted/50"
      heading="No results found"
      description={
        message ||
        (query
          ? `We couldn't find any results matching "${query}". Try adjusting your search or filters.`
          : "We couldn't find any results. Try adjusting your search or filters.")
      }
      className={className}
    />
  );
}

// ===== No Notifications Empty State =====
interface NoNotificationsEmptyStateProps {
  className?: string;
}

export function NoNotificationsEmptyState({ className }: NoNotificationsEmptyStateProps) {
  return (
    <EmptyState
      icon={BellOff}
      iconColor="text-emerald-500/40"
      iconBgColor="bg-emerald-500/5"
      heading="You're all caught up"
      description="No new notifications at the moment. We'll let you know when there's something that needs your attention."
      className={className}
    />
  );
}

export default EmptyState;
