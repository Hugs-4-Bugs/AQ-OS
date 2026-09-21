// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Discovery Service
// Phase 7: Lead Discovery Engine + Scraping + Enrichment
//
// Async job-based discovery using z-ai-web-dev-sdk
// Supports: ai_search, google_maps, justdial, indiamart, yelp, etc.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { deductCredits, CREDIT_COSTS } from '@/lib/credit-service';
import { logAuditEvent } from '@/lib/lead-audit';
import { checkDuplicate } from '@/lib/lead-dedup-service';
import { createNotificationOnce } from '@/lib/notification-service';
import ZAI from 'z-ai-web-dev-sdk';
import {
  getSourceStatusInfo,
  type DiscoverySourceId,
} from '@/lib/lead-discovery/source-registry';
import {
  runSourceAdapter,
} from '@/lib/lead-discovery/source-adapters';

// ===== TYPES =====

export type DiscoverySource =
  | 'all'
  | 'ai_search'
  | 'google_maps'
  | 'google_business'
  | 'justdial'
  | 'indiamart'
  | 'yelp'
  | 'yellow_pages'
  | 'sulekha'
  | 'linkedin'
  | 'instagram'
  | 'facebook';

// Sources fanned out (in parallel) when the user selects "all".
// Keep in sync with the client-side ALL_SOURCES_COUNT (7).
const ALL_DISCOVERY_SOURCES: DiscoverySource[] = [
  'ai_search',
  'google_maps',
  'linkedin',
  'justdial',
  'indiamart',
  'yellow_pages',
  'sulekha',
];

export interface DiscoveryParams {
  niche: string;
  country: string;
  city?: string;
  source: DiscoverySource;
  maxResults?: number;
  requirements?: string;
}

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
  /** REAL street address or provider context (stored in Lead.notes). */
  address?: string;
}

export interface DiscoveryJobResult {
  jobId: string;
  status: string;
  message: string;
}

export interface DiscoveryJobStatus {
  id: string;
  status: string;
  source: string;
  niche: string;
  country: string;
  city: string | null;
  totalFound: number;
  imported: number;
  duplicates: number;
  failed: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  resultData?: DiscoveredLead[];
}

// ===== CONSTANTS =====

const MAX_CONCURRENT_JOBS = parseInt(process.env.DISCOVERY_MAX_CONCURRENT_JOBS || '3', 10);
const RESULTS_PER_JOB = parseInt(process.env.DISCOVERY_RESULTS_PER_JOB || '50', 10);
const CREDIT_COST_PER_LEAD = CREDIT_COSTS.lead_discovery;

// ===== JOB MANAGEMENT =====

/**
 * Start a discovery job — creates job record and kicks off async processing.
 * Returns job ID immediately (non-blocking).
 */
