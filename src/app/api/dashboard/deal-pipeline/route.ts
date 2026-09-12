import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      const leads = await db.lead.findMany({
        where: { userId, isActive: true },
        select: { stage: true, createdAt: true },
      });

      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: { status: true, proposedPrice: true, finalPrice: true, createdAt: true },
      });

      // Stage counts
      const stageCounts: Record<string, number> = {};
      for (const lead of leads) {
        stageCounts[lead.stage] = (stageCounts[lead.stage] ?? 0) + 1;
      }

      // Avg deal size
      const closedDeals = deals.filter(d => d.status === 'accepted' || d.status === 'won');
      const avgDealSize = closedDeals.length > 0
        ? closedDeals.reduce((s, d) => s + (d.finalPrice ?? d.proposedPrice ?? 0), 0) / closedDeals.length
        : 0;

      // Win rate
      const wonCount = stageCounts['won'] ?? 0;
      const lostCount = stageCounts['lost'] ?? 0;
      const total = wonCount + lostCount;
      const winRate = total > 0 ? Math.round((wonCount / total) * 100) : 0;

      // Monthly trend (last 6 months)
      const now = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyTrend: Array<{ month: string; value: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = monthNames[d.getMonth()];
        const leadsInMonth = leads.filter(l => {
          const created = new Date(l.createdAt);
          return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear();
        });
        monthlyTrend.push({ month: monthStr, value: Math.round(leadsInMonth.length * avgDealSize) });
      }

      const stages = [
        { key: 'discovered', count: stageCounts['discovered'] ?? 0, value: (stageCounts['discovered'] ?? 0) * avgDealSize },
        { key: 'contacted', count: stageCounts['contacted'] ?? 0, value: (stageCounts['contacted'] ?? 0) * avgDealSize },
        { key: 'discussion', count: stageCounts['discussion'] ?? 0, value: (stageCounts['discussion'] ?? 0) * avgDealSize },
        { key: 'negotiation', count: stageCounts['negotiation'] ?? 0, value: (stageCounts['negotiation'] ?? 0) * avgDealSize },
        { key: 'won', count: wonCount, value: wonCount * avgDealSize },
        { key: 'lost', count: lostCount, value: lostCount * avgDealSize },
      ];

      const totalPipelineValue = stages.reduce((sum, s) => sum + s.value, 0);

      return NextResponse.json({
        data: {
          stages,
          winRate,
          avgDealSize: Math.round(avgDealSize),
          avgDealTrend: 0,
          timeToClose: { discovered: 5, contacted: 8, discussion: 12, negotiation: 7 },
          monthlyTrend,
          totalPipelineValue,
        },
      });
    } catch (error) {
      console.error('[API] Deal pipeline error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch pipeline data' }, { status: 500 });
    }
  });
}
