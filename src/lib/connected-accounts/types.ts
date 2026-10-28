// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workstream D §1 — Connected Account Architecture
//
// Server-side connected-account abstraction with three DISTINCT kinds:
//
//   AI_PROVIDER       — OpenAI / Anthropic / Gemini / DeepSeek / Z-AI / GLM /
//                       OpenRouter / local models. IMPLEMENTED BY WORKSTREAM B
//                       (UserAiProvider + user-ai-provider-service + model
//                       discovery). NOT duplicated here.
//   BUSINESS_ACCOUNT  — Hostinger Mail, Gmail (SMTP), other external business
//                       systems. Stored in ConnectedAccount, driven by
//                       provider-specific adapters behind a common interface.
//   HUMAN_CHANNEL     — Telegram (existing TelegramConfig + telegram-service).
//                       Surfaced through the same unified view.
//
// CAPABILITY RULES (per user spec):
//   · Only capabilities OFFICIALLY EXPOSED by the connected integration
//     are declared. A consumer ChatGPT connection does NOT grant access to
//     conversations/memory/browsing/private context.
//   · Every capability has an explicit permission scope.
//   · Secrets stay server-side (AES-256-GCM at rest, never serialized to
//     the browser, never logged).
// ═══════════════════════════════════════════════════════════════════

export type ConnectedAccountKind = 'ai_provider' | 'business_account' | 'human_channel';

// ─── Business-account capabilities (§3) ───────────────────────────────

export type EmailCapability =
  | 'email.verify'
  | 'email.search'
  | 'email.read'
  | 'email.thread'
  | 'email.inspect'
  | 'email.draft'
  | 'email.reply'
  | 'email.send'
  | 'email.mailbox';

export type ChatCapability =
  | 'chat.send'
  | 'chat.sendAction'
  | 'chat.receive';

export type BusinessCapability = EmailCapability | ChatCapability;

// ─── Credential shapes (server-side only — NEVER serialized to client) ──

export interface SmtpEmailCredentials {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName?: string;
}

// ─── Adapter interface (§3 — provider-specific adapters, common contract) ──

export interface AdapterCapabilityInfo {
  capability: BusinessCapability;
  available: boolean;
  unavailableReason?: string;
}

export interface ConnectedAccountAdapter {
  provider: string;
  describeCapabilities(credentials: unknown): AdapterCapabilityInfo[];
  validate(credentials: unknown): Promise<{ ok: boolean; error?: string; meta?: Record<string, unknown> }>;
  execute(capability: BusinessCapability, input: unknown, credentials: unknown): Promise<unknown>;
}

// ─── Unified view model (client-safe — NO secrets) ─────────────────────

export interface UnifiedConnectedAccountView {
  id: string;
  kind: ConnectedAccountKind;
  provider: string;
  accountIdentifier: string;
  accountType: string;
  status: string;
  capabilities: string[];
  scopes: string[];
  lastValidatedAt: string | null;
  lastError: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, unknown>;
  credentialMeta: Record<string, unknown>;
}

// ─── SMTP send input/output (used by the adapter + business-email-tools) ──

export interface SmtpSendInput {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
  references?: string;
}

export interface SmtpSendOutput {
  sent: boolean;
  messageId: string;
  accepted: string[];
  rejected?: string[];
}
