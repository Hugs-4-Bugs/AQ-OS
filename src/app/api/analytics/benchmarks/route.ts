// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Benchmarks API Route
// GET: Return benchmarks with filters
// POST: Generate benchmarks
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getBenchmarks,
  generateAllBenchmarks,
  generateOrgComparison,
  generateTeamComparison,
  generateScoreComparison,
  generatePricingComparison,
  generateSEOComparison,
} from '@/lib/benchmarking-engine';

/** GET /api/analytics/benchmarks — Return benchmarks with filters */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const category = searchParams.get('category') ?? undefined;
      const benchmarkType = searchParams.get('benchmarkType') ?? undefined;

      const benchmarks = await getBenchmarks(user.id, category, benchmarkType);

      return NextResponse.json({
        success: true,
        benchmarks,
        count: benchmarks.length,
      });
    } catch (error) {
      console.error('Benchmarks GET error:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve benchmarks' },
        { status: 500 }
      );
    }
  });
}

/** POST /api/analytics/benchmarks — Generate benchmarks */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const { type, orgId } = body as { type?: string; orgId?: string };

      let result;

      switch (type) {
        case 'org_comparison':
          result = await generateOrgComparison(user.id, orgId);
          break;
        case 'team_comparison':
          result = await generateTeamComparison(user.id, orgId);
          break;
        case 'score_comparison':
          result = await generateScoreComparison(user.id);
          break;
        case 'pricing_comparison':
          result = await generatePricingComparison(user.id);
          break;
        case 'seo_comparison':
          result = await generateSEOComparison(user.id);
          break;
        case 'all':
        default:
          result = await generateAllBenchmarks(user.id, orgId);
          break;
      }

      return NextResponse.json({
        success: true,
        type: type ?? 'all',
        benchmarks: result,
      });
    } catch (error) {
      console.error('Benchmarks POST error:', error);
      return NextResponse.json(
        { error: 'Failed to generate benchmarks' },
        { status: 500 }
      );
    }
  });
}
