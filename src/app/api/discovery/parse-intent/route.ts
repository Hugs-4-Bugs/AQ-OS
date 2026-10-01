// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/discovery/parse-intent
// Enhancement: AI Chat Mode for Lead Discovery.
// Parses a natural-language lead request (e.g. "Find 20 restaurants in
// Dubai with no website and poor social media presence") into structured
// discovery parameters using Z-AI. Available to ALL plans — no credits
// are deducted here (credits are only consumed by the discovery itself).
//
// HARD CRITERIA: explicit, objectively-verifiable constraints (employee
// ranges, website presence, excluded company types) are extracted BOTH
// by the LLM and by a deterministic extractor (src/lib/discovery/
// hard-criteria.ts). The deterministic result wins for anything it
// detects, so "20 to 200 employees" always becomes a real numeric
// range — never just free text.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import ZAI from 'z-ai-web-dev-sdk';
import {
  extractHardCriteria,
  type HardCriteria,
  type HardExcludeType,
} from '@/lib/discovery/hard-criteria';

export interface ParsedDiscoveryIntent {
  niche: string;
  location: string;
  country: string;
  city: string;
  /**
   * How many leads the user EXPLICITLY requested, or null when they did
   * not specify a number. The old hard default of 20 silently capped every
   * unspecified AI-chat discovery at ~20 results even when the plan, the
   * providers and the user's intent allowed more. When null, the discovery
   * job targets the service default (RESULTS_PER_JOB) and stops only when
   * the data/provider limits are exhausted.
   */
  count: number | null;
  requirements: string;
  /** Structured HARD criteria — enforced server-side after discovery. */
  criteria: {
    employeeMin: number | null;
    employeeMax: number | null;
    exactEmployeeCount: number | null;
    website: 'required' | 'absent' | 'any';
    excludeTypes: HardExcludeType[];
    growthSignals: boolean;
    hiringSignals: boolean;
  };
}

const SYSTEM_PROMPT = `You are a lead-discovery request parser for a business acquisition platform.
Extract structured discovery parameters from a natural-language request.

Return ONLY a JSON object (no markdown, no explanation) with these fields:
- niche: the business type/industry to search for (e.g. "restaurants", "dental clinics", "gyms"). Lowercase.
- location: the city and/or country to search in, as written (e.g. "Dubai", "Mumbai, India").
- country: the country name only (e.g. "UAE", "India", "USA"). If unclear, use the location.
- city: the city name only, or empty string "" if only a country is given.
- count: how many leads are requested (integer, 1-100) ONLY when the user explicitly stated a number. If the user did not state a number, return null — never invent a default.
- requirements: any specific qualifying requirements mentioned (e.g. "no website", "poor social media presence", "low Google rating"). Empty string "" if none.
- employeeMin: if an explicit employee-count RANGE is mentioned (e.g. "20 to 200 employees", "between 50 and 100 employees"), the INCLUSIVE lower bound as an integer. Otherwise null.
- employeeMax: if an explicit employee-count RANGE is mentioned, the INCLUSIVE upper bound as an integer. Otherwise null.
- exactEmployeeCount: if an EXACT employee count is specified (e.g. "exactly 50 employees", "companies with 50 employees"), that number as an integer. Otherwise null.
- website: "required" if businesses must HAVE a website (e.g. "have a professional website", "exclude companies without a website"); "absent" if businesses must LACK a website (e.g. "with no website"); "any" otherwise.
- excludeTypes: array of company types the user explicitly EXCLUDED, chosen only from: "agency", "freelancer", "consultant", "contractor", "reseller", "distributor". Empty array [] if none.
- growthSignals: true if the user wants companies with growth/expansion signals, else false.
- hiringSignals: true if the user wants companies with hiring/recruiting signals, else false.

IMPORTANT: employee counts refer to COMPANY SIZE ("employees", "staff", "headcount"), NOT to the number of leads requested ("find 20 companies"). "Find 20 companies with 20 to 200 employees" means count=20, employeeMin=20, employeeMax=200.

Examples:
"Find 20 restaurants in Dubai with no website and poor social media presence"
→ {"niche":"restaurants","location":"Dubai","country":"UAE","city":"Dubai","count":20,"requirements":"no website, poor social media presence","employeeMin":null,"employeeMax":null,"exactEmployeeCount":null,"website":"absent","excludeTypes":[],"growthSignals":false,"hiringSignals":false}

"I need 15 dentists in Mumbai"
→ {"niche":"dentists","location":"Mumbai","country":"India","city":"Mumbai","count":15,"requirements":"","employeeMin":null,"employeeMax":null,"exactEmployeeCount":null,"website":"any","excludeTypes":[],"growthSignals":false,"hiringSignals":false}

"Find 20 B2B SaaS companies in the United States with 20 to 200 employees that are actively growing and have a professional website. Exclude agencies, freelancers, consultants."
→ {"niche":"b2b saas","location":"United States","country":"USA","city":"","count":20,"requirements":"actively growing, professional website, founder/CEO/Head of Sales involved in acquiring customers","employeeMin":20,"employeeMax":200,"exactEmployeeCount":null,"website":"required","excludeTypes":["agency","freelancer","consultant"],"growthSignals":true,"hiringSignals":false}

"Find dentists in Mumbai"
→ {"niche":"dentists","location":"Mumbai","country":"India","city":"Mumbai","count":null,"requirements":"","employeeMin":null,"employeeMax":null,"exactEmployeeCount":null,"website":"any","excludeTypes":[],"growthSignals":false,"hiringSignals":false}`;

