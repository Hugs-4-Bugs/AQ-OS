// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/reply
// Phase 9: Gmail Integration — Reply to Email
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { replyToEmail } from '@/lib/gmail-delivery-service';
import { logGmailEvent } from '@/lib/gmail-audit-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { emailAccountId, messageId, body: replyBody, html, replyAll } = body;

      // Validate required fields
      if (!emailAccountId) {
        return NextResponse.json(
          { error: 'emailAccountId is required' },
          { status: 400 }
        );
      }
      if (!messageId) {
        return NextResponse.json(
          { error: 'messageId is required (the Gmail message ID to reply to)' },
          { status: 400 }
        );
      }
      if (!replyBody) {
        return NextResponse.json(
          { error: 'body is required' },
          { status: 400 }
        );
      }

      // ACCOUNT ISOLATION: the Gmail account must belong to the caller —
      // previously any user could send a reply AS another user's account.
      const gmailAccount = await db.emailAccount.findFirst({
        where: { id: emailAccountId, userId: user.id },
        select: { id: true },
      });
      if (!gmailAccount) {
        return NextResponse.json(
          { error: 'Gmail account not found' },
          { status: 404 }
        );
      }

      const result = await replyToEmail(emailAccountId, messageId, {
        body: replyBody,
        html,
        replyAll: replyAll || false,
      });

      // Audit log
      await logGmailEvent({
        userId: user.id,
        action: 'gmail_reply_sent',
        details: `Reply sent for message: ${messageId}`,
        resourceId: result.messageId,
        metadata: { messageId, replyMessageId: result.messageId, replyAll: replyAll || false },
      });

      return NextResponse.json({
        sent: result.success,
        messageId: result.messageId,
        threadId: result.threadId,
        gmailMessageId: result.gmailMessageId,
      });
    } catch (error) {
      console.error('[Gmail API] Reply error:', error);

      if (error instanceof Error && 'statusCode' in error) {
        const customError = error as Error & { statusCode: number; code: string };
        if (customError.statusCode === 429) {
          return NextResponse.json(
            { error: error.message },
            { status: 429 }
          );
        }
        if (customError.statusCode === 404) {
          return NextResponse.json(
            { error: error.message, code: customError.code },
            { status: 404 }
          );
        }
        return NextResponse.json(
          { error: error.message, code: customError.code },
          { status: customError.statusCode }
        );
      }

      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
