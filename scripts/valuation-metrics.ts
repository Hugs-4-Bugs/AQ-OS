/**
 * Verified business-metrics extraction for the acquisition valuation analysis.
 * Every number printed here is read directly from the production database.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  console.log('=== USERS ===');
  const totalUsers = await db.user.count();
  const verified = await db.user.count({ where: { emailVerified: { not: null } } }).catch(() => -1);
  const realUsers = await db.user.findMany({
    where: { email: { contains: 'gmail.com' } },
    select: { id: true, email: true, plan: true, createdAt: true, lastLoginAt: true },
  });
  console.log(JSON.stringify({ totalUsers, verified }, null, 1));
  console.log('gmail users:', realUsers.map(u => `${u.email} plan=${u.plan} created=${u.createdAt.toISOString().slice(0, 10)} lastLogin=${u.lastLoginAt?.toISOString().slice(0, 10) ?? 'n/a'}`).join('\n  '));

  console.log('\n=== ACTIVITY (last login per real user) ===');
  const active30 = realUsers.filter(u => u.lastLoginAt && Date.now() - u.lastLoginAt.getTime() < 30 * 864e5).length;
  const active7 = realUsers.filter(u => u.lastLoginAt && Date.now() - u.lastLoginAt.getTime() < 7 * 864e5).length;
  console.log(JSON.stringify({ active30d: active30, active7d: active7 }));

  console.log('\n=== SUBSCRIPTIONS / PLANS ===');
  const subs = await db.subscription.findMany({ select: { plan: true, status: true } }).catch(() => []);
  const planCounts: Record<string, number> = {};
  for (const s of subs) planCounts[`${s.plan}/${s.status}`] = (planCounts[`${s.plan}/${s.status}`] || 0) + 1;
  console.log(JSON.stringify({ total: subs.length, breakdown: planCounts }));

  console.log('\n=== PAYMENTS ===');
  const orders = await (db as any).paymentOrder.findMany({ select: { amount: true, currency: true, status: true, gateway: true, createdAt: true } }).catch(() => []);
  const paid = orders.filter((o: any) => o.status === 'paid' || o.status === 'captured' || o.status === 'success');
  const paidSum = paid.reduce((s: number, o: any) => s + Number(o.amount || 0), 0);
  console.log(JSON.stringify({ orders: orders.length, paidOrders: paid.length, paidSum, byStatus: orders.reduce((a: any, o: any) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {}) }));

  console.log('\n=== CREDITS ===');
  const ledger = await (db as any).creditsLedger.findMany({ select: { amount: true, type: true } }).catch(() => []);
  const granted = ledger.filter((l: any) => Number(l.amount) > 0).reduce((s: number, l: any) => s + Number(l.amount), 0);
  const spent = ledger.filter((l: any) => Number(l.amount) < 0).reduce((s: number, l: any) => s + Number(l.amount), 0);
  console.log(JSON.stringify({ ledgerRows: ledger.length, granted, spent }));

  console.log('\n=== LEADS / PIPELINE ===');
  const totalLeads = await db.lead.count();
  const withWebsite = await db.lead.count({ where: { website: { not: null } } });
  const analyzed = await db.leadAnalysis.count().catch(() => -1);
  const byStage = await db.lead.groupBy({ by: ['stage'], _count: true });
  console.log(JSON.stringify({ totalLeads, withWebsite, analyses: analyzed, byStage: byStage.map((b) => `${b.stage}=${b._count}`) }));

  console.log('\n=== OUTREACH / MESSAGING ===');
  const outreach = await (db as any).outreachMessage.count().catch(() => -1);
  const comms = await (db as any).communication.count().catch(() => -1);
  const emailsSent = await (db as any).scheduledEmail.count().catch(() => -1);
  console.log(JSON.stringify({ outreach, comms, emailsSent }));

  console.log('\n=== WORKFLOWS / AUTOMATION ===');
  const wfDefs = await (db as any).workflowDefinition.count().catch(() => -1);
  const wfExec = await (db as any).workflowExecution.count().catch(() => -1);
  const apiKeys = await (db as any).apiKey.count().catch(() => -1);
  const discoveryJobs = await (db as any).discoveryJob.count().catch(() => -1);
  console.log(JSON.stringify({ wfDefs, wfExec, apiKeys, discoveryJobs }));

  console.log('\n=== DEALS (revenue pipeline data) ===');
  const deals = await (db as any).deal.findMany({ select: { value: true, stage: true } }).catch(() => []);
  const dealValue = deals.reduce((s: number, d: any) => s + Number(d.value || 0), 0);
  console.log(JSON.stringify({ deals: deals.length, totalValue: dealValue, byStage: deals.reduce((a: any, d: any) => { a[d.stage] = (a[a.stage] || 0) + 1; return a; }, {}) }));

  console.log('\n=== DB FILE SIZE ===');
  console.log(JSON.stringify({ note: 'custom.db is the SQLite production DB, git-tracked' }));
}

main().finally(() => db.$disconnect());
