import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const leads = await db.lead.findMany({
        where: { userId: user.id, isActive: true },
        select: { country: true, city: true, niche: true, businessName: true, stage: true, replyScore: true, conversionScore: true },
      });

      const byCountry: Record<string, number> = {};
      const byCity: Record<string, number> = {};
      for (const lead of leads) {
        if (lead.country) byCountry[lead.country] = (byCountry[lead.country] || 0) + 1;
        if (lead.city) byCity[lead.city] = (byCity[lead.city] || 0) + 1;
      }

      const regions = Object.entries(byCountry).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      const cities = Object.entries(byCity).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
      const topLeadsByRegion = leads.filter(l => l.country).slice(0, 20).map(l => ({
        name: l.businessName,
        region: l.country || '',
        city: l.city || '',
        niche: l.niche || '',
        stage: l.stage,
        score: Math.round((l.replyScore + l.conversionScore) / 2),
      }));

      return NextResponse.json({
        data: {
          totalLeads: leads.length,
          regions,
          cities,
          topLeadsByRegion,
          performanceByRegion: regions.map(r => {
            const regionLeads = leads.filter(l => l.country === r.name);
            const avgScore = regionLeads.length > 0
              ? Math.round(regionLeads.reduce((s, l) => s + (l.replyScore || 0) + (l.conversionScore || 0), 0) / (regionLeads.length * 2))
              : 0;
            return { region: r.name, leads: r.count, avgScore };
          }),
        },
      });
    } catch (error) {
      console.error('[API] Territory map error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch territory map' }, { status: 500 });
    }
  });
}
