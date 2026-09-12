// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment Failed Modal
// Phase 5: Payments System
//
// Shows after payment failure with error icon, failure reason,
// retry button, and contact support link.
// ═══════════════════════════════════════════════════════════════════

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  XCircle,
  RefreshCcw,
  Mail,
  AlertTriangle,
  Shield,
  CreditCard,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { usePayment, type PaymentStatus } from '@/hooks/use-payment';
import { cn } from '@/lib/utils';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface PaymentFailedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  failureReason?: string;
  onRetry?: () => void;
}

// ─── Failure reason descriptions ─────────────────────────────────────────────────

const FAILURE_REASONS: Record<string, string> = {
  payment_failed: 'The payment was declined by your bank or payment provider.',
  insufficient_funds: 'Your account does not have sufficient funds for this transaction.',
  card_declined: 'Your card was declined. Please try a different payment method.',
  network_error: 'A network error occurred during payment processing.',
  timeout: 'Payment verification timed out. Your payment may still be processing.',
  cancelled: 'The payment was cancelled before completion.',
  verification_failed: 'We could not verify your payment. Please try again.',
  generic: 'An unexpected error occurred during payment processing.',
};

function getFailureMessage(status: PaymentStatus, reason?: string): string {
  if (reason && FAILURE_REASONS[reason]) return FAILURE_REASONS[reason];
  if (status === 'timeout') return FAILURE_REASONS.timeout;
  return FAILURE_REASONS.generic;
}

// ─── Animated error icon ────────────────────────────────────────────────────────

function AnimatedErrorIcon() {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer ring */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="h-20 w-20 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center"
      >
        {/* Inner ring */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2, ease: 'easeOut' }}
          className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center"
        >
          {/* X icon */}
          <motion.div
            initial={{ scale: 0, rotate: 180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.4, delay: 0.3, type: 'spring', stiffness: 200 }}
          >
            <XCircle className="h-10 w-10 text-red-500" />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Warning pulse */}
      <motion.div
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute h-20 w-20 rounded-full border border-red-500/20"
      />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function PaymentFailedModal({
  open,
  onOpenChange,
  failureReason,
  onRetry,
}: PaymentFailedModalProps) {
  const paymentStatus = usePayment((s) => s.paymentStatus);
  const retryPayment = usePayment((s) => s.retryPayment);
  const resetPaymentState = usePayment((s) => s.resetPaymentState);

  const failureMessage = getFailureMessage(paymentStatus, failureReason);
  const isTimeout = paymentStatus === 'timeout';

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      retryPayment();
    }
    onOpenChange(false);
  };

  const handleDismiss = () => {
    resetPaymentState();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw] p-0 gap-0 overflow-hidden">
        <div className="p-6 text-center space-y-5">
          {/* Animated error icon */}
          <div className="flex justify-center pt-2">
            <AnimatedErrorIcon />
          </div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <DialogTitle className="text-2xl font-bold text-red-500 flex items-center justify-center gap-2">
              {isTimeout ? (
                <>
                  <AlertTriangle className="h-6 w-6" />
                  Verification Timeout
                </>
              ) : (
                <>
                  <XCircle className="h-6 w-6" />
                  Payment Failed
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-2 max-w-xs mx-auto">
              {failureMessage}
            </DialogDescription>
          </motion.div>

          {/* Helpful info */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-left space-y-3"
          >
            <p className="text-sm font-medium text-foreground">What you can do:</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <RefreshCcw className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Try the payment again with the same or a different payment method</span>
              </div>
              <div className="flex items-start gap-2">
                <CreditCard className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Check your card details and ensure sufficient balance</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>If your account was charged, it will be refunded within 5–7 business days</span>
              </div>
            </div>
          </motion.div>

          <Separator />

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="space-y-3"
          >
            <Button
              className="w-full gap-2 font-semibold"
              onClick={handleRetry}
              size="lg"
            >
              <RefreshCcw className="h-4 w-4" />
              {isTimeout ? 'Check Payment Status' : 'Retry Payment'}
            </Button>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleDismiss}
            >
              Dismiss
            </Button>

            <p className="text-xs text-muted-foreground pt-1">
              Still having trouble?{' '}
              <a
                href="mailto:support@acquisitionos.com"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                <Mail className="h-3 w-3" />
                Contact Support
              </a>
            </p>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
