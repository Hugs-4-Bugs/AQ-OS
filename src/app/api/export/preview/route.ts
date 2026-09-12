// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Data Export Preview API Route
// Returns JSON preview (first 10 rows) for export data
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import type { AuthUser } from '@/lib/auth';

const PREVIEW_LIMIT = 10;

async function getLeadsPreview(userId: string) {
  const leads = await db.lead.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
    take: PREVIEW_LIMIT,
    select: {
      businessName: true, ownerName: true, niche: true, country: true,
      city: true, stage: true, replyScore: true, conversionScore: true,
      email: true, phone: true, createdAt: true,
    },
  });

  return {
    headers: ['Business Name', 'Owner', 'Niche', 'Country', 'City', 'Stage', 'Reply Score', 'Conversion Score', 'Email', 'Phone', 'Created At'],
    rows: leads.map((l) => [
      l.businessName, l.ownerName ?? '', l.niche ?? '', l.country ?? '',
      l.city ?? '', l.stage, l.replyScore, l.conversionScore,
      l.email ?? '', l.phone ?? '', l.createdAt.toISOString(),
    ]),
    totalCount: 0,
  };
}

async function getDealsPreview(userId: string) {
  const deals = await db.deal.findMany({
    where: { lead: { userId } },
    orderBy: { createdAt: 'desc' },
    take: PREVIEW_LIMIT,
    select: {
      projectType: true, status: true, proposedPrice: true, currency: true,
      lead: { select: { businessName: true } },
      createdAt: true,
    },
  });

  return {
    headers: ['Business Name', 'Project Type', 'Status', 'Proposed Price', 'Currency', 'Created At'],
    rows: deals.map((d) => [
      d.lead?.businessName ?? '', d.projectType ?? '', d.status,
      d.proposedPrice ?? '', d.currency, d.createdAt.toISOString(),
    ]),
    totalCount: 0,
  };
}

async function getPipelinePreview(userId: string) {
  const leads = await db.lead.findMany({
    where: { userId, isActive: true, stage: { not: 'discovered' } },
    orderBy: { updatedAt: 'desc' },
    take: PREVIEW_LIMIT,
    select: {
      businessName: true, stage: true, conversionScore: true,
      revenuePotentialScore: true, bestChannel: true,
      lastContactedAt: true, updatedAt: true,
    },
  });

  return {
    headers: ['Business Name', 'Stage', 'Conversion Score', 'Revenue Score', 'Best Channel', 'Last Contacted', 'Updated At'],
    rows: leads.map((l) => [
      l.businessName, l.stage, l.conversionScore, l.revenuePotentialScore,
      l.bestChannel ?? '', l.lastContactedAt?.toISOString() ?? 'Never',
      l.updatedAt.toISOString(),
    ]),
    totalCount: 0,
  };
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'leads';

    let preview: { headers: string[]; rows: unknown[][]; totalCount: number };

    switch (type) {
      case 'deals':
        preview = await getDealsPreview(user.id);
        break;
      case 'pipeline':
        preview = await getPipelinePreview(user.id);
        break;
      case 'leads':
      default:
        preview = await getLeadsPreview(user.id);
        break;
    }

    // Get total count for the type
    let totalCount = 0;
    try {
      if (type === 'leads' || type === 'pipeline') {
        const where = type === 'pipeline'
          ? { userId: user.id, isActive: true, stage: { not: 'discovered' } }
          : { userId: user.id, isActive: true };
        totalCount = await db.lead.count({ where });
      } else if (type === 'deals') {
        totalCount = await db.deal.count({ where: { lead: { userId: user.id } } });
      }
    } catch {
      // fallback
    }

    return NextResponse.json({
      type,
      headers: preview.headers,
      rows: preview.rows,
      previewCount: preview.rows.length,
      totalCount,
      creditCost: 5,
    });
  });
}
