// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Reply Intelligence API Routes
// POST /api/leads/reply-intelligence — Classify a lead reply
// GET  /api/leads/reply-intelligence — Get reply insights for user
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';
import { classifyReply, getReplyAnalytics, getBuyingSignalsSummary } from '@/lib/reply-intelligence-service';

// POST /api/leads/reply-intelligence
export async function POST(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { leadId, replyText, replyFrom, replySubject, source } = body;

      // Validate required fields
      if (!replyText || typeof replyText !== 'string') {
        return NextResponse.json(
          { error: 'replyText is required and must be a string' },
          { status: 400 }
        );
      }
      if (!replyFrom || typeof replyFrom !== 'string') {
        return NextResponse.json(
          { error: 'replyFrom is required and must be a string' },
          { status: 400 }
        );
      }

      const result = await classifyReply({
        userId: user.id,
        leadId: leadId || undefined,
        emailContent: replyText,
        emailSubject: replySubject || undefined,
        fromEmail: replyFrom,
        messageId: source ? `reply_${Date.now()}_${source}` : undefined,
      });

      return NextResponse.json({
        success: true,
        classification: result,
      });
    } catch (error) {
      console.error('[ReplyIntel API] POST classification failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to classify reply';
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}

// GET /api/leads/reply-intelligence
export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      // Fetch both analytics and buying signals summary for comprehensive insights
      const [analytics, buyingSignals] = await Promise.all([
        getReplyAnalytics(user.id),
        getBuyingSignalsSummary(user.id),
      ]);

      return NextResponse.json({
        success: true,
        analytics,
        buyingSignals,
      });
    } catch (error) {
      console.error('[ReplyIntel API] GET insights failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to get reply insights';
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}
