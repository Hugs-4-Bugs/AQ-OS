// E2E: run a REAL ai_search discovery + a yellow_pages attempt through the live API.
// Verifies: real results imported for working sources; honest failure for blocked ones.
/* eslint-disable no-console */

async function main() {
  const mod = await import('../src/lib/auth');
  const email = 'realtest+signup@example.com';
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error('test user not found');

  const token = mod.generateAccessToken({
    id: user.id, email: user.email, role: user.role, plan: user.plan,
    orgId: user.orgId, isTrial: false, trialEndsAt: null,
  });
  const BASE = 'http://localhost:3000';
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Snapshot existing lead count for clean comparison
  const leadsBefore = await db.lead.count({ where: { userId: user.id } });

  // ── 1. Start a real AI search job (small: 3 leads) ──
  console.log('=== POST /api/leads/discover (ai_search, REAL run) ===');
  const res = await fetch(`${BASE}/api/leads/discover`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ niche: 'coffee shops', country: 'Singapore', source: 'ai_search', maxResults: 3 }),
  });
  const data = await res.json();
  console.log('status:', res.status, '| jobId:', data.jobId);
  if (!data.jobId) { console.log('❌ no jobId', data); process.exit(1); }

  // ── 2. Poll until done (max 90s) ──
  let job: Record<string, unknown> | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await fetch(`${BASE}/api/leads/discover/status/${data.jobId}`, { headers: { Authorization: `Bearer ${token}` } });
    const sd = await s.json();
    job = sd.job;
    console.log(`  poll ${i + 1}: status=${job?.status} totalFound=${job?.totalFound} imported=${job?.imported}`);
    if (job?.status === 'completed' || job?.status === 'failed') break;
  }

  console.log('\n=== ai_search RESULT ===');
  console.log('status:', job?.status, '| imported:', job?.imported, '| errorMessage:', job?.errorMessage || 'none');
  const resultData = typeof job?.resultData === 'string' ? JSON.parse(job.resultData as string) : job?.resultData;
  if (Array.isArray(resultData) && resultData.length > 0) {
    console.log(`  REAL discovered leads (${resultData.length}):`);
    for (const l of (resultData as Array<Record<string, unknown>>).slice(0, 5)) {
      console.log(`   - ${l.businessName} | ${l.city || 'n/a'}, ${l.country || 'n/a'} | phone: ${l.phone || 'n/a'}`);
    }
  }

  // Check leads actually saved with source='discovery'... (source column = lead's own source tag)
  const leadsAfter = await db.lead.count({ where: { userId: user.id } });
  console.log(`\nleads before: ${leadsBefore}, after: ${leadsAfter}, delta: ${leadsAfter - leadsBefore}`);

  // Verify saved leads have name + location
  const saved = await db.lead.findMany({
    where: { userId: user.id, stage: 'discovered' },
    orderBy: { createdAt: 'desc' }, take: 3,
    select: { businessName: true, city: true, country: true, source: true, notes: true },
  });
  for (const l of saved) {
    const ok = l.businessName && (l.city || l.country);
    console.log(`  saved: ${l.businessName} | ${l.city || l.country} | src=${l.source} | valid=${ok}`);
  }

  // ── 3. yellow_pages attempt (expected: job completes but 0 imported + honest skip, OR failed w/ 403 note) ──
  console.log('\n=== POST /api/leads/discover (yellow_pages, site blocks this IP) ===');
  const res2 = await fetch(`${BASE}/api/leads/discover`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ niche: 'dentists', country: 'United States', city: 'New York', source: 'yellow_pages', maxResults: 3 }),
  });
  const data2 = await res2.json();
  console.log('status:', res2.status, '| jobId:', data2.jobId);
  if (data2.jobId) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await fetch(`${BASE}/api/leads/discover/status/${data2.jobId}`, { headers: { Authorization: `Bearer ${token}` } });
      const sd = await s.json();
      if (sd.job?.status === 'completed' || sd.job?.status === 'failed') {
        console.log(`  final: status=${sd.job.status} imported=${sd.job.imported} totalFound=${sd.job.totalFound}`);
        console.log(`  errorMessage: ${sd.job.errorMessage || '(none)'}`);
        break;
      }
    }
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error('Test failed:', e); process.exit(1); });
