// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Model Discovery Service (Workstream B — Decision 5)
//
// Live model discovery for providers that expose an authenticated list
// endpoint. Performs a real API call, normalizes the response, persists
// the result to the DiscoveredModel table (per-user, per-provider), and
// returns the normalized model list with capability metadata.
//
// Providers supported for live discovery:
//   · OpenAI — GET https://api.openai.com/v1/models
//   · Gemini — GET https://generativelanguage.googleapis.com/v1beta/models
//   · DeepSeek — GET https://api.deepseek.com/v1/models
//   · OpenRouter — GET https://openrouter.ai/api/v1/models
//
// Providers using the maintained catalog (no live discovery):
//   · Anthropic — no public /v1/models endpoint
//   · Z-AI — SDK gateway, no per-credential list
//   · Local — user-supplied endpoint
//
// Security:
//   · Credentials are resolved via resolveProviderApiKey (user → platform
//     → ExplicitProviderUnavailableError). NEVER silently substituted.
//   · Discovered models are scoped per-user — User B cannot read User A's
//     discoveries.
//   · Raw metadata stored is sanitized (never includes auth tokens).
//   · Model list responses are capped to 200 entries to prevent abuse.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { resolveProviderApiKey } from '@/lib/ai/user-ai-provider-service';
import {
  getProviderCatalog,
  providerSupportsLiveDiscovery,
  type CatalogModel,
} from '@/lib/ai/model-catalog';

// ─── Types ───────────────────────────────────────────────────────────

export interface DiscoveredModelInfo {
  modelId: string;
  displayName: string | null;
  source: 'live' | 'catalog';
  contextLength: number | null;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsReasoning: boolean;
  inputModalities: string[];
  outputModalities: string[];
  availability: string | null; // available | deprecated | preview | unknown
  lastVerifiedAt: Date;
}

export interface DiscoveryResult {
  provider: string;
  source: 'live' | 'catalog' | 'none';
  models: DiscoveredModelInfo[];
  message: string;
  /** True when the credential was actually exercised against the provider. */
  exercisedCredential: boolean;
  /** Present when the credential could not be resolved or the API call failed. */
  error?: string;
}

// ─── Provider list-endpoint adapters ────────────────────────────────
//
// Each adapter: takes the resolved apiKey, performs an authenticated
// GET request to the provider's model-list endpoint, normalizes the
// response into NormalizedLiveModel[].
//
// Adapter contract:
//   · On HTTP 401/403: throw Error('Credential rejected by provider')
//   · On HTTP 429: throw Error('Rate limited by provider')
//   · On HTTP 5xx: throw Error('Provider unavailable')
//   · On network error: throw Error('Provider unreachable')
//   · On success: return NormalizedLiveModel[] (may be empty)

interface NormalizedLiveModel {
  modelId: string;
  displayName?: string;
  contextLength?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsStructuredOutput?: boolean;
  supportsReasoning?: boolean;
  inputModalities?: string[];
  outputModalities?: string[];
  availability?: string;
  rawMetadata?: unknown;
}

const LIST_TIMEOUT_MS = 15000;
const MAX_MODELS_PER_PROVIDER = 200;

function classifyHttpError(status: number): string {
  if (status === 401 || status === 403) return 'Credential rejected by provider';
  if (status === 429) return 'Rate limited by provider';
  if (status >= 500) return 'Provider unavailable';
  return `Provider returned HTTP ${status}`;
}

