// Final batch verification: top up test credits, run a quick batch over 2 leads
// with real websites, and prove: completed statuses, steps 4-5 skipped for quick,
// researchStatus transitions, ledger accounting.
/* eslint-disable no-console */
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  const user = await db.user.findUnique({ where: { email: 'realtest+signup@example.com' } });
  if (!user) throw new Error('test user missing');

  const { addCredits } = await import('../src/lib/credit-service');
  await addCredits({ userId: user.id, amount: 60, source: 'admin', description: 'deep-research batch test top-up' });
  const before = (await db.user.findUnique({ where: { id: user.id } }))!.credits;
  console.log('credits after top-up:', before);

  // Fresh leads with real sites
  const l1 = await db.lead.create({ data: { userId: user.id, businessName: 'Blue Bottle Batch Test', website: 'https://www.bluebottlecoffee.com', niche: 'Cafe', city: 'San Francisco', country: 'USA', source: 'discovery', stage: 'discovered' } as never });
  const l2 = await db.lead.create({ data: { userId: user.id, businessName: 'Cavalier Batch Test', website: 'https://cavalierhospital.com', niche: 'Hospital', city: 'Cavalier', country: 'USA', source: 'discovery', stage: 'discovered' } as never });

  const { startBatchResearch, getResearchJobStatus } = await import('../src/lib/prospecting/batch-research');
  const batch = await startBatchResearch(user.id, [l1.id, l2.id], 'quick');
  console.log('batch started:', batch.success, '| total:', batch.total);
  if (!batch.jobId) process.exit(1);

  let finalState: Awaited<ReturnType<typeof getResearchJobStatus>> = null;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const js = await getResearchJobStatus(batch.jobId!, user.id);
    if (!js) continue;
    finalState = js;
    console.log(`  poll ${i + 1}: ${js.status} | done=${js.completedCount} failed=${js.failedCount} skipped=${js.skippedCount}/${js.total}`);
    if (js.status === 'completed' || js.status === 'failed') {
      for (const r of js.results) console.log(`   - ${r.businessName}: ${r.status}${r.error ? ` (${r.error.slice(0, 60)})` : ''}`);
      break;
    }
  }

  // Prove quick runs: strategy present, pitch/email skipped, statuses right
  const { getLatestPipelineForLead } = await import('../src/lib/prospecting/pipeline');
  for (const id of [l1.id, l2.id]) {
    const lead = await db.lead.findUnique({ where: { id } });
    const st = await getLatestPipelineForLead(id, user.id);
    if (!st) { console.log(`\n${lead?.businessName}: no pipeline (status=${lead?.researchStatus})`); continue; }
    console.log(`\n── ${lead?.businessName} (depth=${st.depth}, ${st.status}) ──`);
    console.log('  stepStatus:', JSON.stringify(st.stepStatus));
    console.log('  researchStatus:', lead?.researchStatus);
    console.log('  businessModel:', st.research?.businessModel?.type ?? 'n/a', '| confidence:', st.research?.confidence);
    console.log('  gaps:', st.gaps?.gaps.length, '| strategy version:', st.match?.strategy?.strategyVersion ?? 'none');
    console.log('  outreachPotential:', st.match?.strategy?.qualification.outreachPotential ?? 'n/a');
    console.log('  howWeCanHelp:', st.match?.strategy?.howWeCanHelpSummary?.slice(0, 200));
    console.log('  pitch/email (should be null for quick):', st.pitch === null, '/', st.email === null);
  }

  const after = (await db.user.findUnique({ where: { id: user.id } }))!.credits;
  console.log(`\ncredits: before=${before} after=${after} (spent ${before - after}; expected 10 = 2 quick runs)`);

  // Cleanup test artifacts
  const ids = [l1.id, l2.id];
  await db.outreachMessage.deleteMany({ where: { leadId: { in: ids } } });
  await db.leadActivity.deleteMany({ where: { leadId: { in: ids } } });
  await db.prospectPipeline.deleteMany({ where: { leadId: { in: ids } } });
  await db.researchJob.deleteMany({ where: { userId: user.id } });
  await db.lead.deleteMany({ where: { id: { in: ids } } });
  console.log('cleanup done');
  await db.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
