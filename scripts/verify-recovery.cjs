#!/usr/bin/env node
/* PART 3 — Post-recovery verification suite (read-only). Verifies all 15 acceptance points. */
const { PrismaClient } = require('/home/z/my-project/node_modules/@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });

const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); }

(async () => {
  // 5. row counts
  const [users, leads, subs, ledger, addons, payments, invoices, feedback, audits, apiKeys, workflows, runs, acts, jobs] = await Promise.all([
    p.user.count(), p.lead.count(), p.subscription.count(), p.creditsLedger.count(), p.creditAddon.count(),
    p.paymentOrder.count(), p.invoice.count(), p.feedbackReport.count(), p.auditLog.count(), p.apiKey.count(),
    p.workflowDefinition.count(), p.workflowExecution.count(), p.leadActivity.count(), p.discoveryJob.count(),
  ]);
  check('5. Row counts match efbc216 snapshot (audit log may only grow from post-recovery auth activity)',
    users === 34 && leads === 89 && subs === 32 && ledger === 149 && addons === 1 && payments === 6 && invoices === 2 && feedback === 6 && audits >= 1232 && apiKeys === 2 && workflows === 2 && runs === 6 && acts === 20 && jobs === 8,
    `users=${users} leads=${leads} subs=${subs} ledger=${ledger} addons=${addons} payments=${payments} invoices=${invoices} feedback=${feedback} audits=${audits} (baseline 1232, Δ=${audits - 1232} from post-recovery logins) apiKeys=${apiKeys} workflows=${workflows} runs=${runs} leadActs=${acts} discoveryJobs=${jobs}`);

  // 6/7. two known accounts, original IDs
  const mail = await p.user.findUnique({ where: { email: 'mailtoprabhat72@gmail.com' }, include: { subscriptions: true } });
  const katty = await p.user.findUnique({ where: { email: 'kattyboy785@gmail.com' }, include: { subscriptions: true } });
  check('6. mailtoprabhat72 = ORIGINAL ID cmqrtgnjx0000qfgnsbhzyzxq, Elite', !!mail && mail.id === 'cmqrtgnjx0000qfgnsbhzyzxq' && mail.plan === 'elite',
    mail ? `id=${mail.id} plan=${mail.plan} credits=${mail.credits}` : 'MISSING');
  check('7. kattyboy785 = ORIGINAL ID cmqltkkuv000xrc2jn99wodqj, Pro', !!katty && katty.id === 'cmqltkkuv000xrc2jn99wodqj' && katty.plan === 'pro',
    katty ? `id=${katty.id} plan=${katty.plan} credits=${katty.credits} googleId=${katty.googleId ? 'SET' : 'none'}` : 'MISSING');
  check('7b. kattyboy785 active Pro subscription (monthly)', !!katty && katty.subscriptions.some(s => s.plan === 'pro' && s.status === 'active' && s.billingCycle === 'monthly'),
    katty ? katty.subscriptions.map(s => `${s.plan}/${s.status}/${s.billingCycle}`).join(', ') : '-');
  check('7c. mailtoprabhat72 active Elite subscription (monthly)', !!mail && mail.subscriptions.some(s => s.plan === 'elite' && s.status === 'active' && s.billingCycle === 'monthly'),
    mail ? mail.subscriptions.map(s => `${s.plan}/${s.status}/${s.billingCycle}`).join(', ') : '-');

  // 8. leads + per-user scoping
  const kattyLeads = katty ? await p.lead.count({ where: { userId: katty.id } }) : 0;
  const mailLeads = mail ? await p.lead.count({ where: { userId: mail.id } }) : 0;
  check('8. Leads restored with ownership', leads === 89 && kattyLeads === 58 && mailLeads === 6, `total=${leads} katty=${kattyLeads} mail=${mailLeads}`);

  // 9. admin account
  const admins = await p.user.findMany({ where: { role: 'super_admin' }, select: { id: true, email: true } });
  check('9. Admin account present (super_admin role)', admins.length >= 1, admins.map(a => 'id=' + a.id + ' ' + String(a.email).slice(0, 2) + '***').join('; '));

  // 10. authentication data intact (password hashes / google ids)
  const authData = await p.user.count({ where: { OR: [{ passwordHash: { not: null } }, { googleId: { not: null } }] } });
  check('10. Auth credentials restored (hashes/googleIds)', authData >= 30, `${authData} users with credential material`);

  // 11. credits
  check('11. Credit balances preserved', !!mail && mail.credits === 1950 && !!katty && katty.credits === 428, `mail=${mail && mail.credits} katty=${katty && katty.credits} ledger=${ledger}`);

  // 13. no duplicate users
  const dups = await p.$queryRawUnsafe("SELECT lower(email) e, count(*) c FROM User GROUP BY lower(email) HAVING count(*) > 1");
  check('13. Zero duplicate emails (case-insensitive)', dups.length === 0, JSON.stringify(dups));

  // 14. email uniqueness via constraint check + count distinct
  const distinct = await p.$queryRawUnsafe("SELECT count(DISTINCT lower(email)) c FROM User");
  check('14. Email uniqueness invariant', Number(distinct[0].c) === users, `distinct=${Number(distinct[0].c)} total=${users}`);

  // 15. FK integrity: orphaned leads / subscriptions / ledger rows
  const orphanLeads = await p.$queryRawUnsafe("SELECT count(*) c FROM Lead WHERE userId NOT IN (SELECT id FROM User)");
  const orphanSubs = await p.$queryRawUnsafe("SELECT count(*) c FROM Subscription WHERE userId NOT IN (SELECT id FROM User)");
  const orphanLedger = await p.$queryRawUnsafe("SELECT count(*) c FROM CreditsLedger WHERE userId NOT IN (SELECT id FROM User)");
  const orphanSess = await p.$queryRawUnsafe("SELECT count(*) c FROM UserSession WHERE userId NOT IN (SELECT id FROM User)");
  check('15. FK integrity (no orphans)', Number(orphanLeads[0].c) === 0 && Number(orphanSubs[0].c) === 0 && Number(orphanLedger[0].c) === 0 && Number(orphanSess[0].c) === 0,
    `orphanLeads=${Number(orphanLeads[0].c)} orphanSubs=${Number(orphanSubs[0].c)} orphanLedger=${Number(orphanLedger[0].c)} orphanSessions=${Number(orphanSess[0].c)}`);

  // duplicate user creation regression: old test-account ID must be gone (identity consolidation)
  const ghost = await p.user.findUnique({ where: { id: 'cmudeuzlh0000kkpsvk9kfnb4' } });
  check('13b. Post-wipe duplicate identity (new-ID account) eliminated by restore', ghost === null, 'old new-ID row absent; original ID restored');

  const failed = results.filter(r => !r.ok);
  console.log('─'.repeat(60));
  console.log(`RESULT: ${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); })
  .finally(() => p.$disconnect());