export async function startDiscoveryJob(
  userId: string,
  params: DiscoveryParams,
  orgId?: string
): Promise<DiscoveryJobResult> {
  // Validate params
  if (!params.niche || !params.country || !params.source) {
    return {
      jobId: '',
      status: 'failed',
      message: 'Missing required fields: niche, country, source',
    };
  }

  // ── PRE-FLIGHT SOURCE CHECK ────────────────────────────────────────
  // A source without its real credentials is NEVER run. We refuse the job
  // up-front with the exact configuration message instead of returning
  // fake, mock, or placeholder leads.
  if (params.source !== 'all' && params.source !== 'ai_search') {
    const sourceInfo = getSourceStatusInfo(params.source as DiscoverySourceId);
    if (sourceInfo.status !== 'connected') {
      await logAuditEvent(userId, 'discovery_source_not_configured', {
        source: params.source,
        status: sourceInfo.status,
        missing: sourceInfo.requiredEnvVars.map((v) => v.name),
      });
      return {
        jobId: '',
        status: 'failed',
        message: sourceInfo.configMessage,
      };
    }
  }

  // Check concurrent job limit
  const runningJobs = await db.discoveryJob.count({
    where: { userId, status: { in: ['pending', 'running'] } },
  });

  if (runningJobs >= MAX_CONCURRENT_JOBS) {
    return {
      jobId: '',
      status: 'failed',
      message: `Maximum concurrent discovery jobs (${MAX_CONCURRENT_JOBS}) reached. Please wait for existing jobs to complete.`,
    };
  }

  // Estimate credits needed (minimum 1)
  const estimatedResults = Math.min(params.maxResults || RESULTS_PER_JOB, RESULTS_PER_JOB);
  const creditsNeeded = estimatedResults * CREDIT_COST_PER_LEAD;

  // Create job record
  const job = await db.discoveryJob.create({
    data: {
      userId,
      status: 'pending',
      source: params.source,
      niche: params.niche,
      country: params.country,
      city: params.city || null,
      totalFound: 0,
      imported: 0,
      duplicates: 0,
      failed: 0,
    },
  });

  // Audit log
  await logAuditEvent(userId, 'discovery_started', {
    jobId: job.id,
    source: params.source,
    niche: params.niche,
    country: params.country,
    city: params.city,
    estimatedResults,
    creditsNeeded,
  });

  // Kick off async processing (non-blocking)
  processDiscoveryJob(job.id, userId, params, orgId).catch((err) => {
    console.error(`[DiscoveryService] Job ${job.id} failed:`, err);
  });

  return {
    jobId: job.id,
    status: 'pending',
    message: `Discovery job started. Estimated ${estimatedResults} leads. Job ID: ${job.id}`,
  };
}

/**
 * Get discovery job status by ID.
 */
export async function getDiscoveryJobStatus(jobId: string, userId: string): Promise<DiscoveryJobStatus | null> {
  const job = await db.discoveryJob.findFirst({
    where: { id: jobId, userId },
  });

  if (!job) return null;

  const resultData = job.resultData ? JSON.parse(job.resultData) : undefined;

  return {
    id: job.id,
    status: job.status,
    source: job.source,
    niche: job.niche,
    country: job.country,
    city: job.city,
    totalFound: job.totalFound,
    imported: job.imported,
    duplicates: job.duplicates,
    failed: job.failed,
    errorMessage: job.errorMessage,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    resultData,
  };
}

/**
 * List all discovery jobs for a user.
 */
export async function listDiscoveryJobs(
  userId: string,
  options?: { limit?: number; offset?: number; status?: string }
): Promise<{ jobs: DiscoveryJobStatus[]; total: number }> {
  const where: Record<string, unknown> = { userId };
  if (options?.status) where.status = options.status;

  const [jobs, total] = await Promise.all([
    db.discoveryJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 20,
      skip: options?.offset || 0,
    }),
    db.discoveryJob.count({ where }),
  ]);

  return {
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      source: job.source,
      niche: job.niche,
      country: job.country,
      city: job.city,
      totalFound: job.totalFound,
      imported: job.imported,
      duplicates: job.duplicates,
      failed: job.failed,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    })),
    total,
  };
}

// ===== ASYNC JOB PROCESSOR =====

/**
 * Process a discovery job in the background.
 * Uses z-ai-web-dev-sdk for web search + LLM extraction.
 */
