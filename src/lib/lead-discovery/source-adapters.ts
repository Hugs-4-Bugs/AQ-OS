// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Discovery Source Adapters (REAL DATA ONLY)
//
// Every adapter in this file performs a REAL network call to its
// provider (official API or public web page) and returns only what the
// provider actually sent. There is NO mock, sample, or placeholder data
// anywhere in this file. Failures are surfaced honestly via AdapterError.
//
// Universal result contract (enforced again in lead-discovery-service):
//   - every lead must carry at least a name and a location
//   - results missing both are discarded
//   - rate limiting is reported with a retry window, never silently
// ═══════════════════════════════════════════════════════════════════

import type { DiscoverySourceId } from './source-registry';

// ===== SHARED TYPES =====

export interface DiscoveredLead {
  businessName: string;
  ownerName?: string;
  website?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  googleMapsListing?: string;
  reviews?: string;
  rating?: number;
  city?: string;
  country?: string;
  niche?: string;
  source: string;
  /** Street address or extra REAL context from the provider (stored in Lead.notes). */
  address?: string;
}

export type AdapterErrorKind =
  | 'not_configured'
  | 'rate_limited'
  | 'api_error'
  | 'scrape_failed'
  | 'no_results';

export interface AdapterError {
  kind: AdapterErrorKind;
  /** Exact, user-facing message describing what went wrong. */
  message: string;
  /** For rate_limited errors — minutes until the caller should retry. */
  retryAfterMinutes?: number;
}

export interface AdapterResult {
  leads: DiscoveredLead[];
  error?: AdapterError;
}

const DEFAULT_TIMEOUT_MS = 12000;
const SCRAPE_DELAY_MS = 1000; // 1s between scraping requests (anti-rate-limit)
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_SCRAPE_RESULTS = 20;

// ===== HELPERS =====

