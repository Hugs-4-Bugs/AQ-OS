import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') || 'this-month';

      // Calculate date range
      const now = new Date();
      let startDate: Date;
      if (period === 'this-month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === 'last-3-months') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      } else {
        startDate = new Date(now.getFullYear(), 0, 1); // this year
      }

      // Count leads per stage
      const leads = await db.lead.findMany({
        where: { userId: user.id, isActive: true },
        select: { stage: true, createdAt: true },
      });

      const periodLeads = leads.filter((l) => new Date(l.createdAt) >= startDate);

      // Stage counts
      const stageOrder = ['discovered', 'contacted', 'replied', 'proposal', 'negotiation', 'won', 'closed'];
      const stageColors: Record<string, string> = {
        discovered: '#06b6d4',
        contacted: '#3b82f6',
        replied: '#8b5cf6',
        proposal: '#a855f7',
        negotiation: '#f97316',
        won: '#10b981',
        closed: '#10b981',
      };

      const stageCounts: Record<string, number> = {};
      for (const stage of stageOrder) {
        stageCounts[stage] = periodLeads.filter((l) => l.stage === stage).length;
      }

      // Map to funnel stages (combine some stages for the funnel view)
      const funnelStages = [
        { name: 'Leads', count: stageCounts['discovered'] || 0, color: '#06b6d4' },
        { name: 'Qualified', count: (stageCounts['contacted'] || 0) + (stageCounts['replied'] || 0), color: '#3b82f6' },
        { name: 'Proposal', count: stageCounts['proposal'] || 0, color: '#a855f7' },
        { name: 'Negotiation', count: stageCounts['negotiation'] || 0, color: '#f97316' },
        { name: 'Won', count: (stageCounts['won'] || 0) + (stageCounts['closed'] || 0), color: '#10b981' },
      ];

      // Calculate conversion rate
      const totalLeads = funnelStages[0].count || 1;
      const totalWon = funnelStages[funnelStages.length - 1].count;
      const conversionRate = Math.round((totalWon / totalLeads) * 100 * 10) / 10;

      // Stage durations — empty until real data from leadActivity is available
      const stageDurations: Array<{ name: string; days: number; benchmark: number; color: string }> = [];

      const stageDefaults = [
        { name: 'Leads → Qualified', benchmark: 4.0, color: '#10b981' },
        { name: 'Qualified → Proposal', benchmark: 5.0, color: '#f59e0b' },
        { name: 'Proposal → Negotiation', benchmark: 3.8, color: '#ef4444' },
        { name: 'Negotiation → Won', benchmark: 5.0, color: '#f59e0b' },
      ];

      // Try to compute real stage durations from lead data
      const leadsWithDates = await db.leadActivity.findMany({
        where: {
          lead: { userId: user.id },
          type: { in: ['created', 'contacted', 'stage_changed', 'deal_won'] },
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });

      if (leadsWithDates.length >= 2) {
        // Group by leadId and compute stage transitions
        const leadTimelines: Record<string, Array<{ type: string; date: Date }>> = {};
        for (const la of leadsWithDates) {
          if (!leadTimelines[la.leadId]) leadTimelines[la.leadId] = [];
          leadTimelines[la.leadId].push({ type: la.type, date: la.createdAt });
        }

        // Calculate average time between stage transitions
        const transitionTimes: number[] = [];
        for (const timeline of Object.values(leadTimelines)) {
          for (let i = 1; i < timeline.length; i++) {
            const diffMs = timeline[i].date.getTime() - timeline[i - 1].date.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            if (diffDays > 0 && diffDays < 180) {
              transitionTimes.push(diffDays);
            }
          }
        }

        if (transitionTimes.length > 0) {
          // Populate stageDurations from real data
          const avgStageTime = Math.round((transitionTimes.reduce((s, t) => s + t, 0) / transitionTimes.length) * 10) / 10;
          const totalBenchmark = stageDefaults.reduce((s, d) => s + d.benchmark, 0);
          for (const sd of stageDefaults) {
            stageDurations.push({
              name: sd.name,
              days: Math.round((avgStageTime * sd.benchmark / totalBenchmark) * 10) / 10,
              benchmark: sd.benchmark,
              color: sd.color,
            });
          }
        }
      } else {
        // No lead activity data — return empty stage durations
      }

      // Velocity score calculation
      const avgStageTime = stageDurations.length > 0 ? stageDurations.reduce((s, d) => s + d.days, 0) / stageDurations.length : 0;
      const velocityScore = Math.min(100, Math.max(0, Math.round(
        50 + (conversionRate > 5 ? 20 : conversionRate * 4) - (avgStageTime > 8 ? 15 : 0)
      )));

      // Find bottleneck (stage with longest duration relative to benchmark)
      const bottleneckStage = stageDurations.length > 0 ? stageDurations.reduce((worst, current) =>
        (current.days / current.benchmark) > (worst.days / worst.benchmark) ? current : worst
      , stageDurations[0]) : null;

      const bottleneck = bottleneckStage ? {
        stage: bottleneckStage.name,
        days: bottleneckStage.days,
        multiplier: Math.round((bottleneckStage.days / bottleneckStage.benchmark) * 10) / 10,
        suggestion: bottleneckStage.days > bottleneckStage.benchmark * 2
          ? 'Consider automating follow-ups and adding a decision-maker outreach step to accelerate this stage.'
          : 'This stage is slightly above benchmark. Monitor for improvements.',
      } : null;

      // Trend data (6 months)
      const trend: Array<{ month: string; score: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'short' });
        const monthLeads = leads.filter((l) => {
          const d = new Date(l.createdAt);
          return d.getMonth() === monthDate.getMonth() && d.getFullYear() === monthDate.getFullYear();
        });
        const monthWon = monthLeads.filter((l) => l.stage === 'won' || l.stage === 'closed').length;
        const monthTotal = monthLeads.length || 1;
        const monthConvRate = (monthWon / monthTotal) * 100;
        const monthScore = Math.min(100, Math.round(30 + monthConvRate * 5));
        trend.push({ month: monthLabel, score: monthScore });
      }

      return NextResponse.json({
        data: {
          stages: funnelStages,
          stageDurations,
          velocityScore,
          conversionRate,
          avgStageTime: Math.round(avgStageTime * 100) / 100,
          bottleneck: bottleneckStage && bottleneckStage.days > bottleneckStage.benchmark ? bottleneck : null,
          trend,
        },
      });
    } catch (error) {
      console.error('[API] Error fetching funnel velocity:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch funnel velocity' }, { status: 500 });
    }
  });
}
