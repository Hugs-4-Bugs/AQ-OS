// E2E test of the live API: mint an access token for an existing user,
// then hit GET /api/discovery/sources and POST /api/leads/discover.
/* eslint-disable no-console */

async function main() {
  const mod = await import('../src/lib/auth');
  const email = 'realtest+signup@example.com';

  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error('test user not found');
  await db.$disconnect();

  const token = mod.generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    orgId: user.orgId,
    isTrial: false,
    trialEndsAt: null,
  });

  const BASE = 'http://localhost:3000';

  // ── 1. GET /api/discovery/sources ──
  console.log('\n=== GET /api/discovery/sources ===');
  const res1 = await fetch(`${BASE}/api/discovery/sources`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('status:', res1.status);
  const data1 = await res1.json();
  if (res1.ok) {
    for (const s of data1.sources) {
      console.log(`  [${String(s.status).padEnd(15)}] ${s.id.padEnd(16)} noSetup=${s.noSetupRequired}`);
    }
  }

  // ── 2. POST /api/leads/discover with unconfigured source (google_maps) ──
  console.log('\n=== POST /api/leads/discover (google_maps, unconfigured) ===');
  const res2 = await fetch(`${BASE}/api/leads/discover`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ niche: 'dentists', country: 'India', city: 'Mumbai', source: 'google_maps', maxResults: 5 }),
  });
  console.log('status:', res2.status, '(expect 400)');
  const data2 = await res2.json();
  console.log('error:', data2.error);
  if (!String(data2.error).includes('requires API configuration')) {
    console.log('❌ FAIL: expected exact config message');
    process.exit(1);
  }

  // ── 3. Confirm zero discovery jobs were created by this test ──
  console.log('\n=== Confirm no discovery jobs created for unconfigured source ===');
  const { default: Prisma } = await import('@prisma/client');
  const db2 = new Prisma.PrismaClient();
  const jobs = await db2.discoveryJob.count({ where: { userId: user.id, source: 'google_maps' } });
  console.log(`google_maps jobs for user: ${jobs} (expect 0)`);
  await db2.$disconnect();
  if (jobs !== 0) {
    console.log('❌ FAIL: job was created for unconfigured source');
    process.exit(1);
  }

  console.log('\n✅ E2E PREFLIGHT TESTS PASSED — no fake data possible for unconfigured sources');
  process.exit(0);
}

main().catch((e) => { console.error('Test failed:', e); process.exit(1); });
