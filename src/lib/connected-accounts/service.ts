// Connected Account Service — Workstream D §1-3
import { db } from '@/lib/db';
import { encryptCredential, decryptCredential, maskCredential } from '@/lib/crypto/encryption';
import { smtpEmailAdapter } from './adapters/smtp-email';
import type { BusinessCapability, ConnectedAccountAdapter, ConnectedAccountKind, SmtpEmailCredentials, UnifiedConnectedAccountView } from './types';

const ADAPTERS: Record<string, ConnectedAccountAdapter> = {
  'hostinger-mail': smtpEmailAdapter,
  'gmail-smtp': smtpEmailAdapter,
  'smtp-email': smtpEmailAdapter,
};

export function getAdapter(provider: string): ConnectedAccountAdapter | null {
  return ADAPTERS[provider] ?? null;
}
export const SUPPORTED_BUSINESS_PROVIDERS = Object.keys(ADAPTERS);

export interface ConnectBusinessAccountInput {
  userId: string; provider: string; accountIdentifier: string;
  credentials: SmtpEmailCredentials; scopes?: string[]; meta?: Record<string, unknown>;
}
export interface ConnectResult { account: UnifiedConnectedAccountView; validation: { ok: boolean; error?: string } }

export async function connectBusinessAccount(input: ConnectBusinessAccountInput): Promise<ConnectResult> {
  const adapter = getAdapter(input.provider);
  if (!adapter) throw new Error(`Unsupported provider "${input.provider}"`);
  const validation = await adapter.validate(input.credentials);
  if (!validation.ok) throw new Error(`Validation failed: ${validation.error}`);
  const capabilities = adapter.describeCapabilities(input.credentials).filter(c => c.available).map(c => c.capability);
  const encrypted = encryptCredential(JSON.stringify(input.credentials));
  let row;
  try {
    row = await db.connectedAccount.upsert({
      where: { userId_provider_accountIdentifier: { userId: input.userId, provider: input.provider, accountIdentifier: input.accountIdentifier } },
      create: { userId: input.userId, kind: 'business_account', provider: input.provider, accountType: 'email', accountIdentifier: input.accountIdentifier, status: 'connected', capabilities: JSON.stringify(capabilities), credentialsEncrypted: encrypted, scopes: JSON.stringify(input.scopes ?? defaultScopesFor(capabilities)), meta: JSON.stringify(input.meta ?? {}), lastValidatedAt: new Date(), lastError: null, revokedAt: null },
      update: { status: 'connected', capabilities: JSON.stringify(capabilities), credentialsEncrypted: encrypted, scopes: JSON.stringify(input.scopes ?? defaultScopesFor(capabilities)), meta: JSON.stringify(input.meta ?? {}), lastValidatedAt: new Date(), lastError: null, revokedAt: null },
    });
  } catch { /* table may not exist yet — degrade gracefully */ throw new Error('ConnectedAccount table not available. Run prisma db push.'); }
  await writeAudit(input.userId, 'connected_account.connected', input.provider, { accountIdentifier: input.accountIdentifier, capabilities });
  return { account: toView(row), validation };
}

function defaultScopesFor(capabilities: BusinessCapability[]): string[] {
  return capabilities.map(c => c === 'email.send' || c === 'email.reply' ? `${c}:approval_required` : c);
}

export async function disconnectAccount(userId: string, accountId: string): Promise<void> {
  const row = await db.connectedAccount.findFirst({ where: { id: accountId, userId } });
  if (!row) throw new Error('Not found or not owned by caller');
  await db.connectedAccount.update({ where: { id: row.id }, data: { status: 'disconnected', revokedAt: new Date(), credentialsEncrypted: null } });
  await writeAudit(userId, 'connected_account.disconnected', row.provider, { accountIdentifier: row.accountIdentifier });
}

export async function revokeAccount(userId: string, accountId: string): Promise<void> {
  const row = await db.connectedAccount.findFirst({ where: { id: accountId, userId } });
  if (!row) throw new Error('Not found or not owned by caller');
  await db.connectedAccount.update({ where: { id: row.id }, data: { status: 'revoked', revokedAt: new Date(), credentialsEncrypted: null } });
  await writeAudit(userId, 'connected_account.revoked', row.provider, { accountIdentifier: row.accountIdentifier });
}

export async function validateAccount(userId: string, accountId: string): Promise<{ ok: boolean; error?: string }> {
  const row = await db.connectedAccount.findFirst({ where: { id: accountId, userId } });
  if (!row) throw new Error('Not found or not owned by caller');
  const adapter = getAdapter(row.provider);
  if (!adapter || !row.credentialsEncrypted) { await db.connectedAccount.update({ where: { id: row.id }, data: { status: 'error', lastError: 'No adapter or credentials' } }); return { ok: false, error: 'No adapter or credentials' }; }
  let credentials: unknown; try { credentials = JSON.parse(decryptCredential(row.credentialsEncrypted)); } catch (e) { return { ok: false, error: `Decryption failed: ${e instanceof Error ? e.message : String(e)}` }; }
  const result = await adapter.validate(credentials);
  await db.connectedAccount.update({ where: { id: row.id }, data: { status: result.ok ? 'connected' : 'error', lastValidatedAt: result.ok ? new Date() : row.lastValidatedAt, lastError: result.ok ? null : (result.error ?? 'validation failed') } });
  return result;
}

export interface ResolvedAccount { id: string; provider: string; accountIdentifier: string; capabilities: BusinessCapability[]; scopes: string[]; status: string; credentials: unknown }

