#!/usr/bin/env node
// runtime-verify-auth.mjs — End-to-end runtime verification of REAL auth flows.
// Prints NO secret values. Reads CRON_SECRET from .env for the diagnostic call.
import { readFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const env = {};
for (const line of readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z][A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const maskEmail = (e) => (e ? `${e.slice(0, 3)}***@${e.split('@')[1] || ''}` : e);

// ── 1. /api/auth/config — what the login page uses to render buttons ──
const cfg = await (await fetch(`${BASE}/api/auth/config`)).json();
console.log('── 1. /api/auth/config ──');
console.log(JSON.stringify(cfg, null, 2).slice(0, 1200));

// ── 2. /api/auth/google/state — must return REAL accounts.google.com URL ──
const testOrigin = 'https://acquisition.space-z.ai';
const st = await (await fetch(`${BASE}/api/auth/google/state?origin=${encodeURIComponent(testOrigin)}`)).json();
console.log('\n── 2. /api/auth/google/state ──');
const authUrl = st.authUrl || '';
console.log('devMode           :', st.devMode ?? false);
console.log('googleEnabled     :', st.googleEnabled);
console.log('authUrl host      :', (() => { try { return new URL(authUrl).host; } catch { return '(none)'; } })());
console.log('authUrl is REAL   :', authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth') ? 'YES ✅' : 'NO ❌');
console.log('client_id match   :', authUrl.includes(`client_id=${env.GOOGLE_CLIENT_ID}`) ? 'YES ✅ (recovered real client_id)' : 'NO ❌');
console.log('redirect_uri      :', decodeURIComponent((authUrl.match(/redirect_uri=([^&]+)/) || [])[1] || '(none)'));

// ── 3. /api/auth/email-diagnostic — provider status + connectivity (Bearer CRON_SECRET) ──
console.log('\n── 3. /api/auth/email-diagnostic ──');
const diagRes = await fetch(`${BASE}/api/auth/email-diagnostic`, {
  headers: { authorization: `Bearer ${env.CRON_SECRET}` },
});
const diag = await diagRes.json();
const brief = {
  providers: diag.providers ?? diag.config?.providers,
  connectivity: diag.connectivity ?? diag.smtpTest ?? undefined,
  recentErrors: diag.recentErrors ?? undefined,
};
console.log(JSON.stringify(brief, null, 2).slice(0, 1500));
console.log('(full diagnostic keys:', Object.keys(diag).join(', '), ')');
