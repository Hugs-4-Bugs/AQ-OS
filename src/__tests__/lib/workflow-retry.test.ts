// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Part 1 — Workflow Retry Classification & Backoff
//
// Covers the shared reliability primitives in src/lib/workflow-retry.ts:
//   1. classifyStepError — retryable vs non-retryable taxonomy
//      (429/rate limits with Retry-After, 5xx/network, timeouts,
//      4xx validation/auth, business states, conservative unknown).
//   2. computeBackoffDelayMs — exponential backoff with FULL jitter,
//      Retry-After honored as a lower bound, deterministic via rand.
//   3. splitNicheList / leadMatchesRequestedNiches — multi-niche
//      targeting with per-lead attribution (never the joined string).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';

import {
  classifyStepError,
  computeBackoffDelayMs,
  splitNicheList,
  leadMatchesRequestedNiches,
  backoffBaseMs,
  backoffMaxMs,
  TERMINAL_EXECUTION_STATUSES,
} from '@/lib/workflow-retry';

// ═══════════════════════════════════════════════════════════════════
// 1. Error classification
// ═══════════════════════════════════════════════════════════════════

describe('classifyStepError — rate limiting (429)', () => {
  it('classifies HTTP 429 as retryable rate_limited', () => {
    const c = classifyStepError('HTTP 429: Too Many Requests');
    expect(c.retryable).toBe(true);
    expect(c.kind).toBe('rate_limited');
  });

  it('classifies provider rate-limit wording case-insensitively', () => {
    for (const msg of ['Rate limit exceeded', 'rate-limited by provider', 'Quota exceeded for today']) {
      const c = classifyStepError(msg);
      expect(c.retryable).toBe(true);
      expect(c.kind).toBe('rate_limited');
    }
  });

  it('parses a Retry-After hint into milliseconds (seconds and ms units)', () => {
    expect(classifyStepError('429 Too Many Requests — retry after 30s').retryAfterMs).toBe(30000);
    expect(classifyStepError('429: retry-after: 5000ms').retryAfterMs).toBe(5000);
    expect(classifyStepError('429 with no hint').retryAfterMs).toBeUndefined();
  });

  it('honors structured status codes', () => {
    expect(classifyStepError({ statusCode: 429 })).toMatchObject({ retryable: true, kind: 'rate_limited' });
    expect(classifyStepError({ statusCode: 503 })).toMatchObject({ retryable: true, kind: 'transient' });
    expect(classifyStepError({ statusCode: 401 })).toMatchObject({ retryable: false, kind: 'permanent' });
    expect(classifyStepError({ statusCode: 404 })).toMatchObject({ retryable: false, kind: 'permanent' });
  });

  it('an explicit structured retryable verdict wins over message content', () => {
    const c = classifyStepError({ retryable: false, statusCode: 429 });
    expect(c.retryable).toBe(false);
  });
});

