// ═══════════════════════════════════════════════════════════════════
// Vitest Global Setup — Prisma Client Regeneration
//
// Runs ONCE before all test workers start. Regenerates the Prisma client
// from the develop schema so every worker loads a client with the correct
// DMMF (including fields like profileMappings that the main repo's schema
// lacks when node_modules is shared between worktrees).
//
// This is a test infrastructure fix — it does NOT modify production code,
// the database, or any application behavior. It only ensures the Prisma
// client TypeScript/runtime artifacts match the current schema.
// ═══════════════════════════════════════════════════════════════════

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export default function setup() {
  const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma');
  if (!existsSync(schemaPath)) {
    console.warn('[global-setup] schema.prisma not found — skipping prisma generate');
    return;
  }

  try {
    execSync(`npx prisma generate --schema="${schemaPath}"`, {
      stdio: 'pipe',
      timeout: 60000,
    });
    console.log('[global-setup] Prisma client regenerated from develop schema');
  } catch (err) {
    console.warn('[global-setup] prisma generate failed — tests may use a stale client:', err);
  }
}
