// Run the real discovery pipeline IN-PROCESS for full log visibility.
// Uses the actual startDiscoveryJob + processDiscoveryJob code path.
import 'dotenv/config';

async function main() {
  const { startDiscoveryJob } = await import('../src/lib/lead-discovery-service');
  const { db } = await import('../src/lib/db');

  const USER_ID = 'cmuf3wyij0000n3p9dhtqqzjq'; // discover-e2e@example.com (pro, temp)

  // Clean previous E2E test leads for this user so reruns stay clean
  const old = await (db as any).lead.deleteMany({ where: { userId: USER_ID, source: 'ai_search', stage: 'discovered' } });
  console.log(`[e2e] removed ${old.count} previous e2e leads`);

  const result = await startDiscoveryJob(
    USER_ID,
    {
      niche: 'b2b saas',
      country: 'USA',
      source: 'ai_search',
      maxResults: 20,
      requirements:
        'actively growing, professional website, investing in sales or marketing, founder/CEO/Head of Sales involved in acquiring customers, recent growth or hiring signals, need help improving client acquisition process',
      criteria: {
        employeeMin: 20,
        employeeMax: 200,
        exactEmployeeCount: undefined,
        website: 'required',
        excludeTypes: ['agency', 'freelancer', 'consultant'],
        growthSignals: true,
        hiringSignals: true,
      },
    },
    undefined
  );

  console.log('[e2e] started:', result);

  const jobId = result.jobId;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    const job = await (db as any).discoveryJob.findUnique({ where: { id: jobId } });
    console.log(`[e2e ${i * 15}s] status=${job.status} imported=${job.imported} filtered=${job.filteredOut}`);
    if (job.status === 'completed' || job.status === 'failed') {
      console.log('[e2e] errorMessage:', job.errorMessage);
      const leads = JSON.parse(job.resultData || '[]');
      console.log(`[e2e] FINAL: ${leads.length} resultData leads`);
      for (const l of leads) {
        console.log(`   - ${l.businessName} | count:${l.employeeCount} | range:${l.employeeRange} | site:${l.website || '-'} | ${l.city ?? ''},${l.country ?? ''}`);
      }
      break;
    }
  }
  await (db as any).$disconnect();
}

main().catch((e) => {
  console.error('[e2e] FATAL:', e);
  process.exit(1);
});
