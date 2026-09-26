#!/usr/bin/env node
/**
 * env-audit-scan.mjs — AcquisitionOS credential audit (v4: category-precise)
 * Categories:
 *   app      = src/**, backend/**(py), root runtime js/ts, mini-services/**, prisma/seed → "actually used by application"
 *   dev      = scripts/**, tests/**, root *.sh → dev/test tooling
 *   deploy   = deploy/**, infra/**, monitoring/**, docker-compose*, Dockerfile*, nginx*, Caddyfile, vercel.json, Makefile
 * A = defined & used by app | A-dev = defined & only dev/deploy refs | B = defined but nowhere referenced | C = referenced but missing
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const ROOT = '/home/z/my-project';
const OUT = `${ROOT}/scripts/env-audit-result.json`;

function rg(args) {
  try {
    return execFileSync('rg', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  } catch (e) {
    if (e.status === 1) return '';
    throw e;
  }
}
const addAll = (set, text) => { for (const m of text.split('\n')) { const t = m.trim(); if (t) set.add(t); } };

// ── app JS/TS refs ───────────────────────────────────────────────────
const appJs = new Set();
const jsGlobs = ['-g', '*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'];
for (const pat of [
  ['process\\.env\\.([A-Z_][A-Z0-9_]*)', '$1'],
  ['process\\.env\\[["\']([A-Z_][A-Z0-9_]*)["\']\\]', '$1'],
  ['import\\.meta\\.env\\.([A-Z_][A-Z0-9_]*)', '$1'],
]) {
  addAll(appJs, rg(['-o', '--no-filename', '-r', pat[1], ...jsGlobs, pat[0], 'src', 'mini-services', 'prisma']));
  addAll(appJs, rg(['--max-depth', '1', '-o', '--no-filename', '-r', pat[1], ...jsGlobs, pat[0], '.']));
}

// ── app Python refs (backend) ────────────────────────────────────────
const appPy = new Set();
for (const pat of [
  ['os\\.environ\\.get\\(\\s*["\']([A-Z_][A-Z0-9_]*)["\']', '$1'],
  ['os\\.environ\\[\\s*["\']([A-Z_][A-Z0-9_]*)["\']\\]', '$1'],
  ['os\\.getenv\\(\\s*["\']([A-Z_][A-Z0-9_]*)["\']', '$1'],
]) {
  addAll(appPy, rg(['-o', '--no-filename', '-r', pat[1], '-g', '*.py', pat[0], 'backend']));
}
// backend config.py uses pydantic Settings with UPPERCASE names — capture field names
addAll(appPy, rg(['-o', '--no-filename', '-r', '$1', '-g', '*.py', '^\\s*([A-Z][A-Z0-9_]{3,})\\s*:', 'backend']));

// ── dev script refs (informational) ──────────────────────────────────
const devRefs = new Set();
const devGlobs = ['-g', '*.{sh,ts,tsx,js,jsx,mjs,mts,py}', '-g', '!env-audit-*', '-g', '!pentest/evidence/**'];
for (const pat of [
  ['process\\.env\\.([A-Z_][A-Z0-9_]*)', '$1'],
  ['os\\.environ\\.get\\(\\s*["\']([A-Z_][A-Z0-9_]*)["\']', '$1'],
  ['os\\.getenv\\(\\s*["\']([A-Z_][A-Z0-9_]*)["\']', '$1'],
  ['\\$\\{?([A-Z_][A-Z0-9_]{3,})\\}?', '$1'],
  ['^(?:export\\s+)?([A-Z][A-Z0-9_]{3,})=', '$1'],
]) {
  addAll(devRefs, rg(['-o', '--no-filename', '-r', pat[1], ...devGlobs, pat[0], 'scripts', 'tests']));
  addAll(devRefs, rg(['--max-depth', '1', '-o', '--no-filename', '-r', pat[1], ...devGlobs, pat[0], '.']));
}

// ── deploy config refs (informational) ───────────────────────────────
const deployRefs = new Set();
const depGlobs = ['-g', '*.{yml,yaml,service,tf,conf,env}', '-g', 'Dockerfile*', '-g', 'Caddyfile', '-g', 'Makefile', '-g', '*.json'];
for (const pat of [
  ['\\$\\{?([A-Z_][A-Z0-9_]{3,})\\}?', '$1'],
  ['^\\s*-?\\s*([A-Z][A-Z0-9_]{3,})[=:]', '$1'],
  ['([A-Z][A-Z0-9_]{3,})', '$1'],
]) {
  addAll(deployRefs, rg(['-o', '--no-filename', '-r', pat[1], ...depGlobs, pat[0], 'deploy', 'infra', 'monitoring']));
}
addAll(deployRefs, rg(['--max-depth', '1', '-o', '--no-filename', '-r', '$1', ...depGlobs, '\\$\\{?([A-Z_][A-Z0-9_]{3,})\\}?', '.']));
addAll(deployRefs, rg(['--max-depth', '1', '-o', '--no-filename', '-r', '$1', '-g', '*.yml', '-g', '*.json', '^\\s*-?\\s*([A-Z][A-Z0-9_]{3,})[=:]', '.']));

// ── definitions in .env files ────────────────────────────────────────
const defns = new Map();
for (const f of ['.env', '.env.local', '.env.backup', '.env.example', '.env.development', '.env.production', '.env.test']) {
  const p = `${ROOT}/${f}`;
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const name = m[1];
    if (!defns.has(name)) defns.set(name, { files: new Set([f]) });
    else defns.get(name).files.add(f);
  }
}

// ── classify ─────────────────────────────────────────────────────────
const appRefs = new Set([...appJs, ...appPy]);
const usedByApp = [], devOnly = [], unused = [], missing = [];
for (const [name, meta] of defns) {
  const inRealEnv = [...meta.files].some(f => f !== '.env.example');
  if (appRefs.has(name)) usedByApp.push({ name, files: [...meta.files].sort(), inRealEnv });
  else if (devRefs.has(name) || deployRefs.has(name)) devOnly.push({ name, files: [...meta.files].sort(), inRealEnv, refSource: devRefs.has(name) ? 'dev-scripts' : 'deploy-configs' });
  else unused.push({ name, files: [...meta.files].sort(), inRealEnv });
}
for (const name of appRefs) if (!defns.has(name)) missing.push({ name, category: 'app' });

usedByApp.sort((a, b) => a.name.localeCompare(b.name));
devOnly.sort((a, b) => a.name.localeCompare(b.name));
unused.sort((a, b) => a.name.localeCompare(b.name));
missing.sort((a, b) => a.name.localeCompare(b.name));

const result = {
  summary: {
    totalDefined: defns.size,
    appJsRefs: appJs.size, appPyRefs: appPy.size, appRefs: appRefs.size,
    devRefs: devRefs.size, deployRefs: deployRefs.size,
    usedByApp: usedByApp.length, devOnly: devOnly.length, unused: unused.length, missingFromEnv: missing.length,
  },
  usedByApp, devOnly, unused, missing,
  appRefNames: [...appRefs].sort(),
};
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary));
console.log('\nUSED-BY-APP:', usedByApp.map(u => u.name).join(', '));
console.log('\nDEV/DEPLOY-ONLY:', devOnly.map(u => u.name).join(', '));
console.log('\nUNUSED:', unused.map(u => u.name).join(', '));
console.log('\nMISSING(app refs not in env):', missing.map(u => u.name).join(', '));
