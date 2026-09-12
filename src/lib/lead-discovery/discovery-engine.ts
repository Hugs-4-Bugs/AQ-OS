// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Discovery Engine
// Google Custom Search API + Website Scraping + DB Persistence
//
// Flow: Search → Scrape → Deduplicate → Save → Summary
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAuditEvent } from '@/lib/lead-audit';
import { checkDuplicate } from '@/lib/lead-dedup-service';

// DYNAMIC IMPORT: cheerio is ~3MB. Load only when scraping to reduce startup memory.
// This prevents the module from being loaded at server boot.

// ===== TYPES =====

export interface DiscoveryConfig {
  niche: string;        // e.g. "restaurants", "law firms", "dentists"
  location: string;     // e.g. "London UK", "Mumbai India"
  maxLeads: number;     // e.g. 20
  targetGap: string;    // e.g. "no website", "outdated website", "no SEO"
}

export interface RawCompanyHit {
  name: string;
  website: string;
  description: string;
  phone: string;
}

export interface ScrapedCompanyData extends RawCompanyHit {
  email: string;
  phone: string;       // may be enriched from website
  techStack: string[];
  websiteReachable: boolean;
  scrapedAt: string;
  pageTitle: string;
  metaDescription: string;
  socialLinks: {
    linkedin: string;
    instagram: string;
    facebook: string;
  };
}

export interface DiscoverySummary {
  discovered: number;
  saved: number;
  skipped: number;
  leads: DiscoveryLeadResult[];
}

export interface DiscoveryLeadResult {
  id: string;
  businessName: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  stage: string;
  source: string;
  techStack: string[];
  websiteReachable: boolean;
  targetGap: string;
}

// ===== CONSTANTS =====

const MAX_SEARCH_RESULTS = 10;     // HARD LIMIT: never load more than 10 leads at once
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 1000;        // 1 second between batches
const WEBSITE_TIMEOUT_MS = 5000;    // 5 second timeout for website fetches (reduced from 8)
const MAX_HTML_SIZE = 500 * 1024;   // 500KB max — skip scraping if larger
const GOOGLE_SEARCH_BASE = 'https://www.googleapis.com/customsearch/v1';
const SERPAPI_BASE = 'https://serpapi.com/search.json';

// ===== MAIN EXPORT =====

/**
 * Run the lead discovery engine.
 *
 * STEP 1 — Search Google Custom Search API (or SerpAPI fallback)
 * STEP 2 — Scrape each company website with cheerio
 * STEP 3 — Save leads to DB (dedup by website)
 * STEP 4 — Return summary
 */
