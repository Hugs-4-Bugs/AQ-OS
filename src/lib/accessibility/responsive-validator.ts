// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Responsive Breakpoint Validation
// Phase 14.8: Breakpoints, hooks, media queries, responsive values
// ═══════════════════════════════════════════════════════════════════

'use client';

import { useSyncExternalStore, useCallback } from 'react';

// ─── Breakpoint Definitions ───────────────────────────────────────

export const BREAKPOINTS = {
  /** Very small phone (iPhone SE 1st gen) */
  xs: 320,
  /** Small phone (iPhone SE, small Android) */
  sm: 375,
  /** Standard phone (iPhone 12/13/14) */
  md: 425,
  /** Tablet portrait */
  tablet: 768,
  /** Tablet landscape / small laptop */
  lg: 1024,
  /** Standard desktop */
  xl: 1280,
  /** Large desktop */
  '2xl': 1440,
  /** Full HD desktop */
  '3xl': 1920,
  /** Ultra-wide / 4K */
  '4xl': 2560,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

// ─── CSS Media Query Helpers ──────────────────────────────────────

/**
 * Generate a CSS min-width media query string for a given breakpoint.
 */
export function mediaMin(breakpoint: BreakpointName): string {
  return `@media (min-width: ${BREAKPOINTS[breakpoint]}px)`;
}

/**
 * Generate a CSS max-width media query string for a given breakpoint.
 */
export function mediaMax(breakpoint: BreakpointName): string {
  return `@media (max-width: ${BREAKPOINTS[breakpoint] - 1}px)`;
}

/**
 * Generate a CSS media query for a range between two breakpoints.
 */
export function mediaBetween(min: BreakpointName, max: BreakpointName): string {
  return `@media (min-width: ${BREAKPOINTS[min]}px) and (max-width: ${BREAKPOINTS[max] - 1}px)`;
}

/**
 * Generate mobile-first media queries for all breakpoints.
 * Returns an object with breakpoint keys mapping to @media strings.
 */
export function mediaQueries(): Record<BreakpointName, string> {
  const queries: Record<string, string> = {};
  for (const [name, width] of Object.entries(BREAKPOINTS)) {
    queries[name] = `@media (min-width: ${width}px)`;
  }
  return queries as Record<BreakpointName, string>;
}

// ─── useBreakpoint Hook ───────────────────────────────────────────

/**
 * Determine the current breakpoint name based on viewport width.
 */
function getCurrentBreakpoint(width: number): BreakpointName {
  if (width >= BREAKPOINTS['4xl']) return '4xl';
  if (width >= BREAKPOINTS['3xl']) return '3xl';
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

/**
 * Hook that returns the current responsive breakpoint and device type.
 *
 * @example
 * const { breakpoint, isMobile, isTablet, isDesktop } = useBreakpoint();
 */
export function useBreakpoint(): {
  width: number;
  breakpoint: BreakpointName;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isSmallMobile: boolean;
  isLargeDesktop: boolean;
  isUltraWide: boolean;
} {
  const width = useSyncExternalStore(
    useCallback((callback: () => void) => {
      const handler = () => callback();
      window.addEventListener('resize', callback);
      // Also listen for orientation changes on mobile
      window.addEventListener('orientationchange', handler);
      return () => {
        window.removeEventListener('resize', callback);
        window.removeEventListener('orientationchange', handler);
      };
    }, []),
    () => window.innerWidth,
    () => 1280, // SSR fallback: assume desktop
  );

  const breakpoint = getCurrentBreakpoint(width);
  const isMobile = width < BREAKPOINTS.tablet;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.lg;
  const isDesktop = width >= BREAKPOINTS.lg;
  const isSmallMobile = width < BREAKPOINTS.sm;
  const isLargeDesktop = width >= BREAKPOINTS.xl;
  const isUltraWide = width >= BREAKPOINTS['3xl'];

  return {
    width,
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
    isSmallMobile,
    isLargeDesktop,
    isUltraWide,
  };
}

// ─── Responsive Value Helper ──────────────────────────────────────

/**
 * Get a value based on the current breakpoint.
 * Provide a map of breakpoint → value, and the correct value will be returned
 * for the current viewport width.
 *
 * @example
 * const columns = getResponsiveValue({
 *   xs: 1,
 *   md: 2,
 *   tablet: 2,
 *   lg: 3,
 *   xl: 4,
 * });
 */
export function getResponsiveValue<T>(
  map: Partial<Record<BreakpointName, T>>,
  currentWidth?: number,
): T | undefined {
  const width = currentWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);

  // Check breakpoints from largest to smallest
  const sortedBreakpoints = Object.entries(BREAKPOINTS)
    .sort(([, a], [, b]) => b - a);

  for (const [name, bpWidth] of sortedBreakpoints) {
    if (width >= bpWidth && map[name as BreakpointName] !== undefined) {
      return map[name as BreakpointName];
    }
  }

  // Fallback to smallest defined breakpoint
  for (const [name] of sortedBreakpoints.reverse()) {
    if (map[name as BreakpointName] !== undefined) {
      return map[name as BreakpointName];
    }
  }

  return undefined;
}

// ─── Responsive Grid Helper ───────────────────────────────────────

/**
 * Generate responsive grid column configuration.
 */
export function getResponsiveGrid(config?: {
  minItemWidth?: number;
  maxColumns?: number;
  gap?: number;
}): {
  gridTemplateColumns: string;
  gap: number;
} {
  const minItemWidth = config?.minItemWidth ?? 280;
  const maxColumns = config?.maxColumns ?? 4;
  const gap = config?.gap ?? 16;

  return {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(${minItemWidth}px, 100%), 1fr))`,
    gap,
  };
}

// ─── Viewport Info Helper ─────────────────────────────────────────

/**
 * Get viewport dimensions and device pixel ratio.
 */
export function getViewportInfo(): {
  width: number;
  height: number;
  dpr: number;
  breakpoint: BreakpointName;
  isTouchDevice: boolean;
  orientation: 'portrait' | 'landscape';
} {
  if (typeof window === 'undefined') {
    return {
      width: 1280,
      height: 800,
      dpr: 1,
      breakpoint: 'xl',
      isTouchDevice: false,
      orientation: 'landscape',
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const orientation = width > height ? 'landscape' : 'portrait';

  return {
    width,
    height,
    dpr,
    breakpoint: getCurrentBreakpoint(width),
    isTouchDevice,
    orientation,
  };
}
