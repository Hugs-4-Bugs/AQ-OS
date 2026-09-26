const ZAI = require('z-ai-web-dev-sdk').default;

async function main() {
  const zai = await ZAI.create();
  for (const q of [
    'site:linkedin.com/company b2b saas United States',
    'b2b saas software company "51-200 employees" USA',
  ]) {
    console.log('═══', q);
    const r = await zai.functions.invoke('web_search', { query: q, num: 10 });
    for (const item of r || []) {
      const name = (item.name || '').slice(0, 80);
      const snip = (item.snippet || '').slice(0, 220);
      console.log('- ' + name);
      console.log('  ' + snip);
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
}
main().catch((e) => console.log('ERR', e.message));
