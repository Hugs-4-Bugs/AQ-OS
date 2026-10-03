#!/usr/bin/env node
/**
 * RECOVERY RESTORE — rebuild the pre-Feedback-task workspace (Oct 2 2026, <=17:31 UTC)
 * from the /tmp/my-project backup (workspace mirror captured ~17:48 Oct 2).
 *
 * SAFETY RULES (hard-coded):
 *  - NEVER touches: db/, .env, node_modules, .git, tool-results, dev.log, server.pid
 *  - NEVER deletes anything (forward-only additive restore)
 *  - Feedback-era files (mtime >= 2026-10-02T17:32Z) are EXCLUDED (user STOP marker),
 *    except worklog.md (complete record; restored whole, disclosed in report).
 *  - Restore decision is CONTENT-based vs git HEAD for tracked files (backup copies
 *    may carry stale mtimes); mtime-based only for untracked files.
 *
 * Usage: node scripts/restore-from-tmp-backup.mjs plan|apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const MODE = process.argv[2] || 'plan';
if (!['plan', 'apply'].includes(MODE)) { console.error('usage: plan|apply'); process.exit(1); }

const SRC = '/tmp/my-project';
const DEST = '/home/z/my-project';
const FEEDBACK_CUTOFF = Date.UTC(2026, 9, 2, 17, 32, 0); // 2026-10-02T17:32:00Z
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.next', 'db', 'tool-results', '.turbo']);
const EXCLUDE_FILES = new Set(['.env', '.pending_clone.json', '.initial_snapshot.json', 'dev.log', 'server.pid']);
const ALWAYS_INCLUDE_AFTER_CUTOFF = new Set(['worklog.md']);

const sha256 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// tracked files in git
const tracked = new Set(execSync('git ls-files', { cwd: DEST, encoding: 'utf8' }).trim().split('\n'));
// HEAD blob hashes for tracked paths (lazy)
const headHashCache = new Map();
function headBlobSha(rel) {
  if (!headHashCache.has(rel)) {
    try {
      headHashCache.set(rel, execSync(`git rev-parse "HEAD:${rel}"`, { cwd: DEST, encoding: 'utf8' }).trim());
    } catch { headHashCache.set(rel, null); }
  }
  return headHashCache.get(rel);
}
// git blob sha of a working file = git hash-object
function blobShaOf(p) {
  try { return execSync(`git hash-object "${p}"`, { cwd: DEST, encoding: 'utf8' }).trim(); }
  catch { return null; }
}

const plan = { restore_new: [], restore_modified: [], skip_same: [], skip_current_newer: [], excluded_feedback_era: [], tracked_missing_from_backup: [] };

function walk(dir, relBase = '') {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    let st;
    try { st = fs.lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name) && relBase === '') continue;
      if (EXCLUDE_DIRS.has(e.name)) continue; // nested excluded dirs too (e.g. any node_modules)
      walk(full, rel);
      continue;
    }
    if (!e.isFile()) continue;
    if (relBase === '' && EXCLUDE_FILES.has(e.name)) continue;

    // feedback-era exclusion
    if (st.mtimeMs >= FEEDBACK_CUTOFF && !ALWAYS_INCLUDE_AFTER_CUTOFF.has(rel)) {
      plan.excluded_feedback_era.push({ rel, mtime: st.mtime.toISOString(), size: st.size });
      continue;
    }

    const destPath = path.join(DEST, rel);
    const destExists = fs.existsSync(destPath);

    if (!destExists) {
      plan.restore_new.push({ rel, mtime: st.mtime.toISOString(), size: st.size });
      continue;
    }
    const destSt = fs.lstatSync(destPath);
    if (destSt.isDirectory()) { console.error('DEST IS DIR (skip):', rel); continue; }

    // content compare
    let same = false;
    try { same = sha256(full) === sha256(destPath); } catch { same = false; }
    if (same) { plan.skip_same.push(rel); continue; }

    if (tracked.has(rel)) {
      // tracked: restore if backup differs from HEAD (i.e., carries lost work)
      const destBlob = blobShaOf(destPath);
      const headBlob = headBlobSha(rel);
      if (headBlob !== null && destBlob === headBlob) {
        plan.restore_modified.push({ rel, mtime: st.mtime.toISOString(), size: st.size });
      } else {
        // dest already differs from HEAD (unexpected on clean tree) — restore backup anyway but flag
        plan.restore_modified.push({ rel, mtime: st.mtime.toISOString(), size: st.size, flag: 'dest-differs-from-HEAD' });
      }
    } else {
      if (st.mtimeMs > destSt.mtimeMs) {
        plan.restore_modified.push({ rel, mtime: st.mtime.toISOString(), size: st.size });
      } else {
        plan.skip_current_newer.push({ rel, backup: st.mtime.toISOString(), current: destSt.mtime.toISOString() });
      }
    }
  }
}

walk(SRC);

// deletion candidates: tracked in git but absent from backup
for (const rel of tracked) {
  if (!fs.existsSync(path.join(SRC, rel))) plan.tracked_missing_from_backup.push(rel);
}

const count = (a) => a.length;
console.log(`MODE=${MODE}`);
console.log(`restore_new            : ${count(plan.restore_new)}`);
console.log(`restore_modified       : ${count(plan.restore_modified)}`);
console.log(`skip_same              : ${count(plan.skip_same)}`);
console.log(`skip_current_newer     : ${count(plan.skip_current_newer)}`);
console.log(`excluded_feedback_era  : ${count(plan.excluded_feedback_era)}`);
console.log(`tracked_missing_backup : ${count(plan.tracked_missing_from_backup)}`);

const printList = (title, arr) => {
  console.log(`\n--- ${title} ---`);
  for (const it of arr) {
    if (typeof it === 'string') console.log(' ', it);
    else console.log(' ', (it.flag ? `[${it.flag}] ` : '') + it.rel, '|', it.mtime || '', it.size != null ? `(${it.size}B)` : '', it.current ? `cur:${it.current}` : '');
  }
};
printList('RESTORE NEW (lost-era new files)', plan.restore_new);
printList('RESTORE MODIFIED (lost-era changes)', plan.restore_modified);
printList('EXCLUDED FEEDBACK ERA (stay in /tmp/my-project)', plan.excluded_feedback_era);
printList('SKIP (current newer — boot/today artifacts)', plan.skip_current_newer);
printList('TRACKED FILES MISSING FROM BACKUP (deletion candidates — NOT deleted)', plan.tracked_missing_from_backup);

if (MODE === 'apply') {
  const manifest = { startedAt: new Date().toISOString(), restored: [], excluded_feedback_era: plan.excluded_feedback_era };
  const doCopy = (rel) => {
    const s = path.join(SRC, rel);
    const d = path.join(DEST, rel);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(s, d);
    // preserve backup mtime for auditability
    const st = fs.lstatSync(s);
    fs.utimesSync(d, st.atime, st.mtime);
    manifest.restored.push({ rel, bytes: st.size, mtime: st.mtime.toISOString() });
  };
  for (const it of plan.restore_new) doCopy(it.rel);
  for (const it of plan.restore_modified) doCopy(it.rel);
  const outDir = path.join(DEST, 'tool-results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'restore-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nAPPLIED: ${manifest.restored.length} files restored. Manifest: tool-results/restore-manifest.json`);
}
