// ═══════════════════════════════════════════════════════════════════
// POST /api/competitors/discover — Discover competitors by niche
// Phase 13: Competitor Discovery
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { discoverCompetitors } from '@/lib/competitor-intelligence-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { niche, location } = body;

      if (!niche) {
        return NextResponse.json(
          { error: 'Missing required field: niche' },
          { status: 400 }
        );
      }

      const results = await discoverCompetitors(user.id, niche, location || '');

      return NextResponse.json({ results });
    } catch (error) {
      console.error('[POST /api/competitors/discover] Error:', error);
      return NextResponse.json(
        { error: 'Failed to discover competitors' },
        { status: 500 }
      );
    }
  });
}
