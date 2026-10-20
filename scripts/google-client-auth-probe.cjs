#!/usr/bin/env node
/**
 * Google OAuth CLIENT-AUTH probe — proves whether the CLIENT CREDENTIAL PAIR
 * (client_id + client_secret from runtime .env) is accepted by Google's
 * token endpoint. Uses a deliberately INVALID authorization code:
 *   - HTTP 401 invalid_client  -> credentials REJECTED (bad secret/id)
 *   - HTTP 400 invalid_grant   -> credentials ACCEPTED (code is bogus, as designed)
 * NEVER prints the client_secret or client_id values.
 * Reads /home/z/my-project/.env at runtime. No user data involved.
 */
const fs = require('fs');

const env = {};
for (const line of fs.readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !line.trim().startsWith('#')) env[m[1]] = m[2];
}

const clientId = env.GOOGLE_CLIENT_ID;
const clientSecret = env.GOOGLE_CLIENT_SECRET;

console.log(`GOOGLE_CLIENT_ID present: ${!!clientId} (len=${clientId ? clientId.length : 0})`);
console.log(`GOOGLE_CLIENT_SECRET present: ${!!clientSecret} (len=${clientSecret ? clientSecret.length : 0})`);

if (!clientId || !clientSecret) {
  console.log('RESULT: CONFIGURATION INCOMPLETE — cannot probe');
  process.exit(1);
}

(async () => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: 'DELIBERATELY-INVALID-PROBE-CODE-NOT-A-REAL-CODE',
      redirect_uri: 'https://example.com/probe', // never reaches validation past client auth
    }),
  });
  const json = await res.json().catch(() => ({}));
  const err = json.error || 'none';
  // Print ONLY the error classification — never echo request params.
  console.log(`token endpoint HTTP status: ${res.status}`);
  console.log(`error classification: ${err}`);
  if (res.status === 401 && /invalid_client/i.test(err)) {
    console.log('VERDICT: REJECTED — client credentials (id/secret) NOT accepted by Google');
    process.exit(2);
  } else if (res.status === 400 && /invalid_grant|invalid_request/i.test(err)) {
    console.log('VERDICT: ACCEPTED — client credentials passed Google client authentication');
    console.log('(the bogus probe code was rejected as expected — the client id + secret pair is VALID)');
    process.exit(0);
  } else {
    console.log(`VERDICT: UNEXPECTED — inspect manually (status ${res.status}, error ${err})`);
    process.exit(3);
  }
})();
