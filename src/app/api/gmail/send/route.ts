// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail Send
// POST /api/gmail/send
// Sends an email via Gmail API and optionally records it in the DB
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { getValidGmailAccessToken, base64urlEncode } from '@/lib/google-oauth';

interface SendEmailBody {
  to: string;
  subject: string;
  body: string;
  leadId?: string;
}

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body: SendEmailBody = await request.json();
      const { to, subject, body: emailBody, leadId } = body;

      // Validate required fields
      if (!to || !subject || !emailBody) {
        return NextResponse.json(
          { error: 'Missing required fields: to, subject, body' },
          { status: 400 }
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        return NextResponse.json(
          { error: 'Invalid recipient email address' },
          { status: 400 }
        );
      }

      // Get valid Gmail access token (refreshes if expired)
      const { accessToken, emailAccount } = await getValidGmailAccessToken(user.id);

      // Build RFC 2822 raw email message
      const fromEmail = emailAccount.gmailEmail;
      const rawMessage = [
        `From: ${fromEmail}`,
        `To: ${to}`,
        `Subject: =?utf-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        emailBody,
      ].join('\r\n');

      const rawBase64 = base64urlEncode(rawMessage);

      // Send via Gmail API
      const sendResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: rawBase64 }),
        }
      );

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text();
        console.error('[Gmail Send] Failed to send email:', errorText);

        // If token is invalid, mark account as needing re-auth
        if (sendResponse.status === 401) {
          await db.emailAccount.update({
            where: { id: emailAccount.id },
            data: { status: 'expired' },
          });
          return NextResponse.json(
            { error: 'Gmail token expired. Please reconnect your Gmail account.' },
            { status: 401 }
          );
        }

        return NextResponse.json(
          { error: 'Failed to send email via Gmail' },
          { status: 502 }
        );
      }

      const sendResult = await sendResponse.json();
      const gmailMessageId = sendResult.id as string;
      const gmailThreadId = sendResult.threadId as string;

      // If leadId is provided, create EmailThread + EmailMessage records
      if (leadId) {
        // Find or create an EmailThread for this conversation
        let thread = await db.emailThread.findFirst({
          where: {
            emailAccountId: emailAccount.id,
            leadId,
            gmailThreadId,
          },
        });

        if (!thread) {
          thread = await db.emailThread.create({
            data: {
              emailAccountId: emailAccount.id,
              gmailThreadId,
              leadId,
              subject,
              lastMessageAt: new Date(),
              messageCount: 1,
              isRead: true,
            },
          });
        } else {
          await db.emailThread.update({
            where: { id: thread.id },
            data: {
              lastMessageAt: new Date(),
              messageCount: { increment: 1 },
              subject,
            },
          });
        }

        // Create EmailMessage record
        await db.emailMessage.create({
          data: {
            threadId: thread.id,
            gmailMessageId,
            fromEmail,
            toEmail: to,
            subject,
            bodyPlain: emailBody,
            direction: 'outbound',
            isRead: true,
            leadId,
          },
        });
      }

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'email_sent',
          details: `Sent email to ${to} with subject: "${subject}"`,
          resource: 'gmail',
          resourceId: gmailMessageId,
        },
      });

      console.log('[Gmail Send] Email sent successfully:', gmailMessageId, 'to:', to);

      return NextResponse.json({
        success: true,
        messageId: gmailMessageId,
        threadId: gmailThreadId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('No active Gmail account')) {
        return NextResponse.json(
          { error: 'No active Gmail account found. Please connect your Gmail account first.' },
          { status: 404 }
        );
      }

      if (errorMessage.includes('Token refresh failed')) {
        return NextResponse.json(
          { error: 'Gmail token expired and refresh failed. Please reconnect your Gmail account.' },
          { status: 401 }
        );
      }

      console.error('[Gmail Send] Error:', error);
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }
  });
}, 'gmail/send');
