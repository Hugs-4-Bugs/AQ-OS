'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, CreditCard, AlertTriangle, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useSubscriptionStore, CREDIT_COSTS, ACTION_LABELS, type CreditAction } from '@/lib/subscription-store';
import { cn } from '@/lib/utils';

interface CreditDisplayProps {
  onClick?: () => void;
  compact?: boolean;
  rolloverCredits?: number;
  addonCredits?: number;
}

// Credit purchase dialog
function CreditPurchaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const credits = useSubscriptionStore((s) => s.credits);
  const creditsMonthly = useSubscriptionStore((s) => s.creditsMonthly);

  const ADDON_PACKS = [
    { credits: 100, priceINR: 499, priceUSD: 6, label: '100 Credits' },
    { credits: 500, priceINR: 1999, priceUSD: 24, label: '500 Credits' },
    { credits: 1000, priceINR: 3499, priceUSD: 42, label: '1,000 Credits' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Buy Credits
          </DialogTitle>
          <DialogDescription>
            You have {credits} of {creditsMonthly} credits remaining
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {ADDON_PACKS.map((pack) => (
            <button
              key={pack.credits}
              onClick={() => onOpenChange(false)}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-xl border',
                'border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10',
                'transition-all duration-200 cursor-pointer'
              )}
            >
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{pack.label}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold">₹{pack.priceINR.toLocaleString('en-IN')}</span>
                <span className="text-[10px] text-muted-foreground block">${pack.priceUSD}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="text-center pt-2">
          <p className="text-xs text-muted-foreground">
            Credit add-ons never expire and are used after monthly credits
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CreditDisplay({
  onClick,
  compact = false,
  rolloverCredits = 0,
  addonCredits = 0,
}: CreditDisplayProps) {
  const credits = useSubscriptionStore((s) => s.credits);
  const creditsMonthly = useSubscriptionStore((s) => s.creditsMonthly);
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const getCreditPercentage = useSubscriptionStore((s) => s.getCreditPercentage);
  const getPlanDetails = useSubscriptionStore((s) => s.getPlanDetails);

  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const percentage = getCreditPercentage();
  const planDetails = getPlanDetails();

  // Total available credits including rollover and addons
  const totalCredits = credits + rolloverCredits + addonCredits;

  // Color based on percentage
  const getColor = () => {
    if (percentage > 50) return 'text-emerald-500';
    if (percentage > 20) return 'text-amber-500';
    return 'text-red-500';
  };

  const getStrokeColor = () => {
    if (percentage > 50) return 'oklch(0.72 0.19 155)'; // emerald
    if (percentage > 20) return 'oklch(0.85 0.18 90)'; // amber
    return 'oklch(0.6 0.25 15)'; // red
  };

  const getBgColor = () => {
    if (percentage > 50) return 'bg-emerald-500/10';
    if (percentage > 20) return 'bg-amber-500/10';
    return 'bg-red-500/10';
  };

  const isLowOrZero = percentage <= 20;

  // Circular progress SVG
  const size = compact ? 32 : 40;
  const strokeWidth = compact ? 3 : 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  // Tooltip breakdown
  // FIX 3: This popup always renders on a dark indigo background, so every
  // text element is hardcoded to white (#FFFFFF) regardless of light/dark
  // theme. No theme-aware CSS variables are used inside this popup.
  const tooltipContent = (
    <div className="space-y-2 text-white">
      <div className="text-white text-sm font-bold">
        {planDetails.name} Plan — <span className="text-white font-bold">{credits}</span>/{creditsMonthly} credits
      </div>

      {/* Credit breakdown */}
      {(rolloverCredits > 0 || addonCredits > 0) && (
        <div className="text-xs space-y-1 border-t border-white/20 pt-1.5">
          <div className="flex justify-between gap-4">
            <span className="text-white font-medium">Monthly</span>
            <span className="text-white font-bold">{credits}</span>
          </div>
          {rolloverCredits > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-white font-medium">Rollover</span>
              <span className="text-white font-bold">+{rolloverCredits}</span>
            </div>
          )}
          {addonCredits > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-white font-medium">Add-on</span>
              <span className="text-white font-bold">+{addonCredits}</span>
            </div>
          )}
          {(rolloverCredits > 0 || addonCredits > 0) && (
            <div className="flex justify-between gap-4 border-t border-white/20 pt-1">
              <span className="text-white font-medium">Total available</span>
              <span className="text-white font-bold">{totalCredits}</span>
            </div>
          )}
        </div>
      )}

      <div className="text-xs space-y-1 border-t border-white/20 pt-1.5">
        {(Object.entries(CREDIT_COSTS) as [CreditAction, number][]).map(
          ([action, cost]) => (
            <div key={action} className="flex justify-between gap-4">
              <span className="text-white font-medium">{ACTION_LABELS[action]}</span>
              <span className="text-white font-bold">
                ⚡ {cost}
              </span>
            </div>
          )
        )}
      </div>
      <div className="text-xs pt-1 border-t border-white/20 flex items-center gap-1">
        <CreditCard className="h-3 w-3 text-white" />
        <a className="text-white underline font-medium cursor-pointer">Click to buy credits or upgrade your plan</a>
      </div>
    </div>
  );

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setPurchaseOpen(true);
    }
  };

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleClick}
              className={cn(
                'relative flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all duration-200',
                'hover:bg-accent cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                getBgColor()
              )}
              aria-label={`${credits} of ${creditsMonthly} credits remaining. Click to upgrade.`}
            >
              {/* Low credit pulsing warning indicator */}
              {isLowOrZero && (
                <motion.span
                  className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500"
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  aria-label="Low credit warning"
                />
              )}

              {/* Circular Progress */}
              <div className="relative" style={{ width: size, height: size }}>
                <svg
                  width={size}
                  height={size}
                  className="-rotate-90"
                  viewBox={`0 0 ${size} ${size}`}
                >
                  {/* Background circle */}
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-muted/30"
                  />
                  {/* Progress circle */}
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={getStrokeColor()}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                {/* Zap icon in center */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap
                    className={cn(
                      compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
                      getColor()
                    )}
                    fill="currentColor"
                  />
                </div>
              </div>

              {/* Credit numbers */}
              {!compact && (
                <div className="flex flex-col items-start">
                  <span className={cn('text-xs font-bold tabular-nums leading-tight', getColor())}>
                    {credits}/{creditsMonthly}
                  </span>
                  {/* Rollover/addon indicator */}
                  {(rolloverCredits > 0 || addonCredits > 0) && (
                    <span className="text-[9px] text-primary leading-tight flex items-center gap-0.5">
                      <Sparkles className="h-2 w-2" />
                      +{rolloverCredits + addonCredits} extra
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    credits
                  </span>
                </div>
              )}

              {/* Compact: just numbers inline */}
              {compact && (
                <span className={cn('text-[11px] font-bold tabular-nums', getColor())}>
                  {totalCredits}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="w-64 bg-indigo-600 border-indigo-700 text-white shadow-lg">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Credit Purchase Dialog */}
      <CreditPurchaseDialog
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
      />
    </>
  );
}
