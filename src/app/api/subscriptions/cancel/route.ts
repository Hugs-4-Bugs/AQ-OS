import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Get user's active subscription
      const subscription = await db.subscription.findFirst({
        where: { userId: user.id, status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
      });

      if (!subscription) {
        return NextResponse.json(
          { error: 'No active subscription to cancel' },
          { status: 400 }
        );
      }

      const now = new Date();
      const periodStart = subscription.currentPeriodStart || subscription.createdAt;
      const periodEnd =
        subscription.currentPeriodEnd ||
        new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

      const totalPeriod = (periodEnd.getTime() - periodStart.getTime()) / 1000;
      const elapsed = (now.getTime() - periodStart.getTime()) / 1000;
      const remainingFraction = 1 - elapsed / totalPeriod;

      // Cancel at period end in Stripe
      if (subscription.stripeSubscriptionId) {
        try {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
          await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: true,
          });
        } catch (stripeError) {
          console.error('Stripe cancel error:', stripeError);
          // Continue with local cancellation even if Stripe fails
        }
      }

      // Update subscription locally
      await db.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          // Keep status as active until period end
        },
      });

      // Calculate refund estimate
      const lastPayment = await db.paymentOrder.findFirst({
        where: { userId: user.id, status: 'completed', plan: subscription.plan },
        orderBy: { createdAt: 'desc' },
      });

      let refundAmount = 0;
      if (lastPayment && remainingFraction > 0.2) {
        refundAmount = Math.floor(lastPayment.amount * remainingFraction);
        if (refundAmount < 100) refundAmount = 0; // Less than Rs 100, no refund
      }

      // Log in audit
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'subscription_canceled',
          details: JSON.stringify({
            plan: subscription.plan,
            billingCycle: subscription.billingCycle,
            remainingFraction: Math.round(remainingFraction * 10000) / 100,
            refundEstimate: refundAmount,
            accessUntil: periodEnd.toISOString(),
          }),
        },
      });

      return NextResponse.json({
        message: 'Subscription canceled',
        accessUntil: periodEnd.toISOString(),
        refundEstimate: refundAmount,
        refundStatus: refundAmount > 0 ? 'eligible' : 'not_applicable',
      });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
    }
  });
}
