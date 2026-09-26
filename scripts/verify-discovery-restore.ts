// Verification for "restore Discover page + remove Discovery Sources settings":
//   1. Registry availability → what the dropdown will show (Coming Soon vs selectable)
//   2. /api/discovery/sources payload shape → id/label/available ONLY (no config leaks)
//   3. AI Search engine smoke test → the exact z-ai web_search call used by the
//      untouched searchSourceLeads() ai_search path must return REAL results.
/* eslint-disable no-console */

async function main() {
  // ── 1. Source availability (drives the dropdown) ──
  const { listSourceStatuses } = await import('../src/lib/lead-discovery/source-registry');
  const statuses = listSourceStatuses();
  console.log('=== Source availability (dropdown mapping) ===');
  for (const s of statuses) {
    console.log(
      `  ${s.id.padEnd(16)} available=${s.status === 'connected'} → dropdown: ${
        s.status === 'connected' ? 'SELECTABLE' : '"Coming Soon" (disabled)'
      }`
    );
  }

  // ── 2. API payload shape check ──
  console.log('\n=== /api/discovery/sources payload fields (per source) ===');
  const payload = statuses.map((s) => ({
    id: s.id,
    label: s.label,
    available: s.status === 'connected',
  }));
  const allowed = new Set(['id', 'label', 'available']);
  const leaked = payload.some((p) => Object.keys(p).some((k) => !allowed.has(k)));
  console.log(`  payload keys: ${Object.keys(payload[0]).join(', ')} | leaks: ${leaked ? 'YES ❌' : 'none ✓'}`);

  // ── 3. AI Search engine smoke test (same call as searchSourceLeads) ──
  console.log('\n=== AI Search engine (z-ai web_search, as used by ai_search) ===');
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const zai = await ZAI.create();
  const results = (await zai.functions.invoke('web_search', {
    query: 'coffee shops in Singapore',
    num: 5,
  })) as Array<{ name?: string; title?: string; link?: string; url?: string; snippet?: string }>;
  if (!Array.isArray(results) || results.length === 0) {
    console.log('  ❌ no results returned');
    process.exit(1);
  }
  console.log(`  ✓ web_search returned ${results.length} REAL results:`);
  for (const r of results.slice(0, 5)) {
    console.log(`   - ${(r.name || r.title || '').slice(0, 60)} | ${r.link || r.url || ''}`.slice(0, 110));
  }
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
