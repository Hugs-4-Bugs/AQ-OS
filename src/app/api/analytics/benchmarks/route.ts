// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Benchmarks API Route
// GET: Return benchmarks with filters
// POST: Generate benchmarks
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
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
      const { type, orgId: rawOrgId } = body as { type?: string; orgId?: string };

      // ACCOUNT ISOLATION: an org scope supplied by the client is only
      // honored when the caller is a REAL member of that org. Otherwise
      // fall back to the caller's own org (or none) — previously any user
      // could compute any org's member performance aggregates.
      let orgId: string | undefined;
      if (rawOrgId) {
        const membership = await db.orgMember.findFirst({
          where: { orgId: rawOrgId, userId: user.id },
          select: { id: true },
        });
        if (membership) {
          orgId = rawOrgId;
        } else {
          return NextResponse.json(
            { error: 'Not a member of this organization' },
            { status: 403 }
          );
        }
      }

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
