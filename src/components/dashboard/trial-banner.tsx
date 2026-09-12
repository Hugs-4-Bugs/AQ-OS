// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — TrialBanner Component
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// Displays a banner at the top of the dashboard when the user is on
// a trial plan. Shows days remaining and a CTA to upgrade.
// ═══════════════════════════════════════════════════════════════════

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ArrowRight, Sparkles } from 'lucide-react';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TrialBannerProps {
  onUpgradeClick?: () => void;
}

export default function TrialBanner({ onUpgradeClick }: TrialBannerProps) {
  const isTrial = useSubscriptionStore((s) => s.isTrial);
  const trialDaysRemaining = useSubscriptionStore((s) => s.trialDaysRemaining);
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);

  // Only show for trial users
  if (!isTrial || currentPlan !== 'free') return null;

  const isUrgent = trialDaysRemaining <= 3;
  const isExpired = trialDaysRemaining <= 0;

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
            isExpired
              ? 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400'
              : isUrgent
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400'
                : 'bg-primary/5 border-primary/10 text-primary'
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Clock className={cn('h-4 w-4 shrink-0', isUrgent && 'animate-pulse')} />
            <span className="truncate">
              {isExpired ? (
                <>Your trial has expired. Upgrade to continue using all features.</>
              ) : (
                <>
                  <span className="font-semibold">{trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''}</span> left in your free trial.
                  Upgrade to unlock all features.
                </>
              )}
            </span>
          </div>
          <Button
            size="sm"
            variant={isUrgent || isExpired ? 'default' : 'outline'}
            className={cn(
              'shrink-0 gap-1.5 text-xs h-7',
              !isUrgent && !isExpired && 'border-primary/30 hover:bg-primary/10'
            )}
            onClick={onUpgradeClick}
          >
            <Sparkles className="h-3 w-3" />
            Upgrade Now
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
