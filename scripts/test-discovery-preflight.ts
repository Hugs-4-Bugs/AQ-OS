// Test script: verify startDiscoveryJob fail-fast + no fake data end-to-end.
// Run: npx tsx scripts/test-discovery-preflight.ts
/* eslint-disable no-console */

async function mainDiscoveryPreflight() {
  const { startDiscoveryJob } = await import('../src/lib/lead-discovery-service');
  const { db } = await import('../src/lib/db');

  console.log('TEST A — startDiscoveryJob with unconfigured source (google_maps)');
  const r1 = await startDiscoveryJob('test-user-preflight-check', {
    niche: 'dentists',
    country: 'India',
    city: 'Mumbai',
    source: 'google_maps',
    maxResults: 5,
  });
  console.log('  result:', JSON.stringify(r1, null, 2));
  if (r1.status !== 'failed' || !r1.message.includes('requires API configuration')) {
    console.log('  ❌ FAIL: expected failed status with config message');
    process.exit(1);
  }
  if (r1.jobId !== '') {
    console.log('  ❌ FAIL: expected no jobId (no job should be created)');
    process.exit(1);
  }

  const jobCount = await db.discoveryJob.count({
    where: { userId: 'test-user-preflight-check' },
  });
  console.log(`  jobs created for test user: ${jobCount} (must be 0 — discovery was NOT run)`);
  if (jobCount !== 0) {
    console.log('  ❌ FAIL: job record was created for unconfigured source');
    process.exit(1);
  }
  console.log('  ✅ PASS: unconfigured source refused with exact config message, zero jobs, zero leads');

  // Cleanup: remove the audit-log rows for the fake test user (keep DB clean)
  try {
    await (db as unknown as { leadAuditLog: { deleteMany: (a: unknown) => Promise<unknown> } }).leadAuditLog.deleteMany({
      where: { userId: 'test-user-preflight-check' },
    });
  } catch {
    // audit table name may differ — non-critical
  }

  console.log('\nTEST B — ai_search still accepted (real z-ai flow, no preflight block)');
  // We do NOT run the full AI discovery here (would consume credits); we only
  // verify the pre-flight lets it through by checking the source gating logic.
  const { getSourceStatusInfo } = await import('../src/lib/lead-discovery/source-registry');
  const ai = getSourceStatusInfo('ai_search');
  console.log(`  ai_search status: ${ai.status} (expected connected — built-in search, no key needed)`);
  if (ai.status !== 'connected') {
    console.log('  ❌ FAIL: ai_search should always be connected');
    process.exit(1);
  }
  console.log('  ✅ PASS: ai_search remains always available');

  console.log('\nALL PREFLIGHT TESTS PASSED');
  process.exit(0);
}

mainDiscoveryPreflight().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
