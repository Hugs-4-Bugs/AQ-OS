'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDown,
  X,
  Zap,
  Database,
  Users,
  BarChart3,
  Sparkles,
  Shield,
  Clock,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  PLAN_DETAILS,
  type PlanType,
} from '@/lib/subscription-store';
import { cn } from '@/lib/utils';

interface DowngradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: PlanType;
  targetPlan: PlanType;
  onConfirm: () => void;
}

const PLAN_LEVELS: Record<PlanType, number> = { free: 0, pro: 1, elite: 2 };

// Features that would be lost per downgrade path
const DOWNGRADE_FEATURES: Record<string, { icon: React.ElementType; label: string }[]> = {
  'pro->free': [
    { icon: Zap, label: '500 monthly credits → 50 credits' },
    { icon: Database, label: 'Unlimited leads → 10 leads max' },
    { icon: BarChart3, label: 'Deep lead analysis' },
    { icon: Sparkles, label: 'Outreach sequences' },
    { icon: Users, label: 'Sales coaching sessions' },
    { icon: Shield, label: 'Proposal generation' },
    { icon: BarChart3, label: 'Competitor analysis' },
    { icon: Database, label: 'Data export (PDF)' },
  ],
  'elite->pro': [
    { icon: Sparkles, label: 'White-label reports' },
    { icon: Users, label: 'Team collaboration' },
    { icon: Zap, label: 'Custom integrations' },
    { icon: Database, label: 'API access' },
    { icon: Users, label: 'Dedicated account manager' },
    { icon: Sparkles, label: 'Custom AI training' },
    { icon: Shield, label: 'SLA guarantee' },
  ],
};

export default function DowngradeModal({
  open,
  onOpenChange,
  currentPlan,
  targetPlan,
  onConfirm,
}: DowngradeModalProps) {
  const currentDetails = PLAN_DETAILS[currentPlan];
  const targetDetails = PLAN_DETAILS[targetPlan];

  const downgradeKey = `${currentPlan}->${targetPlan}`;
  const lostFeatures = DOWNGRADE_FEATURES[downgradeKey] || [];

  // Credit difference
  const creditDiff = currentDetails.creditsMonthly - targetDetails.creditsMonthly;

  // Effective date (end of current billing period — 30 days from now as estimate)
  const effectiveDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  // Data impact
  const dataImpact = useMemo(() => {
    const impacts: string[] = [];
    if (targetDetails.maxLeads !== null) {
      impacts.push(
        `Leads beyond ${targetDetails.maxLeads} will be archived and read-only`
      );
    }
    if (creditDiff > 0) {
      impacts.push(
        `Monthly credits will drop from ${currentDetails.creditsMonthly.toLocaleString()} to ${targetDetails.creditsMonthly.toLocaleString()}`
      );
    }
    if (targetPlan === 'free') {
      impacts.push('Outreach sequences will be paused');
      impacts.push('AI coaching sessions will be disabled');
    }
    return impacts;
  }, [currentDetails, targetDetails, creditDiff, targetPlan]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg w-[95vw] p-0 gap-0 overflow-hidden">
        {/* Red accent header */}
        <div className="bg-red-500/5 border-b border-red-500/10 p-6 pb-4">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <AlertDialogTitle className="text-lg font-bold text-red-600 dark:text-red-400">
                  Downgrade to {targetDetails.name}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-muted-foreground mt-0.5">
                  Please review what you&apos;ll lose before confirming
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
        </div>

        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Plan comparison */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <div className="flex-1 text-center">
              <p className="text-xs text-muted-foreground mb-1">Current</p>
              <p className="text-sm font-bold text-emerald-500">{currentDetails.name}</p>
              <p className="text-xs text-muted-foreground">
                {currentDetails.creditsMonthly.toLocaleString()} credits/mo
              </p>
            </div>
            <ArrowDown className="h-5 w-5 text-red-500 shrink-0" />
            <div className="flex-1 text-center">
              <p className="text-xs text-muted-foreground mb-1">Downgrading to</p>
              <p className="text-sm font-bold text-red-500">{targetDetails.name}</p>
              <p className="text-xs text-muted-foreground">
                {targetDetails.creditsMonthly.toLocaleString()} credits/mo
              </p>
            </div>
          </div>

          {/* Features lost */}
          <div>
            <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
              <X className="h-4 w-4" />
              Features you&apos;ll lose
            </h4>
            <div className="space-y-2">
              {lostFeatures.map(({ icon: FIcon, label }) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2.5 text-sm text-foreground/70"
                >
                  <FIcon className="h-4 w-4 text-red-400 shrink-0" />
                  <span>{label}</span>
                </motion.div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Credit difference */}
          {creditDiff > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <Zap className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {creditDiff.toLocaleString()} fewer credits per month
                </p>
                <p className="text-xs text-muted-foreground">
                  From {currentDetails.creditsMonthly.toLocaleString()} → {targetDetails.creditsMonthly.toLocaleString()} credits
                </p>
              </div>
            </div>
          )}

          {/* Data impact */}
          {dataImpact.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                What happens to your data
              </h4>
              <div className="space-y-1.5">
                {dataImpact.map((impact) => (
                  <p key={impact} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    {impact}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Effective date */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs font-medium">Effective date</p>
              <p className="text-xs text-muted-foreground">
                {effectiveDate} (end of current billing period)
              </p>
            </div>
          </div>

          {/* Warning box */}
          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10">
            <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              This action will take effect at the end of your current billing period. You won&apos;t be able to reverse this until the next billing cycle.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <AlertDialogCancel asChild>
            <Button variant="outline" className="gap-2 font-semibold">
              <Shield className="h-4 w-4 text-emerald-500" />
              Keep My Plan
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              onClick={onConfirm}
              variant="destructive"
              className="gap-2 font-semibold"
            >
              <AlertTriangle className="h-4 w-4" />
              I Understand, Downgrade
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