// ── OpenAI ─────────────────────────────────────────────────────────
async function listOpenAIModels(apiKey: string): Promise<NormalizedLiveModel[]> {
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${classifyHttpError(res.status)}: ${text.slice(0, 120)}`);
  }
  const data = await res.json() as { data?: Array<{ id: string; owned_by?: string; context_length?: number; context_window?: number }> };
  const items = Array.isArray(data.data) ? data.data : [];
  return items.slice(0, MAX_MODELS_PER_PROVIDER).map((m) => ({
    modelId: m.id,
    displayName: m.id,
    // OpenAI /v1/models does NOT include context_length for most models;
    // we leave it null rather than fabricate.
    contextLength: m.context_length ?? m.context_window ?? undefined,
    // OpenAI exposes capabilities at the model object level only via
    // separate endpoints; conservatively mark unknowns as false.
    supportsTools: undefined,
    supportsStructuredOutput: undefined,
    supportsVision: undefined,
    supportsReasoning: undefined,
    availability: 'available',
    rawMetadata: { owned_by: m.owned_by },
  }));
}

// ── Gemini ─────────────────────────────────────────────────────────
async function listGeminiModels(apiKey: string): Promise<NormalizedLiveModel[]> {
  const baseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${baseUrl}/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${classifyHttpError(res.status)}: ${text.slice(0, 120)}`);
  }
  const data = await res.json() as {
    models?: Array<{
      name: string; // e.g. "models/gemini-1.5-flash"
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
      inputTokenLimit?: number;
      outputTokenLimit?: number;
    }>
  };
  const items = Array.isArray(data.models) ? data.models : [];
  return items.slice(0, MAX_MODELS_PER_PROVIDER).map((m) => {
    const modelId = (m.name || '').replace(/^models\//, '');
    // Gemini's "supportedGenerationMethods" includes things like "generateContent"
    // (text/vision), "generateContentStream", "countTokens". We infer:
    //   · supportsVision if methods include "generateContent"
    //   · supportsTools if methods include "generateContent" (Gemini tool calls
    //     ride on the same generateContent endpoint)
    // Conservative: do NOT mark structured output or reasoning unless the
    // model name implies it (e.g. gemini-1.5-pro supports structured output).
    const methods = m.supportedGenerationMethods || [];
    const supportsVision = methods.includes('generateContent');
    const supportsTools = methods.includes('generateContent');
    const supportsStructuredOutput = /gemini-1\.5-pro|gemini-2\.|gemini-3\./.test(modelId);
    const supportsReasoning = /gemini-2\.[0-9]*-pro|gemini-3\./.test(modelId);
    const ctx = m.inputTokenLimit ?? undefined;
    return {
      modelId,
      displayName: m.displayName || modelId,
      contextLength: ctx,
      supportsVision,
      supportsTools,
      supportsStructuredOutput,
      supportsReasoning,
      inputModalities: supportsVision ? ['text', 'image'] : ['text'],
      outputModalities: ['text'],
      availability: 'available',
      rawMetadata: {
        description: m.description?.slice(0, 200),
        supportedGenerationMethods: methods,
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit,
      },
    };
  });
}

// ── DeepSeek ───────────────────────────────────────────────────────
async function listDeepSeekModels(apiKey: string): Promise<NormalizedLiveModel[]> {
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${classifyHttpError(res.status)}: ${text.slice(0, 120)}`);
  }
  const data = await res.json() as { data?: Array<{ id: string }> };
  const items = Array.isArray(data.data) ? data.data : [];
  return items.slice(0, MAX_MODELS_PER_PROVIDER).map((m) => {
    const id = m.id;
    // DeepSeek models: deepseek-chat (V3 chat) and deepseek-reasoner (R1).
    // Both support tools + structured output (OpenAI-compatible).
    const isReasoner = /reasoner|reasoning|deepseek-r1/.test(id);
    return {
      modelId: id,
      displayName: id,
      supportsTools: true,
      supportsStructuredOutput: true,
      supportsReasoning: isReasoner,
      supportsVision: false,
      availability: 'available',
      rawMetadata: { id },
    };
  });
}

// ── OpenRouter ─────────────────────────────────────────────────────
async function listOpenRouterModels(apiKey: string): Promise<NormalizedLiveModel[]> {
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${classifyHttpError(res.status)}: ${text.slice(0, 120)}`);
  }
  const data = await res.json() as {
    data?: Array<{
      id: string; // e.g. "openai/gpt-4o"
      name?: string;
      context_length?: number;
      architecture?: {
        modality?: string; // e.g. "text+image->text"
        input_modalities?: string[];
        output_modalities?: string[];
        tool_choice?: boolean;
      };
      pricing?: { prompt: string; completion: string };
    }>
  };
  const items = Array.isArray(data.data) ? data.data : [];
  return items.slice(0, MAX_MODELS_PER_PROVIDER).map((m) => {
    const arch = m.architecture || {};
    const modality = arch.modality || '';
    const supportsVision = (arch.input_modalities || []).includes('image') || /image/.test(modality);
    const supportsTools = arch.tool_choice === true;
    return {
      modelId: m.id,
      displayName: m.name || m.id,
      contextLength: m.context_length,
      supportsVision,
      supportsTools,
      supportsStructuredOutput: supportsTools, // OpenRouter exposes tool_choice
      supportsReasoning: /-reasoning|\/o1|\/o3|\/r1/.test(m.id),
      inputModalities: arch.input_modalities || ['text'],
      outputModalities: arch.output_modalities || ['text'],
      availability: 'available',
      rawMetadata: {
        architecture: { modality: arch.modality },
        pricing: m.pricing ? { prompt: m.pricing.prompt, completion: m.pricing.completion } : undefined,
      },
    };
  });
}

// ─── Provider dispatch ────────────────────────────────────────────────

