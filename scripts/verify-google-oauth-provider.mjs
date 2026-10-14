/**
 * REAL provider-level Google OAuth credential validation.
 * Reads real credentials from .env at runtime. NEVER prints secret values.
 *
 * Probe 1 — token endpoint discriminator:
 *   POST https://oauth2.googleapis.com/token with a deliberately invalid
 *   authorization code but the REAL client_id + client_secret.
 *   - HTTP 400 { error: "invalid_grant" }  → client credentials are VALID
 *     (Google authenticated the client; only the dummy code is rejected).
 *   - HTTP 401 { error: "invalid_client" } → client credentials INVALID
 *     (revoked/regenerated/mistyped).
 *
 * Probe 2 — authorization endpoint redirect_uri registration check:
 *   GET accounts.google.com/o/oauth2/v2/auth with each candidate redirect_uri.
 *   - HTML consent page (200)  → client_id live AND redirect_uri registered.
 *   - error=redirect_uri_mismatch → client live, URI not whitelisted.
 *   - error=invalid_request / disabled_client → other client problems.
 */
import { readFileSync } from 'fs';

function envValue(key) {
  for (const line of readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const CLIENT_ID = envValue('GOOGLE_CLIENT_ID');
const CLIENT_SECRET = envValue('GOOGLE_CLIENT_SECRET');

console.log('GOOGLE_CLIENT_ID = ' + (CLIENT_ID ? `PRESENT (len=${CLIENT_ID.length}, suffix=${CLIENT_ID.endsWith('.apps.googleusercontent.com') ? 'valid-format' : 'UNEXPECTED'})` : 'MISSING'));
console.log('GOOGLE_CLIENT_SECRET = ' + (CLIENT_SECRET ? `PRESENT (len=${CLIENT_SECRET.length})` : 'MISSING'));
if (!CLIENT_ID || !CLIENT_SECRET) { console.log('RESULT: NOT DONE — credentials missing in .env'); process.exit(1); }

// ── Probe 1: token endpoint ─────────────────────────────────────────────
console.log('\n── Probe 1: token endpoint (real client creds + dummy code) ──');
try {
  const body = new URLSearchParams({
    code: 'probe-invalid-code-not-a-real-grant',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: 'http://localhost:3000/api/auth/callback/google',
    grant_type: 'authorization_code',
    code_verifier: 'probe-verifier',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  console.log(`HTTP ${res.status} error=${json.error || 'none'}`);
  console.log(`description=${(json.error_description || '').slice(0, 160)}`);
  if (json.error === 'invalid_grant') {
    console.log('PROBE-1 RESULT: client credentials VALID (Google authenticated the client; only the dummy code was rejected).');
  } else if (json.error === 'invalid_client') {
    console.log('PROBE-1 RESULT: client credentials INVALID — Google rejected the secret.');
  } else {
    console.log('PROBE-1 RESULT: unexpected provider response (see above).');
  }
} catch (e) {
  console.log('PROBE-1 network failure: ' + e.message);
}

// ── Probe 2: authorization endpoint per candidate redirect_uri ─────────
console.log('\n── Probe 2: authorization endpoint / redirect_uri registration ──');
const candidates = [
  'http://localhost:3000/api/auth/callback/google',
  'https://preview-chat-9531f1e0-3d55-4ec1-ac52-7d94f71953ed.space-z.ai/api/auth/callback/google',
];
for (const redirectUri of candidates) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  try {
    const res = await fetch(u, { redirect: 'follow' });
    const text = await res.text();
    const mismatch = text.includes('redirect_uri_mismatch') || text.includes('Error 400: redirect_uri_mismatch');
    const disabled = text.includes('disabled_client') || text.includes('Error 403');
    const hasConsent = res.status === 200 && (text.toLowerCase().includes('sign in') || text.toLowerCase().includes('continue') || text.includes('accounts.google.com'));
    let verdict = mismatch ? 'redirect_uri NOT registered for this client'
      : disabled ? 'client disabled/blocked by Google'
      : hasConsent ? 'client_id LIVE and redirect_uri REGISTERED (consent page served)'
      : `unrecognized response (HTTP ${res.status})`;
    console.log(`redirect_uri=${redirectUri}\n  → HTTP ${res.status}: ${verdict}`);
  } catch (e) {
    console.log(`redirect_uri=${redirectUri}\n  → network failure: ${e.message}`);
  }
}
console.log('\nNo secrets were printed.');
