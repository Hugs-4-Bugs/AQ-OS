// Probe: run the same discovery searches + extraction manually to see
// exactly what the provider returns for the size-targeted queries.
import ZAI from 'z-ai-web-dev-sdk';

const queries = [
  'b2b saas companies in USA with 20-200 employees',
  'mid-size b2b saas companies USA employee count 20-200 employees',
];

const zai = await ZAI.create();
for (const query of queries) {
  console.log('\n════ QUERY:', query);
  try {
    const results = await zai.functions.invoke('web_search', { query, num: 10 });
    for (const r of results || []) {
      console.log(`- ${r.name}\n  ${r.url}\n  ${(r.snippet || '').slice(0, 220)}`);
    }
  } catch (e) {
    console.log('SEARCH ERROR:', e.message);
  }
}
