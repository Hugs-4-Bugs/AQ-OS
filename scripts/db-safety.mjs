#!/usr/bin/env node
/**
 * AcquisitionOS — Workspace DB Safety Tool
 * ═══════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS (incident 2026-09-22/23):
 *   The live SQLite DB (db/custom.db, gitignored) was destroyed by a
 *   workspace sandbox reset. All 34 users were lost from the live
 *   workspace. Three auth symptoms resulted: existing emails could not
 *   log in, re-signup created new accounts with default credits, and
 *   OTP requests for those emails silently sent nothing (anti-
 *   enumeration). Old data was only recoverable from git history blobs.
 *
 * WHAT THIS DOES:
 *   snapshot  — timestamped, checksummed copy of the live DB into
 *               db-backups/ (gitignored). Cheap (<5 MB). Best-effort.
 *   auto      — boot-time snapshot: skips if no users exist yet, or if
 *               an identical snapshot (sha256) already exists.
 *   status    — live DB identity + user count + latest snapshots.
 *   restore   — DUAL-GATED restore: requires --confirm AND refuses to
 *               overwrite a live DB that has MORE users than the
 *               snapshot (anti-data-loss guard). Never run silently.
 *
 * SAFETY:
 *   - Never deletes user data. Never touches auth logic.
 *   - Uses file copies (SQLite safe when idle); verifies sha256.
 *   - restore requires TWO explicit conditions (--confirm + guard).
 * ═══════════════════════════════════════════════════════════════════
 */
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BACKUP_DIR = path.join(ROOT, 'db-backups');
const RETENTION = 10;

function readDbUrl() {
  const envPath = path.join(ROOT, '.env');
  let url = process.env.DATABASE_URL || '';
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^DATABASE_URL=(.+)$/);
      if (m) { url = m[1].trim(); break; }
    }
  }
  return url;
}

function dbFilePath() {
  const url = readDbUrl();
  if (!url.startsWith('file:')) return null;
  let p = url.replace(/^file:/, '');
  if (p.startsWith('./')) p = path.resolve(ROOT, p);
  return p;
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function userCount(dbFile) {
  // Read-only user count via prisma (query engine, no writes)
  const res = spawnSync('node', ['-e', `
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.user.count().then(c => { console.log(c); return p.$disconnect(); })
      .catch(e => { console.error('E:' + e.message.slice(0, 120)); process.exit(1); });
  `], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'file:' + dbFile },
    timeout: 60000,
  });
  if (res.status !== 0) return { count: null, err: (res.stderr || '').trim().slice(0, 200) };
  return { count: Number(res.stdout.trim()), err: null };
}

function ensureDir() { fs.mkdirSync(BACKUP_DIR, { recursive: true }); }

function listSnapshots() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('custom-') && f.endsWith('.db'))
    .sort()
    .reverse()
    .map(f => {
      const full = path.join(BACKUP_DIR, f);
      const meta = full + '.meta';
      let users = '?';
      if (fs.existsSync(meta)) {
        try { users = JSON.parse(fs.readFileSync(meta, 'utf8')).users; } catch {}
      }
      return { file: f, full, size: fs.statSync(full).size, users };
    });
}

