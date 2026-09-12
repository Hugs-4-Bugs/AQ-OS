'use client';

import React, { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Mail,
  Trophy,
  XCircle,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Clock,
  UserPlus,
  BarChart3,
  CheckSquare,
  Zap,
  AlertCircle,
  Users,
  ArrowRight,
  Send,
  Sparkles,
  CheckCheck,
  Trash2,
  Settings,
  Volume2,
  VolumeX,
  ExternalLink,
  Calendar,
  Video,
  RefreshCw,
  Cloud,
  CloudOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  useNotificationStore,
  type NotificationType,
} from '@/lib/store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ===== Icon & Color Mapping =====

const NOTIFICATION_ICONS: Record<NotificationType, React.ElementType> = {
  email_reply: Mail,
  deal_won: Trophy,
  deal_lost: XCircle,
  credit_low: AlertTriangle,
  credit_critical: AlertTriangle,
  payment_success: CheckCircle,
  payment_failed: XCircle,
  trial_ending: Clock,
  new_lead_discovered: UserPlus,
  analysis_complete: BarChart3,
  sequence_completed: CheckSquare,
  workflow_triggered: Zap,
  gmail_token_expired: AlertCircle,
  team_member_joined: Users,
  // Meeting & Calendar
  meeting_scheduled: Calendar,
  meeting_completed: CheckCircle2,
  meeting_cancelled: XCircle,
  meeting_reminder: Clock,
  meeting_rescheduled: RefreshCw,
  calendar_synced: Cloud,
  calendar_connected: Cloud,
  calendar_disconnected: CloudOff,
  // Legacy
  lead_created: UserPlus,
  stage_advanced: ArrowRight,
  outreach_sent: Send,
};

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  email_reply: 'text-blue-500 bg-blue-500/10',
  deal_won: 'text-green-500 bg-green-500/10',
  deal_lost: 'text-red-500 bg-red-500/10',
  credit_low: 'text-amber-500 bg-amber-500/10',
  credit_critical: 'text-red-500 bg-red-500/10',
  payment_success: 'text-green-500 bg-green-500/10',
  payment_failed: 'text-red-500 bg-red-500/10',
  trial_ending: 'text-orange-500 bg-orange-500/10',
  new_lead_discovered: 'text-purple-500 bg-purple-500/10',
  analysis_complete: 'text-blue-500 bg-blue-500/10',
  sequence_completed: 'text-green-500 bg-green-500/10',
  workflow_triggered: 'text-yellow-500 bg-yellow-500/10',
  gmail_token_expired: 'text-red-500 bg-red-500/10',
  team_member_joined: 'text-blue-500 bg-blue-500/10',
  // Meeting & Calendar (teal theme)
  meeting_scheduled: 'text-teal-500 bg-teal-500/10',
  meeting_completed: 'text-teal-600 bg-teal-500/10',
  meeting_cancelled: 'text-rose-500 bg-rose-500/10',
  meeting_reminder: 'text-teal-500 bg-teal-500/10',
  meeting_rescheduled: 'text-teal-500 bg-teal-500/10',
  calendar_synced: 'text-teal-500 bg-teal-500/10',
  calendar_connected: 'text-teal-500 bg-teal-500/10',
  calendar_disconnected: 'text-amber-500 bg-amber-500/10',
  // Legacy
  lead_created: 'text-emerald-500 bg-emerald-500/10',
  stage_advanced: 'text-sky-500 bg-sky-500/10',
  outreach_sent: 'text-violet-500 bg-violet-500/10',
};

