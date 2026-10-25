// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — User AI Provider Service (Phase 26 v3)
//
// Per-user AI provider credential management + resolution.
//
// Resolution order (per Decision 1):
//   1. UserAIProvider row (encrypted) — user's own key
//   2. process.env (platform-provided key)
//   3. Explicit error (no silent fallback to Z-AI)
//
// All decrypted credentials stay server-side. NEVER returned to browser.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { encryptCredential, decryptCredential, maskCredential, canDecrypt } from '@/lib/crypto/encryption';
import type { ProviderType } from '@/lib/ai/ai-provider';

export interface UserAIProviderRow {
  id: string;
  userId: string;
  provider: string;
  credentialHint: string;
  modelPreferences: {
    defaultModel?: string;
    allowedModels?: string[];
  };
  status: 'active' | 'inactive' | 'invalid';
  lastValidatedAt: Date | null;
  lastValidationError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Env var name per provider — matches ai-provider.ts envVar convention.
const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'z-ai': 'ZAI_API_KEY',
  local: 'AI_LOCAL_ENDPOINT',
};

/**
 * Connect (or update) a user's AI provider credential.
 * Encrypts the API key with AES-256-GCM, stores only the masked hint
 * in a separate column for UI display.
 */
export async function connectUserAIProvider(params: {
  userId: string;
  provider: string;
  apiKey: string;
  modelPreferences?: { defaultModel?: string; allowedModels?: string[] };
}): Promise<UserAIProviderRow> {
  const { userId, provider, apiKey } = params;
  if (!userId) throw new Error('userId is required');
  if (!provider) throw new Error('provider is required');
  if (!apiKey || apiKey.trim().length < 8) {
    throw new Error('apiKey must be at least 8 characters');
  }
  if (!PROVIDER_ENV_KEYS[provider]) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const encrypted = encryptCredential(apiKey.trim());
  const hint = maskCredential(apiKey.trim());
  const modelPrefs = JSON.stringify(params.modelPreferences || {});

  const row = await db.userAIProvider.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId, provider,
      encryptedCredential: encrypted,
      credentialHint: hint,
      modelPreferences: modelPrefs,
      status: 'active',
      lastValidatedAt: new Date(),
    },
    update: {
      encryptedCredential: encrypted,
      credentialHint: hint,
      modelPreferences: modelPrefs,
      status: 'active',
      lastValidatedAt: new Date(),
      lastValidationError: null,
    },
  });

  return toApiShape(row);
}

/**
 * Disconnect (delete) a user's AI provider credential.
 * Removes the encrypted credential entirely.
 */
export async function disconnectUserAIProvider(params: {
  userId: string;
  provider: string;
}): Promise<{ disconnected: boolean }> {
  const { userId, provider } = params;
  const result = await db.userAIProvider.deleteMany({
    where: { userId, provider },
  });
  return { disconnected: result.count > 0 };
}

/**
 * List all connected AI providers for a user.
 * Returns masked hints only — NEVER the decrypted key.
 */
export async function listUserAIProviders(userId: string): Promise<UserAIProviderRow[]> {
  const rows = await db.userAIProvider.findMany({
    where: { userId },
    orderBy: { provider: 'asc' },
  });
  return rows.map(toApiShape);
}

/**
 * Resolve the API key for a (userId, provider) pair.
 *
 * Resolution order (per Decision 1):
 *   1. UserAIProvider row (encrypted) — user's own key
 *   2. process.env (platform-provided key)
 *   3. throw ExplicitProviderUnavailableError
 *
 * The decrypted value is returned ONLY to the server-side caller
 * (executeAICompletion). NEVER returned to the browser.
 */
export async function resolveProviderApiKey(userId: string, provider: string): Promise<{
  apiKey: string;
  source: 'user' | 'platform';
}> {
  // 1. User-connected credential
  const userRow = await db.userAIProvider.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (userRow && userRow.status === 'active') {
    try {
      const decrypted = decryptCredential(userRow.encryptedCredential);
      if (decrypted && canDecrypt(userRow.encryptedCredential)) {
        return { apiKey: decrypted, source: 'user' };
      }
    } catch (err) {
      // Decryption failed — fall through to platform
      console.warn(`[UserAIProvider] decrypt failed for user=${userId} provider=${provider}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Platform-provided credential
  const envKey = PROVIDER_ENV_KEYS[provider];
  if (envKey) {
    const envValue = process.env[envKey];
    if (envValue && envValue.trim().length > 0) {
      return { apiKey: envValue.trim(), source: 'platform' };
    }
  }

  // 3. Explicit error
  throw new ExplicitProviderUnavailableError(
    provider,
    `Provider "${provider}" is not configured. Connect it in Settings → Integrations → AI Providers, or ask the platform operator to set ${envKey || 'the env var'}.`,
  );
}

/**
 * Check whether a (userId, provider) pair has ANY usable credential.
 * Returns true if either user-connected or platform-provided key exists.
 */
export async function isProviderAvailable(userId: string, provider: string): Promise<{
  available: boolean;
  source: 'user' | 'platform' | 'none';
}> {
  const userRow = await db.userAIProvider.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (userRow && userRow.status === 'active' && canDecrypt(userRow.encryptedCredential)) {
    return { available: true, source: 'user' };
  }
  const envKey = PROVIDER_ENV_KEYS[provider];
  if (envKey && process.env[envKey] && process.env[envKey]!.trim().length > 0) {
    return { available: true, source: 'platform' };
  }
  return { available: false, source: 'none' };
}

/**
 * Mark a provider's credential as invalid (e.g., after a 401 from the provider).
 */
export async function markProviderInvalid(params: {
  userId: string;
  provider: string;
  error: string;
}): Promise<void> {
  await db.userAIProvider.updateMany({
    where: { userId: params.userId, provider: params.provider },
    data: {
      status: 'invalid',
      lastValidationError: params.error.slice(0, 500),
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function toApiShape(row: {
  id: string; userId: string; provider: string;
  credentialHint: string; modelPreferences: string;
  status: string; lastValidatedAt: Date | null; lastValidationError: string | null;
  createdAt: Date; updatedAt: Date;
}): UserAIProviderRow {
  let modelPrefs: UserAIProviderRow['modelPreferences'] = {};
  try { modelPrefs = JSON.parse(row.modelPreferences || '{}'); } catch { /* keep default */ }
  return {
    id: row.id, userId: row.userId, provider: row.provider,
    credentialHint: row.credentialHint,
    modelPreferences: modelPrefs,
    status: row.status as UserAIProviderRow['status'],
    lastValidatedAt: row.lastValidatedAt,
    lastValidationError: row.lastValidationError,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

export class ExplicitProviderUnavailableError extends Error {
  public readonly provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.name = 'ExplicitProviderUnavailableError';
    this.provider = provider;
  }
}
