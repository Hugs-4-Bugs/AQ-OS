/**
 * Real Google OAuth credential verification.
 * Exchanges a bogus code at Google's token endpoint:
 *   - invalid_grant  -> client id + secret are VALID (auth passed, code bogus)
 *   - invalid_client -> id/secret pair is WRONG
 *
 * SECURITY: credentials come from .env — never hardcoded (the client
 * secret was previously committed here and had to be rotated).
 */
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ||
  'https://acquisition.space-z.ai/api/auth/callback/google';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env before running this script.');
  process.exit(1);
}

async function main() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: 'bogus-code-credential-probe',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const body = await res.json();
  console.log('HTTP', res.status, '| error =', body.error);
  if (body.error === 'invalid_grant') {
    console.log('RESULT: GOOGLE CREDENTIALS VALID — client id + secret accepted (bogus code rejected as expected)');
    process.exit(0);
  } else if (body.error === 'invalid_client') {
    console.log('RESULT: GOOGLE CREDENTIALS INVALID — client id/secret rejected');
    process.exit(1);
  } else {
    console.log('RESULT: UNEXPECTED RESPONSE —', JSON.stringify(body).slice(0, 300));
    process.exit(1);
  }
}
main();
