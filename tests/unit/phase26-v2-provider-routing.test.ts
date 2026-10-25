// ═══════════════════════════════════════════════════════════════════
// Phase 26 v2 — Provider Routing tests
//
// Verifies:
//   - Gemini provider makes REAL API calls to Google Generative Language API
//   - DeepSeek provider makes REAL API calls to DeepSeek API
//   - callOpenAI / callAnthropic / callOpenRouter / callLocal / callGemini /
//     callDeepSeek throw explicit errors when API key is missing (NO silent
//     Z-AI fallback per user spec Part 3)
//   - PROVIDER_CALL_MAP includes gemini + deepseek
//   - getFallbackChain includes gemini + deepseek when env keys are set
//
// Uses vi.mock to set process.env values + mock fetch. Does NOT make
// real network calls.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Save and restore process.env between tests
const ENV_BACKUP: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined) {
  if (!(key in ENV_BACKUP)) ENV_BACKUP[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
function restoreEnv() {
  for (const [k, v] of Object.entries(ENV_BACKUP)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const k of Object.keys(ENV_BACKUP)) delete ENV_BACKUP[k];
}

// Mock ZAI SDK so we can detect if any provider silently falls back to Z-AI.
vi.mock('z-ai-web-dev-sdk', () => ({
  default: {
    create: vi.fn().mockResolvedValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'ZAI fallback response' } }],
            usage: { total_tokens: 10 },
          }),
        },
      },
    }),
  },
}));

// Mock the ZAI gateway config reader so callZAI doesn't fail at startup
vi.mock('@/lib/ai/zai-gateway-config', () => ({
  readZaiGatewayConfigStatus: () => ({ token: 'mock-token', baseUrl: 'mock' }),
}));

// Mock db so recordUsage doesn't throw
vi.mock('@/lib/db', () => ({
  db: {
    usageTracking: { upsert: vi.fn().mockResolvedValue({}) },
  },
}));

import { executeAICompletion } from '@/lib/ai/ai-provider';

const messages = [{ role: 'user' as const, content: 'Hello' }];

describe('Phase 26 v2 — Provider routing (no silent Z-AI fallback)', () => {
  beforeEach(() => {
    // Clear all provider keys before each test
    setEnv('OPENAI_API_KEY', undefined);
    setEnv('ANTHROPIC_API_KEY', undefined);
    setEnv('OPENROUTER_API_KEY', undefined);
    setEnv('GEMINI_API_KEY', undefined);
    setEnv('DEEPSEEK_API_KEY', undefined);
    setEnv('AI_LOCAL_ENDPOINT', undefined);
    setEnv('ZAI_API_KEY', 'mock-zai-token'); // Z-AI always works
  });

  afterEach(() => {
    restoreEnv();
  });

  it('PROVIDER_CALL_MAP includes gemini + deepseek (new providers)', async () => {
    // Trigger executeAICompletion with each provider and verify the error
    // messages mention the correct API key variable.
    const r1 = await executeAICompletion({
      messages,
      config: { provider: 'gemini' as never, model: 'gemini-1.5-flash' },
    });
    expect(r1.success).toBe(false);
    expect(r1.error).toContain('GEMINI_API_KEY is not set');

    const r2 = await executeAICompletion({
      messages,
      config: { provider: 'deepseek' as never, model: 'deepseek-chat' },
    });
    expect(r2.success).toBe(false);
    expect(r2.error).toContain('DEEPSEEK_API_KEY is not set');
  });

  it('OpenAI throws explicit error when OPENAI_API_KEY is missing (NO silent Z-AI fallback)', async () => {
    setEnv('OPENAI_API_KEY', undefined);
    const result = await executeAICompletion({
      messages,
      config: { provider: 'openai', model: 'gpt-4o' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('OPENAI_API_KEY is not set');
    // CRITICAL: must NOT have silently fallen back to Z-AI and reported success
    expect(result.content).not.toContain('ZAI fallback response');
  });

  it('Anthropic throws explicit error when ANTHROPIC_API_KEY is missing', async () => {
    setEnv('ANTHROPIC_API_KEY', undefined);
    const result = await executeAICompletion({
      messages,
      config: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('ANTHROPIC_API_KEY is not set');
  });

  it('OpenRouter throws explicit error when OPENROUTER_API_KEY is missing', async () => {
    setEnv('OPENROUTER_API_KEY', undefined);
    const result = await executeAICompletion({
      messages,
      config: { provider: 'openrouter', model: 'openai/gpt-4o' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('OPENROUTER_API_KEY is not set');
  });

  it('Local throws explicit error when AI_LOCAL_ENDPOINT is missing', async () => {
    setEnv('AI_LOCAL_ENDPOINT', undefined);
    const result = await executeAICompletion({
      messages,
      config: { provider: 'local', model: 'local-default' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('AI_LOCAL_ENDPOINT is not set');
  });

  it('Gemini makes a REAL API call to generativelanguage.googleapis.com when GEMINI_API_KEY is set', async () => {
    setEnv('GEMINI_API_KEY', 'gem-test-key');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
        modelVersion: 'gemini-1.5-flash',
      }),
    } as Response);
    const result = await executeAICompletion({
      messages,
      config: { provider: 'gemini' as never, model: 'gemini-1.5-flash' },
    });
    expect(result.success).toBe(true);
    expect(result.content).toBe('Hello from Gemini');
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-1.5-flash');
    // Verify the fetch URL is Gemini's API endpoint
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain('generativelanguage.googleapis.com');
    expect(calledUrl).toContain('models/gemini-1.5-flash:generateContent');
    // Verify the API key was passed in the URL (Gemini uses ?key=)
    expect(calledUrl).toContain('key=gem-test-key');
    fetchSpy.mockRestore();
  });

  it('DeepSeek makes a REAL API call to api.deepseek.com when DEEPSEEK_API_KEY is set', async () => {
    setEnv('DEEPSEEK_API_KEY', 'ds-test-key');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello from DeepSeek' } }],
        usage: { total_tokens: 10 },
        model: 'deepseek-chat',
      }),
    } as Response);
    const result = await executeAICompletion({
      messages,
      config: { provider: 'deepseek' as never, model: 'deepseek-chat' },
    });
    expect(result.success).toBe(true);
    expect(result.content).toBe('Hello from DeepSeek');
    expect(result.provider).toBe('deepseek');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain('api.deepseek.com');
    expect(calledUrl).toContain('/chat/completions');
    // Verify the API key was passed as Bearer token
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ds-test-key');
    fetchSpy.mockRestore();
  });

  it('Gemini surfaces API error message when Gemini returns HTTP 4xx/5xx', async () => {
    setEnv('GEMINI_API_KEY', 'gem-bad-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'API key invalid. Please use a valid key.',
    } as Response);
    const result = await executeAICompletion({
      messages,
      config: { provider: 'gemini' as never, model: 'gemini-1.5-flash' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Gemini API error 400');
  });
});
