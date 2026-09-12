import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/auth-middleware';
import { sendEmail, isEmailServiceConfigured } from '@/lib/email';

// GET /api/leads/[id]/communications - Get communications for a lead
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const lead = await db.lead.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const communications = await db.communication.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(communications);
  } catch (error) {
    console.error('Error fetching communications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch communications' },
      { status: 500 }
    );
  }
}

// POST /api/leads/[id]/communications - Add communication record
// FIX (2026-09-09): For outbound EMAIL communications, actually SEND the
// email to the lead's company email address and BCC the user (sender)
// so they receive a copy. Previously this route only inserted a DB row
// and the email was never delivered.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (authUser) => {
    try {
      const { id } = await params;
      const body = await request.json();

      // Validate required fields
      if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
        return NextResponse.json(
          { error: 'content is required' },
          { status: 400 }
        );
      }

      const lead = await db.lead.findUnique({
        where: { id },
        select: { id: true, stage: true, email: true, businessName: true, userId: true },
      });

      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }

      const channel = body.channel || 'email';
      const direction = body.direction || 'outbound';
      const content = body.content.trim();

      // ── Send the email for outbound email communications ──────────
      // Only send when: channel === 'email' AND direction === 'outbound'
      // AND the lead has an email address AND email service is configured.
      // Inbound communications (lead replies logged manually) are NOT sent.
      let emailSent = false;
      let emailError: string | undefined;
      let emailMessageId: string | undefined;

      if (channel === 'email' && direction === 'outbound') {
        if (!lead.email || lead.email.trim() === '') {
          return NextResponse.json(
            { error: 'This lead has no email address on file. Add an email to the lead before sending outreach.' },
            { status: 400 }
          );
        }

        if (!isEmailServiceConfigured()) {
          return NextResponse.json(
            { error: 'Email delivery is not configured on the server. Contact support.' },
            { status: 503 }
          );
        }

        // Load the user (sender) so we can BCC them a copy and use their name.
        const user = await db.user.findUnique({
          where: { id: authUser.id },
          select: { id: true, name: true, email: true, company: true, settings: { select: { companyName: true } } },
        });

        const senderName = user?.name || user?.settings?.companyName || user?.company || 'AcquisitionOS User';
        const senderBusiness = user?.settings?.companyName || user?.company || '';
        const senderEmail = user?.email;

        // Derive a subject line. If the content starts with "Subject: ...",
        // extract it; otherwise synthesize one from the lead's business name.
        let subject = `Outreach to ${lead.businessName}`;
        const subjectMatch = content.match(/^Subject:\s*(.+?)(\n|$)/i);
        if (subjectMatch) {
          subject = subjectMatch[1].trim();
        }
        const bodyOnly = content.replace(/^Subject:\s*.+(\n|$)/i, '').trim() || content;

        const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /></head>
<body style="margin:0; padding:0; background-color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#1e293b; line-height:1.6;">
  <div style="max-width:600px; margin:0 auto; padding:20px;">
    <div style="font-size:15px; line-height:24px; color:#1e293b; white-space:pre-line;">${bodyOnly.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />')}</div>
    <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:14px; color:#64748b;">
      ${senderBusiness ? `${senderName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}<br />${senderBusiness.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}` : senderName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
    </div>
  </div>
</body></html>`;

        const emailPayload: Parameters<typeof sendEmail>[0] = {
          to: lead.email,
          subject,
          html,
          text: bodyOnly,
        };

        // BCC the user (sender) a copy — only if their email differs from the lead's.
        if (senderEmail && senderEmail.toLowerCase().trim() !== lead.email.toLowerCase().trim()) {
          emailPayload.bcc = senderEmail;
        }

        try {
          const result = await sendEmail(emailPayload);
          emailSent = result.sent;
          emailError = result.error;
          emailMessageId = result.messageId;
          if (result.sent) {
            console.log(`[Communications] ✓ Outreach email sent to ${lead.email} (bcc=${senderEmail || 'none'}, id=${result.messageId || 'n/a'})`);
          } else {
            console.error(`[Communications] ✗ Outreach email failed: ${result.error}`);
          }
        } catch (sendErr) {
          emailSent = false;
          emailError = sendErr instanceof Error ? sendErr.message : 'Unknown send error';
          console.error('[Communications] Email send exception:', sendErr);
        }

        // If the email genuinely failed, surface the error to the user
        // instead of silently logging a "sent" communication.
        if (!emailSent) {
          return NextResponse.json(
            { error: `Failed to send email: ${emailError || 'unknown error'}` },
            { status: 502 }
          );
        }

        // Send a separate confirmation copy to the user (in addition to BCC)
        if (senderEmail && senderEmail.toLowerCase().trim() !== lead.email.toLowerCase().trim()) {
          try {
            const sentAtIso = new Date().toISOString();
            const confirmHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /></head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1e293b; line-height:1.6;">
  <div style="max-width:600px; margin:0 auto; padding:20px;">
    <div style="background-color:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:16px 18px; margin-bottom:20px;">
      <p style="margin:0 0 8px 0; font-size:14px; color:#1e40af; font-weight:600;">✉️ Outreach sent — copy for your records</p>
      <p style="margin:0; font-size:13px; color:#475569;">You sent an outreach email to <strong>${lead.businessName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</strong> (${lead.email.replace(/&/g, '&amp;')}) on ${sentAtIso}.</p>
    </div>
    <div style="background-color:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:18px 20px;">
      <p style="margin:0 0 12px 0; font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">Subject</p>
      <p style="margin:0 0 16px 0; font-size:15px; font-weight:600; color:#0f172a;">${subject.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>
      <div style="height:1px; background:#e2e8f0; margin:0 0 16px 0;"></div>
      <p style="margin:0 0 8px 0; font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">Message</p>
      <div style="font-size:15px; line-height:24px; color:#1e293b; white-space:pre-line;">${bodyOnly.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />')}</div>
    </div>
    <p style="margin:16px 0 0 0; font-size:12px; color:#94a3b8; text-align:center;">Automated confirmation from AcquisitionOS.</p>
  </div>
</body></html>`;
            await sendEmail({
              to: senderEmail,
              subject: `✉️ Outreach sent to ${lead.businessName} — copy for your records`,
              html: confirmHtml,
              text: `You sent the following outreach to ${lead.businessName} (${lead.email}) at ${sentAtIso}.\n\nSubject: ${subject}\n\n${bodyOnly}`,
            });
            console.log(`[Communications] ✓ Confirmation copy delivered to ${senderEmail}`);
          } catch (confErr) {
            // Non-fatal — primary send succeeded.
            console.warn('[Communications] Confirmation email failed (non-fatal):', confErr instanceof Error ? confErr.message : confErr);
          }
        }

        // Update lead's lastContactedAt + emailStatus on successful send
        try {
          await db.lead.update({
            where: { id },
            data: {
              lastContactedAt: new Date(),
              emailStatus: 'sent',
            },
          });
        } catch (leadUpdErr) {
          console.warn('[Communications] lead.lastContactedAt update failed (non-fatal):', leadUpdErr);
        }

        // Log a lead activity
        try {
          await db.leadActivity.create({
            data: {
              leadId: id,
              type: 'email_sent',
              description: subject,
              metadata: JSON.stringify({
                subject,
                bodyPreview: bodyOnly.substring(0, 200),
                sendSucceeded: true,
                emailId: emailMessageId || null,
                channel: 'email',
              }),
            },
          });
        } catch (actErr) {
          console.warn('[Communications] leadActivity create failed (non-fatal):', actErr);
        }
      }

      // Create communication record
      const communication = await db.communication.create({
        data: {
          leadId: id,
          channel,
          direction,
          content,
          messageGeneratedByAI: body.messageGeneratedByAI || false,
          responseSummary: body.responseSummary?.trim() || null,
          intent: body.intent?.trim() || null,
          buyingSignals: body.buyingSignals
            ? (typeof body.buyingSignals === 'string'
              ? body.buyingSignals
              : JSON.stringify(body.buyingSignals))
            : null,
          hesitationReasons: body.hesitationReasons
            ? (typeof body.hesitationReasons === 'string'
              ? body.hesitationReasons
              : JSON.stringify(body.hesitationReasons))
            : null,
        },
      });

      // Auto-update lead stage based on communication
      let stageUpdate: string | null = null;
      const currentStage = lead.stage;

      if (body.direction === 'outbound' && currentStage === 'discovered') {
        // First outbound contact moves to "contacted"
        stageUpdate = 'contacted';
      }

      if (body.direction === 'inbound') {
        // Inbound response from the lead
        if (currentStage === 'discovered' || currentStage === 'contacted') {
          if (body.intent === 'interested') {
            stageUpdate = 'interested';
          } else {
            stageUpdate = 'replied';
          }
        }
        if (currentStage === 'replied' && body.intent === 'interested') {
          stageUpdate = 'interested';
        }
      }

      if (stageUpdate && stageUpdate !== currentStage) {
        await db.lead.update({
          where: { id },
          data: { stage: stageUpdate },
        });
      }

      return NextResponse.json({
        communication,
        emailSent,
        emailMessageId,
        stageUpdated: stageUpdate
          ? { from: currentStage, to: stageUpdate }
          : null,
      }, { status: 201 });
    } catch (error) {
      console.error('Error creating communication:', error);
      return NextResponse.json(
        { error: 'Failed to create communication' },
        { status: 500 }
      );
    }
  });
}
