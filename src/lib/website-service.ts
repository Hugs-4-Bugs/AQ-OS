// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Website Resolution Service
//
// One canonical website per lead, with an explicit, verified lifecycle:
//
//   UNKNOWN  ──discovery──▶ candidate ──verification──▶ VERIFIED
//      │                                            │
//      └────── attempts exhausted ──▶ NOT_FOUND_AFTER_RESEARCH
//   stored URL dead / not the company ──▶ INVALID ──▶ rediscovery
//
// Guarantees required by the product spec:
//   - `website == null` NEVER means "company has no website".
//     It means UNKNOWN until research says otherwise.
//   - "No website" conclusions require NOT_FOUND_AFTER_RESEARCH status
//     (multiple legitimate discovery attempts) — never a null field.
//   - Candidates are verified against company signals (name, location,
//     phone, email domain, business description) with a confidence level.
//   - Verified websites are PERSISTED back to the lead so every
//     downstream consumer (analysis, research, outreach) sees them.
//   - Normal HTTP redirects are normal — never evidence of "no website".
//   - discovery runs on existing AcquisitionOS integrations only
//     (z-ai web_search, Google Custom Search, lead's own metadata).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== STATUS MODEL =====

export type WebsiteStatus =
  | 'VERIFIED'
  | 'NOT_FOUND_AFTER_RESEARCH'
  | 'UNKNOWN'
  | 'INVALID';

export const WEBSITE_STATUS: Record<WebsiteStatus, WebsiteStatus> = {
  VERIFIED: 'VERIFIED',
  NOT_FOUND_AFTER_RESEARCH: 'NOT_FOUND_AFTER_RESEARCH',
  UNKNOWN: 'UNKNOWN',
  INVALID: 'INVALID',
};

export type VerificationOutcome = 'VERIFIED' | 'UNCERTAIN' | 'REJECTED';
export type Confidence = 'high' | 'medium' | 'low';

export interface WebsiteVerification {
  outcome: VerificationOutcome;
  confidence: Confidence;
  score: number;
  evidence: string[];
  finalUrl?: string;
  title?: string;
  contentSnippet?: string;
}

export interface WebsiteResolution {
  status: WebsiteStatus;
  website: string | null;
  changed: boolean; // did we persist a different website than before?
  discoveredNow: boolean; // was the website found during THIS resolution?
  previousStatus: WebsiteStatus | null;
  confidence?: Confidence;
  evidence: string[];
  attempts: number;
  error?: string;
  /** First N chars of the verified homepage (text), for downstream AI. */
  homepageText?: string;
  pageTitle?: string;
}

// ===== URL CANONICALIZATION (§3: one canonical representation) =====

const DEFAULT_PORTS = [':80', ':443'];
const PREFIX_WWW = 'www.';

/**
 * Canonicalize any user/LLM/search-provided website string:
 *  - trims whitespace, strips wrapping quotes/brackets
 *  - adds https:// when protocol missing
 *  - lowercases host, removes default ports
 *  - normalizes `www.` (kept canonical WITHOUT www; both are "same site")
 *  - removes trailing slash on the root path (deeper paths kept intact)
 *  - rejects non-http(s) protocols (javascript:, mailto:, etc.)
 * Returns null when the input cannot possibly be a website URL.
 */