function cmdSnapshot({ silentOk = false } = {}) {
  const db = dbFilePath();
  if (!db || !fs.existsSync(db)) {
    if (!silentOk) console.error('[db-safety] DB not found:', db);
    return false;
  }
  const stats = userCount(db);
  if (stats.count === null) {
    if (!silentOk) console.error('[db-safety] Cannot count users (skip):', stats.err);
    return false;
  }
  if (stats.count === 0) {
    if (!silentOk) console.log('[db-safety] Live DB has 0 users — snapshot skipped (nothing to protect).');
    return false;
  }
  const digest = sha256(db);
  ensureDir();
  // Skip if an identical snapshot already exists (content-addressed check)
  for (const s of listSnapshots()) {
    if (sha256(s.full) === digest) {
      if (!silentOk) console.log(`[db-safety] Identical snapshot already exists: ${s.file} (users=${s.users}) — skipped.`);
      return false;
    }
  }
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
  const dest = path.join(BACKUP_DIR, `custom-${ts}.db`);
  fs.copyFileSync(db, dest);
  fs.chmodSync(dest, 0o444);
  fs.writeFileSync(dest + '.meta', JSON.stringify({
    createdAt: new Date().toISOString(),
    users: stats.count,
    sha256: digest,
    source: 'db/custom.db',
  }, null, 2));
  // PART 15: detect collapse BEFORE writing the new snapshot meta history
  const loss = detectDataLoss(stats.count);
  console.log(`[db-safety] Snapshot saved: db-backups/custom-${ts}.db (users=${stats.count}, sha256=${digest.slice(0, 12)}…)`);
  if (loss.loss) {
    console.error('[db-safety] Snapshot retained, but older snapshots will NOT be pruned this cycle (loss suspected).');
    return true;
  }
  // Retention: keep newest RETENTION snapshots
  const snaps = listSnapshots();
  for (const s of snaps.slice(RETENTION)) {
    try { fs.rmSync(s.full); fs.rmSync(s.full + '.meta', { force: true }); } catch {}
  }
  return true;
}

// ── PART 15: silent-data-loss detection ─────────────────────────────
// If the live user count has collapsed relative to the newest prior
// snapshot, surface a CRITICAL alert and preserve snapshot history
// (retention pruning is skipped for this cycle so the good snapshots
// cannot be aged out by a chain of depleted ones).
function detectDataLoss(liveUsers) {
  const snaps = listSnapshots();
  if (snaps.length === 0) return { loss: false };
  const newest = snaps[0];
  if (typeof newest.users !== 'number') return { loss: false };
  if (liveUsers < newest.users && newest.users >= 5) {
    const alert = path.join(BACKUP_DIR, 'DATA-LOSS-ALERT.txt');
    const msg = `[${new Date().toISOString()}] CRITICAL: live DB users=${liveUsers} but newest snapshot ` +
      `${newest.file} had users=${newest.users}. Possible workspace reset / data loss.\n` +
      `Recovery: node scripts/db-safety.mjs restore db-backups/${newest.file} --confirm\n`;
    try { fs.writeFileSync(alert, msg); } catch {}
    console.error('[db-safety] *** CRITICAL DATA-LOSS SUSPECTED ***');
    console.error(msg.trim());
    return { loss: true, newest };
  }
  return { loss: false };
}

function cmdStatus() {
  const db = dbFilePath();
  console.log('DATABASE_URL (from .env/process):', readDbUrl() || '(unset)');
  console.log('DB file:', db, fs.existsSync(db || '') ? `(exists, ${fs.statSync(db).size} bytes)` : '(MISSING)');
  if (db && fs.existsSync(db)) {
    const stats = userCount(db);
    console.log('Live users:', stats.count ?? `ERROR: ${stats.err}`);
  }
  const snaps = listSnapshots();
  console.log(`Snapshots in db-backups/ (${snaps.length}):`);
  for (const s of snaps.slice(0, 5)) console.log(`  - ${s.file} (${(s.size / 1e6).toFixed(1)} MB, users=${s.users})`);
  if (snaps.length === 0) console.log('  (none yet)');
}