async function processDiscoveryJob(
  jobId: string,
  userId: string,
  params: DiscoveryParams,
  orgId?: string
): Promise<void> {
  // Mark as running
  await db.discoveryJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    const maxResults = Math.min(params.maxResults || RESULTS_PER_JOB, RESULTS_PER_JOB);

    // Step 1: Use web search to find businesses
    let zai: ZAI;
    try {
      zai = await ZAI.create();
    } catch {
      throw new Error('Failed to initialize AI SDK. Check API configuration.');
    }

    // Step 1a: Gather discovered leads — single source, or parallel fan-out across
    // all configured sources when the user selected "all" (merged + deduplicated).
    let discoveredLeads: DiscoveredLead[] = [];
    let skippedSourceNotes: string[] = [];

    if (params.source === 'all') {
      // Distribute the per-source quota across the configured sources
      const perSourceLimit = Math.min(
        Math.max(5, Math.ceil(maxResults / ALL_DISCOVERY_SOURCES.length)),
        RESULTS_PER_JOB
      );

      console.log(`[DiscoveryService] "all" mode: fanning out to ${ALL_DISCOVERY_SOURCES.length} sources in parallel (per-source limit ${perSourceLimit})`);

      const settled = await Promise.allSettled(
        ALL_DISCOVERY_SOURCES.map((src) =>
          discoverFromSource(zai, { ...params, source: src, maxResults: perSourceLimit }, perSourceLimit)
        )
      );

      // Merge fulfilled results; each lead keeps its own per-source tag.
      // Rejected sources are recorded as honest skip notes (config errors,
      // rate limits, API failures) — they never produce substitute data.
      for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i];
        if (outcome.status === 'fulfilled') {
          discoveredLeads.push(...outcome.value);
        } else {
          const src = ALL_DISCOVERY_SOURCES[i];
          const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
          console.error(`[DiscoveryService] "all" mode: source ${src} skipped:`, reason);
          skippedSourceNotes.push(`${src}: ${reason}`);
        }
      }

      const beforeDedupe = discoveredLeads.length;
      discoveredLeads = dedupeDiscoveredLeads(discoveredLeads);
      // Keep the merged set bounded so credit usage stays predictable
      discoveredLeads = discoveredLeads.slice(0, Math.max(maxResults, perSourceLimit * 2));

      console.log(`[DiscoveryService] "all" mode: merged ${beforeDedupe} results → ${discoveredLeads.length} unique leads`);
    } else {
      discoveredLeads = await discoverFromSource(zai, params, maxResults);
    }

    // Step 2: Deduplicate and import leads
    let imported = 0;
    let duplicates = 0;
    let failedCount = 0;

    for (const leadData of discoveredLeads) {
      try {
        // Check for duplicates
        const dupCheck = await checkDuplicate(userId, {
          businessName: leadData.businessName,
          website: leadData.website,
          email: leadData.email,
          phone: leadData.phone,
        });

        if (dupCheck.isDuplicate) {
          duplicates++;
          continue;
        }

        // Deduct credit for this lead
        const creditResult = await deductCredits({
          userId,
          action: 'lead_discovery',
          cost: CREDIT_COST_PER_LEAD,
          referenceId: jobId,
        });

        if (!creditResult.success) {
          failedCount++;
          continue;
        }

        // Create lead — tag with the lead's own source so "all" mode shows the real origin
        await db.lead.create({
          data: {
            userId,
            orgId: orgId || null,
            businessName: leadData.businessName,
            ownerName: leadData.ownerName || null,
            website: leadData.website || null,
            email: leadData.email || null,
            phone: leadData.phone || null,
            whatsapp: leadData.whatsapp || null,
            linkedin: leadData.linkedin || null,
            instagram: leadData.instagram || null,
            facebook: leadData.facebook || null,
            googleMapsListing: leadData.googleMapsListing || null,
            reviews: leadData.reviews || null,
            rating: leadData.rating || null,
            city: leadData.city || params.city || null,
            country: leadData.country || params.country,
            niche: leadData.niche || params.niche,
            source: leadData.source || params.source,
            stage: 'discovered',
            hasWebsite: !!leadData.website,
            notes: leadData.address ? `Address: ${leadData.address}` : null,
          },
        });

        imported++;
      } catch (leadErr) {
        failedCount++;
        console.error(`[DiscoveryService] Failed to import lead:`, leadErr);
      }
    }

    // Update job as completed
    await db.discoveryJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        totalFound: discoveredLeads.length,
        imported,
        duplicates,
        failed: failedCount,
        resultData: JSON.stringify(discoveredLeads.slice(0, 100)), // Store up to 100 results
        completedAt: new Date(),
      },
    });

    // Audit log
    await logAuditEvent(userId, 'discovery_completed', {
      jobId,
      source: params.source,
      totalFound: discoveredLeads.length,
      imported,
      duplicates,
      failed: failedCount,
    });

    // User-facing notification (deduped per discovery job).
    const skippedSuffix =
      skippedSourceNotes.length > 0
        ? ` Skipped: ${skippedSourceNotes.slice(0, 3).map((n) => n.split(':')[0]).join(', ')}${skippedSourceNotes.length > 3 ? ` +${skippedSourceNotes.length - 3} more` : ''}.`
        : '';
    await createNotificationOnce({
      userId,
      type: 'discovery_completed',
      title: 'Lead discovery completed',
      message:
        imported > 0
          ? `Discovery finished: ${imported} new lead${imported === 1 ? '' : 's'} imported from ${params.source || 'your sources'}${duplicates > 0 ? ` (${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped)` : ''}.${skippedSuffix}`
          : `Discovery finished for ${params.source || 'your sources'} — no new leads were found this time.${skippedSuffix}`,
      actionUrl: imported > 0 ? '/business-ai/leads' : '/business-ai/discover',
      metadata: { jobId, source: params.source, totalFound: discoveredLeads.length, imported, duplicates, failed: failedCount },
      dedupeKey: `discovery:${jobId}:completed`,
    }).catch(() => {
      // Never fail the discovery path because of a notification problem
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update job as failed
    await db.discoveryJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      },
    });

    // Audit log
    await logAuditEvent(userId, 'discovery_failed', {
      jobId,
      source: params.source,
      error: errorMessage,
    });

    // User-facing notification — safe message only (the raw error stays in
    // the job record / audit log, never in the notification text).
    await createNotificationOnce({
      userId,
      type: 'discovery_failed',
      title: 'Lead discovery failed',
      message: `The discovery run for ${params.source || 'your sources'} could not be completed. Please try again from the Discover page.`,
      actionUrl: '/business-ai/discover',
      metadata: { jobId, source: params.source },
      dedupeKey: `discovery:${jobId}:failed`,
    }).catch(() => {
      // Never fail the discovery path because of a notification problem
    });
  }
}

