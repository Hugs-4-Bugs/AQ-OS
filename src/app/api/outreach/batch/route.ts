// ═══════════════════════════════════════════════════════════════════
// POST /api/outreach/batch — Batch outreach for multiple leads
//
// Body: { leadIds, channel, autonomyMode, maxPerHour? }
// Auth: withAuth + withApiLogging
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { batchOutreach, type OutreachAutonomyMode } from '@/lib/autonomous-outreach-service';
import type { AuthUser } from '@/lib/auth';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { leadIds, channel, autonomyMode, maxPerHour } = body;

      // Validate required fields
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return NextResponse.json(
          { error: 'leadIds is required and must be a non-empty array of strings' },
          { status: 400 }
        );
      }

      if (leadIds.length > 100) {
        return NextResponse.json(
          { error: 'Maximum 100 leads per batch request' },
          { status: 400 }
        );
      }

      if (!channel || channel !== 'email') {
        return NextResponse.json(
          { error: 'Batch outreach currently only supports email channel' },
          { status: 400 }
        );
      }

      // Validate autonomy mode (must be assisted or autonomous for batch)
      const validModes: OutreachAutonomyMode[] = ['assisted', 'autonomous'];
      if (!autonomyMode || !validModes.includes(autonomyMode)) {
        return NextResponse.json(
          { error: `autonomyMode must be one of: ${validModes.join(', ')} for batch outreach` },
          { status: 400 }
        );
      }

      if (maxPerHour !== undefined && (typeof maxPerHour !== 'number' || maxPerHour < 1 || maxPerHour > 50)) {
        return NextResponse.json(
          { error: 'maxPerHour must be a number between 1 and 50' },
          { status: 400 }
        );
      }

      const result = await batchOutreach({
        userId: user.id,
        leadIds,
        channel: 'email',
        autonomyMode,
        maxPerHour,
      });

      return NextResponse.json({
        success: true,
        total: result.total,
        generated: result.generated,
        drafted: result.drafted,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        results: result.results,
      });
    } catch (error) {
      console.error('[API /outreach/batch] POST failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Batch outreach failed' },
        { status: 500 }
      );
    }
  });
}, 'outreach/batch');
