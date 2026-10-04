// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous Send Outreach API
// POST: Send outreach email to a lead
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { autoMovePipelineStage } from '@/lib/autonomous-outreach-engine';
import { generateOutreach } from '@/lib/ai/outreach-generator';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const {
        leadId,
        subject,
        body: emailBody,
        tone,
        channel,
        autoGenerate,
      } = body;

      // Validate required fields
      if (!leadId || typeof leadId !== 'string') {
        return NextResponse.json(
          { error: 'Missing required field: leadId' },
          { status: 400 }
        );
      }

      // Fetch the lead with ownership check
      const lead = await db.lead.findFirst({
        where: { id: leadId, userId: user.id, isActive: true },
      });

      if (!lead) {
        return NextResponse.json(
          { error: 'Lead not found or inactive' },
          { status: 404 }
        );
      }

      if (!lead.email) {
        return NextResponse.json(
          { error: 'Lead does not have an email address' },
          { status: 400 }
        );
      }

      // Find user's connected Gmail account
      const emailAccount = await db.emailAccount.findFirst({
        where: { userId: user.id, status: 'active' },
      });

      if (!emailAccount) {
        return NextResponse.json(
          {
            error: 'No connected Gmail account found. Please connect your Gmail account first to send outreach emails.',
            code: 'GMAIL_NOT_CONNECTED',
          },
          { status: 400 }
        );
      }

      // Determine email subject and body
      let finalSubject = subject;
      let finalBody = emailBody;
      const outreachChannel = channel || 'email';
      const outreachTone = tone || 'professional';

      // If autoGenerate is true, generate outreach via AI first
      if (autoGenerate && !finalBody) {
        const generationResult = await generateOutreach({
          leadId,
          userId: user.id,
          channel: outreachChannel as 'email' | 'whatsapp' | 'telegram' | 'linkedin' | 'instagram',
          tone: outreachTone as 'professional' | 'casual' | 'urgent' | 'friendly' | 'formal',
        });

        if (!generationResult.success || !generationResult.message) {
          return NextResponse.json(
            { error: generationResult.error || 'Failed to generate outreach content' },
            { status: 400 }
          );
        }

        finalSubject = finalSubject || generationResult.message.subject || `Re: ${lead.businessName}`;
        finalBody = generationResult.message.body;
      }

      if (!finalBody) {
        return NextResponse.json(
          { error: 'Missing email body. Provide body or set autoGenerate=true.' },
          { status: 400 }
        );
      }

      // Default subject if not provided
      if (!finalSubject) {
        finalSubject = `Re: ${lead.businessName}`;
      }

      // Send the email via Gmail delivery service (dynamic import to avoid circular deps)
      const { sendEmail } = await import('@/lib/gmail-delivery-service');

      const sendResult = await sendEmail(emailAccount.id, {
        to: lead.email,
        subject: finalSubject,
        body: finalBody,
      });

      if (!sendResult.success) {
        return NextResponse.json(
          { error: 'Failed to send email', details: sendResult.error },
          { status: 500 }
        );
      }

      // Auto-move lead pipeline stage to "contacted"
      const pipelineResult = await autoMovePipelineStage(leadId, user.id, 'email_sent');

      return NextResponse.json({
        success: true,
        messageId: sendResult.messageId,
        threadId: sendResult.threadId,
        gmailMessageId: sendResult.gmailMessageId,
        pipeline: pipelineResult,
        leadId,
        leadEmail: lead.email,
      });
    } catch (error) {
      console.error('[SendOutreachAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to send outreach email' },
        { status: 500 }
      );
    }
  });
}