const NOTIFICATION_ACCENT: Record<NotificationType, string> = {
  email_reply: 'border-l-blue-500',
  deal_won: 'border-l-green-500',
  deal_lost: 'border-l-red-500',
  credit_low: 'border-l-amber-500',
  credit_critical: 'border-l-red-500',
  payment_success: 'border-l-green-500',
  payment_failed: 'border-l-red-500',
  trial_ending: 'border-l-orange-500',
  new_lead_discovered: 'border-l-purple-500',
  analysis_complete: 'border-l-blue-500',
  sequence_completed: 'border-l-green-500',
  workflow_triggered: 'border-l-yellow-500',
  gmail_token_expired: 'border-l-red-500',
  team_member_joined: 'border-l-blue-500',
  // Meeting & Calendar (teal accents)
  meeting_scheduled: 'border-l-teal-500',
  meeting_completed: 'border-l-teal-600',
  meeting_cancelled: 'border-l-rose-500',
  meeting_reminder: 'border-l-teal-500',
  meeting_rescheduled: 'border-l-teal-500',
  calendar_synced: 'border-l-teal-500',
  calendar_connected: 'border-l-teal-500',
  calendar_disconnected: 'border-l-amber-500',
  // Legacy
  lead_created: 'border-l-emerald-500',
  stage_advanced: 'border-l-sky-500',
  outreach_sent: 'border-l-violet-500',
};

// ===== Time Formatting =====

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
  return date.toLocaleDateString();
}

// ===== Web Audio Notification Sound =====

let audioContext: AudioContext | null = null;

function playNotificationSound() {
  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext();
    }
    const ctx = audioContext;

    // Create a pleasant two-tone chime
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc1.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1); // C#6

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.15); // C#6
    osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.25); // E6

    gain1.gain.setValueAtTime(0.08, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    gain2.gain.setValueAtTime(0.06, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);

    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.45);
  } catch {
    // Silently fail if audio context is not available
  }
}

// ===== Notification Item Component =====

