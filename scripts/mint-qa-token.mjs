// Mint an access_token JWT for the E2E test user created via the PUBLIC
// signup API (qa@test.com). Uses the app's own token
// format + JWT_SECRET from .env. The secret is NEVER printed. No DB writes.
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const env = readFileSync('/home/z/my-project/.env', 'utf8');
const line = env.split('\n').find((l) => l.startsWith('JWT_SECRET='));
if (!line) { console.error('JWT_SECRET not found'); process.exit(1); }
const secret = line.slice('JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '');

const token = jwt.sign(
  {
    sub: 'cmtfxvfjx0000o64h49jmx2ey', // qa@test.com
    email: 'qa@test.com',
    role: 'owner',
    plan: 'pro',
    orgId: null,
    isTrial: true,
    trialEndsAt: null,
    type: 'access',
  },
  secret,
  { expiresIn: '2h', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
);
// Print ONLY the token (safe-ish, 2h expiry, test user) — never the secret.
console.log(token);
