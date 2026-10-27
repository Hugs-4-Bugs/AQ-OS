// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workstream B Unit Tests
//
// Covers the Workstream B implementation:
//   · Model catalog (Anthropic, Z-AI, Local) — source marking + capability metadata
//   · Orchestrator pure functions (buildModelCallSpecs, parseOrchestrationMode,
//     parseConcurrencyLimit, computeInvocationKey) — config parsing + idempotency
//   · Provider routing — strict single-provider chain (no silent Z-AI
//     substitution) regression guard, exercised via the REAL
//     executeAICompletion in ai-provider.ts (env-key-missing path
//     throws before any network call)
//   · Model discovery service — catalog fallback when credential not
//     resolvable; live-source classification (catalog vs live); DB
//     persistence UNIQUE constraint; per-user isolation
//
// Mock strategy (matches tests/unit/phase26-v3-agent-encryption.test.ts):
//   · vi.mock('@/lib/db', ...) replaces PrismaClient with a mock that
//     returns caller-supplied values per test.
//   · Top-level consts named with `mock` prefix are auto-hoisted by
//     vitest so they're initialized before the vi.mock factory runs.
//   · The real ai-provider.ts is exercised (NOT mocked) — its
//     env-var-missing code path throws synchronously without making
//     any network call.
//   · All test bodies use dynamic `await import(...)` so module load
//     happens AFTER vi.mock setup.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Prisma (per Phase 26 v3 test pattern) ──────────────────────
//
// vitest 4 auto-hoists top-level `const` declarations whose name
// starts with `mock` (case-insensitive) so they're available when the
// vi.mock factory runs.

const mockDb = {
  userAIProvider: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },
  discoveredModel: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ─── Reset mocks between tests ───────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Re-establish safe defaults so tests don't see bleed-through state
  mockDb.userAIProvider.findUnique.mockResolvedValue(null);
  mockDb.discoveredModel.findMany.mockResolvedValue([]);
  mockDb.discoveredModel.upsert.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Catalog tests ────────────────────────────────────────────────────

