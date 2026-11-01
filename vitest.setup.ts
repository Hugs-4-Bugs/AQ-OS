import '@testing-library/jest-dom/vitest';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock Next.js headers/cookies
vi.mock('next/headers', () => ({
  headers: () => new Headers(),
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// ═══════════════════════════════════════════════════════════════════
// CRITICAL: Clear Node.js require.cache for Prisma modules AND db.ts
// so each worker loads the freshly generated version from disk.
//
// src/lib/db.ts regenerates the Prisma client at module load time.
// However, the vitest SERVER process may preload @prisma/client AND
// db.ts at startup (before regeneration runs), caching the stale DMMF.
// By clearing require.cache for ALL prisma-related modules (including
// db.ts itself) in each worker's setup, we force the next import to
// re-execute db.ts (which regenerates the client) and then load the
// fresh @prisma/client from disk.
// ═══════════════════════════════════════════════════════════════════
const prismaCacheKeys = Object.keys(require.cache).filter(
  (key) =>
    key.includes('@prisma/client') ||
    key.includes('.prisma/client') ||
    key.includes('/lib/db') ||
    key.includes('\\lib\\db')
);
for (const key of prismaCacheKeys) {
  delete require.cache[key];
}

// Each vitest worker (fork) gets its OWN isolated SQLite database to
// eliminate parallel-write contention (SQLite's single-writer lock).
// The DB is seeded with the schema from test-schema.db (no data) so
// every worker starts fresh. The per-PID filename ensures no two
// workers share the same DB file.
const isolatedDir = join(process.cwd(), '.test-db-isolated');
if (!existsSync(isolatedDir)) {
  mkdirSync(isolatedDir, { recursive: true });
}
const workerDbPath = join(isolatedDir, `unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
const schemaSource = join(process.cwd(), 'test-schema.db');
if (existsSync(schemaSource)) {
  copyFileSync(schemaSource, workerDbPath);
}
process.env.DATABASE_URL = `file:${workerDbPath}`;
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-min-32-chars';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
