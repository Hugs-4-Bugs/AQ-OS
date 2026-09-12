// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Email Templates
// Confirmation, link, reminder email templates and send functions
//
// Handles all meeting-related email communication:
// - Client receives: confirmation, link, reminder, cancellation, reschedule
// - User receives: confirmation, calendar sync notification, CRM linkage
//
// Phase 4: Full implementation — uses existing email service (Resend/SMTP)
// ═══════════════════════════════════════════════════════════════════

import { sendEmail, type EmailPayload, type EmailResult } from '@/lib/email';
import { db } from '@/lib/db';

// ===== TYPES =====

/** Meeting email type */
export type MeetingEmailType =
  | 'confirmation'
  | 'link'
  | 'reminder'
  | 'cancellation'
  | 'reschedule'
  | 'user_confirmation'
  | 'user_calendar_sync'
  | 'user_crm_linkage';

/** Meeting email context — data needed to render any meeting email */
export interface MeetingEmailContext {
  meetingId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  meetingLink?: string;
  platform: string;
  leadName?: string;
  leadEmail?: string;
  userName?: string;
  userEmail?: string;
  attendees?: { email: string; name?: string }[];
  cancellationReason?: string;
  rescheduledFrom?: { start: Date; end: Date };
  companyName?: string;
}

/** Meeting email send result */
export interface MeetingEmailResult {
  sent: boolean;
  recipients: string[];
  emailType: MeetingEmailType;
  error?: string;
}

// ===== CONSTANTS =====

const BRAND_COLOR = '#0d9488';
const BRAND_COLOR_LIGHT = '#14b8a6';
const BRAND_BG = '#f0fdfa';
const BRAND_DARK = '#0f766e';
const TEXT_PRIMARY = '#1e293b';
const TEXT_SECONDARY = '#64748b';
const BORDER_COLOR = '#e2e8f0';

// ===== HELPERS =====

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Format a Date in the given timezone as a human-readable string */
function formatDateTime(date: Date, timezone: string): string {
  try {
    return date.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}

/** Format duration between two dates */
function formatDuration(startTime: Date, endTime: Date): string {
  const diffMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  if (diffMinutes < 60) return `${diffMinutes} minutes`;
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  return mins > 0 ? `${hours} hour${hours > 1 ? 's' : ''} ${mins} min` : `${hours} hour${hours > 1 ? 's' : ''}`;
}

/** Shared base HTML wrapper matching existing email.ts style */
function baseHtml(body: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>AcquisitionOS</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
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
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);">
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); padding:32px 40px; text-align:center;">
              <h1 style="margin:0; font-size:22px; font-weight:700; color:#ffffff; letter-spacing:-0.3px;">
                AcquisitionOS
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${body}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; margin-top:16px;">
          <tr>
            <td style="padding:16px 24px; text-align:center; font-size:12px; line-height:18px; color:${TEXT_SECONDARY};">
              &copy; ${new Date().getFullYear()} AcquisitionOS, Inc. All rights reserved.<br />
              This is an automated message — please do not reply directly.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Meeting detail card HTML block */
