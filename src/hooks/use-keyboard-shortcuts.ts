'use client';

import { useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import type { TabId } from '@/lib/types';

const TAB_KEYS: Record<string, TabId> = {
  '1': 'overview',
  '2': 'leads',
  '3': 'pipeline',
  '4': 'discover',
  '5': 'outreach',
  '6': 'assistant',
  '7': 'insights',
  '8': 'deals',
  '9': 'competitors',
};

interface UseKeyboardShortcutsOptions {
  onShowShortcuts: () => void;
  onOpenCommandPalette: () => void;
  onNewLead?: () => void;
}

/**
 * Hook that listens for keyboard shortcuts globally.
 * Only triggers when not in an input, textarea, or select element.
 *
 * Shortcuts:
 * - 1-8: Switch to corresponding tab
 * - Ctrl+K / Cmd+K: Open Command Palette
 * - N: Create new lead (when not in an input/textarea)
 * - ?: Show keyboard shortcuts help dialog
 */
export function useKeyboardShortcuts({
  onShowShortcuts,
  onOpenCommandPalette,
  onNewLead,
}: UseKeyboardShortcutsOptions) {
  const { setActiveTab } = useAppStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInputLike =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.isContentEditable;

      // Ctrl+K / Cmd+K: Open Command Palette (works even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenCommandPalette();
        return;
      }

      // Don't process other shortcuts when in an input-like element
      if (isInputLike) return;

      // 1-8: Switch tabs
      if (TAB_KEYS[e.key]) {
        e.preventDefault();
        setActiveTab(TAB_KEYS[e.key]);
        return;
      }

      // N: Create new lead
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onNewLead?.();
        return;
      }

      // ?: Show shortcuts help
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        onShowShortcuts();
        return;
      }
    },
    [setActiveTab, onShowShortcuts, onOpenCommandPalette, onNewLead]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
