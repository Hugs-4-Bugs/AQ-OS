import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      const leads = await db.lead.findMany({
        where: { userId, isActive: true },
        select: { stage: true, lastContactedAt: true, createdAt: true, businessName: true, niche: true },
      });

      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: { status: true, proposedPrice: true, finalPrice: true, createdAt: true, lead: { select: { businessName: true, niche: true, stage: true } } },
      });

      const now = new Date();

      // Retention score based on lead health
      const activeLeads = leads.filter(l => l.stage !== 'lost').length;
      const lostLeads = leads.filter(l => l.stage === 'lost').length;
      const totalLeads = leads.length;
      const retentionScore = totalLeads > 0 ? Math.round(((totalLeads - lostLeads) / totalLeads) * 100) : 100;

      // Churn trend (last 12 months)
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const churnTrendData: Array<{ month: string; rate: number }> = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const leadsInMonth = leads.filter(l => {
          const created = new Date(l.createdAt);
          return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear();
        });
        const lostInMonth = leadsInMonth.filter(l => l.stage === 'lost').length;
        const rate = leadsInMonth.length > 0 ? Math.round((lostInMonth / leadsInMonth.length) * 100 * 10) / 10 : 0;
        churnTrendData.push({ month: monthNames[d.getMonth()], rate });
      }

      // At-risk accounts: leads with no recent contact
      const atRiskAccounts = leads
        .filter(l => {
          if (l.stage === 'won' || l.stage === 'lost') return false;
          const lastContact = l.lastContactedAt ? new Date(l.lastContactedAt) : null;
          const daysSinceContact = lastContact ? Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24)) : 999;
          return daysSinceContact > 14;
        })
        .slice(0, 5)
        .map(l => {
          const lastContact = l.lastContactedAt ? new Date(l.lastContactedAt) : null;
          const daysSinceContact = lastContact ? Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24)) : 999;
          const riskLevel = daysSinceContact > 60 ? 'High' : daysSinceContact > 30 ? 'Medium' : 'Low';
          const factors: string[] = [];
          if (daysSinceContact > 30) factors.push(`No contact for ${daysSinceContact} days`);
          if (l.stage === 'discovered') factors.push('Still in discovery stage');
          if (l.stage === 'contacted') factors.push('Stalled after initial contact');
          if (factors.length === 0) factors.push(`Reduced engagement detected`);

          return {
            id: l.businessName,
            name: l.businessName,
            industry: l.niche || 'Unknown',
            value: 0,
            riskLevel: riskLevel as 'High' | 'Medium' | 'Low',
            factors,
          };
        });

      // Proactive actions
      const proactiveActions = atRiskAccounts.slice(0, 3).map((a, i) => ({
        id: `pa${i + 1}`,
        text: `Reach out to ${a.name} — ${a.riskLevel} risk detected`,
        priority: a.riskLevel === 'High' ? 'Critical' : a.riskLevel === 'Medium' ? 'High' : 'Medium',
        type: 'Schedule Call' as const,
      }));

      // Retention metrics
      const wonDeals = deals.filter(d => d.status === 'won' || d.status === 'accepted');
      const avgDealValue = wonDeals.length > 0
        ? wonDeals.reduce((s, d) => s + (d.finalPrice ?? d.proposedPrice ?? 0), 0) / wonDeals.length
        : 0;

      return NextResponse.json({
        data: {
          retentionScore,
          churnTrendData,
          atRiskAccounts,
          proactiveActions,
          retentionMetrics: [
            { label: 'NPS Score', value: '-', trend: null, trendUp: null },
            { label: 'Avg Contract', value: avgDealValue > 0 ? `$${(avgDealValue / 1000).toFixed(1)}k` : '-', trend: null, trendUp: null },
            { label: 'Expansion Rev', value: '-', trend: null, trendUp: null },
          ],
        },
      });
    } catch (error) {
      console.error('[API] Churn risk error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch churn risk' }, { status: 500 });
    }
  });
}
