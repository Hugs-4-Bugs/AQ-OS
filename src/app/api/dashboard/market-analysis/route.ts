import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      // Query competitor analyses for market insights
      const competitors = await db.competitorAnalysis.findMany({
        where: { userId },
        select: {
          competitorName: true,
          seoScore: true,
          socialScore: true,
          threatLevel: true,
          strengths: true,
          weaknesses: true,
          analysisData: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get lead niche distribution for market size estimation
      const leads = await db.lead.findMany({
        where: { userId, isActive: true },
        select: { niche: true, country: true, stage: true, createdAt: true },
      });

      // Niche distribution
      const nicheCounts: Record<string, number> = {};
      for (const lead of leads) {
        if (lead.niche) {
          nicheCounts[lead.niche] = (nicheCounts[lead.niche] ?? 0) + 1;
        }
      }

      // Hot sectors from lead concentrations
      const hotSectors = Object.entries(nicheCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .map(([name, count]) => ({
          name,
          leads: count,
          avgDeal: 0,
          competition: count > 50 ? 'High' : count > 20 ? 'Medium' : 'Low',
          heat: count > 50 ? 'High' as const : count > 20 ? 'Medium' as const : 'Low' as const,
        }));

      // Industry trends derived from competitor data
      const industryTrends = competitors.slice(0, 6).map(c => ({
        sector: c.competitorName || 'Unknown',
        direction: c.threatLevel === 'high' ? 'down' as const : c.threatLevel === 'medium' ? 'flat' as const : 'up' as const,
        growth: 0,
        relevance: Math.round(((c.seoScore || 0) + (c.socialScore || 0)) / 2),
      }));

      // Monthly trend from lead creation data
      const now = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const marketTrend: Array<{ month: string; pipeline: number; market: number; competitor: number }> = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const leadsInMonth = leads.filter(l => {
          const created = new Date(l.createdAt);
          return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear();
        });
        const count = leadsInMonth.length;
        marketTrend.push({
          month: monthNames[d.getMonth()],
          pipeline: count,
          market: 0,
          competitor: competitors.filter(c => new Date(c.createdAt).getMonth() === d.getMonth()).length,
        });
      }

      // Trending keywords from lead niches
      const trendingKeywords = Object.entries(nicheCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([keyword, count]) => ({
          keyword,
          frequency: count,
          trend: null as string | null,
        }));

      return NextResponse.json({
        data: {
          marketSize: [],
          industryTrends,
          hotSectors,
          marketTrend,
          trendingKeywords,
          opportunityScore: { total: 0, marketSize: 0, growthRate: 0, competition: 0, fitScore: 0 },
          competitors: competitors.map(c => ({
            name: c.competitorName,
            threatLevel: c.threatLevel,
            seoScore: c.seoScore,
            socialScore: c.socialScore,
          })),
        },
      });
    } catch (error) {
      console.error('[API] Market analysis error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch market data' }, { status: 500 });
    }
  });
}
