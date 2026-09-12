// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment SSE (Server-Sent Events) Service
// Phase 5: Payments System
//
// Payment status streaming via SSE. Only payment-related realtime.
// NOT a global realtime system — that's a future phase.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export type PaymentSSEEventType =
  | 'payment_status_update'
  | 'subscription_activated'
  | 'subscription_cancelled'
  | 'invoice_generated'
  | 'payment_failed'
  | 'payment_retry_available'
  | 'credits_updated';

export interface PaymentSSEEvent {
  event: PaymentSSEEventType;
  data: {
    orderId?: string;
    status?: string;
    plan?: string;
    credits?: number;
    invoiceId?: string;
    invoiceNumber?: string;
    message?: string;
    timestamp: string;
  };
}

// ===== SSE STREAM CREATOR =====

/**
 * Create an SSE response stream for a user's payment events.
 * This endpoint is polled by the frontend to get real-time payment updates.
 *
 * Usage in API route:
 * ```
 * const stream = createPaymentSSEStream(userId);
 * return new Response(stream, {
 *   headers: {
 *     'Content-Type': 'text/event-stream',
 *     'Cache-Control': 'no-cache',
 *     'Connection': 'keep-alive',
 *   },
 * });
 * ```
 */
export function createPaymentSSEStream(userId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastCheckedAt = new Date();

  return new ReadableStream({
    start(controller) {
      // Send initial connection event
      const connectEvent: PaymentSSEEvent = {
        event: 'payment_status_update',
        data: {
          message: 'Connected to payment status stream',
          timestamp: new Date().toISOString(),
        },
      };
      controller.enqueue(encoder.encode(`event: ${connectEvent.event}\ndata: ${JSON.stringify(connectEvent.data)}\n\n`));

      // Poll for payment status changes every 3 seconds
      intervalId = setInterval(async () => {
        try {
          const events = await checkForPaymentEvents(userId, lastCheckedAt);
          lastCheckedAt = new Date();

          for (const event of events) {
            controller.enqueue(encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`));
          }
        } catch (error) {
          console.error('[PaymentSSE] Error checking for events:', error);
          // Don't close the stream on error, just skip this cycle
        }
      }, 3000);
    },

    cancel() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  });
}

// ===== EVENT CHECKER =====

async function checkForPaymentEvents(
  userId: string,
  since: Date
): Promise<PaymentSSEEvent[]> {
  const events: PaymentSSEEvent[] = [];

  try {
    // Check for recent payment order status changes
    const recentOrders = await db.paymentOrder.findMany({
      where: {
        userId,
        updatedAt: { gte: since },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    for (const order of recentOrders) {
      if (order.status === 'completed') {
        events.push({
          event: 'payment_status_update',
          data: {
            orderId: order.id,
            status: 'completed',
            plan: order.plan,
            timestamp: order.updatedAt.toISOString(),
            message: `Payment for ${order.plan} plan completed`,
          },
        });
      } else if (order.status === 'failed') {
        events.push({
          event: 'payment_failed',
          data: {
            orderId: order.id,
            status: 'failed',
            plan: order.plan,
            timestamp: order.updatedAt.toISOString(),
            message: `Payment for ${order.plan} plan failed`,
          },
        });
      }
    }

    // Check for recent invoice generations
    const recentInvoices = await db.invoice.findFirst({
      where: {
        userId,
        createdAt: { gte: since },
      },
    });

    if (recentInvoices) {
      events.push({
        event: 'invoice_generated',
        data: {
          invoiceId: recentInvoices.id,
          invoiceNumber: recentInvoices.invoiceNumber,
          timestamp: recentInvoices.createdAt.toISOString(),
          message: `Invoice ${recentInvoices.invoiceNumber} generated`,
        },
      });
    }

    // Check for subscription status changes
    const recentSubscription = await db.subscription.findFirst({
      where: {
        userId,
        updatedAt: { gte: since },
      },
    });

    if (recentSubscription) {
      if (recentSubscription.status === 'active') {
        events.push({
          event: 'subscription_activated',
          data: {
            plan: recentSubscription.plan,
            status: recentSubscription.status,
            timestamp: recentSubscription.updatedAt.toISOString(),
            message: `Subscription activated for ${recentSubscription.plan} plan`,
          },
        });
      } else if (recentSubscription.status === 'canceled') {
        events.push({
          event: 'subscription_cancelled',
          data: {
            plan: recentSubscription.plan,
            status: recentSubscription.status,
            timestamp: recentSubscription.updatedAt.toISOString(),
            message: 'Subscription cancelled',
          },
        });
      }
    }

    // Check for credit balance changes
    const recentCreditEntries = await db.creditsLedger.findFirst({
      where: {
        userId,
        createdAt: { gte: since },
        action: { in: ['plan_upgrade', 'subscription_payment', 'credit_addon_purchase'] },
      },
    });

    if (recentCreditEntries) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if (user) {
        events.push({
          event: 'credits_updated',
          data: {
            credits: user.credits,
            timestamp: new Date().toISOString(),
            message: 'Credits updated',
          },
        });
      }
    }
  } catch (error) {
    console.error('[PaymentSSE] Error checking for payment events:', error);
  }

  return events;
}

// ===== CLIENT-SIDE HOOK HELPER =====

/**
 * Client-side utility for consuming the payment SSE stream.
 * Returns a cleanup function to close the connection.
 *
 * Usage in React component:
 * ```
 * useEffect(() => {
 *   const cleanup = subscribeToPaymentUpdates((event) => {
 *     if (event.event === 'payment_status_update' && event.data.status === 'completed') {
 *       // Refresh subscription data
 *     }
 *   });
 *   return cleanup;
 * }, []);
 * ```
 */
export function subscribeToPaymentUpdates(
  onEvent: (event: PaymentSSEEvent) => void,
  onError?: (error: Error) => void
): () => void {
  const eventSource = new EventSource('/api/payments/sse');

  const eventTypes: PaymentSSEEventType[] = [
    'payment_status_update',
    'subscription_activated',
    'subscription_cancelled',
    'invoice_generated',
    'payment_failed',
    'payment_retry_available',
    'credits_updated',
  ];

  for (const type of eventTypes) {
    eventSource.addEventListener(type, (e) => {
      try {
        const data = JSON.parse(e.data);
        onEvent({ event: type, data });
      } catch {
        // Ignore parse errors
      }
    });
  }

  eventSource.onerror = () => {
    if (onError) {
      onError(new Error('SSE connection error'));
    }
    // EventSource will automatically reconnect
  };

  return () => {
    eventSource.close();
  };
}
