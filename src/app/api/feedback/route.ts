import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/auth-middleware';
import { createNotification } from '@/lib/notification-service';
import { sendEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/lead-audit';
import { checkRateLimit, FEEDBACK_RATE_LIMIT } from '@/lib/feedback/rate-limiter';
import { triageFeedback } from '@/lib/feedback/ai-triage';
import { getAppUrl } from '@/lib/app-url';
import { deliverFeedbackAdminEmail, retryFailedAdminEmails } from '@/lib/feedback/admin-email';

// ─── Helpers ───────────────────────────────────────────────────────

function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  return `FB-${year}-${random}`;
}

function truncate(s: unknown, max: number): string {
  if (s == null) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

function sanitizeArray(val: unknown, maxItems = 10): unknown[] {
  if (!Array.isArray(val)) return [];
  return val.slice(0, maxItems);
}

// ─── POST /api/feedback ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Rate limit: 10 submissions per user per hour
      const rl = checkRateLimit(
        `feedback:user:${user.id}`,
        FEEDBACK_RATE_LIMIT.limit,
        FEEDBACK_RATE_LIMIT.windowMs,
      );
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. You can submit up to 10 feedback reports per hour.', resetAt: rl.resetAt },
          { status: 429 },
        );
      }

      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }

      const type = truncate(body.type, 50);
      const title = truncate(body.title, 100);
      const description = truncate(body.description, 8000);

      if (!type || !title || !description) {
        return NextResponse.json(
          { error: 'Missing required fields: type, title, description' },
          { status: 400 },
        );
      }

      // Generate unique ticket number
      let ticketNumber = generateTicketNumber();
      for (let i = 0; i < 5; i++) {
        const existing = await db.feedbackReport.findUnique({ where: { ticketNumber } });
        if (!existing) break;
        ticketNumber = generateTicketNumber();
      }

      const feedback = await db.feedbackReport.create({
        data: {
          userId: user.id,
          ticketNumber,
          type,
          title,
          description,
          severity: truncate(body.severity, 20) || 'medium',
          priority: 'medium',
          status: 'new',
          pageUrl: truncate(body.pageUrl, 2000) || null,
          previousPageUrl: truncate(body.previousPageUrl, 2000) || null,
          navigationHistory: sanitizeArray(body.navigationHistory, 5) as never,
          userAgent: truncate(body.userAgent, 500) || null,
          browserName: truncate(body.browserName, 100) || null,
          browserVersion: truncate(body.browserVersion, 50) || null,
          osName: truncate(body.osName, 100) || null,
          osVersion: truncate(body.osVersion, 100) || null,
          screenResolution: truncate(body.screenResolution, 50) || null,
          timezone: truncate(body.timezone, 100) || null,
          locale: truncate(body.locale, 50) || null,
          networkType: truncate(body.networkType, 50) || null,
          appVersion: truncate(body.appVersion, 50) || null,
          sessionId: truncate(body.sessionId, 100) || null,
          lastApiRequests: sanitizeArray(body.lastApiRequests, 10) as never,
          errorLogs: sanitizeArray(body.errorLogs, 20) as never,
          stackTrace: truncate(body.stackTrace, 2000) || null,
          performanceData: (body.performanceData && typeof body.performanceData === 'object'
            ? body.performanceData
            : null) as never,
          attachments: sanitizeArray(body.attachments, 5) as never,
          reproSteps: truncate(body.reproSteps, 4000) || null,
          expectedBehavior: truncate(body.expectedBehavior, 1000) || null,
          actualBehavior: truncate(body.actualBehavior, 1000) || null,
        },
      });

      // Audit log
      try {
        await logAuditEvent(
          user.id,
          'feedback_submitted',
          { ticketNumber, type, severity: feedback.severity, feedbackId: feedback.id },
          feedback.id,
        );
      } catch {
        // ignore
      }

      // Send confirmation email to user (best-effort)
      try {
        await sendEmail({
          to: user.email,
          subject: `[AcquisitionOS] Feedback Received — ${ticketNumber}`,
          text: `Hi ${user.name || 'there'},\n\nYour feedback "${title}" has been received.\nTicket: ${ticketNumber}\nType: ${type}\nSeverity: ${feedback.severity}\n\nWe will update you as the status changes.\n\n— AcquisitionOS Team`,
          html: `<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
<h2 style="color: #0d9488;">Feedback Received</h2>
<p>Hi ${user.name || 'there'},</p>
<p>Your feedback has been received and is now in our queue.</p>
<table style="border-collapse: collapse; margin: 16px 0;">
<tr><td style="padding: 4px 12px 4px 0; color: #666;">Ticket:</td><td style="padding: 4px 0;"><strong style="font-family: monospace; color: #0d9488;">${ticketNumber}</strong></td></tr>
<tr><td style="padding: 4px 12px 4px 0; color: #666;">Title:</td><td style="padding: 4px 0;">${title}</td></tr>
<tr><td style="padding: 4px 12px 4px 0; color: #666;">Type:</td><td style="padding: 4px 0;">${type}</td></tr>
<tr><td style="padding: 4px 12px 4px 0; color: #666;">Severity:</td><td style="padding: 4px 0;">${feedback.severity}</td></tr>
</table>
<p>We'll update you as the status changes. You can view your feedback history in Settings → My Feedback.</p>
<p style="color: #999; font-size: 12px;">— AcquisitionOS Team</p>
</div>`,
        });
      } catch (emailErr) {
        console.warn('[Feedback] Confirmation email failed:', emailErr);
      }

      // Send admin email (delivery-guaranteed layer)
      // FIX (2026-09-09 v2): Moved to src/lib/feedback/admin-email.ts —
      // (a) 3 retry attempts with backoff, (b) attachment names/sizes and
      // CLICKABLE public URLs built from the request's real origin via
      // getAppUrl(request) so screenshots/videos open correctly from the
      // email, (c) delivery status tracked on the record's tags
      // (email-sent/email-failed) and (d) failed deliveries are
      // automatically re-sent by retryFailedAdminEmails(). The feedback
      // record is always persisted first, so nothing is ever lost.
      try {
        await deliverFeedbackAdminEmail(feedback, user, getAppUrl(request));
      } catch (adminEmailErr) {
        console.warn('[Feedback] Admin email setup failed:', adminEmailErr);
      }

      // Piggyback: opportunistically re-send any older reports whose
      // admin email previously failed (non-blocking, capped at 5 per
      // submission so latency stays low). This closes the "email lost"
      // gap — every report eventually lands in the admin inbox.
      setImmediate(() => {
        retryFailedAdminEmails(5).catch((err) =>
          console.error('[Feedback] retry sweep failed:', err),
        );
      });

      // In-app notification to user
      try {
        await createNotification({
          userId: user.id,
          type: 'system',
          title: 'Feedback submitted',
          message: `Feedback submitted successfully. Ticket: ${ticketNumber}`,
          actionUrl: '/dashboard/feedback',
          metadata: { feedbackId: feedback.id, ticketNumber },
        });
      } catch {
        // ignore
      }

      // Run AI triage AFTER response is sent (non-blocking)
      setImmediate(() => {
        triageFeedback(feedback.id, {
          id: feedback.id,
          userId: user.id,
          ticketNumber,
          type,
          title,
          description,
          pageUrl: feedback.pageUrl,
          errorLogs: feedback.errorLogs,
          severity: feedback.severity,
        }).catch((err) => {
          console.error('[Feedback] AI triage failed:', err);
        });
      });

      return NextResponse.json({
        success: true,
        ticketId: feedback.id,
        ticketNumber,
      });
    } catch (err) {
      console.error('[Feedback] POST error:', err);
      return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
    }
  });
}

// ─── GET /api/feedback — list user's feedback ─────────────────────

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const feedback = await db.feedbackReport.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          ticketNumber: true,
          type: true,
          title: true,
          severity: true,
          status: true,
          aiSeverity: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
          _count: { select: { comments: true } },
        },
      });

      const result = feedback.map((f) => ({
        ...f,
        commentCount: f._count.comments,
        _count: undefined,
      }));

      return NextResponse.json({ feedback: result });
    } catch (err) {
      console.error('[Feedback] GET list error:', err);
      return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 });
    }
  });
}
