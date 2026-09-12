// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Email Automation Service
// Professional HTML email templates for meeting lifecycle events:
// - Confirmation emails with join links
// - Update notifications
// - Cancellation notices
// - Reminder emails
// - User notifications (calendar sync + CRM linkage)
// - Approval request emails (AI-suggested meetings)
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { getAppUrl } from '@/lib/app-url';

// ═══════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

/** Parameters for sending meeting confirmation to client */
export interface MeetingConfirmationParams {
  meetingId: string;
  clientEmail: string;
  clientName: string;
  meetingTitle: string;
  meetingUrl?: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  durationMinutes: number;
  platform: string;
  location?: string;
  agenda?: string;
  hostName: string;
  hostCompany?: string;
}

/** Parameters for sending meeting update to client */
export interface MeetingUpdateParams {
  meetingId: string;
  clientEmail: string;
  clientName: string;
  meetingTitle: string;
  meetingUrl?: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  durationMinutes: number;
  platform: string;
  location?: string;
  hostName: string;
  changes: string[];
}

/** Parameters for sending meeting cancellation to client */
export interface MeetingCancellationParams {
  meetingId: string;
  clientEmail: string;
  clientName: string;
  meetingTitle: string;
  originalStartDateTime: Date;
  originalTimezone: string;
  hostName: string;
  reason?: string;
  rescheduleUrl?: string;
}

/** Parameters for sending meeting reminder to client */
export interface MeetingReminderParams {
  meetingId: string;
  clientEmail: string;
  clientName: string;
  meetingTitle: string;
  meetingUrl?: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  durationMinutes: number;
  platform: string;
  location?: string;
  hostName: string;
  minutesUntilMeeting: number;
}

/** Parameters for sending notification to user */
export interface MeetingUserNotificationParams {
  userId: string;
  meetingId: string;
  meetingTitle: string;
  leadName?: string;
  leadId?: string;
  startDateTime: Date;
  timezone: string;
  platform: string;
  meetingUrl?: string;
  calendarSynced: boolean;
  crmLinked: boolean;
}

