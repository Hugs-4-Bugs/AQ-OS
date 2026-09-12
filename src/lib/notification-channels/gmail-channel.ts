// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail Notification Channel
// Sends notification emails via Gmail API (primary) or SMTP (fallback)
//
// Rules:
// - NEVER throw unhandled — always try/catch
// - Rate limited: max 10 notification emails per hour per user
// - Prefer Gmail API via gmail-delivery-service when user has active account
// - Fallback to SMTP/Resend via email.ts sendEmail()
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── Rate Limiting: 10 emails per hour per user ──────────────────────

const MAX_EMAILS_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const rateLimitBuckets: Map<string, number[]> = new Map();

function checkChannelRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitBuckets.get(userId) || [];

  const recent = timestamps.filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MAX_EMAILS_PER_HOUR) {
    return false; // rate-limited
  }

  recent.push(now);
  rateLimitBuckets.set(userId, recent);
  return true;
}

// Clean up stale entries every 10 minutes
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of Array.from(rateLimitBuckets.entries())) {
    const recent = timestamps.filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      rateLimitBuckets.delete(key);
    } else {
      rateLimitBuckets.set(key, recent);
    }
  }
}, 600_000);
if (cleanup && typeof cleanup.unref === 'function') cleanup.unref();

// ── HTML Email Builder ──────────────────────────────────────────────

function buildNotificationHtml(
  title: string,
  message: string,
  actionUrl?: string | null,
  leadName?: string,
): string {
  const actionButton = actionUrl
    ? `<div style="margin: 24px 0; text-align: center;">
         <a href="${actionUrl}" target="_blank" rel="noopener noreferrer"
            style="display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 36px; border-radius: 8px;">
           Take Action
         </a>
       </div>`
    : '';

  const leadTag = leadName
    ? `<p style="margin:0 0 8px 0; font-size:13px; color:#64748b;">Related to: <strong>${leadName}</strong></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0; padding:0; background-color:#f0fdfa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0fdfa; padding:32px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#0d9488 0%,#0f766e 100%); padding:24px 40px; text-align:center;">
              <h1 style="margin:0; font-size:20px; font-weight:700; color:#ffffff;">AcquisitionOS</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h2 style="margin:0 0 16px 0; font-size:18px; font-weight:600; color:#0f766e;">${title}</h2>
              ${leadTag}
              <p style="margin:0 0 8px 0; font-size:15px; line-height:24px; color:#1e293b;">${message}</p>
              ${actionButton}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; margin-top:16px;">
          <tr>
            <td style="padding:16px 24px; text-align:center; font-size:12px; color:#64748b;">
              &copy; ${new Date().getFullYear()} AcquisitionOS. You received this because you have email notifications enabled.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Public interface ────────────────────────────────────────────────

export interface GmailChannelParams {
  userId: string;
  title: string;
  message: string;
  type: string;
  actionUrl?: string;
  leadName?: string;
  emailData?: { to: string; subject: string; body: string };
}

export interface GmailChannelResult {
  sent: boolean;
  method: 'gmail_api' | 'smtp' | 'resend' | 'none';
  error?: string;
}

/**
 * Send a notification email via Gmail API (if user has active account)
 * or fall back to SMTP/Resend.
 */
export async function sendGmailNotification(
  params: GmailChannelParams,
): Promise<GmailChannelResult> {
  const { userId, title, message, type, actionUrl, leadName, emailData } = params;

  try {
    // Rate limit check
    if (!checkChannelRateLimit(userId)) {
      console.warn(`[GmailChannel] Rate limit exceeded for user ${userId} (max ${MAX_EMAILS_PER_HOUR}/hr)`);
      return { sent: false, method: 'none', error: 'Rate limit exceeded' };
    }

    // Get user email
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      return { sent: false, method: 'none', error: 'User email not found' };
    }

    const toEmail = emailData?.to || user.email;
    const subject = emailData?.subject || `[AcquisitionOS] ${title}`;
    const bodyText = emailData?.body || (message + (actionUrl ? `\n\nTake action: ${actionUrl}` : ''));
    const htmlBody = buildNotificationHtml(title, message, actionUrl, leadName);

    // Strategy 1: Try Gmail API via gmail-delivery-service
    const emailAccount = await db.emailAccount.findFirst({
      where: { userId, status: 'active' },
      select: { id: true, gmailEmail: true, status: true },
    });

    if (emailAccount) {
      try {
        const { sendEmail } = await import('@/lib/gmail-delivery-service');
        const result = await sendEmail(emailAccount.id, {
          to: toEmail,
          subject,
          body: bodyText,
          html: htmlBody,
        });

        if (result.success) {
          console.log(`[GmailChannel] Sent via Gmail API to ${toEmail}`);
          return { sent: true, method: 'gmail_api' };
        }

        console.warn(`[GmailChannel] Gmail API send failed: ${result.error}, falling back`);
      } catch (gmailErr) {
        console.warn(`[GmailChannel] Gmail API error, falling back:`, gmailErr instanceof Error ? gmailErr.message : gmailErr);
      }
    }

    // Strategy 2: Try SMTP / Resend via email.ts sendEmail
    try {
      const { sendEmail: sendSmtpEmail } = await import('@/lib/email');
      const result = await sendSmtpEmail({
        to: toEmail,
        subject,
        html: htmlBody,
        text: bodyText,
      });

      if (result.sent) {
        const method = result.devMode ? 'none' : 'smtp';
        console.log(`[GmailChannel] Sent via SMTP/Resend to ${toEmail} (devMode=${!!result.devMode})`);
        return { sent: true, method: method as 'smtp' | 'resend' };
      }

      console.warn(`[GmailChannel] SMTP send failed: ${result.error}`);
      return { sent: false, method: 'none', error: result.error || 'SMTP send failed' };
    } catch (smtpErr) {
      const errorMsg = smtpErr instanceof Error ? smtpErr.message : 'Unknown error';
      console.error(`[GmailChannel] SMTP fallback failed:`, errorMsg);
      return { sent: false, method: 'none', error: errorMsg };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GmailChannel] Fatal error for user ${userId}:`, errorMsg);
    return { sent: false, method: 'none', error: errorMsg };
  }
}
