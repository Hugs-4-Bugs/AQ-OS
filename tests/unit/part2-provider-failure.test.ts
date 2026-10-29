// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2 Tests — Provider Failure Classification
//
// Tests src/lib/ai/provider-failure.ts:
//   · Timeout, rate-limit, network → RETRYABLE
//   · Quota, billing, region-down → FALLBACK
//   · Invalid key, unsupported model, malformed → PERMANENT
//   · Approval required, sensitive action → HUMAN_REQUIRED
//   · Disagreement is NOT a provider failure (predicate check)
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  classifyProviderFailure,
  isRetryableProviderFailure,
  isFallbackProviderFailure,
  isHumanRequiredFailure,
} from '@/lib/ai/provider-failure';

describe('[Part 2] Provider Failure Classification', () => {
  describe('classifyProviderFailure', () => {
    it('classifies timeout as retryable', () => {
      const c = classifyProviderFailure(new Error('Request timed out after 30000ms'));
      expect(c.category).toBe('retryable');
      expect(c.shouldRetry).toBe(true);
      expect(c.shouldFallback).toBe(false);
      expect(c.shouldEscalate).toBe(false);
      expect(c.backoffMs).toBeGreaterThan(0);
    });

    it('classifies 429 rate limit as retryable', () => {
      const c = classifyProviderFailure('HTTP 429: rate limit exceeded');
      expect(c.category).toBe('retryable');
      expect(c.shouldRetry).toBe(true);
    });

    it('classifies 503 service unavailable as retryable', () => {
      const c = classifyProviderFailure('HTTP 503: service unavailable');
      expect(c.category).toBe('retryable');
    });

    it('classifies ECONNRESET as retryable', () => {
      const c = classifyProviderFailure('fetch failed: ECONNRESET');
      expect(c.category).toBe('retryable');
    });

    it('classifies quota exceeded as fallback', () => {
      const c = classifyProviderFailure('insufficient_quota: you exceeded your current quota');
      expect(c.category).toBe('fallback');
      expect(c.shouldFallback).toBe(true);
      expect(c.shouldRetry).toBe(false);
    });

    it('classifies payment required (402) as fallback', () => {
      const c = classifyProviderFailure('HTTP 402: payment required');
      expect(c.category).toBe('fallback');
    });

    it('classifies model overloaded as fallback', () => {
      const c = classifyProviderFailure('model_overloaded: try again later');
      expect(c.category).toBe('fallback');
    });

    it('classifies invalid API key as permanent', () => {
      const c = classifyProviderFailure('HTTP 401: invalid api key');
      expect(c.category).toBe('permanent');
      expect(c.shouldRetry).toBe(false);
      expect(c.shouldFallback).toBe(false);
    });

    it('classifies 403 forbidden as permanent', () => {
      const c = classifyProviderFailure('HTTP 403: forbidden');
      expect(c.category).toBe('permanent');
    });

    it('classifies model not found as permanent', () => {
      const c = classifyProviderFailure('model not found: gpt-99');
      expect(c.category).toBe('permanent');
    });

    it('classifies context window exceeded as permanent', () => {
      const c = classifyProviderFailure('maximum context length exceeded');
      expect(c.category).toBe('permanent');
    });

    it('classifies approval required as human_required', () => {
      const c = classifyProviderFailure('approval required for this action');
      expect(c.category).toBe('human_required');
      expect(c.shouldEscalate).toBe(true);
    });

    it('classifies sensitive action as human_required', () => {
      const c = classifyProviderFailure('sensitive action: human review required');
      expect(c.category).toBe('human_required');
    });

    it('falls back to Part 1 classifyError when no pattern matches', () => {
      // A generic error with no recognizable pattern. Part 1's
      // classifyError treats unknowns as 'retryable' (its safer default
      // — never silently mark unknown as permanent).
      const c = classifyProviderFailure(new Error('something weird happened'));
      expect(c.category).toBe('retryable');
    });

    it('handles string input (not Error instance)', () => {
      const c = classifyProviderFailure('timeout connecting to provider');
      expect(c.category).toBe('retryable');
    });

    it('handles null/undefined input gracefully', () => {
      const c = classifyProviderFailure(null);
      // Part 1 returns 'retryable' for null input (line 96 of retry-policy.ts).
      expect(c.category).toBe('retryable');
      // reason is the stringified error message ('' for null).
      expect(typeof c.reason).toBe('string');
    });

    it('respects Retry-After header value in backoff', () => {
      const c = classifyProviderFailure('HTTP 429: Retry-After: 5');
      expect(c.category).toBe('retryable');
      expect(c.backoffMs).toBeGreaterThanOrEqual(4500);
      expect(c.backoffMs).toBeLessThanOrEqual(5500);
    });

    it('caps backoff at 30s', () => {
      const c = classifyProviderFailure('HTTP 429: Retry-After: 999');
      // Retry-After > 60s is rejected; falls to ladder (capped at 30s).
      expect(c.backoffMs).toBeLessThanOrEqual(30000);
    });
  });

  describe('predicate helpers', () => {
    it('isRetryableProviderFailure returns true only for retryable', () => {
      expect(isRetryableProviderFailure('retryable')).toBe(true);
      expect(isRetryableProviderFailure('fallback')).toBe(false);
      expect(isRetryableProviderFailure('permanent')).toBe(false);
      expect(isRetryableProviderFailure('human_required')).toBe(false);
    });

    it('isFallbackProviderFailure returns true only for fallback', () => {
      expect(isFallbackProviderFailure('fallback')).toBe(true);
      expect(isFallbackProviderFailure('retryable')).toBe(false);
    });

    it('isHumanRequiredFailure returns true only for human_required', () => {
      expect(isHumanRequiredFailure('human_required')).toBe(true);
      expect(isHumanRequiredFailure('permanent')).toBe(false);
    });
  });

  describe('disagreement is NOT a provider failure', () => {
    it('disagreement message ("models disagreed") does not trigger FALLBACK', () => {
      const c = classifyProviderFailure('models disagreed: similarity 0.20');
      // The disagreement flow is handled elsewhere (synthesis.ts);
      // provider-failure classification must NOT confuse disagreement
      // with a fallback signal (which would cause the orchestrator to
      // try a different provider — wasteful for a non-provider issue).
      expect(c.shouldFallback).toBe(false);
      expect(c.shouldEscalate).toBe(false);
    });
  });
});
