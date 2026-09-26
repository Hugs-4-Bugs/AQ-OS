#!/usr/bin/env node
// recover-credentials.mjs — Restore REAL user-configured credentials into .env
//
// CONTEXT: The sandbox reset truncated /home/z/my-project/.env to a single
// DATABASE_URL line, losing the real credentials the user configured
// (Google OAuth, Gmail SMTP, Stripe, Resend, Google Search). Those exact
// values still exist in THIS repo's git history inside the OLD versions of
// ensure-env.sh (commits 9a178ee and 5a02aa5) — they were embedded there
// before the P0 security hardening removed them.
//
// This script:
//   1. Reads the old ensure-env.sh blobs via `git show` (READ-ONLY — never
//      changes HEAD, never checks out, never touches the working tree).
//   2. Parses shell assignments + add_default/set_if_missing helper calls.
//   3. Merges the REAL provider credentials into .env (existing keys kept).
//   4. Generates FRESH strong 64-hex secrets for app-generated keys
//      (JWT_SECRET, JWT_REFRESH_SECRET, NEXTAUTH_SECRET, AUTH_SECRET,
//      CRON_SECRET) — the old committed values were weak/leaked and the
//      hardened ones were lost with .env; ensure-env.sh's documented design
//      is to generate these with openssl when absent.
//   5. Deliberately does NOT set APP_URL / NEXTAUTH_URL / NEXT_PUBLIC_APP_URL
//      so magic-link / OAuth URLs are resolved dynamically from the request
//      origin (the codebase's current design) instead of pinning one domain.
//
// SECURITY: prints only variable names + masked metadata. NEVER prints
// secret values. .env is gitignored (verified at the end).
import { execSync } from 'child_process';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

const ROOT = '/home/z/my-project';
const ENV_FILE = `${ROOT}/.env`;
const COMMITS = ['9a178ee', '5a02aa5']; // preference order (newest first)

// ── Keys to recover (user/provider-configured REAL credentials) ──
const RECOVER_KEYS = [
  // Google OAuth (login)
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  // Gmail SMTP (OTP + magic link + notifications)
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_USERNAME',
  'SMTP_PASSWORD', 'SMTP_PASS',
  'GMAIL_USER', 'GMAIL_PASSWORD', 'GMAIL_APP_PASSWORD',
  'EMAIL_FROM',
  // Google search integration
  'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX',
  // Stripe
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_PRICE_ID_PRO_MONTHLY', 'STRIPE_PRICE_ID_PRO_YEARLY',
  'STRIPE_PRICE_ID_ELITE_MONTHLY', 'STRIPE_PRICE_ID_ELITE_YEARLY',
  'STRIPE_PRICE_CREDITS_250_ID', 'STRIPE_PRICE_CREDITS_500_ID',
  'STRIPE_PRICE_CREDITS_1000_ID', 'STRIPE_PRICE_CREDITS_2500_ID',
  // Resend
  'RESEND_API_KEY',
];

// ── App-generated secrets: generate FRESH strong values when absent ──
const GENERATE_KEYS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'NEXTAUTH_SECRET', 'AUTH_SECRET', 'CRON_SECRET'];

// ── Auth feature flags (non-secret, restore to real-mode values) ──
const FLAG_DEFAULTS = {
  ENABLE_GOOGLE_OAUTH: 'true',
  ENABLE_MAGIC_LINK: 'true',
  ENABLE_OTP_LOGIN: 'true',
  AUTH_DEV_MODE: 'false',
  AUTH_AUTO_VERIFY: 'false',
  AUTH_BYPASS_EMAIL: 'false',
  AUTH_DEV_OTP_IN_RESPONSE: 'false',
  AUTH_DEV_OTP_IN_LOG: 'false',
};

const isUnsafeValue = (v) =>
  !v || /your|replace|xxx|example|placeholder|changeme|<[^>]*>|\$\(|\$\{/.test(v);

function parseShellVars(text) {
  const out = {};
  for (const line of text.split('\n')) {
    // add_default KEY "value"  /  set_if_missing KEY "value"
    const helper = line.match(/^\s*(?:add_default|set_if_missing)\s+([A-Z][A-Z0-9_]+)\s+"([^"]*)"/);
    if (helper) { if (!out[helper[1]]) out[helper[1]] = helper[2].trim(); continue; }
    const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) {
      v = v.slice(1, -1);
    } else {
      const h = v.indexOf(' #');
      if (h > -1) v = v.slice(0, h).trim();
    }
    if (out[m[1]] === undefined) out[m[1]] = v; // first occurrence wins per commit
  }
  return out;
}

