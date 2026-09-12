import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      const leads = await db.lead.findMany({
        where: { userId, isActive: true },
        select: { stage: true, createdAt: true, businessName: true, niche: true },
      });

      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: { proposedPrice: true, finalPrice: true, status: true, createdAt: true, lead: { select: { businessName: true, niche: true } } },
        orderBy: { createdAt: 'desc' },
      });

      // KPIs
      const newAccounts = leads.filter(l => {
        const d = new Date(l.createdAt);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;

      const expandedAccounts = deals.filter(d => d.status === 'accepted' || d.status === 'won').length;
      const contractExtensions = deals.filter(d => d.status === 'accepted').length;
      const upgrades = deals.filter(d => (d.finalPrice ?? 0) > (d.proposedPrice ?? 0)).length;

      // Growth trend (monthly)
      const now = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const growthTrend: Array<{ month: string; newAccounts: number; expanded: number }> = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const leadsInMonth = leads.filter(l => {
          const created = new Date(l.createdAt);
          return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear();
        });
        const dealsInMonth = deals.filter(d2 => {
          const created = new Date(d2.createdAt);
          return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear();
        });
        growthTrend.push({
          month: monthNames[d.getMonth()],
          newAccounts: leadsInMonth.length,
          expanded: dealsInMonth.filter(d2 => d2.status === 'accepted' || d2.status === 'won').length,
        });
      }

      // Top growing accounts from deals
      const topAccounts = deals
        .filter(d => d.status === 'accepted' || d.status === 'won')
        .slice(0, 5)
        .map((d, i) => ({
          name: d.lead.businessName,
          industry: d.lead.niche || 'Unknown',
          original: d.proposedPrice ?? 0,
          current: d.finalPrice ?? d.proposedPrice ?? 0,
          growth: d.proposedPrice ? Math.round(((d.finalPrice ?? d.proposedPrice) / d.proposedPrice - 1) * 100) : 0,
          spark: [d.proposedPrice ?? 0, d.finalPrice ?? d.proposedPrice ?? 0],
          type: (d.finalPrice ?? 0) > (d.proposedPrice ?? 0) ? 'Upsell' : 'Cross-sell',
        }));

      // Health distribution from lead stages
      const stageCounts: Record<string, number> = {};
      for (const lead of leads) {
        stageCounts[lead.stage] = (stageCounts[lead.stage] ?? 0) + 1;
      }

      const healthDistribution = [
        { name: 'Growing', value: (stageCounts['won'] ?? 0) || 0, color: '#10b981' },
        { name: 'Stable', value: ((stageCounts['discussion'] ?? 0) + (stageCounts['negotiation'] ?? 0)) || 0, color: '#3b82f6' },
        { name: 'At Risk', value: (stageCounts['contacted'] ?? 0) || 0, color: '#f59e0b' },
        { name: 'Churned', value: (stageCounts['lost'] ?? 0) || 0, color: '#ef4444' },
      ];

      // Expansion pipeline
      const expansionPipeline = deals
        .filter(d => d.status === 'pending' || d.status === 'proposed')
        .slice(0, 4)
        .map(d => ({
          name: d.lead.businessName,
          value: d.proposedPrice ?? 0,
          probability: 0,
          closeDate: null,
          stage: 0,
        }));

      return NextResponse.json({
        data: {
          kpis: [
            { label: 'New Accounts', value: newAccounts, trend: null, up: null, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Expanded Accounts', value: expandedAccounts, trend: null, up: null, color: 'text-sky-500', bg: 'bg-sky-500/10' },
            { label: 'Contract Extensions', value: contractExtensions, trend: null, up: null, color: 'text-violet-500', bg: 'bg-violet-500/10' },
            { label: 'Upgrades', value: upgrades, trend: null, up: null, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          ],
          growthTrend,
          topAccounts,
          healthDistribution,
          expansionPipeline,
        },
      });
    } catch (error) {
      console.error('[API] Account growth error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch account growth' }, { status: 500 });
    }
  });
}
