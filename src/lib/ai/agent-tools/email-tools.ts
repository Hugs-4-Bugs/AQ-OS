// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Agent Tools (Phase 26 v2 — Part 7)
//
// Agentic email operations with permission/policy boundaries.
// Reuses the existing Gmail OAuth integration (EmailAccount table +
// getValidAccessToken) for READ and the existing sendEmail() function
// for WRITE.
//
// Permission boundaries (per user spec Part 7):
//   read             → email.search, email.read, email.thread only
//   draft            → above + email.draft (creates a draft, never sends)
//   send_with_approval → above + email.reply / email.send WITH a human
//                       approval token required at the call site
//   autonomous       → above + email.send / email.reply WITHOUT
//                       approval (typically reserved for follow-ups in
//                       an Autopilot workflow that the user explicitly
//                       authorized)
//
// CRITICAL RULES:
// - NEVER expose Gmail OAuth tokens to the model — tokens stay
//   server-side in the tool implementation.
// - NEVER automatically send email unless ctx.emailPermission is
//   'send_with_approval' or 'autonomous' (and the approval token, if
//   required, is verified by the caller BEFORE invoking the tool).
// - All email operations are audited via the agent-tool audit log +
//   Phase 25 ExecutionActivity.
// ═══════════════════════════════════════════════════════════════════

import { registerTool } from './registry';
import { type ToolContext, type ToolResult } from './types';

// ─── Helper: resolve the user's active connected Gmail account ──────

async function resolveActiveEmailAccount(userId: string): Promise<{
  accountId: string;
  accessToken: string;
  gmailEmail: string;
} | null> {
  try {
    const { db } = await import('@/lib/db');
    const account = await db.emailAccount.findFirst({
      where: { userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, gmailEmail: true },
    });
    if (!account) return null;
    const { getValidAccessToken } = await import('@/lib/gmail-oauth-service');
    const accessToken = await getValidAccessToken(account.id);
    return { accountId: account.id, accessToken, gmailEmail: account.gmailEmail };
  } catch {
    return null;
  }
}

// ─── email.search ─────────────────────────────────────────────────────

registerTool({
  name: 'email.search',
  description: 'Search the authenticated user\'s connected Gmail mailbox. Required: query (Gmail search syntax). Optional: maxResults (default 10, cap 50). Returns message IDs + snippets. Read-only — requires email permission level "read" or higher.',
  category: 'email',
  readOnly: true,
  idempotent: true,
  emailPermissionLevel: 'read',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string', description: 'Required. Gmail search query (e.g. "from:customer@example.com newer_than:7d").' },
      maxResults: { type: 'number', description: 'Optional. Max results (default 10, cap 50).' },
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      messages: { type: 'array', description: 'Array of {id, threadId, snippet, from, subject, date}.' },
    },
  },
  async execute(input: { query: string; maxResults?: number }, ctx: ToolContext): Promise<ToolResult> {
    const account = await resolveActiveEmailAccount(ctx.userId);
    if (!account) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: 'No active Gmail account connected. User must connect Gmail in Settings → Integrations first.',
      };
    }
    const maxResults = Math.min(Math.max(input.maxResults ?? 10, 1), 50);
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(input.query)}&maxResults=${maxResults}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: `Gmail search failed: HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const messageIds: Array<{ id: string; threadId: string }> = data.messages || [];
    // Fetch metadata for each (subject, from, date, snippet).
    const messages: Array<Record<string, unknown>> = [];
    for (const m of messageIds.slice(0, maxResults)) {
      try {
        const mres = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
          headers: { Authorization: `Bearer ${account.accessToken}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!mres.ok) continue;
        const mdata = await mres.json();
        const headers: Array<{ name: string; value: string }> = mdata.payload?.headers || [];
        const from = headers.find((h) => h.name === 'From')?.value || '';
        const subject = headers.find((h) => h.name === 'Subject')?.value || '';
        const date = headers.find((h) => h.name === 'Date')?.value || '';
        messages.push({ id: m.id, threadId: m.threadId, snippet: mdata.snippet || '', from, subject, date });
      } catch {
        // Skip individual message fetch failures — partial result is OK.
      }
    }
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { messages },
    };
  },
});

// ─── email.read ──────────────────────────────────────────────────────

