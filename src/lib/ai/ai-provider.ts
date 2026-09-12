// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Provider Architecture
// Phase 8: Provider Abstraction + Failover + Retries + Usage Tracking
//
// CRITICAL RULES:
// - NEVER expose API keys
// - NEVER call AI from frontend
// - ALWAYS track usage
// - ALWAYS handle timeouts
// - ALWAYS implement retries
//
// Providers: z-ai (primary), OpenAI, Anthropic, OpenRouter, Local
// Each provider checks its API key from process.env before use
// ═══════════════════════════════════════════════════════════════════

import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export type ProviderType = 'z-ai' | 'openai' | 'anthropic' | 'openrouter' | 'local';

export interface AIProviderConfig {
  provider: ProviderType;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  retries?: number;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  config?: AIProviderConfig;
  stream?: boolean;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionResult {
  success: boolean;
  content: string;
  provider: ProviderType;
  model: string;
  tokensUsed: number;
  latencyMs: number;
  retries: number;
  error?: string;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
  provider: ProviderType;
}

export interface AIUsageEntry {
  id: string;
  userId: string;
  provider: ProviderType;
  model: string;
  action: string;
  tokensUsed: number;
  latencyMs: number;
  success: boolean;
  createdAt: Date;
}

// ===== ENV-DRIVEN CONFIGURATION =====

function getEnvNumber(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvFloat(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultValue : parsed;
}

const AI_CONFIG = {
  defaultTimeout: getEnvNumber('AI_DEFAULT_TIMEOUT_MS', 30000),
  maxRetries: getEnvNumber('AI_MAX_RETRIES', 2),
  maxTokens: getEnvNumber('AI_MAX_TOKENS', 4096),
  defaultTemperature: getEnvFloat('AI_DEFAULT_TEMPERATURE', 0.7),
  chatMaxMessages: getEnvNumber('AI_CHAT_MAX_MESSAGES_PER_SESSION', 50),
  chatCreditCost: getEnvNumber('AI_CHAT_CREDIT_COST', 1),
  analysisCreditCost: getEnvNumber('AI_ANALYSIS_CREDIT_COST', 5),
  analysisCacheHours: getEnvNumber('AI_ANALYSIS_CACHE_HOURS', 24),
  scoringCreditCost: getEnvNumber('AI_SCORING_CREDIT_COST', 3),
  scoringCacheHours: getEnvNumber('AI_SCORING_CACHE_HOURS', 12),
  outreachCreditCost: getEnvNumber('AI_OUTREACH_CREDIT_COST', 2),
  memoryMaxTokens: getEnvNumber('AI_MEMORY_MAX_TOKENS', 500),
  memoryMaxAgeHours: getEnvNumber('AI_MEMORY_MAX_AGE_HOURS', 72),
  memoryCacheSize: getEnvNumber('AI_MEMORY_CACHE_SIZE', 500),
  promptMaxInputLength: getEnvNumber('AI_PROMPT_MAX_INPUT_LENGTH', 10000),
};

export { AI_CONFIG };

// ===== PROVIDER FALLBACK CHAIN =====

function getFallbackChain(): ProviderType[] {
  const chain: ProviderType[] = ['z-ai'];

  // Add providers based on available env keys — only add if key is actually set
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0) {
    chain.push('openai');
  }
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0) {
    chain.push('anthropic');
  }
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim().length > 0) {
    chain.push('openrouter');
  }
  // Local provider uses a local LLM endpoint
  if (process.env.AI_LOCAL_ENDPOINT && process.env.AI_LOCAL_ENDPOINT.trim().length > 0) {
    chain.push('local');
  }

  return chain;
}

// ===== DEFAULT CONFIG =====

const DEFAULT_CONFIG: AIProviderConfig = {
  provider: 'z-ai',
  maxTokens: AI_CONFIG.maxTokens,
  temperature: AI_CONFIG.defaultTemperature,
  timeout: AI_CONFIG.defaultTimeout,
  retries: AI_CONFIG.maxRetries,
};

// ===== IN-MEMORY USAGE TRACKING (with DB persistence) =====

const usageStore: AIUsageEntry[] = [];
const MAX_USAGE_ENTRIES = 10000;

