'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Overflow Audit Hook
// Phase 2: Custom hook to detect horizontal overflow on any container
// ═══════════════════════════════════════════════════════════════════

interface OverflowElement {
  element: HTMLElement;
  selector: string;
  overflowWidth: number;
  containerWidth: number;
  overflowAmount: number;
}

interface UseOverflowAuditReturn {
  overflowElements: OverflowElement[];
  hasOverflow: boolean;
  fixOverflow: () => void;
  reaudit: () => void;
}

function buildSelector(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
      parts.unshift(selector);
      break;
    }
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.split(/\s+/).filter(c => c && !c.startsWith('css-')).slice(0, 2);
      if (classes.length > 0) {
        selector += `.${classes.join('.')}`;
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
    if (parts.length >= 3) break;
  }
  return parts.join(' > ');
}

export function useOverflowAudit(
  containerRef?: React.RefObject<HTMLElement | null>,
  options?: {
    checkOnResize?: boolean;
    debounceMs?: number;
  }
): UseOverflowAuditReturn {
  const checkOnResize = options?.checkOnResize ?? true;
  const debounceMs = options?.debounceMs ?? 200;

  const [overflowElements, setOverflowElements] = useState<OverflowElement[]>([]);
  const [hasOverflow, setHasOverflow] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const audit = useCallback(() => {
    const container = containerRef?.current || document.body;
    const containerWidth = container.clientWidth;
    const issues: OverflowElement[] = [];

    const allElements = container.querySelectorAll('*');
    for (const el of allElements) {
      if (!(el instanceof HTMLElement)) continue;

      const rect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Check if element overflows horizontally
      if (rect.width > containerWidth + 2 || rect.right > containerRect.right + 2) {
        issues.push({
          element: el,
          selector: buildSelector(el),
          overflowWidth: Math.round(rect.width),
          containerWidth: Math.round(containerWidth),
          overflowAmount: Math.round(rect.width - containerWidth),
        });
      }

      // Also check elements that extend beyond container's right edge
      if (rect.right > containerRect.right + 2 && rect.width <= containerWidth) {
        const overflowAmount = Math.round(rect.right - containerRect.right);
        // Avoid duplicates
        if (!issues.some(i => i.element === el)) {
          issues.push({
            element: el,
            selector: buildSelector(el),
            overflowWidth: Math.round(rect.width),
            containerWidth: Math.round(containerWidth),
            overflowAmount,
          });
        }
      }

      if (issues.length >= 30) break; // Limit
    }

    setOverflowElements(issues);
    setHasOverflow(issues.length > 0);
  }, [containerRef]);

  const reaudit = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(audit, debounceMs);
  }, [audit, debounceMs]);

  const fixOverflow = useCallback(() => {
    // Use a snapshot of current overflow elements to avoid modifying React state
    const container = containerRef?.current || document.body;
    const containerWidth = container.clientWidth;
    const allElements = container.querySelectorAll('*');

    for (const el of allElements) {
      if (!(el instanceof HTMLElement)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > containerWidth + 2) {
        if (el.style.overflowX !== 'hidden') {
          el.style.overflowX = 'hidden';
        }
        if (!el.style.maxWidth) {
          el.style.maxWidth = '100%';
        }
        el.style.wordWrap = 'break-word';
        el.style.overflowWrap = 'break-word';
      }
    }
    // Re-audit after fix
    reaudit();
  }, [containerRef, reaudit]);

  // Initial audit — use rAF to avoid synchronous setState in effect
  useEffect(() => {
    const rafId = requestAnimationFrame(audit);
    return () => cancelAnimationFrame(rafId);
  }, [audit]);

  // Resize listener
  useEffect(() => {
    if (!checkOnResize) return;

    const handleResize = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(audit, debounceMs);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [audit, checkOnResize, debounceMs]);

  return {
    overflowElements,
    hasOverflow,
    fixOverflow,
    reaudit,
  };
}