describe('classifyStepError — transient / timeout / permanent / business', () => {
  it('classifies 5xx and network errors as retryable transient', () => {
    for (const msg of [
      'HTTP 502: Bad Gateway',
      '503 Service Unavailable',
      'fetch failed',
      'ECONNRESET',
      'socket hang up',
    ]) {
      expect(classifyStepError(msg)).toMatchObject({ retryable: true, kind: 'transient' });
    }
  });

  it('classifies timeouts as retryable (bounded by the engine budget)', () => {
    for (const msg of ['Request timed out after 5000ms', 'deadline exceeded', '__wf_step_timeout__']) {
      expect(classifyStepError(msg).retryable).toBe(true);
    }
  });

  it('classifies validation/auth/not-found errors as NON-retryable permanent', () => {
    for (const msg of [
      'Unauthorized',
      'Invalid API key',
      'Lead not found',
      'Note content is required',
      'Unknown action type: foo',
    ]) {
      expect(classifyStepError(msg)).toMatchObject({ retryable: false });
    }
  });

  it('classifies structured business states as NON-retryable business with the code', () => {
    const c = classifyStepError('NO_MATCHING_LEADS: no active leads for the niche');
    expect(c.retryable).toBe(false);
    expect(c.kind).toBe('business');
    expect(c.code).toBe('NO_MATCHING_LEADS');
  });

  it('unknown errors are conservatively NON-retryable (no blind re-execution)', () => {
    const c = classifyStepError('something completely unexpected happened');
    expect(c.retryable).toBe(false);
    expect(c.kind).toBe('unknown');
  });

  it('Error objects classify by their message', () => {
    expect(classifyStepError(new Error('HTTP 429: Too Many Requests')).kind).toBe('rate_limited');
    expect(classifyStepError(null).retryable).toBe(false);
    expect(classifyStepError(undefined).retryable).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Backoff with full jitter
// ═══════════════════════════════════════════════════════════════════

describe('computeBackoffDelayMs — exponential backoff with full jitter', () => {
  it('stays within [0, min(max, base * 2^attempt)] for every attempt', () => {
    const base = 1000;
    const max = 30000;
    for (let attempt = 0; attempt <= 10; attempt++) {
      const cap = Math.min(max, base * Math.pow(2, attempt));
      for (let i = 0; i < 200; i++) {
        const d = computeBackoffDelayMs(attempt, { baseMs: base, maxMs: max, rand: Math.random });
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('is bounded by maxMs even at absurd attempt numbers', () => {
    expect(computeBackoffDelayMs(50, { baseMs: 1000, maxMs: 30000, rand: () => 1 })).toBe(30000);
  });

  it('a Retry-After hint is a lower bound (server cooldown respected, capped)', () => {
    const d = computeBackoffDelayMs(0, { baseMs: 1000, maxMs: 30000, retryAfterMs: 2500, rand: () => 0 });
    expect(d).toBeGreaterThanOrEqual(2500);
    expect(d).toBeLessThanOrEqual(2500 + 1000);
    // Cap applies: a huge hint never exceeds the ceiling.
    const capped = computeBackoffDelayMs(0, { baseMs: 1000, maxMs: 30000, retryAfterMs: 999999, rand: () => 0 });
    expect(capped).toBe(30000);
  });

  it('deterministic under an injected rand', () => {
    expect(computeBackoffDelayMs(3, { baseMs: 1000, maxMs: 30000, rand: () => 0.5 })).toBe(4000);
    expect(computeBackoffDelayMs(1, { baseMs: 1000, maxMs: 30000, rand: () => 0 })).toBe(0);
  });

  it('env-tunable base and ceiling', () => {
    process.env.WORKFLOW_RETRY_BACKOFF_BASE_MS = '10';
    process.env.WORKFLOW_RETRY_BACKOFF_MAX_MS = '50';
    try {
      expect(backoffBaseMs()).toBe(10);
      expect(backoffMaxMs()).toBe(50);
      // base 10, attempt 2 → cap = 10 * 2^2 = 40 (below the ceiling)
      expect(computeBackoffDelayMs(2, { rand: () => 1 })).toBe(40);
      // high attempt → exponential cap clamps at the 50ms ceiling
      expect(computeBackoffDelayMs(10, { rand: () => 1 })).toBe(50);
    } finally {
      delete process.env.WORKFLOW_RETRY_BACKOFF_BASE_MS;
      delete process.env.WORKFLOW_RETRY_BACKOFF_MAX_MS;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Multi-niche splitting + per-lead attribution
// ═══════════════════════════════════════════════════════════════════

describe('splitNicheList — multi-niche targeting', () => {
  it('splits a comma-separated niche target into distinct niches', () => {
    expect(splitNicheList('hospital, dentist')).toEqual(['hospital', 'dentist']);
    expect(splitNicheList('hospital,dentist')).toEqual(['hospital', 'dentist']);
    expect(splitNicheList(' agency ,  real estate ; restaurants ')).toEqual(['agency', 'real estate', 'restaurants']);
  });

  it('dedupes case-insensitively and drops empty entries', () => {
    expect(splitNicheList('Dental, dental, , Dental')).toEqual(['Dental']);
    expect(splitNicheList('')).toEqual([]);
    expect(splitNicheList(null)).toEqual([]);
    expect(splitNicheList(undefined)).toEqual([]);
  });

  it('a single niche survives verbatim (trimmed)', () => {
    expect(splitNicheList('  Dental ')).toEqual(['Dental']);
  });
});

describe('leadMatchesRequestedNiches — attribution correctness', () => {
  it('a hospital lead matches "hospital, dentist" targeting — and keeps its OWN niche', () => {
    const requested = splitNicheList('hospital, dentist');
    expect(leadMatchesRequestedNiches('hospital', requested)).toBe(true);
    expect(leadMatchesRequestedNiches('dentist', requested)).toBe(true);
  });

  it('the comma-joined string itself never matches (the attribution bug)', () => {
    const requested = splitNicheList('hospital, dentist');
    expect(leadMatchesRequestedNiches('hospital, dentist', requested)).toBe(false);
    expect(leadMatchesRequestedNiches('hospital,dentist', requested)).toBe(false);
  });

  it('matching is exact and case-insensitive, never substring', () => {
    expect(leadMatchesRequestedNiches('Stationery Design', ['Stationery'])).toBe(false);
    expect(leadMatchesRequestedNiches('STATIONERY', ['Stationery'])).toBe(true);
    expect(leadMatchesRequestedNiches(null, ['Dental'])).toBe(false);
    expect(leadMatchesRequestedNiches('Dental', [])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Execution status model
// ═══════════════════════════════════════════════════════════════════

describe('execution status model (Part 1)', () => {
  it('terminal statuses include exhausted; waiting_user_action is NOT terminal', () => {
    expect(TERMINAL_EXECUTION_STATUSES.has('completed')).toBe(true);
    expect(TERMINAL_EXECUTION_STATUSES.has('failed')).toBe(true);
    expect(TERMINAL_EXECUTION_STATUSES.has('cancelled')).toBe(true);
    expect(TERMINAL_EXECUTION_STATUSES.has('exhausted')).toBe(true);
    // A business state waiting on the user is deliberately not terminal —
    // but it is never retried in the background either.
    expect(TERMINAL_EXECUTION_STATUSES.has('waiting_user_action')).toBe(false);
    expect(TERMINAL_EXECUTION_STATUSES.has('running')).toBe(false);
  });
});