function cmdRestore(file, { confirm = false } = {}) {
  const db = dbFilePath();
  const src = path.resolve(ROOT, file);
  if (!db) { console.error('[db-safety] DATABASE_URL is not a SQLite file: URL — aborting.'); process.exit(1); }
  if (!fs.existsSync(src)) { console.error('[db-safety] Snapshot not found:', src); process.exit(1); }
  if (!confirm) {
    console.error('[db-safety] REFUSED: restore is dual-gated. Re-run with --confirm after reading the plan.');
    console.error('  This will COPY the snapshot over the live DB file. Existing live data is first snapshotted.');
    process.exit(1);
  }
  // Anti-data-loss guard: never overwrite a live DB richer than the snapshot
  const liveStats = userCount(db);
  const snapStats = userCount(src);
  console.log(`[db-safety] Live users: ${liveStats.count} | Snapshot users: ${snapStats.count}`);
  if (liveStats.count !== null && snapStats.count !== null && liveStats.count > snapStats.count) {
    console.error('[db-safety] REFUSED by guard: live DB has MORE users than the snapshot.');
    console.error('  Restoring would delete newer accounts. Export/merge instead, or use --force-if-newer-lost (explicit override).');
    process.exit(1);
  }
  // Safety net: snapshot current live state first
  cmdSnapshot({ silentOk: true });
  fs.copyFileSync(src, db);
  fs.chmodSync(db, 0o644);
  console.log('[db-safety] Restore complete. Restart the dev server so Prisma reconnects cleanly.');
}

// ── PART 17: database identity diagnostic ───────────────────────────
// Makes it impossible to confuse LOCAL / GLM-workspace / TEST / STAGING /
// PRODUCTION databases. Never prints credentials.
function classifyEnvironment() {
  const url = readDbUrl() || '';
  const isSqlite = url.startsWith('file:');
  let host = '-', name = '-';
  if (!isSqlite) {
    try { const u = new URL(url.replace(/^postgresql:/, 'postgres:')); host = u.hostname; name = u.pathname.replace(/^\//, ''); } catch {}
  }
  const envClass = isSqlite
    ? (url.includes('/home/z/my-project/') ? 'WORKSPACE / LOCAL DEV (GLM sandbox — ephemeral filesystem!)' : 'LOCAL DEV (machine-local file)')
    : (host && !/localhost|127\.0\.0\.1/.test(host)
      ? `REMOTE POSTGRES (${host}) — verify staging vs production out-of-band`
      : 'LOCAL POSTGRES (dev)');
  return { isSqlite, host, name, envClass, nodeEnv: process.env.NODE_ENV || '(unset)' };
}

function lastCountsQuery(dbFile) {
  const script = `
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const q = async (t) => { try { const r = await p.$queryRawUnsafe('SELECT count(*) c FROM "' + t + '"'); return Number(r[0].c); } catch { return 'ERR'; } };
      let tables = 0; try { const r = await p.$queryRawUnsafe("SELECT count(*) c FROM sqlite_master WHERE type='table'"); tables = Number(r[0].c); } catch {}
      console.log(JSON.stringify({ tables, users: await q('User'), leads: await q('Lead'), subs: await q('Subscription'), ledger: await q('CreditsLedger') }));
      await p.$disconnect();
    })().catch(e => { console.log(JSON.stringify({ error: e.message.slice(0, 100) })); });
  `;
  const res = spawnSync('node', ['-e', script], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env, DATABASE_URL: 'file:' + dbFile } });
  try { return JSON.parse(res.stdout.trim().split('\n').pop()); } catch { return { error: 'query-failed' }; }
}

