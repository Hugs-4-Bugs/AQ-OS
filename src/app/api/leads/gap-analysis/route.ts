// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gap Analysis API Routes
// POST /api/leads/gap-analysis — Analyze gaps for lead(s)
// GET  /api/leads/gap-analysis — Get gap trends for user
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';
import { analyzeLeadGaps, batchAnalyzeGaps, getGapTrends } from '@/lib/gap-analysis-service';

// POST /api/leads/gap-analysis
export async function POST(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { leadId, leadIds } = body;

      if (leadIds && Array.isArray(leadIds)) {
        // Batch gap analysis for multiple leads
        if (leadIds.length === 0) {
          return NextResponse.json(
            { error: 'leadIds array must not be empty' },
            { status: 400 }
          );
        }
        if (leadIds.length > 50) {
          return NextResponse.json(
            { error: 'leadIds array must contain at most 50 IDs' },
            { status: 400 }
          );
        }

        const result = await batchAnalyzeGaps(leadIds, user.id);

        return NextResponse.json({
          success: true,
          batch: result,
        });
      } else if (leadId && typeof leadId === 'string') {
        // Single lead gap analysis
        const result = await analyzeLeadGaps(leadId, user.id);

        if (!result.success) {
          return NextResponse.json(
            { error: result.error || 'Gap analysis failed' },
            { status: 422 }
          );
        }

        return NextResponse.json({
          success: true,
          analysis: result.analysis,
        });
      } else {
        return NextResponse.json(
          { error: 'Provide either leadId (string) or leadIds (string[]) in the request body' },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error('[GapAnalysis API] POST failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to perform gap analysis';
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}

// GET /api/leads/gap-analysis
export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const trends = await getGapTrends(user.id);

      return NextResponse.json({
        success: true,
        trends,
      });
    } catch (error) {
      console.error('[GapAnalysis API] GET failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to get gap trends';
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}
