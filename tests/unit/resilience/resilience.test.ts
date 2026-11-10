// AcquisitionOS — Tests for resilience patterns
// Phase 7 acceptance tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getCircuitBreaker,
  getAllBreakerStates,
  resetBreaker,
  BreakerOpenError,
  _resetAllBreakers,
} from '@/lib/resilience/circuit-breaker';
import {
  getBulkhead,
  getAllBulkheadStates,
  BulkheadFullError,
  _resetAllBulkheads,
} from '@/lib/resilience/bulkhead';
import { withRetry } from '@/lib/resilience/retry';
import {
  isFeatureDegraded,
  getDegradedFeatures,
  setFeatureDegraded,
  degradedResponse,
  _resetEnvParsedForTests,
  type DegradableFeature,
} from '@/lib/resilience/degraded-mode';

describe('Circuit Breaker', () => {
  beforeEach(() => _resetAllBreakers());
  afterEach(() => _resetAllBreakers());

  it('stays closed on success', async () => {
    const breaker = getCircuitBreaker('test-ok', { failureThreshold: 3, cooldownMs: 100, timeoutMs: 1000 });
    const result = await breaker.exec(async () => 'ok');
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('closed');
  });

  it('opens after failureThreshold consecutive failures', async () => {
    const breaker = getCircuitBreaker('test-fail', { failureThreshold: 3, cooldownMs: 100, timeoutMs: 1000 });
    for (let i = 0; i < 3; i++) {
      await expect(breaker.exec(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    }
    expect(breaker.getState()).toBe('open');
  });

  it('short-circuits with BreakerOpenError when open', async () => {
    const breaker = getCircuitBreaker('test-short', { failureThreshold: 2, cooldownMs: 10_000, timeoutMs: 1000 });
    await expect(breaker.exec(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(breaker.exec(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('open');
    let called = false;
    await expect(breaker.exec(async () => { called = true; return 'ok'; })).rejects.toBeInstanceOf(BreakerOpenError);
    expect(called).toBe(false);
  });

  it('half-opens after cooldown and closes on trial success', async () => {
    const breaker = getCircuitBreaker('test-halfopen', { failureThreshold: 2, cooldownMs: 50, timeoutMs: 1000 });
    await expect(breaker.exec(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(breaker.exec(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('open');
    await new Promise((r) => setTimeout(r, 60));
    const result = await breaker.exec(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe('closed');
  });

  it('half-opens after cooldown and re-opens on trial failure', async () => {
    const breaker = getCircuitBreaker('test-halfopen-fail', { failureThreshold: 2, cooldownMs: 50, timeoutMs: 1000 });
    await expect(breaker.exec(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(breaker.exec(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('open');
    await new Promise((r) => setTimeout(r, 60));
    await expect(breaker.exec(async () => { throw new Error('still broken'); })).rejects.toThrow('still broken');
    expect(breaker.getState()).toBe('open');
  });

  it('resetBreaker clears state', async () => {
    const breaker = getCircuitBreaker('test-reset', { failureThreshold: 1, cooldownMs: 100_000, timeoutMs: 1000 });
    await expect(breaker.exec(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('open');
    expect(resetBreaker('test-reset')).toBe(true);
    expect(breaker.getState()).toBe('closed');
  });

  it('getAllBreakerStates exposes state for inspection', () => {
    getCircuitBreaker('test-inspect', { failureThreshold: 5 });
    const states = getAllBreakerStates();
    expect(states.find((s) => s.name === 'test-inspect')).toBeDefined();
  });
});

describe('Bulkhead', () => {
  beforeEach(() => _resetAllBulkheads());
  afterEach(() => _resetAllBulkheads());

  it('limits concurrent execution', async () => {
    const bulkhead = getBulkhead('test-concurrent', { maxConcurrent: 2, queueTimeoutMs: 2000 });
    let active = 0;
    let maxActive = 0;
    const makeTask = () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 50));
      active--;
      return 'ok';
    };
    await Promise.all([
      bulkhead.run(makeTask()),
      bulkhead.run(makeTask()),
      bulkhead.run(makeTask()),
      bulkhead.run(makeTask()),
    ]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('throws BulkheadFullError when full and no queue timeout', async () => {
    const bulkhead = getBulkhead('test-full', { maxConcurrent: 1 });
    const slowTask = new Promise((resolve) => setTimeout(resolve, 200));
    const running = bulkhead.run(async () => { await slowTask; return 'slow'; });
    await new Promise((r) => setTimeout(r, 10));
    await expect(bulkhead.run(async () => 'fast')).rejects.toBeInstanceOf(BulkheadFullError);
    await running;
  });

  it('getAllBulkheadStates exposes state', () => {
    getBulkhead('test-state', { maxConcurrent: 5 });
    const states = getAllBulkheadStates();
    expect(states.find((s) => s.name === 'test-state')).toBeDefined();
  });
});

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const result = await withRetry(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('retries on retryable errors and eventually succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('ECONNREFUSED: connection refused');
        return 'success';
      },
      { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 5 }
    );
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('does not retry on non-retryable errors', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('ValidationError: invalid input');
        },
        { maxAttempts: 5 }
      )
    ).rejects.toThrow('ValidationError');
    expect(attempts).toBe(1);
  });

  it('exhausts retries and throws the last error', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('ETIMEDOUT: connection timed out');
        },
        { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 }
      )
    ).rejects.toThrow('ETIMEDOUT');
    expect(attempts).toBe(3);
  });
});

describe('Graceful Degradation', () => {
  afterEach(() => {
    const features: DegradableFeature[] = [
      'lead-discovery', 'ai-enrichment', 'ai-chat', 'autonomous-outreach',
      'rag-ingest', 'email-sending', 'whatsapp-sending', 'telegram-sending',
    ];
    for (const f of features) setFeatureDegraded(f, false);
    delete process.env.DEGRADED_FEATURES;
    delete process.env.DEGRADED_MODE;
    _resetEnvParsedForTests();
  });

  it('returns false by default', () => {
    _resetEnvParsedForTests();
    expect(isFeatureDegraded('ai-chat')).toBe(false);
  });

  it('respects runtime toggles', () => {
    setFeatureDegraded('ai-chat', true);
    expect(isFeatureDegraded('ai-chat')).toBe(true);
    setFeatureDegraded('ai-chat', false);
    expect(isFeatureDegraded('ai-chat')).toBe(false);
  });

  it('getDegradedFeatures returns the list', () => {
    setFeatureDegraded('ai-chat', true);
    setFeatureDegraded('email-sending', true);
    const degraded = getDegradedFeatures();
    expect(degraded).toContain('ai-chat');
    expect(degraded).toContain('email-sending');
  });

  it('degradedResponse returns 503 with feature name', () => {
    const { status, body } = degradedResponse('ai-chat');
    expect(status).toBe(503);
    expect(body).toHaveProperty('feature', 'ai-chat');
    expect(body).toHaveProperty('error', 'service_unavailable');
  });

  it('respects DEGRADED_MODE env var', () => {
    _resetEnvParsedForTests();
    process.env.DEGRADED_MODE = 'true';
    expect(isFeatureDegraded('ai-chat')).toBe(true);
    expect(isFeatureDegraded('email-sending')).toBe(true);
    delete process.env.DEGRADED_MODE;
    _resetEnvParsedForTests();
  });
});
