// ═══════════════════════════════════════════════════════════════════
// Database Safety Regression Tests
//
// Verifies that resolveDatabaseUrl() (src/lib/db.ts) NEVER silently
// falls back to the production database path. Tests:
//   1. Production + missing DATABASE_URL → throws
//   2. Production + empty DATABASE_URL → throws
//   3. Development + missing DATABASE_URL → safe fallback (file:./dev.db)
//   4. Configured DATABASE_URL → uses configured value
//   5. No code path uses /home/z/my-project/db/custom.db
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// We need to test resolveDatabaseUrl() in isolation. Since db.ts runs
// ensureWritableDatabasePath() at module load time (which has side effects),
// we test the exported function directly.

// Mock the side-effecting parts of db.ts so importing it is safe.
vi.mock('@/lib/observability/metrics-collector', () => ({
  metricsCollector: {
    observeHistogram: vi.fn(),
    incrementCounter: vi.fn(),
  },
}));
vi.mock('@/lib/observability/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import AFTER mocks are in place
import { resolveDatabaseUrl } from '@/lib/db';

describe('Database URL Safety — resolveDatabaseUrl()', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean slate for each test
    delete process.env.DATABASE_URL;
    delete process.env.__DB_FALLBACK_WARNED;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('Production environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('throws when DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL;
      expect(() => resolveDatabaseUrl()).toThrow(/DATABASE_URL is not set in production/);
    });

    it('throws when DATABASE_URL is empty string', () => {
      process.env.DATABASE_URL = '';
      expect(() => resolveDatabaseUrl()).toThrow(/DATABASE_URL is not set in production/);
    });

    it('throws when DATABASE_URL is whitespace-only', () => {
      process.env.DATABASE_URL = '   ';
      expect(() => resolveDatabaseUrl()).toThrow(/DATABASE_URL is not set in production/);
    });

    it('uses DATABASE_URL when explicitly set', () => {
      process.env.DATABASE_URL = 'file:/app/data/production.db';
      expect(resolveDatabaseUrl()).toBe('file:/app/data/production.db');
    });

    it('uses PostgreSQL URL when set', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
      expect(resolveDatabaseUrl()).toBe('postgresql://user:pass@host:5432/db');
    });
  });

  describe('Development environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('falls back to file:./dev.db when DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL;
      const url = resolveDatabaseUrl();
      expect(url).toBe('file:./dev.db');
      expect(url).not.toContain('/home/z/my-project');
    });

    it('falls back to file:./dev.db when DATABASE_URL is empty', () => {
      process.env.DATABASE_URL = '';
      const url = resolveDatabaseUrl();
      expect(url).toBe('file:./dev.db');
    });

    it('uses DATABASE_URL when explicitly set', () => {
      process.env.DATABASE_URL = 'file:./custom-dev.db';
      expect(resolveDatabaseUrl()).toBe('file:./custom-dev.db');
    });
  });

  describe('Test environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('falls back to file:./test.db when DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL;
      const url = resolveDatabaseUrl();
      expect(url).toBe('file:./test.db');
      expect(url).not.toContain('/home/z/my-project');
    });

    it('uses DATABASE_URL when set by vitest.setup.ts', () => {
      process.env.DATABASE_URL = 'file:.test-db-isolated/unit-worker-123.db';
      expect(resolveDatabaseUrl()).toBe('file:.test-db-isolated/unit-worker-123.db');
    });
  });

  describe('Production safety guarantee', () => {
    it('NEVER returns /home/z/my-project/db/custom.db in any environment', () => {
      // Test all environments
      for (const env of ['production', 'development', 'test', undefined]) {
        process.env.NODE_ENV = env;
        delete process.env.DATABASE_URL;

        if (env === 'production') {
          expect(() => resolveDatabaseUrl()).toThrow();
        } else {
          const url = resolveDatabaseUrl();
          expect(url).not.toContain('/home/z/my-project');
          expect(url).not.toContain('custom.db');
        }
      }
    });
  });
});