const LIVE_LIST_ADAPTERS: Record<string, (apiKey: string) => Promise<NormalizedLiveModel[]>> = {
  openai: listOpenAIModels,
  gemini: listGeminiModels,
  deepseek: listDeepSeekModels,
  openrouter: listOpenRouterModels,
};

// ─── Persistence ─────────────────────────────────────────────────────

/**
 * Persist (upsert) a list of discovered models for a user+provider.
 * Each row stores the normalized capability metadata + lastVerifiedAt.
 * Models that previously existed but were not in the latest list
 * remain in the table (their lastVerifiedAt is NOT updated) — this is
 * intentional: a transient list miss should not silently mark a
 * model as "removed" (the user's credential may simply be missing a
 * permission scope).
 */
async function persistDiscoveredModels(params: {
  userId: string;
  provider: string;
  source: 'live' | 'catalog';
  models: NormalizedLiveModel[] | CatalogModel[];
}): Promise<void> {
  const now = new Date();
  for (const m of params.models) {
    const input = Array.isArray(m.inputModalities) ? JSON.stringify(m.inputModalities) : null;
    const output = Array.isArray(m.outputModalities) ? JSON.stringify(m.outputModalities) : null;
    const raw = m.rawMetadata ? JSON.stringify(m.rawMetadata).slice(0, 4000) : null;
    await db.discoveredModel.upsert({
      where: {
        userId_provider_modelId: {
          userId: params.userId,
          provider: params.provider,
          modelId: m.modelId,
        },
      },
      create: {
        userId: params.userId,
        provider: params.provider,
        modelId: m.modelId,
        displayName: m.displayName ?? null,
        source: params.source,
        contextLength: m.contextLength ?? null,
        supportsVision: m.supportsVision ?? false,
        supportsTools: m.supportsTools ?? false,
        supportsStructuredOutput: m.supportsStructuredOutput ?? false,
        supportsReasoning: m.supportsReasoning ?? false,
        inputModalities: input,
        outputModalities: output,
        availability: m.availability ?? 'unknown',
        lastVerifiedAt: now,
        rawMetadata: raw,
      },
      update: {
        displayName: m.displayName ?? null,
        source: params.source,
        contextLength: m.contextLength ?? null,
        supportsVision: m.supportsVision ?? false,
        supportsTools: m.supportsTools ?? false,
        supportsStructuredOutput: m.supportsStructuredOutput ?? false,
        supportsReasoning: m.supportsReasoning ?? false,
        inputModalities: input,
        outputModalities: output,
        availability: m.availability ?? 'unknown',
        lastVerifiedAt: now,
        rawMetadata: raw,
      },
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Discover models for a user's provider credential.
 *
 * If the provider supports live discovery, performs an authenticated
 * list request, persists results, and returns normalized models.
 *
 * If the provider does NOT support live discovery, falls back to the
 * maintained catalog (per user spec Workstream B §5), persists the
 * catalog with source='catalog', and returns it.
 *
 * If the credential cannot be resolved (no user credential AND no
 * platform env var), returns an empty result with source='none' +
 * error message. Does NOT throw — the caller (validate/route.ts)
 * decides how to surface this.
 */
export async function discoverModelsForProvider(params: {
  userId: string;
  provider: string;
}): Promise<DiscoveryResult> {
  const { userId, provider } = params;

  // Catalog-only providers (Anthropic, Z-AI, Local)
  if (!providerSupportsLiveDiscovery(provider)) {
    const catalog = getProviderCatalog(provider);
    if (!catalog) {
      return {
        provider, source: 'none', models: [],
        exercisedCredential: false,
        message: `No catalog and no live discovery support for provider "${provider}"`,
        error: 'unsupported provider',
      };
    }
    // Even for catalog providers, we want to ensure the user has a
    // resolvable credential (so we don't surface a "model list" for
    // a provider the user cannot actually invoke). But catalog
    // entries do not require a real API call to enumerate.
    try {
      await resolveProviderApiKey(userId, provider);
    } catch (err) {
      return {
        provider, source: 'catalog', models: [],
        exercisedCredential: false,
        message: `Catalog available but credential not resolved for ${provider}`,
        error: err instanceof Error ? err.message : 'credential unavailable',
      };
    }
    await persistDiscoveredModels({
      userId, provider, source: 'catalog',
      models: catalog.models,
    });
    return {
      provider, source: 'catalog', models: catalog.models.map(toDiscoveredInfo),
      exercisedCredential: false,
      message: `Catalog cached for ${provider} (${catalog.models.length} models, source: ${catalog.catalogSourceUrl})`,
    };
  }

  // Live discovery providers (OpenAI, Gemini, DeepSeek, OpenRouter)
  const adapter = LIVE_LIST_ADAPTERS[provider];
  if (!adapter) {
    return {
      provider, source: 'none', models: [],
      exercisedCredential: false,
      message: `No live-discovery adapter for provider "${provider}"`,
      error: 'unsupported provider',
    };
  }

  let apiKey: string;
  let source: 'user' | 'platform';
  try {
    const resolved = await resolveProviderApiKey(userId, provider);
    apiKey = resolved.apiKey;
    source = resolved.source;
  } catch (err) {
    return {
      provider, source: 'none', models: [],
      exercisedCredential: false,
      message: `Credential not resolved for ${provider}`,
      error: err instanceof Error ? err.message : 'credential unavailable',
    };
  }

  try {
    const live = await adapter(apiKey);
    await persistDiscoveredModels({
      userId, provider, source: 'live',
      models: live,
    });
    return {
      provider, source: 'live', models: live.map(toDiscoveredInfo),
      exercisedCredential: true,
      message: `Live discovery succeeded for ${provider} (${live.length} models, credential source: ${source})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      provider, source: 'live', models: [],
      exercisedCredential: true,
      message: `Live discovery failed for ${provider}`,
      error: msg,
    };
  }
}

// ─── Read API (cached) ────────────────────────────────────────────────

/**
 * Read cached discovered models for a user+provider. Does NOT perform
 * any API call. Returns the last-persisted state from the DB.
 *
 * Use this for the model selector dropdown (UI) — fast, no network,
 * reflects the last validation result.
 */
export async function getCachedDiscoveredModels(userId: string, provider: string): Promise<DiscoveredModelInfo[]> {
  const rows = await db.discoveredModel.findMany({
    where: { userId, provider },
    orderBy: [{ availability: 'asc' }, { modelId: 'asc' }],
  });
  return rows.map(toInfoFromRow);
}

/**
 * Read cached discovered models for ALL of a user's providers in one
 * call. Used to populate the workflow/agent model selectors with
 * per-provider breakdown.
 */
export async function getCachedDiscoveredModelsForAllProviders(
  userId: string
): Promise<Record<string, DiscoveredModelInfo[]>> {
  const rows = await db.discoveredModel.findMany({
    where: { userId },
    orderBy: [{ provider: 'asc' }, { modelId: 'asc' }],
  });
  const out: Record<string, DiscoveredModelInfo[]> = {};
  for (const r of rows) {
    if (!out[r.provider]) out[r.provider] = [];
    out[r.provider].push(toInfoFromRow(r));
  }
  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function toDiscoveredInfo(m: NormalizedLiveModel | CatalogModel): DiscoveredModelInfo {
  return {
    modelId: m.modelId,
    displayName: m.displayName ?? null,
    source: (m as NormalizedLiveModel).rawMetadata !== undefined ? 'live' : 'catalog',
    contextLength: m.contextLength ?? null,
    supportsVision: m.supportsVision ?? false,
    supportsTools: m.supportsTools ?? false,
    supportsStructuredOutput: m.supportsStructuredOutput ?? false,
    supportsReasoning: m.supportsReasoning ?? false,
    inputModalities: m.inputModalities ?? [],
    outputModalities: m.outputModalities ?? [],
    availability: m.availability ?? 'unknown',
    lastVerifiedAt: new Date(),
  };
}

function toInfoFromRow(r: {
  modelId: string; displayName: string | null; source: string;
  contextLength: number | null;
  supportsVision: boolean; supportsTools: boolean;
  supportsStructuredOutput: boolean; supportsReasoning: boolean;
  inputModalities: string | null; outputModalities: string | null;
  availability: string | null; lastVerifiedAt: Date;
}): DiscoveredModelInfo {
  let inputMods: string[] = [];
  let outputMods: string[] = [];
  try { inputMods = r.inputModalities ? JSON.parse(r.inputModalities) : []; } catch { inputMods = []; }
  try { outputMods = r.outputModalities ? JSON.parse(r.outputModalities) : []; } catch { outputMods = []; }
  return {
    modelId: r.modelId,
    displayName: r.displayName,
    source: r.source as 'live' | 'catalog',
    contextLength: r.contextLength,
    supportsVision: r.supportsVision,
    supportsTools: r.supportsTools,
    supportsStructuredOutput: r.supportsStructuredOutput,
    supportsReasoning: r.supportsReasoning,
    inputModalities: inputMods,
    outputModalities: outputMods,
    availability: r.availability,
    lastVerifiedAt: r.lastVerifiedAt,
  };
}