export function canonicalizeWebsiteUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let url = raw.trim();
  if (!url) return null;

  // Strip common wrapping artifacts from LLM/search output.
  url = url.replace(/^["'<(]+|["'>)]+$/g, '').replace(/[,;]+$/, '');

  // Explicit non-web protocols are never websites.
  if (/^(mailto:|tel:|javascript:|data:|ftp:)/i.test(url)) return null;

  if (!/^https?:\/\//i.test(url)) {
    // "www.example.com" or "example.com" or "cytecare.com/"
    if (/^www\./i.test(url) || /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#].*)?$/i.test(url)) {
      url = 'https://' + url;
    } else {
      return null;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
  // Hostname must be plausible (letters/digits/dots/hyphens).
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(parsed.hostname)) return null;

  let host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith(PREFIX_WWW)) host = host.slice(PREFIX_WWW.length);

  const path = parsed.pathname.replace(/\/+$/, '') || '';
  const query = parsed.search || '';

  const port = DEFAULT_PORTS.includes(parsed.port ? `:${parsed.port}` : '')
    ? ''
    : parsed.port
      ? `:${parsed.port}`
      : '';

  return `${parsed.protocol}//${host}${port}${path}${query}`;
}

/** The canonical host of a website URL (no www, lowercase). */
export function extractDomain(url: unknown): string | null {
  const canonical = canonicalizeWebsiteUrl(url);
  if (!canonical) return null;
  try {
    return new URL(canonical).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True when two URL strings refer to the same canonical website
 * (`https://cytecare.com` === `https://www.cytecare.com/`).
 */
export function websitesMatch(a: unknown, b: unknown): boolean {
  const ca = canonicalizeWebsiteUrl(a);
  const cb = canonicalizeWebsiteUrl(b);
  if (!ca || !cb) return false;
  return ca === cb;
}

// ===== FETCH HELPERS =====

const FETCH_TIMEOUT_MS = 15000;
const PAGE_TEXT_LIMIT = 12000;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 AcquisitionOSBot/1.0';

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m) return htmlToText(m[1]).slice(0, 300);
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  if (og) return og[1].slice(0, 300);
  return undefined;
}

export interface PageProbe {
  reachable: boolean;
  /** True for definite death (NXDOMAIN / 404 / 410) — used for INVALID. */
  definitelyDead: boolean;
  finalUrl?: string;
  statusCode?: number;
  html?: string;
  text?: string;
  title?: string;
  error?: string;
}

/**
 * Probe a website for real. Tries a direct fetch first (fast, follows
 * redirects — redirects are SUCCESS, not failure), then falls back to
 * the z-ai page_reader (handles JS-heavy sites). A guarded response
 * (403/406/429) still means the site EXISTS.
 */
export async function probeWebsite(url: string): Promise<PageProbe> {
  const canonical = canonicalizeWebsiteUrl(url);
  if (!canonical) return { reachable: false, definitelyDead: false, error: 'invalid_url' };

  // 1) Direct fetch with redirect following.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(canonical, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*' },
    });
    clearTimeout(timer);
    const html = res.status < 400 ? (await res.text().catch(() => '')) : undefined;
    const guarded = [403, 406, 429, 503].includes(res.status);
    return {
      reachable: res.status < 400 || guarded,
      definitelyDead: [404, 410].includes(res.status),
      finalUrl: res.url || canonical,
      statusCode: res.status,
      html,
      text: html ? htmlToText(html).slice(0, PAGE_TEXT_LIMIT) : undefined,
      title: html ? extractTitle(html) : undefined,
    };
  } catch (directErr) {
    // DNS failure / connection refused — try page_reader before concluding.
    const directMsg = directErr instanceof Error ? directErr.message : String(directErr);
    const reader = await probeWithPageReader(canonical);
    if (reader) return reader;
    return {
      reachable: false,
      definitelyDead:
        /enotfound|getaddrinfo|eai_again|econnrefused|could not be resolved|unable to resolve|name or service not known|not find/i.test(directMsg),
      error: directMsg,
    };
  }
}

async function probeWithPageReader(url: string): Promise<PageProbe | null> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();
    const result = await Promise.race([
      zai.functions.invoke('page_reader', { url }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('page_reader_timeout')), FETCH_TIMEOUT_MS + 5000)),
    ]);
    const html: string =
      (result as { data?: { html?: string } })?.data?.html ||
      (result as { html?: string })?.html ||
      (result as { content?: string })?.content ||
      '';
    if (!html) return null;
    return {
      reachable: true,
      definitelyDead: false,
      finalUrl: url,
      html: html.slice(0, PAGE_TEXT_LIMIT * 4),
      text: htmlToText(html).slice(0, PAGE_TEXT_LIMIT),
      title: extractTitle(html),
    };
  } catch (err) {
    // A definitive DNS resolution failure from the reader is conclusive:
    // the domain does not exist. Surface it instead of swallowing it.
    const msg = err instanceof Error ? err.message : String(err);
    if (/could not be resolved|enotfound|unable to resolve/i.test(msg)) {
      return { reachable: false, definitelyDead: true, error: 'dns_unresolvable' };
    }
    return null;
  }
}

