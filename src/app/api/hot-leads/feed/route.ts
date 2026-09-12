// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/hot-leads/feed
// Dashboard feed of hot leads with full details
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { hotLeadDetectionService } from '@/lib/hot-lead-detection';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '20', 10);

      // Clamp limit to reasonable range
      const clampedLimit = Math.min(100, Math.max(1, limit));

      const feed = await hotLeadDetectionService.getHotLeadsFeed(user.id, clampedLimit);

      return NextResponse.json({
        success: true,
        data: {
          feed,
          count: feed.length,
        },
      });
    } catch (error) {
      console.error('[HotLeads] Feed endpoint error:', error);
      return NextResponse.json(
        { error: 'Failed to get hot leads feed' },
        { status: 500 }
      );
    }
  });
}
