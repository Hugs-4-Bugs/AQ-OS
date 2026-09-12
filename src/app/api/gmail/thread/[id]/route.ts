// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/gmail/thread/[id]
// Phase 9: Gmail Integration — Get Thread Messages
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getThreadMessages } from '@/lib/gmail-inbox-service';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id: threadId } = await params;

      if (!threadId) {
        return NextResponse.json(
          { error: 'Thread ID is required' },
          { status: 400 }
        );
      }

      // Verify the thread belongs to a user's account
      const thread = await db.emailThread.findUnique({
        where: { id: threadId },
        include: {
          emailAccount: {
            select: { userId: true, id: true, gmailEmail: true },
          },
        },
      });

      if (!thread) {
        return NextResponse.json(
          { error: 'Thread not found' },
          { status: 404 }
        );
      }

      if (thread.emailAccount.userId !== user.id) {
        return NextResponse.json(
          { error: 'Not authorized to access this thread' },
          { status: 403 }
        );
      }

      // Get messages for this thread
      const messages = await getThreadMessages(threadId);

      return NextResponse.json({
        thread: {
          id: thread.id,
          gmailThreadId: thread.gmailThreadId,
          subject: thread.subject,
          lastMessageAt: thread.lastMessageAt,
          messageCount: thread.messageCount,
          isRead: thread.isRead,
          emailAccount: {
            id: thread.emailAccount.id,
            email: thread.emailAccount.gmailEmail,
          },
        },
        messages,
      });
    } catch (error) {
      console.error('[Gmail API] Thread detail error:', error);

      if (error instanceof Error && 'statusCode' in error) {
        const customError = error as Error & { statusCode: number; code: string };
        if (customError.statusCode === 429) {
          return NextResponse.json(
            { error: error.message },
            { status: 429 }
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
