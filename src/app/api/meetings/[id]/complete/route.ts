// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Meeting API
// POST /api/meetings/[id]/complete — Mark meeting as completed
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { completeMeeting } from '@/lib/meeting-orchestration-service';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      // Extract meeting ID from URL: /api/meetings/[id]/complete
      const pathname = request.nextUrl.pathname;
      const parts = pathname.split('/');
      const meetingsIndex = parts.indexOf('meetings');
      const id = meetingsIndex >= 0 ? parts[meetingsIndex + 1] : null;

      if (!id) {
        return NextResponse.json(
          { error: 'Meeting ID is required' },
          { status: 400 }
        );
      }

      const body = await request.json().catch(() => ({}));

      const meeting = await completeMeeting(
        user.id,
        id,
        body.notes,
        body.followUpActions
      );

      return NextResponse.json({ meeting });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Meeting not found')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 404 }
        );
      }

      if (errorMessage.includes('already marked as completed')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      if (errorMessage.includes('Cannot complete a cancelled')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      console.error('[Meeting Complete API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to complete meeting' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/complete');
