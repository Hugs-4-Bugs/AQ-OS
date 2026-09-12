'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribeToChannel } from '@/hooks/use-live-updates'
import { toast } from 'sonner'
import type { LiveEvent } from '@/hooks/use-live-updates'

// ─── Event Types ─────────────────────────────────────────────────────────────

type PaymentEventType =
  | 'payment_success'
  | 'payment_failed'
  | 'credits_updated'
  | 'subscription_changed'
  | 'trial_ending'

// ─── Payload Shapes ──────────────────────────────────────────────────────────

interface PaymentSuccessPayload {
  orderId: string
  amount: number
  currency: string
  creditsAdded?: number
  plan?: string
  description?: string
}

interface PaymentFailedPayload {
  orderId: string
  amount: number
  currency: string
  reason: string
  errorCode?: string
  retryable?: boolean
}

interface CreditsUpdatedPayload {
  previousBalance: number
  newBalance: number
  change: number
  reason: string
  action?: string
  rolloverCredits?: number
  addonCredits?: number
}

interface SubscriptionChangedPayload {
  previousPlan: string
  newPlan: string
  effectiveAt?: string
  billingCycle?: 'monthly' | 'yearly'
  features?: string[]
}

interface TrialEndingPayload {
  daysRemaining: number
  plan: string
  endsAt: string
  upgradeUrl?: string
}

// ─── Hook Options ────────────────────────────────────────────────────────────

interface UseLivePaymentsOptions {
  onPaymentSuccess?: (payload: PaymentSuccessPayload) => void
  onPaymentFailed?: (payload: PaymentFailedPayload) => void
  onCreditsUpdated?: (payload: CreditsUpdatedPayload) => void
  onSubscriptionChanged?: (payload: SubscriptionChangedPayload) => void
  onTrialEnding?: (payload: TrialEndingPayload) => void
}

type UseLivePaymentsReturn = void

// ─── Helper: format currency ─────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLivePayments(options: UseLivePaymentsOptions = {}): UseLivePaymentsReturn {
  const queryClient = useQueryClient()
  const optionsRef = useRef(options)

  // Keep ref in sync without triggering re-renders in the event handler
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  // ── Event handler ──

  const handlePaymentEvent = useCallback(
    (event: LiveEvent) => {
      const { type, payload } = event

      queueMicrotask(() => {
        switch (type as PaymentEventType) {
          // ─── Payment Success ──────────────────────────────────────────
          case 'payment_success': {
            const data = payload as unknown as PaymentSuccessPayload

            // Refresh all billing-related queries
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
            queryClient.invalidateQueries({ queryKey: ['credits'] })
            queryClient.invalidateQueries({ queryKey: ['entitlements'] })

            const amount = formatCurrency(data.amount, data.currency)
            toast.success('Payment successful!', {
              description: data.creditsAdded
                ? `${amount} — ${data.creditsAdded} credits added`
                : amount,
            })

            optionsRef.current.onPaymentSuccess?.(data)
            break
          }

          // ─── Payment Failed ───────────────────────────────────────────
          case 'payment_failed': {
            const data = payload as unknown as PaymentFailedPayload

            const amount = formatCurrency(data.amount, data.currency)
            toast.error('Payment failed', {
              description: data.reason ?? `Failed to process ${amount}`,
            })

            optionsRef.current.onPaymentFailed?.(data)
            break
          }

          // ─── Credits Updated ──────────────────────────────────────────
          case 'credits_updated': {
            const data = payload as unknown as CreditsUpdatedPayload

            // Refresh credit balance queries
            queryClient.invalidateQueries({ queryKey: ['credits'] })
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] })

            // Update credit display via cache if possible
            queryClient.setQueryData<{ balance: number } | undefined>(
              ['credits'],
              (old) => {
                if (!old) return old
                return { ...old, balance: data.newBalance }
              },
            )

            // Low credit warning
            if (data.newBalance <= 5 && data.newBalance > 0) {
              toast.warning('Credits running low', {
                description: `${data.newBalance} credits remaining`,
              })
            } else if (data.newBalance === 0) {
              toast.error('No credits remaining', {
                description: 'Purchase more credits to continue using AI features',
              })
            }

            optionsRef.current.onCreditsUpdated?.(data)
            break
          }

          // ─── Subscription Changed ─────────────────────────────────────
          case 'subscription_changed': {
            const data = payload as unknown as SubscriptionChangedPayload

            // Refresh all subscription-related data
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
            queryClient.invalidateQueries({ queryKey: ['credits'] })
            queryClient.invalidateQueries({ queryKey: ['entitlements'] })

            const effectiveLabel = data.effectiveAt
              ? ` (effective ${new Date(data.effectiveAt).toLocaleDateString()})`
              : ''

            toast.success('Subscription updated', {
              description: `${data.previousPlan} → ${data.newPlan}${effectiveLabel}`,
            })

            optionsRef.current.onSubscriptionChanged?.(data)
            break
          }

          // ─── Trial Ending ─────────────────────────────────────────────
          case 'trial_ending': {
            const data = payload as unknown as TrialEndingPayload

            const urgency =
              data.daysRemaining <= 1 ? 'error' :
              data.daysRemaining <= 3 ? 'warning' : 'info'

            const message =
              data.daysRemaining <= 1
                ? 'Your trial ends today!'
                : data.daysRemaining <= 3
                ? `Your trial ends in ${data.daysRemaining} days`
                : `${data.daysRemaining} days remaining in your trial`

            toast[urgency === 'error' ? 'error' : urgency === 'warning' ? 'warning' : 'info'](
              'Trial ending soon',
              { description: message },
            )

            // Refresh subscription status
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] })

            optionsRef.current.onTrialEnding?.(data)
            break
          }
        }
      })
    },
    [queryClient],
  )

  // ── Subscribe to payment events ──

  useEffect(() => {
    const unsub = subscribeToChannel('payment', { handler: handlePaymentEvent })
    return unsub
  }, [handlePaymentEvent])

  return {}
}

export type {
  UseLivePaymentsOptions,
  UseLivePaymentsReturn,
  PaymentEventType,
  PaymentSuccessPayload,
  PaymentFailedPayload,
  CreditsUpdatedPayload,
  SubscriptionChangedPayload,
  TrialEndingPayload,
}
