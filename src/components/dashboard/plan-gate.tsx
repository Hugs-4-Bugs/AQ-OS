'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Lock, Crown, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useSubscriptionStore,
  PLAN_DETAILS,
  type PlanType,
} from '@/lib/subscription-store';
import { cn } from '@/lib/utils';

interface PlanGateProps {
  requiredPlan: 'pro' | 'elite';
  children: React.ReactNode;
  fallback?: React.ReactNode;
  featureName?: string;
  onUpgrade?: () => void;
}

const PLAN_LEVELS: Record<PlanType, number> = {
  free: 0,
  pro: 1,
  elite: 2,
};

export default function PlanGate({
  requiredPlan,
  children,
  fallback,
  featureName,
  onUpgrade,
}: PlanGateProps) {
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);

  const hasAccess = PLAN_LEVELS[currentPlan] >= PLAN_LEVELS[requiredPlan];

  if (hasAccess) {
    return <>{children}</>;
  }

  // Show fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show upgrade prompt
  const requiredDetails = PLAN_DETAILS[requiredPlan];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative flex flex-col items-center justify-center p-8 rounded-2xl',
        'border-2 border-dashed border-primary/20',
        'bg-gradient-to-b from-primary/5 to-transparent',
        'min-h-[200px] text-center'
      )}
    >
      {/* Lock icon */}
      <div className="relative mb-4">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <div className="absolute -top-1 -right-1">
          <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0 h-5 gap-0.5">
            <Crown className="h-2.5 w-2.5" />
            {requiredDetails.name}
          </Badge>
        </div>
      </div>

      {/* Text */}
      <h3 className="text-lg font-bold mb-1">
        {featureName
          ? `${featureName} requires ${requiredDetails.name}`
          : `${requiredDetails.name} Feature`}
      </h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-sm">
        Upgrade to the {requiredDetails.name} plan to unlock this feature and get{' '}
        {requiredDetails.creditsMonthly.toLocaleString()} credits per month.
      </p>

      {/* Feature highlights */}
      <div className="flex flex-wrap justify-center gap-2 mb-5">
        {requiredDetails.features.slice(0, 4).map((f) => (
          <Badge
            key={f}
            variant="secondary"
            className="text-xs bg-primary/5 border-primary/10 gap-1"
          >
            <Sparkles className="h-2.5 w-2.5 text-primary" />
            {f}
          </Badge>
        ))}
      </div>

      {/* Upgrade button */}
      <Button
        onClick={onUpgrade}
        className="gap-2 font-semibold bg-primary hover:bg-primary/90"
      >
        Upgrade to {requiredDetails.name}
        <ArrowRight className="h-4 w-4" />
      </Button>

      {/* Price hint */}
      <p className="text-xs text-muted-foreground mt-2">
        Starting at ₹{requiredDetails.priceINR.toLocaleString('en-IN')}/month
        (${requiredDetails.priceUSD}/month)
      </p>
    </motion.div>
  );
}
