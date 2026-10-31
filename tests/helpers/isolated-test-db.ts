// ═══════════════════════════════════════════════════════════════════
// Isolated Test Database Helper
//
// Provides each E2E test file with its OWN SQLite database file, copied
// from the schema-only test.db template. This eliminates parallel-write
// contention (SQLite's single-writer lock) when multiple E2E test files
// run simultaneously, and ensures no test ever touches db/custom.db
// (production data).
//
// Usage in a test file's vi.hoisted block:
//   vi.hoisted(() => {
//     const { setupIsolatedTestDb } = require('./tests/helpers/isolated-test-db');
//     process.env.DATABASE_URL = setupIsolatedTestDb('my-test-file');
//   });
//
// The helper:
//   1. Copies the schema from test.db to a unique file (e.g. test-my-test-file.db)
//   2. Returns the file: URL for that file
//   3. The file is fresh (no data) — test creates and cleans up its own data
// ═══════════════════════════════════════════════════════════════════

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const SCHEMA_SOURCE = join(process.cwd(), 'test.db');
const ISOLATED_DIR = join(process.cwd(), '.test-db-isolated');

export function setupIsolatedTestDb(label: string): string {
  // Ensure the isolated DB directory exists
  if (!existsSync(ISOLATED_DIR)) {
    mkdirSync(ISOLATED_DIR, { recursive: true });
  }

  const dbPath = join(ISOLATED_DIR, `${label}.db`);

  // Copy the schema-only template (fresh, no data)
  if (existsSync(SCHEMA_SOURCE)) {
    copyFileSync(SCHEMA_SOURCE, dbPath);
  } else {
    // If test.db doesn't exist, the Prisma client will create the DB
    // on first query. Tables will be created by prisma db push at setup.
  }

  return `file:${dbPath}`;
}
