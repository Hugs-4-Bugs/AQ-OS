'use client';

import React from 'react';
import { Zap, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  useSubscriptionStore,
  type CreditAction,
  ACTION_LABELS,
} from '@/lib/subscription-store';
import { cn } from '@/lib/utils';

interface CreditCostBadgeProps {
  action: CreditAction;
  showLabel?: boolean;
  size?: 'sm' | 'default';
  className?: string;
}

export default function CreditCostBadge({
  action,
  showLabel = false,
  size = 'default',
  className,
}: CreditCostBadgeProps) {
  const credits = useSubscriptionStore((s) => s.credits);
  const getActionCost = useSubscriptionStore((s) => s.getActionCost);
  const canPerform = useSubscriptionStore((s) => s.canPerform);

  const cost = getActionCost(action);
  const hasEnough = canPerform(action);
  const label = ACTION_LABELS[action];

  const isSmall = size === 'sm';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'gap-1 font-medium border-0 inline-flex items-center',
              isSmall ? 'text-[10px] px-1.5 py-0 h-5' : 'text-xs px-2 py-0.5',
              hasEnough
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'bg-red-500/10 text-red-500 border-red-500/20',
              className
            )}
          >
            {hasEnough ? (
              <Zap className={cn('fill-current', isSmall ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
            ) : (
              <AlertTriangle className={cn(isSmall ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
            )}
            <span>{cost} credit{cost !== 1 ? 's' : ''}</span>
            {showLabel && (
              <span className="text-muted-foreground hidden sm:inline">
                · {label}
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {hasEnough ? (
            <span>
              {label}: {cost} credit{cost !== 1 ? 's' : ''} (You have {credits})
            </span>
          ) : (
            <span className="text-red-400">
              Insufficient credits! {label} requires {cost} credits but you only have {credits}.
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
