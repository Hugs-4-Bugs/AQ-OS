// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — CreditWarningBanner Component
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// Displays a warning banner when credits are low or zero.
// Encourages the user to buy credits or upgrade their plan.
// ═══════════════════════════════════════════════════════════════════

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Zap, ArrowRight, X } from 'lucide-react';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CreditWarningBannerProps {
  onUpgradeClick?: () => void;
  onDismiss?: () => void;
}

export default function CreditWarningBanner({
  onUpgradeClick,
  onDismiss,
}: CreditWarningBannerProps) {
  const creditWarningStatus = useSubscriptionStore((s) => s.creditWarningStatus);
  const credits = useSubscriptionStore((s) => s.credits);
  const creditsMonthly = useSubscriptionStore((s) => s.creditsMonthly);

  // Only show for 'low' or 'zero' status
  if (creditWarningStatus === 'ok') return null;

  const isZero = creditWarningStatus === 'zero';
  const percentage = creditsMonthly > 0 ? Math.round((credits / creditsMonthly) * 100) : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="overflow-hidden"
      >
        <div
          className={cn(
            'flex items-center justify-between gap-3 px-4 py-2.5 text-sm border-b',
            isZero
              ? 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400'
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isZero ? (
              <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
            ) : (
              <Zap className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">
              {isZero ? (
                <>You have <span className="font-semibold">no credits remaining</span>. Buy more credits or upgrade your plan to continue.</>
              ) : (
                <>You have <span className="font-semibold">{credits} credits</span> left ({percentage}%). Consider topping up to avoid interruptions.</>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant={isZero ? 'default' : 'outline'}
              className={cn(
                'gap-1.5 text-xs h-7',
                !isZero && 'border-amber-500/30 hover:bg-amber-500/10'
              )}
              onClick={onUpgradeClick}
            >
              <Zap className="h-3 w-3" />
              {isZero ? 'Get Credits' : 'Top Up'}
              <ArrowRight className="h-3 w-3" />
            </Button>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                aria-label="Dismiss warning"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
