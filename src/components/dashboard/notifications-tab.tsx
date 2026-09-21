'use client';

/**
 * Full-page notification history — opened from the bell panel's
 * "View All Notifications" link (SPA tab `notifications`,
 * URL /business-ai/notifications).
 *
 * Real data only: everything comes from GET /api/notifications (the same
 * DB-backed source the bell panel polls + receives via SSE). No demo rows.
 * The shared zustand store keeps the bell badge in sync with actions taken
 * here, and the live SSE feed mounted in the dashboard layout keeps this
 * page fresh while it is open.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  Inbox,
  RefreshCw,
  ArrowRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useNotificationStore,
  type NotificationType,
} from '@/lib/store';
import { navigateNotificationTarget } from '@/lib/notification-navigation';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

interface ApiNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  actionUrl: string | null;
  createdAt: string;
}

/** Category grouping used for the timeline separators. */
function categoryOf(type: string): 'workflows' | 'leads' | 'outreach' | 'billing' | 'developer' | 'security' | 'general' {
  switch (type) {
    case 'workflow_triggered':
    case 'workflow_completed':
    case 'workflow_failed':
    case 'workflow_execution_complete':
      return 'workflows';
    case 'new_lead_discovered':
    case 'discovery_completed':
    case 'discovery_failed':
    case 'lead_created':
    case 'lead_pipeline_update':
    case 'lead_stage_moved':
    case 'analysis':
    case 'analysis_complete':
    case 'deal_won':
    case 'deal_lost':
      return 'leads';
    case 'campaign_completed':
    case 'campaign_failed':
    case 'sequence_completed':
    case 'email_reply':
    case 'lead_reply':
    case 'outreach_sent':
      return 'outreach';
    case 'payment':
    case 'payment_success':
    case 'payment_failed':
    case 'refund_processed':
    case 'chargeback_received':
    case 'subscription_renewed':
    case 'subscription_cancelling':
    case 'subscription_expired':
    case 'trial_ending':
    case 'credit_assigned':
    case 'credit_low':
    case 'credit_critical':
      return 'billing';
    case 'api_key_created':
    case 'api_key_revoked':
      return 'developer';
    case 'security_alert':
    case 'gmail_token_expired':
      return 'security';
    default:
      return 'general';
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  workflows: 'Workflows',
  leads: 'Leads & Pipeline',
  outreach: 'Outreach & Messaging',
  billing: 'Billing & Credits',
  developer: 'Developer',
  security: 'Security',
  general: 'General',
};

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function NotificationsTab() {
  const {
    markAsRead,
    markAllAsRead,
    setServerUnreadCount,
    serverUnreadCount,
  } = useNotificationStore();

  const [items, setItems] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const offsetRef = useRef(0);

  const fetchPage = useCallback(
    async (mode: 'replace' | 'append') => {
      const offset = mode === 'replace' ? 0 : offsetRef.current;
      if (mode === 'append') setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (filter === 'unread') params.set('unreadOnly', 'true');
        const res = await fetch(`/api/notifications?${params.toString()}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(res.status === 401 ? 'You are signed out. Please sign in again.' : 'Could not load notifications.');
        }
        const data = await res.json();
        const page: ApiNotification[] = Array.isArray(data?.notifications) ? data.notifications : [];
        if (typeof data?.unreadCount === 'number') setServerUnreadCount(data.unreadCount);
        setItems((prev) => {
          const merged = mode === 'replace' ? page : [...prev, ...page];
          // SSE/polling may have delivered rows this page also returns —
          // de-dupe by id while preserving order (newest first).
          const seen = new Set<string>();
          return merged.filter((n) => {
            if (seen.has(n.id)) return false;
            seen.add(n.id);
            return true;
          });
        });
        offsetRef.current = offset + page.length;
        setHasMore(page.length === PAGE_SIZE);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load notifications.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter, setServerUnreadCount]
  );

  // Initial + filter change fetch
  useEffect(() => {
    offsetRef.current = 0;
    fetchPage('replace');
  }, [fetchPage]);

  // Live updates while the page is open: the SSE singleton (shared with the
  // bell) pushes new items into the shared store; when a NEW store item
  // arrives that this page has not fetched yet, refresh page 1 so the
  // history stays current without a manual reload.
  const storeNotifications = useNotificationStore((s) => s.notifications);
  const lastSeenTopIdRef = useRef<string | null>(null);
  useEffect(() => {
    const top = storeNotifications[0];
    if (!top) return;
    const prev = lastSeenTopIdRef.current;
    lastSeenTopIdRef.current = top.id;
    if (prev === null || prev === top.id) return;
    if (filter !== 'all') {
      // Unread view may legitimately gain a new row — refetch keeps filters
      // consistent with the server.
      offsetRef.current = 0;
      fetchPage('replace');
      return;
    }
    if (!items.some((it) => it.id === top.id)) {
      offsetRef.current = 0;
      fetchPage('replace');
    }
  }, [storeNotifications, items, fetchPage, filter]);

  // Mark a single notification read (persisted) and sync store + badge.
  const handleOpen = useCallback(
    (n: ApiNotification) => {
      if (!n.read) {
        // Optimistic update for the page list…
        setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read: true } : it)));
        // …and the shared store (keeps bell badge in sync).
        markAsRead(n.id);
      }
      navigateNotificationTarget(n.actionUrl);
    },
    [markAsRead]
  );

  const handleMarkAllRead = useCallback(async () => {
    setItems((prev) => prev.map((it) => ({ ...it, read: true })));
    markAllAsRead(); // store syncs bell badge + persists via its own API call
  }, [markAllAsRead]);

  const unreadOnPage = items.filter((n) => !n.read).length;
  const shownUnreadBadge = serverUnreadCount ?? unreadOnPage;

  // Group the visible list into category sections (only when showing all).
  const sections: Array<{ category: string; rows: ApiNotification[] }> = [];
  if (filter === 'all') {
    for (const n of items) {
      const category = categoryOf(n.type);
      const last = sections[sections.length - 1];
      if (last && last.category === category) {
        last.rows.push(n);
      } else {
        sections.push({ category, rows: [n] });
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10">
            <Bell className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">Notifications</h2>
            <p className="text-xs text-muted-foreground">
              {shownUnreadBadge > 0
                ? `${shownUnreadBadge} unread notification${shownUnreadBadge === 1 ? '' : 's'}`
                : 'You are all caught up'}
            </p>
          </div>
          {shownUnreadBadge > 0 && (
            <Badge className="bg-primary/10 text-primary border-0 text-[10px] px-1.5 h-4.5">
              {shownUnreadBadge > 99 ? '99+' : shownUnreadBadge}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => fetchPage('replace')}
            aria-label="Refresh notifications"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          {shownUnreadBadge > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleMarkAllRead}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Mark all as read
            </Button>
          )}
        </div>
      </div>

      {/* Filter segmented control */}
      <div className="inline-flex items-center rounded-lg border p-0.5 bg-muted/30">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              filter === f
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={filter === f}
          >
            {f === 'all' ? 'All' : 'Unread'}
          </button>
        ))}
      </div>

      {/* Body states */}
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading notifications">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border p-4">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-2.5 w-1/6" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <p className="text-sm font-medium mt-3">Something went wrong</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">{error}</p>
          <Button variant="outline" size="sm" className="mt-4 h-8 text-xs" onClick={() => fetchPage('replace')}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-20" />
            <Inbox className="h-12 w-12 text-muted-foreground/30 relative" />
          </div>
          <p className="text-sm font-medium text-muted-foreground mt-4">No new notifications</p>
          <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
            {filter === 'unread'
              ? 'You have read everything. New activity from your workflows, leads and outreach will appear here.'
              : 'Activity from your workflows, lead discovery, outreach, billing and account will appear here as it happens.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {(filter === 'unread' ? [{ category: 'unread', rows: items }] : sections).map((section) => (
            <div key={section.category}>
              {filter === 'all' && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2 px-1">
                  {CATEGORY_LABELS[section.category] || section.category}
                </p>
              )}
              <div className="rounded-xl border divide-y overflow-hidden bg-background">
                {section.rows.map((n) => (
                  <motion.button
                    key={n.id}
                    layout
                    type="button"
                    onClick={() => handleOpen(n)}
                    className={cn(
                      'w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors',
                      'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      !n.read && 'bg-primary/[0.04]'
                    )}
                    aria-label={`${n.title}${n.actionUrl ? ' — open related page' : ''}`}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex items-center justify-center h-8 w-8 rounded-full shrink-0',
                        !n.read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {n.read ? <Inbox className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={cn('block text-sm leading-snug', !n.read ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
                        {n.title}
                      </span>
                      <span className={cn('block text-xs leading-snug mt-0.5', !n.read ? 'text-foreground/80' : 'text-muted-foreground/70')}>
                        {n.message}
                      </span>
                      <span className="block text-[10px] text-muted-foreground/50 mt-1">
                        {formatTimeAgo(new Date(n.createdAt))}
                      </span>
                    </span>
                    {n.actionUrl && <ArrowRight className="h-3.5 w-3.5 mt-1.5 shrink-0 text-muted-foreground/40" />}
                    {!n.read && (
                      <span className="mt-2 shrink-0 h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {hasMore && (
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                disabled={loadingMore}
                onClick={() => fetchPage('append')}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Loading…
                  </>
                ) : (
                  'Load older notifications'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