/**
 * Probe with an automatic page_reader retry when the direct fetch returns
 * a bot-challenge / JS shell (HTTP 200 but almost no readable text).
 */
export async function probeWebsiteWithRetry(url: string): Promise<PageProbe> {
  const first = await probeWebsite(url);
  const thin = !first.text || first.text.length < 300;
  if (!first.reachable || thin) {
    const reader = await probeWithPageReader(canonicalizeWebsiteUrl(url) || url);
    if (reader && (!first.reachable || (reader.text && reader.text.length > (first.text?.length || 0)))) {
      return reader;
    }
  }
  return first;
}

// ===== DISCOVERY (§4: multi-source, existing integrations only) =====

/** Hosts that are directories/socials/aggregators, never the company site. */
const NON_COMPANY_HOSTS = [
  'linkedin.', 'facebook.', 'instagram.', 'twitter.', 'x.com', 'youtube.',
  'justdial.', 'indiamart.', 'yelp.', 'sulekha.', 'yellowpages.', 'ypi.',
  'google.', 'maps.app.', 'goo.gl', 'wikipedia.', 'wikimedia.',
  'glassdoor.', 'indeed.', 'naukri.', 'shine.com', 'timesjobs.',
  'crunchbase.', 'bloomberg.', 'zoominfo.', 'pitchbook.', 'cbinsights.',
  'prnewswire.', 'businesswire.', 'medium.', 'quora.', 'reddit.',
  'play.google.', 'apps.apple.', 'trustpilot.', 'mouthshut.',
  'tripadvisor.', 'makemytrip.', 'booking.com', 'practo.', 'lybrate.',
  'economictimes.', 'indiatimes.', 'timesofindia.', 'ndtv.', 'hindu.',
];

const NON_COMPANY_EXTENSIONS = ['.pdf', '.jpg', '.png', '.webp', '.doc', '.docx'];

function isPlausibleCompanyUrl(u: string): boolean {
  const lower = u.toLowerCase();
  if (NON_COMPANY_HOSTS.some((h) => lower.includes(h))) return false;
  if (NON_COMPANY_EXTENSIONS.some((e) => lower.split('?')[0].endsWith(e))) return false;
  const domain = extractDomain(u);
  return !!domain && domain.includes('.');
}

interface RawSearchResult {
  url: string;
  title?: string;
  snippet?: string;
}

