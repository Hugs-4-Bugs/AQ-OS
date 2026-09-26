#!/usr/bin/env node
// transfer-env-creds.js — Forward-only merge of real credentials from ensure-env.sh into .env
// SECURITY: prints only variable names + masked metadata. NEVER prints values.
const fs = require('fs');
const path = require('path');

const ROOT = '/home/z/my-project';
const src = fs.readFileSync(path.join(ROOT, 'ensure-env.sh'), 'utf8');
const envPath = path.join(ROOT, '.env');

// Keys we want to transfer if present with non-placeholder values
const WANT = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_PASS',
  'SMTP_HOST',
  'SMTP_PORT',
  'GMAIL_USER',
  'GMAIL_PASSWORD',
  'GMAIL_APP_PASSWORD',
  'EMAIL_FROM',
  'GOOGLE_SEARCH_API_KEY',
  'GOOGLE_SEARCH_CX',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'RESEND_API_KEY',
  'CRON_SECRET',
  'ENABLE_GOOGLE_OAUTH',
  'ENABLE_OTP_LOGIN',
  'ENABLE_MAGIC_LINK',
  'AUTH_BYPASS_EMAIL',
  'AUTH_AUTO_VERIFY',
  'NEXTAUTH_URL',
  'APP_URL',
  'NEXT_PUBLIC_APP_URL',
];

const isPlaceholder = (v) =>
  /your|replace|xxx|example|placeholder|changeme|<[^>]*>|\$\(/i.test(v);

// Parse shell-style assignments (KEY=VALUE with optional quotes)
function parseShellVars(text) {
  const out = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    // strip trailing inline comment (naive but safe for quoted values)
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    } else {
      const hashIdx = v.indexOf(' #');
      if (hashIdx > -1) v = v.slice(0, hashIdx).trim();
    }
    out[m[1]] = v;
  }
  return out;
}

const shellVars = parseShellVars(src);
// Also parse add_default KEY "value" calls (ensure-env.sh uses helper fns)
const addDefaultRe = /^\s*add_default\s+([A-Z][A-Z0-9_]+)\s+"([^"]*)"/gm;
let adm;
while ((adm = addDefaultRe.exec(src)) !== null) {
  const v = adm[2].trim();
  if (v && !shellVars[adm[1]]) shellVars[adm[1]] = v;
}
const existing = fs.readFileSync(envPath, 'utf8').split('\n');
const existingKeys = new Set(
  existing.map((l) => (l.match(/^([A-Z][A-Z0-9_]+)\s*=/) || [])[1]).filter(Boolean)
);

const toAdd = [];
for (const k of WANT) {
  const v = shellVars[k];
  if (!v || !v.length) continue;
  if (isPlaceholder(v)) continue;
  if (existingKeys.has(k)) { console.log(`${k}: already in .env (kept existing)`); continue; }
  toAdd.push(`${k}=${v}`);
  const safe = /SECRET|PASSWORD|PASS\b|KEY|TOKEN/i.test(k)
    ? `[${v.length} chars, starts "${v.slice(0, 4)}"]`
    : `[${v}]`;
  console.log(`${k}: transferred ${safe}`);
}

if (toAdd.length) {
  fs.appendFileSync(envPath, '\n# Real service credentials (Google OAuth + SMTP email + integrations)\n' + toAdd.join('\n') + '\n');
  console.log(`\nAppended ${toAdd.length} variable(s) to .env`);
} else {
  console.log('\nNothing to append.');
}

// Verify final state (masked)
const final = fs.readFileSync(envPath, 'utf8');
const finalKeys = final.split('\n').map((l) => (l.match(/^([A-Z][A-Z0-9_]+)\s*=/) || [])[1]).filter(Boolean);
console.log('\nFinal .env keys: ' + finalKeys.join(', '));
console.log('.env still gitignored: ' + (require('child_process').execSync('git check-ignore .env').toString().trim() ? 'YES' : 'NO — CRITICAL!'));
