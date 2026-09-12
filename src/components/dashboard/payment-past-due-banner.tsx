// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — PaymentPastDueBanner Component
//
// Displays a persistent amber/yellow warning banner at the top of
// the dashboard when the user's subscription renewal payment failed.
// Shows a CTA to update payment method and a dismiss button that
// hides the banner for the current session only (sessionStorage).
// ═══════════════════════════════════════════════════════════════════

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CreditCard, X } from 'lucide-react';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SESSION_DISMISS_KEY = 'acquisitionos_payment_past_due_dismissed';

// Read sessionStorage once at module level (client only) to avoid
// calling setState synchronously inside useEffect, which triggers
// the react-hooks/no-async-setState-in-useEffect lint rule.
function getSessionDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

interface PaymentPastDueBannerProps {
  onUpdatePaymentClick?: () => void;
}

export default function PaymentPastDueBanner({
  onUpdatePaymentClick,
}: PaymentPastDueBannerProps) {
  // Derived: the subscription store has no dedicated flag — 'past_due' status
  // means the renewal payment failed and the account is past due.
  const subscriptionStatus = useSubscriptionStore((s) => s.subscriptionStatus);
  const paymentPastDue = subscriptionStatus === 'past_due';
  const [dismissed, setDismissed] = useState(getSessionDismissed);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
    } catch {
      // Ignore write failures
    }
  };

  // Don't render if payment is not past due or banner was dismissed this session
  if (!paymentPastDue || dismissed) return null;

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
            'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400'
          )}
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
            <span className="truncate">
              ⚠️ Your subscription payment failed. Please update your payment method to avoid service interruption. You have a{' '}
              <span className="font-semibold">3-day grace period</span>.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className={cn(
                'gap-1.5 text-xs h-7',
                'border-amber-500/30 hover:bg-amber-500/10 text-amber-700 dark:text-amber-400'
              )}
              onClick={onUpdatePaymentClick}
            >
              <CreditCard className="h-3 w-3" />
              Update Payment Method
            </Button>
            <button
              onClick={handleDismiss}
              className="p-0.5 rounded hover:bg-amber-500/10 dark:hover:bg-amber-500/10 transition-colors"
              aria-label="Dismiss payment warning"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
