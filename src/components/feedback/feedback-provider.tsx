'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FeedbackModal } from './feedback-modal';
import { useAppStore } from '@/lib/store';

// ─── Floating Feedback Button + Provider ──────────────────────────
// This component:
//  1. Checks if the user is authenticated (via /api/auth/me)
//  2. If authenticated:
//     - Initializes auto-capture (browser/nav/API/error tracking)
//     - Initializes crash reporter with userId
//     - Renders a floating button (bottom-right)
//  3. If not authenticated: renders nothing (hidden on login/signup)
//  4. Keyboard shortcut: Shift+F opens the feedback modal
//
// Designed to be included once in the root layout.

interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
}

export function FeedbackProvider() {
  const activeTab = useAppStore((s) => s.activeTab);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const initStartedRef = useRef(false);

  // Check auth state
  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!res.ok) {
          if (!cancelled) setChecked(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setUser(data.user || null);
          setChecked(true);
        }
      } catch {
        if (!cancelled) setChecked(true);
      }
    }
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize auto-capture + crash reporter once user is known
  useEffect(() => {
    if (!checked || initStartedRef.current) return;
    if (!user) return; // only init when authenticated
    initStartedRef.current = true;

    (async () => {
      try {
        const { initAutoCapture } = await import('@/lib/feedback/auto-capture');
        initAutoCapture();
      } catch (err) {
        console.warn('[Feedback] auto-capture init failed:', err);
      }
      try {
        const { initCrashReporter } = await import('@/lib/feedback/crash-reporter');
        initCrashReporter(user.id);
      } catch (err) {
        console.warn('[Feedback] crash reporter init failed:', err);
      }
    })();
  }, [checked, user]);

  // Keyboard shortcut: Shift+F
  useEffect(() => {
    if (!user) return;
    function handler(e: KeyboardEvent) {
      if (e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        // Don't trigger when typing in an input/textarea or inside a contenteditable
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName.toLowerCase();
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
            return;
          }
        }
        e.preventDefault();
        setModalOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [user]);

  // Don't render button until we've confirmed the user is authenticated
  if (!checked || !user) return null;

  // FIX (2026-09-09): Hide the floating feedback button on the
  // Assistant tab so it never overlaps the message input / Send area.
  if (activeTab === 'assistant') return null;

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setModalOpen(true)}
              aria-label="Report a bug or share feedback (Shift+F)"
              style={{ position: 'fixed', bottom: '80px', right: '20px', zIndex: 450 }}
              className="fix5-fab-feedback h-12 w-12 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-900/40 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-background"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="font-medium">
            Report a bug or share feedback (Shift+F)
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <FeedbackModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
