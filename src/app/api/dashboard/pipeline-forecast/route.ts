import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      const leads = await db.lead.findMany({
        where: { userId, isActive: true },
        select: { stage: true, createdAt: true, replyScore: true, conversionScore: true, businessName: true },
      });

      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: {
          status: true, proposedPrice: true, finalPrice: true, createdAt: true,
          lead: { select: { businessName: true, stage: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const now = new Date();

      // Pipeline stages breakdown
      const stageCounts: Record<string, number> = {};
      for (const lead of leads) {
        stageCounts[lead.stage] = (stageCounts[lead.stage] ?? 0) + 1;
      }

      const wonDeals = deals.filter(d => d.status === 'won' || d.status === 'accepted');
      const avgDealSize = wonDeals.length > 0
        ? wonDeals.reduce((s, d) => s + (d.finalPrice ?? d.proposedPrice ?? 0), 0) / wonDeals.length
        : 0;

      // Compute conversion rates from actual deal stage transitions
      const totalDealsCount = deals.length || 1;
      const pendingProposedCount = deals.filter(d => d.status === 'pending' || d.status === 'proposed').length;
      const negotiationCount = deals.filter(d => d.status === 'negotiation').length;

      // Calculate avg days in stage from deal timestamps
      const pendingDeals = deals.filter(d => d.status === 'pending' || d.status === 'proposed');
      const avgDaysPending = pendingDeals.length > 0
        ? Math.round(pendingDeals.reduce((s, d) => {
            const diff = now.getTime() - new Date(d.createdAt).getTime();
            return s + Math.max(0, diff / (1000 * 60 * 60 * 24));
          }, 0) / pendingDeals.length)
        : 0;

      const stages = [
        { id: 's1', name: 'Discovery', dealCount: stageCounts['discovered'] ?? 0, totalValue: `$${((stageCounts['discovered'] ?? 0) * avgDealSize / 1000).toFixed(1)}M`, weightedValue: `$${((stageCounts['discovered'] ?? 0) * avgDealSize * 0.2 / 1000).toFixed(0)}K`, conversionRate: totalDealsCount > 0 ? Math.round(((deals.filter(d => d.status === 'contacted').length + wonDeals.length) / totalDealsCount) * 100) : 0, avgDays: 0, color: '#64748b' },
        { id: 's2', name: 'Qualification', dealCount: stageCounts['contacted'] ?? 0, totalValue: `$${((stageCounts['contacted'] ?? 0) * avgDealSize / 1000).toFixed(1)}M`, weightedValue: `$${((stageCounts['contacted'] ?? 0) * avgDealSize * 0.3 / 1000).toFixed(0)}K`, conversionRate: totalDealsCount > 0 ? Math.round(((deals.filter(d => d.status === 'discussion').length + negotiationCount + pendingProposedCount + wonDeals.length) / (deals.filter(d => d.status === 'contacted').length || 1)) * 100) : 0, avgDays: 0, color: '#06b6d4' },
        { id: 's3', name: 'Proposal', dealCount: stageCounts['discussion'] ?? 0, totalValue: `$${((stageCounts['discussion'] ?? 0) * avgDealSize / 1000).toFixed(1)}M`, weightedValue: `$${((stageCounts['discussion'] ?? 0) * avgDealSize * 0.5 / 1000).toFixed(0)}K`, conversionRate: (stageCounts['discussion'] ?? 0) > 0 ? Math.round((negotiationCount / (stageCounts['discussion'] || 1)) * 100) : 0, avgDays: 0, color: '#3b82f6' },
        { id: 's4', name: 'Negotiation', dealCount: stageCounts['negotiation'] ?? 0, totalValue: `$${((stageCounts['negotiation'] ?? 0) * avgDealSize / 1000).toFixed(1)}M`, weightedValue: `$${((stageCounts['negotiation'] ?? 0) * avgDealSize * 0.6 / 1000).toFixed(0)}K`, conversionRate: negotiationCount > 0 ? Math.round((pendingProposedCount / negotiationCount) * 100) : 0, avgDays: 0, color: '#f59e0b' },
        { id: 's5', name: 'Closing', dealCount: pendingProposedCount, totalValue: `$${(deals.filter(d => d.status === 'pending' || d.status === 'proposed').reduce((s, d) => s + (d.proposedPrice ?? 0), 0) / 1000).toFixed(1)}M`, weightedValue: `$${(deals.filter(d => d.status === 'pending' || d.status === 'proposed').reduce((s, d) => s + (d.proposedPrice ?? 0), 0) * 0.72 / 1000).toFixed(0)}K`, conversionRate: pendingProposedCount > 0 ? Math.round((wonDeals.length / pendingProposedCount) * 100) : 0, avgDays: avgDaysPending, color: '#a855f7' },
        { id: 's6', name: 'Won', dealCount: wonDeals.length, totalValue: `$${(wonDeals.reduce((s, d) => s + (d.finalPrice ?? d.proposedPrice ?? 0), 0) / 1000).toFixed(0)}K`, weightedValue: `$${(wonDeals.reduce((s, d) => s + (d.finalPrice ?? d.proposedPrice ?? 0), 0) / 1000).toFixed(0)}K`, conversionRate: 100, avgDays: 0, color: '#10b981' },
      ];

      // Forecast summary
      const totalWeighted = stages.reduce((s, st) => {
        const val = parseFloat(st.weightedValue.replace(/[$MK]/g, '')) * (st.weightedValue.includes('M') ? 1000000 : 1000);
        return s + val;
      }, 0);

      const predictedRevenue = `$${(totalWeighted / 1000000).toFixed(1)}M`;
      const confidence = Math.min(50 + leads.length * 2, 92);

      // Confidence interval data (6 months)
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const confidenceData: Array<{ month: string; optimistic: number; realistic: number; pessimistic: number }> = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const base = totalWeighted / 6 / 1000;
        const growth = i * 0.15;
        confidenceData.push({
          month: monthNames[d.getMonth()],
          optimistic: Math.round(base * (1 + growth) * 1.2),
          realistic: Math.round(base * (1 + growth)),
          pessimistic: Math.round(base * (1 + growth) * 0.7),
        });
      }

      // Movement data (8 weeks)
      const movementData: Array<{ week: string; added: number; lost: number }> = [];
      for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
        const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
        const added = leads.filter(l => {
          const created = new Date(l.createdAt);
          return created >= weekStart && created < weekEnd;
        }).length;
        const lost = deals.filter(d => {
          const created = new Date(d.createdAt);
          return created >= weekStart && created < weekEnd && (d.status === 'lost' || d.status === 'rejected');
        }).length;
        movementData.push({ week: `W${8 - i}`, added, lost });
      }

      // At-risk deals: deals pending/proposed with no recent activity
      const atRiskDeals = deals
        .filter(d => {
          if (d.status !== 'pending' && d.status !== 'proposed') return false;
          const daysSince = Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          return daysSince > 14;
        })
        .slice(0, 5)
        .map((d, i) => {
          const daysSince = Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: `r${i + 1}`,
            name: d.lead.businessName + ' Deal',
            company: d.lead.businessName,
            value: `$${((d.proposedPrice ?? 0) / 1000).toFixed(0)}K`,
            riskFactor: `No activity for ${daysSince} days`,
            probabilityDrop: Math.min(Math.round(daysSince * 0.8), 80),
            severity: (daysSince > 30 ? 'high' : 'medium') as 'high' | 'medium' | 'low',
          };
        });

      return NextResponse.json({
        data: {
          forecastSummary: {
            predictedRevenue,
            confidence,
            period: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
          },
          confidenceData,
          pipelineStages: stages,
          movementData,
          atRiskDeals,
        },
      });
    } catch (error) {
      console.error('[API] Pipeline forecast error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch pipeline forecast' }, { status: 500 });
    }
  });
}
