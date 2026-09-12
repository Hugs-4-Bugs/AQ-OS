import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      const leads = await db.lead.findMany({
        where: { userId, isActive: true },
        select: { source: true, stage: true, replyScore: true, conversionScore: true },
      });

      // Group by source
      const sourceMap: Record<string, { count: number; hot: number; warm: number; cold: number }> = {};
      for (const lead of leads) {
        const source = lead.source || 'Unknown';
        if (!sourceMap[source]) {
          sourceMap[source] = { count: 0, hot: 0, warm: 0, cold: 0 };
        }
        sourceMap[source].count++;
        if (lead.replyScore >= 60 || lead.conversionScore >= 60) {
          sourceMap[source].hot++;
        } else if (lead.replyScore >= 30 || lead.conversionScore >= 30) {
          sourceMap[source].warm++;
        } else {
          sourceMap[source].cold++;
        }
      }

      const totalLeads = leads.length;
      const colors = ['#3b82f6', '#10b981', '#0ea5e9', '#f59e0b', '#a855f7', '#ec4899'];
      const icons = ['Website', 'Referral', 'LinkedIn', 'Cold Outreach', 'Events', 'Partnerships'];

      const sources = Object.entries(sourceMap)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 6)
        .map(([name, data], i) => ({
          name,
          count: data.count,
          percentage: totalLeads > 0 ? Math.round((data.count / totalLeads) * 100 * 10) / 10 : 0,
          trend: 0, // No trend data available until historical tracking is implemented
          color: colors[i % colors.length],
          icon: icons[i % icons.length],
          quality: { hot: data.hot, warm: data.warm, cold: data.cold },
          qualityScore: data.count > 0 ? Math.round(((data.hot * 3 + data.warm * 2 + data.cold) / (data.count * 3)) * 100) : 0,
        }));

      return NextResponse.json({ data: { sources, totalLeads } });
    } catch (error) {
      console.error('[API] Lead sources error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch lead sources' }, { status: 500 });
    }
  });
}
