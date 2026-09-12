// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Objections Extraction API
// POST /api/meetings/[id]/objections — Extract objections from meeting
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { extractObjections } from '@/lib/ai/meeting-assistant';

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

      // Extract objections using AI
      const objections = await extractObjections(meetingId);

      if (!objections) {
        return NextResponse.json(
          { error: 'Failed to extract objections. Ensure the meeting has sufficient notes or description content.' },
          { status: 422 }
        );
      }

      return NextResponse.json({
        meetingId,
        objections,
      });
    } catch (error) {
      console.error('[Meeting Objections API] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to extract meeting objections' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/objections');
