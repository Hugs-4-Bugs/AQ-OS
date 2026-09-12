import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      // Compute budget metrics from deals and subscriptions
      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: { proposedPrice: true, finalPrice: true, status: true },
      });

      const totalRevenue = deals.reduce((sum, d) => sum + (d.finalPrice ?? d.proposedPrice ?? 0), 0);
      const closedRevenue = deals
        .filter(d => d.status === 'accepted' || d.status === 'won')
        .reduce((sum, d) => sum + (d.finalPrice ?? d.proposedPrice ?? 0), 0);
      const pendingRevenue = deals
        .filter(d => d.status === 'pending' || d.status === 'proposed')
        .reduce((sum, d) => sum + (d.proposedPrice ?? 0), 0);

      // Subscription credits as budget proxy
      const subscription = await db.subscription.findFirst({
        where: { userId, status: { in: ['active', 'trialing'] } },
        select: { creditsTotal: true, creditsUsed: true, creditsRemaining: true, plan: true },
      });

      const totalBudget = 0; // No configured budget
      const totalSpent = 0;
      const totalRemaining = 0;

      // Department allocations from credit usage
      const creditUsage = await db.creditsLedger.findMany({
        where: { userId },
        select: { action: true, credits: true },
      });

      const departments: Array<{ id: string; name: string; budget: number; spent: number; color: string; gradient: string }> = [];

      return NextResponse.json({
        data: {
          totalBudget,
          totalSpent,
          totalRemaining,
          departments,
          subscription: subscription ? { plan: subscription.plan, creditsTotal: subscription.creditsTotal, creditsUsed: subscription.creditsUsed, creditsRemaining: subscription.creditsRemaining } : null,
          totalRevenue,
          closedRevenue,
          pendingRevenue,
        },
      });
    } catch (error) {
      console.error('[API] Budget error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch budget data' }, { status: 500 });
    }
  });
}
