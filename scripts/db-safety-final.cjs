#!/usr/bin/env node
/** Final DB safety verification — counts + recent-user audit (read-only). */
const { PrismaClient } = require('/home/z/my-project/node_modules/@prisma/client');
const db = new PrismaClient();

async function main() {
  const [users, subs, leads, workflows, businessProfiles] = await Promise.all([
    db.user.count(),
    db.subscription.count(),
    db.lead.count(),
    db.workflowDefinition ? db.workflowDefinition.count() : (db.workflow ? db.workflow.count() : 'n/a'),
    db.businessProfile ? db.businessProfile.count() : 'n/a',
  ]);
  console.log(`users=${users} subscriptions=${subs} leads=${leads} workflows=${workflows} businessProfiles=${businessProfiles}`);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db.user.findMany({
    where: { OR: [{ createdAt: { gte: oneHourAgo } }, { updatedAt: { gte: oneHourAgo } }] },
    select: { email: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  console.log(`\nusers created/updated in last hour (${recent.length}):`);
  for (const u of recent) console.log(`  ${u.email} (created=${u.createdAt.toISOString()}, updated=${u.updatedAt.toISOString()})`);

  const qa = await db.user.findUnique({ where: { email: 'auth-cred-e2e-20261020@acquisitionos.test' }, select: { id: true, email: true, plan: true, role: true, createdAt: true } });
  console.log(`\nQA test account (clearly identified): ${qa ? qa.email + ' id=' + qa.id + ' plan=' + qa.plan + ' role=' + qa.role : 'NOT FOUND'}`);
}
main().catch(e => { console.error('db check error:', e.message); process.exit(1); }).finally(() => db.$disconnect());