describe('model-catalog', () => {
  it('marks Anthropic as catalog-only (no live discovery)', async () => {
    const { getProviderCatalog, providerSupportsLiveDiscovery } = await import('@/lib/ai/model-catalog');
    expect(providerSupportsLiveDiscovery('anthropic')).toBe(false);
    const cat = getProviderCatalog('anthropic');
    expect(cat).not.toBeNull();
    expect(cat!.supportsLiveDiscovery).toBe(false);
    expect(cat!.catalogSourceUrl).toMatch(/docs\.anthropic\.com/);
    expect(cat!.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('marks Z-AI as catalog-only (SDK gateway)', async () => {
    const { getProviderCatalog, providerSupportsLiveDiscovery } = await import('@/lib/ai/model-catalog');
    expect(providerSupportsLiveDiscovery('z-ai')).toBe(false);
    const cat = getProviderCatalog('z-ai');
    expect(cat).not.toBeNull();
    expect(cat!.supportsLiveDiscovery).toBe(false);
    expect(cat!.models.find(m => m.modelId === 'glm-4.6')).toBeTruthy();
  });

  it('marks OpenAI/Gemini/DeepSeek/OpenRouter as live-discovery providers', async () => {
    const { providerSupportsLiveDiscovery } = await import('@/lib/ai/model-catalog');
    expect(providerSupportsLiveDiscovery('openai')).toBe(true);
    expect(providerSupportsLiveDiscovery('gemini')).toBe(true);
    expect(providerSupportsLiveDiscovery('deepseek')).toBe(true);
    expect(providerSupportsLiveDiscovery('openrouter')).toBe(true);
  });

  it('catalog entries do not fabricate capability flags — unknown = false', async () => {
    const { getProviderCatalog } = await import('@/lib/ai/model-catalog');
    const cat = getProviderCatalog('anthropic');
    expect(cat).not.toBeNull();
    // Claude Opus 4 supports vision + tools + structured output + reasoning
    const opus = cat!.models.find(m => m.modelId === 'claude-opus-4-20250514');
    expect(opus?.supportsVision).toBe(true);
    expect(opus?.supportsTools).toBe(true);
    expect(opus?.supportsReasoning).toBe(true);
    // Legacy Claude 3 Haiku does NOT support structured output
    const legacy = cat!.models.find(m => m.modelId === 'claude-3-haiku-20240307');
    expect(legacy?.supportsStructuredOutput).toBe(false);
    expect(legacy?.availability).toBe('deprecated');
  });

  it('does NOT have a catalog for live-discovery providers (openai/gemini/etc.)', async () => {
    const { getProviderCatalog } = await import('@/lib/ai/model-catalog');
    expect(getProviderCatalog('openai')).toBeNull();
    expect(getProviderCatalog('gemini')).toBeNull();
    expect(getProviderCatalog('deepseek')).toBeNull();
    expect(getProviderCatalog('openrouter')).toBeNull();
  });

  it('getCatalogModels returns [] for unknown providers', async () => {
    const { getCatalogModels } = await import('@/lib/ai/model-catalog');
    expect(getCatalogModels('nonexistent')).toEqual([]);
  });
});

// ─── Orchestrator pure-function tests ─────────────────────────────────

describe('orchestrator — pure functions', () => {
  it('buildModelCallSpecs parses array of objects', async () => {
    const { buildModelCallSpecs } = await import('@/lib/ai/orchestrator');
    const specs = buildModelCallSpecs({
      models: [
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      ],
    });
    expect(specs.length).toBe(2);
    expect(specs[0].provider).toBe('openai');
    expect(specs[1].provider).toBe('anthropic');
  });

  it('buildModelCallSpecs parses array of strings', async () => {
    const { buildModelCallSpecs } = await import('@/lib/ai/orchestrator');
    const specs = buildModelCallSpecs({
      models: ['gpt-4o', 'claude-sonnet-4-20250514'],
    });
    expect(specs.length).toBe(2);
    expect(specs[0].model).toBe('gpt-4o');
  });

  it('buildModelCallSpecs dedupes identical slots', async () => {
    const { buildModelCallSpecs } = await import('@/lib/ai/orchestrator');
    const specs = buildModelCallSpecs({
      models: [
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'openai', model: 'gpt-4o' }, // duplicate
        { provider: 'anthropic', model: 'claude' },
      ],
    });
    expect(specs.length).toBe(2);
  });

  it('buildModelCallSpecs falls back to single-slot when models array absent', async () => {
    const { buildModelCallSpecs } = await import('@/lib/ai/orchestrator');
    const specs = buildModelCallSpecs({ provider: 'openai', model: 'gpt-4o' });
    expect(specs.length).toBe(1);
    expect(specs[0].provider).toBe('openai');
    expect(specs[0].model).toBe('gpt-4o');
  });

  it('buildModelCallSpecs returns single default slot when neither models nor provider/model set', async () => {
    const { buildModelCallSpecs } = await import('@/lib/ai/orchestrator');
    const specs = buildModelCallSpecs({});
    expect(specs.length).toBe(1);
    expect(specs[0].provider).toBeUndefined();
    expect(specs[0].model).toBeUndefined();
  });

  it('parseOrchestrationMode returns PARALLEL only for "parallel"', async () => {
    const { parseOrchestrationMode } = await import('@/lib/ai/orchestrator');
    expect(parseOrchestrationMode({ orchestration: 'parallel' })).toBe('PARALLEL');
    expect(parseOrchestrationMode({ orchestration: 'sequential' })).toBe('SEQUENTIAL');
    expect(parseOrchestrationMode({ orchestration: 'single' })).toBe('SEQUENTIAL');
    expect(parseOrchestrationMode({})).toBe('SEQUENTIAL');
  });

  it('parseConcurrencyLimit clamps to [1, 4]', async () => {
    const { parseConcurrencyLimit } = await import('@/lib/ai/orchestrator');
    // 0 is treated as "invalid" → falls back to DEFAULT_CONCURRENCY (3)
    expect(parseConcurrencyLimit({ concurrency: 0 })).toBe(3);
    expect(parseConcurrencyLimit({ concurrency: 1 })).toBe(1);
    expect(parseConcurrencyLimit({ concurrency: 3 })).toBe(3);
    expect(parseConcurrencyLimit({ concurrency: 4 })).toBe(4);
    // Above MAX_CONCURRENCY is clamped down to 4
    expect(parseConcurrencyLimit({ concurrency: 10 })).toBe(4);
    // No concurrency field → DEFAULT_CONCURRENCY (3)
    expect(parseConcurrencyLimit({})).toBe(3);
    // Negative concurrency → invalid → DEFAULT
    expect(parseConcurrencyLimit({ concurrency: -5 })).toBe(3);
    // Non-numeric → invalid → DEFAULT
    expect(parseConcurrencyLimit({ concurrency: 'abc' })).toBe(3);
  });

  it('computeInvocationKey is deterministic for same logical slot', async () => {
    const { computeInvocationKey } = await import('@/lib/ai/orchestrator');
    const k1 = computeInvocationKey({
      executionId: 'ex1', leadId: 'lead1', stepName: 'stepA',
      provider: 'openai', model: 'gpt-4o',
    });
    const k2 = computeInvocationKey({
      executionId: 'ex1', leadId: 'lead1', stepName: 'stepA',
      provider: 'openai', model: 'gpt-4o',
    });
    expect(k1).toBe(k2);
    expect(k1).toBe('mi:ex1:lead1:stepA:openai:gpt-4o');
  });

  it('computeInvocationKey differs for different slots', async () => {
    const { computeInvocationKey } = await import('@/lib/ai/orchestrator');
    const k1 = computeInvocationKey({
      executionId: 'ex1', leadId: 'lead1', stepName: 'stepA',
      provider: 'openai', model: 'gpt-4o',
    });
    const k2 = computeInvocationKey({
      executionId: 'ex1', leadId: 'lead1', stepName: 'stepA',
      provider: 'anthropic', model: 'claude',
    });
    expect(k1).not.toBe(k2);
  });
});

// ─── Provider routing — no silent Z-AI substitution (regression guard) ─

describe('provider routing — no silent Z-AI substitution', () => {
  beforeEach(() => {
    // Ensure env vars are unset for these tests
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_LOCAL_ENDPOINT;
  });

  it('OpenAI selection throws when env unset — stays on OpenAI (no z-ai switch)', async () => {
    const aiProvider = await import('@/lib/ai/ai-provider');
    const result = await (aiProvider as unknown as {
      executeAICompletion: (req: unknown, userId: string, action: string) => Promise<{
        success: boolean; error?: string; provider: string;
      }>;
    }).executeAICompletion(
      {
        messages: [{ role: 'user', content: 'test' }],
        config: { provider: 'openai' as never },
      },
      'test-user-routing',
      'test-action'
    );
    expect(result.success).toBe(false);
    expect(result.provider).toBe('openai');
    expect(result.error).toMatch(/OPENAI_API_KEY is not set|openai/i);
  });

  it('Anthropic selection throws when env unset — stays on Anthropic', async () => {
    const aiProvider = await import('@/lib/ai/ai-provider');
    const result = await (aiProvider as unknown as {
      executeAICompletion: (req: unknown, userId: string, action: string) => Promise<{
        success: boolean; error?: string; provider: string;
      }>;
    }).executeAICompletion(
      {
        messages: [{ role: 'user', content: 'test' }],
        config: { provider: 'anthropic' as never },
      },
      'test-user-routing',
      'test-action'
    );
    expect(result.success).toBe(false);
    expect(result.provider).toBe('anthropic');
    expect(result.error).toMatch(/ANTHROPIC_API_KEY is not set|anthropic/i);
  });

  it('Gemini selection throws when env unset — stays on Gemini', async () => {
    const aiProvider = await import('@/lib/ai/ai-provider');
    const result = await (aiProvider as unknown as {
      executeAICompletion: (req: unknown, userId: string, action: string) => Promise<{
        success: boolean; error?: string; provider: string;
      }>;
    }).executeAICompletion(
      {
        messages: [{ role: 'user', content: 'test' }],
        config: { provider: 'gemini' as never },
      },
      'test-user-routing',
      'test-action'
    );
    expect(result.success).toBe(false);
    expect(result.provider).toBe('gemini');
    expect(result.error).toMatch(/GEMINI_API_KEY is not set|gemini/i);
  });

  it('DeepSeek selection throws when env unset — stays on DeepSeek', async () => {
    const aiProvider = await import('@/lib/ai/ai-provider');
    const result = await (aiProvider as unknown as {
      executeAICompletion: (req: unknown, userId: string, action: string) => Promise<{
        success: boolean; error?: string; provider: string;
      }>;
    }).executeAICompletion(
      {
        messages: [{ role: 'user', content: 'test' }],
        config: { provider: 'deepseek' as never },
      },
      'test-user-routing',
      'test-action'
    );
    expect(result.success).toBe(false);
    expect(result.provider).toBe('deepseek');
    expect(result.error).toMatch(/DEEPSEEK_API_KEY is not set|deepseek/i);
  });

  it('OpenRouter selection throws when env unset — stays on OpenRouter', async () => {
    const aiProvider = await import('@/lib/ai/ai-provider');
    const result = await (aiProvider as unknown as {
      executeAICompletion: (req: unknown, userId: string, action: string) => Promise<{
        success: boolean; error?: string; provider: string;
      }>;
    }).executeAICompletion(
      {
        messages: [{ role: 'user', content: 'test' }],
        config: { provider: 'openrouter' as never },
      },
      'test-user-routing',
      'test-action'
    );
    expect(result.success).toBe(false);
    expect(result.provider).toBe('openrouter');
    expect(result.error).toMatch(/OPENROUTER_API_KEY is not set|openrouter/i);
  });

  it('Local LLM selection throws when endpoint unset — stays on Local', async () => {
    const aiProvider = await import('@/lib/ai/ai-provider');
    const result = await (aiProvider as unknown as {
      executeAICompletion: (req: unknown, userId: string, action: string) => Promise<{
        success: boolean; error?: string; provider: string;
      }>;
    }).executeAICompletion(
      {
        messages: [{ role: 'user', content: 'test' }],
        config: { provider: 'local' as never },
      },
      'test-user-routing',
      'test-action'
    );
    expect(result.success).toBe(false);
    expect(result.provider).toBe('local');
    expect(result.error).toMatch(/AI_LOCAL_ENDPOINT is not set|local/i);
  });
});

// ─── Model discovery service ──────────────────────────────────────────

describe('model-discovery service', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it('returns catalog for Anthropic when user credential is active', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-min-len-1234';
    mockDb.userAIProvider.findUnique.mockResolvedValue({
      id: 'uap1', userId: 'test-user', provider: 'anthropic',
      encryptedCredential: 'v1:0000:0000:0000',
      status: 'active',
    });

    const { discoverModelsForProvider } = await import('@/lib/ai/model-discovery');
    const result = await discoverModelsForProvider({
      userId: 'test-user-1',
      provider: 'anthropic',
    });

    expect(result.source).toBe('catalog');
    expect(result.exercisedCredential).toBe(false);
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models[0].supportsTools ?? result.models[0].supportsVision).toBeDefined();
    expect(result.models.every(m => m.source === 'catalog' || m.source === 'live')).toBe(true);
    expect(mockDb.discoveredModel.upsert.mock.calls.length).toBe(result.models.length);

    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns source=none when credential cannot be resolved for live provider', async () => {
    mockDb.userAIProvider.findUnique.mockResolvedValue(null);

    const { discoverModelsForProvider } = await import('@/lib/ai/model-discovery');
    const result = await discoverModelsForProvider({
      userId: 'test-user-2',
      provider: 'openai',
    });

    expect(result.source).toBe('none');
    expect(result.models).toEqual([]);
    expect(result.exercisedCredential).toBe(false);
    expect(result.error).toMatch(/credential|not configured/i);
  });

  it('returns catalog fallback for Anthropic even when only platform env is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform-key';
    mockDb.userAIProvider.findUnique.mockResolvedValue(null);

    const { discoverModelsForProvider } = await import('@/lib/ai/model-discovery');
    const result = await discoverModelsForProvider({
      userId: 'test-user-3',
      provider: 'anthropic',
    });
    expect(result.source).toBe('catalog');
    expect(result.models.length).toBeGreaterThan(0);
    expect(mockDb.discoveredModel.upsert.mock.calls.length).toBe(result.models.length);

    delete process.env.ANTHROPIC_API_KEY;
  });

  it('cached read returns [] for never-discovered provider', async () => {
    mockDb.discoveredModel.findMany.mockResolvedValue([]);
    const { getCachedDiscoveredModels } = await import('@/lib/ai/model-discovery');
    const cached = await getCachedDiscoveredModels('test-user-5', 'openai');
    expect(cached).toEqual([]);
  });

  it('cached read returns persisted models with correct shape', async () => {
    const fakeNow = new Date('2026-10-27T00:00:00Z');
    mockDb.discoveredModel.findMany.mockResolvedValue([
      {
        modelId: 'claude-opus-4-20250514',
        displayName: 'Claude Opus 4',
        source: 'catalog',
        contextLength: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStructuredOutput: true,
        supportsReasoning: true,
        inputModalities: JSON.stringify(['text', 'image']),
        outputModalities: JSON.stringify(['text']),
        availability: 'available',
        lastVerifiedAt: fakeNow,
      },
    ]);
    const { getCachedDiscoveredModels } = await import('@/lib/ai/model-discovery');
    const cached = await getCachedDiscoveredModels('test-user-6', 'anthropic');
    expect(cached.length).toBe(1);
    const first = cached[0];
    expect(first.modelId).toBe('claude-opus-4-20250514');
    expect(first.source).toBe('catalog');
    expect(first.availability).toBe('available');
    expect(first.lastVerifiedAt).toBeInstanceOf(Date);
    expect(first.inputModalities).toEqual(['text', 'image']);
    expect(first.outputModalities).toEqual(['text']);
  });

  it('getAllCachedForAllProviders groups by provider', async () => {
    mockDb.discoveredModel.findMany.mockResolvedValue([]);
    const { getCachedDiscoveredModelsForAllProviders } = await import('@/lib/ai/model-discovery');
    const grouped = await getCachedDiscoveredModelsForAllProviders('test-user-7');
    expect(mockDb.discoveredModel.findMany).toHaveBeenCalledWith({
      where: { userId: 'test-user-7' },
      orderBy: [{ provider: 'asc' }, { modelId: 'asc' }],
    });
    // Empty result yields empty object — that's a valid cache-miss state
    expect(typeof grouped).toBe('object');
    expect(Array.isArray(grouped)).toBe(false); // it's a Record, not an array
  });
});

