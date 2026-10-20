#!/usr/bin/env node
/**
 * PHASE 0 verification pass 2 — discriminate real secrets from false positives.
 * 1. Classify DATABASE_URL value type (file path vs credentialed URL) — type only.
 * 2. For every GMAIL_APP_PASSWORD_FORMAT 4-word match in flagged files: check
 *    whether the concatenated form equals any runtime .env password value.
 * 3. Scan the EXCLUDED upload/env.example for live-value overlap (report only —
 *    it is already in origin/main history; we need to know, not print).
 * OUTPUT: counts and classifications only. Never prints values.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/home/z/my-project';

// ---- load runtime env values ----
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

// ---- 1. DATABASE_URL type ----
const dburl = env.DATABASE_URL || '';
const dburlType = /:\/\/[^\/]*:[^@]*@/.test(dburl)
  ? 'CREDENTIALED_URL (contains user:pass@ — CRITICAL if published)'
  : (dburl.startsWith('file:') ? 'FILE_PATH (benign)' : 'OTHER (len=' + dburl.length + ')');
console.log('DATABASE_URL type: ' + dburlType);

// ---- SMTP_HOST type ----
const smtpHost = env.SMTP_HOST || '';
console.log('SMTP_HOST is hostname-like (no embedded creds): ' + (!/[:@]/.test(smtpHost) && smtpHost.includes('.')));

// ---- 2. false-positive discrimination for 4-word matches ----
const flaggedFiles = execSync(
  "git ls-files | grep -vE '^(node_modules/|\\.next/|db-backups/)' | grep -vE '^db/custom\\.db$'",
  { cwd: ROOT, encoding: 'utf8', shell: '/bin/bash', maxBuffer: 1 << 28 }
).split('\n').filter(Boolean);

const runtimePasswords = [env.GMAIL_APP_PASSWORD, env.SMTP_PASSWORD, env.SMTP_PASS]
  .filter(v => v && v.length >= 8);
console.log('Runtime password-bearing vars loaded: ' + runtimePasswords.length + ' (GMAIL_APP_PASSWORD/SMTP_PASSWORD/SMTP_PASS)');

const re = /\b[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}\b/g;
let totalMatches = 0, truePositives = 0;
const tpFiles = new Set();
for (const rel of flaggedFiles) {
  const abs = path.join(ROOT, rel);
  let content;
  try {
    if (fs.statSync(abs).size > 20 * 1024 * 1024) continue;
    content = fs.readFileSync(abs, 'utf8');
  } catch { continue; }
  const matches = content.match(re) || [];
  totalMatches += matches.length;
  for (const m of matches) {
    const concatenated = m.replace(/ /g, '');
    for (const rp of runtimePasswords) {
      if (m === rp || concatenated === rp.replace(/ /g, '')) {
        truePositives++;
        tpFiles.add(rel);
      }
    }
  }
}
console.log('GMAIL_APP_PASSWORD_FORMAT total matches across intended tree: ' + totalMatches);
console.log('TRUE positives (equal to a runtime password): ' + truePositives + (truePositives ? ' FILES: ' + [...tpFiles].join(', ') : ' — ALL ARE FALSE POSITIVES (natural language)'));

// ---- 3. excluded upload/env.example live-value overlap (report only) ----
const exFile = 'upload/env.example (ACQUISITION-OS Latest)';
try {
  const content = fs.readFileSync(path.join(ROOT, exFile), 'utf8');
  const hits = [];
  for (const [name, val] of Object.entries(env)) {
    if (val && val.length >= 8 && content.includes(val)) hits.push(name);
  }
  console.log('');
  console.log('EXCLUDED ' + exFile + ' (already in origin/main history — informational):');
  console.log('  contains runtime values of: ' + (hits.length ? hits.join(', ') : 'NONE — no live credential overlap'));
} catch (e) {
  console.log('  (unreadable: ' + e.code + ')');
}

// ---- 4. also scan root env (1).txt / env.example (should be 0 bytes) ----
for (const f of ['env (1).txt', 'env.example']) {
  const sz = fs.existsSync(path.join(ROOT, f)) ? fs.statSync(path.join(ROOT, f)).size : -1;
  console.log('Root ' + f + ' size: ' + sz + ' bytes' + (sz === 0 ? ' (scrubbed — EMPTY)' : ' (!! NON-EMPTY — INVESTIGATE)'));
}
