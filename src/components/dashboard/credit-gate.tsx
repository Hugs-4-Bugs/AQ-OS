'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  ArrowRight,
  CreditCard,
  Sparkles,
  AlertTriangle,
  Lock,
  Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useSubscriptionStore,
  CREDIT_COSTS,
  ACTION_LABELS,
  PLAN_DETAILS,
  type CreditAction,
  type PlanType,
} from '@/lib/subscription-store';
import { cn } from '@/lib/utils';

interface CreditGateProps {
  action: CreditAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showCost?: boolean;
  onUpgrade?: () => void;
}

const CREDIT_ADDONS = [
  { credits: 100, priceINR: 499, priceUSD: 6, label: '100 Credits' },
  { credits: 500, priceINR: 1999, priceUSD: 24, label: '500 Credits' },
];

const PLAN_LABELS: Record<PlanType, string> = {
  free: 'Free',
  pro: 'Pro',
  elite: 'Elite',
};

export default function CreditGate({
  action,
  children,
  fallback,
  showCost = true,
  onUpgrade,
}: CreditGateProps) {
  const credits = useSubscriptionStore((s) => s.credits);
  const creditsMonthly = useSubscriptionStore((s) => s.creditsMonthly);
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const canPerform = useSubscriptionStore((s) => s.canPerform);
  const getActionCost = useSubscriptionStore((s) => s.getActionCost);
  const isPlanLocked = useSubscriptionStore((s) => s.isPlanLocked);
  const getUpgradePlanForAction = useSubscriptionStore((s) => s.getUpgradePlanForAction);

  const cost = getActionCost(action);
  const hasEnough = canPerform(action);
  const label = ACTION_LABELS[action];
  const planDetails = PLAN_DETAILS[currentPlan];
  const locked = isPlanLocked(action);
  const upgradePlan = getUpgradePlanForAction(action);
  const upgradePlanDetails = upgradePlan ? PLAN_DETAILS[upgradePlan] : null;

  // If user has enough credits AND access, render children
  if (hasEnough) {
    return <>{children}</>;
  }

  // Show fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Determine the reason for denial
  const isPlanRestriction = locked;
  const isCreditShortage = !locked && credits < cost;

  // ── Plan-Locked UI (feature not available on current plan) ──
  if (isPlanRestriction) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={`plan-gate-${action}`}
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -8 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={cn(
            'relative flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl',
            'border-2 border-dashed',
            'border-primary/30 bg-gradient-to-b from-primary/5 to-transparent',
            'min-h-[220px] text-center'
          )}
        >
          {/* Lock icon with crown */}
          <div className="relative mb-4">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center bg-primary/10">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <div className="absolute -top-1 -right-1">
              <Badge className="text-[10px] px-1.5 py-0 h-5 gap-0.5 font-bold bg-primary text-white">
                <Crown className="h-3 w-3" />
                {upgradePlan ? PLAN_LABELS[upgradePlan] : 'Pro'}
              </Badge>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold mb-1">
            {label} Requires {upgradePlan ? PLAN_LABELS[upgradePlan] : 'Pro'}
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            Upgrade to <strong className="text-primary">{upgradePlan ? PLAN_LABELS[upgradePlan] : 'Pro'}</strong> to unlock {label.toLowerCase()} and other premium features.
          </p>

          {/* Upgrade plan benefits */}
          {upgradePlanDetails && (
            <div className="mb-5 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/10 w-full max-w-xs">
              <p className="text-xs text-muted-foreground mb-1.5">
                What you get with {PLAN_LABELS[upgradePlan!]}:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {upgradePlanDetails.features.slice(0, 4).map((f) => (
                  <Badge
                    key={f}
                    variant="secondary"
                    className="text-[10px] bg-primary/10 text-primary border-primary/20 gap-0.5"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    {f}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {upgradePlanDetails.creditsMonthly} credits/month • {upgradePlanDetails.priceINR > 0 ? `₹${upgradePlanDetails.priceINR.toLocaleString()}/month` : 'Free'}
              </p>
            </div>
          )}

          {/* Action button */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
            <Button
              onClick={onUpgrade}
              className="gap-2 font-semibold w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Crown className="h-4 w-4" />
              Upgrade to {upgradePlan ? PLAN_LABELS[upgradePlan] : 'Pro'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Cost badge if showCost */}
          {showCost && (
            <div className="absolute top-3 right-3">
              <Badge
                variant="outline"
                className="text-xs gap-1 border-primary/30 text-primary"
              >
                <Lock className="h-3 w-3" />
                {cost} credits
              </Badge>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Credit Shortage UI (not enough credits) ──
  const creditPercentage =
    creditsMonthly > 0 ? Math.round((credits / creditsMonthly) * 100) : 0;
  const isZero = credits === 0;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`credit-gate-${action}`}
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -8 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={cn(
          'relative flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl',
          'border-2 border-dashed',
          isZero
            ? 'border-red-500/30 bg-gradient-to-b from-red-500/5 to-transparent'
            : 'border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent',
          'min-h-[220px] text-center'
        )}
        role="alert"
        aria-live="polite"
      >
        {/* Zap icon with warning */}
        <div className="relative mb-4">
          <div
            className={cn(
              'h-16 w-16 rounded-2xl flex items-center justify-center',
              isZero
                ? 'bg-red-500/10'
                : 'bg-amber-500/10'
            )}
          >
            <Zap
              className={cn(
                'h-8 w-8',
                isZero ? 'text-red-500' : 'text-amber-500'
              )}
              fill="currentColor"
            />
          </div>
          <div className="absolute -top-1 -right-1">
            <Badge
              className={cn(
                'text-[10px] px-1.5 py-0 h-5 gap-0.5 font-bold',
                isZero
                  ? 'bg-red-500 text-white'
                  : 'bg-amber-500 text-white'
              )}
            >
              {cost} ⚡
            </Badge>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold mb-1">
          Not Enough Credits
        </h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          {label} requires <strong className="text-foreground">{cost} credits</strong> but you only have{' '}
          <strong className={isZero ? 'text-red-500' : 'text-amber-500'}>{credits}</strong> remaining.
        </p>

        {/* Credit comparison bar */}
        <div className="w-full max-w-xs mb-5">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Your credits</span>
            <span className={cn('font-semibold', isZero ? 'text-red-500' : 'text-amber-500')}>
              {credits} / {cost} needed
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((credits / cost) * 100, 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={cn(
                'h-full rounded-full',
                isZero ? 'bg-red-500' : 'bg-amber-500'
              )}
            />
          </div>
          <div className="flex justify-between text-[10px] mt-1 text-muted-foreground">
            <span>{creditPercentage}% of monthly used</span>
            <span>Need {cost - credits} more</span>
          </div>
        </div>

        {/* Affordable actions hint */}
        {credits > 0 && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 w-full max-w-xs">
            <p className="text-xs text-muted-foreground mb-1.5">Still affordable with your credits:</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(CREDIT_COSTS) as [CreditAction, number][])
                .filter(([, c]) => c <= credits)
                .filter(([a]) => !isPlanLocked(a)) // Only show actions that are also plan-accessible
                .slice(0, 3)
                .map(([a]) => (
                  <Badge
                    key={a}
                    variant="secondary"
                    className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-0.5"
                  >
                    <Zap className="h-2.5 w-2.5" />
                    {ACTION_LABELS[a]}
                  </Badge>
                ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
          <Button
            onClick={onUpgrade}
            className={cn(
              'gap-2 font-semibold w-full sm:w-auto',
              isZero
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            )}
          >
            <CreditCard className="h-4 w-4" />
            Get More Credits
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick add-on options */}
        <div className="mt-4 w-full max-w-xs">
          <p className="text-xs text-muted-foreground mb-2">Quick credit add-ons:</p>
          <div className="flex gap-2">
            {CREDIT_ADDONS.map((addon) => (
              <button
                key={addon.credits}
                onClick={onUpgrade}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 rounded-lg border p-2',
                  'border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10',
                  'transition-all duration-200 cursor-pointer text-center'
                )}
                aria-label={`Buy ${addon.label} for ₹${addon.priceINR}`}
              >
                <span className="text-xs font-semibold">{addon.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  ₹{addon.priceINR}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Upgrade plan link */}
        <button
          onClick={onUpgrade}
          className="mt-3 text-xs text-primary hover:text-primary/80 transition-colors underline underline-offset-2 inline-flex items-center gap-1"
        >
          <Sparkles className="h-3 w-3" />
          Upgrade your plan for more monthly credits
        </button>

        {/* Cost badge if showCost */}
        {showCost && (
          <div className="absolute top-3 right-3">
            <Badge
              variant="outline"
              className={cn(
                'text-xs gap-1',
                isZero
                  ? 'border-red-500/30 text-red-500'
                  : 'border-amber-500/30 text-amber-500'
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              {cost} credits
            </Badge>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
