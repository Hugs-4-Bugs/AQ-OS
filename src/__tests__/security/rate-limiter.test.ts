// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Rate Limiter (src/lib/security/rate-limiter.ts)
// Tests sliding window rate limiting, rate limit checks, and headers
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, RATE_LIMITERS, type RateLimitResult } from '@/lib/security/rate-limiter';

describe('rate-limiter', () => {
  // ── RATE_LIMITERS configuration ───────────────────────────────

  describe('RATE_LIMITERS', () => {
    it('should have api limiter with 100 req/min', () => {
      expect(RATE_LIMITERS.api.limit).toBe(100);
      expect(RATE_LIMITERS.api.windowSeconds).toBe(60);
    });

    it('should have auth limiter with 5 req/min', () => {
      expect(RATE_LIMITERS.auth.limit).toBe(5);
      expect(RATE_LIMITERS.auth.windowSeconds).toBe(60);
    });

    it('should have ai limiter with 20 req/min', () => {
      expect(RATE_LIMITERS.ai.limit).toBe(20);
      expect(RATE_LIMITERS.ai.windowSeconds).toBe(60);
    });

    it('should have export limiter with 5 req/min', () => {
      expect(RATE_LIMITERS.export.limit).toBe(5);
      expect(RATE_LIMITERS.export.windowSeconds).toBe(60);
    });
  });

  // ── checkRateLimit ────────────────────────────────────────────

  describe('checkRateLimit', () => {
    const config = { limit: 3, windowSeconds: 60 };

    it('should allow requests under the limit', () => {
      const result = checkRateLimit('test-key-1', config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(result.limit).toBe(3);
    });

    it('should block requests after exceeding the limit', () => {
      const key = `test-block-${Date.now()}`;
      checkRateLimit(key, config); // 1
      checkRateLimit(key, config); // 2
      checkRateLimit(key, config); // 3

      const result = checkRateLimit(key, config); // 4th - blocked
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should track different keys independently', () => {
      const key1 = `test-independent-1-${Date.now()}`;
      const key2 = `test-independent-2-${Date.now()}`;

      const result1 = checkRateLimit(key1, config);
      const result2 = checkRateLimit(key2, config);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it('should return correct resetAt timestamp', () => {
      const result = checkRateLimit(`test-reset-${Date.now()}`, config);
      expect(result.resetAt).toBeGreaterThan(0);
      // resetAt should be a Unix timestamp in seconds
      expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000) - 1);
    });

    it('should decrement remaining count on each allowed request', () => {
      const key = `test-remaining-${Date.now()}`;
      const r1 = checkRateLimit(key, config);
      expect(r1.remaining).toBe(2);

      const r2 = checkRateLimit(key, config);
      expect(r2.remaining).toBe(1);

      const r3 = checkRateLimit(key, config);
      expect(r3.remaining).toBe(0);
    });

    it('should set retryAfter when blocked', () => {
      const key = `test-retry-${Date.now()}`;
      checkRateLimit(key, config);
      checkRateLimit(key, config);
      checkRateLimit(key, config);

      const result = checkRateLimit(key, config);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThanOrEqual(1);
    });
  });
});
