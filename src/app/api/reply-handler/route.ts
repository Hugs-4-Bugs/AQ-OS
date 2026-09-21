// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Reply Handler API Route
// POST /api/reply-handler — Process an incoming email reply
//
// ACCOUNT ISOLATION: this endpoint previously accepted an arbitrary
// `userId` in the request body, letting anyone impersonate any account —
// probing which email addresses belong to a victim's leads and injecting
// fake replies that advanced the victim's pipeline. The acting user is
// now ALWAYS the authenticated identity (session cookie or personal API
// key); client-supplied userId values are ignored.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { processLeadReply, type EmailReplyData } from '@/lib/lead-discovery/reply-handler';

export async function POST(request: NextRequest) {
  return withAuth(request, async (authUser) => {
    try {
      const body = await request.json() as {
        from?: string;
        subject?: string;
        body?: string;
        threadId?: string;
        messageId?: string;
        userId?: string;
      };

      // Validate required fields
      if (!body.from || !body.subject || !body.body) {
        return NextResponse.json(
          { error: 'Missing required fields: from, subject, body' },
          { status: 400 }
        );
      }

      const emailData: EmailReplyData = {
        from: body.from,
        subject: body.subject,
        body: body.body,
        threadId: body.threadId,
        messageId: body.messageId,
      };

      // Trusted identity only — never the client-supplied value.
      const result = await processLeadReply(emailData, authUser.id);

      return NextResponse.json(result, {
        status: result.matched ? 200 : 200, // 200 even if not matched (not an error)
      });
    } catch (error) {
      console.error('[ReplyHandlerAPI] Error processing reply:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
