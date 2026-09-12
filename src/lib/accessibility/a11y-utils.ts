// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Accessibility Utilities
// Phase 14.8: ARIA, focus trap, keyboard nav, color contrast, sr-only
// ═══════════════════════════════════════════════════════════════════

'use client';

import { useEffect, useCallback, useRef, useSyncExternalStore } from 'react';

// ─── Screen Reader Announcements ──────────────────────────────────

let liveRegionPolite: HTMLElement | null = null;
let liveRegionAssertive: HTMLElement | null = null;

function getOrCreateLiveRegion(priority: 'polite' | 'assertive'): HTMLElement {
  const id = `a11y-live-${priority}`;

  let region = document.getElementById(id);
  if (!region) {
    region = document.createElement('div');
    region.id = id;
    region.setAttribute('aria-live', priority);
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('role', 'status');
    Object.assign(region.style, visuallyHiddenStyles);
    document.body.appendChild(region);
  }

  if (priority === 'polite') liveRegionPolite = region;
  else liveRegionAssertive = region;

  return region;
}

/**
 * Announce a message to screen readers via ARIA live region.
 *
 * @param message - The text to announce
 * @param priority - 'polite' waits for idle, 'assertive' interrupts
 *
 * @example
 * announceToScreenReader('Lead saved successfully');
 * announceToScreenReader('Error: Email is required', 'assertive');
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  if (typeof document === 'undefined') return;

  const region = priority === 'assertive'
    ? (liveRegionAssertive || getOrCreateLiveRegion('assertive'))
    : (liveRegionPolite || getOrCreateLiveRegion('polite'));

  // Clear and re-set to force screen readers to re-announce
  region.textContent = '';
  requestAnimationFrame(() => {
    region!.textContent = message;
  });
}

// ─── Focus Trap ───────────────────────────────────────────────────

/**
 * Trap focus within a container element (for modals/dialogs).
 * Returns a cleanup function to remove the trap.
 *
 * @example
 * const cleanup = trapFocus(modalElement);
 * // Later:
 * cleanup();
 */
export function trapFocus(containerElement: HTMLElement): () => void {
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ].join(', ');

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;

    const focusableElements = containerElement.querySelectorAll(focusableSelector);
    const focusable = Array.from(focusableElements) as HTMLElement[];

    if (focusable.length === 0) return;

    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: if on first element, wrap to last
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab: if on last element, wrap to first
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  }

  containerElement.addEventListener('keydown', handleKeyDown);

  // Store the previously focused element to restore later
  const previouslyFocused = document.activeElement as HTMLElement;

  // Focus the first focusable element in the container
  const firstFocusable = containerElement.querySelector(focusableSelector) as HTMLElement | null;
  if (firstFocusable) {
    requestAnimationFrame(() => firstFocusable.focus());
  }

  return () => {
    containerElement.removeEventListener('keydown', handleKeyDown);
    // Restore focus to previously focused element
    if (previouslyFocused && previouslyFocused.focus) {
      previouslyFocused.focus();
    }
  };
}

/**
 * React hook for focus trap.
 *
 * @example
 * const containerRef = useRef<HTMLDivElement>(null);
 * useFocusTrap(containerRef, isOpen);
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, isActive: boolean): void {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const cleanup = trapFocus(containerRef.current);
    return cleanup;
  }, [isActive, containerRef]);
}

// ─── Focusable Elements ──────────────────────────────────────────

/**
 * Get all focusable elements within a container.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ].join(', ');

  return Array.from(container.querySelectorAll(selector)) as HTMLElement[];
}

// ─── Keyboard Navigation ─────────────────────────────────────────

/**
 * Handle keyboard navigation with arrow keys.
 *
 * @example
 * handleKeyboardNav(event, {
 *   onArrowUp: () => selectPrevItem(),
 *   onArrowDown: () => selectNextItem(),
 *   onEnter: () => activateItem(),
 *   onEscape: () => closeMenu(),
 * });
 */
