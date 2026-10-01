// Diagnostic: probe the exact z-ai calls the ai_search discovery path makes.
// Read-only with respect to app data; makes 1 web_search + 1 chat call
// (the app's own built-in provider, no third-party paid keys involved).
const path = require('path');
process.chdir(path.join(__dirname, '..'));

async function main() {
  const mod = await import('z-ai-web-dev-sdk');
  const ZAI = mod.default || mod.ZAI || mod;
  console.log('[probe] ZAI import shape:', typeof ZAI, ZAI && typeof ZAI.create === 'function' ? 'has create()' : Object.keys(ZAI || {}));
  const zai = await ZAI.create();
  console.log('[probe] ZAI.create() OK');

  // 1) web_search — same invocation shape as searchSourceLeads()
  const t0 = Date.now();
  try {
    const results = await zai.functions.invoke('web_search', {
      query: 'dentist businesses in Mumbai',
      num: 20,
    });
    console.log(`[probe] web_search OK in ${Date.now() - t0}ms — results: ${Array.isArray(results) ? results.length : typeof results}`);
    if (Array.isArray(results) && results.length > 0) {
      console.log('[probe] first result:', JSON.stringify(results[0]).slice(0, 300));
      console.log('[probe] result keys:', Object.keys(results[0]).join(','));
    }
  } catch (e) {
    console.error(`[probe] web_search FAILED in ${Date.now() - t0}ms:`, e && e.message ? e.message : e);
  }

  // 2) chat.completions — same shape as extractLeadsFromSearchResults()
  const t1 = Date.now();
  try {
    const resp = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a precise data extraction assistant. Return only valid JSON arrays. No markdown, no explanations.' },
        { role: 'user', content: 'Return a JSON array with exactly one object: {"ok":true}' },
      ],
      model: 'auto',
      temperature: 0,
    });
    const content = resp.choices?.[0]?.message?.content || '';
    console.log(`[probe] chat OK in ${Date.now() - t1}ms — content: ${content.slice(0, 120)}`);
  } catch (e) {
    console.error(`[probe] chat FAILED in ${Date.now() - t1}ms:`, e && e.message ? e.message : e);
  }
}

main().catch((e) => {
  console.error('[probe] fatal:', e);
  process.exit(1);
});
