'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Users,
  Search,
  Send,
  Bot,
  GitBranchPlus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { TabId } from '@/lib/types';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  tab: TabId;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'new-lead', label: 'New Lead', icon: Users, tab: 'leads', color: 'text-emerald-500' },
  { id: 'discover', label: 'Discover Businesses', icon: Search, tab: 'discover', color: 'text-sky-500' },
  { id: 'outreach', label: 'Send Outreach', icon: Send, tab: 'outreach', color: 'text-violet-500' },
  { id: 'assistant', label: 'Ask AI Assistant', icon: Bot, tab: 'assistant', color: 'text-rose-500' },
  { id: 'pipeline', label: 'View Pipeline', icon: GitBranchPlus, tab: 'pipeline', color: 'text-amber-500' },
];

export default function QuickActionsFAB() {
  const { setActiveTab, activeTab } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // FIX (2026-09-09): Hide the floating "+" button on the Assistant tab
  // so it doesn't overlap the message input / Send button area.
  const isAssistantTab = activeTab === 'assistant';
  const shouldRender = !isAssistantTab;

  const handleAction = useCallback((action: QuickAction) => {
    setActiveTab(action.tab);
    setIsOpen(false);
  }, [setActiveTab]);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  if (!shouldRender) return null;

  return (
    <div ref={containerRef} style={{ position: 'fixed', bottom: '24px', right: '20px', zIndex: 400 }} className="hidden lg:block fix5-fab-quick-actions">
      {/* Backdrop for closing */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Action Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="absolute bottom-16 right-0 z-50 w-56 rounded-xl border bg-card shadow-xl overflow-hidden"
          >
            <div className="p-2">
              <div className="px-3 py-2 mb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Actions</p>
              </div>
              {QUICK_ACTIONS.map((action, i) => {
                const Icon = action.icon;
                return (
                  <motion.button
                    key={action.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.15 }}
                    onClick={() => handleAction(action)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors text-left"
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', action.color)} />
                    <span>{action.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB Button */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="relative z-50"
      >
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
          onClick={handleToggle}
          aria-label={isOpen ? 'Close quick actions' : 'Open quick actions'}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <X className="h-5 w-5" />
              </motion.div>
            ) : (
              <motion.div
                key="open"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Plus className="h-5 w-5" />
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </motion.div>
    </div>
  );
}


