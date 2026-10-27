// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Model Catalog (Workstream B — Decision 5)
//
// Maintained provider-specific model catalogs. Used as a fallback when
// a provider does NOT expose an authenticated model-list endpoint
// (per user spec Workstream B §5: "If a provider does NOT expose
// model discovery: use a clearly maintained provider-specific catalog
// and mark the source appropriately").
//
// Catalog entries are marked source='catalog' when persisted to the
// DiscoveredModel table. Live discovery entries are marked source='live'.
//
// Maintenance policy:
//   · Update this catalog when a provider releases or deprecates models.
//   · Each entry should include known capability flags + context length
//     where reliably documented.
//   · When in doubt, mark capability as false (do NOT fabricate).
//
// NEVER fabricate model availability. Catalog entries are best-known
// as of the catalog's last update; the canonical answer for what the
// user's credential can actually access is the live list request.
// ═══════════════════════════════════════════════════════════════════

export interface CatalogModel {
  modelId: string;
  displayName?: string;
  contextLength?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsStructuredOutput?: boolean;
  supportsReasoning?: boolean;
  inputModalities?: string[];
  outputModalities?: string[];
  availability?: 'available' | 'deprecated' | 'preview' | 'unknown';
}

export interface CatalogEntry {
  provider: string;
  // When true, this provider supports live discovery and the catalog
  // is only a fallback. When false, the catalog IS the canonical source.
  supportsLiveDiscovery: boolean;
  // Documentation URL where the catalog contents can be verified.
  catalogSourceUrl: string;
  // Last-reviewed timestamp (ISO date string) — when a human last
  // audited these entries against the provider's published docs.
  lastReviewed: string;
  models: CatalogModel[];
}

// ─── Anthropic ──────────────────────────────────────────────────────
// Anthropic does NOT expose GET /v1/models (the public API has no
// list endpoint). Models are published at https://docs.anthropic.com/
// en/docs/about-claude/models. Catalog maintained from that page.
const ANTHROPIC_CATALOG: CatalogEntry = {
  provider: 'anthropic',
  supportsLiveDiscovery: false,
  catalogSourceUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
  lastReviewed: '2026-10-27',
  models: [
    {
      modelId: 'claude-opus-4-20250514',
      displayName: 'Claude Opus 4',
      contextLength: 200000,
      supportsVision: true,
      supportsTools: true,
      supportsStructuredOutput: true,
      supportsReasoning: true,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      availability: 'available',
    },
    {
      modelId: 'claude-sonnet-4-20250514',
      displayName: 'Claude Sonnet 4',
      contextLength: 200000,
      supportsVision: true,
      supportsTools: true,
      supportsStructuredOutput: true,
      supportsReasoning: true,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      availability: 'available',
    },
    {
      modelId: 'claude-3-5-sonnet-20241022',
      displayName: 'Claude 3.5 Sonnet',
      contextLength: 200000,
      supportsVision: true,
      supportsTools: true,
      supportsStructuredOutput: true,
      supportsReasoning: false,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      availability: 'available',
    },
    {
      modelId: 'claude-3-5-haiku-20241022',
      displayName: 'Claude 3.5 Haiku',
      contextLength: 200000,
      supportsVision: true,
      supportsTools: true,
      supportsStructuredOutput: true,
      supportsReasoning: false,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      availability: 'available',
    },
    {
      modelId: 'claude-3-opus-20240229',
      displayName: 'Claude 3 Opus (legacy)',
      contextLength: 200000,
      supportsVision: true,
      supportsTools: true,
      supportsStructuredOutput: false,
      supportsReasoning: false,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      availability: 'deprecated',
    },
    {
      modelId: 'claude-3-haiku-20240307',
      displayName: 'Claude 3 Haiku (legacy)',
      contextLength: 200000,
      supportsVision: true,
      supportsTools: true,
      supportsStructuredOutput: false,
      supportsReasoning: false,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      availability: 'deprecated',
    },
  ],
};

// ─── Z-AI / GLM ──────────────────────────────────────────────────────
// Z-AI uses an SDK gateway (z-ai-web-dev-sdk); model availability is
// determined by the gateway at runtime. This catalog reflects the
// published GLM family as documented at https://docs.z.ai.
const ZAI_CATALOG: CatalogEntry = {
  provider: 'z-ai',
  supportsLiveDiscovery: false,
  catalogSourceUrl: 'https://docs.z.ai',
  lastReviewed: '2026-10-27',
  models: [
    {
      modelId: 'glm-4.6',
      displayName: 'GLM-4.6',
      contextLength: 128000,
      supportsVision: true,
      supportsTools: true,
      supportsStructuredOutput: true,
      supportsReasoning: true,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      availability: 'available',
    },
    {
      modelId: 'glm-4-plus',
      displayName: 'GLM-4-Plus',
      contextLength: 128000,
      supportsVision: true,
      supportsTools: true,
      supportsStructuredOutput: true,
      supportsReasoning: false,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      availability: 'available',
    },
    {
      modelId: 'glm-4-air',
      displayName: 'GLM-4-Air',
      contextLength: 128000,
      supportsVision: false,
      supportsTools: true,
      supportsStructuredOutput: false,
      supportsReasoning: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      availability: 'available',
    },
  ],
};

// ─── Local LLM ────────────────────────────────────────────────────────
// Local LLM endpoints (Ollama / LM Studio / text-generation-webui) do
// not have a canonical model catalog — the user supplies their own.
// We expose a single placeholder; the user types a custom id.
const LOCAL_CATALOG: CatalogEntry = {
  provider: 'local',
  supportsLiveDiscovery: false,
  catalogSourceUrl: 'https://github.com/oobabooga/text-generation-webui',
  lastReviewed: '2026-10-27',
  models: [
    {
      modelId: 'local-default',
      displayName: 'Local LLM (user-configured)',
      availability: 'unknown',
    },
  ],
};

// ─── Catalog registry ────────────────────────────────────────────────
const CATALOGS: Record<string, CatalogEntry> = {
  anthropic: ANTHROPIC_CATALOG,
  'z-ai': ZAI_CATALOG,
  local: LOCAL_CATALOG,
};

/**
 * Get the maintained catalog for a provider.
 * Returns null if the provider does not have a catalog (i.e., it
 * supports live discovery exclusively — OpenAI, Gemini, DeepSeek,
 * OpenRouter).
 */
export function getProviderCatalog(provider: string): CatalogEntry | null {
  return CATALOGS[provider] ?? null;
}

/**
 * Returns true if a provider supports live model discovery via an
 * authenticated list endpoint. False means the catalog is canonical.
 */
export function providerSupportsLiveDiscovery(provider: string): boolean {
  switch (provider) {
    case 'openai':
    case 'gemini':
    case 'deepseek':
    case 'openrouter':
      return true;
    case 'anthropic':
    case 'z-ai':
    case 'local':
      return false;
    default:
      return false;
  }
}

/**
 * Get the catalog models for a provider (empty array if no catalog).
 */
export function getCatalogModels(provider: string): CatalogModel[] {
  return CATALOGS[provider]?.models ?? [];
}
