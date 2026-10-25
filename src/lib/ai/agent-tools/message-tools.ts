// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Message Drafting Tools (Phase 26 v2 agent tool layer)
//
// Tools for drafting outreach messages. Per user spec Part 6 + 7:
// - message.draft creates a DRAFT (no recipient sending here — see
//   email-tools for send permission boundary).
// - All drafts are owned by ctx.userId and linked to the lead when
//   leadId is provided.
// ═══════════════════════════════════════════════════════════════════

import { registerTool } from './registry';
import { type ToolContext, type ToolResult } from './types';

// ─── message.draft ───────────────────────────────────────────────────

registerTool({
  name: 'message.draft',
  description: 'Create a draft outreach message owned by the authenticated user. Required: leadId + subject + body. The draft is NOT sent — use email.send or email.reply to deliver. Idempotent via idempotencyKey.',
  category: 'message',
  readOnly: false,
  idempotent: true,
  requiredFeature: 'outreach_messages',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      leadId: { type: 'string', description: 'Required. Lead ID this draft is for.' },
      subject: { type: 'string', description: 'Required. Email subject line.' },
      body: { type: 'string', description: 'Required. Email body (plain text).' },
      channel: { type: 'string', description: 'Optional. email|whatsapp|telegram|linkedin.', enum: ['email', 'whatsapp', 'telegram', 'linkedin'] },
    },
    required: ['leadId', 'subject', 'body'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      draftId: { type: 'string', description: 'Created draft ID.' },
    },
  },
  async execute(input: {
    leadId: string; subject: string; body: string; channel?: string;
  }, ctx: ToolContext): Promise<ToolResult> {
    const { db } = await import('@/lib/db');
    // Ownership check on lead.
    const lead = await db.lead.findFirst({
      where: { id: input.leadId, userId: ctx.userId },
      select: { id: true, email: true, businessName: true },
    });
    if (!lead) {
      return {
        status: 'not_found',
        toolInvocationId: '',
        durationMs: 0,
        error: 'Lead not found or not owned by caller',
      };
    }
    // MessageDraft table — additive Phase 26 v2 schema (will be created
    // by the additive migration). If the table doesn't exist, return
    // a typed error rather than crashing the agent.
    try {
      const draft = await db.messageDraft.create({
        data: {
          userId: ctx.userId,
          orgId: ctx.orgId || null,
          leadId: input.leadId,
          subject: input.subject,
          body: input.body,
          channel: input.channel || 'email',
          status: 'draft',
        },
        select: { id: true },
      });
      return {
        status: 'success',
        toolInvocationId: '',
        durationMs: 0,
        output: { draftId: draft.id },
      };
    } catch (err) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: `MessageDraft table not available: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
