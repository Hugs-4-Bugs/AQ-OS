// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/reply-intelligence/analyze
// Full reply analysis: sentiment, intent, buying signals,
// objections, urgency, lead qualification, and recommended actions
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { replyIntelligenceService } from '@/lib/reply-intelligence';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { messageId, messageContent, leadContext } = body as {
        messageId?: string;
        messageContent?: string;
        leadContext?: Record<string, unknown>;
      };

      if (!messageId || typeof messageId !== 'string') {
        return NextResponse.json(
          { error: 'messageId is required' },
          { status: 400 }
        );
      }

      if (!messageContent || typeof messageContent !== 'string') {
        return NextResponse.json(
          { error: 'messageContent is required' },
          { status: 400 }
        );
      }

      if (messageContent.trim().length === 0) {
        return NextResponse.json(
          { error: 'messageContent cannot be empty' },
          { status: 400 }
        );
      }

      const analysis = await replyIntelligenceService.analyzeReply(
        messageId,
        messageContent,
        leadContext
      );

      return NextResponse.json({
        success: true,
        data: analysis,
      });
    } catch (error) {
      console.error('[ReplyIntelligence] Analyze endpoint error:', error);
      return NextResponse.json(
        { error: 'Failed to analyze reply' },
        { status: 500 }
      );
    }
  });
}
