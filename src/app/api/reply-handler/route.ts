// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Reply Handler API Route
// POST /api/reply-handler — Process an incoming email reply
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { processLeadReply, type EmailReplyData } from '@/lib/lead-discovery/reply-handler';

export async function POST(request: NextRequest) {
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

    if (!body.userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
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

    const result = await processLeadReply(emailData, body.userId);

    return NextResponse.json(result, {
      status: result.matched ? 200 : 200, // 200 even if not matched (not an error)
    });
  } catch (error) {
    console.error('[ReplyHandlerAPI] Error processing reply:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
