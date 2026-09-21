// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/outreach-to-draft
// Phase 9: Gmail Integration — Push AI-Generated Outreach to Gmail Draft
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { createDraft } from '@/lib/gmail-delivery-service';
import { logEmailDrafted, logUnsubscribeDetected } from '@/lib/gmail-audit-service';

interface OutreachToDraftBody {
  emailAccountId: string;
  leadId: string;
  channel: string;
  subject: string;
  body: string;
  html?: string;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json() as OutreachToDraftBody;
      const { emailAccountId, leadId, channel, subject, body: emailBody, html } = body;

      // ── Validate required fields ─────────────────────────────
      if (!emailAccountId) {
        return NextResponse.json(
          { error: 'emailAccountId is required' },
          { status: 400 }
        );
      }

      if (!leadId) {
        return NextResponse.json(
          { error: 'leadId is required' },
          { status: 400 }
        );
      }

      if (channel !== 'email') {
        return NextResponse.json(
          { error: 'Only email channel is supported for Gmail drafts' },
          { status: 400 }
        );
      }

      if (!subject) {
        return NextResponse.json(
          { error: 'subject is required' },
          { status: 400 }
        );
      }

      if (!emailBody) {
        return NextResponse.json(
          { error: 'body is required' },
          { status: 400 }
        );
      }

      // ── Validate lead exists and has email ───────────────────
      // ACCOUNT ISOLATION: owner-scoped — the lead's email address would
      // otherwise be exfiltrated into the caller's draft for any lead id.
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          businessName: true,
          email: true,
          ownerName: true,
          isActive: true,
          userId: true,
        },
      });

      if (!lead) {
        return NextResponse.json(
          { error: 'Lead not found' },
          { status: 404 }
        );
      }
      if (lead.userId !== user.id) {
        return NextResponse.json(
          { error: 'Lead not found' },
          { status: 404 }
        );
      }

      if (!lead.isActive) {
        return NextResponse.json(
          { error: 'Lead is inactive' },
          { status: 400 }
        );
      }

      if (!lead.email) {
        return NextResponse.json(
          { error: 'Lead does not have an email address. Add an email to create a Gmail draft.' },
          { status: 400 }
        );
      }

      // ── Check unsubscribe status ─────────────────────────────
      const unsubscribe = await db.emailUnsubscribe.findUnique({
        where: { email: lead.email },
      });

      if (unsubscribe) {
        // Log the unsubscribe detection
        await logUnsubscribeDetected(user.id, lead.email);

        return NextResponse.json(
          {
            error: 'This lead has unsubscribed from emails. Cannot create draft.',
            code: 'UNSUBSCRIBED',
          },
          { status: 403 }
        );
      }

      // ── Validate email account belongs to user ───────────────
      const emailAccount = await db.emailAccount.findFirst({
        where: {
          id: emailAccountId,
          userId: user.id,
          status: 'active',
        },
      });

      if (!emailAccount) {
        return NextResponse.json(
          {
            error: 'Gmail account not found or not active. Please reconnect your Gmail account.',
            code: 'ACCOUNT_NOT_ACTIVE',
          },
          { status: 403 }
        );
      }

      // ── Create Gmail Draft ───────────────────────────────────
      const draftResult = await createDraft(emailAccountId, {
        to: lead.email,
        subject,
        body: emailBody,
        html,
      });

      if (!draftResult.success || !draftResult.draftId) {
        return NextResponse.json(
          { error: 'Failed to create Gmail draft', code: 'DRAFT_CREATE_FAILED' },
          { status: 500 }
        );
      }

      // ── Create OutreachMessage record with status 'draft' ────
      const outreachMessage = await db.outreachMessage.create({
        data: {
          leadId: lead.id,
          userId: user.id,
          channel: 'email',
          direction: 'outbound',
          subject,
          content: emailBody,
          status: 'draft',
          generatedByAI: true,
          metadata: JSON.stringify({
            gmailDraftId: draftResult.draftId,
            emailAccountId,
            gmailEmail: emailAccount.gmailEmail,
            leadEmail: lead.email,
            htmlProvided: !!html,
          }),
        },
      });

      // ── Audit Log ────────────────────────────────────────────
      await logEmailDrafted(user.id, lead.email, subject);

      console.log(
        `[GmailOutreach] Draft created for lead ${lead.businessName} (${lead.email}), draftId: ${draftResult.draftId}, outreachMessageId: ${outreachMessage.id}`
      );

      return NextResponse.json({
        success: true,
        draftId: draftResult.draftId,
        outreachMessageId: outreachMessage.id,
      });
    } catch (error) {
      console.error('[GmailOutreach] Outreach-to-draft error:', error);

      if (error instanceof Error && 'statusCode' in error) {
        const customError = error as Error & { statusCode: number; code: string };
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
