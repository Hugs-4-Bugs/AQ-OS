import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      // Get all leads with their stage info
      const leads = await db.lead.findMany({
        where: { userId, isActive: true, deletedAt: null },
        select: {
          id: true,
          stage: true,
          replyScore: true,
          conversionScore: true,
          urgencyScore: true,
          revenuePotentialScore: true,
          lastContactedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get all deals
      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: {
          id: true,
          status: true,
          proposedPrice: true,
          finalPrice: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Build pipeline stages from lead stages
      const stageOrder = ['discovered', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
      const stageHealthMap: Record<string, { activeDeals: number; totalValue: number; avgDays: number; lastActivity: string; health: 'healthy' | 'slow' | 'stalled' }> = {};

      // Initialize all stages
      stageOrder.forEach(stage => {
        stageHealthMap[stage] = { activeDeals: 0, totalValue: 0, avgDays: 0, lastActivity: 'No activity', health: 'healthy' };
      });

      // Populate from leads
      leads.forEach(lead => {
        const stage = lead.stage || 'discovered';
        if (stageHealthMap[stage]) {
          stageHealthMap[stage].activeDeals++;
          const daysSinceCreated = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          stageHealthMap[stage].avgDays = Math.round((stageHealthMap[stage].avgDays + daysSinceCreated) / 2);
          if (lead.lastContactedAt) {
            const relTime = getRelativeTime(lead.lastContactedAt);
            stageHealthMap[stage].lastActivity = relTime;
          }
        }
      });

      // Add deal values
      deals.forEach(deal => {
        const stage = deal.status || 'draft';
        const value = deal.finalPrice || deal.proposedPrice || 0;
        if (stageHealthMap[stage]) {
          stageHealthMap[stage].totalValue += value;
        }
      });

      // Determine health for each stage
      const benchmarks: Record<string, number> = {
        discovered: 5, contacted: 7, qualified: 5, proposal: 7, negotiation: 10, won: 0, lost: 0,
      };

      Object.keys(stageHealthMap).forEach(stage => {
        const s = stageHealthMap[stage];
        const benchmark = benchmarks[stage] || 7;
        if (benchmark > 0 && s.avgDays > benchmark * 1.5) {
          s.health = 'stalled';
        } else if (benchmark > 0 && s.avgDays > benchmark) {
          s.health = 'slow';
        } else {
          s.health = 'healthy';
        }
      });

      // Build real sparkline data from lead stage transition timestamps (weekly buckets)
      const now2 = new Date();
      const sparklines: Record<string, number[]> = { FlowRate: [], Velocity: [], Conversion: [], WinRate: [] };
      for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(now2); weekStart.setDate(weekStart.getDate() - i * 7);
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
        const weekLeads = leads.filter(l => { const c = new Date(l.createdAt); return c >= weekStart && c < weekEnd; });
        const weekDeals = deals.filter(d => { const c = new Date(d.createdAt); return c >= weekStart && c < weekEnd; });
        const weekWon = weekDeals.filter(d => d.status === 'won').length;
        sparklines.FlowRate.push(weekLeads.length);
        sparklines.Velocity.push(weekLeads.length > 0 ? Math.round(weekLeads.reduce((s, l) => s + (l.replyScore || 0), 0) / weekLeads.length * 1.2) : 0);
        sparklines.Conversion.push(weekLeads.length > 0 ? Math.round(weekLeads.reduce((s, l) => s + (l.conversionScore || 0), 0) / weekLeads.length * 1.5) : 0);
        sparklines.WinRate.push(weekDeals.length > 0 ? Math.round((weekWon / weekDeals.length) * 100) : 0);
      }

      // Build stages array (excluding won/lost for pipeline view)
      const pipelineStages = stageOrder
        .filter(s => !['won', 'lost'].includes(s))
        .map(stage => ({
          name: stage.charAt(0).toUpperCase() + stage.slice(1),
          activeDeals: stageHealthMap[stage].activeDeals,
          totalValue: stageHealthMap[stage].totalValue,
          avgDays: stageHealthMap[stage].avgDays,
          benchmark: benchmarks[stage] || 7,
          health: stageHealthMap[stage].health,
          lastActivity: stageHealthMap[stage].lastActivity,
        }));

      // Calculate health scores
      const totalLeads = leads.length;
      const activeLeads = leads.filter(l => !['won', 'lost'].includes(l.stage || '')).length;
      const flowRate = totalLeads > 0 ? Math.round((activeLeads / totalLeads) * 100) : 0;

      const avgReply = leads.length > 0 ? leads.reduce((s, l) => s + (l.replyScore || 0), 0) / leads.length : 0;
      const avgConversion = leads.length > 0 ? leads.reduce((s, l) => s + (l.conversionScore || 0), 0) / leads.length : 0;
      const velocityScore = Math.round(Math.min(100, avgReply * 1.2));
      const conversionScore = Math.round(Math.min(100, avgConversion * 1.5));

      const wonDeals = deals.filter(d => d.status === 'won').length;
      const totalDeals = deals.length;
      const winRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;

      // Overall status
      const overallStatus: 'Healthy' | 'Attention' | 'Critical' =
        flowRate >= 70 && winRate >= 25 ? 'Healthy' :
        flowRate >= 40 || winRate >= 15 ? 'Attention' : 'Critical';

      // Bottlenecks
      const bottlenecks = pipelineStages
        .filter(s => s.health === 'stalled' || s.health === 'slow')
        .map(s => ({
          id: `bn-${s.name}`,
          stage: s.name,
          deals: s.activeDeals,
          avgDays: s.avgDays,
          benchmark: s.benchmark,
          severity: s.health === 'stalled' ? 'high' as const : 'medium' as const,
          action: s.health === 'stalled'
            ? `Review ${s.activeDeals} deals stalled in ${s.name} — follow up urgently`
            : `Schedule follow-ups for ${s.activeDeals} leads in ${s.name} stage`,
        }));

      // Value trend (last 8 weeks)
      const now = new Date();
      const valueTrend: { week: string; value: number }[] = [];
      const totalPipelineValue = pipelineStages.reduce((s, st) => s + st.totalValue, 0);
      for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - i * 7);
        const weekLabel = `W${8 - i}`;
        const weekDeals = deals.filter(d => {
          const dDate = new Date(d.createdAt);
          return dDate >= weekStart;
        });
        const weekValue = weekDeals.reduce((s, d) => s + (d.finalPrice || d.proposedPrice || 0), 0);
        valueTrend.push({ week: weekLabel, value: weekValue });
      }

      const data = {
        overallStatus,
        healthCards: [
          {
            id: 'hc1', label: 'Flow Rate', score: flowRate, subtitle: 'Leads in vs out',
            trend: flowRate >= 70 ? 'up' as const : flowRate >= 40 ? 'flat' as const : 'down' as const,
            sparkline: sparklines.FlowRate,
          },
          {
            id: 'hc2', label: 'Velocity', score: velocityScore, subtitle: 'Avg days per stage',
            trend: velocityScore >= 70 ? 'up' as const : 'down' as const,
            sparkline: sparklines.Velocity,
          },
          {
            id: 'hc3', label: 'Conversion', score: conversionScore, subtitle: 'Stage-to-stage rate',
            trend: conversionScore >= 70 ? 'up' as const : 'flat' as const,
            sparkline: sparklines.Conversion,
          },
          {
            id: 'hc4', label: 'Win Rate', score: winRate, subtitle: 'Overall deal win %',
            trend: winRate >= 25 ? 'up' as const : 'down' as const,
            sparkline: sparklines.WinRate,
          },
        ],
        stages: pipelineStages,
        bottlenecks,
        valueTrend,
      };

      return NextResponse.json({ data });
    } catch (error) {
      console.error('[API] Pipeline health error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch pipeline health' }, { status: 500 });
    }
  });
}

function getRelativeTime(date: Date | string): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
