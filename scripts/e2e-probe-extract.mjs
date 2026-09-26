// Reproduce the EXACT extraction step from lead-discovery-service.ts
// to see what the LLM actually returns for the search results.
import ZAI from 'z-ai-web-dev-sdk';

const queries = [
  'b2b saas businesses in USA',
  'b2b saas companies in USA with 20-200 employees',
];

const zai = await ZAI.create();

for (const query of queries) {
  console.log('\n════════ QUERY:', query);
  const searchResults = await zai.functions.invoke('web_search', { query, num: 20 });
  console.log('search results:', searchResults?.length ?? 0);

  const resultsText = (searchResults || [])
    .slice(0, 20)
    .map((r, i) => `[${i + 1}] Name: ${r.name}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`)
    .join('\n\n');

  const prompt = `You are a business lead extraction assistant. Extract structured business lead data from the search results below.

NICHE: b2b saas
COUNTRY: USA
CITY: Not specified
TARGET SOURCE: ai_search
QUALIFYING REQUIREMENTS: actively growing, professional website, investing in sales or marketing

HARD FILTERS — MANDATORY (a business that violates ANY of these MUST NOT appear in your output, no matter how relevant it looks):
- Employee count: between 20 and 200 (inclusive). A company with fewer than 20 or more than 200 employees MUST NOT be included.
- Excluded company types (MUST NOT be included under any circumstances): agency, freelancer, consultant.
- Website: REQUIRED. Only include businesses that have a real website URL.
If a business may otherwise match but its employee count is NOT stated in the search results, you may still include it with employeeCount: null and employeeRange: null — NEVER GUESS an employee count. A later enrichment step will look up missing sizes, so INCLUDE businesses that plausibly match even without a visible size.

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

  const content = response.choices?.[0]?.message?.content || '[]';
  console.log('── raw LLM content (first 800 chars):');
  console.log(content.slice(0, 800));
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    console.log('── parsed leads:', Array.isArray(parsed) ? parsed.length : 'NOT AN ARRAY');
    if (Array.isArray(parsed)) {
      for (const l of parsed) {
        console.log(`  - ${l.businessName} | count:${l.employeeCount} | range:${l.employeeRange} | site:${l.website || '-'}`);
      }
    }
  } catch (e) {
    console.log('── JSON PARSE ERROR:', e.message);
  }
}