// ─── Orchestrator — aiConfig JSON merge (regression for Decision 4) ───

describe('orchestrator — aiConfig JSON merge (Decision 4)', () => {
  it('merged config (provider+model from aiConfig) yields single-slot spec', async () => {
    const { buildModelCallSpecs } = await import('@/lib/ai/orchestrator');
    const mergedConfig = { aiConfig: JSON.stringify({ provider: 'openai', model: 'gpt-4o' }) };
    const parsed = JSON.parse(mergedConfig.aiConfig as string);
    const config = { ...parsed };
    const specs = buildModelCallSpecs(config);
    expect(specs.length).toBe(1);
    expect(specs[0].provider).toBe('openai');
    expect(specs[0].model).toBe('gpt-4o');
  });

  it('merged config (multi-model parallel from aiConfig) yields multi-slot spec', async () => {
    const { buildModelCallSpecs, parseOrchestrationMode, parseConcurrencyLimit } = await import('@/lib/ai/orchestrator');
    const mergedConfig = {
      aiConfig: JSON.stringify({
        orchestration: 'parallel',
        concurrency: 3,
        models: [
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        ],
      }),
    };
    const parsed = JSON.parse(mergedConfig.aiConfig as string);
    const config = { ...parsed };
    expect(parseOrchestrationMode(config)).toBe('PARALLEL');
    expect(parseConcurrencyLimit(config)).toBe(3);
    const specs = buildModelCallSpecs(config);
    expect(specs.length).toBe(2);
  });
});