export async function runDiscovery(
  userId: string,
  config: DiscoveryConfig
): Promise<DiscoverySummary> {
  const { niche, location, maxLeads, targetGap } = config;

  console.log(`[DiscoveryEngine] Starting discovery: niche="${niche}" location="${location}" maxLeads=${maxLeads} targetGap="${targetGap}"`);

  // Audit: discovery started
  await logAuditEvent(userId, 'discovery_started', {
    engine: 'discovery-engine',
    niche,
    location,
    maxLeads,
    targetGap,
  });

  // ── STEP 0: Check search API availability ──────────────────────────
  if (!process.env.GOOGLE_SEARCH_API_KEY && !process.env.SERPAPI_KEY) {
    throw new Error(
      'No search API configured. Add GOOGLE_SEARCH_API_KEY + ' +
      'GOOGLE_SEARCH_ENGINE_ID or SERPAPI_KEY to environment variables.'
    );
  }

  // ── STEP 1: Search for companies ──────────────────────────────────
  const allRawHits = await searchCompanies(niche, location, maxLeads);
  // HARD LIMIT: cap at MAX_SEARCH_RESULTS to prevent OOM
  const rawHits = allRawHits.slice(0, MAX_SEARCH_RESULTS);
  if (allRawHits.length > MAX_SEARCH_RESULTS) {
    console.warn(`[DiscoveryEngine] Truncated search results from ${allRawHits.length} to ${MAX_SEARCH_RESULTS} to prevent OOM`);
  }
  console.log(`[DiscoveryEngine] Step 1 complete — ${rawHits.length} raw company hits found (capped at ${MAX_SEARCH_RESULTS})`);

  if (rawHits.length === 0) {
    await logAuditEvent(userId, 'discovery_completed', {
      engine: 'discovery-engine',
      niche,
      location,
      discovered: 0,
      saved: 0,
      skipped: 0,
      reason: 'no_search_results',
    });
    return { discovered: 0, saved: 0, skipped: 0, leads: [] };
  }

  // ── STEP 2: Scrape each company website (SEQUENTIAL — never Promise.all) ──
  const scrapedResults: ScrapedCompanyData[] = [];

  for (const hit of rawHits) {
    try {
      const scraped = await scrapeWebsite(hit);
      scrapedResults.push(scraped);
    } catch {
      // Scrape failed — still record with websiteReachable=false
      scrapedResults.push({
        ...hit,
        email: '',
        techStack: [],
        websiteReachable: false,
        scrapedAt: new Date().toISOString(),
        pageTitle: '',
        metaDescription: '',
        socialLinks: { linkedin: '', instagram: '', facebook: '' },
      });
    }
    // Breathing room between scrapes to prevent memory spikes
    await delay(500);
  }

  console.log(`[DiscoveryEngine] Step 2 complete — ${scrapedResults.length} companies scraped`);

  // ── STEP 3: Save to DB with dedup (SEQUENTIAL — never Promise.all) ──
  const savedLeads: DiscoveryLeadResult[] = [];
  let saved = 0;
  let skipped = 0;

  for (const scraped of scrapedResults) {
    const result = await saveLead(userId, scraped, niche, location, targetGap);
    if (result) {
      savedLeads.push(result);
      saved++;
    } else {
      skipped++;
    }
    // Breathing room between DB writes
    await delay(500);
  }

  console.log(`[DiscoveryEngine] Step 3 complete — saved=${saved} skipped=${skipped}`);

  // ── STEP 4: Return summary ────────────────────────────────────────
  const summary: DiscoverySummary = {
    discovered: rawHits.length,
    saved,
    skipped,
    leads: savedLeads,
  };

  await logAuditEvent(userId, 'discovery_completed', {
    engine: 'discovery-engine',
    niche,
    location,
    targetGap,
    discovered: summary.discovered,
    saved: summary.saved,
    skipped: summary.skipped,
  });

  return summary;
}

// ===== STEP 1: SEARCH =====

/**
 * Search for companies matching niche + location.
 * Tries Google Custom Search API first, falls back to SerpAPI.
 */
async function searchCompanies(
  niche: string,
  location: string,
  maxLeads: number
): Promise<RawCompanyHit[]> {
  const query = buildSearchQuery(niche, location);

  // Try Google Custom Search API first
  const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (googleApiKey && googleEngineId) {
    console.log(`[DiscoveryEngine] Using Google Custom Search API`);
    try {
      return await searchWithGoogle(query, googleApiKey, googleEngineId, maxLeads);
    } catch (err) {
      console.error('[DiscoveryEngine] Google Search API failed, trying SerpAPI fallback:', err);
    }
  }

  // Fallback to SerpAPI
  const serpApiKey = process.env.SERPAPI_KEY;
  if (serpApiKey) {
    console.log(`[DiscoveryEngine] Using SerpAPI fallback`);
    try {
      return await searchWithSerpAPI(query, serpApiKey, maxLeads);
    } catch (err) {
      console.error('[DiscoveryEngine] SerpAPI also failed:', err);
    }
  }

  // No search API available — throw with clear error message
  throw new Error(
    'No search API configured. Add GOOGLE_SEARCH_API_KEY + ' +
    'GOOGLE_SEARCH_ENGINE_ID or SERPAPI_KEY to environment variables.'
  );
}

/**
 * Build search query from niche + location.
 */
