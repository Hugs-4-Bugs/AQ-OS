import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: { status: true, proposedPrice: true, finalPrice: true, createdAt: true },
      });

      const payments = await db.paymentOrder.findMany({
        where: { userId, status: 'completed' },
        select: { amount: true, plan: true, createdAt: true },
      });

      const now = new Date();
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const prevQuarterStart = new Date(quarterStart.getFullYear(), quarterStart.getMonth() - 3, 1);

      // Current quarter data
      const currentDeals = deals.filter(d => new Date(d.createdAt) >= quarterStart);
      const prevDeals = deals.filter(d => {
        const d2 = new Date(d.createdAt);
        return d2 >= prevQuarterStart && d2 < quarterStart;
      });

      const wonDeals = currentDeals.filter(d => d.status === 'won' || d.status === 'accepted');
      const newBusiness = wonDeals.reduce((s, d) => s + (d.finalPrice ?? d.proposedPrice ?? 0), 0);
      const expansion = wonDeals.filter(d => (d.finalPrice ?? 0) > (d.proposedPrice ?? 0))
        .reduce((s, d) => s + ((d.finalPrice ?? 0) - (d.proposedPrice ?? 0)), 0);
      const lostDeals = currentDeals.filter(d => d.status === 'lost' || d.status === 'rejected');
      const churn = lostDeals.reduce((s, d) => s + (d.proposedPrice ?? 0), 0);
      const contraction = 0; // No separate contraction tracking in schema

      // Starting revenue (from completed payments before quarter)
      const prevPayments = payments.filter(p => new Date(p.createdAt) < quarterStart);
      const starting = prevPayments.reduce((s, p) => s + p.amount, 0);

      // Previous quarter
      const prevWonDeals = prevDeals.filter(d => d.status === 'won' || d.status === 'accepted');
      const prevNewBusiness = prevWonDeals.reduce((s, d) => s + (d.finalPrice ?? d.proposedPrice ?? 0), 0);
      const prevExpansion = prevWonDeals.filter(d => (d.finalPrice ?? 0) > (d.proposedPrice ?? 0))
        .reduce((s, d) => s + ((d.finalPrice ?? 0) - (d.proposedPrice ?? 0)), 0);
      const prevChurn = prevDeals.filter(d => d.status === 'lost' || d.status === 'rejected')
        .reduce((s, d) => s + (d.proposedPrice ?? 0), 0);
      const prevContraction = 0;
      const prevStarting = starting; // Use actual starting value for previous period

      const net = starting + newBusiness + expansion - contraction - churn;

      const quarterName = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;

      // Composition data
      const totalRevenue = starting + newBusiness + expansion;
      const compositionData = [
        { name: 'New Business', value: newBusiness, fill: '#10b981' },
        { name: 'Expansion', value: expansion, fill: '#06b6d4' },
      ].filter(c => c.value > 0);

      return NextResponse.json({
        data: {
          quarterly: {
            period: quarterName,
            starting,
            newBusiness,
            expansion,
            contraction: -contraction,
            churn: -churn,
            net,
            prevStarting,
            prevNewBusiness,
            prevExpansion,
            prevContraction: -prevContraction,
            prevChurn: -prevChurn,
          },
          compositionData,
        },
      });
    } catch (error) {
      console.error('[API] Revenue waterfall error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch revenue waterfall' }, { status: 500 });
    }
  });
}