export function handleKeyboardNav(
  event: KeyboardEvent,
  handlers: {
    onArrowUp?: () => void;
    onArrowDown?: () => void;
    onArrowLeft?: () => void;
    onArrowRight?: () => void;
    onEnter?: () => void;
    onEscape?: () => void;
    onHome?: () => void;
    onEnd?: () => void;
    onSpace?: () => void;
    onTab?: () => void;
  },
): void {
  const keyMap: Record<string, (() => void) | undefined> = {
    ArrowUp: handlers.onArrowUp,
    ArrowDown: handlers.onArrowDown,
    ArrowLeft: handlers.onArrowLeft,
    ArrowRight: handlers.onArrowRight,
    Enter: handlers.onEnter,
    Escape: handlers.onEscape,
    Home: handlers.onHome,
    End: handlers.onEnd,
    ' ': handlers.onSpace,
    Tab: handlers.onTab,
  };

  const handler = keyMap[event.key];
  if (handler) {
    event.preventDefault();
    handler();
  }
}

/**
 * React hook for keyboard navigation within a container.
 */
export function useKeyboardNav(
  handlers: Parameters<typeof handleKeyboardNav>[1],
  isActive: boolean = true,
): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!isActive) return;

    const listener = (e: KeyboardEvent) => {
      handleKeyboardNav(e, handlersRef.current);
    };

    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [isActive]);
}

// ─── Visually Hidden Styles ───────────────────────────────────────

/**
 * CSS styles for visually hiding content while keeping it accessible
 * to screen readers (sr-only).
 */
export const visuallyHiddenStyles: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
};

// ─── ARIA Label Generation ───────────────────────────────────────

/**
 * Generate descriptive ARIA labels for common UI elements.
 *
 * @example
 * generateAriaLabel('button', { action: 'delete', target: 'lead', context: 'Acme Corp' })
 * // → "Delete lead Acme Corp"
 */
export function generateAriaLabel(
  element: string,
  context: {
    action?: string;
    target?: string;
    status?: string;
    context?: string;
    value?: string | number;
    index?: number;
    total?: number;
  },
): string {
  const parts: string[] = [];

  switch (element) {
    case 'button':
      if (context.action) parts.push(context.action);
      if (context.target) parts.push(context.target);
      if (context.context) parts.push(context.context);
      if (context.status) parts.push(`(${context.status})`);
      break;

    case 'link':
      if (context.action) parts.push(context.action);
      if (context.target) parts.push(context.target);
      break;

    case 'tab':
      if (context.target) parts.push(context.target);
      if (context.index !== undefined && context.total !== undefined) {
        parts.push(`tab ${context.index + 1} of ${context.total}`);
      }
      break;

    case 'listitem':
      if (context.target) parts.push(context.target);
      if (context.index !== undefined && context.total !== undefined) {
        parts.push(`item ${context.index + 1} of ${context.total}`);
      }
      if (context.status) parts.push(`(${context.status})`);
      break;

    case 'status':
      if (context.target) parts.push(context.target);
      if (context.value !== undefined) parts.push(String(context.value));
      if (context.status) parts.push(context.status);
      break;

    default:
      if (context.action) parts.push(context.action);
      if (context.target) parts.push(context.target);
      if (context.context) parts.push(context.context);
  }

  return parts.join(' ') || element;
}

// ─── Color Contrast Checker ───────────────────────────────────────

/**
 * Calculate relative luminance of an RGB color.
 * Follows WCAG 2.0 algorithm.
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate the contrast ratio between two RGB colors.
 * Returns a ratio from 1:1 (same color) to 21:1 (black on white).
 */
export function getContrastRatio(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number },
): number {
  const l1 = getRelativeLuminance(color1.r, color1.g, color1.b);
  const l2 = getRelativeLuminance(color2.r, color2.g, color2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a color combination meets WCAG contrast requirements.
 *
 * @example
 * checkContrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })
 * // → { ratio: 21, aa: true, aaa: true, aaLarge: true, aaaLarge: true }
 */
export function checkContrast(
  foreground: { r: number; g: number; b: number },
  background: { r: number; g: number; b: number },
  fontSizePx?: number,
  fontWeight?: number,
): {
  ratio: number;
  aa: boolean;
  aaa: boolean;
  aaLarge: boolean;
  aaaLarge: boolean;
  level: 'AAA' | 'AA' | 'AA Large' | 'Fail';
} {
  const ratio = getContrastRatio(foreground, background);

  const isLargeText = fontSizePx !== undefined && fontWeight !== undefined
    ? fontSizePx >= 18 || (fontSizePx >= 14 && fontWeight >= 700)
    : false;

  // WCAG requirements:
  // AA: 4.5:1 for normal text, 3:1 for large text
  // AAA: 7:1 for normal text, 4.5:1 for large text
  const aa = ratio >= 4.5;
  const aaa = ratio >= 7;
  const aaLarge = ratio >= 3;
  const aaaLarge = ratio >= 4.5;

  let level: 'AAA' | 'AA' | 'AA Large' | 'Fail';
  if (isLargeText) {
    level = aaaLarge ? 'AAA' : aaLarge ? 'AA' : 'Fail';
  } else {
    level = aaa ? 'AAA' : aa ? 'AA' : aaLarge ? 'AA Large' : 'Fail';
  }

  return { ratio, aa, aaa, aaLarge, aaaLarge, level };
}

