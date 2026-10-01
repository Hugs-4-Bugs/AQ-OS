// PROOF SCRIPT — runs ONLY against a disposable copy of the DB.
// 1. Reproduce the exact createSession failure (missing columns).
// 2. Apply the planned additive ALTERs to the copy.
// 3. Prove createSession works and old rows read back safely.
// The real db/custom.db is NEVER touched by this script.
process.env.DATABASE_URL = 'file:/home/z/my-project/.test-tmp/e2e-proof.db';

const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { DatabaseSync } = require('node:sqlite');

fs.mkdirSync('/home/z/my-project/.test-tmp', { recursive: true });
fs.copyFileSync('/home/z/my-project/db/custom.db', '/home/z/my-project/.test-tmp/e2e-proof.db');

const db = new PrismaClient();

async function main() {
  const user = await db.user.findFirst({ where: { emailVerified: true, isActive: true }, select: { id: true, email: true } });
  console.log('[A] test user:', user.email);

  const data = {
    userId: user.id,
    refreshToken: 'proof-token-' + Date.now(),
    deviceInfo: null,
    ipAddress: '127.0.0.1',
    userAgent: 'proof-script',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isRevoked: false,
    rememberMe: true,
    lastActivityAt: new Date(),
    absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };

  // ── Phase A: reproduce the production failure ──
  console.log('\n[A] attempting userSession.create on UNPATCHED copy...');
  try {
    await db.userSession.create({ data });
    console.log('[A] UNEXPECTED: create succeeded (repro failed!)');
  } catch (e) {
    console.log('[A] REPRODUCED. code=', e.code, '| message=', String(e.message).split('\n').slice(0, 3).join(' | '));
  }

  // Also prove READS of old rows currently fail (Prisma selects the new columns)
  console.log('\n[A2] attempting userSession.findFirst on UNPATCHED copy...');
  try {
    const s = await db.userSession.findFirst({ orderBy: { createdAt: 'desc' } });
    console.log('[A2] UNEXPECTED: read succeeded, id=', s && s.id);
  } catch (e) {
    console.log('[A2] REPRODUCED. code=', e.code, '| message=', String(e.message).split('\n').slice(0, 3).join(' | '));
  }

  await db.$disconnect();

  // ── Phase B: apply the surgical additive fix to the COPY ──
  console.log('\n[B] applying additive ALTERs to the copy...');
  const raw = new DatabaseSync('/home/z/my-project/.test-tmp/e2e-proof.db');
  const before = raw.prepare("SELECT COUNT(*) c FROM UserSession").get().c;
  raw.exec('BEGIN');
  raw.exec('ALTER TABLE "UserSession" ADD COLUMN "rememberMe" BOOLEAN NOT NULL DEFAULT 0');
  raw.exec('ALTER TABLE "UserSession" ADD COLUMN "lastActivityAt" DATETIME');
  raw.exec('ALTER TABLE "UserSession" ADD COLUMN "absoluteExpiresAt" DATETIME');
  raw.exec('UPDATE "UserSession" SET "lastActivityAt" = "createdAt" WHERE "lastActivityAt" IS NULL');
  raw.exec('COMMIT');
  const after = raw.prepare("SELECT COUNT(*) c FROM UserSession").get().c;
  const cols = raw.prepare("PRAGMA table_info('UserSession')").all().map(c => c.name);
  console.log('[B] rows before=', before, 'after=', after, '(unchanged:', before === after, ')');
  console.log('[B] columns now:', cols.join(', '));
  const sample = raw.prepare('SELECT rememberMe, lastActivityAt, absoluteExpiresAt, createdAt FROM UserSession ORDER BY createdAt DESC LIMIT 2').all();
  console.log('[B] sample old rows (backfilled):', JSON.stringify(sample));
  raw.close();

  // ── Phase C: prove createSession + old-row reads work on the PATCHED copy ──
  const db2 = new PrismaClient();
  console.log('\n[C] retrying userSession.create on PATCHED copy...');
  await db2.userSession.create({ data });
  const created = await db2.userSession.findUnique({ where: { refreshToken: data.refreshToken } });
  console.log('[C] create OK. id=', created.id, '| rememberMe=', created.rememberMe, '| lastActivityAt=', created.lastActivityAt.toISOString(), '| absoluteExpiresAt=', created.absoluteExpiresAt.toISOString());

  console.log('\n[C2] reading OLD rows via Prisma (null-handling proof)...');
  const old = await db2.userSession.findMany({
    where: { id: { not: created.id } },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, rememberMe: true, lastActivityAt: true, absoluteExpiresAt: true, expiresAt: true, isRevoked: true },
  });
  for (const s of old) {
    console.log('[C2] id=', s.id.slice(0, 12), '| rememberMe=', s.rememberMe, '| lastActivityAt=', s.lastActivityAt.toISOString(), '| absoluteExpiresAt=', s.absoluteExpiresAt, '(null OK — getSessionState falls back to expiresAt)');
  }

  console.log('\n[C3] getSessionState semantics simulation on an old row...');
  const s = old[0];
  const now = new Date();
  const stateExpired = s.expiresAt <= now;
  const absolute = s.absoluteExpiresAt ?? s.expiresAt;
  console.log('[C3] expiresAt <= now ?', stateExpired, '| absolute ceiling =', absolute.toISOString(), '(fallback OK)');

  await db2.$disconnect();
  console.log('\nPROOF COMPLETE — copy patched, original DB untouched.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