registerTool({
  name: 'email.read',
  description: 'Read a single Gmail message by ID. Returns full body (text/plain + text/html if available), headers (from, to, subject, date). Read-only — requires email permission level "read" or higher.',
  category: 'email',
  readOnly: true,
  idempotent: true,
  emailPermissionLevel: 'read',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      messageId: { type: 'string', description: 'Required. Gmail message ID.' },
    },
    required: ['messageId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      message: { type: 'object', description: 'Message payload (id, threadId, from, to, subject, date, bodyPlain, bodyHtml).' },
    },
  },
  async execute(input: { messageId: string }, ctx: ToolContext): Promise<ToolResult> {
    const account = await resolveActiveEmailAccount(ctx.userId);
    if (!account) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: 'No active Gmail account connected',
      };
    }
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${input.messageId}?format=full`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: `Gmail read failed: HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const headers: Array<{ name: string; value: string }> = data.payload?.headers || [];
    const get = (n: string) => headers.find((h) => h.name === n)?.value || '';
    // Extract first text/plain and text/html parts (best-effort — full
    // multipart walking is intentionally omitted to keep payloads sane
    // for the model).
    let bodyPlain = '';
    let bodyHtml = '';
    if (data.payload?.body?.data) {
      bodyPlain = Buffer.from(data.payload.body.data, 'base64').toString('utf8');
    } else if (Array.isArray(data.payload?.parts)) {
      for (const part of data.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data && !bodyPlain) {
          bodyPlain = Buffer.from(part.body.data, 'base64').toString('utf8');
        }
        if (part.mimeType === 'text/html' && part.body?.data && !bodyHtml) {
          bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf8');
        }
      }
    }
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: {
        message: {
          id: data.id,
          threadId: data.threadId,
          from: get('From'),
          to: get('To'),
          subject: get('Subject'),
          date: get('Date'),
          bodyPlain,
          bodyHtml,
        },
      },
    };
  },
});

// ─── email.thread ───────────────────────────────────────────────────

registerTool({
  name: 'email.thread',
  description: 'Retrieve a full Gmail thread by thread ID. Returns array of messages in the thread. Read-only — requires email permission level "read" or higher.',
  category: 'email',
  readOnly: true,
  idempotent: true,
  emailPermissionLevel: 'read',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      threadId: { type: 'string', description: 'Required. Gmail thread ID.' },
    },
    required: ['threadId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      messages: { type: 'array', description: 'Array of messages in the thread.' },
    },
  },
  async execute(input: { threadId: string }, ctx: ToolContext): Promise<ToolResult> {
    const account = await resolveActiveEmailAccount(ctx.userId);
    if (!account) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: 'No active Gmail account connected',
      };
    }
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${input.threadId}`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: `Gmail thread fetch failed: HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const messages: Array<Record<string, unknown>> = (data.messages || []).map((m: Record<string, unknown>) => {
      const payload = m.payload as { headers?: Array<{ name: string; value: string }> } | undefined;
      const headers = payload?.headers || [];
      const get = (n: string) => headers.find((h) => h.name === n)?.value || '';
      return { id: m.id, from: get('From'), subject: get('Subject'), date: get('Date'), snippet: m.snippet };
    });
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { messages },
    };
  },
});

// ─── email.draft ─────────────────────────────────────────────────────

registerTool({
  name: 'email.draft',
  description: 'Create a Gmail draft (NOT sent — saved in the user\'s Drafts folder). Required: to + subject + body. Requires email permission level "draft" or higher.',
  category: 'email',
  readOnly: false,
  idempotent: true,
  emailPermissionLevel: 'draft',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      to: { type: 'string', description: 'Required. Recipient email.' },
      subject: { type: 'string', description: 'Required. Email subject.' },
      body: { type: 'string', description: 'Required. Email body (plain text).' },
      threadId: { type: 'string', description: 'Optional. Thread ID to attach the draft to.' },
    },
    required: ['to', 'subject', 'body'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      draftId: { type: 'string', description: 'Created Gmail draft ID.' },
    },
  },
  async execute(input: { to: string; subject: string; body: string; threadId?: string }, ctx: ToolContext): Promise<ToolResult> {
    const account = await resolveActiveEmailAccount(ctx.userId);
    if (!account) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: 'No active Gmail account connected',
      };
    }
    // Build RFC 2822 message
    const emailRfc = [
      `From: ${account.gmailEmail}`,
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      input.body,
    ].join('\r\n');
    const base64Url = Buffer.from(emailRfc).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const body: Record<string, unknown> = { message: { raw: base64Url } };
    if (input.threadId) body.message.threadId = input.threadId;
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown');
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: `Gmail draft create failed: HTTP ${res.status}: ${errText}`,
      };
    }
    const data = await res.json();
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { draftId: data.id },
    };
  },
});

