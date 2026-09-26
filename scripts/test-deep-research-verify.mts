// Follow-up verification: §23 honesty re-check + batch completion + credit audit.
// Run: bun run scripts/test-deep-research-verify.mts
/* eslint-disable no-console */
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  const email = 'realtest+signup@example.com';
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error('test user missing');

  // Cleanup leftovers from the timed-out first run (if any)
  const leftovers = await db.lead.findMany({
    where: { userId: user.id, businessName: { in: ['Cavalier Hospital', 'Zxyq Blorptastic Industries', 'Batch Test Cafe'] } },
    select: { id: true, businessName: true },
  });
  if (leftovers.length) {
    const ids = leftovers.map((l) => l.id);
    await db.outreachMessage.deleteMany({ where: { leadId: { in: ids } } });
    await db.leadActivity.deleteMany({ where: { leadId: { in: ids } } });
    await db.prospectPipeline.deleteMany({ where: { leadId: { in: ids } } });
    await db.lead.deleteMany({ where: { id: { in: ids } } });
    console.log('cleaned leftovers:', leftovers.map((l) => l.businessName).join(', '));
  }

  // Offer profile
  const OFFERS = [
    { id: 'o1', label: 'Web Development', category: 'web', description: 'Modern, fast, mobile-friendly websites with booking and lead capture built in' },
    { id: 'o2', label: 'AI Automation', category: 'ai_automation', description: 'AI chatbots, automated lead qualification, follow-up workflows' },
    { id: 'o3', label: 'Digital Marketing', category: 'marketing', description: 'SEO, Google Business optimization and local search visibility' },
  ];
  await db.userSettings.upsert({
    where: { userId: user.id },
    update: { servicesOffered: JSON.stringify(OFFERS) },
    create: { userId: user.id, servicesOffered: JSON.stringify(OFFERS) } as never,
  });

  const creditsBefore = (await db.user.findUnique({ where: { id: user.id } }))!.credits;
  console.log('credits before:', creditsBefore);

  // ── 1. §23 re-check: gibberish lead, quick depth ──
  console.log('\n════ INSUFFICIENT-DATA RE-CHECK (§23) ════');
  const { startProspectPipeline, runProspectPipeline, getLatestPipelineForLead } = await import(
    '../src/lib/prospecting/pipeline'
  );
  const gib = await db.lead.create({
    data: { userId: user.id, businessName: 'Zxyq Blorptastic Industries', website: 'https://nonexistent-zxyq-12345.com', niche: 'Manufacturing', city: 'Unknown City', country: 'Nowhere', source: 'discovery', stage: 'discovered' } as never,
  });
  const s1 = await startProspectPipeline(user.id, gib.id, { depth: 'quick', autoRun: false });
  await runProspectPipeline(s1.pipelineId!);
  const st1 = await getLatestPipelineForLead(gib.id, user.id);
  const strat1 = st1?.match?.strategy;
  console.log('research confidence:', st1?.research?.confidence, '| siteFetched:', st1?.research?.dataSources.websiteFetched, '| searchUsed:', st1?.research?.dataSources.webSearchUsed);
  console.log('insufficientData:', strat1?.qualification.insufficientData);
  console.log('summary:', strat1?.howWeCanHelpSummary?.slice(0, 160));
  console.log('opportunities invented:', strat1?.opportunities.length ?? 0);
  console.log('lead.researchStatus:', (await db.lead.findUnique({ where: { id: gib.id } }))?.researchStatus);

  // ── 2. BATCH: 2 real-site leads at quick depth ──
  console.log('\n════ BATCH RESEARCH (quick) ════');
  const { startBatchResearch, getResearchJobStatus } = await import('../src/lib/prospecting/batch-research');
  const l1 = await db.lead.create({ data: { userId: user.id, businessName: 'Blue Bottle Cafe Test', website: 'https://www.bluebottlecoffee.com', niche: 'Cafe', city: 'San Francisco', country: 'USA', source: 'discovery', stage: 'discovered' } as never });
  const l2 = await db.lead.create({ data: { userId: user.id, businessName: 'Cavalier Hospital Re-Test', website: 'https://cavalierhospital.com', niche: 'Hospital', city: 'Cavalier', country: 'USA', source: 'discovery', stage: 'discovered' } as never });
  const batch = await startBatchResearch(user.id, [l1.id, l2.id], 'quick');
  console.log('batch started:', batch.success, '| job:', batch.jobId, '| total:', batch.total);
  if (batch.jobId) {
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const js = await getResearchJobStatus(batch.jobId!, user.id);
      if (!js) continue;
      console.log(`  poll ${i + 1}: ${js.status} | done=${js.completedCount} failed=${js.failedCount} skipped=${js.skippedCount}/${js.total}`);
      if (js.status === 'completed' || js.status === 'failed') {
        for (const r of js.results) console.log(`   - ${r.businessName}: ${r.status}${r.error ? ` (${r.error.slice(0, 70)})` : ''}`);
        // Show one batch lead's strategy to prove quick runs also produce How-We-Can-Help
        const doneLead = js.results.find((r) => r.status === 'completed');
        if (doneLead) {
          const st = await getLatestPipelineForLead(doneLead.leadId, user.id);
          console.log('\n  sample quick-run output for:', doneLead.businessName);
          console.log('  businessModel:', st?.research?.businessModel?.type ?? 'n/a');
          console.log('  howWeCanHelp:', st?.match?.strategy?.howWeCanHelpSummary?.slice(0, 220));
          console.log('  opportunities:', st?.match?.strategy?.opportunities.length);
          console.log('  researchStatus on lead:', (await db.lead.findUnique({ where: { id: doneLead.leadId } }))?.researchStatus);
        }
        break;
      }
    }
  }

  const creditsAfter = (await db.user.findUnique({ where: { id: user.id } }))!.credits;
  console.log(`\ncredits: before=${creditsBefore} after=${creditsAfter} (spent ${creditsBefore - creditsAfter})`);
  const ledger = await db.creditsLedger.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: { action: true, credits: true, createdAt: true },
  });
  console.log('recent ledger:', ledger.map((l) => `${l.action}:${l.credits}`).join(' | '));

  // ── 3. Cleanup ──
  const allIds = [gib.id, l1.id, l2.id];
  await db.outreachMessage.deleteMany({ where: { leadId: { in: allIds } } });
  await db.leadActivity.deleteMany({ where: { leadId: { in: allIds } } });
  await db.prospectPipeline.deleteMany({ where: { leadId: { in: allIds } } });
  await db.researchJob.deleteMany({ where: { userId: user.id } });
  await db.lead.deleteMany({ where: { id: { in: allIds } } });
  console.log('\ncleanup done (ledger rows kept for audit)');
  await db.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error('VERIFY FAILED:', e); process.exit(1); });
