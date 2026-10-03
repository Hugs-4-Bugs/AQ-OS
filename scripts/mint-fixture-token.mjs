// Mint an access_token JWT for a QA FIXTURE user (created via the public
// signup API during this verification run). Same token format as
// scripts/mint-qa-token.mjs. No DB writes. The secret is NEVER printed.
// Usage: node scripts/mint-fixture-token.mjs <userId> <email> <plan>
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const [userId, email, plan = 'free'] = process.argv.slice(2);
if (!userId || !email) {
  console.error('Usage: node scripts/mint-fixture-token.mjs <userId> <email> [plan]');
  process.exit(1);
}

const env = readFileSync('/home/z/my-project/.env', 'utf8');
const line = env.split('\n').find((l) => l.startsWith('JWT_SECRET='));
if (!line) { console.error('JWT_SECRET not found'); process.exit(1); }
const secret = line.slice('JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '');

const token = jwt.sign(
  {
    sub: userId,
    email,
    role: 'owner',
    plan,
    orgId: null,
    isTrial: false,
    trialEndsAt: null,
    type: 'access',
  },
  secret,
  { expiresIn: '2h', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
);
console.log(token);