function buildSearchQuery(niche: string, location: string): string {
  // Multiple query patterns for better coverage
  const queries = [
    `"${niche}" in "${location}" contact`,
    `${niche} ${location} contact details`,
    `best ${niche} in ${location} reviews`,
  ];
  // Return the primary query (Google CSE handles OR internally)
  return queries[0];
}

/**
 * Google Custom Search API implementation.
 */
async function searchWithGoogle(
  query: string,
  apiKey: string,
  engineId: string,
  maxLeads: number
): Promise<RawCompanyHit[]> {
  const url = new URL(GOOGLE_SEARCH_BASE);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', engineId);
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(Math.min(maxLeads, 10))); // Google CSE max 10 per page

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Google Search API returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  if (!data.items || !Array.isArray(data.items)) {
    return [];
  }

  return data.items.map((item: Record<string, unknown>) => ({
    name: extractCompanyName(item),
    website: typeof item.link === 'string' ? item.link : '',
    description: typeof item.snippet === 'string' ? item.snippet : '',
    phone: extractPhoneFromText(String(item.snippet || '')),
  }));
}

/**
 * SerpAPI implementation as fallback.
 */
async function searchWithSerpAPI(
  query: string,
  apiKey: string,
  maxLeads: number
): Promise<RawCompanyHit[]> {
  const url = new URL(SERPAPI_BASE);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(maxLeads));
  url.searchParams.set('engine', 'google');

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`SerpAPI returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  const organicResults = data.organic_results || [];
  if (!Array.isArray(organicResults)) {
    return [];
  }

  return organicResults.map((item: Record<string, unknown>) => ({
    name: typeof item.title === 'string' ? item.title : '',
    website: typeof item.link === 'string' ? item.link : '',
    description: typeof item.snippet === 'string' ? item.snippet : '',
    phone: extractPhoneFromText(String(item.snippet || '')),
  }));
}

// ===== STEP 2: SCRAPE =====

/**
 * Scrape a company website using cheerio.
 * Extracts: page title, meta description, email, phone, social links, tech stack.
 * If the fetch fails or times out in 8 seconds, marks website as unreachable.
 */
async function scrapeWebsite(rawHit: RawCompanyHit): Promise<ScrapedCompanyData> {
  const scrapedAt = new Date().toISOString();

  if (!rawHit.website) {
    return {
      ...rawHit,
      email: '',
      techStack: [],
      websiteReachable: false,
      scrapedAt,
      pageTitle: '',
      metaDescription: '',
      socialLinks: { linkedin: '', instagram: '', facebook: '' },
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBSITE_TIMEOUT_MS);

    const response = await fetch(rawHit.website, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AcquisitionOS-Bot/1.0; +https://acquisitionos.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ...rawHit,
        email: '',
        techStack: [],
        websiteReachable: false,
        scrapedAt,
        pageTitle: '',
        metaDescription: '',
        socialLinks: { linkedin: '', instagram: '', facebook: '' },
      };
    }

    // Check content-length header before downloading full body
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_HTML_SIZE) {
      console.warn(`[DiscoveryEngine] Skipping large page (${(contentLength / 1024).toFixed(0)}KB > 500KB): ${rawHit.website}`);
      return {
        ...rawHit,
        email: '',
        techStack: ['Unknown'],
        websiteReachable: true,
        scrapedAt,
        pageTitle: '',
        metaDescription: '',
        socialLinks: { linkedin: '', instagram: '', facebook: '' },
      };
    }

    let html = await response.text();

    // Additional size check after download in case content-length was missing
    if (html.length > MAX_HTML_SIZE) {
      console.warn(`[DiscoveryEngine] Page too large (${(html.length / 1024).toFixed(0)}KB), truncating for analysis: ${rawHit.website}`);
      html = html.slice(0, MAX_HTML_SIZE);
    }

    // DYNAMIC IMPORT: Load cheerio only when actually scraping a website
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    // Extract page title
    const pageTitle = $('title').text().trim();

    // Extract meta description
    const metaDescription = $('meta[name="description"]').attr('content') || '';

    // Extract emails using regex
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const bodyText = $('body').text() || '';
    const emails = bodyText.match(emailRegex) || [];
    // Filter out common non-business emails
    const filteredEmails = emails.filter(
      (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg')
    );
    const email = filteredEmails[0] || '';

    // Extract phone numbers from page
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
    const phoneMatches = bodyText.match(phoneRegex) || [];
    const phone = rawHit.phone || phoneMatches[0] || '';

    // Extract social links
    const socialLinks = extractSocialLinks($);

    // Detect technology stack (BEFORE nulling html — detectTechStack reads raw html string)
    const techStack = detectTechStack($, html);

    // Free the raw HTML string from memory immediately after all extraction
    html = '';

    return {
      ...rawHit,
      email,
      phone,
      techStack,
      websiteReachable: true,
      scrapedAt,
      pageTitle,
      metaDescription,
      socialLinks,
    };
  } catch (err) {
    // Fetch failed or timed out — unreachable website is itself a gap signal
    console.warn(`[DiscoveryEngine] Website unreachable: ${rawHit.website}`, err instanceof Error ? err.message : err);
    return {
      ...rawHit,
      email: '',
      techStack: [],
      websiteReachable: false,
      scrapedAt,
      pageTitle: '',
      metaDescription: '',
      socialLinks: { linkedin: '', instagram: '', facebook: '' },
    };
  }
}

/**
 * Extract social media links from the page.
 */
function extractSocialLinks($: ReturnType<typeof import('cheerio').load>): { linkedin: string; instagram: string; facebook: string } {
  let linkedin = '';
  let instagram = '';
  let facebook = '';

  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href') || '';
    if (href.includes('linkedin.com/company') || href.includes('linkedin.com/in')) {
      if (!linkedin) linkedin = href;
    }
    if (href.includes('instagram.com/') && !href.includes('instagram.com/p/')) {
      if (!instagram) instagram = href;
    }
    if (href.includes('facebook.com/') && !href.includes('facebook.com/sharer') && !href.includes('facebook.com/share')) {
      if (!facebook) facebook = href;
    }
  });

  return { linkedin, instagram, facebook };
}

/**
 * Detect technology stack from HTML content.
 * Checks for WordPress, Shopify, Wix, Squarespace, and other common platforms.
 */
function detectTechStack($: ReturnType<typeof import('cheerio').load>, html: string): string[] {
  const techStack: string[] = [];

  // WordPress detection
  if (
    html.includes('wp-content') ||
    html.includes('wp-includes') ||
    $('meta[name="generator"][content*="WordPress"]').length > 0 ||
    $('link[href*="wp-content"]').length > 0
  ) {
    techStack.push('WordPress');
  }

  // Shopify detection
  if (
    html.includes('shopify.com') ||
    html.includes('Shopify.theme') ||
    $('script[src*="shopify"]').length > 0 ||
    $('link[href*="shopify"]').length > 0 ||
    html.includes('cdn.shopify.com')
  ) {
    techStack.push('Shopify');
  }

  // Wix detection
  if (
    html.includes('wix.com') ||
    html.includes('wixpress') ||
    $('meta[name="generator"][content*="Wix"]').length > 0 ||
    html.includes('static.wixstatic.com')
  ) {
    techStack.push('Wix');
  }

  // Squarespace detection
  if (
    html.includes('squarespace.com') ||
    $('meta[name="generator"][content*="Squarespace"]').length > 0 ||
    html.includes('static1.squarespace.com')
  ) {
    techStack.push('Squarespace');
  }

  // Webflow detection
  if (
    html.includes('webflow.com') ||
    html.includes('webflow.io') ||
    $('meta[name="generator"][content*="Webflow"]').length > 0
  ) {
    techStack.push('Webflow');
  }

  // Ghost detection
  if (
    $('meta[name="generator"][content*="Ghost"]').length > 0 ||
    html.includes('ghost.org')
  ) {
    techStack.push('Ghost');
  }

  // Joomla detection
  if (
    $('meta[name="generator"][content*="Joomla"]').length > 0 ||
    html.includes('/media/jui/')
  ) {
    techStack.push('Joomla');
  }

  // Drupal detection
  if (
    $('meta[name="generator"][content*="Drupal"]').length > 0 ||
    html.includes('Drupal.settings') ||
    html.includes('/misc/drupal.js')
  ) {
    techStack.push('Drupal');
  }

  // React detection
  if (
    html.includes('_reactRootContainer') ||
    html.includes('__NEXT_DATA__') ||
    html.includes('data-reactroot')
  ) {
    techStack.push('React');
  }

  // Next.js detection
  if (
    html.includes('__NEXT_DATA__') ||
    html.includes('_next/static') ||
    $('meta[name="next-head-count"]').length > 0
  ) {
    techStack.push('Next.js');
  }

  // Google Analytics detection
  if (
    html.includes('google-analytics.com') ||
    html.includes('gtag') ||
    html.includes('UA-') ||
    html.includes('G-')
  ) {
    techStack.push('Google Analytics');
  }

  // Google Tag Manager detection
  if (html.includes('googletagmanager.com') || html.includes('GTM-')) {
    techStack.push('Google Tag Manager');
  }

  // WooCommerce detection
  if (
    html.includes('woocommerce') ||
    $('meta[name="generator"][content*="WooCommerce"]').length > 0
  ) {
    techStack.push('WooCommerce');
  }

  // If nothing detected, mark as "Unknown"
  if (techStack.length === 0) {
    techStack.push('Unknown');
  }

  return techStack;
}

// ===== STEP 3: SAVE TO DB =====

/**
 * Save a scraped company as a Lead record in the database.
 * Skips if a Lead with the same website already exists for this userId.
 */
async function saveLead(
  userId: string,
  scraped: ScrapedCompanyData,
  niche: string,
  location: string,
  targetGap: string
): Promise<DiscoveryLeadResult | null> {
  try {
    // Parse location into city/country (best effort)
    const locationParts = location.split(',').map((s) => s.trim());
    const city = locationParts[0] || null;
    const country = locationParts[1] || locationParts[0] || null;

    // Check for duplicates by website domain
    if (scraped.website) {
      const existingLead = await db.lead.findFirst({
        where: {
          userId,
          website: scraped.website,
          isActive: true,
        },
      });

      if (existingLead) {
        console.log(`[DiscoveryEngine] Skipping duplicate: ${scraped.name} (${scraped.website})`);
        return null;
      }
    }

    // Also use the full dedup check
    const dupCheck = await checkDuplicate(userId, {
      businessName: scraped.name,
      website: scraped.website,
      email: scraped.email || undefined,
      phone: scraped.phone || undefined,
    });

    if (dupCheck.isDuplicate) {
      console.log(`[DiscoveryEngine] Dedup service matched: ${scraped.name} (field: ${dupCheck.matchField})`);
      return null;
    }

    // Determine website quality based on target gap and reachability
    const websiteQuality = determineWebsiteQuality(scraped, targetGap);

    // Build digital weaknesses from gap analysis
    const digitalWeaknesses = identifyDigitalWeaknesses(scraped, targetGap);

    // Build metadata JSON for techStack field
    const techStackMetadata = JSON.stringify({
      platforms: scraped.techStack,
      phone: scraped.phone || null,
      scrapedAt: scraped.scrapedAt,
      niche,
      location,
      targetGap,
      pageTitle: scraped.pageTitle || null,
      metaDescription: scraped.metaDescription || null,
    });

    // Create the lead
    const lead = await db.lead.create({
      data: {
        userId,
        businessName: scraped.name,
        website: scraped.website || null,
        email: scraped.email || null,
        phone: scraped.phone || null,
        linkedin: scraped.socialLinks.linkedin || null,
        instagram: scraped.socialLinks.instagram || null,
        facebook: scraped.socialLinks.facebook || null,
        city,
        country,
        niche,
        source: 'auto_discovery',
        stage: 'discovered',
        hasWebsite: scraped.websiteReachable,
        websiteQuality,
        digitalWeaknesses,
        techStack: techStackMetadata,
        opportunityNotes: scraped.description || null,
      },
    });

    console.log(`[DiscoveryEngine] Saved lead: ${scraped.name} (id: ${lead.id})`);

    return {
      id: lead.id,
      businessName: lead.businessName,
      website: lead.website,
      email: lead.email,
      phone: lead.phone,
      stage: lead.stage,
      source: lead.source || 'auto_discovery',
      techStack: scraped.techStack,
      websiteReachable: scraped.websiteReachable,
      targetGap,
    };
  } catch (err) {
    console.error(`[DiscoveryEngine] Failed to save lead: ${scraped.name}`, err);
    return null;
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Determine website quality based on scraped data and target gap.
 */
function determineWebsiteQuality(
  scraped: ScrapedCompanyData,
  targetGap: string
): string {
  if (!scraped.websiteReachable) {
    return 'none';
  }

  if (targetGap === 'no website') {
    return scraped.websiteReachable ? 'basic' : 'none';
  }

  if (targetGap === 'outdated website') {
    // If the tech stack is old (WordPress without recent updates), mark as outdated
    if (scraped.techStack.includes('Unknown') && !scraped.metaDescription) {
      return 'outdated';
    }
    return 'basic';
  }

  if (targetGap === 'no SEO') {
    if (!scraped.metaDescription && !scraped.pageTitle) {
      return 'poor_seo';
    }
    return 'basic';
  }

  return scraped.websiteReachable ? 'basic' : 'none';
}

/**
 * Identify digital weaknesses from scraped data and target gap.
 */
function identifyDigitalWeaknesses(
  scraped: ScrapedCompanyData,
  targetGap: string
): string {
  const weaknesses: string[] = [];

  if (!scraped.websiteReachable) {
    weaknesses.push('website_unreachable');
  }

  if (targetGap === 'no website' && !scraped.websiteReachable) {
    weaknesses.push('no_website');
  }

  if (targetGap === 'outdated website') {
    if (scraped.techStack.includes('Unknown')) {
      weaknesses.push('unknown_tech_stack');
    }
    if (!scraped.metaDescription) {
      weaknesses.push('no_meta_description');
    }
  }

  if (targetGap === 'no SEO') {
    if (!scraped.metaDescription) {
      weaknesses.push('missing_meta_description');
    }
    if (!scraped.pageTitle) {
      weaknesses.push('missing_page_title');
    }
  }

  // General weaknesses
  if (!scraped.email) {
    weaknesses.push('no_contact_email');
  }
  if (!scraped.socialLinks.linkedin && !scraped.socialLinks.instagram && !scraped.socialLinks.facebook) {
    weaknesses.push('no_social_presence');
  }
  if (scraped.techStack.includes('Wix') || scraped.techStack.includes('Squarespace')) {
    weaknesses.push('basic_website_builder');
  }

  return weaknesses.join(', ');
}

/**
 * Extract company name from a Google Custom Search result item.
 */
function extractCompanyName(item: Record<string, unknown>): string {
  // Try pagemap > metatags > og:site_name
  const pagemap = item.pagemap as Record<string, unknown> | undefined;
  if (pagemap) {
    const metatags = pagemap.metatags as Array<Record<string, string>> | undefined;
    if (metatags && metatags.length > 0) {
      const siteName =
        metatags[0]['og:site_name'] ||
        metatags[0]['og:title'] ||
        metatags[0]['twitter:title'];
      if (siteName) return siteName.trim();
    }
  }

  // Fall back to title, cleaned up
  const title = typeof item.title === 'string' ? item.title : '';
  return title
    .replace(/ - .*$/, '')    // Remove " - Something" suffixes
    .replace(/ \| .*$/, '')   // Remove " | Something" suffixes
    .replace(/ · .*$/, '')    // Remove " · Something" suffixes
    .trim();
}

/**
 * Extract phone number from free text using regex.
 */
function extractPhoneFromText(text: string): string {
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/;
  const match = text.match(phoneRegex);
  return match ? match[0].trim() : '';
}

/**
 * Simple delay utility.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
