#!/usr/bin/env node
/**
 * PHASE 0 safety scanner — verifies the intended GitHub checkpoint tree
 * contains no live secrets.
 *
 * SAFETY: never prints secret VALUES. Only prints:
 *   - file paths
 *   - variable NAMES
 *   - match COUNTS
 * Exit code 0 = clean; 1 = issues found (listed).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/home/z/my-project';

// ---------- 1. Collect live secret values from runtime .env ----------
const envValues = []; // { name, len }
try {
  const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const name = m[1];
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (val.length >= 8 && !/^(true|false|development|production|test|localhost)$/i.test(val)) {
      envValues.push({ name, val });
    }
  }
} catch (e) {
  console.log('NOTE: runtime .env not readable (' + e.code + ')');
}
console.log('Runtime .env secret-bearing candidates loaded: ' + envValues.length + ' (names: ' + envValues.map(v => v.name).join(', ') + ')');

// ---------- 2. Build intended file list (tracked, minus exclusions) ----------
const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\n').filter(Boolean);

const EXCLUDE_PREFIXES = [
  'node_modules/',
  '.next/',
  'db-backups/',
];
const EXCLUDE_EXACT = new Set([
  'db/custom.db',
  'upload/env.example (ACQUISITION-OS Latest)', // secret-named env template — excluded per policy
]);

const intended = tracked.filter(p => {
  if (EXCLUDE_EXACT.has(p)) return false;
  for (const pre of EXCLUDE_PREFIXES) if (p.startsWith(pre)) return false;
  return true;
});
console.log('Intended checkpoint files (tracked minus exclusions): ' + intended.length);
console.log('Excluded tracked files: ' + (tracked.length - intended.length));

// ---------- 3. High-confidence secret-format patterns ----------
const FORMAT_PATTERNS = [
  { label: 'GOOGLE_CLIENT_SECRET_FORMAT (GOCSPX-)', re: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { label: 'AWS_ACCESS_KEY_FORMAT (AKIA...)', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'PRIVATE_KEY_BLOCK', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'JWT_TOKEN (eyJ...)', re: /eyJ[A-Za-z0-9_-]{25,}\.eyJ[A-Za-z0-9_-]{20,}/ },
  { label: 'OPENAI_KEY_FORMAT (sk-...)', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { label: 'GOOGLE_API_KEY_FORMAT (AIza...)', re: /\bAIza[0-9A-Za-z_\-]{30,}\b/ },
  { label: 'GITHUB_TOKEN_FORMAT (ghp_/gho_/ghu_/ghs_/ghr_)', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { label: 'SLACK_TOKEN_FORMAT (xoxb/xoxp)', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { label: 'TELEGRAM_BOT_TOKEN_FORMAT', re: /\b[0-9]{8,10}:[A-Za-z0-9_-]{33,}\b/ },
  { label: 'GMAIL_APP_PASSWORD_FORMAT', re: /\b[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}\b/ },
];

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz', '.tgz', '.ico', '.webp', '.mp4', '.wav', '.mp3', '.ttf', '.woff', '.woff2', '.sst', '.bin', '.exe', '.dll', '.so', '.dylib', '.class', '.jar', '.wasm', '.mov', '.avi', '.sqlite', '.db']);

const findings = [];
let scanned = 0, skippedBinary = 0, unreadable = 0;

for (const rel of intended) {
  const abs = path.join(ROOT, rel);
  const ext = path.extname(rel).toLowerCase();
  if (BINARY_EXT.has(ext)) { skippedBinary++; continue; }
  let content;
  try {
    const st = fs.statSync(abs);
    if (st.size > 20 * 1024 * 1024) { skippedBinary++; continue; } // skip >20MB for text scan
    content = fs.readFileSync(abs, 'utf8');
  } catch (e) { unreadable++; continue; }
  scanned++;

  // (a) live .env value overlap — THE critical check
  for (const { name, val } of envValues) {
    if (val && content.includes(val)) {
      findings.push({ file: rel, kind: 'LIVE_ENV_VALUE', detail: 'contains runtime value of ' + name });
    }
  }
  // (b) high-confidence formats
  for (const { label, re } of FORMAT_PATTERNS) {
    const matches = content.match(new RegExp(re.source, 'g'));
    if (matches && matches.length > 0) {
      findings.push({ file: rel, kind: 'FORMAT:' + label, detail: matches.length + ' match(es)' });
    }
  }
}

console.log('Text-scanned: ' + scanned + ' | binary/large skipped: ' + skippedBinary + ' | unreadable: ' + unreadable);
console.log('');
if (findings.length === 0) {
  console.log('RESULT: CLEAN — no live secret values, no high-confidence secret formats in intended tree.');
  process.exit(0);
} else {
  console.log('RESULT: FINDINGS (' + findings.length + ') — file paths and pattern names only:');
  for (const f of findings.slice(0, 100)) {
    console.log('  [' + f.kind + '] ' + f.file + ' — ' + f.detail);
  }
  if (findings.length > 100) console.log('  ... and ' + (findings.length - 100) + ' more');
  process.exit(1);
}
