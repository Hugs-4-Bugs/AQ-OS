#!/usr/bin/env node
/**
 * READ-ONLY forensic sweep: find every file modified after 2026-10-01 20:00 UTC
 * (i.e., during or after the lost work window) in locations that could have
 * survived the Oct 3 01:19 platform restore.
 * Never writes to the workspace outside tool-results/.
 */
import fs from 'node:fs';
import path from 'node:path';

const CUTOFF = new Date('2026-10-01T20:00:00Z').getTime();

const TARGETS = [
  '/tmp',                       // survives? we will see what's left
  '/home/z/.cache',
  '/home/z/.bun/install/cache',
  '/home/z/.local',
  '/home/z/.npm',
  '/home/z/.config',
];
const WORKSPACE = '/home/z/my-project';
const SKIP = new Set(['node_modules', '.git', '.next', '.turbo', '.cache']);

const results = [];

function walk(dir, depth, maxDepth) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === '.git' && dir === WORKSPACE) continue; // handled separately
    const full = path.join(dir, e.name);
    let st;
    try { st = fs.lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (SKIP.has(e.name) && depth >= 0) {
        // still record the dir itself if fresh
        if (st.mtimeMs >= CUTOFF) results.push({ p: full + '/', m: st.mtime.toISOString(), s: 'DIR', k: 'workspace-skipdir' });
        continue;
      }
      walk(full, depth + 1, maxDepth);
    } else if (st.isFile()) {
      if (st.mtimeMs >= CUTOFF) {
        results.push({ p: full, m: st.mtime.toISOString(), s: st.size, k: dir.startsWith('/tmp') ? 'tmp' : (dir.startsWith(WORKSPACE) ? 'workspace' : 'home') });
      }
    }
  }
}

// 1) workspace, excluding heavy dirs but INCLUDING db/, scripts/, tests/, src/, prisma/
walk(WORKSPACE, 0, 12);
// 2) other targets with depth caps
for (const t of TARGETS) walk(t, 0, t === '/tmp' ? 4 : 6);

results.sort((a, b) => a.m.localeCompare(b.m));
for (const r of results) console.log(`${r.m} | ${String(r.s).padStart(10)} | ${r.p}`);

console.log(`\nTOTAL fresh files: ${results.length}`);
// summary by top-level bucket
const buckets = {};
for (const r of results) {
  const rel = r.p.startsWith(WORKSPACE) ? 'WORKSPACE:' + r.p.slice(WORKSPACE.length + 1).split('/')[0]
    : r.p.split('/').slice(0, 3).join('/');
  buckets[rel] = (buckets[rel] || 0) + 1;
}
console.log('\nBy bucket:');
for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`);
