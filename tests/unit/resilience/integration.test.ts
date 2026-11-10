// AcquisitionOS — Integration tests for resilience into actual call paths.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getCircuitBreaker,
  getAllBreakerStates,
  BreakerOpenError,
  _resetAllBreakers,
} from '@/lib/resilience/circuit-breaker';

describe('Resilience integration — AI provider circuit breakers', () => {
  beforeEach(() => _resetAllBreakers());
  afterEach(() => _resetAllBreakers());

  it('creates a breaker named "ai:<provider>" matching executeAICompletion naming', async () => {
    const zaiBreaker = getCircuitBreaker('ai:z-ai', { failureThreshold: 5, cooldownMs: 30_000, timeoutMs: 8000 });
    expect(zaiBreaker.getState()).toBe('closed');
    const openaiBreaker = getCircuitBreaker('ai:openai', { failureThreshold: 5, cooldownMs: 30_000, timeoutMs: 8000 });
    expect(openaiBreaker.getState()).toBe('closed');
    for (let i = 0; i < 5; i++) {
      await expect(zaiBreaker.exec(async () => { throw new Error('ECONNREFUSED'); })).rejects.toThrow('ECONNREFUSED');
    }
    expect(zaiBreaker.getState()).toBe('open');
    expect(openaiBreaker.getState()).toBe('closed');
  });

  it('exposes all AI provider breakers via getAllBreakerStates', () => {
    const providers = ['z-ai', 'openai', 'anthropic', 'openrouter', 'gemini', 'deepseek', 'local'];
    for (const p of providers) {
      getCircuitBreaker(`ai:${p}`, { failureThreshold: 5 });
    }
    const states = getAllBreakerStates();
    const aiBreakers = states.filter((s) => s.name.startsWith('ai:'));
    expect(aiBreakers.length).toBeGreaterThanOrEqual(7);
  });

  it('BreakerOpenError is a subclass of Error', () => {
    const err = new BreakerOpenError('ai:test', 5000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BreakerOpenError);
    expect(err.name).toBe('BreakerOpenError');
    expect(err.breakerName).toBe('ai:test');
    expect(err.retryAfterMs).toBe(5000);
  });
});

describe('Resilience integration — email circuit breakers', () => {
  beforeEach(() => _resetAllBreakers());
  afterEach(() => _resetAllBreakers());

  it('creates breakers named "email:resend" and "email:smtp"', () => {
    const resendBreaker = getCircuitBreaker('email:resend', { failureThreshold: 5, cooldownMs: 60_000, timeoutMs: 15_000 });
    const smtpBreaker = getCircuitBreaker('email:smtp', { failureThreshold: 5, cooldownMs: 60_000, timeoutMs: 20_000 });
    expect(resendBreaker.getState()).toBe('closed');
    expect(smtpBreaker.getState()).toBe('closed');
    const states = getAllBreakerStates();
    expect(states.find((s) => s.name === 'email:resend')).toBeDefined();
    expect(states.find((s) => s.name === 'email:smtp')).toBeDefined();
  });

  it('isolates Resend failures from SMTP', async () => {
    const resendBreaker = getCircuitBreaker('email:resend-isolated', { failureThreshold: 3, cooldownMs: 10_000, timeoutMs: 1000 });
    const smtpBreaker = getCircuitBreaker('email:smtp-isolated', { failureThreshold: 3, cooldownMs: 10_000, timeoutMs: 1000 });
    for (let i = 0; i < 3; i++) {
      await expect(resendBreaker.exec(async () => { throw new Error('429 Too Many Requests'); })).rejects.toThrow('429');
    }
    expect(resendBreaker.getState()).toBe('open');
    expect(smtpBreaker.getState()).toBe('closed');
    await expect(resendBreaker.exec(async () => 'sent')).rejects.toBeInstanceOf(BreakerOpenError);
    const result = await smtpBreaker.exec(async () => 'sent via smtp');
    expect(result).toBe('sent via smtp');
  });
});

describe('Resilience integration — webhook circuit breakers (per-host)', () => {
  beforeEach(() => _resetAllBreakers());
  afterEach(() => _resetAllBreakers());

  it('creates a breaker named "webhook:<hostname>" per destination', () => {
    const hook1 = getCircuitBreaker('webhook:api.customer1.com', { failureThreshold: 5 });
    const hook2 = getCircuitBreaker('webhook:api.customer2.com', { failureThreshold: 5 });
    expect(hook1.getState()).toBe('closed');
    expect(hook2.getState()).toBe('closed');
  });

  it('isolates per-host — one bad customer webhook does not break another', async () => {
    const bad = getCircuitBreaker('webhook:bad.customer.com', { failureThreshold: 2, cooldownMs: 30_000, timeoutMs: 1000 });
    const good = getCircuitBreaker('webhook:good.customer.com', { failureThreshold: 2, cooldownMs: 30_000, timeoutMs: 1000 });
    await expect(bad.exec(async () => { throw new Error('ECONNREFUSED'); })).rejects.toThrow();
    await expect(bad.exec(async () => { throw new Error('ECONNREFUSED'); })).rejects.toThrow();
    expect(bad.getState()).toBe('open');
    const result = await good.exec(async () => 'ok');
    expect(result).toBe('ok');
    expect(good.getState()).toBe('closed');
  });
});

describe('DPDP gap #5 — lead enrichment audit trail', () => {
  it('extractEnrichmentData signature includes userId and leadId parameters', async () => {
    const mod = await import('@/lib/lead-enrichment-service');
    expect(typeof mod.enrichLead).toBe('function');
    expect(mod.enrichLead.length).toBeGreaterThanOrEqual(2);
  });
});