function meetingDetailCard(context: MeetingEmailContext): string {
  const dateStr = formatDateTime(context.startTime, context.timezone);
  const durationStr = formatDuration(context.startTime, context.endTime);

  let meetLinkHtml = '';
  if (context.meetingLink) {
    meetLinkHtml = `
    <tr>
      <td style="padding:12px 0 0 0; font-size:14px; line-height:22px;">
        <strong style="color:${BRAND_DARK};">Meeting Link:</strong>
        <a href="${escapeHtml(context.meetingLink)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND_COLOR}; word-break:break-all;">
          ${escapeHtml(context.meetingLink)}
        </a>
      </td>
    </tr>`;
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0; background-color:#f8fafc; border:1px solid ${BORDER_COLOR}; border-radius:8px; overflow:hidden;">
    <tr>
      <td style="padding:20px; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:0 0 12px 0; font-size:16px; font-weight:600; color:${BRAND_DARK};">
              ${escapeHtml(context.title)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 6px 0; font-size:14px;">
              <strong style="color:${BRAND_DARK};">Date &amp; Time:</strong> ${escapeHtml(dateStr)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 6px 0; font-size:14px;">
              <strong style="color:${BRAND_DARK};">Duration:</strong> ${escapeHtml(durationStr)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 6px 0; font-size:14px;">
              <strong style="color:${BRAND_DARK};">Timezone:</strong> ${escapeHtml(context.timezone)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 6px 0; font-size:14px;">
              <strong style="color:${BRAND_DARK};">Platform:</strong> ${escapeHtml(context.platform)}
            </td>
          </tr>
          ${meetLinkHtml}
        </table>
      </td>
    </tr>
  </table>`;
}

// ===== .ICS GENERATION =====

/**
 * Generate a valid .ics (iCalendar) file content for a meeting.
 * Follows RFC 5545 specification.
 */
export function generateIcsContent(context: MeetingEmailContext): string {
  // Format date/time for iCalendar: YYYYMMDDTHHMMSSZ (UTC)
  const formatIcsDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };

  // Generate a unique UID for the event
  const uid = `meeting-${context.meetingId}@acquisitionos.com`;

  // Current timestamp
  const now = formatIcsDate(new Date());

  // Start and end times
  const dtStart = formatIcsDate(context.startTime);
  const dtEnd = formatIcsDate(context.endTime);

  // Build ATTENDEE lines
  const attendeeLines: string[] = [];
  if (context.leadEmail) {
    attendeeLines.push(`ATTENDEE;CN=${context.leadName || context.leadEmail};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${context.leadEmail}`);
  }
  if (context.userEmail) {
    attendeeLines.push(`ATTENDEE;CN=${context.userName || context.userEmail};ROLE=CHAIR;RSVP=TRUE:mailto:${context.userEmail}`);
  }
  if (context.attendees) {
    for (const att of context.attendees) {
      if (att.email !== context.leadEmail && att.email !== context.userEmail) {
        attendeeLines.push(`ATTENDEE;CN=${att.name || att.email};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${att.email}`);
      }
    }
  }

  // Build description (plain text, escape newlines)
  const description = (context.description || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');

  // Build LOCATION line if meeting link exists
  const locationLine = context.meetingLink
    ? `LOCATION:${context.meetingLink.replace(/;/g, '\\;')}`
    : '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AcquisitionOS//Meeting Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${context.title.replace(/;/g, '\\;').replace(/,/g, '\\,')}`,
    description ? `DESCRIPTION:${description}` : '',
    locationLine,
    `STATUS:CONFIRMED`,
    ...attendeeLines,
    `ORGANIZER;CN=${context.userName || 'AcquisitionOS'}:mailto:${context.userEmail || 'noreply@acquisitionos.com'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  // RFC 5545 requires lines to be max 75 octets — fold long lines
  const foldedLines: string[] = [];
  for (const line of lines) {
    if (line.length <= 75) {
      foldedLines.push(line);
    } else {
      // Fold: first chunk 75 chars, subsequent chunks 74 chars (with leading space)
      let remaining = line;
      foldedLines.push(remaining.substring(0, 75));
      remaining = remaining.substring(75);
      while (remaining.length > 0) {
        foldedLines.push(` ${remaining.substring(0, 74)}`);
        remaining = remaining.substring(74);
      }
    }
  }

  return foldedLines.join('\r\n');
}

// ===== CONTEXT BUILDERS =====

/**
 * Build a MeetingEmailContext from a Meeting database record + Lead.
 * Fetches user info if not provided.
 */
export async function buildMeetingEmailContext(
  meeting: {
    id: string;
    title: string;
    description?: string | null;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    meetingUrl?: string | null;
    platform: string;
    attendees?: string | null;
    cancellationReason?: string | null;
    leadId?: string | null;
    userId: string;
  },
  lead?: {
    ownerName?: string | null;
    email?: string | null;
  } | null,
  user?: {
    name?: string | null;
    email?: string | null;
    company?: string | null;
  } | null,
): Promise<MeetingEmailContext> {
  // Fetch user if not provided
  let resolvedUser = user;
  if (!resolvedUser) {
    resolvedUser = await db.user.findUnique({
      where: { id: meeting.userId },
      select: { name: true, email: true, company: true },
    });
  }

  // Fetch lead if not provided but leadId exists
  let resolvedLead = lead;
  if (!resolvedLead && meeting.leadId) {
    resolvedLead = await db.lead.findUnique({
      where: { id: meeting.leadId },
      select: { ownerName: true, email: true },
    });
  }

  // Parse attendees JSON
  let parsedAttendees: { email: string; name?: string }[] = [];
  try {
    parsedAttendees = meeting.attendees ? JSON.parse(meeting.attendees) : [];
  } catch {
    parsedAttendees = [];
  }

  return {
    meetingId: meeting.id,
    title: meeting.title,
    description: meeting.description || undefined,
    startTime: meeting.startDateTime,
    endTime: meeting.endDateTime,
    timezone: meeting.timezone || 'UTC',
    meetingLink: meeting.meetingUrl || undefined,
    platform: meeting.platform || 'google_meet',
    leadName: resolvedLead?.ownerName || undefined,
    leadEmail: resolvedLead?.email || undefined,
    userName: resolvedUser?.name || undefined,
    userEmail: resolvedUser?.email || undefined,
    attendees: parsedAttendees,
    cancellationReason: meeting.cancellationReason || undefined,
    companyName: resolvedUser?.company || undefined,
  };
}

// ===== CLIENT EMAIL FUNCTIONS =====

/**
 * Send meeting confirmation email to the client/lead.
 * Includes meeting details, time, video link, and .ics calendar attachment.
 */
export async function sendConfirmationEmail(
  context: MeetingEmailContext
): Promise<MeetingEmailResult> {
  const recipientEmail = context.leadEmail;
  if (!recipientEmail) {
    return { sent: false, recipients: [], emailType: 'confirmation', error: 'No lead email provided' };
  }

  const dateStr = formatDateTime(context.startTime, context.timezone);
  const durationStr = formatDuration(context.startTime, context.endTime);
  const preview = `Meeting confirmed: ${context.title} on ${dateStr}`;

  // Generate .ics attachment
  const icsContent = generateIcsContent(context);

  const html = baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.leadName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Your meeting has been confirmed. Here are the details:
    </p>
    ${meetingDetailCard(context)}
    ${context.description ? `
    <p style="margin:16px 0 0 0; font-size:14px; line-height:22px; color:${TEXT_SECONDARY};">
      <strong>Agenda:</strong> ${escapeHtml(context.description)}
    </p>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(context.meetingLink || '#')}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
            Join Meeting
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      A calendar invite (.ics) is attached to this email. Open it to add the meeting to your calendar.
    </p>
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">${escapeHtml(context.userName || context.companyName || 'The AcquisitionOS Team')}</strong>
    </p>
  `, preview);

  const text = `Hi ${context.leadName || 'there'},

Your meeting has been confirmed.

Title: ${context.title}
Date & Time: ${dateStr}
Duration: ${durationStr}
Timezone: ${context.timezone}
Platform: ${context.platform}
${context.meetingLink ? `Meeting Link: ${context.meetingLink}` : ''}
${context.description ? `Agenda: ${context.description}` : ''}

A calendar invite (.ics) is attached to this email.

— ${context.userName || context.companyName || 'The AcquisitionOS Team'}`;

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject: `Meeting Confirmed: ${context.title}`,
      html,
      text,
      attachments: [
        {
          filename: 'meeting.ics',
          content: icsContent,
          contentType: 'text/calendar; method=REQUEST',
        },
      ],
    });

    return {
      sent: result.sent,
      recipients: [recipientEmail],
      emailType: 'confirmation',
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error sending confirmation email';
    console.error('[MeetingEmail] sendConfirmationEmail failed:', msg);
    return { sent: false, recipients: [recipientEmail], emailType: 'confirmation', error: msg };
  }
}

/**
 * Send meeting link email to the client/lead.
 * Used when the meeting link is generated after the initial confirmation.
 */
export async function sendMeetingLinkEmail(
  context: MeetingEmailContext
): Promise<MeetingEmailResult> {
  const recipientEmail = context.leadEmail;
  if (!recipientEmail) {
    return { sent: false, recipients: [], emailType: 'link', error: 'No lead email provided' };
  }
  if (!context.meetingLink) {
    return { sent: false, recipients: [recipientEmail], emailType: 'link', error: 'No meeting link provided' };
  }

  const preview = `Your meeting link for: ${context.title}`;

  const html = baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.leadName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 20px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Your meeting link is ready! Click the button below to join at the scheduled time.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(context.meetingLink)}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
            Join ${escapeHtml(context.platform)} Meeting
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px 0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      If the button doesn't work, copy and paste this URL:
    </p>
    <p style="margin:0; font-size:13px; line-height:20px; word-break:break-all;">
      <a href="${escapeHtml(context.meetingLink)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND_COLOR};">${escapeHtml(context.meetingLink)}</a>
    </p>
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">${escapeHtml(context.userName || context.companyName || 'The AcquisitionOS Team')}</strong>
    </p>
  `, preview);

  const text = `Hi ${context.leadName || 'there'},

Your meeting link for "${context.title}" is ready: ${context.meetingLink}

— ${context.userName || context.companyName || 'The AcquisitionOS Team'}`;

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject: `Your Meeting Link: ${context.title}`,
      html,
      text,
    });
    return {
      sent: result.sent,
      recipients: [recipientEmail],
      emailType: 'link',
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { sent: false, recipients: [recipientEmail], emailType: 'link', error: msg };
  }
}

/**
 * Send meeting reminder email to the client/lead.
 * Sent N minutes before the meeting (configurable).
 */
export async function sendReminderEmail(
  context: MeetingEmailContext,
  minutesBefore: number
): Promise<MeetingEmailResult> {
  const recipientEmail = context.leadEmail;
  if (!recipientEmail) {
    return { sent: false, recipients: [], emailType: 'reminder', error: 'No lead email provided' };
  }

  const dateStr = formatDateTime(context.startTime, context.timezone);
  let timeLabel: string;
  if (minutesBefore >= 1440) {
    timeLabel = `${Math.round(minutesBefore / 1440)} day(s)`;
  } else if (minutesBefore >= 60) {
    timeLabel = `${Math.round(minutesBefore / 60)} hour(s)`;
  } else {
    timeLabel = `${minutesBefore} minute(s)`;
  }
  const preview = `Reminder: ${context.title} starts in ${timeLabel}`;

  const html = baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.leadName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      This is a reminder that your meeting is coming up in <strong>${escapeHtml(timeLabel)}</strong>.
    </p>
    ${meetingDetailCard(context)}
    ${context.meetingLink ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(context.meetingLink)}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
            Join Meeting
          </a>
        </td>
      </tr>
    </table>` : ''}
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">${escapeHtml(context.userName || context.companyName || 'The AcquisitionOS Team')}</strong>
    </p>
  `, preview);

  const text = `Hi ${context.leadName || 'there'},

This is a reminder that your meeting "${context.title}" is in ${timeLabel}.

Date & Time: ${dateStr}
Timezone: ${context.timezone}
Platform: ${context.platform}
${context.meetingLink ? `Meeting Link: ${context.meetingLink}` : ''}

— ${context.userName || context.companyName || 'The AcquisitionOS Team'}`;

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject: `Reminder: ${context.title} in ${timeLabel}`,
      html,
      text,
    });
    return {
      sent: result.sent,
      recipients: [recipientEmail],
      emailType: 'reminder',
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { sent: false, recipients: [recipientEmail], emailType: 'reminder', error: msg };
  }
}

