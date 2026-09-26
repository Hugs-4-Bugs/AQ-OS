// READ-ONLY DIAGNOSTIC — prove/disprove the /api/auth/google/relay redirect loop.
// Signs a 60-second relay JWT with DUMMY token payloads (not a real session),
// using the server's own JWT_SECRET read from .env (never printed).
// The resulting token is written to tool-results/diag_relay_token.txt for curl use.
// No DB access, no writes, no real credentials involved.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import jwt from 'jsonwebtoken';

const envPath = '/home/z/my-project/.env';
const envSrc = readFileSync(envPath, 'utf8');
const getEnv = (name) => {
  const m = envSrc.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!m) return undefined;
  let v = m[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
};

const secret = getEnv('JWT_SECRET');
if (!secret) {
  console.error('JWT_SECRET: MISSING in .env');
  process.exit(2);
}
console.log('JWT_SECRET: CONFIGURED (value never printed), length=' + secret.length);

const CURRENT_ORIGIN = 'https://preview-chat-9232d24b-5032-48c7-b56f-c132c2f15528.space-z.ai';
const OLD_ORIGIN = 'https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai';

const makeToken = (origin) =>
  jwt.sign(
    {
      type: 'google_oauth_relay',
      accessToken: 'DIAG-dummy-access-token-NOT-A-REAL-SESSION',
      refreshToken: 'DIAG-dummy-refresh-token-NOT-A-REAL-SESSION',
      origin,
      nonce: 'diag' + Date.now().toString(36),
    },
    secret,
    { expiresIn: 60 }
  );

mkdirSync('/home/z/my-project/tool-results', { recursive: true });
writeFileSync('/home/z/my-project/tool-results/diag_relay_token_current.txt', makeToken(CURRENT_ORIGIN));
writeFileSync('/home/z/my-project/tool-results/diag_relay_token_old.txt', makeToken(OLD_ORIGIN));
console.log('Diagnostic relay tokens written (60s expiry, dummy payloads).');
console.log('origin(current)=' + CURRENT_ORIGIN);
console.log('origin(old)=' + OLD_ORIGIN);
