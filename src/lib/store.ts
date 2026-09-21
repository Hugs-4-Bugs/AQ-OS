import { create } from "zustand";
import type { TabId } from "./types";

// ===== Notification Types =====
export type NotificationType =
  | "email_reply"
  | "deal_won"
  | "deal_lost"
  | "credit_low"
  | "credit_critical"
  | "credit_assigned"
  | "payment_success"
  | "payment_failed"
  | "payment"
  | "trial_ending"
  | "new_lead_discovered"
  | "analysis_complete"
  | "analysis"
  | "sequence_completed"
  | "workflow_triggered"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_execution_complete"
  | "discovery_completed"
  | "discovery_failed"
  | "campaign_completed"
  | "campaign_failed"
  | "api_key_created"
  | "api_key_revoked"
  | "security_alert"
  | "subscription_renewed"
  | "subscription_cancelling"
  | "subscription_expired"
  | "refund_processed"
  | "chargeback_received"
  | "lead_reply"
  | "lead_pipeline_update"
  | "lead_stage_moved"
  | "team_invite"
  | "team_member_joined"
  | "gmail_token_expired"
  | "system"
  | "info"
  // Meeting & Calendar types
  | "meeting_scheduled"
  | "meeting_completed"
  | "meeting_cancelled"
  | "meeting_reminder"
  | "meeting_rescheduled"
  | "calendar_synced"
  | "calendar_connected"
  | "calendar_disconnected"
  // Legacy types (keep for compat)
  | "lead_created"
  | "stage_advanced"
  | "outreach_sent";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  /** Optional in-app destination (e.g. "/business-ai/leads"). Present when
   *  the backend event has a meaningful click-through target. */
  actionUrl?: string | null;
}

interface AppState {
  activeTab: TabId;
  selectedLeadId: string | null;
  sidebarOpen: boolean; // mobile sheet open/close
  sidebarCollapsed: boolean; // desktop sidebar collapsed state

  setActiveTab: (tab: TabId) => void;
  setSelectedLeadId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

// localStorage key for the desktop sidebar collapsed preference (client-only
// UI preference — intentionally NOT stored in the database).
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'acquisitionos_sidebar_collapsed';

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: "overview",
  selectedLeadId: null,
  sidebarOpen: false,
  sidebarCollapsed: false,

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    // Sync URL when tab changes (client-side only)
    if (typeof window !== 'undefined') {
      const path = tabToPath(tab);
      const currentPath = window.location.pathname;
      if (currentPath !== path) {
        window.history.pushState({ tab }, '', path);
      }
    }
  },
  setSelectedLeadId: (id) => set({ selectedLeadId: id }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  // Persist the collapsed preference so a refresh restores the user's choice.
  // Initial render always uses the expanded default (SSR-safe); the persisted
  // value is re-applied after mount by the layout's hydration effect.
  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
      } catch {
        // storage unavailable (private mode / quota) — preference stays in-memory
      }
    }
  },
}));

/**
 * Maps a TabId to a URL pathname.
 * Uses /business-ai/<tab> prefix for tab-specific URLs.
 */
export function tabToPath(tab: TabId): string {
  // Map internal tab IDs to business-ai URL slugs
  const TAB_PATH_MAP: Record<TabId, string> = {
    overview: '/',
    leads: '/business-ai/leads',
    pipeline: '/business-ai/pipeline',
    discover: '/business-ai/discover',
    outreach: '/business-ai/outreach',
    workflows: '/business-ai/workflows',
    messaging: '/business-ai/messaging',
    assistant: '/business-ai/assistant',
    insights: '/business-ai/analytics',
    deals: '/business-ai/proposals',
    competitors: '/business-ai/competitors',
    notifications: '/business-ai/notifications',
    settings: '/business-ai/settings',
  };
  return TAB_PATH_MAP[tab] || '/';
}

/**
 * Maps a URL pathname to a TabId.
 * Returns null if the path doesn't map to any tab.
 */
export function pathToTab(pathname: string): TabId | null {
  // Normalize: remove trailing slash
  const path = pathname.replace(/\/+$/, '');
  // Map business-ai URL slugs back to internal tab IDs
  const PATH_TAB_MAP: Record<string, TabId> = {
    '/': 'overview',
    '/business-ai/leads': 'leads',
    '/business-ai/pipeline': 'pipeline',
    '/business-ai/discover': 'discover',
    '/business-ai/outreach': 'outreach',
    '/business-ai/workflows': 'workflows',
    '/business-ai/messaging': 'messaging',
    '/business-ai/assistant': 'assistant',
    '/business-ai/analytics': 'insights',
    '/business-ai/proposals': 'deals',
    '/business-ai/competitors': 'competitors',
    '/business-ai/notifications': 'notifications',
    '/business-ai/settings': 'settings',
  };
  return PATH_TAB_MAP[path] || null;
}