/**
 * Send meeting cancellation email to the client/lead.
 */
export async function sendCancellationEmail(
  context: MeetingEmailContext
): Promise<MeetingEmailResult> {
  const recipientEmail = context.leadEmail;
  if (!recipientEmail) {
    return { sent: false, recipients: [], emailType: 'cancellation', error: 'No lead email provided' };
  }

  const dateStr = formatDateTime(context.startTime, context.timezone);
  const preview = `Meeting cancelled: ${context.title}`;

  const reasonBlock = context.cancellationReason
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      <tr>
        <td style="background-color:#fef2f2; border-left:4px solid #ef4444; border-radius:6px; padding:12px 16px;">
          <p style="margin:0; font-size:13px; line-height:20px; color:#991b1b;">
            <strong>Reason:</strong> ${escapeHtml(context.cancellationReason)}
          </p>
        </td>
      </tr>
    </table>`
    : '';

  const html = baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.leadName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      We're writing to let you know that the following meeting has been <strong style="color:#ef4444;">cancelled</strong>:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0; background-color:#f8fafc; border:1px solid ${BORDER_COLOR}; border-radius:8px; overflow:hidden;">
      <tr>
        <td style="padding:20px; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
          <strong style="color:${BRAND_DARK};">${escapeHtml(context.title)}</strong><br />
          ${escapeHtml(dateStr)}<br />
          ${escapeHtml(context.timezone)}
        </td>
      </tr>
    </table>
    ${reasonBlock}
    <p style="margin:16px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      We apologize for any inconvenience. Please reach out if you'd like to reschedule.
    </p>
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">${escapeHtml(context.userName || context.companyName || 'The AcquisitionOS Team')}</strong>
    </p>
  `, preview);

  const text = `Hi ${context.leadName || 'there'},

The following meeting has been cancelled:

Title: ${context.title}
Date & Time: ${dateStr}
Timezone: ${context.timezone}
${context.cancellationReason ? `Reason: ${context.cancellationReason}` : ''}

We apologize for any inconvenience. Please reach out if you'd like to reschedule.

— ${context.userName || context.companyName || 'The AcquisitionOS Team'}`;

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject: `Meeting Cancelled: ${context.title}`,
      html,
      text,
    });
    return {
      sent: result.sent,
      recipients: [recipientEmail],
      emailType: 'cancellation',
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { sent: false, recipients: [recipientEmail], emailType: 'cancellation', error: msg };
  }
}

