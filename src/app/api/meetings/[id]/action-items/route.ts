// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Action Items Generation API
// POST /api/meetings/[id]/action-items — Generate AI action items
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { generateActionItems } from '@/lib/ai/meeting-assistant';

export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id: meetingId } = await params;

      // Validate the meeting belongs to the authenticated user
      const meeting = await db.meeting.findFirst({
        where: {
          id: meetingId,
          userId: user.id,
        },
      });

      if (!meeting) {
        return NextResponse.json(
          { error: 'Meeting not found or you do not have access.' },
          { status: 404 }
        );
      }

      // Generate action items using AI
      const actionItems = await generateActionItems(meetingId);

      if (!actionItems || actionItems.length === 0) {
        return NextResponse.json(
          { error: 'Failed to generate action items. Ensure the meeting has sufficient notes or description content.' },
          { status: 422 }
        );
      }

      return NextResponse.json({
        meetingId,
        actionItems,
      });
    } catch (error) {
      console.error('[Meeting Action Items API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate action items' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/action-items');
