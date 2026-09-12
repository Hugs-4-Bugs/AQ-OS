// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/discovery/leads
// Returns all leads created by auto-discovery for the authenticated user.
// Uses withAuth middleware — no custom auth logic.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = Math.max(1, Number(searchParams.get('page')) || 1);
      const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50));

      const leads = await db.lead.findMany({
        where: {
          userId: user.id,
          source: 'auto_discovery',
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          businessName: true,
          email: true,
          website: true,
          stage: true,
          replyScore: true,
          niche: true,
          city: true,
          country: true,
          source: true,
          techStack: true, // JSON metadata with websiteScore, lastOutreachEmail, etc.
          createdAt: true,
          updatedAt: true,
        },
      });

      const total = await db.lead.count({
        where: {
          userId: user.id,
          source: 'auto_discovery',
          isActive: true,
        },
      });

      // Transform to include extracted metadata fields
      const transformed = leads.map((lead) => {
        let metadata: Record<string, unknown> = {};
        try {
          metadata = lead.techStack ? JSON.parse(lead.techStack) as Record<string, unknown> : {};
        } catch {
          // Ignore parse errors
        }

        const websiteScoreData = metadata.websiteScore as Record<string, unknown> | undefined;
        const lastOutreachEmail = metadata.lastOutreachEmail as { subject?: string } | undefined;

        return {
          id: lead.id,
          businessName: lead.businessName,
          email: lead.email,
          website: lead.website,
          stage: lead.stage,
          leadScore: lead.replyScore,
          niche: lead.niche,
          city: lead.city,
          country: lead.country,
          source: lead.source,
          websiteScore: websiteScoreData?.overallScore ?? null,
          leadTemperature: (metadata.leadTemperature as string) ?? null,
          lastOutreachSubject: lastOutreachEmail?.subject ?? null,
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
        };
      });

      return NextResponse.json({
        leads: transformed,
        total,
        page,
        limit,
        hasMore: page * limit < total,
      });
    } catch (error) {
      console.error('[DiscoveryLeads] Error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