/**
 * Send meeting reschedule email to the client/lead.
 */
export async function sendRescheduleEmail(
  context: MeetingEmailContext
): Promise<MeetingEmailResult> {
  const recipientEmail = context.leadEmail;
  if (!recipientEmail) {
    return { sent: false, recipients: [], emailType: 'reschedule', error: 'No lead email provided' };
  }

  const newDateStr = formatDateTime(context.startTime, context.timezone);
  const preview = `Meeting rescheduled: ${context.title}`;

  const oldTimeBlock = context.rescheduledFrom
    ? `<tr>
        <td style="padding:0 0 8px 0; font-size:14px; color:${TEXT_SECONDARY}; text-decoration:line-through;">
          <strong>Old time:</strong> ${escapeHtml(formatDateTime(context.rescheduledFrom.start, context.timezone))}
        </td>
      </tr>`
    : '';

  // Generate updated .ics
  const icsContent = generateIcsContent(context);

  const html = baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.leadName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Your meeting has been <strong style="color:${BRAND_DARK};">rescheduled</strong>. Here are the updated details:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0; background-color:#f8fafc; border:1px solid ${BORDER_COLOR}; border-radius:8px; overflow:hidden;">
      <tr>
        <td style="padding:20px; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:0 0 12px 0; font-size:16px; font-weight:600; color:${BRAND_DARK};">
                ${escapeHtml(context.title)}
              </td>
            </tr>
            ${oldTimeBlock}
            <tr>
              <td style="padding:0 0 6px 0; font-size:14px;">
                <strong style="color:${BRAND_DARK};">New time:</strong> ${escapeHtml(newDateStr)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 6px 0; font-size:14px;">
                <strong style="color:${BRAND_DARK};">Timezone:</strong> ${escapeHtml(context.timezone)}
              </td>
            </tr>
            ${context.meetingLink ? `<tr>
              <td style="padding:6px 0 0 0; font-size:14px;">
                <strong style="color:${BRAND_DARK};">Meeting Link:</strong>
                <a href="${escapeHtml(context.meetingLink)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND_COLOR}; word-break:break-all;">${escapeHtml(context.meetingLink)}</a>
              </td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
    </table>
    ${context.meetingLink ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(context.meetingLink)}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
            Join Meeting
          </a>
        </td>
      </tr>
    </table>` : ''}
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      An updated calendar invite (.ics) is attached to this email.
    </p>
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">${escapeHtml(context.userName || context.companyName || 'The AcquisitionOS Team')}</strong>
    </p>
  `, preview);

  const text = `Hi ${context.leadName || 'there'},

Your meeting "${context.title}" has been rescheduled.

New Date & Time: ${newDateStr}
Timezone: ${context.timezone}
${context.rescheduledFrom ? `Old Date & Time: ${formatDateTime(context.rescheduledFrom.start, context.timezone)}` : ''}
${context.meetingLink ? `Meeting Link: ${context.meetingLink}` : ''}

An updated calendar invite (.ics) is attached.

— ${context.userName || context.companyName || 'The AcquisitionOS Team'}`;

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject: `Meeting Rescheduled: ${context.title}`,
      html,
      text,
      attachments: [
        {
          filename: 'meeting.ics',
          content: icsContent,
          contentType: 'text/calendar; method=REQUEST',
        },
      ],
    });
    return {
      sent: result.sent,
      recipients: [recipientEmail],
      emailType: 'reschedule',
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { sent: false, recipients: [recipientEmail], emailType: 'reschedule', error: msg };
  }
}

// ===== USER EMAIL FUNCTIONS =====

/**
 * Send meeting confirmation notification to the user (the sales rep).
 * Confirms that the meeting was created and synced to calendar.
 */
export async function sendUserConfirmationEmail(
  context: MeetingEmailContext
): Promise<MeetingEmailResult> {
  const recipientEmail = context.userEmail;
  if (!recipientEmail) {
    return { sent: false, recipients: [], emailType: 'user_confirmation', error: 'No user email provided' };
  }

  const dateStr = formatDateTime(context.startTime, context.timezone);
  const durationStr = formatDuration(context.startTime, context.endTime);
  const preview = `Meeting scheduled: ${context.title} with ${context.leadName || 'lead'}`;

  const html = baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.userName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      A meeting has been successfully scheduled. Here's a summary:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0; background-color:#f0fdfa; border:1px solid ${BRAND_COLOR_LIGHT}; border-radius:8px; overflow:hidden;">
      <tr>
        <td style="padding:20px; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:0 0 12px 0; font-size:16px; font-weight:600; color:${BRAND_DARK};">
                ${escapeHtml(context.title)}
              </td>
            </tr>
            ${context.leadName ? `<tr>
              <td style="padding:0 0 6px 0; font-size:14px;">
                <strong style="color:${BRAND_DARK};">Lead:</strong> ${escapeHtml(context.leadName)}${context.leadEmail ? ` (${escapeHtml(context.leadEmail)})` : ''}
              </td>
            </tr>` : ''}
            <tr>
              <td style="padding:0 0 6px 0; font-size:14px;">
                <strong style="color:${BRAND_DARK};">Date &amp; Time:</strong> ${escapeHtml(dateStr)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 6px 0; font-size:14px;">
                <strong style="color:${BRAND_DARK};">Duration:</strong> ${escapeHtml(durationStr)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 6px 0; font-size:14px;">
                <strong style="color:${BRAND_DARK};">Platform:</strong> ${escapeHtml(context.platform)}
              </td>
            </tr>
            ${context.meetingLink ? `<tr>
              <td style="padding:6px 0 0 0; font-size:14px;">
                <strong style="color:${BRAND_DARK};">Meeting Link:</strong>
                <a href="${escapeHtml(context.meetingLink)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND_COLOR}; word-break:break-all;">${escapeHtml(context.meetingLink)}</a>
              </td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      This meeting has been added to your Google Calendar. A confirmation email has also been sent to the lead.
    </p>
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">The AcquisitionOS Team</strong>
    </p>
  `, preview);

  const text = `Hi ${context.userName || 'there'},

A meeting has been successfully scheduled:

Title: ${context.title}
${context.leadName ? `Lead: ${context.leadName}${context.leadEmail ? ` (${context.leadEmail})` : ''}` : ''}
Date & Time: ${dateStr}
Duration: ${durationStr}
Platform: ${context.platform}
${context.meetingLink ? `Meeting Link: ${context.meetingLink}` : ''}

This meeting has been added to your Google Calendar. A confirmation email has also been sent to the lead.

— The AcquisitionOS Team`;

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject: `Meeting Scheduled: ${context.title} with ${context.leadName || 'Lead'}`,
      html,
      text,
    });
    return {
      sent: result.sent,
      recipients: [recipientEmail],
      emailType: 'user_confirmation',
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { sent: false, recipients: [recipientEmail], emailType: 'user_confirmation', error: msg };
  }
}

/**
 * Send calendar sync notification to the user.
 * Confirms that the meeting was added to their Google Calendar.
 */
export async function sendCalendarSyncNotification(
  context: MeetingEmailContext
): Promise<MeetingEmailResult> {
  const recipientEmail = context.userEmail;
  if (!recipientEmail) {
    return { sent: false, recipients: [], emailType: 'user_calendar_sync', error: 'No user email provided' };
  }

  const preview = `Calendar synced: ${context.title}`;

  const html = baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.userName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      The following meeting has been synced to your Google Calendar:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0; background-color:#f0fdfa; border:1px solid ${BRAND_COLOR_LIGHT}; border-radius:8px; overflow:hidden;">
      <tr>
        <td style="padding:16px 20px; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
          <strong style="color:${BRAND_DARK};">${escapeHtml(context.title)}</strong><br />
          ${escapeHtml(formatDateTime(context.startTime, context.timezone))}<br />
          ${context.leadName ? `With: ${escapeHtml(context.leadName)}` : ''}
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">The AcquisitionOS Team</strong>
    </p>
  `, preview);

  const text = `Hi ${context.userName || 'there'},

The meeting "${context.title}" has been synced to your Google Calendar.

— The AcquisitionOS Team`;

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject: `Calendar Synced: ${context.title}`,
      html,
      text,
    });
    return {
      sent: result.sent,
      recipients: [recipientEmail],
      emailType: 'user_calendar_sync',
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { sent: false, recipients: [recipientEmail], emailType: 'user_calendar_sync', error: msg };
  }
}

