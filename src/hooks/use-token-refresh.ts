'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/lib/auth-store';

const REFRESH_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes (tokens expire in 15 min)

/**
 * Hook that automatically refreshes the access token before it expires.
 * - Sets up a timer to refresh every 14 minutes
 * - Refreshes when the tab becomes active again (visibility change)
 * - Updates auth store with new user data on success
 * - Logs the user out on failure (401)
 */
export function useTokenRefresh() {
  const { isAuthenticated, setUser, logout } = useAuthStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshing = useRef(false);

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
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
        }
      } else if (res.status === 401) {
        // Refresh token is invalid/expired — log out
        logout();
      }
      // For other errors (500, etc.), don't log out — just try again next interval
    } catch {
      // Network error — don't log out, just try again next interval
    } finally {
      isRefreshing.current = false;
    }
  }, [setUser, logout]);

  // ── Set up interval timer ─────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      // Clear timer if not authenticated
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Start the refresh interval
    timerRef.current = setInterval(() => {
      refreshTokens();
    }, REFRESH_INTERVAL_MS);

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
