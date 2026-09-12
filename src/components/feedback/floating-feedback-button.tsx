'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FeedbackModal } from './feedback-modal';
import { useAppStore } from '@/lib/store';

// ─── Floating Feedback Button ──────────────────────────────────────
// Renders a fixed button at bottom-right that opens the feedback modal.
// Also listens for Shift+F keyboard shortcut.
//
// Positioned at bottom-20 right-5 z-[450] to avoid overlapping:
//   - team chat widget (bottom-20 left-4 z-[440])
//   - accessibility panel (bottom-16 right-4 z-[9998]) — higher z but
//     narrower and only when open; our button stays visible.
//   - AI chat bubble (handled separately)
//
// FIX (2026-09-09): Hidden on the Assistant tab so it doesn't overlap
// the message input / Send button area.

export default function FloatingFeedbackButton() {
  const [open, setOpen] = useState(false);
  const activeTab = useAppStore((s) => s.activeTab);
  const isAssistantTab = activeTab === 'assistant';

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Shift+F opens feedback modal
      if (e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        // Don't trigger when typing in an input/textarea (unless Ctrl+Shift+F)
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
        if (isTyping) return;
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (isAssistantTab) return null;

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              type="button"
              onClick={() => setOpen(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="fixed bottom-20 right-5 z-[450] h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:shadow-xl transition-shadow"
              aria-label="Report a bug or share feedback (Shift+F)"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            <div className="text-xs">
              <div className="font-medium">Report a bug or share feedback</div>
              <div className="text-muted-foreground">Shortcut: Shift+F</div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AnimatePresence>
        {open && <FeedbackModal open={open} onOpenChange={setOpen} />}
      </AnimatePresence>
    </>
  );
}
