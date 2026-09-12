import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      const leads = await db.lead.findMany({
        where: { userId, isActive: true },
        select: { stage: true, createdAt: true, source: true, replyScore: true, conversionScore: true },
      });

      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        select: { status: true, proposedPrice: true, finalPrice: true, createdAt: true },
      });

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Benchmark metrics
      const monthlyLeads = leads.filter(l => new Date(l.createdAt) >= monthStart).length;
      const monthlyDeals = deals.filter(d => d.status === 'won' || d.status === 'accepted').length;
      const monthlyRevenue = deals
        .filter(d => d.status === 'won' || d.status === 'accepted')
        .reduce((s, d) => s + (d.finalPrice ?? d.proposedPrice ?? 0), 0);
      const conversionRate = leads.length > 0
        ? Math.round((leads.filter(l => l.stage === 'won').length / leads.length) * 100 * 10) / 10
        : 0;

      const benchmarkMetrics = [
        { label: 'Leads Generated', target: 0, actual: monthlyLeads, unit: '', color: 'from-blue-500 to-cyan-400' },
        { label: 'Deals Closed', target: 0, actual: monthlyDeals, unit: '', color: 'from-emerald-500 to-teal-400' },
        { label: 'Revenue', target: 0, actual: monthlyRevenue, unit: '$', color: 'from-violet-500 to-purple-400' },
        { label: 'Conversion Rate', target: 0, actual: conversionRate, unit: '%', color: 'from-amber-500 to-orange-400' },
      ];

      // Trend data (6 months)
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const trendData: Array<{ month: string; actual: number; target: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const leadsInMonth = leads.filter(l => {
          const created = new Date(l.createdAt);
          return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear();
        }).length;
        trendData.push({
          month: monthNames[d.getMonth()],
          actual: leadsInMonth,
          target: 0,
        });
      }

      // Industry metrics
      const avgDealSize = deals.filter(d => d.status === 'won' || d.status === 'accepted').length > 0
        ? deals.filter(d => d.status === 'won' || d.status === 'accepted').reduce((s, d) => s + (d.finalPrice ?? d.proposedPrice ?? 0), 0) / deals.filter(d => d.status === 'won' || d.status === 'accepted').length
        : 0;

      const industryMetrics = [
        { label: 'Avg Deal Size', yourValue: avgDealSize, industryAvg: 0, unit: '$' },
        { label: 'Sales Cycle (days)', yourValue: 0, industryAvg: 0, unit: 'd' },
        { label: 'Win Rate', yourValue: conversionRate, industryAvg: 0, unit: '%' },
        { label: 'Pipeline Coverage', yourValue: 0, industryAvg: 0, unit: 'x' },
        { label: 'Response Time (hrs)', yourValue: 0, industryAvg: 0, unit: 'h' },
      ];

      return NextResponse.json({
        data: {
          benchmarkMetrics,
          trendData,
          industryMetrics,
          goalCards: [],
        },
      });
    } catch (error) {
      console.error('[API] Performance benchmark error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch performance benchmark' }, { status: 500 });
    }
  });
}
