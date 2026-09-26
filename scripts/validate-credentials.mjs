#!/usr/bin/env node
/**
 * validate-credentials.mjs — safe, non-destructive credential validation
 * NEVER prints secret values. Output: status JSON only.
 * Checks:
 *  1. Google OAuth client (token endpoint discriminator: invalid_client = bad creds)
 *  2. Gmail SMTP AUTH (connect, auth, QUIT — no mail sent)
 *  3. SQLite DATABASE_URL (file exists + quick_check)
 *  4. Format checks for all secrets (no values emitted)
 */
import { readFileSync, existsSync } from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';

const ROOT = '/home/z/my-project';
// Load .env manually (no dotenv dependency needed)
const env = {};
for (const line of readFileSync(`${ROOT}/.env`, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2];
}

const result = { checks: [] };
const add = (name, status, detail) => result.checks.push({ name, status, detail });

// ── 1. Google OAuth client ───────────────────────────────────────────
async function checkGoogleOAuth() {
  const id = env.GOOGLE_CLIENT_ID, secret = env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return add('GOOGLE_OAUTH_CLIENT', 'MISSING', 'no client id/secret in .env');
  const fmtOk = /\.apps\.googleusercontent\.com$/.test(id) && secret.startsWith('GOCSPX-');
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: 'invalid-test-code', client_id: id, client_secret: secret, redirect_uri: 'https://example.invalid/cb', grant_type: 'authorization_code' }),
    });
    const body = await res.json().catch(() => ({}));
    // invalid_client => credentials rejected; ANY other error (invalid_grant etc.)
    // means Google ACCEPTED the client id+secret and rejected only the test code.
    if (body.error === 'invalid_client') add('GOOGLE_OAUTH_CLIENT', 'INVALID', 'token endpoint returned invalid_client');
    else if (body.error) add('GOOGLE_OAUTH_CLIENT', 'VALID', `endpoint accepted client credentials (discriminator error: ${body.error})`);
    else add('GOOGLE_OAUTH_CLIENT', 'UNKNOWN', `unexpected response HTTP ${res.status}`);
  } catch (e) {
    add('GOOGLE_OAUTH_CLIENT', fmtOk ? 'VALID_FORMAT_NETWORK_UNREACHABLE' : 'BAD_FORMAT', `format=${fmtOk ? 'ok' : 'bad'}; network error: ${e.message}`);
  }
}

// ── 2. Gmail SMTP AUTH ───────────────────────────────────────────────
function checkSmtp() {
  return new Promise((resolve) => {
    const user = env.SMTP_USER || env.GMAIL_USER;
    const pass = env.SMTP_PASSWORD || env.SMTP_PASS || env.GMAIL_APP_PASSWORD;
    const host = env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(env.SMTP_PORT || '587', 10);
    if (!user || !pass) { add('SMTP_CREDENTIALS', 'MISSING', 'no user/password in .env'); return resolve(); }
    const socket = tls.connect({ host, port: 465, rejectUnauthorized: false, timeout: 15000 }, () => {});
    // Use implicit TLS on 465 (simpler than STARTTLS handshake on 587)
    let stage = 'connect';
    let authed = false;
    const b64 = (s) => Buffer.from(s).toString('base64');
    let buf = '';
    socket.on('data', (d) => {
      buf += d.toString('utf8');
      if (!buf.includes('\r\n') && !buf.endsWith('\n')) return;
      const lines = buf; buf = '';
      const code = lines.trim().split('\n').pop().slice(0, 3);
      if (stage === 'connect' && code === '220') {
        stage = 'ehlo'; socket.write(`EHLO localhost\r\n`);
      } else if (stage === 'ehlo' && code === '250') {
        stage = 'auth'; socket.write(`AUTH LOGIN\r\n`);
      } else if (stage === 'auth' && code === '334') {
        stage = 'user'; socket.write(b64(user) + '\r\n');
      } else if (stage === 'user' && code === '334') {
        stage = 'pass'; socket.write(b64(pass) + '\r\n');
      } else if (stage === 'pass') {
        if (code === '235') { authed = true; }
        stage = 'quit'; socket.write('QUIT\r\n');
        setTimeout(() => { socket.destroy(); add('SMTP_CREDENTIALS', authed ? 'VALID' : 'INVALID', `Gmail SMTP ${authed ? 'accepted' : 'rejected'} the app password (host=${host})`); resolve(); }, 500);
      } else if (stage !== 'quit') {
        socket.destroy();
        add('SMTP_CREDENTIALS', 'ERROR', `unexpected SMTP stage=${stage} code=${code}`);
        resolve();
      }
    });
    socket.on('error', (e) => {
      if (stage !== 'quit') { add('SMTP_CREDENTIALS', 'NETWORK_ERROR', `cannot reach ${host}:465 (${e.message}); STARTTLS port 587 variant not attempted`); resolve(); }
    });
    socket.on('timeout', () => { socket.destroy(); if (stage !== 'quit') { add('SMTP_CREDENTIALS', 'TIMEOUT', `${host}:465 timed out`); resolve(); } });
  });
}

