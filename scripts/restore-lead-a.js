/* eslint-disable no-console */
// Restore Account A's leads + related rows that clear-data (correctly scoped)
// deleted during the E2E run, from the git-committed DB snapshot.
const { PrismaClient } = require('@prisma/client');

const LIVE = new PrismaClient({ datasources: { db: { url: 'file:' + process.cwd() + '/db/custom.db' } } });
const SNAP = new PrismaClient({ datasources: { db: { url: 'file:/tmp/db-at-head.db' } } });

async function main() {
  const userA = await SNAP.user.findUnique({ where: { email: 'mailtoprabhat72@gmail.com' }, select: { id: true } });
  const snapLeads = await SNAP.lead.findMany({ where: { userId: userA.id } });
  const liveLeads = await LIVE.lead.findMany({ where: { userId: userA.id }, select: { id: true } });
  const liveIds = new Set(liveLeads.map(l => l.id));
  const missing = snapLeads.filter(l => !liveIds.has(l.id));
  console.log('snapshot leads:', snapLeads.length, '| live leads:', liveLeads.length, '| to restore:', missing.length);

  for (const lead of missing) {
    const { leadNotes, leadScores, leadAnalysis, activities, followUpReminders, communications, deals, outreachMessages, sequenceEnrollments, conversations, prospectPipelines, ...plain } = lead;
    // strip relations not present as scalar fields
    for (const k of [' leadNotes']) void k;
    await LIVE.lead.create({ data: plain });
    console.log('restored lead:', lead.businessName);

    // related rows
    const acts = await SNAP.leadActivity.findMany({ where: { leadId: lead.id } });
    for (const a of acts) { const { id, ...d } = a; await LIVE.leadActivity.create({ data: { ...d, id } }); }
    const notes = await SNAP.leadNote.findMany({ where: { leadId: lead.id } });
    for (const n of notes) { const { id, ...d } = n; await LIVE.leadNote.create({ data: { ...d, id } }); }
    const scores = await SNAP.leadScore.findMany({ where: { leadId: lead.id } });
    for (const s of scores) { const { id, ...d } = s; await LIVE.leadScore.create({ data: { ...d, id } }); }
    const comms = await SNAP.communication.findMany({ where: { leadId: lead.id } });
    for (const c of comms) { const { id, ...d } = c; await LIVE.communication.create({ data: { ...d, id } }); }
    const reminders = await SNAP.followUpReminder.findMany({ where: { leadId: lead.id } });
    for (const rm of reminders) { const { id, ...d } = rm; await LIVE.followUpReminder.create({ data: { ...d, id } }); }
    const dealsRows = await SNAP.deal.findMany({ where: { leadId: lead.id } });
    for (const dRow of dealsRows) { const { id, ...d } = dRow; await LIVE.deal.create({ data: { ...d, id } }); }
    const analyses = await SNAP.leadAnalysis.findMany({ where: { leadId: lead.id } });
    for (const an of analyses) { const { id, ...d } = an; await LIVE.leadAnalysis.create({ data: { ...d, id } }); }
    const pipelines = await SNAP.prospectPipeline.findMany({ where: { leadId: lead.id } });
    for (const p of pipelines) { const { id, ...d } = p; await LIVE.prospectPipeline.create({ data: { ...d, id } }); }
    console.log(`  + activities=${acts.length} notes=${notes.length} scores=${scores.length} comms=${comms.length} deals=${dealsRows.length}`);
  }

  const nowCount = await LIVE.lead.count({ where: { userId: userA.id } });
  console.log('live leads after restore:', nowCount);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => {
  await LIVE.$disconnect(); await SNAP.$disconnect();
});