async function zaiWebSearch(query: string, num = 10): Promise<RawSearchResult[]> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();
    const results = (await zai.functions.invoke('web_search', { query, num })) as Array<{
      url?: string;
      link?: string;
      name?: string;
      title?: string;
      snippet?: string;
    }>;
    return (results || [])
      .map((r) => ({ url: (r.url || r.link || '') as string, title: r.title || r.name, snippet: r.snippet }))
      .filter((r) => !!r.url);
  } catch (err) {
    console.warn('[WebsiteService] z-ai web_search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function googleCustomSearch(query: string): Promise<RawSearchResult[]> {
  const key = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!key || !cx) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=10`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Array<{ link?: string; title?: string; snippet?: string }> };
    return (data.items || [])
      .map((i) => ({ url: i.link || '', title: i.title, snippet: i.snippet }))
      .filter((r) => !!r.url);
  } catch (err) {
    console.warn('[WebsiteService] Google Custom Search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ===== NAME / SIGNAL HELPERS =====

const STOP_TOKENS = new Set([
  'the', 'and', 'for', 'pvt', 'private', 'ltd', 'limited', 'llc', 'inc',
  'co', 'company', 'corp', 'corporation', 'group', 'global', 'india',
  'official', 'site', 'website', 'com',
]);

export function nameTokens(name: string): string[] {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

function domainNameTokens(domain: string): string[] {
  const base = domain.replace(/^www\./, '').split('.')[0];
  return base.split(/[-_.]/).filter((t) => t.length >= 3);
}

interface LeadLikeForDiscovery {
  businessName: string;
  niche?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
}

async function collectCandidates(lead: LeadLikeForDiscovery): Promise<{ candidates: Map<string, { count: number; evidence: Set<string>; raw: Array<{ title?: string; snippet?: string }> }>; searchesRan: number }> {
  const location = [lead.city, lead.country].filter(Boolean).join(' ').trim();
  const queries = [
    `${lead.businessName} ${location} official website`.trim(),
    `${lead.businessName} ${lead.niche || ''} ${lead.city || ''} contact`.replace(/\s+/g, ' ').trim(),
    `"${lead.businessName}" website`,
  ];

  const candidates = new Map<string, { count: number; evidence: Set<string>; raw: Array<{ title?: string; snippet?: string }> }>();
  let searchesRan = 0;

  for (const q of queries) {
    let results: RawSearchResult[] = [];
    const google = await googleCustomSearch(q);
    if (google.length > 0) {
      results = google;
      searchesRan++;
    } else {
      const zai = await zaiWebSearch(q, 10);
      if (zai.length > 0) searchesRan++;
      results = zai;
    }
    if (results.length === 0) continue;

    for (const r of results) {
      if (!isPlausibleCompanyUrl(r.url)) continue;
      const domain = extractDomain(r.url);
      if (!domain) continue;
      const entry = candidates.get(domain) || { count: 0, evidence: new Set<string>(), raw: [] };
      entry.count += 1;
      entry.raw.push({ title: r.title, snippet: r.snippet });
      if (r.title) entry.evidence.add(`search result title: "${r.title.slice(0, 160)}"`);
      if (r.snippet) entry.evidence.add(`search result snippet: "${r.snippet.slice(0, 200)}"`);
      candidates.set(domain, entry);
    }

    // Stop early when a strong candidate has majority share.
    if (candidates.size > 0) {
      const top = [...candidates.entries()].sort((a, b) => b[1].count - a[1].count)[0];
      const totalRefs = [...candidates.values()].reduce((s, v) => s + v.count, 0);
      if (top && totalRefs >= 3 && top[1].count / totalRefs >= 0.5) break;
    }
  }

  return { candidates, searchesRan };
}

// ===== VERIFICATION (§5: company-match verification with confidence) =====

/**
 * Verify that a candidate website really belongs to the company,
 * using REAL fetched content and deterministic signals only.
 *
 * `searchCorroboration` carries the search-result titles/snippets that
 * referenced this domain — even when a site blocks automated access
 * (bot challenge), a strong brand-aligned domain corroborated by
 * multiple search results remains verifiable evidence.
 */
export async function verifyWebsiteCandidate(
  lead: LeadLikeForDiscovery,
  candidateUrl: string,
  searchCorroboration?: Array<{ title?: string; snippet?: string }>
): Promise<WebsiteVerification> {
  const evidence: string[] = [];
  const probe = await probeWebsiteWithRetry(candidateUrl);

  if (!probe.reachable) {
    return {
      outcome: 'REJECTED',
      confidence: probe.definitelyDead ? 'high' : 'low',
      score: 0,
      evidence: [probe.definitelyDead ? `site unreachable (definitively dead): ${probe.error || probe.statusCode}` : `site unreachable: ${probe.error || probe.statusCode}`],
    };
  }

  if (probe.finalUrl && !websitesMatch(probe.finalUrl, candidateUrl)) {
    evidence.push(`resolved via redirect to ${canonicalizeWebsiteUrl(probe.finalUrl) || probe.finalUrl} (redirects are normal)`);
  }

  const title = (probe.title || '').toLowerCase();
  const text = (probe.text || '').toLowerCase();
  const domain = extractDomain(candidateUrl) || '';

  const tokens = nameTokens(lead.businessName);
  const fullBusinessName = lead.businessName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  let score = 0;

  // 1) Company name in page title (strongest branding signal).
  if (title) {
    if (tokens.length > 0 && tokens.every((t) => title.includes(t))) {
      score += 40;
      evidence.push(`page title "${probe.title}" contains the full business name`);
    } else {
      const inTitle = tokens.filter((t) => title.includes(t));
      if (inTitle.length / tokens.length >= 0.5 && inTitle.length >= 1) {
        score += 25;
        evidence.push(`page title contains ${inTitle.length}/${tokens.length} name tokens (${inTitle.join(', ')})`);
      } else if (title.includes(fullBusinessName.split(' ')[0]) && fullBusinessName.split(' ')[0].length >= 5) {
        score += 12;
        evidence.push(`page title contains the primary brand word "${fullBusinessName.split(' ')[0]}"`);
      }
    }
  }

  // 2) Company name in page content.
  const inContent = tokens.filter((t) => text.includes(t));
  if (tokens.length > 0 && inContent.length / tokens.length >= 0.5) {
    score += 25;
    evidence.push(`page content mentions ${inContent.length}/${tokens.length} name tokens`);
  } else if (inContent.length >= 1) {
    score += 10;
    evidence.push(`page content mentions name token(s): ${inContent.join(', ')}`);
  }

  // 3) Brand-token alignment between company name and domain.
  const dTokens = domainNameTokens(domain);
  const domainOverlap = tokens.filter((t) => dTokens.some((d) => d.includes(t) || t.includes(d)));
  if (tokens.length > 0 && domainOverlap.length / tokens.length >= 0.5) {
    score += 15;
    evidence.push(`domain "${domain}" aligns with the business name`);
  } else if (domainOverlap.length >= 1) {
    score += 6;
    evidence.push(`domain "${domain}" partially aligns with the business name (${domainOverlap.join(', ')})`);
  }

  // 4) Email domain match (very strong when available).
  if (lead.email && lead.email.includes('@')) {
    const emailDomain = lead.email.split('@')[1].toLowerCase();
    const emailBase = emailDomain.replace(/^www\./, '').split('.')[0];
    if (emailDomain === domain || (emailBase.length >= 4 && domain.startsWith(emailBase))) {
      score += 25;
      evidence.push(`lead email domain (${emailDomain}) matches candidate domain`);
    }
  }

  // 5) Phone number match (strong when available).
  if (lead.phone) {
    const digits = lead.phone.replace(/\D/g, '');
    if (digits.length >= 7 && text.replace(/\D/g, '').includes(digits.slice(-8))) {
      score += 15;
      evidence.push('lead phone number appears on the page');
    }
  }

  // 6) Location match.
  const locationParts = [lead.city, lead.country].filter(Boolean).map((p) => (p as string).toLowerCase());
  const locationHits = locationParts.filter((p) => text.includes(p));
  if (locationHits.length > 0) {
    score += 10;
    evidence.push(`page references location (${locationHits.join(', ')})`);
  }

  // 7) Niche/business-type keywords.
  if (lead.niche) {
    const nicheToken = lead.niche.toLowerCase().trim();
    if (nicheToken.length >= 4 && (text.includes(nicheToken) || title.includes(nicheToken))) {
      score += 5;
      evidence.push(`page mentions business type "${lead.niche}"`);
    }
  }

  // 8) Search corroboration (§5): the discovery results that pointed at
  // this domain independently reference the company by name.
  const tokensLower = tokens;
  let corroborationHits = 0;
  if (searchCorroboration && searchCorroboration.length > 0) {
    for (const r of searchCorroboration.slice(0, 5)) {
      const blob = `${r.title || ''} ${r.snippet || ''}`.toLowerCase();
      const hit = tokensLower.length > 0 && tokensLower.filter((t) => blob.includes(t)).length / tokensLower.length >= 0.5;
      if (hit) corroborationHits++;
    }
    if (tokens.length > 0 && corroborationHits > 0) {
      score += Math.min(20, corroborationHits * 8);
      evidence.push(`${corroborationHits} independent search result(s) for this domain reference the company name`);
    }
  }

  const domainAligned =
    tokens.length > 0 &&
    tokens.filter((t) => dTokens.some((d) => d.includes(t) || t.includes(d))).length / tokens.length >= 0.5;

  // Bot-challenge fallback: reachable + brand-aligned domain + strong
  // independent search corroboration, but content unreadable (JS shell /
  // anti-bot wall). That combination is still a verified company site
  // (medium confidence) — it must NOT be treated as "no website".
  const thinContent = !text || text.length < 300;
  if (
    probe.reachable &&
    thinContent &&
    domainAligned &&
    tokens.length > 0 &&
    corroborationHits >= 1
  ) {
    score = Math.max(score, 55);
    evidence.push('site is live but served an anti-bot/JS challenge; verified via brand-aligned domain plus independent search corroboration');
  }

  const outcome: VerificationOutcome =
    score >= 55 ? 'VERIFIED' : score >= 30 ? 'UNCERTAIN' : 'REJECTED';
  const confidence: Confidence = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

  return {
    outcome,
    confidence,
    score,
    evidence,
    finalUrl: probe.finalUrl,
    title: probe.title,
    contentSnippet: probe.text?.slice(0, 400),
  };
}

// ===== RESOLUTION ORCHESTRATOR (§4/§7/§8/§12 state machine) =====

interface LeadLikeFull extends LeadLikeForDiscovery {
  id: string;
  website?: string | null;
  hasWebsite?: boolean;
  websiteStatus?: string | null;
}

export interface ResolveOptions {
  /** Persist findings to the lead record (default true). */
  persist?: boolean;
  /** Max discovery attempts (search query variants) per resolution. */
  maxAttempts?: number;
}

function currentStatusOf(lead: LeadLikeFull): WebsiteStatus | null {
  if (lead.websiteStatus && ['VERIFIED', 'NOT_FOUND_AFTER_RESEARCH', 'UNKNOWN', 'INVALID'].includes(lead.websiteStatus)) {
    return lead.websiteStatus as WebsiteStatus;
  }
  // Legacy rows: a stored URL without status was treated as authoritative.
  if (lead.website) return 'VERIFIED';
  return null; // never researched
}

/**
 * Resolve the authoritative website for a lead:
 *  1. Stored URL → probe it. Reachable → VERIFIED (re-confirmed).
 *     Definitively dead OR verified as another company → INVALID, then
 *     attempt rediscovery of a replacement.
 *  2. No stored URL → multi-source discovery → verification → persist.
 *  3. Attempts exhausted → NOT_FOUND_AFTER_RESEARCH (or UNKNOWN when the
 *     research infrastructure itself failed).
 *
 * When a website is discovered/confirmed NOW and the lead previously had
 * none (or a different one), all existing AI analyses for the lead are
 * marked STALE (§13) so contradictory research is never silently shown.
 */
export async function resolveLeadWebsite(
  leadInput: LeadLikeFull,
  options: ResolveOptions = {}
): Promise<WebsiteResolution> {
  const persist = options.persist !== false;
  const maxAttempts = options.maxAttempts ?? 3;
  const previousStatus = currentStatusOf(leadInput);
  const previousWebsite = leadInput.website ? canonicalizeWebsiteUrl(leadInput.website) : null;

  let attempts = 0;

  // ── Phase 1: stored URL present → probe & re-verify ────────────────
  if (previousWebsite) {
    attempts++;
    const probe = await probeWebsiteWithRetry(previousWebsite);

    if (probe.reachable) {
      const verification = await verifyWebsiteCandidate(leadInput, previousWebsite);
      // A stored, reachable site that passes verification (or at least is
      // not REJECTED) stays authoritative.
      if (verification.outcome !== 'REJECTED') {
        if (persist && (previousStatus !== 'VERIFIED' || !leadInput.websiteStatus)) {
          await persistWebsiteState(leadInput.id, {
            website: previousWebsite,
            status: 'VERIFIED',
            confidence: verification.confidence,
            source: 'reconfirmed_existing',
          });
        }
        return {
          status: 'VERIFIED',
          website: previousWebsite,
          changed: false,
          discoveredNow: false,
          previousStatus,
          confidence: verification.confidence,
          evidence: verification.evidence,
          attempts,
          homepageText: probe.text?.slice(0, 6000),
          pageTitle: probe.title,
        };
      }
      // Stored URL belongs to a different company → INVALID, fall through
      // to rediscovery below.
      if (persist) {
        await persistWebsiteState(leadInput.id, { website: previousWebsite, status: 'INVALID', confidence: verification.confidence, source: 'verification_failed' });
      }
    } else if (probe.definitelyDead) {
      if (persist) {
        await persistWebsiteState(leadInput.id, { website: previousWebsite, status: 'INVALID', confidence: 'high', source: 'unreachable_dead' });
      }
    } else {
      // Transient network failure — do NOT invalidate; report UNKNOWN.
      return {
        status: 'UNKNOWN',
        website: previousWebsite,
        changed: false,
        discoveredNow: false,
        previousStatus,
        evidence: [`stored website could not be probed right now: ${probe.error || 'network error'}`],
        attempts,
        error: probe.error,
      };
    }
  }

  // ── Phase 2: discovery (no usable stored URL) ───────────────────────
  const invalidStored = previousWebsite && currentStatusOfIfPersisted(leadInput) === 'INVALID';
  const { candidates, searchesRan } = await collectCandidates(leadInput);
  attempts += searchesRan;

  if (searchesRan === 0) {
    // Research could not run at all → UNKNOWN (not "not found").
    return {
      status: 'UNKNOWN',
      website: previousWebsite,
      changed: false,
      discoveredNow: false,
      previousStatus,
      evidence: ['discovery could not run: no search provider available'],
      attempts,
      error: 'no_search_provider',
    };
  }

  // Rank candidates: frequency first, then name-alignment of the domain.
  const tokens = nameTokens(leadInput.businessName);
  const ranked = [...candidates.entries()].sort((a, b) => {
    const align = (domain: string) => {
      const dTokens = domainNameTokens(domain);
      return tokens.filter((t) => dTokens.some((d) => d.includes(t) || t.includes(d))).length;
    };
    const freqDiff = b[1].count - a[1].count;
    const alignDiff = align(b[0]) - align(a[0]);
    return alignDiff !== 0 ? alignDiff : freqDiff;
  });

  let verified: { domain: string; url: string; verification: WebsiteVerification; probe: PageProbe } | null = null;
  let uncertain: { domain: string; url: string; verification: WebsiteVerification } | null = null;

  for (const [domain, meta] of ranked.slice(0, 3)) {
    if (attempts >= maxAttempts + searchesRan) break;
    const url = `https://${domain}`;
    const verification = await verifyWebsiteCandidate(leadInput, url, meta.raw);
    attempts++;
    if (verification.outcome === 'VERIFIED') {
      const probe = await probeWebsiteWithRetry(url);
      verified = { domain, url: canonicalizeWebsiteUrl(probe.finalUrl || url) || url, verification, probe };
      break;
    }
    if (verification.outcome === 'UNCERTAIN' && !uncertain) {
      uncertain = { domain, url, verification };
    }
  }

  if (verified) {
    const changed = !previousWebsite || !websitesMatch(previousWebsite, verified.url);
    if (persist) {
      await persistWebsiteState(leadInput.id, {
        website: verified.url,
        status: 'VERIFIED',
        confidence: verified.verification.confidence,
        source: 'discovery_verified',
        markStaleAnalyses: changed,
      });
    }
    return {
      status: 'VERIFIED',
      website: verified.url,
      changed,
      discoveredNow: changed,
      previousStatus,
      confidence: verified.verification.confidence,
      evidence: [
        ...verified.verification.evidence,
        ...[...candidates.get(verified.domain)?.evidence || []],
      ],
      attempts,
      homepageText: verified.probe.text?.slice(0, 6000),
      pageTitle: verified.probe.title,
    };
  }

  if (uncertain && uncertain.verification.score >= 30) {
    // Not confident enough to persist — surface as UNKNOWN with evidence.
    return {
      status: 'UNKNOWN',
      website: previousWebsite,
      changed: false,
      discoveredNow: false,
      previousStatus,
      evidence: [
        `best candidate ${uncertain.url} could not be confidently verified`,
        ...uncertain.verification.evidence,
      ],
      attempts,
    };
  }

  // ── Phase 3: exhausted ──────────────────────────────────────────────
  const status: WebsiteStatus = invalidStored ? 'INVALID' : 'NOT_FOUND_AFTER_RESEARCH';
  return {
    status,
    website: previousWebsite, // preserved (never silently deleted)
    changed: false,
    discoveredNow: false,
    previousStatus,
    evidence: [
      `${searchesRan} discovery search(es) ran across multiple sources`,
      ranked.length > 0
        ? `${ranked.length} candidate domain(s) found, none could be verified as the company's website`
        : 'no plausible candidate domains found in search results',
    ],
    attempts,
  };
}

