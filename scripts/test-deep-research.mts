// ═══════════════════════════════════════════════════════════════════
// E2E DEMO — Deep Company Research + How-We-Can-Help intelligence
//
// Demonstrates with REAL test leads:
//   Lead → Company Understanding → Evidence → Opportunity →
//   How We Can Help → Service Mapping → Outreach Angle →
//   Personalized Message
//
// Also verifies: insufficient-data honesty (§23), batch research (§15-16),
// research statuses, and credit bookkeeping.
// Run: bun run scripts/test-deep-research.mts
// ═══════════════════════════════════════════════════════════════════
/* eslint-disable no-console */

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();

  // ── 0. Test user + offer profile (the USER's services) ──
  const email = 'realtest+signup@example.com';
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.log('test user missing — creating minimal user record');
    user = await db.user.create({
      data: {
        email,
        name: 'Deep Research Tester',
        plan: 'pro',
        credits: 500,
      } as never,
    });
  }
  console.log(`test user: ${user.id} | credits: ${user.credits}`);

  const OFFERS = [
    { id: 'o1', label: 'Web Development', category: 'web', description: 'Modern, fast, mobile-friendly websites with booking and lead capture built in' },
    { id: 'o2', label: 'AI Automation', category: 'ai_automation', description: 'AI chatbots, automated lead qualification, follow-up workflows and internal assistants' },
    { id: 'o3', label: 'Digital Marketing', category: 'marketing', description: 'SEO, Google Business optimization and local search visibility' },
  ];
  await db.userSettings.upsert({
    where: { userId: user.id },
    update: { servicesOffered: JSON.stringify(OFFERS) },
    create: { userId: user.id, servicesOffered: JSON.stringify(OFFERS) } as never,
  });
  console.log('offer profile set:', OFFERS.map((o) => o.label).join(', '));

  // ── 1. Create REAL test leads (probe websites for reachability) ──
  const { fetchPageText } = await import('../src/lib/prospecting/website-fetch');

  const candidates = [
    { name: 'Cavalier Hospital', site: 'https://cavalierhospital.com', fallbacks: ['https://www.apollohospitals.com', 'https://www.fortishealthcare.com', 'https://www.narayanahealth.org'] },
  ];
  let realSite: string | null = null;
  let realName = 'Cavalier Hospital';
  for (const c of candidates) {
    const probe = await fetchPageText(c.site).catch(() => null);
    if (probe?.ok) { realSite = c.site; realName = c.name; break; }
    for (const f of c.fallbacks) {
      const p2 = await fetchPageText(f).catch(() => null);
      if (p2?.ok) { realSite = f; realName = f === 'https://www.apollohospitals.com' ? 'Apollo Hospitals' : f === 'https://www.fortishealthcare.com' ? 'Fortis Healthcare' : 'Narayana Health'; break; }
    }
    if (realSite) break;
  }
  console.log(`real site selected: ${realSite ?? 'NONE reachable'}`);

  const leadsData = [
    { businessName: realName, website: realSite, niche: 'Hospital', city: 'Bangalore', country: 'India' },
    // Insufficient-data case: fake site + gibberish name (§23 honesty)
    { businessName: 'Zxyq Blorptastic Industries', website: 'https://nonexistent-zxyq-12345.com', niche: 'Manufacturing', city: 'Unknown City', country: 'Nowhere' },
  ];

  const leadIds: string[] = [];
  for (const ld of leadsData) {
    const lead = await db.lead.create({
      data: {
        userId: user.id,
        businessName: ld.businessName,
        website: ld.website,
        niche: ld.niche,
        city: ld.city,
        country: ld.country,
        source: 'discovery',
        stage: 'discovered',
      } as never,
    });
    leadIds.push(lead.id);
    console.log(`lead created: ${lead.businessName} (${lead.id})`);
  }

  const creditsBefore = (await db.user.findUnique({ where: { id: user.id } }))!.credits;

  // ── 2. DEEP pipeline on the real lead (awaited, step-by-step) ──
  console.log('\n════════ DEEP RESEARCH RUN (real lead) ════════');
  const { startProspectPipeline, runProspectPipeline, getLatestPipelineForLead } = await import(
    '../src/lib/prospecting/pipeline'
  );
  const started = await startProspectPipeline(user.id, leadIds[0], { depth: 'deep', autoRun: false });
  if (!started.success || !started.pipelineId) {
    throw new Error(`pipeline start failed: ${started.error}`);
  }
  await runProspectPipeline(started.pipelineId);
  const state = await getLatestPipelineForLead(leadIds[0], user.id);
  if (!state) throw new Error('no pipeline state');

  console.log(`\npipeline status: ${state.status} | depth: ${state.depth} | progress: ${state.progress}%`);
  console.log('step states:', JSON.stringify(state.stepStatus));
  console.log(`temperature: ${state.temperature} | overall match: ${state.overallScore}`);

  if (state.research) {
    const r = state.research;
    console.log('\n── COMPANY UNDERSTANDING (§3) ──');
    console.log('summary:', r.summary);
    console.log('industry:', r.industry, '/', r.subIndustry);
    console.log('businessModel:', r.businessModel?.type, `(${r.businessModel?.confidence}) —`, r.businessModel?.explanation);
    if (r.companySummary) {
      console.log('whatTheySell:', r.companySummary.whatTheySell);
      console.log('whoTheyServe:', r.companySummary.whoTheyServe);
      console.log('howTheyMakeMoney:', r.companySummary.howTheyMakeMoney);
      console.log('primaryMarket:', r.companySummary.primaryMarket);
    }
    console.log('techStack:', r.techStack.join(', '));
    console.log('teamSize:', r.teamSizeEstimate, '| revenue:', r.revenueEstimate);
    console.log('\n── EVIDENCE (§10) ──');
    for (const e of r.evidence || []) {
      console.log(`  [${e.kind}] ${e.claim}  (${e.source})`);
    }
    console.log('unknowns:', (r.unknowns || []).join(' | ') || 'none');
  }

  if (state.gaps) {
    console.log('\n── DETECTED GAPS (measured) ──');
    for (const g of state.gaps.gaps.slice(0, 5)) {
      console.log(`  [${g.severity}] ${g.gap} — evidence: ${g.evidence.slice(0, 90)}`);
    }
  }

  if (state.match?.strategy) {
    const s = state.match.strategy;
    console.log('\n── HOW WE CAN HELP (§7) ──');
    console.log(s.howWeCanHelpSummary);
    console.log('\n── OPPORTUNITIES (§6) ──');
    for (const o of s.opportunities) {
      console.log(`  ★ ${o.title} [${o.category}] (confidence ${o.confidence}, service: ${o.relevantService})`);
      console.log(`     observed: ${o.observed.join(' | ')}`);
      if (o.inferred.length) console.log(`     inferred: ${o.inferred.join(' | ')}`);
      console.log(`     solution: ${o.potentialSolution}`);
      if (o.expectedImpact.length) console.log(`     impact: ${o.expectedImpact.join('; ')}`);
    }
    console.log('\n── SERVICE MAPPING (§8) ──');
    console.log(' ', s.serviceMapping?.primaryService, '| secondary:', s.serviceMapping?.secondaryServices.join(', '), `(${s.serviceMapping?.confidence})`);
    console.log('  reason:', s.serviceMapping?.reason);
    console.log('\n── PRIORITIZATION (§9) ──');
    console.log('  primary:', s.prioritization?.primary);
    console.log('  why:', s.prioritization?.whyPrimary);
    console.log('  secondary:', s.prioritization?.secondary.join(', ') || 'none');
    console.log('  doNotPitch:', s.prioritization?.doNotPitch.join(', ') || 'none');
    console.log('\n── DECISION MAKER (§11) ──');
    console.log('  name:', s.decisionMaker?.name, '| role:', s.decisionMaker?.role);
    console.log('  why:', s.decisionMaker?.whyThisPerson);
    console.log('  relevance:', s.decisionMaker?.relevanceToOpportunity);
    console.log('\n── OUTREACH ANGLE (§13) ──');
    console.log('  primary angle:', s.angles?.primaryAngle, '—', s.angles?.whyThisAngle);
    for (const a of s.angles?.angles || []) console.log(`  [${a.type}] ${a.statement}`);
    console.log('\n── QUALIFICATION (§20) ──');
    console.log('  outreachPotential:', s.qualification.outreachPotential, '| researchComplete:', s.qualification.researchComplete, '| insufficientData:', s.qualification.insufficientData);
    console.log('  disqualifiers:', s.qualification.disqualifiers.join('; ') || 'none');
  } else {
    console.log('\n⚠ no strategy object on match');
  }

  if (state.pitch) {
    console.log('\n── PERSONALIZED PITCH (§12) ──');
    console.log('headline:', state.pitch.headline);
    console.log('pitch:', state.pitch.pitch);
    console.log('projected:', state.pitch.projectedOutcome);
  }
  if (state.email) {
    console.log('\n── PERSONALIZED EMAIL (§12) ──');
    console.log('subject:', state.email.subject);
    console.log('body:', state.email.body);
    console.log('cta:', state.email.cta);
  }

  const leadAfter = await db.lead.findUnique({ where: { id: leadIds[0] } });
  console.log('\nlead.researchStatus:', leadAfter?.researchStatus);
  const draft = await db.outreachMessage.findFirst({ where: { leadId: leadIds[0], status: 'draft' }, orderBy: { createdAt: 'desc' } });
  console.log('outreach draft created:', !!draft, '| subject:', draft?.subject);

  // ── 3. Insufficient-data honesty check (§23) ──
  console.log('\n════════ INSUFFICIENT-DATA RUN (gibberish lead) ════════');
  const started2 = await startProspectPipeline(user.id, leadIds[1], { depth: 'quick', autoRun: false });
  if (started2.success && started2.pipelineId) {
    await runProspectPipeline(started2.pipelineId);
    const state2 = await getLatestPipelineForLead(leadIds[1], user.id);
    console.log('status:', state2?.status);
    console.log('research confidence:', state2?.research?.confidence, '| webSearchUsed:', state2?.research?.dataSources.webSearchUsed, '| websiteFetched:', state2?.research?.dataSources.websiteFetched);
    const s2 = state2?.match?.strategy;
    console.log('insufficientData:', s2?.qualification.insufficientData);
    console.log('summary:', s2?.howWeCanHelpSummary?.slice(0, 200));
    console.log('opportunities invented:', s2?.opportunities.length ?? 'n/a');
    const lead2 = await db.lead.findUnique({ where: { id: leadIds[1] } });
    console.log('lead.researchStatus:', lead2?.researchStatus);
  } else {
    console.log('start failed:', started2.error);
  }

  // ── 4. BATCH research (§15-16): quick-depth batch over both leads ──
  console.log('\n════════ BATCH RESEARCH (quick, 2 leads) ════════');
  const { startBatchResearch, getResearchJobStatus } = await import('../src/lib/prospecting/batch-research');
  const batchLead1 = await db.lead.create({
    data: { userId: user.id, businessName: 'Batch Test Cafe', website: 'https://www.bluebottlecoffee.com', niche: 'Cafe', city: 'San Francisco', country: 'USA', source: 'discovery', stage: 'discovered' } as never,
  });
  const batch = await startBatchResearch(user.id, [leadIds[0], batchLead1.id], 'quick');
  console.log('batch start:', batch.success, 'job:', batch.jobId, 'total:', batch.total);
  if (batch.jobId) {
    // wait for completion (max ~4 min)
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const js = await getResearchJobStatus(batch.jobId!, user.id);
      if (!js) continue;
      console.log(`  poll ${i + 1}: ${js.status} | done=${js.completedCount} failed=${js.failedCount} skipped=${js.skippedCount}/${js.total}`);
      if (js.status === 'completed' || js.status === 'failed') {
        for (const r of js.results) console.log(`   - ${r.businessName}: ${r.status}${r.error ? ` (${r.error.slice(0, 60)})` : ''}`);
        break;
      }
    }
  }

  const userAfter = (await db.user.findUnique({ where: { id: user.id } }))!;
  console.log(`\ncredits: before=${creditsBefore} after=${userAfter.credits} (spent ${creditsBefore - userAfter.credits})`);

  // ── 5. Cleanup test data ──
  const allTestLeadIds = [...leadIds, batchLead1.id];
  await db.outreachMessage.deleteMany({ where: { leadId: { in: allTestLeadIds } } });
  await db.leadActivity.deleteMany({ where: { leadId: { in: allTestLeadIds } } });
  await db.prospectPipeline.deleteMany({ where: { leadId: { in: allTestLeadIds } } });
  await db.lead.deleteMany({ where: { id: { in: allTestLeadIds } } });
  console.log('\ntest leads + artifacts cleaned up (credits ledger kept for audit)');

  await db.$disconnect();
  console.log('\nE2E DEEP-RESEARCH DEMO COMPLETE');
  process.exit(0);
}

main().catch((e) => {
  console.error('E2E FAILED:', e);
  process.exit(1);
});
