// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Reply Intelligence: Classify API Route
// POST /api/reply-intelligence/classify
//
// Classify an incoming email reply using AI-powered sentiment analysis,
// buying signal detection, urgency assessment, and action recommendation.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withRequestLogging } from '@/lib/api-request-logger';
import { db } from '@/lib/db';
import { canUserAccessLead } from '@/lib/lead-resolution';
import { processIncomingReply } from '@/lib/reply-intelligence-service';

export const POST = withRequestLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { leadId, emailContent, emailSubject, fromEmail, messageId } = body;

      // Validate required fields
      if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
        return NextResponse.json(
          { error: 'emailContent is required and must be a non-empty string' },
          { status: 400 },
        );
      }

      if (!fromEmail || typeof fromEmail !== 'string' || fromEmail.trim().length === 0) {
        return NextResponse.json(
          { error: 'fromEmail is required' },
          { status: 400 },
        );
      }

      // ACCOUNT ISOLATION: the service writes stage/scores/notes onto the
      // supplied leadId without checking ownership — enforce the
      // owner / same non-null org rule here.
      if (leadId) {
        const lead = await db.lead.findUnique({
          where: { id: leadId },
          select: { id: true, userId: true, orgId: true },
        });
        if (!lead) {
          return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }
        if (!canUserAccessLead(lead, user)) {
          return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }
      }

      // Process the incoming reply (classify + update lead + notifications + workflows)
      const result = await processIncomingReply({
        userId: user.id,
        leadId: leadId || undefined,
        emailContent: emailContent.trim(),
        emailSubject: emailSubject || undefined,
        fromEmail: fromEmail.trim(),
        messageId: messageId || undefined,
      });

      if (!result.success || !result.classification) {
        return NextResponse.json(
          { error: result.error || 'Classification failed' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        classification: result.classification,
        leadUpdated: result.leadUpdated,
        notificationSent: result.notificationSent,
        workflowTriggered: result.workflowTriggered,
        workflowExecutionIds: result.workflowExecutionIds,
      }, { status: 200 });
    } catch (error) {
      console.error('[ReplyIntelAPI] POST /classify error:', error);
      return NextResponse.json(
        { error: 'Failed to classify reply' },
        { status: 500 },
      );
    }
  });
}, { service: 'reply-intelligence' });