/**
 * Send CRM linkage notification to the user.
 * Confirms that the meeting was linked to the lead/deal in CRM.
 */
export async function sendCRMLinkageNotification(
  context: MeetingEmailContext
): Promise<MeetingEmailResult> {
  const recipientEmail = context.userEmail;
  if (!recipientEmail) {
    return { sent: false, recipients: [], emailType: 'user_crm_linkage', error: 'No user email provided' };
  }

  const preview = `CRM updated: ${context.title} linked to ${context.leadName || 'lead'}`;

  const html = baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.userName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      The following meeting has been linked to the lead in your CRM:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0; background-color:#f0fdfa; border:1px solid ${BRAND_COLOR_LIGHT}; border-radius:8px; overflow:hidden;">
      <tr>
        <td style="padding:16px 20px; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
          <strong style="color:${BRAND_DARK};">${escapeHtml(context.title)}</strong><br />
          ${context.leadName ? `Lead: ${escapeHtml(context.leadName)}` : ''}
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">The AcquisitionOS Team</strong>
    </p>
  `, preview);

  const text = `Hi ${context.userName || 'there'},

The meeting "${context.title}" has been linked to the lead "${context.leadName || 'Unknown'}" in your CRM.

— The AcquisitionOS Team`;

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject: `CRM Updated: ${context.title} linked to ${context.leadName || 'Lead'}`,
      html,
      text,
    });
    return {
      sent: result.sent,
      recipients: [recipientEmail],
      emailType: 'user_crm_linkage',
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { sent: false, recipients: [recipientEmail], emailType: 'user_crm_linkage', error: msg };
  }
}

// ===== TEMPLATE BUILDERS (for external use) =====

/**
 * Build the HTML email body for a meeting confirmation.
 * Returns raw HTML string.
 */
export function buildConfirmationEmailHtml(context: MeetingEmailContext): string {
  const preview = `Meeting confirmed: ${context.title}`;
  return baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.leadName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Your meeting has been confirmed.
    </p>
    ${meetingDetailCard(context)}
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">${escapeHtml(context.userName || context.companyName || 'The AcquisitionOS Team')}</strong>
    </p>
  `, preview);
}

