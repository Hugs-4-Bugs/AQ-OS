// Phase 2 E2E: REAL discovery run through the REAL service code path
// (real web_search provider + real LLM extraction + real dedup + real
// persistence + real credit accounting). Run as:
//   bun scripts/phase2-e2e-discovery.ts <niche> <city> <country> <maxResults> <label>
//
// Uses the established pro-qa test account (plan=pro → unlimited lead_discovery
// entitlement; QA credits topped up transparently for this verification).
// processDiscoveryJob returns void — results are read from the DiscoveryJob row
// and the Lead table (the same things the UI's status polling reads).

const [niche, city, country, maxResultsArg, label] = process.argv.slice(2);
if (!niche || !maxResultsArg) {
  console.error('usage: bun scripts/phase2-e2e-discovery.ts <niche> <city> <country> <maxResults> <label>');
  process.exit(1);
}
const maxResults = parseInt(maxResultsArg, 10);
const QA_USER_ID = 'cmv7kyrf20000nau09rowvc6x'; // pro-qa@test. (pro plan)

async function main() {
  const { db } = await import('@/lib/db');
  const { processDiscoveryJob } = await import('@/lib/lead-discovery-service');

  // Snapshot BEFORE (lead ids for later per-job diffing)
  const before = {
    leadIds: new Set((await db.lead.findMany({
      where: { userId: QA_USER_ID }, select: { id: true },
    })).map((l) => l.id)),
    credits: (await db.user.findUnique({ where: { id: QA_USER_ID }, select: { credits: true } }))?.credits,
    jobs: await db.discoveryJob.count({ where: { userId: QA_USER_ID } }),
  };

  // Create the job row exactly as startDiscoveryJob does
  const job = await db.discoveryJob.create({
    data: {
      userId: QA_USER_ID,
      status: 'pending',
      source: 'ai_search',
      niche,
      country: country || '',
      city: city || null,
      totalFound: 0,
      imported: 0,
      duplicates: 0,
      failed: 0,
    },
  });

  const t0 = Date.now();
  console.log(`[E2E ${label}] job=${job.id} niche="${niche}" city="${city}" country="${country}" maxResults=${maxResults}`);
  console.log(`[E2E ${label}] before: leads=${before.leadIds.size} credits=${before.credits} jobs=${before.jobs}`);

  // Run the REAL pipeline (returns void; results land in the DB)
  await processDiscoveryJob(job.id, QA_USER_ID, {
    niche,
    country: country || undefined,
    city: city || undefined,
    source: 'ai_search',
    maxResults,
    criteria: {
      website: 'any',
      excludeTypes: [],
      growthSignals: false,
      hiringSignals: false,
    },
  });

  const elapsedS = ((Date.now() - t0) / 1000).toFixed(1);

  // Snapshot AFTER
  const jobRow = await db.discoveryJob.findUnique({ where: { id: job.id } });
  const afterCredits = (await db.user.findUnique({ where: { id: QA_USER_ID }, select: { credits: true } }))?.credits;
  const allLeads = await db.lead.findMany({
    where: { userId: QA_USER_ID },
    orderBy: { createdAt: 'desc' },
    select: { id: true, businessName: true, website: true, email: true, discoveredVia: true, source: true, verificationStatus: true, city: true, country: true },
  });
  const jobLeads = allLeads.filter((l) => !before.leadIds.has(l.id));

  // Duplicate verification across the leads created by THIS job
  const nameKeys = jobLeads.map((l) => l.businessName.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const dupNames = nameKeys.length - new Set(nameKeys).size;
  const sites = jobLeads
    .map((l) => (l.website || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
    .filter(Boolean);
  const dupSites = sites.length - new Set(sites).size;
  const emails = jobLeads.map((l) => (l.email || '').toLowerCase()).filter(Boolean);
  const dupEmails = emails.length - new Set(emails).size;

  console.log(`\n===== E2E ${label} RESULT =====`);
  console.log(JSON.stringify({
    label,
    niche,
    location: `${city}, ${country}`,
    target: maxResults,
    jobFinal: {
      status: jobRow?.status,
      totalFound: jobRow?.totalFound,
      imported: jobRow?.imported,
      duplicates: jobRow?.duplicates,
      failed: jobRow?.failed,
    },
    newLeadsCreated: jobLeads.length,
    creditsConsumed: (before.credits ?? 0) - (afterCredits ?? 0),
    duplicateNameKeys: dupNames,
    duplicateWebsiteKeys: dupSites,
    duplicateEmailKeys: dupEmails,
    sources: [...new Set(jobLeads.map((l) => l.source))],
    provenanceTagged: jobLeads.filter((l) => l.discoveredVia).length,
    verificationStatuses: jobLeads.reduce((acc, l) => { acc[l.verificationStatus] = (acc[l.verificationStatus] || 0) + 1; return acc; }, {} as Record<string, number>),
    provenanceSample: jobLeads.slice(0, 3).map((l) => ({ name: l.businessName, via: (l.discoveredVia || '').slice(0, 55) })),
    elapsedSeconds: Number(elapsedS),
  }, null, 2));
}

main().catch((err) => {
  console.error(`[E2E] FAILED:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