function NotificationItem({
  notification,
  onMarkRead,
  compact = false,
}: {
  notification: import('@/lib/store').Notification;
  onMarkRead: (id: string) => void;
  compact?: boolean;
}) {
  // CRITICAL FIX (notification crash): If the API returns a notification
  // with a `type` not present in NOTIFICATION_ICONS (e.g. 'info' or any
  // new type), `Icon` would be undefined and `<Icon />` would crash the
  // whole app with the ErrorBoundary fallback. Fall back to a safe icon.
  const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
  const colorClass = NOTIFICATION_COLORS[notification.type] || 'text-muted-foreground bg-muted/10';
  const accentClass = NOTIFICATION_ACCENT[notification.type] || 'border-transparent';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'flex items-start gap-3 cursor-pointer transition-colors border-l-2',
        'hover:bg-accent/50',
        !notification.read && 'bg-primary/[0.03]',
        accentClass,
        compact ? 'px-3 py-2' : 'px-4 py-3'
      )}
      onClick={() => onMarkRead(notification.id)}
    >
      {/* Type-specific icon with colored background */}
      <div
        className={cn(
          'flex items-center justify-center rounded-full shrink-0',
          colorClass,
          compact ? 'h-7 w-7' : 'h-8 w-8'
        )}
      >
        <Icon className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p
          className={cn(
            'text-xs leading-snug',
            !notification.read
              ? 'font-semibold text-foreground'
              : 'font-medium text-muted-foreground'
          )}
        >
          {notification.title}
        </p>
        <p
          className={cn(
            'text-xs leading-snug',
            !notification.read
              ? 'text-foreground/80'
              : 'text-muted-foreground/70'
          )}
        >
          {notification.message}
        </p>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
          {formatTimeAgo(notification.timestamp)}
        </p>
      </div>

      {/* Unread indicator dot */}
      {!notification.read && (
        <div className="mt-2 shrink-0">
          <div className="h-2 w-2 rounded-full bg-primary relative">
            <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-40" />
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ===== Notification List Content (shared between desktop and mobile) =====

function NotificationListContent({
  compact = false,
}: {
  compact?: boolean;
}) {
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  } = useNotificationStore();

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-20" />
          <Bell className="h-10 w-10 text-muted-foreground/30 relative" />
        </div>
        <p className="text-sm font-medium text-muted-foreground mt-3">No notifications</p>
        <p className="text-xs text-muted-foreground/50 mt-1">
          We&apos;ll alert you when something happens
        </p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className={compact ? 'max-h-[500px]' : 'flex-1'}>
        <div className="py-1">
          <AnimatePresence initial={false} mode="popLayout">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={markAsRead}
                compact={compact}
              />
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t px-4 py-2 flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground/50">
          {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
          {unreadCount > 0 && ` · ${unreadCount} unread`}
        </p>
        <button
          type="button"
          className="text-[10px] text-primary hover:text-primary/80 font-medium transition-colors inline-flex items-center gap-1"
        >
          View All Notifications
          <ExternalLink className="h-2.5 w-2.5" />
        </button>
      </div>
    </>
  );
}

// ===== Notification Preferences Popover =====

function NotificationPreferences() {
  const { preferences, setSoundEnabled, setMutedUntil, isMuted } = useNotificationStore();

  const handleMute1Hour = useCallback(() => {
    setMutedUntil(Date.now() + 3600000);
    toast.success('Notifications muted for 1 hour');
  }, [setMutedUntil]);

  const handleMuteToday = useCallback(() => {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    setMutedUntil(endOfDay.getTime());
    toast.success('Notifications muted for today');
  }, [setMutedUntil]);

  const handleUnmute = useCallback(() => {
    setMutedUntil(null);
    toast.success('Notifications unmuted');
  }, [setMutedUntil]);

  const muted = isMuted();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-accent',
            muted && 'text-amber-500 hover:text-amber-600'
          )}
          aria-label="Notification preferences"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        className="w-56 p-2 rounded-xl shadow-xl border-border/50 z-[200]"
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground px-2 py-1.5">
            Quick Preferences
          </p>
          <Separator />

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!preferences.soundEnabled)}
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-xs hover:bg-accent transition-colors"
          >
            {preferences.soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="flex-1 text-left">
              {preferences.soundEnabled ? 'Sound On' : 'Sound Off'}
            </span>
          </button>

          {/* Mute Options */}
          {muted ? (
            <button
              type="button"
              onClick={handleUnmute}
              className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-xs hover:bg-accent transition-colors"
            >
              <Bell className="h-3.5 w-3.5 text-green-500" />
              <span className="flex-1 text-left text-green-600 dark:text-green-400 font-medium">
                Unmute Notifications
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleMute1Hour}
                className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-xs hover:bg-accent transition-colors"
              >
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                <span className="flex-1 text-left">Mute for 1 hour</span>
              </button>
              <button
                type="button"
                onClick={handleMuteToday}
                className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-xs hover:bg-accent transition-colors"
              >
                <VolumeX className="h-3.5 w-3.5 text-amber-500" />
                <span className="flex-1 text-left">Mute for today</span>
              </button>
            </>
          )}

          <Separator />
          <button
            type="button"
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-xs hover:bg-accent transition-colors text-primary"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Notification preferences →</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ===== Notification Center Error Boundary =====
// If any sub-component throws (e.g., undefined icon, malformed data),
// catch it here so the bell button stays clickable. The worst case is
// the dropdown shows an empty state instead of crashing the whole app.

class NotificationErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[NotificationCenter] render crash caught:', error);
  }

  render() {
    if (this.state.hasError) return <>{this.props.fallback}</>;
    return <>{this.props.children}</>;
  }
}

// ===== Main Notification Center Component =====

