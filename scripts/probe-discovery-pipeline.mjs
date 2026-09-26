// Replicates searchSourceLeads() + sanitizeDiscoveredLeads() EXACTLY for
// niche=hospital, country=usa, source=ai_search — NO database access.
// Evidence: raw results per query, extraction counts, sanitize outcome.
import ZAI from 'z-ai-web-dev-sdk';

const NICHE = 'hospital';
const COUNTRY = 'usa';

// buildSearchQueries() for source=ai_search (no city, no criteria):
const queries = [
  `${NICHE} businesses in ${COUNTRY}`,
  `${NICHE} companies ${COUNTRY} contact details`,
  `best ${NICHE} services in ${COUNTRY} reviews`,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const zai = await ZAI.create();
console.log('ZAI OK — replicating searchSourceLeads for', NICHE, '/', COUNTRY);

let discovered = [];

for (const query of queries) {
  const t0 = Date.now();
  let results = [];
  try {
    results = await zai.functions.invoke('web_search', { query, num: 20 });
    if (!Array.isArray(results)) results = [];
    console.log(`\n[web_search] "${query}" → ${results.length} raw results in ${Date.now() - t0}ms`);
    for (const r of results.slice(0, 3)) console.log(`   raw: ${String(r.name).slice(0, 70)} | ${String(r.url).slice(0, 60)}`);
  } catch (e) {
    console.log(`\n[web_search] "${query}" FAILED in ${Date.now() - t0}ms: ${e.message.slice(0, 200)}`);
    continue; // mirrors the production catch → continue
  }
  if (results.length === 0) continue;

  // extractLeadsFromSearchResults() — same prompt skeleton, model auto, temp 0
  const resultsText = results.slice(0, 20)
    .map((r, i) => `[${i + 1}] Name: ${r.name}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`)
    .join('\n\n');
  const prompt = `You are a business lead extraction assistant. Extract structured business lead data from the search results below.

NICHE: ${NICHE}
COUNTRY: ${COUNTRY}
CITY: Not specified
TARGET SOURCE: ai_search
QUALIFYING REQUIREMENTS: None — accept all matching businesses

Enforce the HARD FILTERS strictly, but do NOT over-exclude: unknown size/website is NOT a reason to exclude — include with nulls and let the verification step decide.

SEARCH RESULTS:
${resultsText}

Extract each business as a JSON object with these fields:
- businessName (required), website, email, phone, city, country, employeeCount (number or null), employeeRange (string or null)
Return ONLY a JSON array of objects. No explanation, no markdown.
If no businesses found, return empty array [].
Maximum 50 results.`;

  try {
    const t1 = Date.now();
    const response = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a precise data extraction assistant. Return only valid JSON arrays. No markdown, no explanations.' },
        { role: 'user', content: prompt },
      ],
      model: 'auto',
      temperature: 0,
    });
    const content = response.choices?.[0]?.message?.content || '[]';
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned);
    const n = Array.isArray(parsed)
      ? parsed.filter((l) => l.businessName && typeof l.businessName === 'string').length
      : 0;
    console.log(`[extract] → ${n} candidates in ${Date.now() - t1}ms (raw content ${content.length} chars)`);
    if (n === 0) console.log(`[extract] EMPTY — raw content preview: ${content.slice(0, 200)}`);
    discovered.push(n);
  } catch (e) {
    console.log(`[extract] FAILED: ${e.message.slice(0, 300)}`);
    discovered.push(0);
  }
  await sleep(4000); // ZAI_MIN_INTERVAL_MS pacer
}

// sanitizeDiscoveredLeads: name >= 2 chars + location (params.country passes) — so every extracted candidate survives
console.log(`\n=== PIPELINE SUMMARY (no-DB replication) ===`);
console.log(`queries run: ${queries.length}; candidates extracted per query: ${discovered.join(', ')}`);
console.log(`=> A production ai_search job for hospital/usa RIGHT NOW would import ~${discovered.reduce((a, b) => a + b, 0)} leads (before dedupe).`);
console.log('=> If any stage had failed, the job would STILL complete with 0 and message "no verified leads" (silent catch).');
