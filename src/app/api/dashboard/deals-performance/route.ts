import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      // Get all deals
      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: {
          id: true,
          status: true,
          proposedPrice: true,
          finalPrice: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Total pipeline value (non-won, non-lost deals)
      const pipelineDeals = deals.filter(d => !['won', 'closed_won', 'lost', 'closed_lost'].includes(d.status));
      const totalPipeline = pipelineDeals.reduce((sum, d) => sum + (d.proposedPrice || d.finalPrice || 0), 0);

      // Won deals
      const wonDeals = deals.filter(d => d.status === 'won' || d.status === 'closed_won');
      const wonCount = wonDeals.length;

      // Win rate
      const totalClosedDeals = wonDeals.length + deals.filter(d => d.status === 'lost' || d.status === 'closed_lost').length;
      const winRate = totalClosedDeals > 0 ? (wonCount / totalClosedDeals) * 100 : 0;

      // Average deal size
      const dealsWithValue = deals.filter(d => d.finalPrice || d.proposedPrice);
      const avgDealSize = dealsWithValue.length > 0
        ? dealsWithValue.reduce((sum, d) => sum + (d.finalPrice || d.proposedPrice || 0), 0) / dealsWithValue.length
        : 0;

      // Stage distribution
      const stageColors: Record<string, string> = {
        draft: 'bg-slate-400',
        proposed: 'bg-blue-400',
        negotiation: 'bg-amber-400',
        accepted: 'bg-emerald-400',
        won: 'bg-emerald-500',
        closed_won: 'bg-emerald-500',
        lost: 'bg-red-400',
        closed_lost: 'bg-red-400',
      };

      const stageMap = new Map<string, number>();
      deals.forEach(d => {
        const stage = d.status || 'draft';
        stageMap.set(stage, (stageMap.get(stage) || 0) + 1);
      });

      const pipelineStages = Array.from(stageMap.entries()).map(([stage, count]) => ({
        stage: stage.charAt(0).toUpperCase() + stage.slice(1).replace(/_/g, ' '),
        count,
        color: stageColors[stage] || 'bg-gray-400',
      }));

      // Compute period-over-period comparisons from deal timestamps
      const halfPeriod = Math.floor(deals.length / 2);
      const firstHalf = deals.slice(0, halfPeriod);
      const secondHalf = deals.slice(halfPeriod);

      const firstPipeline = firstHalf.filter(d => !['won', 'closed_won', 'lost', 'closed_lost'].includes(d.status)).reduce((s, d) => s + (d.proposedPrice || d.finalPrice || 0), 0);
      const secondPipeline = secondHalf.filter(d => !['won', 'closed_won', 'lost', 'closed_lost'].includes(d.status)).reduce((s, d) => s + (d.proposedPrice || d.finalPrice || 0), 0);
      const pipelineChange = firstPipeline > 0 ? Math.round(((secondPipeline - firstPipeline) / firstPipeline) * 1000) / 10 : 0;

      const firstWon = firstHalf.filter(d => d.status === 'won' || d.status === 'closed_won').length;
      const secondWon = secondHalf.filter(d => d.status === 'won' || d.status === 'closed_won').length;
      const wonChange = firstWon > 0 ? Math.round(((secondWon - firstWon) / firstWon) * 1000) / 10 : 0;

      const firstClosed = firstHalf.filter(d => ['won', 'closed_won', 'lost', 'closed_lost'].includes(d.status)).length;
      const secondClosed = secondHalf.filter(d => ['won', 'closed_won', 'lost', 'closed_lost'].includes(d.status)).length;
      const firstWinRate = firstClosed > 0 ? (firstWon / firstClosed) * 100 : 0;
      const secondWinRate = secondClosed > 0 ? (secondWon / secondClosed) * 100 : 0;
      const winRateChange = firstWinRate > 0 ? Math.round((secondWinRate - firstWinRate) * 10) / 10 : 0;

      const firstAvgSize = firstHalf.length > 0 ? firstHalf.reduce((s, d) => s + (d.finalPrice || d.proposedPrice || 0), 0) / firstHalf.length : 0;
      const secondAvgSize = secondHalf.length > 0 ? secondHalf.reduce((s, d) => s + (d.finalPrice || d.proposedPrice || 0), 0) / secondHalf.length : 0;
      const avgSizeChange = firstAvgSize > 0 ? Math.round(((secondAvgSize - firstAvgSize) / firstAvgSize) * 1000) / 10 : 0;

      const data = {
        totalPipeline,
        wonDeals: wonCount,
        winRate,
        avgDealSize,
        pipelineChange,
        wonChange,
        winRateChange,
        avgSizeChange,
        pipelineStages,
      };

      return NextResponse.json({ data });
    } catch (error) {
      console.error('[API] Deals performance error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch deals performance' }, { status: 500 });
    }
  });
}
