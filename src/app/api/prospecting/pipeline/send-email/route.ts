// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Prospecting Pipeline: send the smart email draft
// POST /api/prospecting/pipeline/send-email
// body: { leadId, method: 'gmail'|'system', subject?, body?, postscript? }
//
// Gmail method → user's connected Gmail account (Gmail API).
// System method → platform email transport (Resend/SMTP via sendEmail).
// The draft lives in OutreachMessage (created by STEP 5); user edits are
// accepted as overrides and persisted. All sends are recorded:
// OutreachMessage.status → sent, lead.emailStatus/lastContactedAt/stage,
// LeadActivity, audit log. Real sends only — no fake success.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { getValidGmailAccessToken, base64urlEncode } from '@/lib/google-oauth';
import { logAuditEvent } from '@/lib/lead-audit';
import { getLatestPipelineForLead } from '@/lib/prospecting/pipeline';
import type { PipelineEmail } from '@/lib/prospecting/types';

interface SendBody {
  leadId?: string;
  method?: 'gmail' | 'system';
  subject?: string;
  body?: string;
  postscript?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

const STAGE_RANK: Record<string, number> = {
  discovered: 0,
  analyzed: 1,
  contacted: 2,
  replied: 3,
  discussion: 4,
  proposal: 5,
  negotiation: 6,
  won: 7,
  lost: 7,
};

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body: SendBody = await request.json().catch(() => ({}));
      const leadId = typeof body.leadId === 'string' ? body.leadId : '';
      const method = body.method === 'gmail' ? 'gmail' : 'system';
      if (!leadId) {
        return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
      }

      const lead = await db.lead.findFirst({
        where: { id: leadId, userId: user.id, isActive: true, deletedAt: null },
      });
      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }
      if (!lead.email) {
        return NextResponse.json(
          { error: 'This lead has no email address. Add one first.' },
          { status: 400 }
        );
      }

      // Resolve the draft: latest pipeline result, with user edits as overrides
      const pipeline = await getLatestPipelineForLead(leadId, user.id);
      const draft: PipelineEmail | null = pipeline?.email ?? null;
      const subject = (body.subject ?? draft?.subject ?? '').trim();
      const postscript = (body.postscript ?? draft?.postscript ?? '').trim();
      let text = (body.body ?? draft?.body ?? '').trim();
      if (!subject || !text) {
        return NextResponse.json(
          { error: 'No email draft available to send. Run the pipeline first.' },
          { status: 400 }
        );
      }
      if (postscript) text = `${text}\n\nP.S. ${postscript}`;

      // ── Send (real transports only) ──
      let sendOk = false;
      let provider = '';
      let sendError: string | null = null;

      if (method === 'gmail') {
        try {
          const { accessToken, emailAccount } = await getValidGmailAccessToken(user.id);
          const rawMessage = [
            `From: ${emailAccount.gmailEmail}`,
            `To: ${lead.email}`,
            `Subject: =?utf-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=utf-8',
            'Content-Transfer-Encoding: 7bit',
            '',
            text,
          ].join('\r\n');
          const sendResponse = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ raw: base64urlEncode(rawMessage) }),
            }
          );
          if (sendResponse.ok) {
            sendOk = true;
            provider = 'gmail';
          } else {
            const errText = await sendResponse.text().catch(() => '');
            sendError =
              sendResponse.status === 401
                ? 'Gmail authorization expired. Reconnect Gmail in Settings → Integrations.'
                : `Gmail send failed (HTTP ${sendResponse.status})`;
            console.error('[ProspectPipeline:send] Gmail error:', errText.slice(0, 300));
          }
        } catch (err) {
          sendError = err instanceof Error ? err.message : 'Gmail account not connected';
        }
      } else {
        const result = await sendEmail({
          to: lead.email,
          subject,
          html: bodyToHtml(text),
          text,
        });
        sendOk = result.sent;
        provider = result.provider || '';
        sendError = result.sent ? null : result.error || 'Email delivery failed';
      }

      if (!sendOk) {
        return NextResponse.json(
          {
            error: sendError || 'Email could not be sent',
            hint:
              method === 'system'
                ? 'System email requires SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY in environment.'
                : undefined,
          },
          { status: 502 }
        );
      }

      // ── Bookkeeping ──
      const now = new Date();
      const fullBody = text;
      if (pipeline?.outreachMessageId) {
        await db.outreachMessage
          .update({
            where: { id: pipeline.outreachMessageId },
            data: {
              subject,
              content: fullBody,
              status: 'sent',
              sentAt: now,
            },
          })
          .catch(() => {});
      } else {
        await db.outreachMessage
          .create({
            data: {
              leadId,
              userId: user.id,
              channel: 'email',
              direction: 'outbound',
              subject,
              content: fullBody,
              status: 'sent',
              sentAt: now,
              generatedByAI: !!draft,
              metadata: JSON.stringify({ source: 'prospect_pipeline', method }),
            },
          })
          .catch(() => {});
      }

      const leadStageRank = STAGE_RANK[lead.stage] ?? 0;
      await db.lead.update({
        where: { id: leadId },
        data: {
          emailStatus: 'sent',
          lastContactedAt: now,
          ...(leadStageRank < STAGE_RANK.contacted ? { stage: 'contacted' } : {}),
        },
      });

      await db.leadActivity
        .create({
          data: {
            leadId,
            userId: user.id,
            type: 'email_sent',
            description: `Smart pipeline email sent via ${provider || method}: "${subject}"`,
            metadata: JSON.stringify({ method, provider, pipelineId: pipeline?.id ?? null }),
          },
        })
        .catch(() => {});

      await logAuditEvent(user.id, 'prospect_pipeline_email_sent', {
        leadId,
        method,
        provider,
        subject,
      }).catch(() => {});

      return NextResponse.json({ success: true, method, provider });
    } catch (err) {
      console.error('[ProspectPipeline:send] Unexpected error:', err);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }
  });
}, 'prospecting/pipeline/send-email');