// ─── email.reply ─────────────────────────────────────────────────────

registerTool({
  name: 'email.reply',
  description: 'Reply to a Gmail message by ID. Sends the email IMMEDIATELY (not a draft). Required: messageId + body. Subject + To are derived from the original message. Requires email permission level "send_with_approval" or "autonomous". The caller MUST verify the human approval token (when level is "send_with_approval") BEFORE invoking this tool — the tool itself does not prompt for approval.',
  category: 'email',
  readOnly: false,
  idempotent: true,
  emailPermissionLevel: 'send_with_approval',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      messageId: { type: 'string', description: 'Required. ID of the message to reply to.' },
      body: { type: 'string', description: 'Required. Reply body (plain text).' },
    },
    required: ['messageId', 'body'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      sentMessageId: { type: 'string', description: 'Sent message ID from Gmail.' },
    },
  },
  async execute(input: { messageId: string; body: string }, ctx: ToolContext): Promise<ToolResult> {
    const account = await resolveActiveEmailAccount(ctx.userId);
    if (!account) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: 'No active Gmail account connected',
      };
    }
    // Fetch the original message to get Subject + From + References.
    const origRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${input.messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID&metadataHeaders=References`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!origRes.ok) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: `Original message fetch failed: HTTP ${origRes.status}`,
      };
    }
    const origData = await origRes.json();
    const headers: Array<{ name: string; value: string }> = origData.payload?.headers || [];
    const get = (n: string) => headers.find((h) => h.name === n)?.value || '';
    const subject = get('Subject');
    const from = get('From');
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    const emailRfc = [
      `From: ${account.gmailEmail}`,
      `To: ${from}`,
      `Subject: ${replySubject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      input.body,
    ].join('\r\n');
    const base64Url = Buffer.from(emailRfc).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    // send + threadId keeps the reply in the same thread
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64Url, threadId: origData.threadId }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown');
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: `Gmail send failed: HTTP ${res.status}: ${errText}`,
      };
    }
    const data = await res.json();
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { sentMessageId: data.id },
    };
  },
});

// ─── email.send ──────────────────────────────────────────────────────

registerTool({
  name: 'email.send',
  description: 'Send a brand-new email (not a reply). Required: to + subject + body. Sends IMMEDIATELY. Requires email permission level "send_with_approval" or "autonomous". For autonomous outreach (e.g. Autopilot follow-ups), pass ctx.emailPermission="autonomous". For human-approved one-offs, pass ctx.emailPermission="send_with_approval" and verify approval BEFORE invoking.',
  category: 'email',
  readOnly: false,
  idempotent: true,
  emailPermissionLevel: 'send_with_approval',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      to: { type: 'string', description: 'Required. Recipient email.' },
      subject: { type: 'string', description: 'Required. Email subject.' },
      body: { type: 'string', description: 'Required. Email body (plain text).' },
    },
    required: ['to', 'subject', 'body'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      sentMessageId: { type: 'string', description: 'Sent message ID from Gmail.' },
    },
  },
  async execute(input: { to: string; subject: string; body: string }, ctx: ToolContext): Promise<ToolResult> {
    const account = await resolveActiveEmailAccount(ctx.userId);
    if (!account) {
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: 'No active Gmail account connected',
      };
    }
    const emailRfc = [
      `From: ${account.gmailEmail}`,
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      input.body,
    ].join('\r\n');
    const base64Url = Buffer.from(emailRfc).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64Url }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown');
      return {
        status: 'error',
        toolInvocationId: '',
        durationMs: 0,
        error: `Gmail send failed: HTTP ${res.status}: ${errText}`,
      };
    }
    const data = await res.json();
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { sentMessageId: data.id },
    };
  },
});
