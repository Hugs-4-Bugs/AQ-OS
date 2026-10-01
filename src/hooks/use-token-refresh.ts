'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { silentRefresh, isAuthoritativeLogout } from '@/lib/silent-refresh';

const REFRESH_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes (tokens expire in 15 min)
// ── P4 (Sep 2026): bounded backoff for infrastructure failures ──────
// A 5xx/network failure during refresh is "temporarily unavailable", NOT
// "logged out". We retry with bounded exponential backoff (60s → 120s →
// 240s → 480s, capped). After MAX_CONSECUTIVE_INFRA_FAILURES the interval
// stays at the cap until the backend recovers — bounded, no infinite tight
// loop, and the user is never falsely logged out.
const INFRA_BACKOFF_STEPS_MS = [60_000, 120_000, 240_000, 480_000];
const MAX_CONSECUTIVE_INFRA_FAILURES = 12;

export function useTokenRefresh() {
  const { isAuthenticated, setUser, logout } = useAuthStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshing = useRef(false);
  const infraFailures = useRef(0);

  const doRefresh = useCallback(
    async (force: boolean) => {
      // Prevent concurrent refreshes within this tab. Cross-tab concurrency
      // is serialized inside silentRefresh() via the Web Locks API —
      // without that, two tabs racing the same pre-rotation cookie caused
      // a false SESSION_REVOKED and logged the user out (RCA 2026-09-29).
      if (isRefreshing.current) return;
      isRefreshing.current = true;

      try {
        const result = await silentRefresh({ force });

        if (result.ok) {
          infraFailures.current = 0; // recovered
          if (result.user) {
            setUser(result.user);
          }
          return;
        }

        if (isAuthoritativeLogout(result)) {
          // Only an AUTHORITATIVE invalid-session response logs the user
          // out (SESSION_EXPIRED / SESSION_REVOKED / INVALID_TOKEN / ...).
          logout();
          return;
        }

        // 401/403 with a non-logout code, 5xx, 429, network errors →
        // infrastructure or transient failure. NEVER logout on these.
        infraFailures.current = Math.min(infraFailures.current + 1, MAX_CONSECUTIVE_INFRA_FAILURES);
      } finally {
        isRefreshing.current = false;
      }
    },
    [setUser, logout]
  );

  // Interval refresh MUST be forced: it is the keep-alive that prevents
  // the 15-minute access token from expiring between intervals. The
  // visibility/focus refresh is throttled inside silentRefresh (skipped
  // when a refresh succeeded within the last 10 minutes) to avoid
  // pointless token rotation on every tab switch.
  const refreshTokens = useCallback(() => doRefresh(true), [doRefresh]);
  const refreshOnFocus = useCallback(() => doRefresh(false), [doRefresh]);

  // ── Set up interval timer (with bounded infra backoff) ─────────
  useEffect(() => {
    if (!isAuthenticated) {
      infraFailures.current = 0;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const scheduleNext = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const step = Math.min(infraFailures.current, INFRA_BACKOFF_STEPS_MS.length - 1);
      const interval = infraFailures.current === 0 ? REFRESH_INTERVAL_MS : INFRA_BACKOFF_STEPS_MS[step];
      timerRef.current = setInterval(() => {
        refreshTokens().then(scheduleNext);
      }, interval);
    };

    scheduleNext();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAuthenticated, refreshTokens]);

  // ── Handle visibility change (refresh when tab becomes active) ─
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshOnFocus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, refreshOnFocus]);
}
