// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/discovery/parse-intent
// Enhancement: AI Chat Mode for Lead Discovery.
// Parses a natural-language lead request (e.g. "Find 20 restaurants in
// Dubai with no website and poor social media presence") into structured
// discovery parameters using Z-AI. Available to ALL plans — no credits
// are deducted here (credits are only consumed by the discovery itself).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import ZAI from 'z-ai-web-dev-sdk';

export interface ParsedDiscoveryIntent {
  niche: string;
  location: string;
  country: string;
  city: string;
  count: number;
  requirements: string;
}

const SYSTEM_PROMPT = `You are a lead-discovery request parser for a business acquisition platform.
Extract structured discovery parameters from a natural-language request.

Return ONLY a JSON object (no markdown, no explanation) with these fields:
- niche: the business type/industry to search for (e.g. "restaurants", "dental clinics", "gyms"). Lowercase.
- location: the city and/or country to search in, as written (e.g. "Dubai", "Mumbai, India").
- country: the country name only (e.g. "UAE", "India", "USA"). If unclear, use the location.
- city: the city name only, or empty string "" if only a country is given.
- count: how many leads are requested (integer, 1-100). Default 20 if not specified.
- requirements: any specific qualifying requirements mentioned (e.g. "no website", "poor social media presence", "low Google rating"). Empty string "" if none.

Examples:
"Find 20 restaurants in Dubai with no website and poor social media presence"
→ {"niche":"restaurants","location":"Dubai","country":"UAE","city":"Dubai","count":20,"requirements":"no website, poor social media presence"}

"I need 15 dentists in Mumbai"
→ {"niche":"dentists","location":"Mumbai","country":"India","city":"Mumbai","count":15,"requirements":""}`;

// Lightweight regex fallback used only if the LLM call fails entirely.
function fallbackParse(query: string): ParsedDiscoveryIntent {
  const trimmed = query.trim();
  const countMatch = trimmed.match(/\b(\d{1,3})\b/);
  const count = countMatch ? Math.min(Math.max(parseInt(countMatch[1], 10), 1), 100) : 20;

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
    .replace(new RegExp(`\\b${count}\\b`), '')
    .replace(/\bwith\s+.+$/i, '')
    .trim();

  return {
    niche: niche || trimmed,
    location,
    country: location,
    city: '',
    count,
    requirements,
  };
}

function normalizeParsed(raw: Record<string, unknown>, originalQuery: string): ParsedDiscoveryIntent {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const countRaw = Number(raw.count);
  const niche = str(raw.niche);
  const location = str(raw.location);
  if (!niche || !location) {
    // Missing critical fields → try fallback before giving up
    const fb = fallbackParse(originalQuery);
    return {
      niche: niche || fb.niche,
      location: location || fb.location,
      country: str(raw.country) || fb.country,
      city: str(raw.city) || fb.city,
      count: Number.isFinite(countRaw) && countRaw > 0 ? Math.min(Math.max(Math.floor(countRaw), 1), 100) : fb.count,
      requirements: str(raw.requirements) || fb.requirements,
    };
  }
  return {
    niche,
    location,
    country: str(raw.country) || location,
    city: str(raw.city),
    count: Number.isFinite(countRaw) && countRaw > 0 ? Math.min(Math.max(Math.floor(countRaw), 1), 100) : 20,
    requirements: str(raw.requirements),
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
      if (query.length > 500) {
        return NextResponse.json({ error: 'query is too long (max 500 characters)' }, { status: 400 });
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