// ===== SEARCH QUERY BUILDER =====

/**
 * REAL-DATA-ONLY dispatcher for one source.
 *  - ai_search        → built-in AI web search (existing z-ai flow, real results)
 *  - every other source → the source's real adapter (official API or live scraping)
 *
 * Throws on failure so single-source jobs fail with the exact provider error
 * (config missing / rate limited / API error) and "all"-mode fan-out records
 * the source as skipped. Fake or placeholder data is NEVER returned.
 */
async function discoverFromSource(
  zai: ZAI,
  params: DiscoveryParams,
  maxResults: number
): Promise<DiscoveredLead[]> {
  if (params.source === 'ai_search') {
    return sanitizeDiscoveredLeads(
      await searchSourceLeads(zai, params, maxResults),
      params,
      maxResults
    );
  }

  const searchLocation = params.city ? `${params.city}, ${params.country}` : params.country;
  const result = await runSourceAdapter(
    params.source as DiscoverySourceId,
    params.niche,
    searchLocation,
    maxResults
  );

  if (result.error) {
    // Surface the exact, honest reason — including "Rate limit reached,
    // try again in X minutes" for rate limiting.
    throw new Error(result.error.message);
  }

  return sanitizeDiscoveredLeads(result.leads, params, maxResults);
}

/**
 * Universal lead validation (applies to EVERY source, including AI search):
 *   1. A lead without a business name is discarded.
 *   2. A lead without any location information (its own, or the search's)
 *      is discarded — every returned lead has at least name + location.
 *   3. Per-source duplicates are removed.
 */