/** Parameters for approval request email */
export interface MeetingApprovalRequestParams {
  userId: string;
  meetingId: string;
  meetingTitle: string;
  leadName?: string;
  leadId?: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  durationMinutes: number;
  platform: string;
  suggestedBy: string; // 'ai' | 'user'
  reason: string;
  clientEmail?: string;
  clientName?: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[MeetingEmail]';

const BRAND_COLOR = '#0d9488';
const BRAND_COLOR_LIGHT = '#14b8a6';
const BRAND_BG = '#f0fdfa';
const BRAND_DARK = '#0f766e';
const TEXT_PRIMARY = '#1e293b';
const TEXT_SECONDARY = '#64748b';

// ═══════════════════════════════════════════════════════════════════
// HTML TEMPLATE HELPERS
// ═══════════════════════════════════════════════════════════════════

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function baseHtml(body: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>AcquisitionOS</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; background-color: ${BRAND_BG}; }
    a { color: ${BRAND_COLOR}; text-decoration: underline; }
    a:hover { color: ${BRAND_DARK}; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${BRAND_BG}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:${TEXT_PRIMARY};">
  <div style="display:none; font-size:1px; color:${BRAND_BG}; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    ${previewText}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND_BG}; padding:32px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); padding:28px 40px; text-align:center;">
              <h1 style="margin:0; font-size:20px; font-weight:700; color:#ffffff; letter-spacing:-0.3px;">AcquisitionOS</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              ${body}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; margin-top:16px;">
          <tr>
            <td style="padding:16px 24px; text-align:center; font-size:12px; line-height:18px; color:${TEXT_SECONDARY};">
              &copy; ${new Date().getFullYear()} AcquisitionOS, Inc. All rights reserved.<br />
              This is an automated message from your meeting scheduler.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function meetingDetailsBlock(params: {
  title: string;
  date: string;
  time: string;
  duration: string;
  timezone: string;
  platform: string;
  location?: string;
  joinUrl?: string;
}): string {
  const joinButton = params.joinUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(params.joinUrl)}" target="_blank" rel="noopener noreferrer"
               style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
              Join Meeting
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 4px 0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
        Or copy this link:
      </p>
      <p style="margin:0 0 16px 0; font-size:13px; line-height:20px; word-break:break-all;">
        <a href="${escapeHtml(params.joinUrl)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND_COLOR};">${escapeHtml(params.joinUrl)}</a>
      </p>`
    : '';

  const locationRow = params.location
    ? `<tr>
        <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
          <strong style="color:${BRAND_DARK};">Location:</strong> ${escapeHtml(params.location)}
        </td>
      </tr>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
    <tr>
      <td style="padding:16px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
              <strong style="color:${BRAND_DARK};">Meeting:</strong> ${escapeHtml(params.title)}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
              <strong style="color:${BRAND_DARK};">Date:</strong> ${escapeHtml(params.date)}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
              <strong style="color:${BRAND_DARK};">Time:</strong> ${escapeHtml(params.time)} (${escapeHtml(params.timezone)})
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
              <strong style="color:${BRAND_DARK};">Duration:</strong> ${escapeHtml(params.duration)}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
              <strong style="color:${BRAND_DARK};">Platform:</strong> ${escapeHtml(params.platform)}
            </td>
          </tr>
          ${locationRow}
        </table>
      </td>
    </tr>
  </table>
  ${joinButton}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(date);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} hour${hours > 1 ? 's' : ''} ${mins} min` : `${hours} hour${hours > 1 ? 's' : ''}`;
}

// ═══════════════════════════════════════════════════════════════════
// 1. SEND MEETING CONFIRMATION TO CLIENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Send a meeting confirmation email to the client with join link.
 *
 * @param params - Meeting confirmation parameters
 * @returns Email send result
 */
export async function sendMeetingConfirmationToClient(
  params: MeetingConfirmationParams
): Promise<{ sent: boolean; error?: string }> {
  console.log(`${LOG_PREFIX} Sending confirmation to client: ${params.clientEmail}`);

  try {
    const platformLabel = getPlatformLabel(params.platform);
    const dashboardUrl = getAppUrl();

    const html = baseHtml(`
      <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
        Hi <strong>${escapeHtml(params.clientName)}</strong>,
      </p>
      <p style="margin:0 0 20px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        Your meeting with <strong>${escapeHtml(params.hostName)}</strong>${params.hostCompany ? ` from ${escapeHtml(params.hostCompany)}` : ''} has been confirmed. Here are the details:
      </p>
      ${meetingDetailsBlock({
        title: params.meetingTitle,
        date: formatDate(params.startDateTime),
        time: `${formatTime(params.startDateTime, params.timezone)} – ${formatTime(params.endDateTime, params.timezone)}`,
        duration: formatDuration(params.durationMinutes),
        timezone: params.timezone,
        platform: platformLabel,
        location: params.location,
        joinUrl: params.meetingUrl,
      })}
      ${params.agenda ? `
      <p style="margin:16px 0 8px 0; font-size:14px; font-weight:600; color:${BRAND_DARK};">Agenda:</p>
      <p style="margin:0 0 20px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">${escapeHtml(params.agenda)}</p>
      ` : ''}
      <p style="margin:20px 0 0 0; font-size:14px; line-height:22px; color:${TEXT_SECONDARY};">
        If you need to reschedule, please reply to this email or contact the meeting host directly.
      </p>
      <p style="margin:16px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        Best regards,<br />
        <strong style="color:${BRAND_COLOR};">${escapeHtml(params.hostName)}</strong>
      </p>
    `, `Meeting confirmed: ${params.meetingTitle}`);

    const text = `Hi ${params.clientName},

Your meeting "${params.meetingTitle}" with ${params.hostName} has been confirmed.

Date: ${formatDate(params.startDateTime)}
Time: ${formatTime(params.startDateTime, params.timezone)} – ${formatTime(params.endDateTime, params.timezone)} (${params.timezone})
Duration: ${formatDuration(params.durationMinutes)}
Platform: ${platformLabel}
${params.meetingUrl ? `Join Link: ${params.meetingUrl}` : ''}
${params.location ? `Location: ${params.location}` : ''}

If you need to reschedule, please reply to this email.

Best regards,
${params.hostName}`;

    const result = await sendEmail({
      to: params.clientEmail,
      subject: `Meeting Confirmed: ${params.meetingTitle}`,
      html,
      text,
    });

    return { sent: result.sent, error: result.error };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending confirmation email:`, error);
    return { sent: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. SEND MEETING UPDATE TO CLIENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Send a meeting update notification to the client.
 *
 * @param params - Meeting update parameters
 * @returns Email send result
 */
export async function sendMeetingUpdateToClient(
  params: MeetingUpdateParams
): Promise<{ sent: boolean; error?: string }> {
  console.log(`${LOG_PREFIX} Sending update to client: ${params.clientEmail}`);

  try {
    const platformLabel = getPlatformLabel(params.platform);

    const changesList = params.changes
      .map((change) => `<li style="margin:4px 0; font-size:14px; color:${TEXT_PRIMARY};">${escapeHtml(change)}</li>`)
      .join('');

    const html = baseHtml(`
      <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
        Hi <strong>${escapeHtml(params.clientName)}</strong>,
      </p>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        There has been an update to your meeting with <strong>${escapeHtml(params.hostName)}</strong>. Please review the changes below:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0; background-color:#fffbeb; border-left:4px solid #f59e0b; border-radius:6px; padding:0;">
        <tr>
          <td style="padding:12px 16px;">
            <p style="margin:0 0 4px 0; font-size:14px; font-weight:600; color:#92400e;">Changes:</p>
            <ul style="margin:0; padding-left:20px;">
              ${changesList}
            </ul>
          </td>
        </tr>
      </table>
      ${meetingDetailsBlock({
        title: params.meetingTitle,
        date: formatDate(params.startDateTime),
        time: `${formatTime(params.startDateTime, params.timezone)} – ${formatTime(params.endDateTime, params.timezone)}`,
        duration: formatDuration(params.durationMinutes),
        timezone: params.timezone,
        platform: platformLabel,
        location: params.location,
        joinUrl: params.meetingUrl,
      })}
      <p style="margin:20px 0 0 0; font-size:14px; line-height:22px; color:${TEXT_SECONDARY};">
        If the new time doesn't work for you, please reply to this email to reschedule.
      </p>
      <p style="margin:16px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        Best regards,<br />
        <strong style="color:${BRAND_COLOR};">${escapeHtml(params.hostName)}</strong>
      </p>
    `, `Meeting updated: ${params.meetingTitle}`);

    const text = `Hi ${params.clientName},

Your meeting "${params.meetingTitle}" with ${params.hostName} has been updated.

Changes:
${params.changes.map((c) => `- ${c}`).join('\n')}

Updated Details:
Date: ${formatDate(params.startDateTime)}
Time: ${formatTime(params.startDateTime, params.timezone)} – ${formatTime(params.endDateTime, params.timezone)} (${params.timezone})
Duration: ${formatDuration(params.durationMinutes)}
Platform: ${platformLabel}
${params.meetingUrl ? `Join Link: ${params.meetingUrl}` : ''}

If the new time doesn't work, please reply to reschedule.

Best regards,
${params.hostName}`;

    const result = await sendEmail({
      to: params.clientEmail,
      subject: `Meeting Updated: ${params.meetingTitle}`,
      html,
      text,
    });

    return { sent: result.sent, error: result.error };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending update email:`, error);
    return { sent: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. SEND MEETING CANCELLATION TO CLIENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Send a meeting cancellation email to the client.
 *
 * @param params - Meeting cancellation parameters
 * @returns Email send result
 */
export async function sendMeetingCancellationToClient(
  params: MeetingCancellationParams
): Promise<{ sent: boolean; error?: string }> {
  console.log(`${LOG_PREFIX} Sending cancellation to client: ${params.clientEmail}`);

  try {
    const rescheduleSection = params.rescheduleUrl
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
          <tr>
            <td align="center">
              <a href="${escapeHtml(params.rescheduleUrl)}" target="_blank" rel="noopener noreferrer"
                 style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px;">
                Reschedule Meeting
              </a>
            </td>
          </tr>
        </table>`
      : '';

    const html = baseHtml(`
      <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
        Hi <strong>${escapeHtml(params.clientName)}</strong>,
      </p>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        Unfortunately, the following meeting with <strong>${escapeHtml(params.hostName)}</strong> has been cancelled:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0; background-color:#fef2f2; border:1px solid #fecaca; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:4px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:#991b1b;">Meeting:</strong> ${escapeHtml(params.meetingTitle)}
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:#991b1b;">Originally scheduled:</strong> ${formatDate(params.originalStartDateTime)} at ${formatTime(params.originalStartDateTime, params.originalTimezone)} (${escapeHtml(params.originalTimezone)})
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      ${params.reason ? `
      <p style="margin:0 0 16px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
        <strong>Reason:</strong> ${escapeHtml(params.reason)}
      </p>
      ` : ''}
      ${rescheduleSection}
      <p style="margin:20px 0 0 0; font-size:14px; line-height:22px; color:${TEXT_SECONDARY};">
        We apologize for any inconvenience. If you'd like to reschedule, please reply to this email or use the button above.
      </p>
      <p style="margin:16px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        Best regards,<br />
        <strong style="color:${BRAND_COLOR};">${escapeHtml(params.hostName)}</strong>
      </p>
    `, `Meeting cancelled: ${params.meetingTitle}`);

    const text = `Hi ${params.clientName},

The following meeting with ${params.hostName} has been cancelled:

Meeting: ${params.meetingTitle}
Originally scheduled: ${formatDate(params.originalStartDateTime)} at ${formatTime(params.originalStartDateTime, params.originalTimezone)} (${params.originalTimezone})
${params.reason ? `Reason: ${params.reason}` : ''}

We apologize for any inconvenience. Please reply to this email if you'd like to reschedule.

Best regards,
${params.hostName}`;

    const result = await sendEmail({
      to: params.clientEmail,
      subject: `Meeting Cancelled: ${params.meetingTitle}`,
      html,
      text,
    });

    return { sent: result.sent, error: result.error };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending cancellation email:`, error);
    return { sent: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. SEND MEETING REMINDER TO CLIENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Send a meeting reminder email to the client.
 *
 * @param params - Meeting reminder parameters
 * @returns Email send result
 */
export async function sendMeetingReminderToClient(
  params: MeetingReminderParams
): Promise<{ sent: boolean; error?: string }> {
  console.log(`${LOG_PREFIX} Sending reminder to client: ${params.clientEmail} (${params.minutesUntilMeeting} min)`);

  try {
    const platformLabel = getPlatformLabel(params.platform);
    const timeLabel = params.minutesUntilMeeting >= 60
      ? `${Math.floor(params.minutesUntilMeeting / 60)} hour${Math.floor(params.minutesUntilMeeting / 60) > 1 ? 's' : ''}`
      : `${params.minutesUntilMeeting} minute${params.minutesUntilMeeting > 1 ? 's' : ''}`;

    const html = baseHtml(`
      <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
        Hi <strong>${escapeHtml(params.clientName)}</strong>,
      </p>
      <p style="margin:0 0 20px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        This is a reminder that your meeting with <strong>${escapeHtml(params.hostName)}</strong> starts in <strong style="color:${BRAND_DARK};">${escapeHtml(timeLabel)}</strong>.
      </p>
      ${meetingDetailsBlock({
        title: params.meetingTitle,
        date: formatDate(params.startDateTime),
        time: `${formatTime(params.startDateTime, params.timezone)} – ${formatTime(params.endDateTime, params.timezone)}`,
        duration: formatDuration(params.durationMinutes),
        timezone: params.timezone,
        platform: platformLabel,
        location: params.location,
        joinUrl: params.meetingUrl,
      })}
      <p style="margin:20px 0 0 0; font-size:14px; line-height:22px; color:${TEXT_SECONDARY};">
        If you can't make it, please reply to let us know.
      </p>
      <p style="margin:16px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        See you soon!<br />
        <strong style="color:${BRAND_COLOR};">${escapeHtml(params.hostName)}</strong>
      </p>
    `, `Reminder: ${params.meetingTitle} starts in ${timeLabel}`);

    const text = `Hi ${params.clientName},

This is a reminder that your meeting "${params.meetingTitle}" with ${params.hostName} starts in ${timeLabel}.

Date: ${formatDate(params.startDateTime)}
Time: ${formatTime(params.startDateTime, params.timezone)} – ${formatTime(params.endDateTime, params.timezone)} (${params.timezone})
Duration: ${formatDuration(params.durationMinutes)}
Platform: ${platformLabel}
${params.meetingUrl ? `Join Link: ${params.meetingUrl}` : ''}
${params.location ? `Location: ${params.location}` : ''}

If you can't make it, please reply to let us know.

See you soon!
${params.hostName}`;

    const result = await sendEmail({
      to: params.clientEmail,
      subject: `Reminder: ${params.meetingTitle} starts in ${timeLabel}`,
      html,
      text,
    });

    return { sent: result.sent, error: result.error };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending reminder email:`, error);
    return { sent: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. SEND MEETING NOTIFICATION TO USER
// ═══════════════════════════════════════════════════════════════════

/**
 * Send a notification to the user about a meeting event.
 * Includes calendar sync status and CRM linkage information.
 *
 * @param params - User notification parameters
 * @returns Email send result
 */
export async function sendMeetingNotificationToUser(
  params: MeetingUserNotificationParams
): Promise<{ sent: boolean; error?: string }> {
  console.log(`${LOG_PREFIX} Sending notification to user: ${params.userId}`);

  try {
    const user = await db.user.findUnique({
      where: { id: params.userId },
      select: { email: true, name: true },
    });

    if (!user) {
      return { sent: false, error: `User ${params.userId} not found` };
    }

    const dashboardUrl = getAppUrl();
    const leadLink = params.leadId
      ? `<a href="${dashboardUrl}/leads/${params.leadId}" style="color:${BRAND_COLOR};">${escapeHtml(params.leadName || 'View Lead')}</a>`
      : '';

    const calendarIcon = params.calendarSynced ? '✅' : '⚠️';
    const crmIcon = params.crmLinked ? '✅' : '⚠️';

    const html = baseHtml(`
      <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
        Hi <strong>${escapeHtml(user.name || 'there')}</strong>,
      </p>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        A meeting has been ${params.calendarSynced ? 'scheduled' : 'created'} on your calendar:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Meeting:</strong> ${escapeHtml(params.meetingTitle)}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Date & Time:</strong> ${formatDate(params.startDateTime)} at ${formatTime(params.startDateTime, params.timezone)}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Platform:</strong> ${escapeHtml(params.platform)}
                </td>
              </tr>
              ${params.leadName ? `<tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Lead:</strong> ${leadLink}
                </td>
              </tr>` : ''}
              ${params.meetingUrl ? `<tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Join Link:</strong> <a href="${escapeHtml(params.meetingUrl)}" style="color:${BRAND_COLOR};">${escapeHtml(params.meetingUrl)}</a>
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
        <tr>
          <td style="padding:12px 16px; background-color:#f0fdf4; border-radius:8px; border:1px solid #bbf7d0;">
            <p style="margin:0 0 4px 0; font-size:14px; color:${TEXT_PRIMARY};">
              ${calendarIcon} <strong>Google Calendar:</strong> ${params.calendarSynced ? 'Synced' : 'Not synced — connect your Google Calendar'}
            </p>
            <p style="margin:0; font-size:14px; color:${TEXT_PRIMARY};">
              ${crmIcon} <strong>CRM Link:</strong> ${params.crmLinked ? `Linked to lead${params.leadName ? `: ${escapeHtml(params.leadName)}` : ''}` : 'No lead linked'}
            </p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
        <tr>
          <td align="center">
            <a href="${dashboardUrl}/meetings/${params.meetingId}" target="_blank" rel="noopener noreferrer"
               style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px;">
              View Meeting Details
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        Cheers,<br />
        <strong style="color:${BRAND_COLOR};">The AcquisitionOS Team</strong>
      </p>
    `, `Meeting notification: ${params.meetingTitle}`);

    const text = `Hi ${user.name || 'there'},

Meeting: ${params.meetingTitle}
Date: ${formatDate(params.startDateTime)} at ${formatTime(params.startDateTime, params.timezone)}
Platform: ${params.platform}
${params.meetingUrl ? `Join Link: ${params.meetingUrl}` : ''}
${params.leadName ? `Lead: ${params.leadName}` : ''}

Calendar: ${params.calendarSynced ? 'Synced' : 'Not synced'}
CRM: ${params.crmLinked ? 'Linked' : 'Not linked'}

View details: ${dashboardUrl}/meetings/${params.meetingId}

— The AcquisitionOS Team`;

    const result = await sendEmail({
      to: user.email,
      subject: `Meeting Scheduled: ${params.meetingTitle}`,
      html,
      text,
    });

    return { sent: result.sent, error: result.error };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending user notification:`, error);
    return { sent: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. SEND MEETING APPROVAL REQUEST
// ═══════════════════════════════════════════════════════════════════

/**
 * Send an approval request email when AI suggests a meeting.
 * Used in approval/assisted autonomy modes.
 *
 * @param params - Approval request parameters
 * @returns Email send result
 */
export async function sendMeetingApprovalRequest(
  params: MeetingApprovalRequestParams
): Promise<{ sent: boolean; error?: string }> {
  console.log(`${LOG_PREFIX} Sending approval request to user: ${params.userId}`);

  try {
    const user = await db.user.findUnique({
      where: { id: params.userId },
      select: { email: true, name: true },
    });

    if (!user) {
      return { sent: false, error: `User ${params.userId} not found` };
    }

    const dashboardUrl = getAppUrl();
    const approveUrl = `${dashboardUrl}/meetings/${params.meetingId}?action=approve`;
    const rejectUrl = `${dashboardUrl}/meetings/${params.meetingId}?action=reject`;
    const suggestedByLabel = params.suggestedBy === 'ai' ? 'AI Assistant' : params.suggestedBy;

    const html = baseHtml(`
      <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
        Hi <strong>${escapeHtml(user.name || 'there')}</strong>,
      </p>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        Your <strong style="color:${BRAND_DARK};">${escapeHtml(suggestedByLabel)}</strong> has suggested scheduling a meeting. Please review and approve or reject:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0; background-color:#eff6ff; border-left:4px solid #3b82f6; border-radius:6px; padding:0;">
        <tr>
          <td style="padding:12px 16px;">
            <p style="margin:0; font-size:14px; color:${TEXT_PRIMARY};">
              <strong>Reason:</strong> ${escapeHtml(params.reason)}
            </p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Meeting:</strong> ${escapeHtml(params.meetingTitle)}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Date & Time:</strong> ${formatDate(params.startDateTime)} at ${formatTime(params.startDateTime, params.timezone)}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Duration:</strong> ${formatDuration(params.durationMinutes)}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Platform:</strong> ${escapeHtml(params.platform)}
                </td>
              </tr>
              ${params.clientName ? `<tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Client:</strong> ${escapeHtml(params.clientName)}${params.clientEmail ? ` (${escapeHtml(params.clientEmail)})` : ''}
                </td>
              </tr>` : ''}
              ${params.leadName ? `<tr>
                <td style="padding:8px 0; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
                  <strong style="color:${BRAND_DARK};">Lead:</strong> ${escapeHtml(params.leadName)}
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
        <tr>
          <td align="center" style="padding:0 8px;">
            <a href="${approveUrl}" target="_blank" rel="noopener noreferrer"
               style="display:inline-block; background:linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 32px; border-radius:8px; margin:0 8px;">
              Approve Meeting
            </a>
          </td>
          <td align="center" style="padding:0 8px;">
            <a href="${rejectUrl}" target="_blank" rel="noopener noreferrer"
               style="display:inline-block; background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 32px; border-radius:8px; margin:0 8px;">
              Reject
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
        This suggestion will expire if not acted upon within 24 hours.
      </p>
      <p style="margin:16px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
        Cheers,<br />
        <strong style="color:${BRAND_COLOR};">The AcquisitionOS Team</strong>
      </p>
    `, `Action required: Approve meeting — ${params.meetingTitle}`);

    const text = `Hi ${user.name || 'there'},

Your ${suggestedByLabel} has suggested a meeting that needs your approval:

Meeting: ${params.meetingTitle}
Date: ${formatDate(params.startDateTime)} at ${formatTime(params.startDateTime, params.timezone)}
Duration: ${formatDuration(params.durationMinutes)}
Platform: ${params.platform}
${params.clientName ? `Client: ${params.clientName}` : ''}
${params.leadName ? `Lead: ${params.leadName}` : ''}

Reason: ${params.reason}

Approve: ${approveUrl}
Reject: ${rejectUrl}

This suggestion will expire in 24 hours.

— The AcquisitionOS Team`;

    const result = await sendEmail({
      to: user.email,
      subject: `Action Required: Approve Meeting — ${params.meetingTitle}`,
      html,
      text,
    });

    return { sent: result.sent, error: result.error };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending approval request:`, error);
    return { sent: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get a human-readable platform label.
 */
function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    google_meet: 'Google Meet',
    zoom: 'Zoom',
    teams: 'Microsoft Teams',
    calendly: 'Calendly',
    custom: 'Custom Link',
    phone: 'Phone Call',
    in_person: 'In Person',
  };
  return labels[platform] || platform;
}
