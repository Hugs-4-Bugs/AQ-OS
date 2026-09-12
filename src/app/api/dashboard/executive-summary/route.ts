import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      // Get leads count and stage distribution
      const leads = await db.lead.findMany({
        where: { userId, isActive: true, deletedAt: null },
        select: { stage: true, replyScore: true, conversionScore: true, urgencyScore: true, revenuePotentialScore: true, createdAt: true },
      });

      // Get deals
      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: { status: true, proposedPrice: true, finalPrice: true, createdAt: true },
      });

      // Calculate total pipeline value
      const pipelineValue = deals
        .filter(d => !['won', 'lost', 'closed_lost'].includes(d.status))
        .reduce((sum, d) => sum + (d.proposedPrice || d.finalPrice || 0), 0);

      // Active deals count
      const activeDeals = deals.filter(d => !['won', 'lost', 'closed_lost', 'draft'].includes(d.status)).length;

      // Won deals for revenue
      const wonDeals = deals.filter(d => d.status === 'won' || d.status === 'closed_won');
      const currentRevenue = wonDeals.reduce((sum, d) => sum + (d.finalPrice || d.proposedPrice || 0), 0);

      // Stage distribution from leads
      const stageMap = new Map<string, number>();
      leads.forEach(l => {
        const stage = l.stage || 'discovered';
        stageMap.set(stage, (stageMap.get(stage) || 0) + 1);
      });

      const stageColors: Record<string, string> = {
        discovered: '#06b6d4',
        contacted: '#8b5cf6',
        qualified: '#a855f7',
        proposal: '#ec4899',
        negotiation: '#f59e0b',
        won: '#10b981',
        lost: '#ef4444',
      };

      const stageDistribution = Array.from(stageMap.entries()).map(([stage, count]) => ({
        stage: stage.charAt(0).toUpperCase() + stage.slice(1),
        count,
        color: stageColors[stage] || '#6b7280',
      }));

      // Calculate health scores
      const avgReplyScore = leads.length > 0 ? leads.reduce((s, l) => s + (l.replyScore || 0), 0) / leads.length : 0;
      const avgConversionScore = leads.length > 0 ? leads.reduce((s, l) => s + (l.conversionScore || 0), 0) / leads.length : 0;
      const avgUrgencyScore = leads.length > 0 ? leads.reduce((s, l) => s + (l.urgencyScore || 0), 0) / leads.length : 0;

      const pipelineHealthScore = Math.round((avgReplyScore + avgConversionScore) / 2);
      const revenueGrowthScore = Math.round(avgUrgencyScore);

      // Avg deal size
      const avgDealSize = activeDeals > 0 ? pipelineValue / activeDeals : 0;

      // Revenue trend (last 6 months from deals)
      const now = new Date();
      const revenueTrend: { month: string; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const monthName = monthDate.toLocaleString('en', { month: 'short' });
        const monthRevenue = wonDeals
          .filter(d => {
            const dDate = new Date(d.createdAt);
            return dDate >= monthDate && dDate <= monthEnd;
          })
          .reduce((sum, d) => sum + (d.finalPrice || d.proposedPrice || 0), 0);
        revenueTrend.push({ month: monthName, revenue: monthRevenue });
      }

      // Risks
      const risks: { id: string; message: string; severity: 'High' | 'Medium' | 'Low' }[] = [];
      const stalledDeals = deals.filter(d => ['proposal', 'negotiation'].includes(d.status));
      if (stalledDeals.length > 3) {
        risks.push({ id: 'r1', message: `${stalledDeals.length} deals in advanced stages need attention`, severity: 'High' });
      }
      if (avgConversionScore < 30 && leads.length > 0) {
        risks.push({ id: 'r2', message: 'Lead conversion rate is below target', severity: 'Medium' });
      }
      if (leads.length === 0) {
        risks.push({ id: 'r3', message: 'No leads in pipeline — consider running discovery', severity: 'Low' });
      }

      // Milestones from follow-up reminders
      const reminders = await db.followUpReminder.findMany({
        where: { completed: false, lead: { userId } },
        select: { id: true, message: true, dueAt: true },
        orderBy: { dueAt: 'asc' },
        take: 4,
      });

      const milestones = reminders.map(r => ({
        id: r.id,
        title: r.message,
        date: new Date(r.dueAt).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        type: 'deal' as const,
      }));

      // Calculate portfolio score
      const portfolioScore = Math.round((pipelineHealthScore * 0.4 + revenueGrowthScore * 0.3 + (leads.length > 0 ? Math.min(avgConversionScore * 1.5, 100) : 0) * 0.3));

      const revenueTarget = 0; // No configured revenue target
      // YoY growth: compare won deals this year vs last year
      const thisYearStart = new Date(now.getFullYear(), 0, 1);
      const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
      const lastYearEnd = new Date(now.getFullYear(), 0, 0);
      const thisYearRevenue = wonDeals.filter(d => new Date(d.createdAt) >= thisYearStart).reduce((s, d) => s + (d.finalPrice || d.proposedPrice || 0), 0);
      const lastYearRevenue = wonDeals.filter(d => { const dc = new Date(d.createdAt); return dc >= lastYearStart && dc <= lastYearEnd; }).reduce((s, d) => s + (d.finalPrice || d.proposedPrice || 0), 0);
      const yoyGrowth = lastYearRevenue > 0 ? Math.round(((thisYearRevenue - lastYearRevenue) / lastYearRevenue) * 1000) / 10 : 0;

      const data = {
        portfolioScore,
        healthFactors: [
          { label: 'Pipeline Health', score: pipelineHealthScore, trend: pipelineHealthScore >= 70 ? 'up' as const : pipelineHealthScore >= 40 ? 'neutral' as const : 'down' as const },
          { label: 'Team Performance', score: 0, trend: 'neutral' as const },
          { label: 'Revenue Growth', score: revenueGrowthScore, trend: revenueGrowthScore >= 70 ? 'up' as const : 'down' as const },
        ],
        currentRevenue,
        revenueTarget,
        yoyGrowth,
        revenueTrend,
        activeDeals,
        pipelineValue,
        stageDistribution,
        avgDealSize,
        avgDaysToClose: 0,
        risks: risks.length > 0 ? risks : [
          { id: 'r1', message: 'No significant risks identified', severity: 'Low' as const },
        ],
        milestones,
      };

      return NextResponse.json({ data });
    } catch (error) {
      console.error('[API] Executive summary error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch executive summary' }, { status: 500 });
    }
  });
}