async function recordUsage(params: {
  userId: string;
  provider: ProviderType;
  model: string;
  action: string;
  tokensUsed: number;
  latencyMs: number;
  success: boolean;
}): Promise<void> {
  const entry: AIUsageEntry = {
    id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date(),
    ...params,
  };
  usageStore.unshift(entry);
  if (usageStore.length > MAX_USAGE_ENTRIES) {
    usageStore.length = MAX_USAGE_ENTRIES;
  }

  // Also persist to DB for long-term tracking
  // FIX (2026-09-09): Use upsert instead of create. The table has a unique
  // constraint on (userId, feature, periodStart), so a second AI call within
  // the same billing period would throw "Unique constraint failed". The
  // upsert atomically increments the count on the existing period row.
  try {
    const { db } = await import('@/lib/db');
    const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const periodEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    await db.usageTracking.upsert({
      where: {
        userId_feature_periodStart: {
          userId: params.userId,
          feature: 'ai_provider',
          periodStart,
        },
      },
      create: {
        userId: params.userId,
        feature: 'ai_provider',
        action: params.action,
        count: 1,
        periodStart,
        periodEnd,
      },
      update: {
        count: { increment: 1 },
        periodEnd,
      },
    });
  } catch (dbError) {
    // DB write is best-effort, don't break the flow
    console.warn('[AIProvider] Failed to persist usage to DB:', dbError);
  }
}

// ===== PROVIDER IMPLEMENTATIONS =====

async function callZAI(
  messages: AIMessage[],
  config: AIProviderConfig
): Promise<{ content: string; tokensUsed: number; model: string }> {
  const zai = await ZAI.create();

  const zaiMessages = messages.map((m) => ({
    role: m.role === 'system' ? 'assistant' : m.role,
    content: m.content,
  }));

  const completion = await zai.chat.completions.create({
    messages: zaiMessages,
    thinking: { type: 'disabled' },
  });

  const content = completion.choices?.[0]?.message?.content || '';
  const tokensUsed = completion.usage?.total_tokens || Math.ceil(content.length / 4);
  const model = completion.model || 'z-ai-default';

  return { content, tokensUsed, model };
}

/**
 * OpenAI provider — uses fetch directly against OpenAI API.
 * Requires process.env.OPENAI_API_KEY to be set.
 * Waiting for production secret injection.
 */
async function callOpenAI(
  messages: AIMessage[],
  config: AIProviderConfig
): Promise<{ content: string; tokensUsed: number; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    // No API key — fall back to ZAI
    return callZAI(messages, config);
  }

  const model = config.model || process.env.OPENAI_MODEL || 'gpt-4o';
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: config.maxTokens || AI_CONFIG.maxTokens,
      temperature: config.temperature ?? AI_CONFIG.defaultTemperature,
    }),
    signal: AbortSignal.timeout(config.timeout || AI_CONFIG.defaultTimeout),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const tokensUsed = data.usage?.total_tokens || Math.ceil(content.length / 4);

  return { content, tokensUsed, model: data.model || model };
}

/**
 * Anthropic provider — uses fetch directly against Anthropic API.
 * Requires process.env.ANTHROPIC_API_KEY to be set.
 * Waiting for production secret injection.
 */
async function callAnthropic(
  messages: AIMessage[],
  config: AIProviderConfig
): Promise<{ content: string; tokensUsed: number; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return callZAI(messages, config);
  }

  const model = config.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';

  // Anthropic uses a different message format — system is a separate parameter
  const systemMessage = messages.find((m) => m.role === 'system')?.content || '';
  const nonSystemMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: config.maxTokens || AI_CONFIG.maxTokens,
      system: systemMessage,
      messages: nonSystemMessages,
    }),
    signal: AbortSignal.timeout(config.timeout || AI_CONFIG.defaultTimeout),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) || Math.ceil(content.length / 4);

  return { content, tokensUsed, model: data.model || model };
}

/**
 * OpenRouter provider — uses fetch against OpenRouter API.
 * Requires process.env.OPENROUTER_API_KEY to be set.
 * Waiting for production secret injection.
 */
async function callOpenRouter(
  messages: AIMessage[],
  config: AIProviderConfig
): Promise<{ content: string; tokensUsed: number; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return callZAI(messages, config);
  }

  const model = config.model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o';
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://acquisitionos.com',
      'X-Title': 'AcquisitionOS',
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: config.maxTokens || AI_CONFIG.maxTokens,
      temperature: config.temperature ?? AI_CONFIG.defaultTemperature,
    }),
    signal: AbortSignal.timeout(config.timeout || AI_CONFIG.defaultTimeout),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const tokensUsed = data.usage?.total_tokens || Math.ceil(content.length / 4);

  return { content, tokensUsed, model: data.model || model };
}

