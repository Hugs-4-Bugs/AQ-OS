import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withPermission } from '@/lib/auth-middleware';

// GET /api/deals - Get all deals with lead information
export async function GET(request: NextRequest) {
  return withPermission(request, 'deals:read', async () => {
  try {
    const deals = await db.deal.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            niche: true,
            country: true,
            city: true,
            email: true,
            phone: true,
            stage: true,
          },
        },
      },
    });

    return NextResponse.json(deals);
  } catch (error) {
    console.error('Error fetching all deals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deals' },
      { status: 500 }
    );
  }
  });
}
