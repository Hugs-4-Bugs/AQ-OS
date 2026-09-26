/**
 * Notification click-through navigation.
 *
 * Maps a notification's `actionUrl` (as written by backend event producers)
 * onto the AcquisitionOS SPA tab system where a meaningful in-app destination
 * exists, and falls back to real navigation for routes that live outside the
 * SPA (admin console, dashboard sub-apps, external links).
 *
 * Returns `true` when some navigation was performed, `false` when the URL
 * had no resolvable destination (caller keeps the notification purely
 * informational).
 */
import { pathToTab, useAppStore } from '@/lib/store';
import type { TabId } from '@/lib/types';

/** Legacy absolute paths written by older producers → their SPA tabs. */
const LEGACY_PREFIXES: Array<{ prefix: string; tab: TabId }> = [
  { prefix: '/business-ai', tab: 'overview' }, // handled via pathToTab below
  { prefix: '/leads', tab: 'leads' },
  { prefix: '/pipeline', tab: 'pipeline' },
  { prefix: '/discover', tab: 'discover' },
  { prefix: '/outreach', tab: 'outreach' },
  { prefix: '/workflows', tab: 'workflows' },
  { prefix: '/messaging', tab: 'messaging' },
  { prefix: '/assistant', tab: 'assistant' },
  { prefix: '/insights', tab: 'insights' },
  { prefix: '/analytics', tab: 'insights' },
  { prefix: '/deals', tab: 'deals' },
  { prefix: '/proposals', tab: 'deals' },
  { prefix: '/competitors', tab: 'competitors' },
  { prefix: '/settings', tab: 'settings' },
];

/**
 * Navigate to the notifications history page (SPA tab `notifications`).
 * Used by the bell panel's "View All Notifications" link and the
 * notifications page itself.
 */
export function openNotificationsPage(): void {
  useAppStore.getState().setActiveTab('notifications');
}

/**
 * Navigate to the existing Notification Preferences UI — the Notifications
 * section inside the Settings shell (Settings → Notifications). Requests the
 * section via the app store's one-shot deep-link so the Settings shell opens
 * directly on it. No duplicate preferences page is created: the click-through
 * lands on the single source of truth for notification settings.
 */
export function openNotificationPreferences(): void {
  useAppStore.getState().requestSettingsSection('notifications');
}

export function navigateNotificationTarget(actionUrl: string | null | undefined): boolean {
  if (!actionUrl) return false;
  const store = useAppStore.getState();
  const url = actionUrl.trim();

  // 1. Direct SPA tab routes (/business-ai/* or '/')
  const pathOnly = url.split('?')[0];
  const directTab = pathToTab(pathOnly);
  if (directTab) {
    store.setActiveTab(directTab);
    return true;
  }

  // 2. Lead detail (/leads/<id>) → Leads tab with the lead pre-selected
  const leadMatch = url.match(/^\/leads\/([^/?#]+)/);
  if (leadMatch) {
    store.setSelectedLeadId(decodeURIComponent(leadMatch[1]));
    store.setActiveTab('leads');
    return true;
  }

  // 3. Legacy top-level paths → SPA tabs (longest prefix wins)
  const sorted = [...LEGACY_PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { prefix, tab } of sorted) {
    if (pathOnly === prefix || pathOnly.startsWith(prefix + '/')) {
      // The /business-ai entry is only a catch-all when pathToTab failed
      // (unknown sub-path) — land on overview rather than doing nothing.
      store.setActiveTab(tab);
      return true;
    }
  }

  // 4. In-app non-SPA routes (admin console, dashboard sub-apps)
  if (url.startsWith('/')) {
    window.location.assign(url);
    return true;
  }

  // 5. Absolute external URL → new tab
  if (/^https?:\/\//i.test(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  return false;
}
