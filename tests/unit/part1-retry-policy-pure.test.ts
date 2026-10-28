// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Retry Policy (pure logic, no DB)
//
// Verifies the classifyError + decideRetry + computeBackoffMs
// heuristics without touching the database. These tests are fast and
// deterministic — they exercise the pure decision logic.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  classifyError,
  decideRetry,
  computeBackoffMs,
  __part1RetryPolicyInternal,
} from '@/lib/autopilot/retry-policy';

describe('[Part 1] retry-policy — classifyError', () => {
  it('classifies timeouts as retryable', () => {
    expect(classifyError(new Error('Request timeout after 5000ms'))).toBe('retryable');
    expect(classifyError('ETIMEDOUT')).toBe('retryable');
    expect(classifyError('fetch failed: ECONNRESET')).toBe('retryable');
  });

  it('classifies rate limits as retryable', () => {
    expect(classifyError('HTTP 429 Too Many Requests')).toBe('retryable');
    expect(classifyError('rate limit exceeded')).toBe('retryable');
  });

  it('classifies 5xx errors as retryable', () => {
    expect(classifyError('HTTP 502 Bad Gateway')).toBe('retryable');
    expect(classifyError('503 service unavailable')).toBe('retryable');
    expect(classifyError('HTTP 504')).toBe('retryable');
  });

  it('classifies SQLite busy / locked as retryable', () => {
    expect(classifyError('database is locked')).toBe('retryable');
    expect(classifyError('SQLITE_BUSY')).toBe('retryable');
  });

  it('classifies invalid credentials as permanent', () => {
    expect(classifyError('invalid credentials: 401 Unauthorized')).toBe('permanent');
    expect(classifyError('Invalid API key')).toBe('permanent');
    expect(classifyError('HTTP 403 Forbidden')).toBe('permanent');
  });

  it('classifies unsupported provider as permanent', () => {
    expect(classifyError('unsupported provider: foo')).toBe('permanent');
    expect(classifyError('unsupported model: bar')).toBe('permanent');
    expect(classifyError('invalid configuration: missing field')).toBe('permanent');
  });

  it('classifies approval-required as human_required', () => {
    expect(classifyError('approval required for email.send')).toBe('human_required');
    expect(classifyError('permission denied')).toBe('human_required');
    expect(classifyError('account disconnected: please reconnect')).toBe('human_required');
  });

  it('defaults UNKNOWN errors to retryable (never silent-permanent)', () => {
    // An error we've never seen before should NOT be marked permanent
    // (would block the invocation unnecessarily) — default to retryable.
    expect(classifyError('something completely unprecedented xyzzy')).toBe('retryable');
    expect(classifyError(new Error('novel transient failure'))).toBe('retryable');
  });

  it('classifies null/undefined as retryable (defensive)', () => {
    expect(classifyError(null)).toBe('retryable');
    expect(classifyError(undefined)).toBe('retryable');
    expect(classifyError('')).toBe('retryable');
  });

  it('respects precedence: human_required > permanent > retryable', () => {
    // A message that contains BOTH 'approval required' AND 'invalid credentials'
    // — the human-required bucket wins (it's the more actionable signal).
    expect(
      classifyError('approval required despite invalid credentials'),
    ).toBe('human_required');
  });
});

describe('[Part 1] retry-policy — computeBackoffMs', () => {
  it('returns the base backoff on attempt 0', () => {
    // First retry → ~5s base (with jitter ±25%).
    for (let i = 0; i < 20; i++) {
      const ms = computeBackoffMs(0);
      expect(ms).toBeGreaterThanOrEqual(__part1RetryPolicyInternal.BASE_BACKOFF_MS * 0.75);
      expect(ms).toBeLessThanOrEqual(__part1RetryPolicyInternal.BASE_BACKOFF_MS * 1.25);
    }
  });

  it('exponentially grows the backoff', () => {
    const a0 = computeBackoffMs(0);
    const a2 = computeBackoffMs(2);
    const a4 = computeBackoffMs(4);
    // Each step roughly doubles the base — a4 should be ≥ a0 × 4.
    expect(a4).toBeGreaterThan(a0 * 3);
    expect(a2).toBeGreaterThan(a0 * 1.5);
  });

  it('caps the backoff at the 5-minute ceiling', () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const ms = computeBackoffMs(attempt);
      expect(ms).toBeLessThanOrEqual(__part1RetryPolicyInternal.MAX_BACKOFF_MS);
    }
  });
});

describe('[Part 1] retry-policy — decideRetry', () => {
  it('returns shouldRetry=true for retryable errors within budget', () => {
    const d = decideRetry({
      error: new Error('timeout'),
      retryCount: 0,
      maxRetries: 3,
    });
    expect(d.category).toBe('retryable');
    expect(d.shouldRetry).toBe(true);
    expect(d.shouldBlock).toBe(false);
    expect(d.shouldPause).toBe(false);
    expect(d.backoffMs).toBeGreaterThan(0);
  });

  it('escalates to human_required after retries are exhausted', () => {
    const d = decideRetry({
      error: new Error('timeout'),
      retryCount: 3,
      maxRetries: 3,
    });
    expect(d.category).toBe('human_required');
    expect(d.shouldRetry).toBe(false);
    expect(d.shouldPause).toBe(true);
    expect(d.shouldBlock).toBe(false);
  });

  it('returns shouldBlock=true for permanent failures immediately', () => {
    const d = decideRetry({
      error: new Error('invalid credentials'),
      retryCount: 0,
      maxRetries: 3,
      stepKey: 'discovery',
    });
    expect(d.category).toBe('permanent');
    expect(d.shouldBlock).toBe(true);
    expect(d.shouldRetry).toBe(false);
    expect(d.shouldPause).toBe(false);
    expect(d.reason).toContain('Permanent failure');
    expect(d.reason).toContain('discovery');
  });

  it('returns shouldPause=true for human-required errors', () => {
    const d = decideRetry({
      error: new Error('approval required'),
      retryCount: 0,
      maxRetries: 3,
    });
    expect(d.category).toBe('human_required');
    expect(d.shouldPause).toBe(true);
    expect(d.shouldRetry).toBe(false);
    expect(d.shouldBlock).toBe(false);
  });

  it('default maxRetries = 3 when not specified', () => {
    // retryCount = 2 is still within budget (3 attempts allowed).
    const d = decideRetry({
      error: new Error('timeout'),
      retryCount: 2,
    });
    expect(d.shouldRetry).toBe(true);
    // retryCount = 3 exceeds default budget.
    const d2 = decideRetry({
      error: new Error('timeout'),
      retryCount: 3,
    });
    expect(d2.shouldPause).toBe(true);
  });

  it('reason string includes stepKey when provided', () => {
    const d = decideRetry({
      error: new Error('timeout'),
      retryCount: 0,
      stepKey: 'qualification',
    });
    expect(d.reason).toContain('qualification');
  });
});
