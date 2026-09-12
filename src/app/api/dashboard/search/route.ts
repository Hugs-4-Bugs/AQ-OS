import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const query = searchParams.get('q')?.trim();

      if (!query || query.length < 2) {
        return NextResponse.json({ data: { leads: [], deals: [] } });
      }

      // Search across leads
      const leads = await db.lead.findMany({
        where: {
          userId: user.id,
          isActive: true,
          OR: [
            { businessName: { contains: query } },
            { ownerName: { contains: query } },
            { email: { contains: query } },
            { website: { contains: query } },
            { city: { contains: query } },
            { country: { contains: query } },
            { niche: { contains: query } },
            { stage: { contains: query } },
          ],
        },
        take: 10,
        orderBy: { conversionScore: 'desc' },
      });

      // Search across deals (via lead relation)
      const deals = await db.deal.findMany({
        where: {
          lead: { userId: user.id },
          OR: [
            { projectType: { contains: query } },
            { projectScope: { contains: query } },
            { notes: { contains: query } },
            { status: { contains: query } },
            { lead: { businessName: { contains: query } } },
          ],
        },
        include: {
          lead: { select: { businessName: true } },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });

      const mappedLeads = leads.map((lead) => ({
        id: lead.id,
        businessName: lead.businessName,
        website: lead.website || '',
        location: [lead.city, lead.country].filter(Boolean).join(', ') || 'Unknown',
        score: Math.round((lead.replyScore + lead.conversionScore + lead.urgencyScore + lead.revenuePotentialScore) / 4),
        stage: lead.stage,
      }));

      const mappedDeals = deals.map((deal) => ({
        id: deal.id,
        name: deal.projectType || 'Deal',
        value: deal.proposedPrice ? `$${deal.proposedPrice.toLocaleString()}` : 'TBD',
        company: deal.lead.businessName,
        probability: deal.status === 'won' || deal.status === 'closed' ? 95 : deal.status === 'negotiation' ? 70 : deal.status === 'proposal' ? 50 : 30,
        stage: deal.status,
      }));

      return NextResponse.json({
        data: {
          leads: mappedLeads,
          deals: mappedDeals,
        },
      });
    } catch (error) {
      console.error('[API] Error searching:', error);
      return NextResponse.json({ data: { leads: [], deals: [] }, error: 'Search failed' }, { status: 500 });
    }
  });
}
