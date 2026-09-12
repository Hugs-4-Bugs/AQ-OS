// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Feedback Admin Email (delivery-guaranteed layer)
//
// Guarantees every feedback / bug report reaches the admin inbox:
//   1. The DB record is ALWAYS persisted first (source of truth —
//      nothing is ever lost even if every email attempt fails).
//   2. The admin email is attempted up to 3 times with backoff
//      (0ms → 1.5s → 4s) so transient SMTP hiccups don't drop it.
//   3. Delivery status is tracked on the record's `tags` JSON field
//      (email-sent:<iso> / email-failed:<iso>) so failures are
//      visible and auditable instead of silently swallowed.
//   4. retryFailedAdminEmails() re-sends anything tagged as failed —
//      invoked opportunistically on each new submission and via the
//      POST /api/feedback/retry-emails cron endpoint, giving
//      eventual-delivery with zero data loss.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';

export const EMAIL_SENT_TAG = 'email-sent';
export const EMAIL_FAILED_TAG = 'email-failed';

/** Backoff schedule between admin-email attempts (ms). */
const RETRY_BACKOFF_MS = [0, 1500, 4000];

/** Max tags kept on a record (prevents unbounded growth across retries). */
const MAX_TAGS = 8;

type AttachmentInfo = { url?: string; name?: string; type?: string; size?: number };

type FeedbackRecord = {
  id: string;
  ticketNumber: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  pageUrl?: string | null;
  browserName?: string | null;
  browserVersion?: string | null;
  osName?: string | null;
  attachments?: unknown;
  tags?: unknown;
};

type SenderUser = { id: string; email: string; name?: string | null };

// ─── Tag helpers ───────────────────────────────────────────────────

export function readTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.filter((t): t is string => typeof t === 'string');
  return [];
}

async function appendTag(feedbackId: string, tag: string): Promise<void> {
  try {
    const rec = await db.feedbackReport.findUnique({
      where: { id: feedbackId },
      select: { tags: true },
    });
    const next = [...readTags(rec?.tags), tag].slice(-MAX_TAGS);
    await db.feedbackReport.update({
      where: { id: feedbackId },
      data: { tags: next as never },
    });
  } catch (err) {
    // Tag bookkeeping must never break the email flow itself
    console.warn('[FeedbackEmail] tag update failed:', err);
  }
}

// ─── Email body builders ───────────────────────────────────────────

function buildAdminEmail(feedback: FeedbackRecord, user: SenderUser, appUrl: string) {
  const attachments = (Array.isArray(feedback.attachments) ? feedback.attachments : []) as AttachmentInfo[];
  const hasAttachments = attachments.length > 0;

  const attachmentRows = hasAttachments
    ? attachments
        .map(
          (a) =>
            `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;color:#666;">${a.type === 'video' ? 'Video' : 'Image'}</td><td style="padding:4px 0;"><a href="${a.url?.startsWith('http') ? a.url : appUrl + (a.url || '')}" style="color:#0d9488;text-decoration:none;font-family:monospace;">${a.name || 'attachment'}</a> <span style="color:#999;font-size:11px;">(${a.size ? Math.round(a.size / 1024) : 0} KB)</span></td></tr>`,
        )
        .join('')
    : '';

  const subject = `[FEEDBACK][${feedback.severity}] ${feedback.ticketNumber} — ${feedback.title}`;

  const text = `New feedback submitted.\n\nTicket: ${feedback.ticketNumber}\nUser: ${user.email}\nType: ${feedback.type}\nSeverity: ${feedback.severity}\nTitle: ${feedback.title}\n\nDescription:\n${feedback.description}\n\n${
    hasAttachments
      ? `Attachments (${attachments.length}):\n${attachments
          .map(
            (a) =>
              `- ${a.name} (${a.size ? Math.round(a.size / 1024) : 0} KB) ${a.url?.startsWith('http') ? a.url : appUrl + (a.url || '')}`,
          )
          .join('\n')}\n\n`
      : ''
  }Page: ${feedback.pageUrl || 'n/a'}\nBrowser: ${feedback.browserName || 'n/a'} ${feedback.browserVersion || ''}\nOS: ${feedback.osName || 'n/a'}\n\n— AcquisitionOS`;

  const html = `<div style="font-family: -apple-system, sans-serif; max-width: 640px; margin: 0 auto;">
<h2 style="color: #0d9488;">New Feedback Submitted</h2>
<table style="border-collapse: collapse; margin: 12px 0;">
<tr><td style="padding: 4px 12px 4px 0; color: #666;">Ticket:</td><td style="padding: 4px 0;"><strong style="font-family: monospace;">${feedback.ticketNumber}</strong></td></tr>
<tr><td style="padding: 4px 12px 4px 0; color: #666;">User:</td><td style="padding: 4px 0;">${user.email}</td></tr>
<tr><td style="padding: 4px 12px 4px 0; color: #666;">Type:</td><td style="padding: 4px 0;">${feedback.type}</td></tr>
<tr><td style="padding: 4px 12px 4px 0; color: #666;">Severity:</td><td style="padding: 4px 0;">${feedback.severity}</td></tr>
<tr><td style="padding: 4px 12px 4px 0; color: #666;">Page:</td><td style="padding: 4px 0;">${feedback.pageUrl || 'n/a'}</td></tr>
<tr><td style="padding: 4px 12px 4px 0; color: #666;">Browser:</td><td style="padding: 4px 0;">${feedback.browserName || 'n/a'} ${feedback.browserVersion || ''}</td></tr>
<tr><td style="padding: 4px 12px 4px 0; color: #666;">OS:</td><td style="padding: 4px 0;">${feedback.osName || 'n/a'}</td></tr>
</table>
<h3 style="margin-top: 20px;">${feedback.title}</h3>
<p style="white-space: pre-wrap;">${feedback.description}</p>
${hasAttachments ? `<h4 style="margin-top:20px;color:#0d9488;">Attachments (${attachments.length})</h4><table style="border-collapse:collapse;margin:8px 0;">${attachmentRows}</table>` : ''}
</div>`;

  return { subject, text, html };
}

