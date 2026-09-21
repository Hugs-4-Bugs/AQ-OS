import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { createNotification } from '@/lib/notification-service';
import { sendEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/lead-audit';

function truncate(s: unknown, max: number): string {
  if (s == null) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

// ─── POST /api/admin/feedback/[id]/comment ─────────────────────────

export async function POST(request: NextRequest) {
  return withSuperAdmin(request, async (adminUser) => {
    try {
      const parts = request.nextUrl.pathname.split('/');
      const id = parts[parts.length - 2];

      const feedback = await db.feedbackReport.findUnique({
        where: { id },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      if (!feedback) {
        return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
      }

      let body: { content?: string; isInternal?: boolean };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
      }

      const content = truncate(body.content, 5000);
      if (!content || content.trim().length === 0) {
        return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
      }
      const isInternal = Boolean(body.isInternal);

      const comment = await db.feedbackComment.create({
        data: {
          feedbackId: id,
          authorId: adminUser.id,
          authorRole: 'admin',
          content,
          isInternal,
        },
      });

      // If non-internal: notify user via in-app + email
      if (!isInternal && feedback.user) {
        try {
          await createNotification({
            userId: feedback.userId,
            type: 'system',
            title: `Admin replied to your feedback ${feedback.ticketNumber}`,
            message: `${adminUser.name || adminUser.email} replied to "${feedback.title}"`,
            actionUrl: '/dashboard/feedback',
            metadata: { feedbackId: id, ticketNumber: feedback.ticketNumber, commentId: comment.id },
          });
        } catch {
          // ignore
        }

        try {
          if (feedback.user.email) {
            await sendEmail({
              to: feedback.user.email,
              subject: `[AcquisitionOS] New reply on ${feedback.ticketNumber}`,
              text: `Hi ${feedback.user.name || 'there'},\n\n${adminUser.name || adminUser.email} replied to your feedback "${feedback.title}":\n\n${content}\n\n— AcquisitionOS Team`,
              html: `<p>Hi ${feedback.user.name || 'there'},</p><p><strong>${adminUser.name || adminUser.email}</strong> replied to your feedback "${feedback.title}":</p><blockquote style="border-left:3px solid #0d9488;padding-left:12px;color:#555;">${content}</blockquote><p>— AcquisitionOS Team</p>`,
            });
          }
        } catch (emailErr) {
          console.warn('[Admin Feedback] Comment email failed:', emailErr);
        }
      }

      try {
        await logAuditEvent(
          adminUser.id,
          'feedback_admin_comment',
          { feedbackId: id, ticketNumber: feedback.ticketNumber, commentId: comment.id, isInternal },
          id,
        );
      } catch {
        // ignore
      }

      const comments = await db.feedbackComment.findMany({
        where: { feedbackId: id },
        orderBy: { createdAt: 'asc' },
      });

      return NextResponse.json({ success: true, comments });
    } catch (err) {
      console.error('[Admin Feedback] POST comment error:', err);
      return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }
  });
}
