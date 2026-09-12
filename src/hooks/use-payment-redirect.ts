'use client';

// ═════════════════════════════════════════════════════════════════════
// usePaymentRedirect — handles the Stripe redirect back to /dashboard.
//
// PART 5 of SUBSCRIPTION-PAYMENT-FIX-20260909:
//   Stripe success_url → /dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}
//   Stripe cancel_url  → /dashboard?payment=cancelled
//   Credit add-on success_url → /dashboard?credits_added=true&session_id=...
//
// On mount this hook:
//   1. Reads payment=success | payment=cancelled | credits_added=true
//      (+ session_id) from the URL.
//   2. For success flows, calls POST /api/payments/verify-session with
//      { sessionId }. The server retrieves the session from Stripe and —
//      when payment_status === 'paid' — atomically activates the plan
//      (confirmPaymentAndActivate) or fulfills the credit add-on
//      (fulfillCreditAddon). This covers the case where the Stripe
//      webhook hasn't arrived yet.
//   3. Re-syncs the local subscription store from /api/subscriptions/current.
//   4. Shows the success toast:
//        - Subscription: "Welcome to [Plan Name]! Your plan is now active."
//        - Credit add-on: "N credits added to your account"
//   5. Cleans the URL (history.replaceState) so refreshes don't re-trigger.
// ═════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSubscriptionStore } from '@/lib/subscription-store';

interface VerifySessionResponse {
  success?: boolean;
  paid?: boolean;
  activated?: boolean;
  orderStatus?: string;
  plan?: string;
  billingCycle?: string;
  amount?: number;
  currency?: string;
  credits?: number;
  error?: string;
}

export function usePaymentRedirect() {
  const syncFromBackend = useSubscriptionStore((s) => s.syncFromBackend);
  // Guard against double-invocation (React 18 StrictMode runs effects twice
  // in dev — without the ref we'd fire the verify call twice).
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const creditsAdded = params.get('credits_added');
    const sessionId = params.get('session_id');

    if (!payment && creditsAdded !== 'true') return;
    handledRef.current = true;

    const cleanUrl = () => {
      window.history.replaceState({}, '', window.location.pathname);
    };

    const run = async () => {
      // ── Cancelled on Stripe ──
      if (payment === 'cancelled') {
        toast.info('Payment cancelled — you were not charged.');
        cleanUrl();
        return;
      }

      // ── Success (subscription or credit add-on) ──
      const isCredits = creditsAdded === 'true';
      let verified = false;
      let planName: string | null = null;
      let creditsGranted = 0;

      if (sessionId) {
        try {
          const res = await fetch('/api/payments/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ sessionId }),
          });
          if (res.ok) {
            const data = (await res.json()) as VerifySessionResponse;
            verified = data.paid === true;
            planName = data.plan || null;
            creditsGranted = typeof data.credits === 'number' ? data.credits : 0;
          }
        } catch {
          // Network failure — fall through to sync-only + generic message.
          // The Stripe webhook remains the authoritative activator.
        }
      }

      // Re-sync the subscription store so the UI reflects the new plan /
      // credit balance immediately.
      try {
        const subRes = await fetch('/api/subscriptions/current', {
          credentials: 'include',
        });
        if (subRes.ok) {
          syncFromBackend(await subRes.json());
        }
      } catch {
        // Ignore — the 60s credit poll and 5-min subscription sync will
        // pick up the change.
      }

      if (verified) {
        if (isCredits) {
          toast.success(
            creditsGranted > 0
              ? `${creditsGranted.toLocaleString()} credits added to your account`
              : 'Credits added to your account'
          );
        } else {
          const display =
            planName === 'pro' ? 'Pro' :
            planName === 'elite' ? 'Elite' :
            planName ? planName.charAt(0).toUpperCase() + planName.slice(1) : 'your new plan';
          toast.success(`Welcome to ${display}! Your plan is now active.`);
        }
      } else {
        toast.info(
          'Payment received. Your plan will update automatically within a minute.'
        );
      }
      cleanUrl();
    };

    void run();
  }, [syncFromBackend]);
}