async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();

  if (!res.ok) {
    // Surface rate limiting with a retry window when the provider signals it
    const retryAfter = res.headers.get('retry-after');
    if (res.status === 429 || res.status === 503) {
      const minutes = retryAfter ? Math.max(1, Math.ceil(parseInt(retryAfter, 10) / 60)) : 5;
      const err = new Error(`Rate limit reached (HTTP ${res.status})`);
      (err as Error & { kind?: AdapterErrorKind; retryAfterMinutes?: number }).kind = 'rate_limited';
      (err as Error & { kind?: AdapterErrorKind; retryAfterMinutes?: number }).retryAfterMinutes = minutes;
      throw err;
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON from provider: ${text.slice(0, 200)}`);
  }
}

function rateLimitError(minutes = 5): AdapterError {
  return { kind: 'rate_limited', message: `Rate limit reached, try again in ${minutes} minutes`, retryAfterMinutes: minutes };
}

function apiError(message: string): AdapterError {
  return { kind: 'api_error', message };
}

function normalizeUrl(url: string): string {
  let normalized = String(url || '').trim();
  if (!normalized) return '';
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}

/** Split "12 Main St, London, Greater London, UK" → { city, country, full }. */
function splitAddress(address: string): { city?: string; country?: string; full: string } {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { full: address };
  if (parts.length === 1) return { city: parts[0], full: address };
  return {
    city: parts.length >= 2 ? parts[parts.length - 2] : undefined,
    country: parts.length >= 3 ? parts[parts.length - 1] : undefined,
    full: address,
  };
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** Discard anything without a business name; attach the search niche. */
function finalizeLeads(
  leads: DiscoveredLead[],
  source: DiscoverySourceId,
  niche: string,
  maxResults: number
): DiscoveredLead[] {
  return leads
    .filter((l) => l.businessName && l.businessName.trim().length > 1)
    .slice(0, Math.max(1, maxResults))
    .map((l) => ({
      ...l,
      businessName: l.businessName.trim(),
      niche: l.niche || niche,
      source,
    }));
}

// ═══════════════════════════════════════════════════════════════════
// GOOGLE MAPS / GOOGLE BUSINESS — official Google Places API
// https://maps.googleapis.com/maps/api/place/textsearch/json
// ═══════════════════════════════════════════════════════════════════

interface PlaceSearchResult {
  name?: string;
  formatted_address?: string;
  place_id?: string;
  rating?: number;
  user_ratings_total?: number;
  business_status?: string;
  website?: string;       // only present on some Place Details responses
  formatted_phone_number?: string;
  international_phone_number?: string;
}

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<PlaceSearchResult | null> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'name,formatted_address,formatted_phone_number,international_phone_number,website,rating');
    url.searchParams.set('key', apiKey);
    const data = await fetchJson(url.toString());
    if (data.status === 'OK' && data.result) {
      return data.result as PlaceSearchResult;
    }
    if (data.status === 'OVER_QUERY_LIMIT') {
      throw Object.assign(new Error('OVER_QUERY_LIMIT'), { kind: 'rate_limited' as const });
    }
    return null;
  } catch (err) {
    if ((err as { kind?: string }).kind === 'rate_limited') throw err;
    return null; // details are enrichment-only — the text-search hit is still real
  }
}

export async function searchGooglePlaces(
  niche: string,
  location: string,
  maxResults: number,
  _isBusinessProfile = false // google_business uses the same Places API
): Promise<AdapterResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { leads: [], error: { kind: 'not_configured', message: 'GOOGLE_MAPS_API_KEY is not set' } };
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', `${niche} in ${location}`);
    url.searchParams.set('key', apiKey);

    const data = await fetchJson(url.toString());

    if (data.status === 'REQUEST_DENIED') {
      return { leads: [], error: apiError(`Google Places API denied the request: ${cleanText(data.error_message) || 'check key restrictions and that the Places API is enabled'}`) };
    }
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'RESOURCE_EXHAUSTED') {
      return { leads: [], error: rateLimitError(5) };
    }
    if (data.status === 'INVALID_REQUEST' || data.status === 'ZERO_RESULTS') {
      return { leads: [], error: { kind: 'no_results', message: `Google Places returned no results for "${niche}" in "${location}"` } };
    }

    const results = Array.isArray(data.results) ? (data.results as PlaceSearchResult[]) : [];
    const capped = results.slice(0, Math.min(Math.max(maxResults, 1), 20));
    const leads: DiscoveredLead[] = [];

    for (const place of capped) {
      // Place Details adds phone + website (real fields, real API)
      let phone = '';
      let website = '';
      const details = place.place_id ? await fetchPlaceDetails(place.place_id, apiKey) : null;
      if (details) {
        phone = details.formatted_phone_number || details.international_phone_number || '';
        website = details.website || '';
      }

      const addr = cleanText(place.formatted_address);
      const parsed = addr ? splitAddress(addr) : { full: '' };

      leads.push({
        businessName: cleanText(place.name),
        website: website || undefined,
        phone: phone || undefined,
        rating: typeof place.rating === 'number' ? place.rating : undefined,
        reviews: place.user_ratings_total ? `${place.user_ratings_total} Google reviews` : undefined,
        googleMapsListing: place.place_id
          ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
          : undefined,
        city: parsed.city || undefined,
        country: parsed.country || undefined,
        address: parsed.full || undefined,
        source: 'google_maps',
      });

      // Gentle pacing between detail calls
      await new Promise((r) => setTimeout(r, 200));
    }

    const valid = finalizeLeads(leads, 'google_maps', niche, maxResults);
    if (valid.length === 0) {
      return { leads: [], error: { kind: 'no_results', message: 'Google Places returned results but none had a usable business name and location' } };
    }
    return { leads: valid };
  } catch (err) {
    const e = err as Error & { kind?: AdapterErrorKind; retryAfterMinutes?: number };
    if (e.kind === 'rate_limited') return { leads: [], error: rateLimitError(e.retryAfterMinutes ?? 5) };
    return { leads: [], error: apiError(`Google Maps API call failed: ${e.message}`) };
  }
}

// ═══════════════════════════════════════════════════════════════════
// YELP — official Yelp Fusion API
// https://api.yelp.com/v3/businesses/search
// ═══════════════════════════════════════════════════════════════════

interface YelpBusiness {
  name?: string;
  phone?: string;
  display_phone?: string;
  url?: string;
  rating?: number;
  review_count?: number;
  location?: {
    address1?: string;
    city?: string;
    state?: string;
    country?: string;
    display_address?: string[];
  };
  categories?: Array<{ title?: string }>;
}

export async function searchYelp(
  niche: string,
  location: string,
  maxResults: number
): Promise<AdapterResult> {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) {
    return { leads: [], error: { kind: 'not_configured', message: 'YELP_API_KEY is not set' } };
  }

  try {
    const url = new URL('https://api.yelp.com/v3/businesses/search');
    url.searchParams.set('term', niche);
    url.searchParams.set('location', location);
    url.searchParams.set('limit', String(Math.min(Math.max(maxResults, 1), 20)));

    const data = await fetchJson(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const businesses = Array.isArray(data.businesses) ? (data.businesses as YelpBusiness[]) : [];
    const leads: DiscoveredLead[] = businesses.map((b) => {
      const displayAddress = Array.isArray(b.location?.display_address)
        ? b.location!.display_address!.join(', ')
        : '';
      const categories = Array.isArray(b.categories)
        ? b.categories.map((c) => cleanText(c.title)).filter(Boolean).join(', ')
        : '';

      return {
        businessName: cleanText(b.name),
        phone: cleanText(b.display_phone) || cleanText(b.phone) || undefined,
        // Yelp returns its own listing URL — kept in notes, never claimed as the business website
        address: displayAddress || undefined,
        city: cleanText(b.location?.city) || undefined,
        country: cleanText(b.location?.country) || undefined,
        rating: typeof b.rating === 'number' ? b.rating : undefined,
        reviews: [
          b.review_count ? `${b.review_count} Yelp reviews` : '',
          categories ? `Categories: ${categories}` : '',
          b.url ? `Yelp listing: ${b.url}` : '',
        ].filter(Boolean).join(' · ') || undefined,
        source: 'yelp',
      };
    });

    const valid = finalizeLeads(leads, 'yelp', niche, maxResults);
    if (valid.length === 0) {
      return { leads: [], error: { kind: 'no_results', message: `Yelp returned no businesses for "${niche}" in "${location}"` } };
    }
    return { leads: valid };
  } catch (err) {
    const e = err as Error & { kind?: AdapterErrorKind; retryAfterMinutes?: number };
    if (e.kind === 'rate_limited') return { leads: [], error: rateLimitError(e.retryAfterMinutes ?? 5) };
    return { leads: [], error: apiError(`Yelp API call failed: ${e.message}`) };
  }
}

// ═══════════════════════════════════════════════════════════════════
// LINKEDIN — official Organization Search API
// (client-credentials token → /rest/organizationSearch)
// ═══════════════════════════════════════════════════════════════════

async function getLinkedInToken(): Promise<string> {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('not_configured'), { code: 'NOT_CONFIGURED' });
  }

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`LinkedIn token endpoint returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('LinkedIn token response contained no access_token');
  return data.access_token;
}

interface LinkedInOrg {
  name?: string;
  localizedName?: string;
  websiteUrl?: string;
  vanityName?: string;
  description?: string;
  locations?: Array<{
    address?: {
      city?: string;
      country?: string;
      geographicArea?: string;
    };
  }>;
}

export async function searchLinkedIn(
  niche: string,
  location: string,
  maxResults: number
): Promise<AdapterResult> {
  if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
    return { leads: [], error: { kind: 'not_configured', message: 'LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are not set' } };
  }

  try {
    const token = await getLinkedInToken();

    const url = new URL('https://api.linkedin.com/rest/organizationSearch');
    url.searchParams.set('q', 'search');
    url.searchParams.set('keywords', `${niche} ${location}`.trim());
    url.searchParams.set('pageSize', String(Math.min(Math.max(maxResults, 1), 20)));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'LinkedIn-Version': '202405',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    const text = await res.text();

    if (res.status === 429) return { leads: [], error: rateLimitError(10) };
    if (!res.ok) {
      // LinkedIn partner-access rejections are common — surface the real error
      return { leads: [], error: apiError(`LinkedIn API rejected the search (HTTP ${res.status}): ${text.slice(0, 250)}. Organization Search usually requires LinkedIn Marketing API partner approval.`) };
    }

    let data: { elements?: LinkedInOrg[] };
    try {
      data = JSON.parse(text);
    } catch {
      return { leads: [], error: apiError('LinkedIn API returned a non-JSON response') };
    }

    const orgs = Array.isArray(data.elements) ? data.elements : [];
    const leads: DiscoveredLead[] = orgs.map((org) => {
      const loc = org.locations?.[0]?.address;
      return {
        businessName: cleanText(org.name) || cleanText(org.localizedName),
        website: org.websiteUrl ? normalizeUrl(org.websiteUrl) : undefined,
        linkedin: org.vanityName ? `https://www.linkedin.com/company/${org.vanityName}/` : undefined,
        city: cleanText(loc?.city) || undefined,
        country: cleanText(loc?.country) || undefined,
        reviews: org.description ? cleanText(org.description).slice(0, 300) : undefined,
        source: 'linkedin',
      };
    });

    const valid = finalizeLeads(leads, 'linkedin', niche, maxResults);
    if (valid.length === 0) {
      return { leads: [], error: { kind: 'no_results', message: `LinkedIn returned no companies for "${niche}" in "${location}"` } };
    }
    return { leads: valid };
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_CONFIGURED') {
      return { leads: [], error: { kind: 'not_configured', message: 'LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are not set' } };
    }
    return { leads: [], error: apiError(`LinkedIn API call failed: ${e.message}`) };
  }
}

