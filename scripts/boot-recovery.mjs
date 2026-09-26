#!/usr/bin/env node
// boot-recovery.mjs — ONE idempotent boot-time recovery gate for the server.
//
// WHY THIS EXISTS (root-cause report, Sep 2026):
//   Workspace restores repeatedly delete .env, db/ and db-backups/ and the
//   platform supervisor restarts the server WITHOUT running ensure-env.sh.
//   The server then boots with DATABASE_URL only → Google dev-consent page,
//   OTP 500s, magic-link 429s, sessions invalidated, subscription "Free".
//
// WHAT IT DOES (reuses the EXISTING recovery tools — no second system):
//   1. Credentials: if GOOGLE_CLIENT_ID is missing from .env, runs the
//      existing scripts/recover-credentials.mjs (git-history merge, masked
//      output) and then the non-sensitive defaults from ensure-env.sh.
//   2. Database: if db/custom.db is missing or empty, restores it from the
//      newest db-backups/custom-*.db snapshot, else from the validated git
//      blob (60f8e3b, commit efbc216). GUARDED: never touches a healthy
//      live DB; never overwrites a non-empty live file; never resets.
//   3. tmp artifact: deletes a 0-byte /tmp/custom.db (broken artifact of a
//      failed boot) so src/lib/db.ts never "reuses" an empty file.
//
// GUARANTEES:
//   - Idempotent: safe to run on every boot, any number of times.
//   - Fast no-op path when everything is present (< ~100ms).
//   - NEVER prints secret values. NEVER exits non-zero for recoverable
//     states (the server must still boot so /api/health can report).
//   - NEVER creates an empty database (that would silently "wipe" users).
//     If no recovery source exists it logs CRITICAL and lets the app boot
//     so operators see the failure via /api/health.