// ─── Keyboard Shortcut Manager ────────────────────────────────────

export interface KeyboardShortcut {
  key: string;
  label: string;
  description: string;
  category: string;
  ctrlOrCmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  /** Only fire when not in an input/textarea */
  skipInInputs?: boolean;
}

/**
 * Create a keyboard shortcut manager.
 * Manages registration, unregistration, and execution of shortcuts.
 */
export function createShortcutManager() {
  const shortcuts = new Map<string, KeyboardShortcut>();

  function register(shortcut: KeyboardShortcut): () => void {
    const id = [
      shortcut.ctrlOrCmd ? 'mod' : '',
      shortcut.shift ? 'shift' : '',
      shortcut.alt ? 'alt' : '',
      shortcut.key.toLowerCase(),
    ].filter(Boolean).join('+');

    shortcuts.set(id, shortcut);

    // Return unregister function
    return () => {
      shortcuts.delete(id);
    };
  }

  function handleKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    const isInputLike =
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target.isContentEditable;

    // Build the shortcut ID from the event
    const parts: string[] = [];
    if (e.metaKey || e.ctrlKey) parts.push('mod');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    parts.push(e.key.toLowerCase());

    const id = parts.join('+');
    const shortcut = shortcuts.get(id);

    if (shortcut) {
      if (shortcut.skipInInputs !== false && isInputLike) return;
      e.preventDefault();
      shortcut.handler();
    }
  }

  function getAll(): KeyboardShortcut[] {
    return [...shortcuts.values()];
  }

  function getByCategory(category: string): KeyboardShortcut[] {
    return [...shortcuts.values()].filter((s) => s.category === category);
  }

  function getCategories(): string[] {
    const categories = new Set([...shortcuts.values()].map((s) => s.category));
    return [...categories];
  }

  return { register, handleKeyDown, getAll, getByCategory, getCategories };
}

/**
 * React hook for managing keyboard shortcuts.
 *
 * @example
 * useShortcuts([
 *   { key: 'e', label: 'E', description: 'Enrich lead', category: 'Actions', handler: enrichLead },
 *   { key: 's', label: 'S', description: 'Score lead', category: 'Actions', handler: scoreLead },
 * ]);
 */
export function useShortcuts(shortcuts: Array<Omit<KeyboardShortcut, 'register'>>): void {
  const managerRef = useRef(createShortcutManager());

  useEffect(() => {
    const manager = managerRef.current;
    const cleanups = shortcuts.map((shortcut) =>
      manager.register(shortcut as KeyboardShortcut)
    );

    document.addEventListener('keydown', manager.handleKeyDown);

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      document.removeEventListener('keydown', manager.handleKeyDown);
    };
  }, [shortcuts]);
}

// ─── Skip-to-Content Helper ──────────────────────────────────────

/**
 * Handle skip-to-content link activation.
 * Moves focus to the main content area.
 */
export function skipToContent(contentId: string = 'main-content'): void {
  const mainContent = document.getElementById(contentId);
  if (mainContent) {
    mainContent.setAttribute('tabindex', '-1');
    mainContent.focus();
    mainContent.scrollIntoView({ behavior: 'smooth' });
    // Remove tabindex after blur to avoid interfering with tab order
    mainContent.addEventListener('blur', () => {
      mainContent.removeAttribute('tabindex');
    }, { once: true });
  }
}

// ─── Reduced Motion Detection ─────────────────────────────────────

/**
 * Check if the user prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * React hook for detecting reduced motion preference.
 */
export function useReducedMotion(): boolean {
  const prefersReduced = useSyncExternalStore(
    useCallback((callback: () => void) => {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    }, []),
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
  return prefersReduced;
}
