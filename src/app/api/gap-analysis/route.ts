// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gap Analysis API Routes
// POST: Analyze gaps against a specific competitor
// GET:  Get aggregate gap analysis across all competitors
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import {
  analyzeGaps,
  analyzeAllGaps,
} from '@/lib/competitive-gap-analysis-service';
import type { GapCategory } from '@/lib/competitive-gap-analysis-service';

const VALID_CATEGORIES = new Set<string>([
  'seo', 'pricing', 'social', 'reviews', 'tech_stack', 'content', 'features', 'delivery',
]);

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { competitorId, category } = body as {
        competitorId?: string;
        category?: string;
      };

      if (!competitorId) {
        return NextResponse.json(
          { error: 'competitorId is required' },
          { status: 400 }
        );
      }

      if (category && !VALID_CATEGORIES.has(category)) {
        return NextResponse.json(
          { error: `Invalid category. Valid: ${Array.from(VALID_CATEGORIES).join(', ')}` },
          { status: 400 }
        );
      }

      const result = await analyzeGaps({
        userId: user.id,
        competitorId,
        category: category as GapCategory | undefined,
      });

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      const status = message.includes('Insufficient credits') ? 402
        : message.includes('not found') ? 404
        : 500;
      return NextResponse.json({ error: message }, { status });
    }
  });
}, 'gap-analysis/analyze');

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const result = await analyzeAllGaps(user.id);
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      const status = message.includes('Insufficient credits') ? 402 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  });
}, 'gap-analysis/aggregate');
