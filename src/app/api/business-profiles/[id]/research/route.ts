// ═══════════════════════════════════════════════════════════════════
// POST /api/business-profiles/[id]/research
// GET  /api/business-profiles/[id]/intelligence
//
// Trigger business research and read intelligence for a BusinessProfile.
// Owner-scoped: the BusinessProfile must belong to the authenticated user.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { triggerBusinessResearch, getBusinessIntelligence } from '@/lib/business-research-service';

// POST — trigger research on a specific web property (or the first active one)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    // Determine which web property to research
    let webPropertyId = body.webPropertyId;

    if (!webPropertyId) {
      // Default to the first active web property
      const wp = await db.webProperty.findFirst({
        where: { businessProfileId: id, userId: user.id, status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!wp) {
        return NextResponse.json(
          { error: 'No active web property found. Add a website first.' },
          { status: 404 }
        );
      }
      webPropertyId = wp.id;
    }

    const result = await triggerBusinessResearch(user.id, webPropertyId);

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404
        : result.error?.includes('Insufficient') ? 402
        : result.error?.includes('already in progress') ? 409
        : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      success: true,
      snapshotId: result.snapshotId,
      creditsUsed: result.creditsUsed,
    }, { status: 202 });
  });
}

// GET — read latest business intelligence for the profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    const { id } = await params;
    const result = await getBusinessIntelligence(user.id, id);

    // Check for in-flight research
    const inFlightSnapshots = await db.researchSnapshot.findMany({
      where: {
        webProperty: { businessProfileId: id, userId: user.id },
        status: { in: ['pending', 'running'] },
      },
      select: { id: true, status: true, webPropertyId: true },
    });

    // Check for failed research (latest attempt)
    const failedSnapshots = await db.researchSnapshot.findMany({
      where: {
        webProperty: { businessProfileId: id, userId: user.id },
        status: 'failed',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { id: true, errorMessage: true, createdAt: true },
    });

    return NextResponse.json({
      webProperties: result.webProperties,
      intelligence: result.intelligence,
      inFlight: inFlightSnapshots,
      lastFailed: failedSnapshots[0] || null,
    });
  });
}
