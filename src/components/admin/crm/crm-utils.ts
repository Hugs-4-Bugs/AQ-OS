// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Shared Utilities
// Small helpers used across all CRM components: formatting, hooks, etc.
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';

// ── Formatters ────────────────────────────────────────────────────────

export function fmtInt(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
}

export function fmtPercent(n: number): string {
  return `${n}%`;
}

export function fmtValue(n: number, format: 'int' | 'money' | 'percent' | 'raw'): string {
  switch (format) {
    case 'int': return fmtInt(n);
    case 'money': return fmtMoney(n);
    case 'percent': return fmtPercent(n);
    case 'raw': return String(n);
  }
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Data fetch hook ───────────────────────────────────────────────────

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useFetch<T>(url: string): FetchState<T> & { reload: () => void } {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(url, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const msg = res.status === 403 ? 'Admin access required' : res.status === 401 ? 'Authentication required' : `Request failed (${res.status})`;
          throw new Error(msg);
        }
        const json = await res.json();
        if (cancelled) return;
        setState({ data: json.data, loading: false, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Network error' });
      });
    return () => { cancelled = true; };
  }, [url, tick]);

  return { ...state, reload };
}

// ── Reduced-motion check ──────────────────────────────────────────────

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
