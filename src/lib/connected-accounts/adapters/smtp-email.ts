// SMTP Email Adapter — Workstream D §3
// Honest capability reporting: SMTP supports send/reply/verify/draft/inspect.
// IMAP capabilities (search/read/thread/mailbox) are UNAVAILABLE — reported honestly.
import type { AdapterCapabilityInfo, BusinessCapability, ConnectedAccountAdapter, SmtpEmailCredentials } from '../types';
import type { SmtpSendInput, SmtpSendOutput } from '../types';

const IMAP_UNAVAILABLE_REASON = 'IMAP access is required for this capability but is not part of this SMTP integration. Gmail read access is available separately via the Gmail OAuth integration.';

function isSmtpCredentials(c: unknown): c is SmtpEmailCredentials {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  return typeof o.host === 'string' && o.host.length > 0
    && typeof o.user === 'string' && o.user.length > 0
    && typeof o.password === 'string' && o.password.length > 0
    && (typeof o.port === 'number' || typeof o.port === 'string');
}

async function createTransport(credentials: SmtpEmailCredentials) {
  const nodemailer = await import('nodemailer');
  return nodemailer.createTransport({
    host: credentials.host,
    port: Number(credentials.port) || (credentials.secure ? 465 : 587),
    secure: !!credentials.secure,
    auth: { user: credentials.user, pass: credentials.password },
    connectionTimeout: 15000, greetingTimeout: 12000, socketTimeout: 20000,
  });
}

export const smtpEmailAdapter: ConnectedAccountAdapter = {
  provider: 'hostinger-mail',
  describeCapabilities(_credentials: unknown): AdapterCapabilityInfo[] {
    return [
      { capability: 'email.verify', available: true },
      { capability: 'email.send', available: true },
      { capability: 'email.reply', available: true },
      { capability: 'email.draft', available: true },
      { capability: 'email.inspect', available: true },
      { capability: 'email.search', available: false, unavailableReason: IMAP_UNAVAILABLE_REASON },
      { capability: 'email.read', available: false, unavailableReason: IMAP_UNAVAILABLE_REASON },
      { capability: 'email.thread', available: false, unavailableReason: IMAP_UNAVAILABLE_REASON },
      { capability: 'email.mailbox', available: false, unavailableReason: IMAP_UNAVAILABLE_REASON },
    ];
  },
  async validate(credentials: unknown) {
    if (!isSmtpCredentials(credentials)) return { ok: false, error: 'Invalid SMTP credentials shape' };
    try {
      const transport = await createTransport(credentials);
      await transport.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
  async execute(capability: BusinessCapability, input: unknown, credentials: unknown): Promise<unknown> {
    if (!isSmtpCredentials(credentials)) throw new Error('Invalid SMTP credentials');
    if (capability === 'email.verify') {
      return this.validate(credentials);
    }
    if (capability === 'email.send' || capability === 'email.reply') {
      const smtpInput = input as SmtpSendInput;
      const transport = await createTransport(credentials);
      const from = credentials.fromName
        ? `${credentials.fromName} <${credentials.user}>`
        : credentials.user;
      const info = await transport.sendMail({
        from,
        to: smtpInput.to,
        subject: smtpInput.subject,
        text: smtpInput.text,
        html: smtpInput.html,
        replyTo: smtpInput.replyTo,
        cc: smtpInput.cc,
        bcc: smtpInput.bcc,
        inReplyTo: smtpInput.inReplyTo,
        references: smtpInput.references,
      });
      return {
        sent: true,
        messageId: info.messageId,
        accepted: info.accepted || [],
        rejected: info.rejected || [],
      } as SmtpSendOutput;
    }
    if (capability === 'email.draft') {
      // Drafts are persisted in the DB, not via SMTP — return the input as the draft
      return { drafted: true, draft: input };
    }
    if (capability === 'email.inspect') {
      const i = input as { to?: string; from?: string };
      return { to: i.to, from: i.from, inspected: true };
    }
    throw new Error(`Capability "${capability}" is not available on the SMTP adapter. ${IMAP_UNAVAILABLE_REASON}`);
  },
};
