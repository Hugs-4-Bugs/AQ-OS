'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ElementType,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Users,
  Handshake,
  Bell,
  X,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp?: Date;
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss time in milliseconds, default 8000 */
  duration?: number;
}

export interface NotificationToastStackProps {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
  onClearAll?: () => void;
  /** Maximum visible notifications in the stack, default 5 */
  maxVisible?: number;
  /** Corner position, default 'bottom-right' */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

// ─── Notification type config ───────────────────────────────────────────────

interface TypeConfig {
  icon: ElementType;
  color: string;
  bg: string;
  border: string;
  progress: string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  success: {
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-l-green-500',
    progress: 'bg-green-500',
  },
  error: {
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-l-red-500',
    progress: 'bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-l-amber-500',
    progress: 'bg-amber-500',
  },
  info: {
    icon: Info,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-l-blue-500',
    progress: 'bg-blue-500',
  },
  lead: {
    icon: Users,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-l-purple-500',
    progress: 'bg-purple-500',
  },
  deal: {
    icon: Handshake,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-l-emerald-500',
    progress: 'bg-emerald-500',
  },
  reminder: {
    icon: Bell,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-l-orange-500',
    progress: 'bg-orange-500',
  },
};

const DEFAULT_CONFIG: TypeConfig = {
  icon: Info,
  color: 'text-blue-500',
  bg: 'bg-blue-500/10',
  border: 'border-l-blue-500',
  progress: 'bg-blue-500',
};

// ─── Position helpers ───────────────────────────────────────────────────────

function positionClasses(position: string) {
  switch (position) {
    case 'bottom-left':
      return 'bottom-4 left-4';
    case 'top-right':
      return 'top-4 right-4 flex-col';
    case 'top-left':
      return 'top-4 left-4 flex-col';
    default:
      return 'bottom-4 right-4';
  }
}

function slideVariants(position: string) {
  const isRight = position.includes('right');
  const isTop = position.includes('top');
  return {
    initial: {
      opacity: 0,
      x: isRight ? 80 : -80,
      y: 0,
      scale: 0.95,
    },
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
    },
    exit: {
      opacity: 0,
      x: isRight ? 120 : -120,
      scale: 0.9,
      transition: { duration: 0.25, ease: 'easeIn' },
    },
  };
}

// ─── Time formatting ────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

// ─── Single Toast Card ─────────────────────────────────────────────────────

function ToastCard({
  notification,
  index,
  stackSize,
  onDismiss,
}: {
  notification: NotificationItem;
  index: number;
  stackSize: number;
  onDismiss: (id: string) => void;
}) {
  const config = TYPE_CONFIG[notification.type] ?? DEFAULT_CONFIG;
  const Icon = config.icon;
  const duration = notification.duration ?? 8000;

  const [remaining, setRemaining] = useState(duration);
  const [isPaused, setIsPaused] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const rafRef = useRef<number>(0);

  // Countdown progress via rAF for smooth progress bar
  useEffect(() => {
    if (isPaused) {
      startTimeRef.current = Date.now() - (duration - remaining);
      return;
    }

    startTimeRef.current = Date.now() - (duration - remaining);

    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
      if (left > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onDismiss(notification.id);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPaused, duration, notification.id]);

  // Older items get a slight scale reduction
  const scaleOffset = Math.min(index * 0.015, 0.06);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 - scaleOffset }}
      exit={{ opacity: 0, x: 120, scale: 0.9, transition: { duration: 0.25, ease: 'easeIn' } }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: index * 0.04 }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-border/60 border-l-[3px]',
        'backdrop-blur-xl bg-card/90',
        'depth-shadow-md glass-card-premium',
        'transition-shadow hover:shadow-lg',
        config.border,
      )}
      style={{ maxWidth: '100%' }}
    >
      {/* ── Header row: icon + title + dismiss ── */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-1">
        {/* Type icon */}
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            config.bg,
          )}
        >
          <Icon className={cn('h-4 w-4', config.color)} />
        </div>

        {/* Title & message */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-sm font-semibold leading-tight text-foreground">
              {notification.title}
            </h4>
            {notification.timestamp && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground/60">
                <Clock className="h-2.5 w-2.5" />
                {formatRelativeTime(notification.timestamp)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/80 line-clamp-2">
            {notification.message}
          </p>
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(notification.id);
          }}
          className={cn(
            'shrink-0 rounded-md p-1 text-muted-foreground/40 transition-colors',
            'hover:bg-accent hover:text-muted-foreground',
          )}
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Optional action button ── */}
      {notification.actionLabel && (
        <div className="px-4 pt-1 pb-2">
          <Button
            variant="default"
            size="sm"
            className="h-7 rounded-md px-3 text-xs font-medium"
            onClick={(e) => {
              e.stopPropagation();
              notification.onAction?.();
              onDismiss(notification.id);
            }}
          >
            {notification.actionLabel}
          </Button>
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="h-[3px] w-full bg-border/30">
        <motion.div
          className={cn('h-full rounded-full', config.progress)}
          initial={{ width: '100%' }}
          animate={{ width: isPaused ? undefined : `${(remaining / duration) * 100}%` }}
          style={
            !isPaused
              ? undefined
              : { width: `${(remaining / duration) * 100}%` }
          }
          transition={{ duration: 0.1, ease: 'linear' }}
        />
      </div>
    </motion.div>
  );
}

