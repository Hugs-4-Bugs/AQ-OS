// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2 Tests — Real Provider Smoke Test
//
// Verifies the canonical provider abstraction (executeAICompletion in
// @/lib/ai/ai-provider.ts) works end-to-end against a real AI gateway.
//
// Behavior:
//   · Reads ZAI_API_KEY (or another relevant AI provider env var) from
//     process.env.
//   · If NO key is present → the entire describe block is SKIPPED
//     (vitest's describe.skipIf). No fake success — the test simply
//     does not run.
//   · If a key IS present → ONE real executeAICompletion call is made
//     in `beforeAll`. Each `it` test verifies ONE invariant of the
//     response shape.
//
// Required response shape (per ai-provider.ts AICompletionResult):
//   {
//     success: boolean,
//     content: string,
//     provider: string,
//     model: string,
//     tokensUsed: number,
//     latencyMs: number,
//     retries: number,
//     error?: string
//   }
//
// The smoke test NEVER fakes success — a real failure (network error,
// 401, 5xx, malformed response) surfaces as a test failure with an
// actionable error message.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { executeAICompletion, type AICompletionResult } from '@/lib/ai/ai-provider';
import {
  setupPart2Context,
  teardownPart2Context,
  type Part2TestContext,
} from '../helpers/part2-test-utils';

// Sentinel: ZAI_API_KEY is the canonical env var the operator sets to
// signal "the z-ai gateway is configured and you may run the smoke test".
// We also accept ZAI_TOKEN (the gateway's mandatory X-Token header value)
// since the SDK requires both baseUrl + apiKey + token in .z-ai-config.
const SMOKE_KEY =
  process.env.ZAI_API_KEY ||
  process.env.ZAI_TOKEN ||
  process.env.OPENAI_API_KEY ||
  process.env.ANTHROPIC_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.DEEPSEEK_API_KEY;

// Pick the provider that the smoke test will target. The fallback
// chain prefers z-ai (the canonical default), then OpenAI / Anthropic
// / Gemini / DeepSeek in that order — matching ai-provider.ts's
// getFallbackChain().
function pickProvider(): 'z-ai' | 'openai' | 'anthropic' | 'gemini' | 'deepseek' {
  if (process.env.ZAI_API_KEY || process.env.ZAI_TOKEN) return 'z-ai';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'deepseek';
}

// The whole block skips when no provider key is set. Each test inside
// verifies ONE invariant of the canonical response shape.
describe.skipIf(!SMOKE_KEY)('[Part 2] Real Provider Smoke Test', () => {
  let ctx: Part2TestContext;
  let result: AICompletionResult;
  const provider = pickProvider();

  // ONE real call — shared across all tests. The `await` will throw
  // if the provider rejects (network, 401, 5xx, malformed response)
  // and the test block fails loudly with an actionable error.
  beforeAll(async () => {
    ctx = await setupPart2Context();
    result = await executeAICompletion(
      {
        messages: [
          {
            role: 'user',
            content:
              'You are a smoke test. Reply with exactly the word "pong" and nothing else.',
          },
        ],
        config: {
          provider,
          // Use a small max-tokens so the smoke test stays cheap.
          maxTokens: 16,
          temperature: 0,
          timeout: 30_000,
          retries: 0, // no retries — surface the real provider's first answer
        },
      },
      ctx.userIds[0],
      'smoke_test'
    );
  });

  // Cleanup the smoke-test user (best-effort — never block the report).
  afterAll(async () => {
    if (ctx) await teardownPart2Context(ctx);
  });

  // Each test verifies ONE invariant. The shared `result` from
  // beforeAll is the same across all of them — only ONE provider call
  // was made.

  it('response has the canonical shape (all required fields present + correctly typed)', () => {
    // AICompletionResult's required fields: success, content, provider,
    // model, tokensUsed, latencyMs, retries. error is optional.
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();

    // Type checks for each required field.
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.content).toBe('string');
    expect(typeof result.provider).toBe('string');
    expect(typeof result.model).toBe('string');
    expect(typeof result.tokensUsed).toBe('number');
    expect(typeof result.latencyMs).toBe('number');
    expect(typeof result.retries).toBe('number');

    // error is optional — present only on failure.
    if (result.error !== undefined) {
      expect(typeof result.error).toBe('string');
    }
  });

  it('success === true (the provider returned a valid completion)', () => {
    // The smoke test's whole point is to verify the canonical provider
    // abstraction works end-to-end. A failure here means either the
    // gateway credentials are wrong (401/403), the gateway is down
    // (5xx), or the response was empty. The `error` field carries
    // the actionable reason.
    if (!result.success) {
      // Print the actionable error so the operator can fix it.
      throw new Error(
        `Smoke test failed — provider "${provider}" returned success=false. ` +
          `Actionable error: ${result.error ?? '(no error field)'}. ` +
          `Check the gateway config (.z-ai-config) or the relevant API key env var.`
      );
    }
    expect(result.success).toBe(true);
  });

  it('content is a non-empty string (the model produced real output)', () => {
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    // A trivial sanity check — the prompt asked for "pong"; we don't
    // assert the EXACT word (models vary), but we DO assert non-empty
    // content was returned (no empty-string bug, no whitespace-only bug).
    expect(result.content.trim().length).toBeGreaterThan(0);
  });

  it('provider and model are non-empty strings (routing determined the real API target)', () => {
    expect(result.provider).toBeTruthy();
    expect(result.provider.length).toBeGreaterThan(0);
    expect(result.model).toBeTruthy();
    expect(result.model.length).toBeGreaterThan(0);
    // The provider field MUST match the configured provider (the
    // canonical "configured provider determines the real API invocation"
    // invariant — no silent substitution). When provider='z-ai' is
    // configured, the response provider MUST be 'z-ai' (not swapped
    // to OpenAI or vice versa).
    expect(result.provider).toBe(provider);
  });

  it('tokensUsed > 0 AND latencyMs > 0 (real usage was tracked + real latency measured)', () => {
    // tokensUsed > 0 — the provider returned a non-zero token count
    // (the SDK either reports usage or the adapter estimates it from
    // content length; both must be > 0 for real output).
    expect(result.tokensUsed).toBeGreaterThan(0);
    // latencyMs > 0 — wall-clock time was measured (a 0 would mean
    // the timer was never started, which would be a bug in the
    // provider abstraction).
    expect(result.latencyMs).toBeGreaterThan(0);
  });
});
