import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const twoWeeksAgo = new Date(weekAgo);
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7);

      // Current week leads
      const currentLeads = await db.lead.count({
        where: {
          userId: user.id,
          createdAt: { gte: weekAgo },
          isActive: true,
        },
      });

      // Previous week leads
      const previousLeads = await db.lead.count({
        where: {
          userId: user.id,
          createdAt: { gte: twoWeeksAgo, lt: weekAgo },
          isActive: true,
        },
      });

      // Current week deals
      const currentDeals = await db.deal.count({
        where: {
          lead: { userId: user.id },
          createdAt: { gte: weekAgo },
          status: { in: ['won', 'closed_won'] },
        },
      });

      // Previous week deals
      const previousDeals = await db.deal.count({
        where: {
          lead: { userId: user.id },
          createdAt: { gte: twoWeeksAgo, lt: weekAgo },
          status: { in: ['won', 'closed_won'] },
        },
      });

      // Current week revenue
      const currentDealsData = await db.deal.findMany({
        where: {
          lead: { userId: user.id },
          createdAt: { gte: weekAgo },
          status: { in: ['won', 'closed_won'] },
        },
        select: { finalPrice: true, proposedPrice: true },
      });

      const currentRevenue = currentDealsData.reduce(
        (sum, d) => sum + (d.finalPrice ?? d.proposedPrice ?? 0),
        0
      );

      // Previous week revenue
      const previousDealsData = await db.deal.findMany({
        where: {
          lead: { userId: user.id },
          createdAt: { gte: twoWeeksAgo, lt: weekAgo },
          status: { in: ['won', 'closed_won'] },
        },
        select: { finalPrice: true, proposedPrice: true },
      });

      const previousRevenue = previousDealsData.reduce(
        (sum, d) => sum + (d.finalPrice ?? d.proposedPrice ?? 0),
        0
      );

      // Calculate percentage changes
      const leadsChange = previousLeads > 0
        ? Math.round(((currentLeads - previousLeads) / previousLeads) * 1000) / 10
        : currentLeads > 0 ? 100 : 0;

      const dealsChange = previousDeals > 0
        ? Math.round(((currentDeals - previousDeals) / previousDeals) * 1000) / 10
        : currentDeals > 0 ? 100 : 0;

      const revenueChange = previousRevenue > 0
        ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 1000) / 10
        : currentRevenue > 0 ? 100 : 0;

      // Average deal size
      const avgDealSize = currentDeals > 0
        ? Math.round(currentRevenue / currentDeals)
        : 0;

      const prevAvgDealSize = previousDeals > 0
        ? Math.round(previousRevenue / previousDeals)
        : 0;

      const avgDealChange = prevAvgDealSize > 0
        ? Math.round(((avgDealSize - prevAvgDealSize) / prevAvgDealSize) * 1000) / 10
        : avgDealSize > 0 ? 100 : 0;

      // Format week range strings
      const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const weekRange = `${formatDate(weekAgo)} – ${formatDate(now)}, ${now.getFullYear()}`;
      const previousWeekRange = `${formatDate(twoWeeksAgo)} – ${formatDate(weekAgo)}, ${now.getFullYear()}`;

      const data = {
        weekRange,
        previousWeekRange,
        kpis: [
          { label: 'New Leads', value: currentLeads, change: leadsChange, format: 'number' as const },
          { label: 'Deals Won', value: currentDeals, change: dealsChange, format: 'number' as const },
          { label: 'Revenue', value: currentRevenue, change: revenueChange, format: 'currency' as const },
          { label: 'Avg Deal Size', value: avgDealSize, change: avgDealChange, format: 'currency' as const },
        ],
        activityBreakdown: [],
        topPerformers: [],
        highlights: [],
        goalProgress: 0,
        goalTarget: '$0',
        goalLabel: 'Weekly Revenue Target',
      };

      return NextResponse.json({ data });
    } catch (error) {
      console.error('[API] Error fetching weekly digest:', error);
      return NextResponse.json(
        { data: null, error: 'Failed to fetch weekly digest' },
        { status: 500 }
      );
    }
  });
}
