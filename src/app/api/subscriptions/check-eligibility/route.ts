import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, elite: 2 };

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { plan, billingCycle } = await request.json();

      const subscription = await db.subscription.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      if (
        !subscription ||
        ['expired', 'canceled'].includes(subscription.status) ||
        subscription.plan === 'free'
      ) {
        return NextResponse.json({ allowed: true, message: 'ok' });
      }

      if (subscription.status === 'active' || subscription.status === 'trialing') {
        const currentPlan = subscription.plan;
        const currentCycle = subscription.billingCycle;

        // Same plan same cycle
        if (currentPlan === plan && currentCycle === billingCycle) {
          return NextResponse.json({
            allowed: false,
            message: `You already have an active ${currentPlan} ${currentCycle} plan.`,
          });
        }

        // Yearly to monthly same plan
        if (currentPlan === plan && currentCycle === 'yearly' && billingCycle === 'monthly') {
          return NextResponse.json({
            allowed: false,
            message: 'You already have a yearly plan which is better value.',
          });
        }

        // Monthly to yearly same plan
        if (currentPlan === plan && currentCycle === 'monthly' && billingCycle === 'yearly') {
          const periodEnd = subscription.currentPeriodEnd;
          const daysRemaining = periodEnd
            ? Math.ceil((new Date(periodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : 0;
          const endDate = periodEnd
            ? new Date(periodEnd).toLocaleDateString()
            : 'end of billing period';
          return NextResponse.json({
            allowed: false,
            message: `You have ${daysRemaining} days remaining on your monthly plan. You can switch to yearly on ${endDate}.`,
          });
        }

        // Downgrade
        if ((PLAN_RANK[plan] || 0) < (PLAN_RANK[currentPlan] || 0)) {
          return NextResponse.json({
            allowed: false,
            message:
              'To downgrade, please cancel your current plan first. It will remain active until the end of your billing period.',
          });
        }

        // Upgrade
        if ((PLAN_RANK[plan] || 0) > (PLAN_RANK[currentPlan] || 0)) {
          return NextResponse.json({ allowed: true, message: 'upgrade_allowed' });
        }
      }

      return NextResponse.json({ allowed: true, message: 'ok' });
    } catch (error) {
      console.error('Check eligibility error:', error);
      return NextResponse.json({ error: 'Failed to check eligibility' }, { status: 500 });
    }
  });
}