import { execFileSync, spawnSync } from 'child_process';
import { existsSync, statSync, readFileSync, readdirSync, copyFileSync, renameSync, unlinkSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = '/home/z/my-project';
const ENV_FILE = join(ROOT, '.env');
const DB_DIR = join(ROOT, 'db');
const DB_FILE = join(DB_DIR, 'custom.db');
const BACKUP_DIR = join(ROOT, 'db-backups');
const TMP_DB = '/tmp/custom.db';
// Validated git blob containing the last known-good live database
// (34 users / 89 leads / 32 subscriptions — verified 2026-09-23, see
// DATABASE-DR-RUNBOOK.md and worklog auth-oauth-otp-2).
const DB_GIT_BLOB = '60f8e3b';

let loggedBanner = false;
function banner() {
  if (!loggedBanner) {
    console.log('[boot-recovery] ══ AcquisitionOS boot-time recovery gate ══');
    loggedBanner = true;
  }
}

function isSQLiteFile(path) {
  try {
    if (!existsSync(path) || statSync(path).size < 4096) return false;
    const fd = readFileSync(path);
    return fd.subarray(0, 16).toString('utf8').startsWith('SQLite format 3');
  } catch {
    return false;
  }
}

// ── Step 1: credentials ────────────────────────────────────────────
function ensureCredentials() {
  // ACCOUNT-CONSISTENCY FIX (2026-09-24): recovery used to trigger ONLY on
  // a missing GOOGLE_CLIENT_ID. A partial .env wipe that kept the Google
  // keys but lost the SMTP credentials left the runtime permanently
  // "emailConfigured:false" — OTP and Magic Link would 503 forever while
  // Google kept working, i.e. exactly the per-method inconsistency this
  // gate exists to prevent. Now ANY missing auth-credential group triggers
  // the SAME existing recovery path (recover-credentials.mjs merges only
  // missing keys from git history; ensure-env.sh is idempotent and
  // preserves every value already present).
  let envHasGoogleId = false;
  let envHasEmail = false;
  try {
    if (existsSync(ENV_FILE)) {
      const env = readFileSync(ENV_FILE, 'utf8');
      envHasGoogleId = /^GOOGLE_CLIENT_ID=.+/m.test(env);
      const smtpUser = /^SMTP_USER=.+/m.test(env);
      const smtpSecret = /^(SMTP_PASSWORD|SMTP_PASS|GMAIL_APP_PASSWORD)=.+/m.test(env);
      const resendKey = /^RESEND_API_KEY=.+/m.test(env);
      envHasEmail = (smtpUser && smtpSecret) || resendKey;
    }
  } catch {
    envHasGoogleId = false;
    envHasEmail = false;
  }
  if (envHasGoogleId && envHasEmail) return;

  banner();
  if (!existsSync(ENV_FILE)) {
    try { writeMinEnv(); } catch (e) {
      console.error('[boot-recovery] CRITICAL: .env missing and could not be created:', e.message);
    }
  }
  console.log('[boot-recovery] GOOGLE_CLIENT_ID missing from .env — running scripts/recover-credentials.mjs (restores real credentials from git history)');
  const r = spawnSync('node', [join(ROOT, 'scripts', 'recover-credentials.mjs')], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('[boot-recovery] WARN: credential recovery failed — operator must configure real credentials manually (server will fail closed for Google/SMTP).');
  }
  // Also apply the NON-SENSITIVE defaults (SMTP host/port, feature flags,
  // generated JWT secrets) exactly as ensure-env.sh does.
  try {
    spawnSync('bash', [join(ROOT, 'ensure-env.sh')], { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.error('[boot-recovery] WARN: ensure-env.sh failed (non-fatal):', e.message);
  }
}

function writeMinEnv() {
  if (!existsSync(ENV_FILE)) {
    writeFileSync(ENV_FILE, 'DATABASE_URL=file:/home/z/my-project/db/custom.db\n', { mode: 0o600 });
  }
}

// ── Step 2: database ───────────────────────────────────────────────
const PROCESS_START_MS = Date.now();

/** Open a SQLite file read-only and return {tables, users} via node:sqlite. */
function probeSqlite(path) {
  try {
    const d = new DatabaseSync(path, { readOnly: true });
    const tables = d.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'").get().c;
    let users = 0;
    try { users = d.prepare('SELECT COUNT(*) AS c FROM "User"').get().c; } catch { users = -1; }
    d.close();
    return { tables, users };
  } catch {
    return null;
  }
}

function ensureDatabase() {
  // Make sure the db/ directory itself exists — its absence is what made
  // src/lib/db.ts redirect the app to an empty /tmp/custom.db (P2021 500s).
  try {
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
      banner();
      console.log('[boot-recovery] Recreated missing db/ directory');
    }
  } catch (e) {
    console.error('[boot-recovery] CRITICAL: cannot create db/ directory:', e.message);
    return;
  }

  if (isSQLiteFile(DB_FILE)) {
    const live = probeSqlite(DB_FILE);
    if (live && live.tables >= 100 && live.users >= 1) {
      return; // Healthy live DB — DO NOT TOUCH (never overwrite healthy data).
    }
    console.error('[boot-recovery] WARN: live DB opens but looks degraded (tables=' + (live?.tables ?? '?') + ' users=' + (live?.users ?? '?') + ') — leaving it untouched, operator decides (never auto-overwrite a live file).');
    return;
  }

  banner();
  if (existsSync(DB_FILE)) {
    console.error('[boot-recovery] CRITICAL: db/custom.db exists but is NOT a valid SQLite file (' + statSync(DB_FILE).size + ' bytes) — NOT overwriting. Recovery required by operator.');
    return;
  }
  console.error('[boot-recovery] CRITICAL: live database db/custom.db is MISSING (workspace restore?) — attempting guarded recovery');

  // Take a safety snapshot of ANY prior live state first (here: nothing
  // healthy to snapshot, but keep the ritual explicit). NOTE: snapshots
  // created by THIS call are excluded as recovery sources below (circular).
  try {
    spawnSync('node', [join(ROOT, 'scripts', 'db-safety.mjs'), 'auto'], { cwd: ROOT, stdio: 'ignore' });
  } catch { /* non-fatal */ }

  // ── Collect + validate candidate sources ────────────────────────
  // A source is valid if it is a real SQLite file with the full schema
  // (>=100 tables) and a User table. Among valid candidates we pick the
  // one preserving the MOST users (tie → newest) — this rejects broken
  // post-restore artifacts (e.g. a 1-user schema-only file) in favour of
  // the validated known-good backup/blob.
  const candidates = [];
  try {
    if (existsSync(BACKUP_DIR)) {
      for (const f of readdirSync(BACKUP_DIR)) {
        if (!/^custom-.*\.db$/.test(f)) continue;
        const full = join(BACKUP_DIR, f);
        if (!isSQLiteFile(full)) continue;
        let mtimeMs = 0;
        try { mtimeMs = statSync(full).mtimeMs; } catch { /* keep 0 */ }
        // EXCLUDE anything created during THIS run (circular snapshot of
        // the just-failed state would otherwise shadow the real backup).
        if (mtimeMs >= PROCESS_START_MS - 2000) continue;
        candidates.push({ path: full, kind: `snapshot:${f}` });
      }
    }
  } catch { /* fall through */ }
  candidates.push({ path: `git-blob:${DB_GIT_BLOB}`, kind: `git-blob:${DB_GIT_BLOB}` });

  let best = null; // { path, kind, users, needsExtract }
  for (const c of candidates) {
    try {
      let probePath = c.path;
      let needsExtract = false;
      if (c.path.startsWith('git-blob:')) {
        const blob = c.path.slice('git-blob:'.length);
        const size = parseInt(execFileSync('git', ['cat-file', '-s', blob], { cwd: ROOT, encoding: 'utf8' }).trim(), 10);
        if (!Number.isFinite(size) || size < 4096) continue;
        try { mkdirSync(BACKUP_DIR, { recursive: true }); } catch { /* ignore */ }
        probePath = join(BACKUP_DIR, `boot-candidate-${blob}.db`);
        // Capture stdout as a Buffer and write it ourselves — stdio entries
        // accept streams/fds, NOT file paths.
        const blobData = execFileSync('git', ['show', blob], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
        writeFileSync(probePath, blobData);
        needsExtract = true;
      }
      const probe = isSQLiteFile(probePath) ? probeSqlite(probePath) : null;
      const valid = probe && probe.tables >= 100 && probe.users >= 1;
      if (valid && (!best || probe.users > best.users)) {
        best = { path: probePath, kind: c.kind, users: probe.users, needsExtract };
      } else if (needsExtract) {
        try { unlinkSync(probePath); } catch { /* ignore */ }
      }
      // Valid but not best, extracted from git → clean up the temp copy
      if (valid && needsExtract && best && best.path !== probePath) {
        try { unlinkSync(probePath); } catch { /* ignore */ }
      }
    } catch (e) {
      console.error(`[boot-recovery] candidate ${c.kind} unusable: ${e.message}`);
    }
  }

  if (!best) {
    console.error('[boot-recovery] CRITICAL: no valid recovery source (no db-backups snapshot with schema+users, git blob unavailable).');
    console.error('[boot-recovery] CRITICAL: NOT creating an empty database (that would silently wipe users).');
    console.error('[boot-recovery] CRITICAL: operator action — see DATABASE-DR-RUNBOOK.md section 1.');
    return;
  }

  // Guarded restore: only possible when live DB was missing (checked above).
  try {
    if (best.needsExtract) {
      // best.path is an extracted candidate file in db-backups — move it in.
      if (existsSync(DB_FILE)) {
        try { chmodSync(DB_FILE, 0o644); } catch { /* ignore */ }
        try { unlinkSync(DB_FILE); } catch { /* ignore */ }
      }
      renameWithRetry(best.path, DB_FILE);
    } else {
      copyWithRetry(best.path, DB_FILE);
    }
    const after = isSQLiteFile(DB_FILE) ? probeSqlite(DB_FILE) : null;
    if (after && after.tables >= 100) {
      console.error(`[boot-recovery] Database recovered from ${best.kind} → db/custom.db (${statSync(DB_FILE).size} bytes, ${after.users} users). Existing users preserved.`);
      try { chmodSync(DB_FILE, 0o644); } catch { /* ignore */ }
    } else {
      console.error('[boot-recovery] CRITICAL: recovered file failed SQLite validation — removing and leaving DB absent.');
      try { unlinkSync(DB_FILE); } catch { /* ignore */ }
    }
  } catch (e) {
    console.error('[boot-recovery] CRITICAL: restore failed:', e.message);
  }
}

/** Workspace restores can leave files read-only — chmod + retry. */
function copyWithRetry(src, dest) {
  try { copyFileSync(src, dest); } catch (e) {
    if (e.code === 'EACCES') { chmodSync(dest, 0o644); copyFileSync(src, dest); } else { throw e; }
  }
}
function renameWithRetry(src, dest) {
  try { renameSync(src, dest); } catch (e) {
    if (e.code === 'EACCES') { chmodSync(dest, 0o644); renameSync(src, dest); } else { throw e; }
  }
}

// ── Step 3: broken /tmp artifact ───────────────────────────────────
function cleanTmpArtifact() {
  try {
    if (existsSync(TMP_DB) && statSync(TMP_DB).size === 0) {
      unlinkSync(TMP_DB);
      banner();
      console.log('[boot-recovery] Removed broken 0-byte /tmp/custom.db artifact (prevents empty-DB reuse)');
    }
  } catch { /* non-fatal */ }
}

// ── Runner ─────────────────────────────────────────────────────────
export function runBootRecovery() {
  const t0 = Date.now();
  try { ensureCredentials(); } catch (e) { console.error('[boot-recovery] credential step error (non-fatal):', e.message); }
  try { ensureDatabase(); } catch (e) { console.error('[boot-recovery] database step error (non-fatal):', e.message); }
  try { cleanTmpArtifact(); } catch { /* non-fatal */ }
  if (loggedBanner) {
    console.log(`[boot-recovery] Done in ${Date.now() - t0}ms`);
  }
}

// Executed directly → run. Imported → caller decides (start.js preflight).
const isDirectRun = process.argv[1] && (process.argv[1].endsWith('boot-recovery.mjs'));
if (isDirectRun) {
  runBootRecovery();
  process.exit(0);
}