// ===== Notification Store =====
const MAX_NOTIFICATIONS = 50;

interface NotificationPreferences {
  soundEnabled: boolean;
  mutedUntil: number | null; // timestamp when mute expires, null = not muted
}

interface NotificationState {
  notifications: Notification[];
  preferences: NotificationPreferences;
  /** Authoritative unread count from the server (GET /api/notifications
   *  `unreadCount` / SSE). `null` until the first server sync — the UI falls
   *  back to counting local items. Guarantees the bell badge stays accurate
   *  even when unread notifications exceed the local 50-item store cap. */
  serverUnreadCount: number | null;
  setServerUnreadCount: (count: number) => void;
  adjustServerUnreadCount: (delta: number) => void;
  addNotification: (notification: Omit<Notification, "id" | "read"> & { id?: string; read?: boolean }) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  removeNotification: (id: string) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setMutedUntil: (until: number | null) => void;
  isMuted: () => boolean;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  serverUnreadCount: null,
  preferences: {
    soundEnabled: true,
    mutedUntil: null,
  },

  setServerUnreadCount: (count) =>
    set({ serverUnreadCount: Math.max(0, count) }),

  adjustServerUnreadCount: (delta) =>
    set((state) => ({
      serverUnreadCount:
        state.serverUnreadCount === null
          ? null
          : Math.max(0, state.serverUnreadCount + delta),
    })),

  addNotification: (notification) =>
    set((state) => {
      const newNotification: Notification = {
        ...notification,
        // FIX: preserve the caller-provided id when present (e.g. the DB id
        // from GET /api/notifications) so markAsRead(id) can PATCH the exact
        // database row. Only generate a synthetic id for local-only items.
        id: notification.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        // SSE-delivered notifications arrive already persisted and unread;
        // local-only callers (follow-up reminders) also expect unread.
        read: notification.read ?? false,
      };
      // Guard against the same server row being added twice (SSE + polling
      // fallback can both observe the same notification).
      if (state.notifications.some((n) => n.id === newNotification.id)) {
        return state;
      }
      const updated = [newNotification, ...state.notifications];
      return { notifications: updated.slice(0, MAX_NOTIFICATIONS) };
    }),

  markAsRead: (id) => {
    const target = get().notifications.find((n) => n.id === id);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      // Keep the authoritative server count in sync (optimistic).
      serverUnreadCount:
        state.serverUnreadCount === null
          ? null
          : target && !target.read
            ? Math.max(0, state.serverUnreadCount - 1)
            : state.serverUnreadCount,
    }));
    // Persist mark-as-read to the backend API (fire-and-forget, optimistic).
    // PATCH /api/notifications/[id]/read — alias route that exists alongside
    // PATCH /api/notifications/[id]. credentials:'include' ensures session
    // cookie is sent on cross-origin/gateway requests.
    fetch(`/api/notifications/${id}/read`, {
      method: 'PATCH',
      credentials: 'include',
    }).catch((err) => {
      // Optimistic: keep the local state updated even if the API call fails.
      console.warn(
        `[store] markAsRead API call failed for id=${id} (kept optimistic state):`,
        err
      );
    });
  },

  markAllAsRead: () => {
    const state = get();
    set({ notifications: state.notifications.map((n) => ({ ...n, read: true })), serverUnreadCount: 0 });
    // Persist mark-all-as-read to the backend API (fire-and-forget, optimistic).
    // POST /api/notifications/mark-read with empty JSON body marks ALL as read
    // for the authenticated user. Body must be valid JSON (the route calls
    // request.json() and throws on empty body), so we send `{}`.
    fetch('/api/notifications/mark-read', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch((err) => {
      // Optimistic: keep the local state updated even if the API call fails.
      console.warn(
        '[store] markAllAsRead API call failed (kept optimistic state):',
        err
      );
    });
  },

  clearNotifications: () => set({ notifications: [] }),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  setSoundEnabled: (enabled) =>
    set((state) => ({
      preferences: { ...state.preferences, soundEnabled: enabled },
    })),

  setMutedUntil: (until) =>
    set((state) => ({
      preferences: { ...state.preferences, mutedUntil: until },
    })),

  isMuted: () => {
    const { preferences } = get();
    if (!preferences.mutedUntil) return false;
    return Date.now() < preferences.mutedUntil;
  },
}));
