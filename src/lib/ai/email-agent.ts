// Email Agent — Workstream D §9/§10
// READ → understand → classify → correlate → decide → draft → approval → send/reply → record → continue
import { db } from '@/lib/db';
import { withIdempotency } from '@/lib/ai/agent-idempotency';
import { enqueueEvent } from '@/lib/ai/agent-event-dispatcher';

export interface InboundEmailMessage {
  userId: string; providerMessageId: string; providerThreadId?: string | null;
  fromEmail: string; toEmail: string; subject?: string | null; bodyPlain?: string | null;
  receivedAt?: Date; source: 'gmail_oauth' | 'external_webhook';
}
export interface InboundProcessingResult {
  action: 'correlated_reply' | 'correlated_new' | 'unrelated' | 'duplicate';
  leadId: string | null; threadId: string | null; emailMessageId: string | null;
  replyAnalysisRunId: string | null; continuedPipeline: boolean;
}

export async function processInboundEmail(msg: InboundEmailMessage): Promise<InboundProcessingResult> {
  const op = await withIdempotency(
    { userId: msg.userId, operationType: 'external_callback', target: `inbound:${msg.providerMessageId}`, input: { from: msg.fromEmail, subject: msg.subject ?? '' } },
    () => processInboundEmailInner(msg),
    (result) => ({ resultType: `email:${result.action}`, resultId: result.emailMessageId ?? undefined, resultRef: JSON.stringify(result) }),
  );
  const result = op.result as InboundProcessingResult | null;
  if (op.replayed && result) return { ...result, action: 'duplicate' };
  return result ?? { action: 'unrelated', leadId: null, threadId: null, emailMessageId: null, replyAnalysisRunId: null, continuedPipeline: false };
}

async function processInboundEmailInner(msg: InboundEmailMessage): Promise<InboundProcessingResult> {
  let lead: { id: string; company: string | null; name: string | null } | null = null;
  try { lead = await db.lead.findFirst({ where: { userId: msg.userId, email: msg.fromEmail.toLowerCase(), deletedAt: null }, select: { id: true, company: true, name: true } }); } catch { /* non-fatal */ }
  let thread: { id: string; leadId: string | null; messageCount: number } | null = null;
  if (msg.providerThreadId) { try { thread = await db.emailThread.findFirst({ where: { gmailThreadId: msg.providerThreadId, emailAccount: { userId: msg.userId } } }); } catch { /* non-fatal */ } }
  if (!thread && lead) { try { thread = await db.emailThread.findFirst({ where: { leadId: lead.id, emailAccount: { userId: msg.userId } }, orderBy: { lastMessageAt: 'desc' } }); } catch { /* non-fatal */ } }
  if (!thread) {
    let account: string | null = null;
    try { const a = await db.emailAccount.findFirst({ where: { userId: msg.userId, gmailEmail: msg.toEmail } }); if (a) account = a.id; } catch { /* non-fatal */ }
    if (!account) { try { const c = await db.emailAccount.create({ data: { userId: msg.userId, gmailEmail: msg.toEmail, accessToken: 'inbound-relay', refreshToken: 'inbound-relay', status: 'active', mode: 'manual' } }); account = c.id; } catch { /* non-fatal */ } }
    if (account) { try { thread = await db.emailThread.create({ data: { emailAccountId: account, gmailThreadId: msg.providerThreadId || `inbound:${msg.providerMessageId}`, leadId: lead?.id ?? null, subject: msg.subject ?? null, lastMessageAt: msg.receivedAt ?? new Date(), messageCount: 0 } }); } catch { /* non-fatal */ } }
  }
  let emailMessage: { id: string } | null = null;
  if (thread) {
    try { emailMessage = await db.emailMessage.findUnique({ where: { gmailMessageId: msg.providerMessageId } }); } catch { /* non-fatal */ }
    if (!emailMessage) { try { emailMessage = await db.emailMessage.create({ data: { threadId: thread.id, gmailMessageId: msg.providerMessageId, fromEmail: msg.fromEmail, toEmail: msg.toEmail, subject: msg.subject ?? null, bodyPlain: msg.bodyPlain ?? null, direction: 'inbound', leadId: lead?.id ?? null } }); try { await db.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: msg.receivedAt ?? new Date(), messageCount: { increment: 1 }, isRead: false } }); } catch { /* non-fatal */ } } catch { /* non-fatal */ } }
  }
  if (!lead) return { action: 'unrelated', leadId: null, threadId: thread?.id ?? null, emailMessageId: emailMessage?.id ?? null, replyAnalysisRunId: null, continuedPipeline: false };
  if (thread && thread.leadId !== lead.id) { try { await db.emailThread.update({ where: { id: thread.id }, data: { leadId: lead.id } }); } catch { /* non-fatal */ } }
  await enqueueEvent({ userId: msg.userId, eventType: 'new_email', payload: { leadId: lead.id, providerMessageId: msg.providerMessageId, threadId: thread?.id, emailMessageId: emailMessage?.id, fromEmail: msg.fromEmail, subject: msg.subject ?? '', source: msg.source }, source: `email-agent:${msg.source}`, correlationId: thread?.id, idempotencyKey: `new-email:${msg.userId}:${msg.providerMessageId}` });
  return { action: thread && thread.messageCount > 0 ? 'correlated_reply' : 'correlated_new', leadId: lead.id, threadId: thread?.id ?? null, emailMessageId: emailMessage?.id ?? null, replyAnalysisRunId: null, continuedPipeline: true };
}

export async function buildReplyContext(userId: string, threadId: string): Promise<{ threadId: string; lastProviderMessageId: string | null; references: string | null; leadId: string | null }> {
  const thread = await db.emailThread.findFirst({ where: { id: threadId, emailAccount: { userId } }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
  if (!thread) throw new Error('Thread not found or not owned by caller');
  const providerIds = thread.messages.map(m => m.gmailMessageId).filter((id): id is string => !!id && !id.startsWith('inbound:'));
  return { threadId: thread.id, lastProviderMessageId: providerIds.length ? providerIds[providerIds.length - 1] : null, references: providerIds.length ? providerIds.join(' ') : null, leadId: thread.leadId };
}
