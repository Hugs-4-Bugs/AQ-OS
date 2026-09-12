// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/reply-intelligence
// Process a Gmail reply with full intelligence pipeline:
// analyze, score update, pipeline stage update, notifications
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { gmailReplyIntelligenceService } from '@/lib/gmail-reply-intelligence';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { messageId, threadId, fromEmail, subject, body: emailBody } = body as {
        messageId?: string;
        threadId?: string;
        fromEmail?: string;
        subject?: string;
        body?: string;
      };

      // Validate required fields
      if (!messageId || typeof messageId !== 'string') {
        return NextResponse.json(
          { error: 'messageId is required' },
          { status: 400 }
        );
      }

      if (!threadId || typeof threadId !== 'string') {
        return NextResponse.json(
          { error: 'threadId is required' },
          { status: 400 }
        );
      }

      if (!fromEmail || typeof fromEmail !== 'string') {
        return NextResponse.json(
          { error: 'fromEmail is required' },
          { status: 400 }
        );
      }

      if (!emailBody || typeof emailBody !== 'string') {
        return NextResponse.json(
          { error: 'body is required' },
          { status: 400 }
        );
      }

      if (emailBody.trim().length === 0) {
        return NextResponse.json(
          { error: 'body cannot be empty' },
          { status: 400 }
        );
      }

      const result = await gmailReplyIntelligenceService.processGmailReply(
        user.id,
        {
          messageId,
          threadId,
          fromEmail,
          subject: subject || '',
          body: emailBody,
        }
      );

      return NextResponse.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[GmailReplyIntelligence] Endpoint error:', error);
      return NextResponse.json(
        { error: 'Failed to process Gmail reply' },
        { status: 500 }
      );
    }
  });
}
