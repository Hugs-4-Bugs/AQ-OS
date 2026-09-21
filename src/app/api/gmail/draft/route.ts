// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/draft
// Phase 9: Gmail Integration — Draft Operations (Create/Send/Delete)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { createDraft, sendDraft, deleteDraft } from '@/lib/gmail-delivery-service';
import { logGmailEvent } from '@/lib/gmail-audit-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { emailAccountId, to, subject, body: emailBody, html, action, draftId } = body;

      // Validate required fields
      if (!emailAccountId) {
        return NextResponse.json(
          { error: 'emailAccountId is required' },
          { status: 400 }
        );
      }

      if (!action || !['create', 'send', 'delete'].includes(action)) {
        return NextResponse.json(
          { error: 'action must be one of: create, send, delete' },
          { status: 400 }
        );
      }

      // ACCOUNT ISOLATION: the Gmail account must belong to the
      // authenticated user. The delivery service does not verify this —
      // without the check any user could send/delete from ANOTHER user's
      // connected Gmail account.
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

      switch (action) {
        case 'create': {
          if (!to) {
            return NextResponse.json(
              { error: 'to (recipient) is required for creating a draft' },
              { status: 400 }
            );
          }
          if (!subject) {
            return NextResponse.json(
              { error: 'subject is required for creating a draft' },
              { status: 400 }
            );
          }
          if (!emailBody) {
            return NextResponse.json(
              { error: 'body is required for creating a draft' },
              { status: 400 }
            );
          }

          const result = await createDraft(emailAccountId, {
            to,
            subject,
            body: emailBody,
            html,
          });

          // Audit log
          await logGmailEvent({
            userId: user.id,
            action: 'gmail_draft_created',
            details: `Draft created — to: ${to}, subject: "${subject}"`,
            resourceId: result.draftId,
            metadata: { to, subject, draftId: result.draftId },
          });

          return NextResponse.json({
            success: result.success,
            draftId: result.draftId,
          });
        }

        case 'send': {
          if (!draftId) {
            return NextResponse.json(
              { error: 'draftId is required for sending a draft' },
              { status: 400 }
            );
          }

          const result = await sendDraft(emailAccountId, draftId);

          // Audit log
          await logGmailEvent({
            userId: user.id,
            action: 'gmail_draft_sent',
            details: `Draft sent: ${draftId}`,
            resourceId: result.messageId,
            metadata: { draftId, messageId: result.messageId },
          });

          return NextResponse.json({
            success: result.success,
            messageId: result.messageId,
            threadId: result.threadId,
          });
        }

        case 'delete': {
          if (!draftId) {
            return NextResponse.json(
              { error: 'draftId is required for deleting a draft' },
              { status: 400 }
            );
          }

          await deleteDraft(emailAccountId, draftId);

          // Audit log
          await logGmailEvent({
            userId: user.id,
            action: 'gmail_draft_deleted',
            details: `Draft deleted: ${draftId}`,
            resourceId: draftId,
            metadata: { draftId },
          });

          return NextResponse.json({
            success: true,
          });
        }

        default:
          return NextResponse.json(
            { error: 'Invalid action' },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('[Gmail API] Draft error:', error);

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
