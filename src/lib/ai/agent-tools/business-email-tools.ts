// Business Email Tools — Workstream D §3-4
// Agent tools that route through CONNECTED BUSINESS ACCOUNT layer (SMTP adapter)
import { registerTool } from './registry';
import type { ToolResult } from './types';
import { resolveAccountForCapability, scopeRequiresApproval, getAdapter } from '@/lib/connected-accounts/service';
import type { SmtpSendInput, SmtpSendOutput } from '@/lib/connected-accounts/types';

const EMAIL_SEND_SCHEMA = {
  type: 'object' as const, additionalProperties: false,
  properties: {
    to: { type: 'string' as const, description: 'Required. Recipient email address.' },
    subject: { type: 'string' as const, description: 'Required. Email subject.' },
    text: { type: 'string' as const, description: 'Plain-text body.' },
    html: { type: 'string' as const, description: 'HTML body.' },
    replyTo: { type: 'string' as const, description: 'Reply-To address.' },
    cc: { type: 'string' as const, description: 'CC.' },
    bcc: { type: 'string' as const, description: 'BCC.' },
    inReplyTo: { type: 'string' as const, description: 'Message-ID for threading.' },
    references: { type: 'string' as const, description: 'References header.' },
    leadId: { type: 'string' as const, description: 'Lead correlation.' },
    threadId: { type: 'string' as const, description: 'Thread correlation.' },
  },
  required: ['to', 'subject'],
};

async function sendViaConnectedAccount(capability: 'email.send' | 'email.reply', input: Record<string, unknown>, userId: string): Promise<ToolResult> {
  let account;
  try {
    account = await resolveAccountForCapability(userId, 'hostinger-mail', capability);
  } catch (err) {
    return { status: 'error', toolInvocationId: '', durationMs: 0, error: err instanceof Error ? err.message : String(err) };
  }
  if (scopeRequiresApproval(account.scopes, capability)) {
    return { status: 'unauthorized', toolInvocationId: '', durationMs: 0, error: `Scope for ${capability} requires human approval — execution must come from an approved decision` };
  }
  const adapter = getAdapter(account.provider);
  if (!adapter) return { status: 'error', toolInvocationId: '', durationMs: 0, error: `No adapter for provider "${account.provider}"` };
  const smtpInput: SmtpSendInput = {
    to: String(input.to), subject: String(input.subject),
    text: input.text ? String(input.text) : undefined, html: input.html ? String(input.html) : undefined,
    replyTo: input.replyTo ? String(input.replyTo) : undefined, cc: input.cc ? String(input.cc) : undefined,
    bcc: input.bcc ? String(input.bcc) : undefined, inReplyTo: input.inReplyTo ? String(input.inReplyTo) : undefined,
    references: input.references ? String(input.references) : undefined,
  };
  let out: SmtpSendOutput;
  try {
    out = (await adapter.execute(capability, smtpInput, account.credentials)) as SmtpSendOutput;
  } catch (err) {
    return { status: 'error', toolInvocationId: '', durationMs: 0, error: err instanceof Error ? err.message : String(err) };
  }
  // Correlate send to lead/thread + persist EmailMessage
  const { db } = await import('@/lib/db');
  const leadId = input.leadId ? String(input.leadId) : null;
  let threadId: string | null = null;
  if (input.threadId) { try { const t = await db.emailThread.findFirst({ where: { id: String(input.threadId), emailAccount: { userId } } }); if (t) threadId = t.id; } catch { /* non-fatal */ } }
  else if (leadId) { try { const t = await db.emailThread.findFirst({ where: { leadId, emailAccount: { userId } }, orderBy: { lastMessageAt: 'desc' } }); if (t) threadId = t.id; } catch { /* non-fatal */ } }
  if (!threadId) {
    try { const c = await db.emailThread.create({ data: { emailAccountId: await ensureBusinessEmailAccountRow(userId, account.accountIdentifier), gmailThreadId: `smtp:${out.messageId}`, leadId, subject: String(input.subject), lastMessageAt: new Date(), messageCount: 1 } }); threadId = c.id; } catch { /* non-fatal */ }
  } else { try { await db.emailThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date(), messageCount: { increment: 1 } } }); } catch { /* non-fatal */ } }
  try { await db.emailMessage.create({ data: { threadId: threadId!, gmailMessageId: out.messageId || `smtp:${Date.now()}`, fromEmail: account.accountIdentifier, toEmail: String(input.to), subject: String(input.subject), bodyPlain: input.text ? String(input.text) : null, bodyHtml: input.html ? String(input.html) : null, direction: 'outbound', isRead: true, leadId } }); } catch { /* non-fatal */ }

  // Persist OutreachMessage with accurate status — SMTP returning 250 = provider accepted.
  // Actual delivery to recipient inbox happens asynchronously via SMTP relay chain
  // and is NOT confirmed by SMTP. We use 'provider_accepted' rather than 'sent'/'delivered'
  // to comply with the Phase 27 "NO FAKE SENT" rule.
  let outreachMessageId: string | null = null;
  if (leadId) {
    try {
      const om = await db.outreachMessage.create({
        data: {
          leadId,
          userId,
          channel: 'email',
          direction: 'outbound',
          subject: String(input.subject),
          content: input.text ? String(input.text) : (input.html ? String(input.html) : ''),
          status: 'provider_accepted',
          providerMessageId: out.messageId || null,
          providerAcceptedAt: new Date(),
          sentAt: new Date(),
          generatedByAI: true,
          metadata: JSON.stringify({ provider: account.provider, threadId, accepted: out.accepted }),
        },
      });
      outreachMessageId = om.id;
    } catch { /* non-fatal */ }
  }

  return {
    status: 'success',
    toolInvocationId: '',
    durationMs: 0,
    output: {
      sent: true,                        // backward-compat (provider accepted = envelope handed off)
      deliveryState: 'provider_accepted',// accurate state for UI timeline
      messageId: out.messageId,
      providerMessageId: out.messageId,
      accepted: out.accepted,
      threadId,
      leadId,
      outreachMessageId,
    },
  };
}

