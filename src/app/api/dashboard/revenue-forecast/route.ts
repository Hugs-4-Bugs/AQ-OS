import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Get deals for the user's leads, grouped by month
      const deals = await db.deal.findMany({
        where: {
          lead: { userId: user.id },
        },
        include: {
          lead: { select: { businessName: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (deals.length === 0) {
        return NextResponse.json({
          data: [],
          summary: {
            totalForecast: 0,
            growthRate: '0',
            bestMonth: '-',
          },
        });
      }

      // Group deal values by month for the last 6 months + next 3 months projection
      const now = new Date();
      const months: Array<{
        month: string;
        projected: number;
        actual: number | null;
        upperBound: number;
        lowerBound: number;
        target: number;
      }> = [];

      for (let i = -3; i < 6; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthLabel = date.toLocaleDateString('en-US', { month: 'short' });
        const isPast = i < 0;
        const isCurrent = i === 0;

        // Calculate actual revenue for past months from closed deals
        const monthDeals = deals.filter((d) => {
          const dealDate = new Date(d.createdAt);
          return dealDate.getMonth() === date.getMonth() && dealDate.getFullYear() === date.getFullYear();
        });

        const actualRevenue = monthDeals
          .filter((d) => d.status === 'won' || d.status === 'closed')
          .reduce((sum, d) => sum + (d.finalPrice || d.proposedPrice || 0), 0);

        const pipelineValue = monthDeals
          .filter((d) => d.status !== 'won' && d.status !== 'closed' && d.status !== 'lost')
          .reduce((sum, d) => sum + (d.proposedPrice || 0), 0);

        const projected = isPast ? actualRevenue : actualRevenue + pipelineValue * 0.3;

        // Calculate confidence bounds
        const avgDealValue = deals.length > 0
          ? deals.reduce((s, d) => s + (d.finalPrice || d.proposedPrice || 0), 0) / deals.length
          : 0;
        const upperBound = projected + avgDealValue * 2;
        const lowerBound = Math.max(0, projected - avgDealValue);

        // Target: 10% growth over previous
        const prevMonth = months.length > 0 ? months[months.length - 1] : null;
        const target = prevMonth ? Math.round(prevMonth.target * 1.1) : Math.round(projected * 1.1) || 10000;

        months.push({
          month: monthLabel,
          projected: Math.round(projected),
          actual: isPast || isCurrent ? Math.round(actualRevenue) : null,
          upperBound: Math.round(upperBound),
          lowerBound: Math.round(lowerBound),
          target,
        });
      }

      // Summary stats
      const totalForecast = months.reduce((s, m) => s + m.projected, 0);
      const actuals = months.filter((m) => m.actual !== null);
      const lastActual = actuals[actuals.length - 1];
      const prevActual = actuals[actuals.length - 2];
      const growthRate = prevActual && lastActual && prevActual.actual
        ? (((lastActual.actual! - prevActual.actual!) / prevActual.actual!) * 100).toFixed(1)
        : '0';
      const bestMonth = months.reduce((best, m) => (m.actual ?? m.projected) > (best.actual ?? best.projected) ? m : best, months[0]);

      return NextResponse.json({
        data: months,
        summary: {
          totalForecast,
          growthRate,
          bestMonth: bestMonth.month,
        },
      });
    } catch (error) {
      console.error('[API] Error fetching revenue forecast:', error);
      return NextResponse.json({ data: [], summary: { totalForecast: 0, growthRate: '0', bestMonth: '-' }, error: 'Failed to fetch revenue forecast' }, { status: 500 });
    }
  });
}
