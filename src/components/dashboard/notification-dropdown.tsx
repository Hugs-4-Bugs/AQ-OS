'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  BellOff,
  Trophy,
  MessageSquare,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  CreditCard,
  Users,
  Settings,
  type LucideIcon,
  CheckCheck,
  ExternalLink,
  Trash2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  deliveredVia: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  unreadCount: number;
}

interface NotificationDropdownProps {
  trigger?: React.ReactNode;
}

type FilterType = 'all' | 'unread' | 'mentions';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NOTIFICATION_ICONS: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  deal_won: { icon: Trophy, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  lead_reply: { icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  credit_low: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
  analysis: { icon: Sparkles, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  stage_advanced: { icon: ArrowRight, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  payment: { icon: CreditCard, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  team_invite: { icon: Users, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  system: { icon: Settings, color: 'text-muted-foreground', bg: 'bg-muted' },
};

// Mentions-type notifications (lead_reply and team_invite simulate "mentions")
const MENTION_TYPES = new Set(['lead_reply', 'team_invite']);

const FILTER_TABS: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Unread', value: 'unread' },
  { label: 'Mentions', value: 'mentions' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Default trigger component
// ---------------------------------------------------------------------------

function DefaultTrigger({ unreadCount }: { unreadCount: number }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative size-9 rounded-full hover:bg-accent/50"
      aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
    >
      <Bell className="size-[18px]" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotificationDropdown({ trigger }: NotificationDropdownProps) {
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const previousUnreadCountRef = useRef<number>(0);

  // ---- Query: Fetch notifications ----
  const {
    data: notificationsData,
    isLoading,
    error,
  } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?limit=50', { credentials: 'include' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to fetch' }));
        throw new Error(errData.error || 'Failed to fetch notifications');
      }
      return res.json();
    },
    refetchInterval: 30000, // Poll every 30 seconds for real-time updates
    staleTime: 10000,
  });

  const notifications = notificationsData?.notifications ?? [];
  const unreadCount = notificationsData?.unreadCount ?? 0;

  // Toast when new notifications arrive
  useEffect(() => {
    if (
      previousUnreadCountRef.current > 0 &&
      unreadCount > previousUnreadCountRef.current
    ) {
      const newCount = unreadCount - previousUnreadCountRef.current;
      const newNotifications = notifications.filter((n) => !n.read).slice(0, newCount);
      newNotifications.forEach((n) => {
        toast.info(n.title, {
          description: n.message,
          duration: 4000,
        });
      });
    }
    previousUnreadCountRef.current = unreadCount;
  }, [unreadCount, notifications]);

  // ---- Derived state ----

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'unread') return notifications.filter((n) => !n.read);
    if (activeFilter === 'mentions') return notifications.filter((n) => MENTION_TYPES.has(n.type));
    return notifications;
  }, [notifications, activeFilter]);

  // ---- Mutation: Mark all read ----

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to mark read' }));
        throw new Error(errData.error || 'Failed to mark all as read');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to mark notifications as read');
    },
  });

  // ---- Mutation: Mark single as read ----

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notificationId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to mark read' }));
        throw new Error(errData.error || 'Failed to mark as read');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to mark notification as read');
    },
  });

  // ---- Mutation: Delete notification ----

  const deleteMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to delete' }));
        throw new Error(errData.error || 'Failed to delete notification');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Notification deleted');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete notification');
    },
  });

  // ---- Handlers ----

  function handleNotificationClick(notification: NotificationItem) {
    if (!notification.read) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.actionUrl) {
      void window.location.assign(notification.actionUrl);
    }
  }

  function handleDelete(e: React.MouseEvent, notificationId: string) {
    e.stopPropagation();
    deleteMutation.mutate(notificationId);
  }

  // ---- Render ----

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>{trigger ?? <DefaultTrigger unreadCount={unreadCount} />}</PopoverTrigger>

      <PopoverContent align="end" sideOffset={12} className="w-96 p-0">
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl border bg-popover text-popover-foreground shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold tracking-tight">Notifications</h2>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                {markAllReadMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="size-3.5" />
                )}
                Mark all read
              </Button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 px-4 pb-2">
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab.value;
              return (
                <Button
                  key={tab.value}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'h-7 rounded-md px-2.5 text-xs font-medium',
                    isActive && 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary',
                  )}
                  onClick={() => setActiveFilter(tab.value)}
                >
                  {tab.label}
                </Button>
              );
            })}
          </div>

          <Separator className="opacity-60" />

          {/* Notification list */}
          <ScrollArea className="h-[400px]">
            <div className="px-2 py-2">
              {isLoading ? (
                /* Loading state */
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2 className="size-8 animate-spin opacity-40" />
                  <p className="text-sm font-medium">Loading notifications…</p>
                </div>
              ) : error ? (
                /* Error state */
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <AlertTriangle className="size-8 opacity-40" />
                  <p className="text-sm font-medium">Failed to load notifications</p>
                  <p className="text-xs opacity-70">{error.message}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['notifications'] })}
                  >
                    Retry
                  </Button>
                </div>
              ) : filteredNotifications.length === 0 ? (
                /* Empty state */
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground"
                >
                  <BellOff className="size-10 opacity-40" />
                  <p className="text-sm font-medium">No notifications</p>
                  <p className="text-xs opacity-70">
                    {activeFilter === 'unread'
                      ? "You're all caught up!"
                      : activeFilter === 'mentions'
                        ? 'No mentions yet'
                        : 'Nothing to show right now'}
                  </p>
                </motion.div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredNotifications.map((notification, index) => {
                    const iconConfig = NOTIFICATION_ICONS[notification.type];
                    const Icon = iconConfig?.icon ?? Bell;

                    return (
                      <motion.div
                        key={notification.id}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20, height: 0 }}
                        transition={{
                          duration: 0.2,
                          delay: index * 0.03,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className={cn(
                          'group relative flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50',
                          !notification.read && 'border-l-2 border-l-primary bg-primary/[0.03]',
                        )}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        {/* Icon */}
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            iconConfig?.bg ?? 'bg-muted',
                          )}
                        >
                          <Icon
                            className={cn(
                              'size-[18px]',
                              iconConfig?.color ?? 'text-muted-foreground',
                            )}
                          />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                'truncate text-sm font-medium leading-tight',
                                !notification.read ? 'text-foreground' : 'text-muted-foreground',
                              )}
                            >
                              {notification.title}
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground/70">
                              {!notification.read && (
                                <span className="h-2 w-2 rounded-full bg-primary" />
                              )}
                              {formatTimeAgo(notification.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs leading-relaxed text-muted-foreground/80">
                            {notification.message}
                          </p>
                        </div>

                        {/* Delete button (visible on hover) */}
                        <button
                          className="absolute right-2 top-2 hidden shrink-0 rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:block"
                          onClick={(e) => handleDelete(e, notification.id)}
                          aria-label="Delete notification"
                        >
                          {deleteMutation.isPending && deleteMutation.variables === notification.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </ScrollArea>

          <Separator className="opacity-60" />

          {/* View all */}
          <div className="flex justify-center py-2.5">
            <button className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80">
              View all notifications
              <ExternalLink className="size-3" />
            </button>
          </div>
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}