/**
 * Local provider — uses a local LLM endpoint (e.g., Ollama, LM Studio).
 * Requires process.env.AI_LOCAL_ENDPOINT to be set.
 * Waiting for production secret injection.
 */
async function callLocal(
  messages: AIMessage[],
  config: AIProviderConfig
): Promise<{ content: string; tokensUsed: number; model: string }> {
  const endpoint = process.env.AI_LOCAL_ENDPOINT;
  if (!endpoint || endpoint.trim().length === 0) {
    return callZAI(messages, config);
  }

  const model = config.model || process.env.AI_LOCAL_MODEL || 'local-default';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: config.maxTokens || AI_CONFIG.maxTokens,
      temperature: config.temperature ?? AI_CONFIG.defaultTemperature,
      stream: false,
    }),
    signal: AbortSignal.timeout(config.timeout || AI_CONFIG.defaultTimeout),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Local LLM error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || data.content?.[0]?.text || data.response || '';
  const tokensUsed = data.usage?.total_tokens || Math.ceil(content.length / 4);

  return { content, tokensUsed, model };
}

const PROVIDER_CALL_MAP: Record<ProviderType, typeof callZAI> = {
  'z-ai': callZAI,
  openai: callOpenAI,
  anthropic: callAnthropic,
  openrouter: callOpenRouter,
  local: callLocal,
};

// ===== CORE COMPLETION WITH FAILOVER =====

/**
 * Execute AI completion with:
 * - Provider fallback chain
 * - Automatic retries with exponential backoff
 * - Timeout handling
 * - Usage tracking (in-memory + DB)
 * - Error recovery
 */
export async function executeAICompletion(
  request: AICompletionRequest,
  userId: string,
  action: string
): Promise<AICompletionResult> {
  const config = { ...DEFAULT_CONFIG, ...request.config };
  const chain = getFallbackChain();
  const maxRetries = config.retries || AI_CONFIG.maxRetries;
  let lastError: string = '';
  let totalRetries = 0;

  // Try each provider in the fallback chain
  for (const provider of chain) {
    const caller = PROVIDER_CALL_MAP[provider];
    if (!caller) continue;

    // Retry logic for each provider
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        // Execute with timeout
        const result = await Promise.race([
          caller(request.messages, config),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Provider ${provider} timed out after ${config.timeout}ms`)),
              config.timeout || AI_CONFIG.defaultTimeout
            )
          ),
        ]);

        const latencyMs = Date.now() - startTime;

        // Validate response
        if (!result.content || result.content.trim().length === 0) {
          throw new Error(`Empty response from provider ${provider}`);
        }

        // Record successful usage
        await recordUsage({
          userId,
          provider,
          model: result.model,
          action,
          tokensUsed: result.tokensUsed,
          latencyMs,
          success: true,
        });

        return {
          success: true,
          content: result.content,
          provider,
          model: result.model,
          tokensUsed: result.tokensUsed,
          latencyMs,
          retries: attempt,
        };
      } catch (error) {
        totalRetries++;
        lastError = error instanceof Error ? error.message : 'Unknown error';
        const latencyMs = Date.now() - startTime;

        console.warn(
          `[AIProvider] ${provider} attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError} (${latencyMs}ms)`
        );

        // Record failed usage
        await recordUsage({
          userId,
          provider,
          model: config.model || 'unknown',
          action,
          tokensUsed: 0,
          latencyMs,
          success: false,
        });

        // Exponential backoff before retry (skip on last attempt)
        if (attempt < maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }
  }

  // All providers failed
  return {
    success: false,
    content: '',
    provider: 'z-ai',
    model: 'unknown',
    tokensUsed: 0,
    latencyMs: 0,
    retries: totalRetries,
    error: `All AI providers failed. Last error: ${lastError}`,
  };
}

// ===== STREAMING COMPLETION (SSE) =====

/**
 * Execute streaming AI completion using ReadableStream for SSE.
 * Uses z-ai-web-dev-sdk for generation, then streams the result
 * in SSE format for real-time UI updates.
 */
export function executeAIStream(
  request: AICompletionRequest,
  userId: string,
  action: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cancelled = false;

  return new ReadableStream({
    async start(controller) {
      try {
        // Execute the completion
        const result = await executeAICompletion(request, userId, action);

        if (!result.success || !result.content) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: result.error || 'AI generation failed', done: true })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Stream the response in chunks for real-time feel
        const content = result.content;
        const words = content.split(/(\s+)/);
        let accumulated = '';
        const chunkSize = 4;

        for (let i = 0; i < words.length; i++) {
          if (cancelled) break;

          accumulated += words[i];

          const isChunkBoundary = (i + 1) % chunkSize === 0;
          const isLast = i === words.length - 1;

          if (isChunkBoundary || isLast) {
            const chunk: AIStreamChunk = {
              content: accumulated,
              done: isLast,
              provider: result.provider,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );

            accumulated = '';

            // Small delay for natural streaming feel
            await new Promise((resolve) => setTimeout(resolve, 18));
          }
        }

        // Send any remaining content
        if (accumulated.trim()) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content: accumulated, done: true, provider: result.provider })}\n\n`)
          );
        }

        // Send final done event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, content: '', provider: result.provider })}\n\n`)
        );
        controller.close();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Stream error';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: errMsg, done: true })}\n\n`)
        );
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}