/**
 * Build the HTML email body for a meeting reminder.
 * Returns raw HTML string.
 */
export function buildReminderEmailHtml(context: MeetingEmailContext, minutesBefore: number): string {
  let timeLabel: string;
  if (minutesBefore >= 1440) {
    timeLabel = `${Math.round(minutesBefore / 1440)} day(s)`;
  } else if (minutesBefore >= 60) {
    timeLabel = `${Math.round(minutesBefore / 60)} hour(s)`;
  } else {
    timeLabel = `${minutesBefore} minute(s)`;
  }
  const preview = `Reminder: ${context.title} in ${timeLabel}`;
  return baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.leadName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      This is a reminder that your meeting is in <strong>${escapeHtml(timeLabel)}</strong>.
    </p>
    ${meetingDetailCard(context)}
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">${escapeHtml(context.userName || context.companyName || 'The AcquisitionOS Team')}</strong>
    </p>
  `, preview);
}

// ===== CONVENIENCE FUNCTIONS (Task 1 API) =====

/**
 * Send meeting confirmation to the client/lead.
 * Builds context from Meeting + Lead records and sends confirmation email with .ics attachment.
 */
export async function sendMeetingConfirmationToClient(
  meeting: {
    id: string;
    title: string;
    description?: string | null;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    meetingUrl?: string | null;
    platform: string;
    attendees?: string | null;
    cancellationReason?: string | null;
    leadId?: string | null;
    userId: string;
  },
  lead?: { ownerName?: string | null; email?: string | null } | null,
): Promise<MeetingEmailResult> {
  const context = await buildMeetingEmailContext(meeting, lead);
  return sendConfirmationEmail(context);
}

/**
 * Send meeting confirmation to the user (sales rep).
 * Builds context from Meeting + User records and sends internal confirmation.
 */
export async function sendMeetingConfirmationToUser(
  meeting: {
    id: string;
    title: string;
    description?: string | null;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    meetingUrl?: string | null;
    platform: string;
    attendees?: string | null;
    cancellationReason?: string | null;
    leadId?: string | null;
    userId: string;
  },
  user?: { name?: string | null; email?: string | null; company?: string | null } | null,
): Promise<MeetingEmailResult> {
  const context = await buildMeetingEmailContext(meeting, null, user);
  return sendUserConfirmationEmail(context);
}

/**
 * Send meeting reminder to the client/lead.
 * Default triggers: 24h before and 1h before.
 */
export async function sendMeetingReminderToClient(
  meeting: {
    id: string;
    title: string;
    description?: string | null;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    meetingUrl?: string | null;
    platform: string;
    attendees?: string | null;
    leadId?: string | null;
    userId: string;
  },
  lead?: { ownerName?: string | null; email?: string | null } | null,
  minutesBefore: number = 60,
): Promise<MeetingEmailResult> {
  const context = await buildMeetingEmailContext(meeting, lead);
  return sendReminderEmail(context, minutesBefore);
}

/**
 * Send meeting reminder to the user (sales rep).
 */
export async function sendMeetingReminderToUser(
  meeting: {
    id: string;
    title: string;
    description?: string | null;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    meetingUrl?: string | null;
    platform: string;
    attendees?: string | null;
    leadId?: string | null;
    userId: string;
  },
  user?: { name?: string | null; email?: string | null; company?: string | null } | null,
  minutesBefore: number = 60,
): Promise<MeetingEmailResult> {
  const context = await buildMeetingEmailContext(meeting, null, user);
  // Reuse the user confirmation template style for reminder
  const recipientEmail = context.userEmail;
  if (!recipientEmail) {
    return { sent: false, recipients: [], emailType: 'reminder', error: 'No user email provided' };
  }

  let timeLabel: string;
  if (minutesBefore >= 1440) {
    timeLabel = `${Math.round(minutesBefore / 1440)} day(s)`;
  } else if (minutesBefore >= 60) {
    timeLabel = `${Math.round(minutesBefore / 60)} hour(s)`;
  } else {
    timeLabel = `${minutesBefore} minute(s)`;
  }

  const dateStr = formatDateTime(context.startTime, context.timezone);
  const preview = `Reminder: Meeting with ${context.leadName || 'lead'} in ${timeLabel}`;

  const html = baseHtml(`
    <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
      Hi <strong>${escapeHtml(context.userName || 'there')}</strong>,
    </p>
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      This is a reminder that your meeting is coming up in <strong>${escapeHtml(timeLabel)}</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0; background-color:#f0fdfa; border:1px solid ${BRAND_COLOR_LIGHT}; border-radius:8px; overflow:hidden;">
      <tr>
        <td style="padding:20px; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
          <strong style="color:${BRAND_DARK};">${escapeHtml(context.title)}</strong><br />
          ${context.leadName ? `Lead: ${escapeHtml(context.leadName)}<br />` : ''}
          ${escapeHtml(dateStr)}<br />
          ${escapeHtml(context.timezone)}
          ${context.meetingLink ? `<br /><a href="${escapeHtml(context.meetingLink)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND_COLOR};">Join Meeting</a>` : ''}
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Cheers,<br />
      <strong style="color:${BRAND_COLOR};">The AcquisitionOS Team</strong>
    </p>
  `, preview);

  const text = `Hi ${context.userName || 'there'},

Reminder: Your meeting "${context.title}" with ${context.leadName || 'lead'} is in ${timeLabel}.

Date & Time: ${dateStr}
${context.meetingLink ? `Meeting Link: ${context.meetingLink}` : ''}

— The AcquisitionOS Team`;

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject: `Reminder: ${context.title} in ${timeLabel}`,
      html,
      text,
    });
    return {
      sent: result.sent,
      recipients: [recipientEmail],
      emailType: 'reminder',
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { sent: false, recipients: [recipientEmail], emailType: 'reminder', error: msg };
  }
}

/**
 * Send meeting cancellation to the client/lead.
 * Includes reason if available.
 */
export async function sendMeetingCancellationToClient(
  meeting: {
    id: string;
    title: string;
    description?: string | null;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    meetingUrl?: string | null;
    platform: string;
    attendees?: string | null;
    cancellationReason?: string | null;
    leadId?: string | null;
    userId: string;
  },
  lead?: { ownerName?: string | null; email?: string | null } | null,
): Promise<MeetingEmailResult> {
  const context = await buildMeetingEmailContext(meeting, lead);
  return sendCancellationEmail(context);
}
