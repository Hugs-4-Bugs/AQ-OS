// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Schedule API Route
// Phase 9: Schedule email sends, list pending, cancel
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { scheduleSend, cancelScheduledSend, getPendingScheduledSends } from '@/lib/scheduled-send-service';

/**
 * POST /api/email/schedule — Schedule an email send
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { to, subject, body: emailBody, scheduledAt, leadId, emailAccountId, timezone } = body;

      if (!to || !subject || !emailBody || !scheduledAt) {
        return NextResponse.json(
          { error: 'Missing required fields: to, subject, body, scheduledAt' },
          { status: 400 }
        );
      }

      const result = await scheduleSend({
        userId: user.id,
        to,
        subject,
        body: emailBody,
        scheduledAt,
        leadId,
        emailAccountId,
        timezone,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        scheduledEmailId: result.scheduledEmailId,
      }, { status: 201 });
    } catch (error) {
      console.error('[ScheduleAPI] POST error:', error);
      return NextResponse.json({ error: 'Failed to schedule email' }, { status: 500 });
    }
  });
}

/**
 * GET /api/email/schedule — List pending scheduled sends
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const result = await getPendingScheduledSends(user.id, { limit, offset });

      return NextResponse.json({
        scheduledEmails: result.scheduledEmails,
        total: result.total,
        limit,
        offset,
      });
    } catch (error) {
      console.error('[ScheduleAPI] GET error:', error);
      return NextResponse.json({ error: 'Failed to list scheduled sends' }, { status: 500 });
    }
  });
}

/**
 * DELETE /api/email/schedule — Cancel a scheduled send
 */
export async function DELETE(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const scheduledEmailId = searchParams.get('id');

      if (!scheduledEmailId) {
        return NextResponse.json({ error: 'Missing scheduled email ID' }, { status: 400 });
      }

      const result = await cancelScheduledSend(scheduledEmailId, user.id);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({ success: true, scheduledEmailId: result.scheduledEmailId });
    } catch (error) {
      console.error('[ScheduleAPI] DELETE error:', error);
      return NextResponse.json({ error: 'Failed to cancel scheduled send' }, { status: 500 });
    }
  });
}
