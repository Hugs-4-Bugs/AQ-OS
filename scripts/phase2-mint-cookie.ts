// Phase 2 final verification — mint a REAL app JWT for the established
// pro-qa user using the app's own token contract (issuer 'acquisitionos',
// audience 'acquisitionos-api', type 'access', 15m expiry).
// JWT_SECRET is read from .env at runtime; the secret is NEVER printed.
// The cookie is written to .test-tmp/qa-cookie.txt (gitignored).
import { Database } from 'bun:sqlite';
import jwt from 'jsonwebtoken';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const secret =
  (env.match(/^JWT_SECRET=(.*)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '') ||
  (env.match(/^AUTH_SECRET=(.*)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '') ||
  (env.match(/^NEXTAUTH_SECRET=(.*)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
if (!secret) { console.error('no JWT secret found in .env'); process.exit(1); }

const db = new Database('db/custom.db', { readonly: true });
const user = db.query(
  'SELECT id, email, role, plan, orgId, isTrial, trialEndsAt FROM User WHERE id = ?'
).get('cmv7kyrf20000nau09rowvc6x') as Record<string, unknown>;
if (!user) { console.error('QA user not found'); process.exit(1); }

const token = jwt.sign(
  {
    sub: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    orgId: user.orgId ?? null,
    isTrial: Boolean(user.isTrial),
    trialEndsAt: user.trialEndsAt ? new Date(user.trialEndsAt as string).toISOString() : null,
    type: 'access',
  },
  secret,
  { expiresIn: '50m', issuer: 'acquisitionos', audience: 'acquisitionos-api' } // 50m: job can take minutes
);

mkdirSync('.test-tmp', { recursive: true });
writeFileSync('.test-tmp/qa-cookie.txt', token, { mode: 0o600 });
console.log('cookie minted for', user.email, '(plan:', user.plan + ') → .test-tmp/qa-cookie.txt; length:', token.length);
