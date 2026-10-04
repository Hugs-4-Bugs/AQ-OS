// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Outreach Execute API Routes
// POST /api/outreach/execute — Enroll multiple leads in a sequence
// GET  /api/outreach/execute — Get sequence analytics
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';
import { enrollMultipleLeads, getSequenceAnalytics } from '@/lib/sequence-execution-engine';

// POST /api/outreach/execute
export async function POST(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { sequenceId, leadIds } = body;

      // Validate required fields
      if (!sequenceId || typeof sequenceId !== 'string') {
        return NextResponse.json(
          { error: 'sequenceId is required and must be a string' },
          { status: 400 }
        );
      }
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return NextResponse.json(
          { error: 'leadIds is required and must be a non-empty array of strings' },
          { status: 400 }
        );
      }
      if (leadIds.length > 100) {
        return NextResponse.json(
          { error: 'leadIds array must contain at most 100 IDs per request' },
          { status: 400 }
        );
      }

      const result = await enrollMultipleLeads(sequenceId, leadIds, user.id);

      return NextResponse.json({
        success: true,
        enrolled: result.enrolled,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (error) {
      console.error('[OutreachExecute API] POST failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to enroll leads in sequence';
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}

// GET /api/outreach/execute?sequenceId=xxx
export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const { searchParams } = new URL(request.url);
      const sequenceId = searchParams.get('sequenceId');

      if (!sequenceId) {
        return NextResponse.json(
          { error: 'sequenceId query parameter is required' },
          { status: 400 }
        );
      }

      const analytics = await getSequenceAnalytics(sequenceId, user.id);

      return NextResponse.json({
        success: true,
        analytics,
      });
    } catch (error) {
      console.error('[OutreachExecute API] GET failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to get sequence analytics';
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}
