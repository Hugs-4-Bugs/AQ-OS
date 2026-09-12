'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, ArrowRight, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PLAN_DETAILS, type PlanType } from '@/lib/subscription-store';
import { cn } from '@/lib/utils';

interface UsageLimitBannerProps {
  feature: string;
  used: number;
  limit: number | null; // null = unlimited
  plan: PlanType;
  onUpgrade?: () => void;
}

// Session storage key for dismissed banners
const DISMISSAL_KEY = 'acquisitionos-dismissed-banners';

function getDismissedBanners(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = sessionStorage.getItem(DISMISSAL_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function setBannerDismissed(bannerKey: string) {
  try {
    const dismissed = getDismissedBanners();
    dismissed.add(bannerKey);
    sessionStorage.setItem(DISMISSAL_KEY, JSON.stringify([...dismissed]));
  } catch {
    // Ignore storage errors
  }
}

export default function UsageLimitBanner({
  feature,
  used,
  limit,
  plan,
  onUpgrade,
}: UsageLimitBannerProps) {
  const bannerKey = `usage-${feature}-${plan}`;

  const [dismissed, setDismissed] = useState(() => getDismissedBanners().has(bannerKey));

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setBannerDismissed(bannerKey);
  }, [bannerKey]);

  // If unlimited, never show
  if (limit === null) return null;

  // Calculate usage percentage
  const usagePercentage = Math.round((used / limit) * 100);
  const remaining = Math.max(limit - used, 0);

  // Only show when usage >= 80%
  if (usagePercentage < 80) return null;

  // Don't show if dismissed
  if (dismissed) return null;

  const isBlocked = usagePercentage >= 100;
  const planDetails = PLAN_DETAILS[plan];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={cn(
          'relative w-full overflow-hidden',
          isBlocked
            ? 'bg-red-500/10 border-b border-red-500/20'
            : 'bg-amber-500/10 border-b border-amber-500/20'
        )}
        role="alert"
        aria-live="polite"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Icon + Message */}
            <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
              <div
                className={cn(
                  'shrink-0 h-8 w-8 rounded-lg flex items-center justify-center',
                  isBlocked ? 'bg-red-500/20' : 'bg-amber-500/20'
                )}
              >
                {isBlocked ? (
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      isBlocked ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                    )}
                  >
                    {isBlocked
                      ? `${feature} limit reached`
                      : `${feature} limit approaching`}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {isBlocked
                      ? `You've used all ${limit} ${feature.toLowerCase()} on the ${planDetails.name} plan`
                      : `${remaining} ${feature.toLowerCase()} remaining`}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress
                    value={Math.min(usagePercentage, 100)}
                    className={cn(
                      'h-1.5 flex-1',
                      isBlocked
                        ? '[&>[data-slot=progress-indicator]]:bg-red-500'
                        : '[&>[data-slot=progress-indicator]]:bg-amber-500'
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums shrink-0',
                      isBlocked ? 'text-red-500' : 'text-amber-500'
                    )}
                  >
                    {used}/{limit}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0 ml-11 sm:ml-0">
              <Button
                size="sm"
                onClick={onUpgrade}
                className={cn(
                  'gap-1.5 text-xs font-semibold',
                  isBlocked
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                )}
              >
                Upgrade
                <ArrowRight className="h-3 w-3" />
              </Button>
              <button
                onClick={handleDismiss}
                className={cn(
                  'h-7 w-7 rounded-md flex items-center justify-center',
                  'hover:bg-black/5 dark:hover:bg-white/5 transition-colors',
                  'text-muted-foreground hover:text-foreground'
                )}
                aria-label="Dismiss banner"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