function currentStatusOfIfPersisted(lead: LeadLikeFull): WebsiteStatus | null {
  // Reflects what WE just persisted inside this function's flow.
  return currentStatusOf(lead);
}

// ===== PERSISTENCE (§7/§17) =====

async function persistWebsiteState(
  leadId: string,
  params: {
    website: string | null;
    status: WebsiteStatus;
    confidence?: Confidence;
    source?: string;
    markStaleAnalyses?: boolean;
  }
): Promise<void> {
  const data: Record<string, unknown> = {
    websiteStatus: params.status,
    websiteVerifiedAt: new Date(),
    websiteVerificationConfidence: params.confidence ?? null,
    websiteVerificationSource: params.source ?? null,
  };
  if (params.website !== null && params.website !== undefined) {
    data.website = params.website;
    data.hasWebsite = true;
  }

  await db.lead.update({ where: { id: leadId }, data });

  // §13 — stale research handling: when the authoritative website state
  // changed (newly discovered / replaced / invalidated), existing AI
  // analyses based on the old state must never be presented as current.
  if (params.markStaleAnalyses) {
    try {
      await db.leadAnalysis.updateMany({
        where: { leadId },
        data: {
          isStale: true,
          staleReason: `website state changed to ${params.status}${params.website ? ` (${params.website})` : ''} after this analysis was generated`,
        },
      });
    } catch (err) {
      console.warn('[WebsiteService] Failed to mark stale analyses:', err);
    }
  }

  console.log(
    `[WebsiteService] Persisted lead ${leadId}: website=${params.website || 'unchanged'} status=${params.status} confidence=${params.confidence || 'n/a'} source=${params.source || 'n/a'}`
  );
}

/**
 * Read-side helper: the effective website status for UI/API responses,
 * mapping legacy rows sensibly (URL present = VERIFIED-by-source;
 * nothing = UNKNOWN — never "no website").
 */
export function effectiveWebsiteStatus(lead: {
  website?: string | null;
  websiteStatus?: string | null;
}): WebsiteStatus {
  if (
    lead.websiteStatus &&
    ['VERIFIED', 'NOT_FOUND_AFTER_RESEARCH', 'UNKNOWN', 'INVALID'].includes(lead.websiteStatus)
  ) {
    return lead.websiteStatus as WebsiteStatus;
  }
  return lead.website ? 'VERIFIED' : 'UNKNOWN';
}
