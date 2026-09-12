// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Logger (src/lib/logger.ts)
// Tests log level filtering, formatting, child logger context
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  debug,
  info,
  warn,
  error,
  createLogger,
  withDuration,
  type LogEntry,
} from '@/lib/logger';

// Next's env typings mark NODE_ENV as read-only; tests need to toggle it,
// so assignments go through a cast (same runtime behavior as direct assignment).
const setNodeEnv = (value: string | undefined) => {
  (process.env as { NODE_ENV?: string }).NODE_ENV = value;
};

describe('logger', () => {
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  // ── Log level filtering ───────────────────────────────────────

  describe('log level filtering', () => {
    it('should log info messages by default', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      info('Test info message');

      expect(stdoutWriteSpy).toHaveBeenCalled();
      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Test info message');

      setNodeEnv(originalEnv);
    });

    it('should log warn messages to stderr', () => {
      warn('Test warning');

      expect(stderrWriteSpy).toHaveBeenCalled();
      const output = stderrWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Test warning');
    });

    it('should log error messages to stderr', () => {
      error('Test error');

      expect(stderrWriteSpy).toHaveBeenCalled();
      const output = stderrWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Test error');
    });
  });

  // ── JSON formatting in production ─────────────────────────────

  describe('JSON formatting in production', () => {
    it('should output JSON in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      info('JSON test message');

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      // Should be valid JSON
      const parsed = JSON.parse(output.trim());
      expect(parsed.message).toBe('JSON test message');
      expect(parsed.level).toBe('info');
      expect(parsed.timestamp).toBeDefined();

      setNodeEnv(originalEnv);
    });

    it('should include extra fields in JSON output', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      info('Extra fields test', undefined, { requestId: 'req-123' });

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.requestId).toBe('req-123');

      setNodeEnv(originalEnv);
    });

    it('should exclude undefined values from JSON', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      info('No undefined test', { userId: undefined });

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.userId).toBeUndefined();
      expect(parsed.message).toBe('No undefined test');

      setNodeEnv(originalEnv);
    });
  });

  // ── Pretty formatting in development ──────────────────────────

  describe('pretty formatting in development', () => {
    it('should use color codes in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('development');

      info('Pretty test message');

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      // Should contain ANSI color codes
      expect(output).toContain('\x1b[');

      setNodeEnv(originalEnv);
    });

    it('should include the level in uppercase', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('development');

      info('Level test');

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('INFO');

      setNodeEnv(originalEnv);
    });
  });

  // ── Child logger context propagation ──────────────────────────

  describe('child logger context propagation', () => {
    it('should include service name in all child logs', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      const childLogger = createLogger({ service: 'credit-service' });
      childLogger.info('Credit deducted');

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.service).toBe('credit-service');

      setNodeEnv(originalEnv);
    });

    it('should include userId from options', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      const childLogger = createLogger({ service: 'auth', userId: 'user-123' });
      childLogger.info('Login event');

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.userId).toBe('user-123');

      setNodeEnv(originalEnv);
    });

    it('should propagate context through withRequestId', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      const childLogger = createLogger({ service: 'api' });
      const requestLogger = childLogger.withRequestId('req-456');
      requestLogger.info('Request processed');

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.requestId).toBe('req-456');
      expect(parsed.service).toBe('api');

      setNodeEnv(originalEnv);
    });

    it('should propagate context through withUserId', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      const childLogger = createLogger({ service: 'billing' });
      const userLogger = childLogger.withUserId('user-789');
      userLogger.info('Payment processed');

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.userId).toBe('user-789');
      expect(parsed.service).toBe('billing');

      setNodeEnv(originalEnv);
    });
  });

  // ── Error logging with stack traces ───────────────────────────

  describe('error logging with stack traces', () => {
    it('should extract stack trace from Error objects in extra', () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      const testError = new Error('Something went wrong');
      error('Operation failed', undefined, { error: testError });

      const output = stderrWriteSpy.mock.calls.map(c => c[0]).join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.errorName).toBe('Error');
      expect(parsed.errorMessage).toBe('Something went wrong');
      expect(parsed.stack).toBeDefined();

      setNodeEnv(originalEnv);
    });
  });

  // ── withDuration ──────────────────────────────────────────────

  describe('withDuration', () => {
    it('should log duration on success', async () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      const result = await withDuration('database query', async () => 'result');

      expect(result).toBe('result');
      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.message).toContain('completed');
      expect(parsed.duration).toBeDefined();

      setNodeEnv(originalEnv);
    });

    it('should log duration on failure and re-throw', async () => {
      const originalEnv = process.env.NODE_ENV;
      setNodeEnv('production');

      await expect(
        withDuration('failing operation', async () => {
          throw new Error('Operation failed');
        })
      ).rejects.toThrow('Operation failed');

      const output = stderrWriteSpy.mock.calls.map(c => c[0]).join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.message).toContain('failed');
      expect(parsed.duration).toBeDefined();

      setNodeEnv(originalEnv);
    });
  });
});
