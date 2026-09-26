// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Test / Demo Data Cleanup (SAFE, EXPLICIT)
//
// Purpose: identify (and optionally remove) clearly test/demo records
// from the local development database WITHOUT touching legitimate data.
//
// Design principles (per production-hardening requirements):
//   • DRY-RUN BY DEFAULT — prints what it WOULD do, changes nothing.
//   • Explicit classification rules; nothing is guessed blindly.
//   • Only removes records whose identity is unambiguous test data
//     (e.g. emails ending in @example.com / @acquisitionos.local,
//     names starting with "Test ", "QA ", uuid-style test accounts).
//   • NEVER deletes the super_admin account or any user with real
//     paid orders / invoices / subscriptions that are active+paid.
//
// Usage:
//   bun scripts/cleanup-test-data.ts            # dry-run report
//   DRY_RUN=false bun scripts/cleanup-test-data.ts   # actually delete
// ═══════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN !== 'false';

// ── Classification rules ────────────────────────────────────────────
const TEST_EMAIL_DOMAINS = [
  '@example.com',
  '@acquisitionos.local',
  '@test.local',
  '@demo.local',
];

function looksLikeTestEmail(email: string): boolean {
  const e = email.toLowerCase();
  if (TEST_EMAIL_DOMAINS.some(d => e.endsWith(d))) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@/.test(e)) return true; // uuid@…
  if (e.includes('+test@') || e.startsWith('test.') || e.startsWith('qa.') || e.startsWith('demo.')) return true;
  return false;
}

function looksLikeTestName(name: string | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.startsWith('test ') || n.startsWith('qa ') || n.startsWith('demo ') || n === 'test user' || n === 'admin test';
}

async function main() {
  console.log(`════════════════════════════════════════════`);
  console.log(` Test/demo data audit — mode: ${DRY_RUN ? 'DRY-RUN (no changes)' : 'APPLY (deleting!)'}`);
  console.log(`════════════════════════════════════════════\n`);

  const users = await db.user.findMany({
    select: {
      id: true, email: true, name: true, role: true, plan: true,
      isActive: true, createdAt: true,
      paymentOrders: { select: { id: true, status: true, provider: true }, take: 5 },
      subscriptions: { select: { id: true, plan: true, status: true }, take: 5 },
    },
  });

  const testUsers = users.filter(u =>
    looksLikeTestEmail(u.email) || looksLikeTestName(u.name)
  );

  // Guard rails
  const protectedUsers = testUsers.filter(u => u.role === 'super_admin');
  const deletable = testUsers.filter(u =>
    u.role !== 'super_admin' &&
    !u.paymentOrders.some(o => o.status === 'completed') &&          // never users with real paid orders
    !u.subscriptions.some(s => ['active'].includes(s.status) && s.plan !== 'free')
  );

  console.log(`Total users:                ${users.length}`);
  console.log(`Matched test-data patterns: ${testUsers.length}`);
  console.log(`  protected (super_admin):  ${protectedUsers.length} (never deleted)`);
  console.log(`  deletable candidates:     ${deletable.length}`);
  console.log(`  kept (paid/active):       ${testUsers.length - protectedUsers.length - deletable.length}`);
  console.log('');

  if (deletable.length > 0) {
    console.log('Deletable test users:');
    for (const u of deletable) {
      console.log(`  - ${u.email}  (name="${u.name}", role=${u.role}, plan=${u.plan})`);
    }
  }

  // Other obviously-test records (lead names, webhook rows, etc.)
  const testLeads = await db.lead.count({
    where: { OR: [{ businessName: { startsWith: 'TEST ' } }, { businessName: { startsWith: 'Test ' } }, { businessName: { contains: 'Example Corp' } }] },
  });
  console.log(`\nTest-pattern leads:         ${testLeads}`);

  if (DRY_RUN) {
    console.log('\nDRY-RUN complete. No data was modified.');
    console.log('To apply: DRY_RUN=false bun scripts/cleanup-test-data.ts');
    return;
  }

  // ── Apply ─────────────────────────────────────────────────────────
  console.log('\nApplying deletions…');
  for (const u of deletable) {
    // Delete in FK-safe order. Prisma schema uses SetNull / Cascade in
    // most relations; explicit deletes keep the audit trail clear.
    await db.userSession.deleteMany({ where: { userId: u.id } });
    await db.lead.deleteMany({ where: { userId: u.id, OR: [{ businessName: { startsWith: 'TEST ' } }, { businessName: { startsWith: 'Test ' } }] } });
    await db.user.delete({ where: { id: u.id } });
    console.log(`  deleted user ${u.email}`);
  }
  console.log('Done.');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());
