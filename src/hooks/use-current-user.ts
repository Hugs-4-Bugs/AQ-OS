'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — useCurrentUser hook (client)
//
// Fetches the authenticated user from /api/auth/me. Used by the
// standalone /support pages which live OUTSIDE the dashboard SPA and
// cannot rely on the zustand auth store being hydrated for a fresh
// tab. Falls back gracefully when unauthenticated.
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  avatarUrl: string | null;
}

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [state, setState] = useState<AuthState>('loading');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.user) {
          setUser(data.user);
          setState('authenticated');
        } else {
          setState('unauthenticated');
        }
      })
      .catch(() => {
        if (!cancelled) setState('unauthenticated');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, state };
}
