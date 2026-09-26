/**
 * ACCOUNT ISOLATION (client cache layer).
 *
 * Purges every account-scoped client-side cache. Called on sign-out (and
 * available for account switches) so the next authenticated account can
 * never briefly observe the previous account's data through persisted
 * browser state:
 *
 *  - React Query snapshots    → cleared via the `aqos:auth-logout` window
 *                               event (providers.tsx listens and calls
 *                               queryClient.clear()).
 *  - Discovery jobs/history   → `acquisitionos_discovery_*`
 *  - Assistant saved replies  → `acq-os-saved-responses`
 *  - Assistant pinned msgs    → `acq-os-pinned-messages`
 *  - Onboarding local mirror  → `acquisitionos_onboarding_*` (DB is the
 *                               source of truth; the mirror is re-created
 *                               from the DB on next login)
 *  - Settings-shell persists  → `war-room-settings` zustand store reset
 *
 * Theme (`acquisitionos-theme`) and the auth identity key are NOT removed
 * here: theme is device-level, and the auth store's own logout() owns the
 * identity snapshot.
 */

/** Zustand settings store with persistence (`war-room-settings`). */
export function resetPersistedSettingsStore(): void {
  // Imported lazily to keep this module dependency-light and avoid cycles.
  import('@/lib/settings-store')
    .then(({ useSettingsStore }) => useSettingsStore.getState().resetAll())
    .catch(() => {
      // Store unavailable — nothing else to do.
    });
}

export function clearAccountScopedClientState(): void {
  if (typeof window === 'undefined') return;

  const KEYS_TO_REMOVE = [
    'acquisitionos_discovery_jobs',
    'acquisitionos_discovery_history',
    'acq-os-saved-responses',
    'acq-os-pinned-messages',
    'acquisitionos_onboarding_completed',
    'acquisitionos_onboarding_data',
  ];
  for (const key of KEYS_TO_REMOVE) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage unavailable — ignore.
    }
  }

  resetPersistedSettingsStore();
}
