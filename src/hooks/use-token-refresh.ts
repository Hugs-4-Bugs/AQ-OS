'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/lib/auth-store';

const REFRESH_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes (tokens expire in 15 min)
// ── P4 (Sep 2026): bounded backoff for infrastructure failures ──────
// A 5xx/network failure during refresh is "temporarily unavailable", NOT
// "logged out". We retry with bounded exponential backoff (60s → 120s →
// 240s → 480s, capped). After MAX_CONSECUTIVE_INFRA_FAILURES the interval
// stays at the cap until the backend recovers — bounded, no infinite tight
// loop, and the user is never falsely logged out.
const INFRA_BACKOFF_STEPS_MS = [60_000, 120_000, 240_000, 480_000];
const MAX_CONSECUTIVE_INFRA_FAILURES = 12;

/** Auth-error codes from /api/auth/refresh that mean REAL logout. */
const REAL_LOGOUT_CODES = new Set([
  'NO_TOKEN',
  'INVALID_TOKEN',
  'SESSION_EXPIRED',
  'SESSION_IDLE_EXPIRED',
  'SESSION_REVOKED',
  'USER_UNAVAILABLE',
]);

export function useTokenRefresh() {
  const { isAuthenticated, setUser, logout } = useAuthStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshing = useRef(false);
  const infraFailures = useRef(0);

  const refreshTokens = useCallback(async () => {
    // Prevent concurrent refreshes
    if (isRefreshing.current) return;
    isRefreshing.current = true;

    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        infraFailures.current = 0; // recovered
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
        }
        return;
      }

      // ── Read the machine-readable code (P4 semantics) ────────────
      let code = '';
      try {
        const data = await res.json();
        code = data?.code || '';
      } catch { /* non-JSON body — treat by status */ }

      if (res.status === 401 || res.status === 403) {
        // Only an AUTHORITATIVE invalid-session response logs the user
        // out. If the server says something we don't recognize (legacy
        // 401 without code), treat it as authoritative logout too — but
        // 503-style codes arriving on 401 are never trusted.
        if (code && !REAL_LOGOUT_CODES.has(code)) {
          // Unknown/non-logout code on 401 — do NOT log out (safety:
          // e.g. proxy weirdness); retry on backoff instead.
          infraFailures.current = Math.min(infraFailures.current + 1, MAX_CONSECUTIVE_INFRA_FAILURES);
          return;
        }
        logout();
        return;
      }

      // 5xx / 429 / anything else → infrastructure or transient failure.
      // NEVER logout on these.
      infraFailures.current = Math.min(infraFailures.current + 1, MAX_CONSECUTIVE_INFRA_FAILURES);
    } catch {
      // Network error — don't log out, count a transient failure
      infraFailures.current = Math.min(infraFailures.current + 1, MAX_CONSECUTIVE_INFRA_FAILURES);
    } finally {
      isRefreshing.current = false;
    }
  }, [setUser, logout]);

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
        refreshTokens();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, refreshTokens]);
}
