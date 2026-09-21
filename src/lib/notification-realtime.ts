/**
 * Notification real-time delivery — module-level SINGLETON.
 *
 * NotificationCenter is mounted three times in the dashboard layout (mobile
 * header, sidebar footer, desktop topbar). Each instance used to open its
 * OWN EventSource to /api/events/notifications, so a single backend event
 * was processed three times: three store additions (deduped by id), three
 * unread-count increments (WRONG badge: +3 instead of +1) and up to three
 * identical toasts.
 *
 * This module guarantees exactly ONE EventSource connection and ONE
 * processing pass per event, no matter how many component instances are
 * mounted. Consumers use acquire/release (reference counted): the
 * connection opens on first acquire and closes on the last release.
 *
 * Processing per event (exactly once):
 *   1. De-duplicate by server notification id.
 *   2. Add to the shared zustand notification store (persisted id kept).
 *   3. Increment the authoritative server unread count (badge).
 *   4. Toast + chime (respecting the mute preference and sound setting).
 */
import { toast } from 'sonner';
import {
  useNotificationStore,
  type NotificationType,
} from '@/lib/store';

let eventSource: EventSource | null = null;
let refCount = 0;
const seenIds = new Set<string>();

function capSeenIds() {
  if (seenIds.size > 500) {
    const entries = Array.from(seenIds);
    seenIds.clear();
    for (const id of entries.slice(-250)) seenIds.add(id);
  }
}

/** Map a notification type to a sonner toast severity + call. */
function toastForType(type: NotificationType, title: string, message?: string) {
  const opts = { description: message, duration: 4000 };
  switch (type) {
    case 'deal_won':
    case 'payment_success':
    case 'meeting_completed':
    case 'calendar_connected':
    case 'calendar_synced':
    case 'sequence_completed':
    case 'new_lead_discovered':
    case 'team_member_joined':
    case 'workflow_completed':
    case 'workflow_execution_complete':
    case 'discovery_completed':
    case 'campaign_completed':
    case 'api_key_created':
    case 'subscription_renewed':
    case 'refund_processed':
    case 'credit_assigned':
      toast.success(title, opts);
      break;
    case 'deal_lost':
    case 'payment_failed':
    case 'credit_critical':
    case 'gmail_token_expired':
    case 'meeting_cancelled':
    case 'workflow_failed':
    case 'discovery_failed':
    case 'campaign_failed':
    case 'api_key_revoked':
    case 'security_alert':
    case 'chargeback_received':
    case 'subscription_expired':
      toast.error(title, opts);
      break;
    case 'credit_low':
    case 'trial_ending':
    case 'calendar_disconnected':
    case 'subscription_cancelling':
      toast.warning(title, opts);
      break;
    default:
      toast.info(title, opts);
  }
}

/** Two-tone chime (shared with the polling path in the component). */
let audioContext: AudioContext | null = null;
function playNotificationSound() {
  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext();
    }
    const ctx = audioContext;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc1.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.15);
    osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.25);
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

function handleNotificationEvent(raw: string) {
  try {
    const payload = JSON.parse(raw) as {
      id?: string;
      type?: string;
      title?: string;
      message?: string;
      read?: boolean;
      actionUrl?: string | null;
      createdAt?: string;
    };
    const id = payload?.id ? String(payload.id) : '';
    if (!id || seenIds.has(id)) return;
    capSeenIds();
    seenIds.add(id);

    const store = useNotificationStore.getState();
    const notifType = (payload.type || 'info') as NotificationType;

    // One store add (store also dedupes defensively) + one badge increment.
    store.addNotification({
      id,
      type: notifType,
      title: payload.title || 'Notification',
      message: payload.message || '',
      timestamp: payload.createdAt ? new Date(payload.createdAt) : new Date(),
      read: payload.read ?? false,
      actionUrl: payload.actionUrl ?? null,
    });
    if (!payload.read) {
      store.adjustServerUnreadCount(1);
    }

    // Toast + chime once, honoring the mute preference.
    if (!store.isMuted()) {
      if (store.preferences.soundEnabled && !document.hasFocus()) {
        playNotificationSound();
      }
      toastForType(notifType, payload.title || 'New Notification', payload.message);
    }
  } catch (parseErr) {
    console.warn('[NotificationRealtime] SSE payload parse failed:', parseErr);
  }
}

/**
 * Open (once) the shared SSE connection. Safe to call from every mounted
 * NotificationCenter instance; the connection is shared.
 */
export function acquireNotificationRealtime(): void {
  refCount += 1;
  if (eventSource || typeof window === 'undefined') return;
  try {
    const es = new EventSource('/api/events/notifications');
    es.addEventListener('notification_created', (ev) => {
      handleNotificationEvent((ev as MessageEvent).data as string);
    });
    // EventSource auto-reconnects on error; polling in the component is the
    // fallback for dropped connections.
    es.onerror = () => {
      /* auto-reconnect */
    };
    eventSource = es;
  } catch {
    // EventSource unavailable — polling fallback remains active.
    eventSource = null;
  }
}

/**
 * Release one consumer. Closes the shared connection when the last
 * consumer unmounts.
 */
export function releaseNotificationRealtime(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

/** Test/diagnostic helper: whether the shared connection is open. */
export function isNotificationRealtimeConnected(): boolean {
  return eventSource !== null;
}