function sanitizeDiscoveredLeads(
  leads: DiscoveredLead[],
  params: DiscoveryParams,
  maxResults: number
): DiscoveredLead[] {
  const seen = new Set<string>();
  const out: DiscoveredLead[] = [];

  for (const lead of leads) {
    const name = (lead.businessName || '').trim();
    if (!name || name.length < 2) continue;

    const hasLocation = Boolean(
      lead.city || lead.country || lead.address || params.city || params.country
    );
    if (!hasLocation) continue;

    const key = `${name.toLowerCase()}|${(lead.phone || lead.website || lead.city || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      ...lead,
      businessName: name,
      source: lead.source || params.source,
    });

    if (out.length >= maxResults) break;
  }

  return out;
}

/**
 * Run web-search + LLM extraction for ONE source. Used directly for single-source
 * jobs and per-source inside the "all" parallel fan-out.
 */
async function searchSourceLeads(
  zai: ZAI,
  params: DiscoveryParams,
  maxResults: number
): Promise<DiscoveredLead[]> {
  const discoveredLeads: DiscoveredLead[] = [];
  const searchQueries = buildSearchQueries(params);

  for (const query of searchQueries) {
    if (discoveredLeads.length >= maxResults) break;

    try {
      // Web search
      const searchResults = await zai.functions.invoke('web_search', {
        query,
        num: Math.min(20, maxResults - discoveredLeads.length),
      });

      if (!searchResults || searchResults.length === 0) continue;

      // Extract structured lead data from search results using LLM
      const leadsFromResults = await extractLeadsFromSearchResults(
        zai,
        searchResults,
        params,
        maxResults - discoveredLeads.length
      );

      discoveredLeads.push(...leadsFromResults);
    } catch (searchErr) {
      console.error(`[DiscoveryService] Search query failed: "${query}"`, searchErr);
      // Continue with next query
    }
  }

  return discoveredLeads;
}

/**
 * Cross-source deduplication for "all" mode — merges results from parallel
 * sources and removes duplicates by website, email or normalized business name.
 */
function dedupeDiscoveredLeads(leads: DiscoveredLead[]): DiscoveredLead[] {
  const seen = new Set<string>();
  const unique: DiscoveredLead[] = [];

  const normalizeName = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizeSite = (site?: string) =>
    site ? site.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') : '';

  for (const lead of leads) {
    const keys = [
      lead.website ? `site:${normalizeSite(lead.website)}` : '',
      lead.email ? `email:${lead.email.toLowerCase()}` : '',
      `name:${normalizeName(lead.businessName)}`,
    ].filter(Boolean);

    // A lead is a duplicate if any of its keys was already seen
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    unique.push(lead);
  }

  return unique;
}

function buildSearchQueries(params: DiscoveryParams): string[] {
  const { niche, country, city, source } = params;
  const location = city ? `${city}, ${country}` : country;
  const queries: string[] = [];

  switch (source) {
    case 'ai_search':
      queries.push(`${niche} businesses in ${location}`);
      queries.push(`${niche} companies ${location} contact details`);
      queries.push(`best ${niche} services in ${location} reviews`);
      break;
    case 'google_maps':
      queries.push(`site:maps.google.com ${niche} ${location}`);
      queries.push(`${niche} near ${location} google maps`);
      break;
    case 'justdial':
      queries.push(`site:justdial.com ${niche} ${location}`);
      break;
    case 'indiamart':
      queries.push(`site:indiamart.com ${niche} ${location}`);
      break;
    case 'yelp':
      queries.push(`site:yelp.com ${niche} ${location}`);
      break;
    case 'yellow_pages':
      queries.push(`site:yellowpages.com ${niche} ${location}`);
      break;
    case 'sulekha':
      queries.push(`site:sulekha.com ${niche} ${location}`);
      break;
    case 'linkedin':
      queries.push(`site:linkedin.com/company ${niche} ${location}`);
      break;
    case 'instagram':
      queries.push(`site:instagram.com ${niche} business ${location}`);
      break;
    case 'facebook':
      queries.push(`site:facebook.com ${niche} business ${location}`);
      break;
    default:
      queries.push(`${niche} businesses in ${location}`);
  }

  // NOTE: requirements (e.g. "no website") are intentionally NOT appended to the
  // search queries — doing so pollutes the queries with marketing-agency pages and
  // kills recall. They are passed to the LLM extraction prompt instead, which
  // prioritizes/filters businesses matching the requirements.
  return queries;
}

// ===== LLM EXTRACTION =====

async function extractLeadsFromSearchResults(
  zai: ZAI,
  searchResults: Array<{ url: string; name: string; snippet: string }>,
  params: DiscoveryParams,
  maxLeads: number
): Promise<DiscoveredLead[]> {
  if (searchResults.length === 0) return [];

  const resultsText = searchResults
    .slice(0, 20)
    .map((r, i) => `[${i + 1}] Name: ${r.name}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`)
    .join('\n\n');

  const prompt = `You are a business lead extraction assistant. Extract structured business lead data from the search results below.

NICHE: ${params.niche}
COUNTRY: ${params.country}
CITY: ${params.city || 'Not specified'}
TARGET SOURCE: ${params.source}
QUALIFYING REQUIREMENTS: ${params.requirements || 'None — accept all matching businesses'}

SEARCH RESULTS:
${resultsText}

Extract each business as a JSON object with these fields:
- businessName (required): The business/company name
- ownerName: Owner or key contact person name if mentioned
- website: Business website URL if available
- email: Business email if found
- phone: Phone number if found
- whatsapp: WhatsApp number if different from phone
- linkedin: LinkedIn page URL
- instagram: Instagram page URL  
- facebook: Facebook page URL
- googleMapsListing: Google Maps URL if available
- reviews: Review count or summary if mentioned
- rating: Rating (number) if mentioned
- city: City if different from search
- country: Country if different from search

Prioritize businesses that match the qualifying requirements when present.
Return ONLY a JSON array of objects. No explanation, no markdown.
If no businesses found, return empty array [].
Maximum ${maxLeads} results.`;

  try {
    const response = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a precise data extraction assistant. Return only valid JSON arrays. No markdown, no explanations.' },
        { role: 'user', content: prompt },
      ],
      model: 'auto',
    });

    const content = response.choices?.[0]?.message?.content || '[]';

    // Parse the LLM response - handle potential markdown wrapping
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    // Validate and normalize each lead
    return parsed
      .filter((lead: Record<string, unknown>) => lead.businessName && typeof lead.businessName === 'string')
      .slice(0, maxLeads)
      .map((lead: Record<string, unknown>) => ({
        businessName: String(lead.businessName).trim(),
        ownerName: lead.ownerName ? String(lead.ownerName).trim() : undefined,
        website: lead.website ? normalizeUrl(String(lead.website)) : undefined,
        email: lead.email ? String(lead.email).trim().toLowerCase() : undefined,
        phone: lead.phone ? String(lead.phone).trim() : undefined,
        whatsapp: lead.whatsapp ? String(lead.whatsapp).trim() : undefined,
        linkedin: lead.linkedin ? normalizeUrl(String(lead.linkedin)) : undefined,
        instagram: lead.instagram ? normalizeUrl(String(lead.instagram)) : undefined,
        facebook: lead.facebook ? normalizeUrl(String(lead.facebook)) : undefined,
        googleMapsListing: lead.googleMapsListing ? normalizeUrl(String(lead.googleMapsListing)) : undefined,
        reviews: lead.reviews ? String(lead.reviews).trim() : undefined,
        rating: typeof lead.rating === 'number' ? lead.rating : undefined,
        city: lead.city ? String(lead.city).trim() : undefined,
        country: lead.country ? String(lead.country).trim() : undefined,
        niche: params.niche,
        source: params.source,
      }));
  } catch (parseErr) {
    console.error('[DiscoveryService] LLM extraction failed:', parseErr);
    return [];
  }
}

// ===== UTILITIES =====

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}
