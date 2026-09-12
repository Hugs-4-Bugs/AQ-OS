import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAdmin } from '@/lib/auth-middleware';
import { createNotification } from '@/lib/notification-service';
import { sendEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/lead-audit';

function truncate(s: unknown, max: number): string {
  if (s == null) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

function sanitizeArray(val: unknown, maxItems = 20): unknown[] {
  if (!Array.isArray(val)) return [];
  return val.slice(0, maxItems);
}

// ─── Email templates for status changes ────────────────────────────

const STATUS_EMAIL_TEMPLATES: Record<string, {
  subject: (tn: string) => string;
  body: (tn: string, title: string, notes?: string | null) => { text: string; html: string };
}> = {
  acknowledged: {
    subject: (tn: string) => `[AcquisitionOS] Feedback acknowledged — ${tn}`,
    body: (tn, title) => ({
      text: `Hi,\n\nWe've received and reviewed your report ${tn} "${title}". It's now in our queue for investigation.\n\n— AcquisitionOS Team`,
      html: `<p>Hi,</p><p>We've received and reviewed your report <strong style="font-family:monospace;color:#0d9488;">${tn}</strong> "${title}". It's now in our queue for investigation.</p><p>— AcquisitionOS Team</p>`,
    }),
  },
  investigating: {
    subject: (tn: string) => `[AcquisitionOS] We're investigating ${tn}`,
    body: (tn, title) => ({
      text: `Hi,\n\nWe're actively investigating your report ${tn} "${title}".\n\n— AcquisitionOS Team`,
      html: `<p>Hi,</p><p>We're actively investigating your report <strong style="font-family:monospace;color:#0d9488;">${tn}</strong> "${title}".</p><p>— AcquisitionOS Team</p>`,
    }),
  },
  in_progress: {
    subject: (tn: string) => `[AcquisitionOS] Fix in progress for ${tn}`,
    body: (tn, title) => ({
      text: `Hi,\n\nA fix is in progress for your report ${tn} "${title}".\n\n— AcquisitionOS Team`,
      html: `<p>Hi,</p><p>A fix is in progress for your report <strong style="font-family:monospace;color:#0d9488;">${tn}</strong> "${title}".</p><p>— AcquisitionOS Team</p>`,
    }),
  },
  need_more_info: {
    subject: (tn: string) => `[AcquisitionOS] We need more info about ${tn}`,
    body: (tn, title, notes) => ({
      text: `Hi,\n\nWe need more information about ${tn} "${title}". Please add a comment with additional details.\n${notes ? `\nNotes: ${notes}` : ''}\n\n— AcquisitionOS Team`,
      html: `<p>Hi,</p><p>We need more information about <strong style="font-family:monospace;color:#0d9488;">${tn}</strong> "${title}".</p><p>Please add a comment with additional details.${notes ? `<br/><br/><strong>Notes:</strong> ${notes}` : ''}</p><p>— AcquisitionOS Team</p>`,
    }),
  },
  fixed: {
    subject: (tn: string) => `[AcquisitionOS] Your report ${tn} has been fixed!`,
    body: (tn, title) => ({
      text: `Hi,\n\nGreat news! Your reported issue ${tn} "${title}" has been fixed!\n\n— AcquisitionOS Team`,
      html: `<p>Hi,</p><p>Great news! Your reported issue <strong style="font-family:monospace;color:#0d9488;">${tn}</strong> "${title}" has been fixed!</p><p>— AcquisitionOS Team</p>`,
    }),
  },
  released: {
    subject: (tn: string) => `[AcquisitionOS] Fix for ${tn} has been released`,
    body: (tn, title) => ({
      text: `Hi,\n\nThe fix for ${tn} "${title}" has been released. Please update the app and let us know if the issue persists.\n\n— AcquisitionOS Team`,
      html: `<p>Hi,</p><p>The fix for <strong style="font-family:monospace;color:#0d9488;">${tn}</strong> "${title}" has been released.</p><p>Please update the app and let us know if the issue persists.</p><p>— AcquisitionOS Team</p>`,
    }),
  },
  closed: {
    subject: (tn: string) => `[AcquisitionOS] Feedback ${tn} closed`,
    body: (tn, title) => ({
      text: `Hi,\n\nYour feedback ${tn} "${title}" has been closed. Thank you!\n\n— AcquisitionOS Team`,
      html: `<p>Hi,</p><p>Your feedback <strong style="font-family:monospace;color:#0d9488;">${tn}</strong> "${title}" has been closed. Thank you!</p><p>— AcquisitionOS Team</p>`,
    }),
  },
  rejected: {
    subject: (tn: string) => `[AcquisitionOS] ${tn} unable to reproduce`,
    body: (tn, title) => ({
      text: `Hi,\n\nAfter investigation, we were unable to reproduce ${tn} "${title}". If you can provide more details, please reopen the ticket.\n\n— AcquisitionOS Team`,
      html: `<p>Hi,</p><p>After investigation, we were unable to reproduce <strong style="font-family:monospace;color:#0d9488;">${tn}</strong> "${title}".</p><p>If you can provide more details, please reopen the ticket.</p><p>— AcquisitionOS Team</p>`,
    }),
  },
};

// ─── PATCH /api/admin/feedback/[id] ────────────────────────────────

export async function PATCH(request: NextRequest) {
  return withAdmin(request, async (adminUser) => {
    try {
      const id = request.nextUrl.pathname.split('/').pop() as string;

      const feedback = await db.feedbackReport.findUnique({
        where: { id },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      if (!feedback) {
        return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
      }

      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
      }

      const data: Record<string, unknown> = {};
      if (typeof body.status === 'string') data.status = truncate(body.status, 50);
      if (typeof body.priority === 'string') data.priority = truncate(body.priority, 50);
      if (typeof body.assignedTo === 'string') data.assignedTo = truncate(body.assignedTo, 100) || null;
      if (typeof body.resolutionNotes === 'string') data.resolutionNotes = truncate(body.resolutionNotes, 5000);
      if (body.tags !== undefined) data.tags = sanitizeArray(body.tags, 20) as never;
      if (body.labels !== undefined) data.labels = sanitizeArray(body.labels, 20) as never;
      if (typeof body.duplicateOf === 'string') data.duplicateOf = truncate(body.duplicateOf, 100) || null;

      if (data.status === 'fixed' || data.status === 'released' || data.status === 'closed') {
        data.resolvedAt = new Date();
      }

      const previousStatus = feedback.status;

      const updated = await db.feedbackReport.update({ where: { id }, data });

      if (data.status && data.status !== previousStatus) {
        try {
          await db.feedbackStatusLog.create({
            data: {
              feedbackId: id,
              fromStatus: previousStatus,
              toStatus: data.status as string,
              changedBy: adminUser.id,
              note: typeof body.resolutionNotes === 'string' ? truncate(body.resolutionNotes, 1000) : null,
            },
          });
        } catch {
          // ignore
        }

        try {
          await createNotification({
            userId: feedback.userId,
            type: 'system',
            title: `Feedback ${feedback.ticketNumber} status updated`,
            message: `Your feedback "${feedback.title}" status changed to ${data.status}.`,
            actionUrl: '/dashboard/feedback',
            metadata: { feedbackId: id, ticketNumber: feedback.ticketNumber, oldStatus: previousStatus, newStatus: data.status },
          });
        } catch {
          // ignore
        }

        const template = STATUS_EMAIL_TEMPLATES[data.status as string];
        if (template && feedback.user?.email) {
          try {
            const content = template.body(feedback.ticketNumber, feedback.title, body.resolutionNotes as string | undefined);
            await sendEmail({
              to: feedback.user.email,
              subject: template.subject(feedback.ticketNumber),
              text: content.text,
              html: content.html,
            });
          } catch (emailErr) {
            console.warn('[Admin Feedback] Status change email failed:', emailErr);
          }
        }
      }

      try {
        await logAuditEvent(
          adminUser.id,
          'feedback_updated',
          { feedbackId: id, ticketNumber: feedback.ticketNumber, changes: data, previousStatus },
          id,
        );
      } catch {
        // ignore
      }

      return NextResponse.json({ success: true, feedback: updated });
    } catch (err) {
      console.error('[Admin Feedback] PATCH error:', err);
      return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 });
    }
  });
}

// ─── GET /api/admin/feedback/[id] — admin detail view ─────────────

export async function GET(request: NextRequest) {
  return withAdmin(request, async () => {
    try {
      const id = request.nextUrl.pathname.split('/').pop();

      const feedback = await db.feedbackReport.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true, name: true, avatar: true } },
          comments: { orderBy: { createdAt: 'asc' } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!feedback) {
        return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
      }

      return NextResponse.json({ feedback });
    } catch (err) {
      console.error('[Admin Feedback] GET detail error:', err);
      return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 });
    }
  });
}
