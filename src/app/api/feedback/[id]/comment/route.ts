import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/auth-middleware';
import { createNotification } from '@/lib/notification-service';
import { logAuditEvent } from '@/lib/lead-audit';

function truncate(s: unknown, max: number): string {
  if (s == null) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

// ─── POST /api/feedback/[id]/comment ───────────────────────────────

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const parts = request.nextUrl.pathname.split('/');
      const id = parts[parts.length - 2];

      const feedback = await db.feedbackReport.findUnique({ where: { id } });
      if (!feedback) {
        return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
      }
      if (feedback.userId !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      let body: { content?: string };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
      }

      const content = truncate(body.content, 5000);
      if (!content || content.trim().length === 0) {
        return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
      }

      const comment = await db.feedbackComment.create({
        data: {
          feedbackId: id,
          authorId: user.id,
          authorRole: 'user',
          content,
          isInternal: false,
        },
      });

      // Notify admins
      try {
        const admins = await db.user.findMany({
          where: { role: { in: ['super_admin', 'owner', 'admin'] }, isActive: true },
          select: { id: true },
        });
        for (const admin of admins) {
          await createNotification({
            userId: admin.id,
            type: 'system',
            title: `New comment on ${feedback.ticketNumber}`,
            message: `${user.email} commented on "${feedback.title}"`,
            actionUrl: '/admin/feedback',
            metadata: { feedbackId: id, ticketNumber: feedback.ticketNumber, commentId: comment.id },
          });
        }
      } catch {
        // ignore
      }

      try {
        await logAuditEvent(
          user.id,
          'feedback_comment_added',
          { feedbackId: id, ticketNumber: feedback.ticketNumber, commentId: comment.id },
          id,
        );
      } catch {
        // ignore
      }

      const comments = await db.feedbackComment.findMany({
        where: { feedbackId: id, isInternal: false },
        orderBy: { createdAt: 'asc' },
      });

      return NextResponse.json({ success: true, comments });
    } catch (err) {
      console.error('[Feedback] POST comment error:', err);
      return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }
  });
}
