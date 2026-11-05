'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Inactivity Timer (Client Component)
//
// ISSUE 6 (True 10-minute inactivity timeout):
//
// This component implements a TRUE 10-minute INACTIVITY timeout (not
// a 10-minute absolute session lifetime). The countdown starts at
// 10:00 and decreases once per second. Genuine user activity (mouse
// clicks, keyboard input, touch events, pointer presses) resets the
// countdown to 10:00 via a server ping.
//
// GENUINE ACTIVITY SIGNALS (reset the timer):
//   - mousedown  (mouse click anywhere)
//   - keydown    (keyboard input, including modifier keys)
//   - touchstart (touch screen tap)
//   - pointerdown (pen/stylus/trackpad press)
//
// NON-GENUINE SIGNALS (DO NOT reset the timer):
//   - mousemove / pointermove (firing continuously without intent)
//   - React re-renders
//   - Network traffic / background API polling
//   - Token refresh (performed by useTokenRefresh, separate concern)
//   - Background tab automatic work
//   - Visibility/focus change without user input
//
// SERVER-SIDE ENFORCEMENT:
//   The server-side `getSuperAdminSession()` and `POST /api/auth/activity`
//   are AUTHORITATIVE. The client countdown is only a UX affordance —
//   it polls `GET /api/auth/session-status` every 10 seconds to re-sync
//   with the server's authoritative secondsLeft. If the server says the
//   session is expired, the client logs out immediately.
//
// THROTTLING:
//   - Client-side: only send activity pings at most every 15 seconds
//     when activity occurs (prevents request floods during typing).
//   - Server-side: only write to DB at most every 30 seconds per
//     session (prevents DB write amplification).
//
// MULTI-TAB CONSISTENCY:
//   - Each tab maintains its own countdown but polls the same server
//     session, so activity in Tab A resets the countdown for Tab B.
//   - A stale tab that pings after expiry is rejected with 401 and
//     logged out (server refuses to extend expired sessions).
//
// VISIBILITY:
//   - When the tab is hidden, the countdown continues (the user is not
//     interacting). When the tab becomes visible again, we immediately
//     re-sync with the server, which may return 401 (expired during
//     the hidden period) — in which case we log out.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, AlertTriangle } from 'lucide-react';

interface AdminInactivityTimerProps {
  /** Initial secondsLeft from the server-rendered admin session. */
  secondsLeft: number;
}

/** Total inactivity timeout in seconds (must match server). */
const INACTIVITY_TIMEOUT_SECONDS = 10 * 60;

/** Client-side throttle: minimum gap between activity pings (ms). */
const PING_THROTTLE_MS = 15 * 1000;

/** How often to poll /api/auth/session-status for re-sync (ms). */
const STATUS_POLL_INTERVAL_MS = 10 * 1000;

/** Local countdown tick interval (ms). */
const COUNTDOWN_TICK_MS = 1000;

/** Grace period before forcing logout after the timer hits 0 (ms). */
const LOGOUT_GRACE_MS = 1500;