// Lightweight regex fallback used only if the LLM call fails entirely.
function fallbackParse(query: string): ParsedDiscoveryIntent {
  const trimmed = query.trim();
  const countMatch = trimmed.match(/\b(\d{1,3})\b/);
  // No number stated → null (no fabricated default cap).
  const count = countMatch ? Math.min(Math.max(parseInt(countMatch[1], 10), 1), 100) : null;

  const locationMatch =
    trimmed.match(/\bin\s+([A-Z][\w\s,-]+?)(?:\s+with\b|\s+that\b|,|$)/i) ||
    trimmed.match(/\b(?:in|around|near)\s+([A-Za-z][\w\s]*?)(?:$|\s+with\b|\s+that\b)/i);
  const location = locationMatch ? locationMatch[1].trim() : '';

  // Requirements = the "with ..." tail, if any
  const reqMatch = trimmed.match(/\bwith\s+(.+)$/i);
  const requirements = reqMatch ? reqMatch[1].trim() : '';

  let niche = trimmed;
  if (location) niche = niche.replace(new RegExp(`\\b(in|around|near)\\s+${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '');
  niche = niche
    .replace(/^.*?\b(find|get|search(?:\s+for)?|look\s+for|show\s+me|i\s+need)\b/i, '')
    // Strip the requested count from the niche text (only when one was stated).
    .replace(count !== null ? new RegExp(`\\b${count}\\b`) : /$^/, '')
    .replace(/\bwith\s+.+$/i, '')
    .trim();

  return {
    niche: niche || trimmed,
    location,
    country: location,
    city: '',
    count,
    requirements,
    criteria: toCriteriaShape(extractHardCriteria(query)),
  };
}

/** Convert a HardCriteria into the serializable parser shape. */
function toCriteriaShape(c: HardCriteria): ParsedDiscoveryIntent['criteria'] {
  return {
    employeeMin: c.employeeMin ?? null,
    employeeMax: c.employeeMax ?? null,
    exactEmployeeCount: c.exactEmployeeCount ?? null,
    website: c.website,
    excludeTypes: c.excludeTypes,
    growthSignals: c.growthSignals,
    hiringSignals: c.hiringSignals,
  };
}

function normalizeParsed(raw: Record<string, unknown>, originalQuery: string): ParsedDiscoveryIntent {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const countRaw = raw.count === null || raw.count === undefined || raw.count === '' ? null : Number(raw.count);
  const niche = str(raw.niche);
  const location = str(raw.location);

  // Deterministic extraction wins for anything it detects; the LLM's
  // values fill the gaps (e.g. spelled-out numbers like "twenty to two
  // hundred" that the regexes cannot parse).
  const det = extractHardCriteria(originalQuery);
  // NOTE: Number(null) === 0 in JS — null/undefined/'' must map to null
  // explicitly, or the AI's "no constraint" would become a bogus
  // "exactly 0 employees" hard filter that rejects every company.
  const aiNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const aiExclude = Array.isArray(raw.excludeTypes)
    ? (raw.excludeTypes.map((v) => String(v).trim().toLowerCase()) as HardExcludeType[])
    : [];

  const criteria: ParsedDiscoveryIntent['criteria'] = {
    employeeMin: det.employeeMin ?? aiNum(raw.employeeMin),
    employeeMax: det.employeeMax ?? aiNum(raw.employeeMax),
    exactEmployeeCount: det.exactEmployeeCount ?? aiNum(raw.exactEmployeeCount),
    website: det.website !== 'any' ? det.website : (['required', 'absent'].includes(str(raw.website)) ? (str(raw.website) as 'required' | 'absent') : 'any'),
    excludeTypes: Array.from(new Set([...det.excludeTypes, ...aiExclude])),
    growthSignals: det.growthSignals || raw.growthSignals === true,
    hiringSignals: det.hiringSignals || raw.hiringSignals === true,
  };

  if (!niche || !location) {
    // Missing critical fields → try fallback before giving up
    const fb = fallbackParse(originalQuery);
    return {
      niche: niche || fb.niche,
      location: location || fb.location,
      country: str(raw.country) || fb.country,
      city: str(raw.city) || fb.city,
      count: countRaw !== null && Number.isFinite(countRaw) && countRaw > 0 ? Math.min(Math.max(Math.floor(countRaw), 1), 100) : fb.count,
      requirements: str(raw.requirements) || fb.requirements,
      criteria,
    };
  }
  return {
    niche,
    location,
    country: str(raw.country) || location,
    city: str(raw.city),
    count: countRaw !== null && Number.isFinite(countRaw) && countRaw > 0 ? Math.min(Math.max(Math.floor(countRaw), 1), 100) : null,
    requirements: str(raw.requirements),
    criteria,
  };
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json() as { query?: string };
      const query = body.query?.trim();

      if (!query) {
        return NextResponse.json({ error: 'query is required' }, { status: 400 });
      }
      if (query.length > 1000) {
        return NextResponse.json({ error: 'query is too long (max 1000 characters)' }, { status: 400 });
      }

      let parsed: ParsedDiscoveryIntent;
      try {
        const zai = await ZAI.create();
        const response = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: query },
          ],
          model: 'auto',
        });

        const content = response.choices?.[0]?.message?.content || '{}';
        let cleaned = content.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        // Extract the first JSON object in case the model added prose
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        const raw = JSON.parse(jsonMatch ? jsonMatch[0] : '{}') as Record<string, unknown>;
        parsed = normalizeParsed(raw, query);
      } catch (aiErr) {
        console.warn('[ParseIntent] AI parsing failed, using fallback:', aiErr);
        parsed = fallbackParse(query);
      }

      if (!parsed.niche || !parsed.location) {
        return NextResponse.json(
          {
            error: 'Could not identify a niche and location in your request. Please mention what to search and where — e.g. "Find 20 restaurants in Dubai".',
          },
          { status: 422 }
        );
      }

      return NextResponse.json({ parsed });
    } catch (error) {
      console.error('[ParseIntent] Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to parse request';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
