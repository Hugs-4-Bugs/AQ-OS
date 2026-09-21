// Test script: verify discovery sources return REAL data only.
// Run: npx tsx scripts/test-discovery-sources.ts
/* eslint-disable no-console */

async function mainDiscoverySources() {
  const { listSourceStatuses, isSourceReady, getSourceConfigMessage } = await import(
    '../src/lib/lead-discovery/source-registry'
  );
  const {
    scrapeYellowPages,
    scrapeSulekha,
    runSourceAdapter,
    searchGooglePlaces,
    searchYelp,
  } = await import('../src/lib/lead-discovery/source-adapters');

  console.log('════════════════════════════════════════════════════');
  console.log('TEST 1 — Source statuses (no keys configured in env)');
  console.log('════════════════════════════════════════════════════');
  for (const s of listSourceStatuses()) {
    console.log(`  [${s.status.padEnd(15)}] ${s.id.padEnd(16)} ${s.noSetupRequired ? '(no setup required)' : ''}`);
    if (s.status !== 'connected') {
      console.log(`      config message: ${s.configMessage}`);
    }
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log('TEST 2 — Unconfigured API sources refuse to run');
  console.log('════════════════════════════════════════════════════');
  for (const id of ['google_maps', 'yelp', 'linkedin', 'facebook', 'instagram', 'indiamart', 'justdial'] as const) {
    const result = await runSourceAdapter(id, 'dentists', 'Mumbai, India', 5);
    if (result.error) {
      console.log(`  ${id.padEnd(16)} → BLOCKED: [${result.error.kind}] ${result.error.message.slice(0, 90)}`);
      console.log(`      leads: ${result.leads.length} (must be 0 — no fake data)`);
    } else {
      console.log(`  ${id.padEnd(16)} → UNEXPECTED: ran without config! leads=${result.leads.length}`);
    }
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log('TEST 3 — Yellow Pages REAL scraping (dentists in New York)');
  console.log('════════════════════════════════════════════════════');
  const yp = await scrapeYellowPages('dentists', 'New York, NY', 5);
  if (yp.error) {
    console.log(`  ERROR [${yp.error.kind}]: ${yp.error.message}`);
    console.log(`  leads: ${yp.leads.length}`);
  } else {
    console.log(`  REAL results: ${yp.leads.length}`);
    for (const lead of yp.leads.slice(0, 5)) {
      console.log(`   - ${lead.businessName} | ${lead.phone || 'no phone'} | ${lead.city || 'no city'} | ${lead.website || 'no site'}`);
    }
    const valid = yp.leads.every((l) => l.businessName && (l.city || l.address || l.country));
    console.log(`  All leads have name+location: ${valid}`);
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log('TEST 4 — Sulekha REAL scraping (dentists in Chennai)');
  console.log('════════════════════════════════════════════════════');
  const sk = await scrapeSulekha('dentists', 'Chennai', 5);
  if (sk.error) {
    console.log(`  ERROR [${sk.error.kind}]: ${sk.error.message}`);
    console.log(`  leads: ${sk.leads.length}`);
  } else {
    console.log(`  REAL results: ${sk.leads.length}`);
    for (const lead of sk.leads.slice(0, 5)) {
      console.log(`   - ${lead.businessName} | ${lead.phone || 'no phone'} | ${lead.city || 'no city'}`);
    }
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log('TEST 5 — Registry readiness flags');
  console.log('════════════════════════════════════════════════════');
  console.log(`  ai_search ready (no key needed): ${isSourceReady('ai_search')}`);
  console.log(`  google_maps ready (no key):      ${isSourceReady('google_maps')}`);
  console.log(`  google_maps config message:      ${getSourceConfigMessage('google_maps').slice(0, 100)}`);

  console.log('\nDONE');
  process.exit(0);
}

mainDiscoverySources().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