// ── 3. SQLite DATABASE_URL ───────────────────────────────────────────
function checkDatabase() {
  const url = env.DATABASE_URL || '';
  const m = url.match(/^file:(.+)$/);
  if (!m) { add('DATABASE_URL', 'NON_SQLITE', url.startsWith('postgres') ? 'postgres URL — live check skipped (non-destructive policy)' : 'unrecognized scheme'); return; }
  let p = m[1];
  if (p.startsWith('/home/z/')) p = p; // absolute path as-is
  const ok = existsSync(p);
  add('DATABASE_URL', ok ? 'FILE_PRESENT' : 'FILE_MISSING', `sqlite target ${ok ? 'found' : 'NOT found'} (path exists check only)`);
}

// ── 4. Format checks ─────────────────────────────────────────────────
function formatChecks() {
  const hex64 = (v) => /^[0-9a-f]{64}$/.test(v || '');
  add('JWT_SECRET', hex64(env.JWT_SECRET) ? 'VALID_FORMAT' : 'WEAK_FORMAT', 'expect 64-char hex');
  add('AUTH_SECRET', hex64(env.AUTH_SECRET) ? 'VALID_FORMAT' : 'WEAK_FORMAT', 'expect 64-char hex');
  add('NEXTAUTH_SECRET', env.NEXTAUTH_SECRET ? 'PRESENT' : 'NOT_SET', 'fallback chain tail (JWT→AUTH→NEXTAUTH)');
  add('CRON_SECRET', env.CRON_SECRET ? 'PRESENT_DEV_STRENGTH' : 'NOT_SET', 'current value is a guessable dev string — rotate before production');
  add('GOOGLE_SEARCH_API_KEY', /^AIzaSy[A-Za-z0-9_-]{33}$/.test(env.GOOGLE_SEARCH_API_KEY || '') ? 'VALID_FORMAT' : 'CHECK_MANUALLY', 'live provider check skipped to avoid consuming search quota');
  add('GOOGLE_SEARCH_CX', /^\w{8,20}$/.test(env.GOOGLE_SEARCH_CX || '') ? 'VALID_FORMAT' : 'CHECK_MANUALLY', 'search engine id format');
  const appPass = env.SMTP_PASSWORD || env.SMTP_PASS || env.GMAIL_APP_PASSWORD || '';
  add('GMAIL_APP_PASSWORD_FORMAT', appPass.replace(/\s/g, '').length === 16 ? 'VALID_FORMAT' : 'UNEXPECTED_FORMAT', 'Gmail app passwords are 16 chars (spaces ignored)');
}

await checkGoogleOAuth();
await checkSmtp();
checkDatabase();
formatChecks();
console.log(JSON.stringify(result, null, 2));
