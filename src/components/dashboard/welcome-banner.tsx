'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun,
  Moon,
  Coffee,
  Sparkles,
  XCircle,
  Users,
  HandshakeIcon,
  Zap,
  Target,
  TrendingUp,
  Rocket,
  Quote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

/* ── Daily motivational quotes ──────────────────────────────── */
const MOTIVATIONAL_QUOTES = [
  { text: "The fortune is in the follow-up.", author: "Sales Proverb" },
  { text: "Every lead is a potential partnership waiting to happen.", author: "Acquisition Wisdom" },
  { text: "Consistency beats intensity. Keep prospecting every day.", author: "Growth Mindset" },
  { text: "The best time to reach out was yesterday. The second best time is now.", author: "Action Principle" },
  { text: "Quality leads are built through quality research.", author: "Data-Driven Sales" },
  { text: "Relationships drive revenue, not transactions.", author: "Trust Economy" },
  { text: "Your next big deal is just one conversation away.", author: "Pipeline Thinking" },
  { text: "Success is the sum of small efforts repeated daily.", author: "Robert Collier" },
  { text: "Listen first, pitch second, close third.", author: "Sales Framework" },
  { text: "The pipeline you build today feeds the revenue of tomorrow.", author: "Compound Growth" },
];

/* ── Time-of-day greeting ──────────────────────────────────── */
function getTimeGreeting(): { greeting: string; icon: React.ElementType; iconGradient: string } {
  const hour = new Date().getHours();
  if (hour < 12) {
    return { greeting: 'Good morning', icon: Sun, iconGradient: 'from-amber-400 to-yellow-500' };
  }
  if (hour < 17) {
    return { greeting: 'Good afternoon', icon: Coffee, iconGradient: 'from-orange-400 to-amber-500' };
  }
  return { greeting: 'Good evening', icon: Moon, iconGradient: 'from-indigo-400 to-violet-500' };
}

/* ── Main Welcome Banner Component ─────────────────────────── */
export default function WelcomeBanner() {
  const { setActiveTab } = useAppStore();
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Get daily quote based on day of year
  const dailyQuote = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
  }, []);

  // Load dismissed state from localStorage
  useEffect(() => {
    const key = 'acqos-welcome-banner-dismissed';
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'true') {
        setDismissed(true);
        return;
      }
    } catch {
      // ignore
    }
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => {
      setDismissed(true);
      try {
        localStorage.setItem('acqos-welcome-banner-dismissed', 'true');
      } catch {
        // ignore
      }
    }, 300);
  };

  if (dismissed) return null;

  const { greeting, icon: TimeIcon, iconGradient } = getTimeGreeting();
  const TimeIconEl = TimeIcon;

  const quickStats = [
    { label: 'Leads', value: '0', icon: Users, gradient: 'from-primary to-purple-600' },
    { label: 'Deals', value: '0', icon: HandshakeIcon, gradient: 'from-emerald-500 to-teal-500' },
    { label: 'Score', value: '—', icon: Target, gradient: 'from-amber-500 to-orange-500' },
  ];

  const quickActions = [
    { label: 'Add Lead', icon: Rocket, tab: 'leads' as const, color: 'text-primary' },
    { label: 'Create Deal', icon: HandshakeIcon, tab: 'deals' as const, color: 'text-emerald-500' },
    { label: 'Run Analysis', icon: Sparkles, tab: 'discover' as const, color: 'text-amber-500' },
  ];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="relative rounded-2xl overflow-hidden"
        >
          {/* Background gradient mesh */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-emerald-500/5" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/3 to-transparent" />

          {/* Animated border */}
          <div className="absolute inset-0 rounded-2xl border border-primary/10 dark:border-primary/5 pointer-events-none" />
          <div className="absolute inset-0 rounded-2xl gradient-border-animated pointer-events-none" />

          {/* Glass overlay */}
          <div className="absolute inset-0 bg-background/60 dark:bg-background/40 backdrop-blur-xl" />

          <div className="relative p-4 sm:p-5 lg:p-6">
            {/* Top row: greeting + dismiss */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                {/* Animated icon */}
                <div className="relative">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <div className={cn('rounded-xl bg-gradient-to-br p-2.5 shadow-lg', iconGradient)}>
                      <TimeIconEl className="h-5 w-5 text-white drop-shadow-sm" />
                    </div>
                  </motion.div>
                  <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-primary/10 to-transparent animate-ping opacity-20" />
                </div>

                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                    <span className="gradient-text">{greeting}</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Here&apos;s what&apos;s happening with your acquisitions today.
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                onClick={handleDismiss}
                aria-label="Dismiss welcome banner"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              {quickStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="flex items-center gap-2 p-2.5 sm:p-3 rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-sm"
                  >
                    <div className={cn('rounded-lg p-1.5 shrink-0 bg-gradient-to-br text-white', stat.gradient)}>
                      <Icon className="h-3.5 w-3.5 drop-shadow-sm" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm sm:text-base font-extrabold tabular-nums tracking-tight">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground truncate font-medium">{stat.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2 mb-4">
              {quickActions.map((action, i) => {
                const Icon = action.icon;
                return (
                  <motion.button
                    key={action.label}
                    whileHover={{ scale: 1.04, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 400, damping: 20 }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/15 bg-primary/5 hover:bg-primary/10 transition-colors text-sm font-medium active-spring"
                    onClick={() => setActiveTab(action.tab)}
                  >
                    <Icon className={cn('h-3.5 w-3.5', action.color)} />
                    <span className="hidden sm:inline">{action.label}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Motivational quote */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="flex items-start gap-2 p-3 rounded-xl bg-gradient-to-r from-primary/5 to-emerald-500/5 border border-primary/8 dark:border-primary/5"
            >
              <Quote className="h-4 w-4 text-primary/50 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs italic text-muted-foreground leading-relaxed">&ldquo;{dailyQuote.text}&rdquo;</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 font-medium">— {dailyQuote.author}</p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