export async function resolveAccountForCapability(userId: string, provider: string, requiredCapability: BusinessCapability): Promise<ResolvedAccount> {
  let rows: Array<{ id: string; provider: string; accountIdentifier: string; capabilities: string | null; scopes: string | null; status: string; credentialsEncrypted: string | null; lastValidatedAt: Date | null }> = [];
  try {
    rows = await db.connectedAccount.findMany({ where: { userId, provider, status: 'connected' }, orderBy: { lastValidatedAt: 'desc' } });
  } catch { /* table may not exist */ }
  for (const row of rows) {
    const capabilities = safeArray<BusinessCapability>(row.capabilities);
    const scopes = safeArray<string>(row.scopes);
    if (capabilities.includes(requiredCapability) && row.credentialsEncrypted) {
      let credentials: unknown; try { credentials = JSON.parse(decryptCredential(row.credentialsEncrypted)); } catch { continue; }
      return { id: row.id, provider: row.provider, accountIdentifier: row.accountIdentifier, capabilities, scopes, status: row.status, credentials };
    }
  }
  throw new Error(`No connected ${provider} account with capability "${requiredCapability}" for this user.`);
}

export function scopeGrantsCapability(scopes: string[], capability: BusinessCapability): boolean {
  return scopes.some(s => s === capability || s.startsWith(`${capability}:`));
}
export function scopeRequiresApproval(scopes: string[], capability: BusinessCapability): boolean {
  return scopes.some(s => s === `${capability}:approval_required`);
}

export async function listUnifiedConnectedAccounts(userId: string): Promise<UnifiedConnectedAccountView[]> {
  let businessRows: NonNullable<Awaited<ReturnType<typeof db.connectedAccount.findFirst>>>[] = [];
  let telegramConfig: { id: string; chatId: string | null; isConnected: boolean; username: string | null; botId: string | null; webhookVerified: boolean | null; mode: string | null; lastHealthCheckAt: Date | null; healthStatus: string | null; createdAt: Date; updatedAt: Date } | null = null;
  try { businessRows = await db.connectedAccount.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }); } catch { /* table may not exist */ }
  try { telegramConfig = await db.telegramConfig.findFirst({ where: { userId } }); } catch { /* non-fatal */ }
  const views: UnifiedConnectedAccountView[] = businessRows.map(toView);
  if (telegramConfig) {
    views.push({ id: telegramConfig.id, kind: 'human_channel', provider: 'telegram', accountIdentifier: telegramConfig.chatId || '(not linked)', accountType: 'chat', status: telegramConfig.isConnected ? 'connected' : 'disconnected', capabilities: telegramConfig.isConnected ? ['chat.send', 'chat.sendAction', 'chat.receive'] : [], scopes: telegramConfig.isConnected ? ['chat.send', 'chat.sendAction', 'chat.receive'] : [], lastValidatedAt: telegramConfig.lastHealthCheckAt?.toISOString() ?? null, lastError: telegramConfig.healthStatus?.startsWith('error') ? telegramConfig.healthStatus : null, revokedAt: null, createdAt: telegramConfig.createdAt.toISOString(), updatedAt: telegramConfig.updatedAt.toISOString(), meta: { username: telegramConfig.username, botId: telegramConfig.botId, webhookVerified: telegramConfig.webhookVerified, mode: telegramConfig.mode }, credentialMeta: { botToken: 'configured' } });
  }
  try { const { listUserAIProviders } = await import('@/lib/ai/user-ai-provider-service'); const providers = await listUserAIProviders(userId); for (const p of providers) { views.push({ id: p.id, kind: 'ai_provider', provider: p.provider, accountIdentifier: p.credentialHint || p.provider, accountType: 'ai_provider', status: p.status === 'active' ? 'connected' : (p.status === 'invalid' ? 'error' : 'disconnected'), capabilities: ['ai.chat', 'ai.models.list', ...(p.provider === 'z-ai' ? [] : ['ai.models.discover'])], scopes: ['ai.chat', 'ai.models.list'], lastValidatedAt: p.lastValidatedAt?.toISOString() ?? null, lastError: p.lastValidationError, revokedAt: null, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(), meta: { defaultModel: p.modelPreferences?.defaultModel ?? null, allowedModels: p.modelPreferences?.allowedModels?.length ?? 0 }, credentialMeta: { apiKey: p.credentialHint } }); } } catch { /* B's service unavailable */ }
  return views;
}

function toView(row: NonNullable<Awaited<ReturnType<typeof db.connectedAccount.findFirst>>>): UnifiedConnectedAccountView {
  let credentialMeta: Record<string, unknown> = {};
  try { if (row.credentialsEncrypted) { const creds = JSON.parse(decryptCredential(row.credentialsEncrypted)) as Record<string, unknown>; credentialMeta = { host: creds.host, port: creds.port, user: creds.user, password: maskCredential(String(creds.password ?? '')) }; } } catch { credentialMeta = { error: 'decrypt failed' }; }
  return { id: row.id, kind: 'business_account' as ConnectedAccountKind, provider: row.provider, accountIdentifier: row.accountIdentifier, accountType: row.accountType, status: row.status, capabilities: safeArray<string>(row.capabilities), scopes: safeArray<string>(row.scopes), lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null, lastError: row.lastError, revokedAt: row.revokedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), meta: safeRecord(row.meta), credentialMeta };
}
function safeArray<T>(raw: string | null | undefined): T[] { if (!raw) return []; try { const p = JSON.parse(raw); return Array.isArray(p) ? p as T[] : []; } catch { return []; } }
function safeRecord(raw: string | null | undefined): Record<string, unknown> { if (!raw) return {}; try { const p = JSON.parse(raw); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch { return {}; } }
async function writeAudit(userId: string, action: string, provider: string, details: Record<string, unknown>) { try { await db.auditLog.create({ data: { userId, action, resource: `connected_account:${provider}`, details: JSON.stringify(details), ipAddress: null, userAgent: null } }); } catch { /* best-effort */ } }
