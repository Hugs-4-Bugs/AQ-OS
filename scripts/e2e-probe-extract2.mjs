// Reproduce extraction with the NEW over-exclusion-safe prompt wording.
import ZAI from 'z-ai-web-dev-sdk';

const zai = await ZAI.create();

const searchQueries = [
  'b2b saas businesses in USA',
  'b2b saas companies USA contact details',
  'best b2b saas services in USA reviews',
  'b2b saas companies in USA with 20-200 employees',
  'mid-size b2b saas companies USA employee count 20-200 employees',
];

const allLeads = [];
for (const query of searchQueries) {
  const searchResults = await zai.functions.invoke('web_search', { query, num: 20 });
  const n = searchResults?.length ?? 0;
  console.log(`\n═══ QUERY: ${query} → ${n} results`);

  const resultsText = (searchResults || [])
    .slice(0, 20)
    .map((r, i) => `[${i + 1}] Name: ${r.name}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`)
    .join('\n\n');

  const prompt = `You are a business lead extraction assistant. Extract structured business lead data from the search results below.

NICHE: b2b saas
COUNTRY: USA
CITY: Not specified
TARGET SOURCE: ai_search
QUALIFYING REQUIREMENTS: actively growing, professional website, investing in sales or marketing, founder/CEO/Head of Sales involved in acquiring customers

HARD FILTERS (a business that CONTRADICTS any of these MUST NOT appear in your output — e.g. evidence shows a clearly larger/smaller company size than the range, or the business IS an excluded type, or it clearly has no website):
- Employee count: between 20 and 200 (inclusive). A company with fewer than 20 or more than 200 employees MUST NOT be included.
- Excluded company types (MUST NOT be included under any circumstances): agency, freelancer, consultant.
- Website: REQUIRED. Only include businesses that have a real website URL.
IMPORTANT — do NOT over-exclude: if a business plausibly matches the niche and hard filters but its employee count or website is NOT VISIBLE in the snippets, still INCLUDE it with employeeCount: null / employeeRange: null / website: null. A later verification step looks up missing evidence. NEVER GUESS a value, and NEVER exclude a business merely because its size is unknown — exclude it ONLY when the evidence CONTRADICTS a filter.

SEARCH RESULTS:
${resultsText}

Extract each business as a JSON object with these fields:
- businessName (required): The business/company name
- website: Business website URL if available
- employeeCount: (number or null) The business's ACTUAL employee count, but ONLY if explicitly stated in the search results. NEVER estimate or invent this number. If not stated, use null.
- employeeRange: (string or null) If the results only give an employee RANGE, put that exact range string here and set employeeCount to null.
- city: City if different from search
- country: Country if different from search

Enforce the HARD FILTERS strictly. Return ONLY a JSON array of objects. No explanation, no markdown.
If no businesses found, return empty array [].
Maximum 20 results.`;

  const response = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a precise data extraction assistant. Return only valid JSON arrays. No markdown, no explanations.' },
      { role: 'user', content: prompt },
    ],
    model: 'auto',
  });

  let cleaned = (response.choices?.[0]?.message?.content || '[]').trim();
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      console.log(`  extracted: ${parsed.length}`);
      for (const l of parsed) {
        console.log(`   - ${l.businessName} | count:${l.employeeCount} | range:${l.employeeRange ?? '-'} | site:${l.website || '-'}`);
        allLeads.push(l);
      }
    } else { console.log('  NOT AN ARRAY'); }
  } catch (e) { console.log('  PARSE ERROR:', e.message, cleaned.slice(0, 200)); }
}

console.log(`\n════ TOTAL extracted candidates: ${allLeads.length}`);
