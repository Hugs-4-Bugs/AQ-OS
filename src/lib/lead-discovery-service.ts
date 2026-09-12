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
import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export type DiscoverySource =
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

export interface DiscoveryParams {
  niche: string;
  country: string;
  city?: string;
  source: DiscoverySource;
  maxResults?: number;
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
    const discoveredLeads: DiscoveredLead[] = [];

    // Step 1: Use web search to find businesses
    let zai: ZAI;
    try {
      zai = await ZAI.create();
    } catch {
      throw new Error('Failed to initialize AI SDK. Check API configuration.');
    }

    // Build search queries based on source
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

        // Create lead
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
            source: params.source,
            stage: 'discovered',
            hasWebsite: !!leadData.website,
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
  }
}

// ===== SEARCH QUERY BUILDER =====

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
