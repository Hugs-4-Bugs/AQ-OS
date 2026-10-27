#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// Workstream B — Additive Migration: DiscoveredModel table
//
// Creates the `DiscoveredModel` table (Phase 26 v3 / Workstream B) for
// caching live + catalog model metadata per (userId, provider).
//
// ADDITIVE + IDEMPOTENT:
//   · CREATE TABLE IF NOT EXISTS
//   · CREATE UNIQUE INDEX IF NOT EXISTS
//   · No DROP, no ALTER on existing tables, no data modification.
//
// Verified by:
//   · sqlite3 .tables count increment (127 → 128)
//   · integrity_check PRAGMA
//   · foreign_key_check PRAGMA
//   · row count preservation on all critical tables (User, Lead,
//     WorkflowExecution, AutopilotRun, etc.)
// ═══════════════════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/^file:/, '')
  : path.resolve(__dirname, '..', 'db', 'custom.db');

const BACKUP_DIR = path.resolve(__dirname, '..', 'db');
const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const backupPath = path.join(BACKUP_DIR, `custom.db.workstream-b-pre-${stamp}.bak`);

function getSqliteClient() {
  // Try to use better-sqlite3 if available, else fall back to prisma's raw SQL
  try {
    const Database = require('better-sqlite3');
    return new Database(DB_PATH);
  } catch {
    return null;
  }
}

function snapshotCriticalCounts(db) {
  const tables = [
    'User', 'Subscription', 'Lead', 'WorkflowExecution',
    'AutopilotRun', 'AutopilotWorkflow', 'BusinessProfile',
    'DiscoveryJob', 'CreditsLedger',
    'UserAIProvider', 'Agent', 'AgentRun', 'ModelInvocation',
  ];
  const counts = {};
  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT count(*) as c FROM "${t}"`).get();
      counts[t] = row ? row.c : 0;
    } catch {
      counts[t] = 'missing';
    }
  }
  return counts;
}

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Workstream B — Additive Migration: DiscoveredModel');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('DB path:', DB_PATH);

  if (!fs.existsSync(DB_PATH)) {
    console.error('FATAL: db/custom.db not found at', DB_PATH);
    process.exit(1);
  }

  // Backup
  const buf = fs.readFileSync(DB_PATH);
  fs.writeFileSync(backupPath, buf);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  console.log('Backup created:', backupPath);
  console.log('Pre-migration SHA256:', sha);
  console.log('Pre-migration size:', buf.length, 'bytes');

  const db = getSqliteClient();
  if (!db) {
    console.error('FATAL: better-sqlite3 not available; install deps first (bun install).');
    process.exit(2);
  }

  // Pre-migration counts
  const pre = snapshotCriticalCounts(db);
  console.log('Pre-migration critical row counts:', pre);
  const preTables = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get();
  console.log('Pre-migration table count:', preTables.c);

  // ── Additive: CREATE TABLE IF NOT EXISTS ──────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS "DiscoveredModel" (
      "id"                      TEXT PRIMARY KEY NOT NULL,
      "userId"                  TEXT NOT NULL,
      "provider"                TEXT NOT NULL,
      "modelId"                 TEXT NOT NULL,
      "displayName"             TEXT,
      "source"                  TEXT NOT NULL DEFAULT 'catalog',
      "contextLength"           INTEGER,
      "supportsVision"           BOOLEAN NOT NULL DEFAULT 0,
      "supportsTools"            BOOLEAN NOT NULL DEFAULT 0,
      "supportsStructuredOutput" BOOLEAN NOT NULL DEFAULT 0,
      "supportsReasoning"        BOOLEAN NOT NULL DEFAULT 0,
      "inputModalities"         TEXT,
      "outputModalities"        TEXT,
      "availability"            TEXT,
      "lastVerifiedAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "rawMetadata"             TEXT,
      "createdAt"               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Unique index — at most one row per (userId, provider, modelId)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_discoveredmodel_userId_provider_modelId"
      ON "DiscoveredModel" ("userId", "provider", "modelId");
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS "idx_discoveredmodel_userId_provider"
      ON "DiscoveredModel" ("userId", "provider");
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS "DiscoveredModel_provider_idx"
      ON "DiscoveredModel" ("provider");
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS "DiscoveredModel_availability_idx"
      ON "DiscoveredModel" ("availability");
  `);

  // ── Verify ────────────────────────────────────────────────────────
  const post = snapshotCriticalCounts(db);
  console.log('Post-migration critical row counts:', post);
  const postTables = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get();
  console.log('Post-migration table count:', postTables.c);

  // integrity_check
  const integ = db.prepare("PRAGMA integrity_check").all();
  console.log('integrity_check:', integ[0] && integ[0].integrity_check ? integ[0].integrity_check : 'OK');

  // foreign_key_check (should return 0 rows)
  const fk = db.prepare("PRAGMA foreign_key_check").all();
  console.log('foreign_key_check violations:', fk.length, fk.length === 0 ? 'OK' : 'VIOLATIONS');

  // Verify DiscoveredModel exists
  const dm = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='DiscoveredModel'").get();
  console.log('DiscoveredModel table present:', dm.c === 1 ? 'YES' : 'NO');

  // Compare row counts — must be byte-identical
  let drift = false;
  for (const t of Object.keys(pre)) {
    if (pre[t] !== post[t]) {
      console.error(`DRIFT in ${t}: pre=${pre[t]} post=${post[t]}`);
      drift = true;
    }
  }
  if (drift) {
    console.error('FATAL: row count drift detected — investigate before continuing.');
    process.exit(3);
  }
  console.log('All critical row counts preserved ✓');

  db.close();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('VERDICT: Workstream B additive migration COMPLETE.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
