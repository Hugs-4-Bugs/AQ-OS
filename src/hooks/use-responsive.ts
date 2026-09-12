'use client';

import { useSyncExternalStore, useCallback } from 'react';

type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 475,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

export function useResponsive() {
  const width = useSyncExternalStore(
    useCallback((callback: () => void) => {
      const handler = () => callback();
      window.addEventListener('resize', handler);
      return () => window.removeEventListener('resize', handler);
    }, []),
    () => window.innerWidth,
    () => 1024 // SSR fallback: assume desktop
  );

  const breakpoint = getBreakpoint(width);
  const isMobile = width < BREAKPOINTS.md;
  const isTablet = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg;
  const isDesktop = width >= BREAKPOINTS.lg;

  return {
    width,
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
    isSmallMobile: width < BREAKPOINTS.xs,
    isLargeDesktop: width >= BREAKPOINTS.xl,
  };
}

export function useIsMobile() {
  return useResponsive().isMobile;
}