// ── 1. Parse both historical blobs ──
const perCommit = COMMITS.map((c) => {
  let blob = '';
  try {
    blob = execSync(`git -C ${ROOT} show ${c}:ensure-env.sh`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch {
    console.log(`[warn] commit ${c}: ensure-env.sh not readable, skipping`);
    return { c, vars: {} };
  }
  return { c, vars: parseShellVars(blob) };
});

// ── 2. Resolve best value per key (newest commit wins; report conflicts) ──
const resolved = {};
for (const key of RECOVER_KEYS) {
  const found = perCommit.filter(({ vars }) => vars[key] !== undefined && !isUnsafeValue(vars[key]));
  if (!found.length) continue;
  const newest = found[0];
  resolved[key] = { value: newest.vars[key], commit: newest.c };
  if (found.length > 1) {
    const older = found[1];
    if (older.vars[key] !== newest.vars[key]) {
      const mask = (v) => /SECRET|PASSWORD|PASS\b|KEY|TOKEN/i.test(key) ? `len=${v.length}` : `${String(v).slice(0, 6)}…`;
      console.log(`[note] ${key} differs between commits (using ${newest.c}: ${mask(newest.vars[key])}; older ${older.c}: ${mask(older.vars[key])})`);
    }
  }
}

// ── 3. Read current .env, build missing-key list ──
if (!existsSync(ENV_FILE)) { console.error('.env missing — aborting'); process.exit(1); }
const current = readFileSync(ENV_FILE, 'utf8');
const currentKeys = new Set(
  current.split('\n').map((l) => (l.match(/^([A-Z][A-Z0-9_]+)\s*=/) || [])[1]).filter(Boolean)
);

const maskVal = (key, v) => {
  if (/SECRET|PASSWORD|PASS\b|API_KEY|_KEY$|TOKEN/i.test(key)) {
    return `SET (len=${v.length}, prefix=${v.slice(0, 4)}…, classified=SECRET)`;
  }
  if (/@/.test(v)) { // email address — mask local part
    const [local, domain] = v.split('@');
    return `${local.slice(0, 3)}***@${domain}`;
  }
  return String(v).slice(0, 12) + (String(v).length > 12 ? '…' : '');
};

const groups = { recovered: [], generated: [], flags: [] };
const linesToAdd = [];

for (const [key, { value, commit }] of Object.entries(resolved)) {
  if (currentKeys.has(key)) { console.log(`${key}: already in .env (kept existing) [source: git history]`); continue; }
  linesToAdd.push(`${key}=${value}`);
  groups.recovered.push(`  ✓ ${key}: recovered from ${cLabel(commit)} — ${maskVal(key, value)}`);
}
for (const key of GENERATE_KEYS) {
  if (currentKeys.has(key)) { console.log(`${key}: already in .env (kept existing)`); continue; }
  const v = randomBytes(32).toString('hex'); // 64-char strong secret
  linesToAdd.push(`${key}=${v}`);
  groups.generated.push(`  ✓ ${key}: generated fresh strong secret (len=64, hex)`);
}
for (const [key, val] of Object.entries(FLAG_DEFAULTS)) {
  if (currentKeys.has(key)) { console.log(`${key}: already in .env (kept existing)`); continue; }
  linesToAdd.push(`${key}=${val}`);
  groups.flags.push(`  ✓ ${key}=${val}`);
}
function cLabel(c) { return c === '9a178ee' ? 'commit 9a178ee (newer history)' : 'commit 5a02aa5 (older history)'; }

if (linesToAdd.length) {
  appendFileSync(
    ENV_FILE,
    '\n# ── Recovered REAL credentials (source: repo git history, old ensure-env.sh) ──\n'
    + linesToAdd.join('\n') + '\n'
  );
}

// ── 4. Hardening + git-safety checks ──
try { execSync(`chmod 600 ${ENV_FILE}`); } catch {}
const ignored = execSync(`git -C ${ROOT} check-ignore .env`, { encoding: 'utf8' }).trim();
const staged = execSync(`git -C ${ROOT} status --porcelain -- .env`, { encoding: 'utf8' }).trim();

console.log('\n════════ RECOVERY REPORT ════════');
console.log(`Recovered provider credentials : ${groups.recovered.length}`);
if (groups.recovered.length) console.log(groups.recovered.join('\n'));
console.log(`Generated app secrets          : ${groups.generated.length}`);
if (groups.generated.length) console.log(groups.generated.join('\n'));
console.log(`Auth flags set                 : ${groups.flags.length}`);
if (groups.flags.length) console.log(groups.flags.join('\n'));

const missing = RECOVER_KEYS.filter((k) => !resolved[k] && !currentKeys.has(k));
console.log(`\nNot found in git history (left for operator): ${missing.length ? missing.join(', ') : 'NONE — all recovered'}`);
console.log(`\nURL vars APP_URL/NEXTAUTH_URL/NEXT_PUBLIC_APP_URL: intentionally NOT set`);
console.log(`  → magic-link + OAuth URLs resolve dynamically from request origin (current codebase design).`);

console.log(`\n.env gitignored        : ${ignored ? 'YES (' + ignored + ')' : 'NO — CRITICAL!'}`);
console.log(`.env staged for commit : ${staged ? 'YES — CRITICAL! ' + staged : 'NO (safe)'}`);

const finalKeys = readFileSync(ENV_FILE, 'utf8').split('\n')
  .map((l) => (l.match(/^([A-Z][A-Z0-9_]+)\s*=/) || [])[1]).filter(Boolean);
console.log(`\nFinal .env keys (${finalKeys.length}): ${finalKeys.join(', ')}`);