// ===== USAGE QUERIES =====

export function getAIUsageHistory(params: {
  userId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}): AIUsageEntry[] {
  let results = [...usageStore];

  if (params.userId) {
    results = results.filter((e) => e.userId === params.userId);
  }
  if (params.action) {
    results = results.filter((e) => e.action === params.action);
  }

  const limit = params.limit || 50;
  const offset = params.offset || 0;
  return results.slice(offset, offset + limit);
}

export function getAIUsageSummary(userId: string): {
  totalCalls: number;
  totalTokens: number;
  avgLatencyMs: number;
  successRate: number;
  byAction: Record<string, { calls: number; tokens: number; avgLatency: number }>;
  byProvider: Record<string, { calls: number; tokens: number }>;
} {
  const userEntries = usageStore.filter((e) => e.userId === userId);
  const totalCalls = userEntries.length;
  const successCalls = userEntries.filter((e) => e.success).length;
  const totalTokens = userEntries.reduce((sum, e) => sum + e.tokensUsed, 0);
  const avgLatencyMs = totalCalls > 0 ? Math.round(userEntries.reduce((sum, e) => sum + e.latencyMs, 0) / totalCalls) : 0;

  const byAction: Record<string, { calls: number; tokens: number; avgLatency: number }> = {};
  const byProvider: Record<string, { calls: number; tokens: number }> = {};

  for (const entry of userEntries) {
    // By action
    if (!byAction[entry.action]) {
      byAction[entry.action] = { calls: 0, tokens: 0, avgLatency: 0 };
    }
    byAction[entry.action].calls++;
    byAction[entry.action].tokens += entry.tokensUsed;

    // By provider
    if (!byProvider[entry.provider]) {
      byProvider[entry.provider] = { calls: 0, tokens: 0 };
    }
    byProvider[entry.provider].calls++;
    byProvider[entry.provider].tokens += entry.tokensUsed;
  }

  // Calculate average latencies
  for (const action of Object.keys(byAction)) {
    const actionEntries = userEntries.filter((e) => e.action === action);
    byAction[action].avgLatency = actionEntries.length > 0
      ? Math.round(actionEntries.reduce((sum, e) => sum + e.latencyMs, 0) / actionEntries.length)
      : 0;
  }

  return {
    totalCalls,
    totalTokens,
    avgLatencyMs,
    successRate: totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0,
    byAction,
    byProvider,
  };
}

// ===== CANCELLATION TOKENS (in-memory) =====

const cancellationTokens = new Map<string, boolean>();

export function setCancelToken(sessionId: string): void {
  cancellationTokens.set(sessionId, true);
}

export function isCancelled(sessionId: string): boolean {
  return cancellationTokens.get(sessionId) === true;
}

export function clearCancelToken(sessionId: string): void {
  cancellationTokens.delete(sessionId);
}

// ===== INITIALIZATION =====

export async function initializeAIProviders(): Promise<{
  available: ProviderType[];
  primary: ProviderType;
}> {
  const chain = getFallbackChain();

  // Test primary provider
  try {
    const zai = await ZAI.create();
    if (zai) {
      console.log('[AIProvider] Primary provider (z-ai) available');
    }
  } catch (error) {
    console.error('[AIProvider] Primary provider test failed:', error);
  }

  // Log which providers are available
  const availableKeys = {
    openai: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()),
    anthropic: !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()),
    openrouter: !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()),
    local: !!(process.env.AI_LOCAL_ENDPOINT && process.env.AI_LOCAL_ENDPOINT.trim()),
  };

  console.log('[AIProvider] Provider availability:', { 'z-ai': true, ...availableKeys });
  console.log('[AIProvider] Fallback chain:', chain.join(' → '));

  return {
    available: chain,
    primary: chain[0] || 'z-ai',
  };
}
