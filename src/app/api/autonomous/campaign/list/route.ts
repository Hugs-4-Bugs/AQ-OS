// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Campaign List API
// GET: List all campaigns for the authenticated user with stats
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const status = url.searchParams.get('status') || undefined;

      // Build where clause
      const where: Record<string, unknown> = { userId: user.id };
      if (status) {
        where.status = status;
      }

      // Fetch campaigns with all detail fields
      const [campaigns, total] = await Promise.all([
        db.acquisitionCampaign.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        db.acquisitionCampaign.count({ where }),
      ]);

      // Compute aggregate stats
      const activeStatuses = ['parsing', 'discovering', 'analyzing', 'generating', 'sending'];
      const stats = await db.acquisitionCampaign.aggregate({
        where: { userId: user.id },
        _sum: {
          discovered: true,
          outreachGenerated: true,
          sent: true,
        },
        _count: {
          id: true,
        },
      });

      const activeCount = await db.acquisitionCampaign.count({
        where: { userId: user.id, status: { in: activeStatuses } },
      });

      const campaignStats = {
        totalCampaigns: stats._count.id,
        totalLeadsDiscovered: stats._sum.discovered || 0,
        totalOutreachGenerated: stats._sum.outreachGenerated || 0,
        totalSent: stats._sum.sent || 0,
        activeCampaigns: activeCount,
      };

      return NextResponse.json({
        campaigns,
        stats: campaignStats,
        total,
        limit,
        offset,
        hasMore: offset + campaigns.length < total,
      });
    } catch (error) {
      console.error('[CampaignListAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch campaigns' },
        { status: 500 }
      );
    }
  });
}