export default function NotificationCenter() {
  const {
    notifications,
    addNotification,
    markAllAsRead,
    clearNotifications,
    preferences,
    isMuted,
  } = useNotificationStore();

  const initialized = useRef(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Responsive breakpoint detection using useSyncExternalStore
  const isLg = useSyncExternalStore(
    useCallback((callback: () => void) => {
      const mql = window.matchMedia('(min-width: 1024px)');
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    }, []),
    () => window.innerWidth >= 1024,
    () => true // Server: assume desktop
  );

  // Track which server-side notification IDs we've already added to the store
  // (and/or fired a toast for). Using stable server IDs avoids duplicate
  // toasts when the same notification title appears more than once.
  const seenNotifIdsRef = useRef<Set<string>>(new Set());

  // Map notification type → sonner toast method. Positive events (deal_won,
  // payment_success, etc.) use `success`; warnings use `warning`; errors use
  // `error`; everything else uses `info`.
  const showToastForType = useCallback(
    (type: NotificationType, title: string, message?: string) => {
      const Icon = NOTIFICATION_ICONS[type] || Bell;
      const iconEl = <Icon className="h-4 w-4 text-primary" />;
      const opts = {
        description: message,
        duration: 4000,
        icon: iconEl,
      };
      switch (type) {
        case 'deal_won':
        case 'payment_success':
        case 'meeting_completed':
        case 'calendar_connected':
        case 'calendar_synced':
        case 'sequence_completed':
        case 'new_lead_discovered':
        case 'team_member_joined':
          toast.success(title, opts);
          break;
        case 'deal_lost':
        case 'payment_failed':
        case 'credit_critical':
        case 'gmail_token_expired':
        case 'meeting_cancelled':
          toast.error(title, opts);
          break;
        case 'credit_low':
        case 'trial_ending':
        case 'calendar_disconnected':
          toast.warning(title, opts);
          break;
        default:
          toast.info(title, opts);
      }
    },
    []
  );

  // Helper: cap a Set to prevent unbounded memory growth
  const capSeenSet = useCallback((set: Set<string>) => {
    if (set.size > 200) {
      const entries = Array.from(set);
      return new Set(entries.slice(-100));
    }
    return set;
  }, []);

  // Fetch real notifications from API on mount. Initial items are added to the
  // store AND to seenNotifIdsRef so they don't trigger toast popups on the
  // first polling cycle (only polling-detected new notifications toast).
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function fetchNotifications() {
      try {
        const res = await fetch('/api/notifications?limit=20', {
          credentials: 'include',
        });
        if (!res.ok) {
          if (res.status === 401) {
            // User just not logged in — silently skip
            return;
          }
          if (res.status >= 500) {
            console.warn(
              '[NotificationCenter] Initial fetch returned',
              res.status,
              '— skipping'
            );
            return;
          }
          return;
        }
        const data = await res.json();
        // Defensive: handle null/undefined/malformed data without crashing
        const items = Array.isArray(data?.notifications)
          ? data.notifications
          : Array.isArray(data)
            ? data
            : [];
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          // Mark server ID as seen so first poll doesn't toast for it
          if (item.id) {
            seenNotifIdsRef.current = capSeenSet(seenNotifIdsRef.current);
            seenNotifIdsRef.current.add(String(item.id));
          }
          addNotification({
            // Pass the server/DB id through so markAsRead(id) can PATCH the
            // exact database row (otherwise persistence silently 404s).
            id: item.id ? String(item.id) : undefined,
            type: (item.type || 'info') as NotificationType,
            title: item.title || 'Notification',
            message: item.message || '',
            timestamp: item.createdAt ? new Date(item.createdAt) : new Date(),
          });
        }
      } catch (e) {
        console.error('[NotificationCenter] Failed to fetch notifications:', e);
      }
    }
    fetchNotifications();
  }, [addNotification, capSeenSet]);

  // Poll for new notifications every 30 seconds.
  // The 30-second interval is the minimum required cadence — do NOT make it
  // shorter. This is the fallback when WebSocket is unavailable.
  // Uses unreadOnly=true (the GET /api/notifications contract reads this param,
  // not `unread=true` which the previous code passed and the API silently
  // ignored).
  useEffect(() => {
    const interval = setInterval(async () => {
      const muted = isMuted();
      if (muted) return;

      try {
        const res = await fetch('/api/notifications?limit=5&unreadOnly=true', {
          credentials: 'include',
        });
        if (!res.ok) {
          if (res.status === 401) {
            // Not logged in — silently skip (don't toast)
            return;
          }
          if (res.status >= 500) {
            // Server error — log warning but don't spam toast
            console.warn(
              '[NotificationCenter] Polling fetch returned',
              res.status,
              '— skipping this cycle'
            );
          }
          return;
        }
        let data: unknown;
        try {
          data = await res.json();
        } catch (parseErr) {
          // Malformed JSON — silently skip without crashing the interval
          console.warn('[NotificationCenter] Polling JSON parse failed:', parseErr);
          return;
        }
        // Defensive: handle null/undefined/malformed data without crashing
        const items = Array.isArray((data as any)?.notifications)
          ? (data as any).notifications
          : Array.isArray(data)
            ? data
            : [];
        const newItems = (items as Array<{ id?: string; createdAt?: string; type?: string; title?: string; message?: string }>).filter(
          (item) => {
            if (!item || typeof item !== 'object') return false;
            const id = item.id ? String(item.id) : '';
            // Treat as new only if it has a server ID we haven't seen yet
            return id && !seenNotifIdsRef.current.has(id);
          }
        );
        for (const item of newItems) {
          const notifType = (item.type || 'info') as NotificationType;
          const id = String(item.id);
          // Cap the seen-IDs set to prevent unbounded memory growth
          seenNotifIdsRef.current = capSeenSet(seenNotifIdsRef.current);
          seenNotifIdsRef.current.add(id);
          addNotification({
            id,
            type: notifType,
            title: item.title || 'Notification',
            message: item.message || '',
            timestamp: item.createdAt ? new Date(item.createdAt) : new Date(),
          });

          // Play sound if tab is not focused and sound is enabled
          if (preferences.soundEnabled && !document.hasFocus()) {
            playNotificationSound();
          }

          // Show toast popup for polling-detected new notifications only.
          // (Initial-fetch items are pre-seeded into seenNotifIdsRef so they
          // never reach this branch.)
          showToastForType(
            notifType,
            item.title || 'New Notification',
            item.message
          );
        }
      } catch (e) {
        // Silent fail for polling — don't spam toasts on network errors
        console.warn('[NotificationCenter] Polling cycle error:', e);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [addNotification, preferences.soundEnabled, isMuted, showToastForType, capSeenSet]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Handle bell click: desktop uses popover, mobile uses sheet
  const handleBellClick = useCallback(() => {
    if (!isLg) {
      setMobileOpen(true);
    }
  }, [isLg]);

  const muted = isMuted();

  // Bell trigger button
  const bellButton = (
    <button
      type="button"
      className={cn(
        'relative shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors',
        'text-muted-foreground hover:text-foreground hover:bg-accent',
        muted && 'text-amber-500 hover:text-amber-600'
      )}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}${muted ? ' (muted)' : ''}`}
      onClick={handleBellClick}
    >
      {muted ? (
        <Bell className="h-4 w-4 opacity-50" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      {unreadCount > 0 && (
        <motion.span
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </motion.span>
      )}
    </button>
  );

  // Shared header content
  const headerContent = (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold">Notifications</h4>
        {unreadCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary">
            {unreadCount} new
          </Badge>
        )}
        {muted && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-600 dark:text-amber-400">
            Muted
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        <NotificationPreferences />
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-primary hover:text-primary"
            onClick={markAllAsRead}
          >
            <CheckCheck className="h-3 w-3 mr-1" />
            Read
          </Button>
        )}
        {notifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={clearNotifications}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <NotificationErrorBoundary
      fallback={
        <button
          type="button"
          className="relative inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Notifications (temporarily unavailable)"
          onClick={() => toast.error('Notifications are temporarily unavailable. Please refresh the page.')}
        >
          <Bell className="h-4 w-4" />
        </button>
      }
    >
      {/* Desktop: Popover */}
      {isLg && (
        <Popover open={desktopOpen} onOpenChange={setDesktopOpen}>
          <PopoverTrigger asChild>
            {bellButton}
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="w-80 sm:w-96 p-0 rounded-xl shadow-2xl border-border/50 z-[100] overflow-hidden"
          >
            {headerContent}
            <NotificationListContent compact />
          </PopoverContent>
        </Popover>
      )}

      {/* Mobile: Full-screen Sheet */}
      {!isLg && (
        <>
          {bellButton}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent
              side="bottom"
              className="h-[95vh] rounded-t-2xl p-0 flex flex-col"
            >
              <SheetTitle className="sr-only">Notifications</SheetTitle>
              <SheetDescription className="sr-only">Your notification center</SheetDescription>
              {headerContent}
              <div className="flex-1 min-h-0">
                <NotificationListContent />
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </NotificationErrorBoundary>
  );
}