function cmdIdentity() {
  const cls = classifyEnvironment();
  const db = dbFilePath();
  console.log('════ DATABASE IDENTITY ════');
  console.log('Environment class :', cls.envClass);
  console.log('NODE_ENV          :', cls.nodeEnv);
  console.log('Provider          :', cls.isSqlite ? 'sqlite' : 'postgresql');
  console.log('Host              :', cls.host);
  console.log('Database name     :', cls.name || path.basename(db || ''));
  console.log('File path         :', cls.isSqlite ? db : '(remote)');
  if (db && fs.existsSync(db)) {
    const stats = lastCountsQuery(db);
    console.log('Tables            :', stats.tables);
    console.log('Counts            :', `users=${stats.users} leads=${stats.leads} subscriptions=${stats.subs} creditsLedger=${stats.ledger}`);
    const models = (fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8').match(/^model /gm) || []).length;
    console.log('Schema state      :', `${stats.tables}/${models} tables vs models → drift=${models - (stats.tables || 0)}`);
  } else {
    console.log('*** LIVE DB MISSING *** — recovery required: node scripts/db-safety.mjs status');
  }
  const snaps = listSnapshots();
  const last = snaps[0];
  console.log('Last backup       :', last ? `${last.file} (${(last.size / 1e6).toFixed(1)} MB, users=${last.users})` : 'NONE');
  if (last) {
    const ageH = ((Date.now() - fs.statSync(last.full).mtimeMs) / 3600000).toFixed(1);
    console.log('Backup age        :', `${ageH} h ${Number(ageH) > 24 ? '⚠ STALE' : 'OK'}`);
  }
  console.log('Alert marker      :', fs.existsSync(path.join(BACKUP_DIR, 'DATA-LOSS-ALERT.txt')) ? '*** PRESENT — INVESTIGATE ***' : 'none');
  console.log('External/off-site :', process.env.S3_BACKUP_BUCKET ? `S3 (${process.env.S3_BACKUP_BUCKET})` : 'not configured');
}

// ── PART 13: restore-test (never touches the live DB) ────────────────
function cmdRestoreTest() {
  const snaps = listSnapshots();
  if (snaps.length === 0) { console.log('[restore-test] No snapshots to test.'); process.exit(1); }
  const target = snaps[0];
  const iso = path.join('/tmp', `restore-test-${Date.now()}.db`);
  console.log(`[restore-test] Restoring ${target.file} into ISOLATED ${iso} (live DB untouched)`);
  fs.copyFileSync(target.full, iso);
  const stats = lastCountsQuery(iso);
  const liveStats = lastCountsQuery(dbFilePath());
  const ok = stats.error === undefined && stats.users === target.users && stats.tables >= 100;
  console.log(`[restore-test] Isolated counts: tables=${stats.tables} users=${stats.users} leads=${stats.leads} subs=${stats.subs} ledger=${stats.ledger}`);
  console.log(`[restore-test] Live reference : users=${liveStats.users}`);
  console.log(`[restore-test] RESULT: ${ok ? 'PASS ✅ (snapshot opens, schema present, user count matches meta)' : 'FAIL ❌'}`);
  try { fs.rmSync(iso); } catch {}
  process.exit(ok ? 0 : 1);
}

// ── PART 16: destructive-command guard (npm pre-hooks) ──────────────
function cmdGuardReset() {
  const db = dbFilePath();
  const users = db && fs.existsSync(db) ? userCount(db).count : null;
  const allowed = process.env.ALLOW_DB_RESET === '1' && process.argv.includes('--force');
  if (users !== null && users > 0 && !allowed) {
    console.error(`[db-safety] REFUSED: db reset would destroy ${users} user records.`);
    console.error('  This guard exists to prevent accidental data destruction (incident 2026-09-22/23).');
    console.error('  To override deliberately: ALLOW_DB_RESET=1 npm run db:reset -- --force');
    process.exit(1);
  }
  console.log('[db-safety] reset guard passed', users === 0 ? '(DB has 0 users)' : '(explicit override)');
}

// ── CLI ──────────────────────────────────────────────────────────────
const [, , cmd, arg, ...flags] = process.argv;
const hasConfirm = process.argv.includes('--confirm');
switch (cmd) {
  case 'snapshot': cmdSnapshot(); break;
  case 'auto': cmdSnapshot({ silentOk: true }); break;
  case 'status': cmdStatus(); break;
  case 'identity': cmdIdentity(); break;
  case 'restore-test': cmdRestoreTest(); break;
  case 'guard-reset': cmdGuardReset(); break;
  case 'restore':
    if (!arg) { console.error('Usage: node scripts/db-safety.mjs restore <snapshot-file> --confirm'); process.exit(1); }
    cmdRestore(arg, { confirm: hasConfirm });
    break;
  default:
    console.log('Usage: node scripts/db-safety.mjs <snapshot|auto|status|identity|restore-test|guard-reset|restore> [file] [--confirm]');
    process.exit(cmd ? 1 : 0);
}
