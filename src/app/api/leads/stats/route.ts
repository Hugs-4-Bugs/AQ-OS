import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// GET /api/leads/stats - Dashboard statistics
// ACCOUNT ISOLATION: every metric is computed over the AUTHENTICATED
// USER'S OWN leads only (and the communications/deals attached to them).
// This endpoint previously required no auth and aggregated the entire
// database — leaking global pipeline counts, niches, countries, reply
// rates and deal values across all tenants.
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Ownership scope applied to the lead table; communications and
      // deals are scoped through their lead relation.
      const leadScope = { userId: user.id };

      // Get all leads for computation
      const [
        totalLeads,
        hotLeads,
        contactedLeads,
        repliedLeads,
        wonLeads,
        lostLeads,
        allLeads,
        allCommunications,
        allDeals,
      ] = await Promise.all([
        db.lead.count({ where: leadScope }),
        db.lead.count({ where: { ...leadScope, replyScore: { gt: 70 } } }),
        db.lead.count({ where: { ...leadScope, stage: { in: ['contacted', 'replied', 'interested', 'discussion', 'proposal', 'negotiation'] } } }),
        db.lead.count({ where: { ...leadScope, stage: { in: ['replied', 'interested', 'discussion', 'proposal', 'negotiation', 'won'] } } }),
        db.lead.count({ where: { ...leadScope, stage: 'won' } }),
        db.lead.count({ where: { ...leadScope, stage: 'lost' } }),
        db.lead.findMany({
          where: leadScope,
          select: {
            stage: true,
            niche: true,
            country: true,
            replyScore: true,
            conversionScore: true,
            urgencyScore: true,
            revenuePotentialScore: true,
          },
        }),
        db.communication.findMany({
          where: { lead: leadScope },
          select: {
            channel: true,
            direction: true,
            intent: true,
            leadId: true,
          },
        }),
        db.deal.findMany({
          where: { lead: leadScope },
          select: {
            proposedPrice: true,
            finalPrice: true,
            currency: true,
            status: true,
          },
        }),
      ]);

    // Pipeline breakdown by stage
    const stageBreakdown: Record<string, number> = {};
    const stageOrder = [
      'discovered', 'contacted', 'replied', 'interested',
      'discussion', 'proposal', 'negotiation', 'won', 'lost',
    ];
    for (const stage of stageOrder) {
      stageBreakdown[stage] = allLeads.filter((l) => l.stage === stage).length;
    }

    // Interested leads (stage discussion and beyond, excluding won/lost)
    const interestedLeads = allLeads.filter((l) =>
      ['discussion', 'proposal', 'negotiation'].includes(l.stage)
    ).length;

    // Average scores
    const leadsWithScores = allLeads.filter(
      (l) => l.replyScore > 0 || l.conversionScore > 0
    );
    const avgScores = leadsWithScores.length > 0
      ? {
          replyScore: Math.round(
            leadsWithScores.reduce((sum, l) => sum + l.replyScore, 0) / leadsWithScores.length
          ),
          conversionScore: Math.round(
            leadsWithScores.reduce((sum, l) => sum + l.conversionScore, 0) / leadsWithScores.length
          ),
          urgencyScore: Math.round(
            leadsWithScores.reduce((sum, l) => sum + l.urgencyScore, 0) / leadsWithScores.length
          ),
          revenuePotentialScore: Math.round(
            leadsWithScores.reduce((sum, l) => sum + l.revenuePotentialScore, 0) / leadsWithScores.length
          ),
        }
      : {
          replyScore: 0,
          conversionScore: 0,
          urgencyScore: 0,
          revenuePotentialScore: 0,
        };

    // Top niches
    const nicheCounts: Record<string, number> = {};
    for (const lead of allLeads) {
      if (lead.niche) {
        nicheCounts[lead.niche] = (nicheCounts[lead.niche] || 0) + 1;
      }
    }
    const topNiches = Object.entries(nicheCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([niche, count]) => ({ niche, count }));

    // Top countries
    const countryCounts: Record<string, number> = {};
    for (const lead of allLeads) {
      if (lead.country) {
        countryCounts[lead.country] = (countryCounts[lead.country] || 0) + 1;
      }
    }
    const topCountries = Object.entries(countryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([country, count]) => ({ country, count }));

    // Reply rate: leads that received inbound communication / leads that were contacted
    const leadsContacted = new Set(
      allCommunications
        .filter((c) => c.direction === 'outbound')
        .map((c) => c.leadId)
    );
    const leadsReplied = new Set(
      allCommunications
        .filter((c) => c.direction === 'inbound')
        .map((c) => c.leadId)
    );
    const replyRate = leadsContacted.size > 0
      ? Math.round((leadsReplied.size / leadsContacted.size) * 100)
      : 0;

    // Close rate
    const closedDeals = wonLeads + lostLeads;
    const closeRate = closedDeals > 0
      ? Math.round((wonLeads / closedDeals) * 100)
      : 0;

    // Average deal value
    const dealsWithPrice = allDeals.filter((d) => d.proposedPrice !== null);
    const avgDealValue = dealsWithPrice.length > 0
      ? Math.round(
          dealsWithPrice.reduce((sum, d) => sum + (d.proposedPrice || 0), 0) / dealsWithPrice.length
        )
      : 0;

    return NextResponse.json({
      totalLeads,
      hotLeads,
      contactedLeads,
      repliedLeads,
      interestedLeads,
      wonLeads,
      lostLeads,
      stageBreakdown,
      avgScores,
      topNiches,
      topCountries,
      replyRate,
      closeRate,
      avgDealValue,
      totalDeals: allDeals.length,
    });
    } catch (error) {
      console.error('Error fetching stats:', error);
      return NextResponse.json(
        { error: 'Failed to fetch stats' },
        { status: 500 }
      );
    }
  });
}