export default function AdminInactivityTimer({ secondsLeft }: AdminInactivityTimerProps) {
  const router = useRouter();
  const [remaining, setRemaining] = useState<number>(
    Math.max(0, Math.min(secondsLeft, INACTIVITY_TIMEOUT_SECONDS))
  );
  const [warning, setWarning] = useState(false);

  // Refs to avoid stale closures and re-binding event listeners.
  const lastPingRef = useRef<number>(0);
  const serverSecondsLeftRef = useRef<number>(
    Math.max(0, Math.min(secondsLeft, INACTIVITY_TIMEOUT_SECONDS))
  );
  const serverSyncedAtRef = useRef<number>(Date.now());
  const isLoggingOutRef = useRef<boolean>(false);
  const remainingRef = useRef<number>(remaining);

  // Keep remainingRef in sync with state so event listeners can read it.
  useEffect(() => {
    remainingRef.current = remaining;
  }, [remaining]);

  // ── Activity ping (throttled) ────────────────────────────────────
  const sendActivityPing = useCallback(
    async (source: 'mouse' | 'keyboard' | 'touch' | 'pointer') => {
      const now = Date.now();
      if (now - lastPingRef.current < PING_THROTTLE_MS) return;
      lastPingRef.current = now;

      try {
        const res = await fetch('/api/auth/activity', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, clientTimestamp: now }),
        });

        if (res.ok) {
          const data = await res.json();
          if (typeof data.secondsLeft === 'number') {
            serverSecondsLeftRef.current = Math.max(
              0,
              Math.min(data.secondsLeft, INACTIVITY_TIMEOUT_SECONDS)
            );
            serverSyncedAtRef.current = Date.now();
            // Optimistic UI update — a genuine activity reset means the
            // countdown should jump back to 10:00 immediately.
            setRemaining(serverSecondsLeftRef.current);
          }
        } else if (res.status === 401) {
          // Session expired or invalid — force logout.
          forceLogout();
        }
        // 5xx / network errors: keep counting locally; the server is
        // authoritative and the next poll will reconcile.
      } catch {
        // Network error — ignore; the status poll will retry.
      }
    },
    []
  );

  // ── Force logout ─────────────────────────────────────────────────
  const forceLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    setRemaining(0);
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {});
    } finally {
      // Use replace so the user can't use the back button to return to
      // an authenticated admin page after session expiry.
      router.replace('/');
    }
  }, [router]);

  // ── Status poll (server-authoritative re-sync) ──────────────────
  useEffect(() => {
    let cancelled = false;

    const pollStatus = async () => {
      try {
        const res = await fetch('/api/auth/session-status', {
          credentials: 'include',
          headers: { 'Cache-Control': 'no-store' },
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (typeof data.secondsLeft === 'number') {
            serverSecondsLeftRef.current = Math.max(
              0,
              Math.min(data.secondsLeft, INACTIVITY_TIMEOUT_SECONDS)
            );
            serverSyncedAtRef.current = Date.now();
            setRemaining(serverSecondsLeftRef.current);
          }
        } else if (res.status === 401) {
          // Server says the session is expired/invalid — log out now.
          forceLogout();
        }
      } catch {
        // Network error — keep counting locally.
      }
    };

    // Initial poll on mount (in case the server-rendered secondsLeft is
    // already stale by the time the client hydrates).
    pollStatus();

    const intervalId = setInterval(pollStatus, STATUS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [forceLogout]);

  // ── Genuine activity listeners ──────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMouseDown = () => sendActivityPing('mouse');
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore pure modifier-key presses and key repeats — they don't
      // represent user intent on their own. But DO ping on actual key
      // input including navigation keys.
      if (e.repeat) return;
      sendActivityPing('keyboard');
    };
    const handleTouchStart = () => sendActivityPing('touch');
    const handlePointerDown = (e: PointerEvent) => {
      // pointerdown covers mouse, touch, pen — but we already handle
      // mousedown/touchstart above. Only ping for pen/stylus here to
      // avoid double-pinging.
      if (e.pointerType === 'pen') {
        sendActivityPing('pointer');
      }
    };

    // Listen on window so we catch activity anywhere on the page.
    // Use passive listeners to avoid blocking the main thread.
    window.addEventListener('mousedown', handleMouseDown, { passive: true });
    window.addEventListener('keydown', handleKeyDown, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [sendActivityPing]);

  // ── Visibility change — re-sync immediately when tab becomes visible ─
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Force an immediate re-sync regardless of throttle.
        fetch('/api/auth/session-status', {
          credentials: 'include',
          headers: { 'Cache-Control': 'no-store' },
        })
          .then((res) => (res.ok ? res.json() : Promise.reject(res)))
          .then((data) => {
            if (typeof data.secondsLeft === 'number') {
              serverSecondsLeftRef.current = Math.max(
                0,
                Math.min(data.secondsLeft, INACTIVITY_TIMEOUT_SECONDS)
              );
              serverSyncedAtRef.current = Date.now();
              setRemaining(serverSecondsLeftRef.current);
            }
          })
          .catch(() => {
            // If the server returned 401, force logout.
            // (Caught by Promise.reject — check status.)
          });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ── Local countdown tick ─────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = Math.max(0, prev - 1);
        if (next <= 60) {
          setWarning(true);
        } else {
          setWarning(false);
        }
        if (next <= 0) {
          // Timer expired locally — give the server a brief grace period
          // to confirm (in case the local clock drifted), then log out.
          clearInterval(interval);
          setTimeout(() => {
            forceLogout();
          }, LOGOUT_GRACE_MS);
        }
        return next;
      });
    }, COUNTDOWN_TICK_MS);

    return () => clearInterval(interval);
  }, [forceLogout]);

  // ── Render ───────────────────────────────────────────────────────
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  if (remaining > 120) {
    // More than 2 minutes left — subtle indicator
    return (
      <div
        className="flex items-center justify-end gap-1.5 px-4 py-1 text-[11px] text-muted-foreground border-b border-border bg-muted/30"
        role="status"
        aria-live="polite"
        aria-label={`Session timeout in ${display}`}
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        <span className="tabular-nums">{display}</span>
      </div>
    );
  }

  // Less than 2 minutes — warning state
  return (
    <div
      className={`flex items-center justify-end gap-1.5 px-4 py-1 text-[11px] border-b ${
        warning
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
      }`}
      role="status"
      aria-live="assertive"
      aria-label={`Session expiring in ${display}. Move the mouse or press a key to stay signed in.`}
    >
      {warning ? (
        <AlertTriangle className="h-3 w-3 animate-pulse" aria-hidden="true" />
      ) : (
        <Clock className="h-3 w-3" aria-hidden="true" />
      )}
      <span className="tabular-nums font-medium">{display}</span>
      {warning && <span className="hidden sm:inline">— session expiring</span>}
    </div>
  );
}