async function ensureBusinessEmailAccountRow(userId: string, identifier: string): Promise<string> {
  const { db } = await import('@/lib/db');
  try { const existing = await db.emailAccount.findFirst({ where: { userId, gmailEmail: identifier } }); if (existing) return existing.id; const created = await db.emailAccount.create({ data: { userId, gmailEmail: identifier, accessToken: 'smtp-business-account', refreshToken: 'smtp-business-account', status: 'active', mode: 'manual' } }); return created.id; } catch { return 'fallback-account'; }
}

registerTool({
  name: 'businessEmail.send',
  description: 'Send an email through the user\'s CONNECTED business email account (Hostinger Mail / Gmail SMTP). Requires the "SEND" permission category and a connected business account with the email.send capability. Sends are idempotent per run+input and audited.',
  category: 'email', readOnly: false, idempotent: true, emailPermissionLevel: 'send_with_approval', inputSchema: EMAIL_SEND_SCHEMA,
  outputSchema: { type: 'object', properties: { sent: { type: 'boolean' }, messageId: { type: 'string' }, threadId: { type: 'string' } } },
  async execute(input, ctx) { const result = await sendViaConnectedAccount('email.send', input, ctx.userId); return { ...result, toolInvocationId: '', durationMs: 0 }; },
});

registerTool({
  name: 'businessEmail.reply',
  description: 'Reply on an existing email thread through the connected business email account (SMTP). Sets In-Reply-To/References for provider-side thread continuity.',
  category: 'email', readOnly: false, idempotent: true, emailPermissionLevel: 'send_with_approval', inputSchema: EMAIL_SEND_SCHEMA,
  outputSchema: { type: 'object', properties: { sent: { type: 'boolean' }, messageId: { type: 'string' }, threadId: { type: 'string' } } },
  async execute(input, ctx) { const result = await sendViaConnectedAccount('email.reply', input, ctx.userId); return { ...result, toolInvocationId: '', durationMs: 0 }; },
});