// ─── Core delivery with retries + status tracking ──────────────────

/**
 * Attempt to deliver the admin notification email for a feedback report.
 * Retries up to 3 times with backoff. On final failure the record is
 * tagged `email-failed:<iso>` so retryFailedAdminEmails() can pick it
 * up later — the report itself is never lost (it is already in the DB).
 */
export async function deliverFeedbackAdminEmail(
  feedback: FeedbackRecord,
  user: SenderUser,
  appUrl: string,
): Promise<{ sent: boolean; error?: string }> {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  if (!adminEmail) {
    console.error('[FeedbackEmail] No ADMIN_EMAIL/SMTP_USER configured — admin notification impossible');
    await appendTag(feedback.id, `${EMAIL_FAILED_TAG}:no-admin-config:${new Date().toISOString()}`);
    return { sent: false, error: 'no-admin-email-configured' };
  }

  const { subject, text, html } = buildAdminEmail(feedback, user, appUrl);

  let lastError = '';
  for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length; attempt++) {
    const delay = RETRY_BACKOFF_MS[attempt];
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      const result = await sendEmail({ to: adminEmail, subject, text, html });
      if (result.sent) {
        console.log(`[FeedbackEmail] ✓ Admin email delivered for ${feedback.ticketNumber} (attempt ${attempt + 1})`);
        await appendTag(feedback.id, `${EMAIL_SENT_TAG}:${new Date().toISOString()}`);
        return { sent: true };
      }
      lastError = result.error || 'provider-returned-not-sent';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    console.warn(`[FeedbackEmail] attempt ${attempt + 1}/${RETRY_BACKOFF_MS.length} failed for ${feedback.ticketNumber}: ${lastError}`);
  }

  console.error('[FeedbackEmail] ✗ Admin email FAILED after all retries — feedback NOT lost (saved in DB, tagged for retry):', {
    ticketNumber: feedback.ticketNumber,
    feedbackId: feedback.id,
    error: lastError,
  });
  await appendTag(feedback.id, `${EMAIL_FAILED_TAG}:${new Date().toISOString()}`);
  return { sent: false, error: lastError };
}

// ─── Retry sweep for previously-failed deliveries ──────────────────

function latestEmailTagIsFailed(tags: string[]): boolean {
  const stamped = tags
    .map((t) => {
      const idx = t.indexOf(':');
      const kind = idx === -1 ? t : t.slice(0, idx);
      const ts = idx === -1 ? '' : t.slice(idx + 1);
      return { kind, ts };
    })
    .filter((t) => (t.kind === EMAIL_SENT_TAG || t.kind === EMAIL_FAILED_TAG) && !isNaN(Date.parse(t.ts)))
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  if (stamped.length === 0) return false;
  return stamped[stamped.length - 1].kind === EMAIL_FAILED_TAG;
}

/**
 * Re-send admin notification emails for feedback reports whose latest
 * delivery attempt failed. Called opportunistically on new submissions
 * and via POST /api/feedback/retry-emails (cron). Safe to run often —
 * only records whose LATEST status is failed are retried.
 */
export async function retryFailedAdminEmails(limit = 10): Promise<{ retried: number; sent: number }> {
  // SQLite Prisma cannot filter inside Json columns — scan recent records
  const recent = await db.feedbackReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  const failed = recent.filter((f) => latestEmailTagIsFailed(readTags(f.tags))).slice(0, limit);

  let sent = 0;
  for (const f of failed) {
    const appUrl = process.env.APP_PUBLIC_URL || '';
    const res = await deliverFeedbackAdminEmail(f, f.user, appUrl);
    if (res.sent) sent++;
  }

  if (failed.length > 0) {
    console.log(`[FeedbackEmail] retry sweep: ${failed.length} queued, ${sent} delivered`);
  }
  return { retried: failed.length, sent };
}