// ─── useNotificationStack hook ──────────────────────────────────────────────

export function useNotificationStack() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const addNotification = useCallback(
    (item: Omit<NotificationItem, 'id'>): string => {
      const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setNotifications((prev) => [
        { ...item, id },
        ...prev,
      ].slice(0, 100));
      return id;
    },
    [],
  );

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    addNotification,
    dismissNotification,
    clearAll,
  };
}

// ─── Main Stack Component ───────────────────────────────────────────────────

export function NotificationToastStack({
  notifications,
  onDismiss,
  onClearAll,
  maxVisible = 5,
  position = 'bottom-right',
}: NotificationToastStackProps) {
  const visible = notifications.slice(0, maxVisible);
  const hasOverflow = notifications.length > maxVisible;

  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col-reverse gap-1',
        'max-w-sm w-[calc(100%-2rem)] sm:max-w-md',
        positionClasses(position),
      )}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {/* Clear all button — shown when there are notifications */}
      {notifications.length > 1 && onClearAll && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          type="button"
          onClick={onClearAll}
          className={cn(
            'self-end mb-1 rounded-lg px-3 py-1.5 text-[11px] font-medium',
            'text-muted-foreground/60 hover:text-muted-foreground',
            'bg-background/60 backdrop-blur-md border border-border/40',
            'transition-colors hover:bg-accent/50',
          )}
        >
          Dismiss all ({notifications.length})
        </motion.button>
      )}

      {/* Toast cards */}
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((notification, index) => (
          <ToastCard
            key={notification.id}
            notification={notification}
            index={index}
            stackSize={visible.length}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>

      {/* Overflow indicator */}
      {hasOverflow && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-lg',
            'px-4 py-2 text-[11px] font-medium text-muted-foreground/70',
            'bg-background/60 backdrop-blur-md border border-border/40',
          )}
        >
          +{notifications.length - maxVisible} more notification{notifications.length - maxVisible !== 1 ? 's' : ''}
        </motion.div>
      )}
    </div>
  );
}

// ─── Real Notification Integration Wrapper ──────────────────────────────────

function NotificationToastStackWrapper() {
  const { notifications, addNotification, dismissNotification, clearAll } =
    useNotificationStack();

  // Fetch initial notifications from API
  useEffect(() => {
    fetch('/api/notifications')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => {
        if (d.notifications && Array.isArray(d.notifications)) {
          d.notifications.forEach((n: Omit<NotificationItem, 'id'>) => {
            addNotification(n);
          });
        }
      })
      .catch(() => {});
  }, [addNotification]);

  return (
    <NotificationToastStack
      notifications={notifications}
      onDismiss={dismissNotification}
      onClearAll={clearAll}
      maxVisible={5}
      position="bottom-right"
    />
  );
}

export default NotificationToastStackWrapper;
