// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment Success Modal
// Phase 5: Payments System
//
// Shows after successful payment confirmation with checkmark animation,
// plan details, credits allocated, and auto-refreshes subscription data.
// ═══════════════════════════════════════════════════════════════════

'use client';

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Zap,
  Sparkles,
  ArrowRight,
  Crown,
  PartyPopper,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  useSubscriptionStore,
  PLAN_DETAILS,
  type PlanType,
} from '@/lib/subscription-store';
import { usePayment } from '@/hooks/use-payment';
import { cn } from '@/lib/utils';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface PaymentSuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanType;
  creditsAllocated: number;
  billingCycle: 'monthly' | 'yearly';
}

// ─── Checkmark animation ────────────────────────────────────────────────────────

function AnimatedCheckmark() {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer ring */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="h-20 w-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center"
      >
        {/* Inner ring */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2, ease: 'easeOut' }}
          className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center"
        >
          {/* Checkmark */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.4, delay: 0.3, type: 'spring', stiffness: 200 }}
          >
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Sparkles */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <motion.div
          key={angle}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 0], opacity: [0, 1, 0] }}
          transition={{
            duration: 0.8,
            delay: 0.5 + i * 0.1,
            ease: 'easeOut',
          }}
          className="absolute"
          style={{
            transform: `rotate(${angle}deg) translateY(-52px)`,
          }}
        >
          <Sparkles className="h-3 w-3 text-emerald-400" />
        </motion.div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function PaymentSuccessModal({
  open,
  onOpenChange,
  plan,
  creditsAllocated,
  billingCycle,
}: PaymentSuccessModalProps) {
  const planDetails = PLAN_DETAILS[plan];
  const confirmPaymentSuccess = usePayment((s) => s.confirmPaymentSuccess);

  // Auto-confirm and refresh subscription data when modal opens
  useEffect(() => {
    if (open) {
      confirmPaymentSuccess(plan);
    }
  }, [open, plan, confirmPaymentSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw] p-0 gap-0 overflow-hidden">
        <div className="p-6 text-center space-y-5">
          {/* Animated checkmark */}
          <div className="flex justify-center pt-2">
            <AnimatedCheckmark />
          </div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <DialogTitle className="text-2xl font-bold gradient-text flex items-center justify-center gap-2">
              <PartyPopper className="h-6 w-6 text-emerald-500" />
              Payment Successful!
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-2">
              Welcome to {planDetails.name}! Your subscription is now active.
            </DialogDescription>
          </motion.div>

          {/* Plan details card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-left space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {plan === 'elite' ? (
                  <Crown className="h-5 w-5 text-amber-500" />
                ) : (
                  <Zap className="h-5 w-5 text-primary" />
                )}
                <span className="font-bold">{planDetails.name} Plan</span>
              </div>
              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                Active
              </Badge>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Billing</span>
                <span className="font-medium capitalize">{billingCycle}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Credits allocated</span>
                <span className="font-medium flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  {creditsAllocated.toLocaleString()}/month
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Features</span>
                <span className="font-medium">{planDetails.features.length} unlocked</span>
              </div>
            </div>
          </motion.div>

          {/* Feature highlights */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="space-y-1.5"
          >
            <p className="text-xs font-medium text-muted-foreground">You now have access to:</p>
            <div className="flex flex-wrap gap-1.5">
              {planDetails.features.slice(0, 5).map((feature) => (
                <Badge
                  key={feature}
                  variant="secondary"
                  className="text-[10px] bg-emerald-500/5 text-emerald-600 border-emerald-500/10"
                >
                  {feature}
                </Badge>
              ))}
              {planDetails.features.length > 5 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-primary/5 text-primary border-primary/10"
                >
                  +{planDetails.features.length - 5} more
                </Badge>
              )}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="space-y-3"
          >
            <Button
              className="w-full gap-2 font-semibold"
              onClick={() => onOpenChange(false)}
              size="lg"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-[10px] text-muted-foreground">
              A receipt has been sent to your email address.
            </p>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