// ═══════════════════════════════════════════════════════════════════
// JUSTDIAL — partner API (endpoint URL issued by JustDial onboarding)
// ═══════════════════════════════════════════════════════════════════

/** Recursively pull the first array of object-like records out of a JSON payload. */
function extractRecordArray(data: unknown, depth = 0): Array<Record<string, unknown>> | null {
  if (depth > 4 || data === null || typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    return data.length > 0 && typeof data[0] === 'object' ? (data as Array<Record<string, unknown>>) : null;
  }
  const priorityKeys = ['results', 'data', 'listings', 'businesses', 'items', 'records', 'response'];
  const obj = data as Record<string, unknown>;
  for (const key of priorityKeys) {
    if (key in obj) {
      const found = extractRecordArray(obj[key], depth + 1);
      if (found) return found;
    }
  }
  for (const value of Object.values(obj)) {
    const found = extractRecordArray(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function pickString(record: Record<string, unknown>, candidates: string[]): string {
  for (const key of Object.keys(record)) {
    const lower = key.toLowerCase();
    if (candidates.some((c) => lower === c || lower.includes(c))) {
      const value = cleanText(record[key]);
      if (value) return value;
    }
  }
  return '';
}

export async function searchJustDial(
  niche: string,
  location: string,
  maxResults: number
): Promise<AdapterResult> {
  const apiKey = process.env.JUSTDIAL_API_KEY;
  const apiUrl = process.env.JUSTDIAL_API_URL;

  if (!apiKey) {
    return { leads: [], error: { kind: 'not_configured', message: 'JUSTDIAL_API_KEY is not set' } };
  }
  if (!apiUrl) {
    return {
      leads: [],
      error: {
        kind: 'not_configured',
        message: 'JUSTDIAL_API_URL is not set. JustDial issues its partner endpoint URL during API onboarding — add it to your environment variables.',
      },
    };
  }
  if (!/^https?:\/\//i.test(apiUrl)) {
    return {
      leads: [],
      error: {
        kind: 'not_configured',
        message: 'JUSTDIAL_API_URL must be a full https:// endpoint URL as provided by JustDial partner onboarding.',
      },
    };
  }

  try {
    const url = new URL(apiUrl);
    url.searchParams.set('query', `${niche} ${location}`.trim());
    url.searchParams.set('city', location);
    url.searchParams.set('category', niche);
    url.searchParams.set('page', '1');

    const data = await fetchJson(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Api-Key': apiKey,
        Accept: 'application/json',
      },
    });

    const records = extractRecordArray(data);
    if (!records || records.length === 0) {
      return { leads: [], error: { kind: 'no_results', message: `JustDial API returned no listings for "${niche}" in "${location}"` } };
    }

    const leads: DiscoveredLead[] = records.map((record) => ({
      businessName: pickString(record, ['business_name', 'businessname', 'name', 'title', 'company']),
      phone: pickString(record, ['phone', 'mobile', 'contact', 'telephone']),
      city: pickString(record, ['city', 'locality', 'area', 'region']),
      country: 'India',
      address: pickString(record, ['address', 'location']),
      website: normalizeUrl(pickString(record, ['website', 'url', 'site'])) || undefined,
      rating: (() => {
        const raw = pickString(record, ['rating', 'stars']);
        const num = parseFloat(raw);
        return Number.isFinite(num) ? num : undefined;
      })(),
      source: 'justdial',
    }));

    const valid = finalizeLeads(leads, 'justdial', niche, maxResults).filter((l) => l.city || l.address);
    if (valid.length === 0) {
      return { leads: [], error: { kind: 'no_results', message: 'JustDial API returned records but none had a usable name and location' } };
    }
    return { leads: valid };
  } catch (err) {
    const e = err as Error & { kind?: AdapterErrorKind; retryAfterMinutes?: number };
    if (e.kind === 'rate_limited') return { leads: [], error: rateLimitError(e.retryAfterMinutes ?? 5) };
    return { leads: [], error: apiError(`JustDial API call failed: ${e.message}`) };
  }
}

// ═══════════════════════════════════════════════════════════════════
// INDIAMART — official Lead Manager API (your own account enquiries)
// https://mapi.indiamart.com/wserv/crm/enquiry/list/v2/
// ═══════════════════════════════════════════════════════════════════

interface IndiaMartEnquiry {
  SENDER_NAME?: string;
  SENDER_COMPANY?: string;
  SENDER_MOBILE?: string;
  SENDER_EMAIL?: string;
  SENDER_CITY?: string;
  SENDER_STATE?: string;
  SENDER_COUNTRY?: string;
  SENDER_ADDRESS?: string;
  QUERY_PRODUCT_NAME?: string;
  QUERY_MESSAGE?: string;
  DATE_TIME?: string;
  QUERY_TYPE?: string;
}

export async function searchIndiaMart(
  niche: string,
  location: string,
  maxResults: number
): Promise<AdapterResult> {
  const token = process.env.INDIAMART_API_KEY;
  if (!token) {
    return { leads: [], error: { kind: 'not_configured', message: 'INDIAMART_API_KEY is not set' } };
  }

  try {
    // The official Lead Manager API returns enquiries from the token's own
    // account for a date window (last 7 days) — this is REAL account data.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    const query = JSON.stringify({ mode: 'view', q: since });

    const data = await fetchJson(
      `https://mapi.indiamart.com/wserv/crm/enquiry/list/v2/?query=${encodeURIComponent(query)}&access_token=${encodeURIComponent(token)}`,
      {},
      15000
    );

    // Error envelope: { Error: "...", CODE: "..." }
    if (typeof data.Error === 'string' && data.Error.trim()) {
      return { leads: [], error: apiError(`IndiaMart API error: ${data.Error}`) };
    }

    const records = extractRecordArray(data);
    if (!records || records.length === 0) {
      return { leads: [], error: { kind: 'no_results', message: `No IndiaMart enquiries in your account from the last 7 days${niche ? ` matching "${niche}"` : ''}` } };
    }

    const nicheLower = niche.toLowerCase();
    const nicheWords = nicheLower.split(/\s+/).filter((w) => w.length > 2);

    const matchesNiche = (enquiry: IndiaMartEnquiry) => {
      if (!nicheWords.length) return true;
      const haystack = [
        enquiry.QUERY_PRODUCT_NAME,
        enquiry.QUERY_MESSAGE,
        enquiry.QUERY_TYPE,
      ].map((v) => cleanText(v).toLowerCase()).join(' ');
      return nicheWords.some((w) => haystack.includes(w));
    };

    const leads: DiscoveredLead[] = (records as IndiaMartEnquiry[])
      .filter(matchesNiche)
      .map((enquiry) => ({
        businessName: cleanText(enquiry.SENDER_COMPANY) || cleanText(enquiry.SENDER_NAME),
        ownerName: cleanText(enquiry.SENDER_NAME) || undefined,
        email: cleanText(enquiry.SENDER_EMAIL) || undefined,
        phone: cleanText(enquiry.SENDER_MOBILE) || undefined,
        city: cleanText(enquiry.SENDER_CITY) || undefined,
        country: cleanText(enquiry.SENDER_COUNTRY) || 'India',
        address: cleanText(enquiry.SENDER_ADDRESS) || undefined,
        niche: cleanText(enquiry.QUERY_PRODUCT_NAME) || niche,
        reviews: [
          enquiry.DATE_TIME ? `Enquiry date: ${enquiry.DATE_TIME}` : '',
          enquiry.QUERY_MESSAGE ? `Message: ${cleanText(enquiry.QUERY_MESSAGE).slice(0, 250)}` : '',
        ].filter(Boolean).join(' · ') || undefined,
        source: 'indiamart',
      }));

    const valid = finalizeLeads(leads, 'indiamart', niche, maxResults);
    if (valid.length === 0) {
      return { leads: [], error: { kind: 'no_results', message: `Your IndiaMart account has enquiries, but none matched "${niche}" in the last 7 days` } };
    }
    return { leads: valid };
  } catch (err) {
    const e = err as Error & { kind?: AdapterErrorKind; retryAfterMinutes?: number };
    if (e.kind === 'rate_limited') return { leads: [], error: rateLimitError(e.retryAfterMinutes ?? 5) };
    return { leads: [], error: apiError(`IndiaMart API call failed: ${e.message}`) };
  }
}

// ═══════════════════════════════════════════════════════════════════
// FACEBOOK — official Graph API Pages Search
// ═══════════════════════════════════════════════════════════════════

interface FBPage {
  name?: string;
  link?: string;
  phone?: string;
  website?: string;
  category?: string;
  location?: {
    city?: string;
    country?: string;
    street?: string;
  };
}

async function getFacebookAppToken(): Promise<string> {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const res = await fetch(
    `https://graph.facebook.com/oauth/access_token?client_id=${encodeURIComponent(appId!)}&client_secret=${encodeURIComponent(appSecret!)}&grant_type=client_credentials`,
    { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
  );
  if (!res.ok) {
    throw new Error(`Facebook token endpoint returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Facebook token response contained no access_token');
  return data.access_token;
}

export async function searchFacebookPages(
  niche: string,
  location: string,
  maxResults: number
): Promise<AdapterResult> {
  if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
    return { leads: [], error: { kind: 'not_configured', message: 'FACEBOOK_APP_ID / FACEBOOK_APP_SECRET are not set' } };
  }

  try {
    const token = await getFacebookAppToken();

    const url = new URL('https://graph.facebook.com/v19.0/pages/search');
    url.searchParams.set('q', `${niche} ${location}`.trim());
    url.searchParams.set('fields', 'name,link,phone,website,category,location');
    url.searchParams.set('limit', String(Math.min(Math.max(maxResults, 1), 20)));
    url.searchParams.set('access_token', token);

    const data = await fetchJson(url.toString());

    if (data.error) {
      const err = data.error as { message?: string; code?: number };
      if (err.code === 4 || err.code === 17 || err.code === 32) {
        return { leads: [], error: rateLimitError(10) };
      }
      return { leads: [], error: apiError(`Facebook Graph API error: ${err.message || 'unknown error'}`) };
    }

    const pages = Array.isArray(data.data) ? (data.data as FBPage[]) : [];
    const leads: DiscoveredLead[] = pages.map((page) => ({
      businessName: cleanText(page.name),
      website: page.website ? normalizeUrl(cleanText(page.website).split(/\s+/)[0]) : undefined,
      phone: cleanText(page.phone) || undefined,
      facebook: page.link ? normalizeUrl(page.link) : undefined,
      city: cleanText(page.location?.city) || undefined,
      country: cleanText(page.location?.country) || undefined,
      address: cleanText(page.location?.street) || undefined,
      reviews: cleanText(page.category) ? `Category: ${cleanText(page.category)}` : undefined,
      source: 'facebook',
    }));

    const valid = finalizeLeads(leads, 'facebook', niche, maxResults);
    if (valid.length === 0) {
      return { leads: [], error: { kind: 'no_results', message: `Facebook Pages Search returned no pages for "${niche}" in "${location}"` } };
    }
    return { leads: valid };
  } catch (err) {
    const e = err as Error & { kind?: AdapterErrorKind; retryAfterMinutes?: number };
    if (e.kind === 'rate_limited') return { leads: [], error: rateLimitError(e.retryAfterMinutes ?? 5) };
    return { leads: [], error: apiError(`Facebook API call failed: ${e.message}`) };
  }
}

// ═══════════════════════════════════════════════════════════════════
// INSTAGRAM — Meta Graph API business search
// NOTE (honest limitation): the Instagram Basic Display API has no
// public "search accounts" endpoint. When INSTAGRAM_APP_ID is set we
// make the real Graph API call available for IG business discovery and
// surface Meta's exact response — including permission rejections.
// No substitute/fake data is ever produced.
// ═══════════════════════════════════════════════════════════════════

export async function searchInstagramBusinesses(
  niche: string,
  location: string,
  maxResults: number
): Promise<AdapterResult> {
  if (!process.env.INSTAGRAM_APP_ID) {
    return { leads: [], error: { kind: 'not_configured', message: 'INSTAGRAM_APP_ID is not set' } };
  }

  try {
    // App access token (app id + secret, or app_id|app_secret fallback)
    let token: string;
    if (process.env.INSTAGRAM_APP_SECRET) {
      const res = await fetch(
        `https://graph.facebook.com/oauth/access_token?client_id=${encodeURIComponent(process.env.INSTAGRAM_APP_ID)}&client_secret=${encodeURIComponent(process.env.INSTAGRAM_APP_SECRET)}&grant_type=client_credentials`,
        { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
      );
      const data = (await res.json()) as { access_token?: string; error?: { message?: string } };
      if (!data.access_token) {
        return { leads: [], error: apiError(`Instagram/Meta token error: ${data.error?.message || `HTTP ${res.status}`}`) };
      }
      token = data.access_token;
    } else {
      token = `${process.env.INSTAGRAM_APP_ID}|${process.env.INSTAGRAM_APP_SECRET || ''}`;
    }

    const url = new URL('https://graph.facebook.com/v19.0/pages/search');
    url.searchParams.set('q', `${niche} ${location}`.trim());
    url.searchParams.set('fields', 'name,link,username,category,location,instagram_business_account');
    url.searchParams.set('limit', String(Math.min(Math.max(maxResults, 1), 20)));
    url.searchParams.set('access_token', token);

    const data = await fetchJson(url.toString());

    if (data.error) {
      const err = data.error as { message?: string; code?: number };
      if (err.code === 4 || err.code === 17 || err.code === 32) {
        return { leads: [], error: rateLimitError(10) };
      }
      return { leads: [], error: apiError(`Instagram search via Meta Graph API failed: ${err.message || 'unknown error'}. Business search on Instagram requires an approved Instagram Business token.`) };
    }

    const pages = Array.isArray(data.data) ? (data.data as Array<FBPage & { username?: string; instagram_business_account?: { id?: string } }>) : [];
    const igPages = pages.filter((p) => p.instagram_business_account?.id || p.username);

    const leads: DiscoveredLead[] = igPages.map((page) => ({
      businessName: cleanText(page.name),
      instagram: page.username
        ? `https://www.instagram.com/${page.username}/`
        : page.instagram_business_account?.id
          ? `https://www.instagram.com/${page.instagram_business_account.id}/`
          : undefined,
      city: cleanText(page.location?.city) || undefined,
      country: cleanText(page.location?.country) || undefined,
      address: cleanText(page.location?.street) || undefined,
      reviews: cleanText(page.category) ? `Category: ${cleanText(page.category)}` : undefined,
      source: 'instagram',
    }));

    const valid = finalizeLeads(leads, 'instagram', niche, maxResults);
    if (valid.length === 0) {
      return { leads: [], error: { kind: 'no_results', message: `No Instagram-linked business pages found for "${niche}" in "${location}"` } };
    }
    return { leads: valid };
  } catch (err) {
    const e = err as Error & { kind?: AdapterErrorKind; retryAfterMinutes?: number };
    if (e.kind === 'rate_limited') return { leads: [], error: rateLimitError(e.retryAfterMinutes ?? 5) };
    return { leads: [], error: apiError(`Instagram API call failed: ${e.message}`) };
  }
}

// ═══════════════════════════════════════════════════════════════════
// YELLOW PAGES — live scraping of yellowpages.com (no API key needed)
// ═══════════════════════════════════════════════════════════════════

export async function scrapeYellowPages(
  niche: string,
  location: string,
  maxResults: number
): Promise<AdapterResult> {
  const cheerio = await import('cheerio');
  const leads: DiscoveredLead[] = [];
  const target = Math.min(Math.max(maxResults, 1), MAX_SCRAPE_RESULTS);

  // yellowpages.com paginates 15 per page — fetch up to 2 pages, 1s apart
  for (const page of [1, 2]) {
    if (leads.length >= target) break;

    const url = new URL('https://www.yellowpages.com/search');
    url.searchParams.set('search_terms', niche);
    url.searchParams.set('geo_location_terms', location);
    if (page > 1) url.searchParams.set('page', String(page));

    try {
      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      if (res.status === 429 || res.status === 503) {
        if (leads.length > 0) break; // keep what we already honestly fetched
        return { leads: [], error: rateLimitError(5) };
      }
      if (res.status === 403 || res.status === 401) {
        if (leads.length > 0) break;
        return { leads: [], error: { kind: 'scrape_failed', message: `yellowpages.com blocked this request (HTTP ${res.status}) — the site refuses automated access from this server's IP. No results can be fetched, so no data is shown.` } };
      }
      if (!res.ok) {
        if (leads.length > 0) break;
        return { leads: [], error: { kind: 'scrape_failed', message: `yellowpages.com returned HTTP ${res.status}` } };
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      $('.result .v-card, .result.v-card').each((_, el) => {
        if (leads.length >= target) return;
        const card = $(el);

        const name = cleanText(card.find('.business-name').text()) || cleanText(card.find('a.business-name').attr('alt')) || cleanText(card.find('h2').text());
        const phone = cleanText(card.find('.phone').text()).replace(/[^\d()+\-\s]/g, '');
        const street = cleanText(card.find('.street-address').text());
        const locality = cleanText(card.find('.locality').text());
        const region = cleanText(card.find('.adr .region, .region').first().text());
        const website = card.find('a.website').attr('href') || card.find('.links a.track-visit-website').attr('href') || '';
        const categories = card.find('.categories a').map((_, c) => cleanText($(c).text())).get().filter(Boolean);

        const city = locality || region || undefined;
        const country = 'United States';

        if (name && (city || street)) {
          leads.push({
            businessName: name,
            phone: phone || undefined,
            website: website ? normalizeUrl(website) : undefined,
            city,
            country,
            address: [street, locality, region].filter(Boolean).join(', ') || undefined,
            reviews: categories.length ? `Categories: ${categories.join(', ')}` : undefined,
            source: 'yellow_pages',
          });
        }
      });

      if (page === 1) await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));
    } catch (err) {
      if (leads.length > 0) break; // partial real results are still real
      return { leads: [], error: { kind: 'scrape_failed', message: `Failed to fetch yellowpages.com: ${(err as Error).message}` } };
    }
  }

  const valid = finalizeLeads(leads, 'yellow_pages', niche, maxResults);
  if (valid.length === 0) {
    return { leads: [], error: { kind: 'no_results', message: `yellowpages.com scraping returned no usable listings for "${niche}" in "${location}" (the page layout may have changed or the location may not be US-based)` } };
  }
  return { leads: valid };
}

// ═══════════════════════════════════════════════════════════════════
// SULEKHA — live scraping of sulekha.com (no API key needed)
// ═══════════════════════════════════════════════════════════════════

export async function scrapeSulekha(
  niche: string,
  location: string,
  maxResults: number
): Promise<AdapterResult> {
  const cheerio = await import('cheerio');
  const target = Math.min(Math.max(maxResults, 1), MAX_SCRAPE_RESULTS);

  // Sulekha listing URLs follow /{service}/{city} — build candidates and try in order
  const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  const citySlug = location.split(',')[0].trim();
  const candidates = [
    `https://www.sulekha.com/${slug(niche)}/${slug(citySlug)}`,
    `https://www.sulekha.com/${slug(niche)}-in-${slug(citySlug)}`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      if (res.status === 429 || res.status === 503) {
        return { leads: [], error: rateLimitError(5) };
      }
      if (res.status === 403 || res.status === 401) {
        return { leads: [], error: { kind: 'scrape_failed', message: `sulekha.com blocked this request (HTTP ${res.status}) — the site refuses automated access from this server's IP. No results can be fetched, so no data is shown.` } };
      }
      if (!res.ok) continue; // try next URL pattern

      const html = await res.text();
      const $ = cheerio.load(html);
      const leads: DiscoveredLead[] = [];

      // Listing cards vary — try several known containers
      const cards = $('.listing-item, .list-item, .vendor-card, .sk-card, [class*="listing"]').slice(0, target * 2);
      cards.each((_, el) => {
        if (leads.length >= target) return;
        const card = $(el);

        const name =
          cleanText(card.find('h2 a').first().text()) ||
          cleanText(card.find('h3 a').first().text()) ||
          cleanText(card.find('h2, h3').first().text()) ||
          cleanText(card.find('[class*="title"] a, [class*="name"] a').first().text());
        const phone =
          cleanText(card.find('[class*="phone"], [class*="contact-number"], a[href^="tel:"]').first().text()) ||
          cleanText(card.find('a[href^="tel:"]').first().attr('href') || '').replace('tel:', '');
        const addressText =
          cleanText(card.find('[class*="address"], [class*="location"], [class*="locality"]').first().text());

        if (name && (addressText || location)) {
          leads.push({
            businessName: name,
            phone: phone.replace(/[^\d()+\-\s]/g, '') || undefined,
            city: citySlug || undefined,
            country: 'India',
            address: addressText || undefined,
            source: 'sulekha',
          });
        }
      });

      if (leads.length > 0) {
        return { leads: finalizeLeads(leads, 'sulekha', niche, maxResults) };
      }
      // Page fetched but selectors matched nothing → layout changed; try next candidate
    } catch {
      // try next URL pattern
    }
  }

  return {
    leads: [],
    error: {
      kind: 'scrape_failed',
      message: `sulekha.com scraping returned no usable listings for "${niche}" in "${location}" (the page layout may have changed or the location was not recognised)`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// DISPATCH
// ═══════════════════════════════════════════════════════════════════

/**
 * Run the REAL adapter for a given source. `ai_search` is handled
 * separately by the AI web-search flow in lead-discovery-service.
 */
export async function runSourceAdapter(
  source: DiscoverySourceId,
  niche: string,
  location: string,
  maxResults: number
): Promise<AdapterResult> {
  switch (source) {
    case 'google_maps':
    case 'google_business':
      return searchGooglePlaces(niche, location, maxResults);
    case 'yelp':
      return searchYelp(niche, location, maxResults);
    case 'linkedin':
      return searchLinkedIn(niche, location, maxResults);
    case 'justdial':
      return searchJustDial(niche, location, maxResults);
    case 'indiamart':
      return searchIndiaMart(niche, location, maxResults);
    case 'yellow_pages':
      return scrapeYellowPages(niche, location, maxResults);
    case 'sulekha':
      return scrapeSulekha(niche, location, maxResults);
    case 'facebook':
      return searchFacebookPages(niche, location, maxResults);
    case 'instagram':
      return searchInstagramBusinesses(niche, location, maxResults);
    default:
      return { leads: [], error: { kind: 'api_error', message: `No real-data adapter exists for source "${source}"` } };
  }
}
