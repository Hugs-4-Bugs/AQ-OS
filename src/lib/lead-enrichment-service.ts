// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Enrichment Service
// Phase 7: Lead Discovery Engine + Scraping + Enrichment
//
// Uses z-ai-web-dev-sdk for web search + LLM to enrich lead data.
// Extracts: business info, contact details, social profiles, ratings,
// revenue tier, tech stack, and more.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { deductCredits, CREDIT_COSTS } from '@/lib/credit-service';
import { logAuditEvent } from '@/lib/lead-audit';
import { canUserAccessLead } from '@/lib/lead-resolution';
import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export interface EnrichmentResult {
  success: boolean;
  leadId: string;
  fieldsUpdated: string[];
  error?: string;
}

export interface EnrichedLeadData {
  businessName?: string;
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
  niche?: string;
  country?: string;
  city?: string;
  estimatedRevenue?: string;
  hasWebsite?: boolean;
  websiteQuality?: string;
  digitalWeaknesses?: string;
  opportunityNotes?: string;
  techStack?: string[];
  bestContactPerson?: string;
  bestChannel?: string;
  bestTiming?: string;
  outreachStyle?: string;
}

export interface BatchEnrichmentResult {
  total: number;
  enriched: number;
  failed: number;
  skipped: number;
  results: EnrichmentResult[];
}

const ENRICHMENT_TIMEOUT_MS = parseInt(process.env.ENRICHMENT_TIMEOUT_MS || '30000', 10);

// ===== CORE ENRICHMENT =====

/**
 * Enrich a single lead using web search + LLM extraction.
 * Deducts credits and updates the lead record.
 */
export async function enrichLead(leadId: string, userId: string): Promise<EnrichmentResult> {
  try {
    // Fetch lead
    const lead = await db.lead.findFirst({
      where: { id: leadId, isActive: true },
    });

    if (!lead) {
      return { success: false, leadId, fieldsUpdated: [], error: 'Lead not found' };
    }

    // Check user ownership or org membership.
    // ACCOUNT ISOLATION: use the canonical fail-closed rule — owner, or
    // same organization where BOTH orgIds are real (non-null). The old
    // `lead.userId && …` guard failed open for ownerless leads and for
    // null === null org comparisons.
    {
      const user = await db.user.findUnique({ where: { id: userId }, select: { orgId: true } });
      if (!user || !canUserAccessLead(lead, { id: userId, orgId: user.orgId })) {
        return { success: false, leadId, fieldsUpdated: [], error: 'Not authorized to enrich this lead' };
      }
    }

    // Deduct credits for enrichment (uses deep_analysis cost)
    const creditResult = await deductCredits({
      userId,
      action: 'deep_analysis',
      cost: CREDIT_COSTS.deep_analysis,
      referenceId: leadId,
    });

    if (!creditResult.success) {
      return { success: false, leadId, fieldsUpdated: [], error: creditResult.error || 'Insufficient credits' };
    }

    // Initialize AI SDK
    let zai: ZAI;
    try {
      zai = await ZAI.create();
    } catch {
      // Refund credits on failure
      await refundOnFailure(userId, leadId);
      return { success: false, leadId, fieldsUpdated: [], error: 'AI SDK initialization failed' };
    }

    // Build enrichment context
    const searchQuery = buildEnrichmentQuery(lead);

    // Step 1: Web search for more data
    let searchSnippet = '';
    try {
      const searchResults = await zai.functions.invoke('web_search', {
        query: searchQuery,
        num: 5,
      });

      if (searchResults && searchResults.length > 0) {
        searchSnippet = searchResults
          .map((r: { name: string; snippet: string; url: string }) => `Source: ${r.url}\n${r.snippet}`)
          .join('\n\n');
      }
    } catch {
      // Continue without search results
    }

    // Step 2: Try to read the lead's website if available
    let websiteContent = '';
    if (lead.website) {
      try {
        const pageResult = await zai.functions.invoke('page_reader', {
          url: lead.website,
        });
        if (pageResult?.data?.html) {
          // Truncate HTML to avoid token limits
          websiteContent = pageResult.data.html.substring(0, 5000);
        }
      } catch {
        // Continue without website content
      }
    }

    // Step 3: LLM extraction
    const enrichmentData = await extractEnrichmentData(zai, lead, searchSnippet, websiteContent);

    if (!enrichmentData) {
      return { success: false, leadId, fieldsUpdated: [], error: 'LLM extraction returned no data' };
    }

    // Step 4: Update lead with enriched data
    const fieldsUpdated = await updateLeadWithEnrichment(leadId, lead, enrichmentData);

    // Audit log
    await logAuditEvent(userId, 'lead_enriched', {
      leadId,
      fieldsUpdated,
      businessName: lead.businessName,
    });

    return { success: true, leadId, fieldsUpdated };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown enrichment error';
    console.error(`[EnrichmentService] Failed to enrich lead ${leadId}:`, error);

    await logAuditEvent(userId, 'lead_enriched', { leadId, error: message });

    return { success: false, leadId, fieldsUpdated: [], error: message };
  }
}

/**
 * Enrich multiple leads in batch.
 * Respects rate limits and processes sequentially.
 */
export async function batchEnrichLeads(
  leadIds: string[],
  userId: string
): Promise<BatchEnrichmentResult> {
  const results: EnrichmentResult[] = [];
  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  for (const leadId of leadIds) {
    try {
      const result = await enrichLead(leadId, userId);

      if (result.success) {
        enriched++;
      } else if (result.error?.includes('Insufficient credits')) {
        skipped++;
      } else {
        failed++;
      }

      results.push(result);

      // Small delay between enrichments to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {
      failed++;
      results.push({ success: false, leadId, fieldsUpdated: [], error: 'Unexpected error' });
    }
  }

  return { total: leadIds.length, enriched, failed, skipped, results };
}

// ===== HELPER FUNCTIONS =====

function buildEnrichmentQuery(lead: {
  businessName: string;
  city?: string | null;
  country?: string | null;
  niche?: string | null;
  ownerName?: string | null;
  website?: string | null;
}): string {
  const parts: string[] = [];

  if (lead.businessName) parts.push(lead.businessName);
  if (lead.niche) parts.push(lead.niche);
  if (lead.city) parts.push(lead.city);
  if (lead.country) parts.push(lead.country);

  parts.push('contact details email phone');
  parts.push('owner information');
  parts.push('social media profiles');

  return parts.join(' ');
}

async function extractEnrichmentData(
  zai: ZAI,
  lead: {
    businessName: string;
    ownerName?: string | null;
    website?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    country?: string | null;
    niche?: string | null;
  },
  searchSnippet: string,
  websiteContent: string
): Promise<EnrichedLeadData | null> {
  const existingInfo = [
    lead.businessName && `Business: ${lead.businessName}`,
    lead.ownerName && `Owner: ${lead.ownerName}`,
    lead.website && `Website: ${lead.website}`,
    lead.email && `Email: ${lead.email}`,
    lead.phone && `Phone: ${lead.phone}`,
    lead.city && `City: ${lead.city}`,
    lead.country && `Country: ${lead.country}`,
    lead.niche && `Niche: ${lead.niche}`,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `You are a lead enrichment assistant. Given the existing lead info and search results, extract any NEW or UPDATED information.

EXISTING LEAD INFO:
${existingInfo || 'No existing info'}

SEARCH RESULTS:
${searchSnippet || 'No search results available'}

WEBSITE CONTENT (truncated):
${websiteContent ? websiteContent.substring(0, 3000) : 'No website content available'}

Extract a JSON object with ONLY the fields that have NEW or BETTER information than what exists. Do not repeat existing info unless you have a better value.

Available fields:
- ownerName: Owner/decision maker name
- email: Business email address
- phone: Phone number (with country code)
- whatsapp: WhatsApp number (if different from phone)
- linkedin: LinkedIn company/profile URL
- instagram: Instagram profile URL
- facebook: Facebook page URL
- googleMapsListing: Google Maps URL
- reviews: Review count or summary (e.g. "4.5 stars, 120 reviews")
- rating: Numeric rating (e.g. 4.5)
- niche: More specific business category
- estimatedRevenue: "low", "medium", "high", or "very_high"
- websiteQuality: "none", "poor", "basic", "good", "excellent"
- digitalWeaknesses: Comma-separated weaknesses (e.g. "no mobile site,slow loading,no SEO")
- opportunityNotes: Why this is a good lead opportunity
- techStack: Array of technologies detected (e.g. ["WordPress", "Shopify", "React"])
- bestContactPerson: Name of best person to contact
- bestChannel: "email", "phone", "linkedin", "whatsapp", or "instagram"
- bestTiming: Best time to contact (e.g. "weekday mornings")
- outreachStyle: Recommended approach (e.g. "consultative", "direct", "value-first")

Return ONLY the JSON object. No explanation, no markdown. Empty object {} if no new data found.`;

  try {
    const response = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a precise data extraction assistant. Return only valid JSON. No markdown, no explanations.' },
        { role: 'user', content: prompt },
      ],
      model: 'auto',
    });

    const content = response.choices?.[0]?.message?.content || '{}';

    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    if (!parsed || typeof parsed !== 'object') return null;

    // Normalize and validate
    const result: EnrichedLeadData = {};

    if (parsed.ownerName && typeof parsed.ownerName === 'string') result.ownerName = parsed.ownerName.trim();
    if (parsed.email && typeof parsed.email === 'string') result.email = parsed.email.trim().toLowerCase();
    if (parsed.phone && typeof parsed.phone === 'string') result.phone = parsed.phone.trim();
    if (parsed.whatsapp && typeof parsed.whatsapp === 'string') result.whatsapp = parsed.whatsapp.trim();
    if (parsed.linkedin && typeof parsed.linkedin === 'string') result.linkedin = normalizeUrl(parsed.linkedin);
    if (parsed.instagram && typeof parsed.instagram === 'string') result.instagram = normalizeUrl(parsed.instagram);
    if (parsed.facebook && typeof parsed.facebook === 'string') result.facebook = normalizeUrl(parsed.facebook);
    if (parsed.googleMapsListing && typeof parsed.googleMapsListing === 'string') result.googleMapsListing = normalizeUrl(parsed.googleMapsListing);
    if (parsed.reviews && typeof parsed.reviews === 'string') result.reviews = parsed.reviews.trim();
    if (typeof parsed.rating === 'number') result.rating = Math.min(5, Math.max(0, parsed.rating));
    if (parsed.niche && typeof parsed.niche === 'string') result.niche = parsed.niche.trim();
    if (parsed.estimatedRevenue && ['low', 'medium', 'high', 'very_high'].includes(parsed.estimatedRevenue)) {
      result.estimatedRevenue = parsed.estimatedRevenue;
    }
    if (parsed.websiteQuality && ['none', 'poor', 'basic', 'good', 'excellent'].includes(parsed.websiteQuality)) {
      result.websiteQuality = parsed.websiteQuality;
    }
    if (parsed.digitalWeaknesses && typeof parsed.digitalWeaknesses === 'string') result.digitalWeaknesses = parsed.digitalWeaknesses.trim();
    if (parsed.opportunityNotes && typeof parsed.opportunityNotes === 'string') result.opportunityNotes = parsed.opportunityNotes.trim();
    if (Array.isArray(parsed.techStack)) result.techStack = parsed.techStack.filter((t: unknown) => typeof t === 'string');
    if (parsed.bestContactPerson && typeof parsed.bestContactPerson === 'string') result.bestContactPerson = parsed.bestContactPerson.trim();
    if (parsed.bestChannel && typeof parsed.bestChannel === 'string') result.bestChannel = parsed.bestChannel.trim();
    if (parsed.bestTiming && typeof parsed.bestTiming === 'string') result.bestTiming = parsed.bestTiming.trim();
    if (parsed.outreachStyle && typeof parsed.outreachStyle === 'string') result.outreachStyle = parsed.outreachStyle.trim();

    return result;
  } catch (error) {
    console.error('[EnrichmentService] LLM extraction failed:', error);
    return null;
  }
}

async function updateLeadWithEnrichment(
  leadId: string,
  existingLead: Record<string, unknown>,
  enrichment: EnrichedLeadData
): Promise<string[]> {
  const fieldsUpdated: string[] = [];
  const updateData: Record<string, unknown> = {};

  // Only update fields that are new or better than existing
  const fieldMap: Record<string, unknown> = {
    ownerName: enrichment.ownerName,
    email: enrichment.email,
    phone: enrichment.phone,
    whatsapp: enrichment.whatsapp,
    linkedin: enrichment.linkedin,
    instagram: enrichment.instagram,
    facebook: enrichment.facebook,
    googleMapsListing: enrichment.googleMapsListing,
    reviews: enrichment.reviews,
    niche: enrichment.niche,
    estimatedRevenue: enrichment.estimatedRevenue,
    websiteQuality: enrichment.websiteQuality,
    digitalWeaknesses: enrichment.digitalWeaknesses,
    opportunityNotes: enrichment.opportunityNotes,
    bestContactPerson: enrichment.bestContactPerson,
    bestChannel: enrichment.bestChannel,
    bestTiming: enrichment.bestTiming,
    outreachStyle: enrichment.outreachStyle,
  };

  for (const [field, value] of Object.entries(fieldMap)) {
    if (value !== undefined && value !== null && value !== '') {
      const existing = existingLead[field];
      // Only update if current value is empty/null or we have new data
      if (!existing || existing === '' || existing === null) {
        updateData[field] = value;
        fieldsUpdated.push(field);
      }
    }
  }

  // Handle rating specially (0 is valid)
  if (enrichment.rating !== undefined && (!existingLead.rating || existingLead.rating === 0)) {
    updateData.rating = enrichment.rating;
    fieldsUpdated.push('rating');
  }

  // Handle hasWebsite
  if (enrichment.hasWebsite !== undefined) {
    updateData.hasWebsite = enrichment.hasWebsite;
    if (!fieldsUpdated.includes('hasWebsite')) fieldsUpdated.push('hasWebsite');
  }

  // Handle techStack as JSON array
  if (enrichment.techStack && enrichment.techStack.length > 0) {
    updateData.techStack = JSON.stringify(enrichment.techStack);
    fieldsUpdated.push('techStack');
  }

  if (fieldsUpdated.length > 0) {
    await db.lead.update({
      where: { id: leadId },
      data: updateData,
    });
  }

  return fieldsUpdated;
}

async function refundOnFailure(userId: string, referenceId: string): Promise<void> {
  try {
    const { refundCredits } = await import('@/lib/credit-service');
    await refundCredits({
      userId,
      amount: CREDIT_COSTS.deep_analysis,
      originalAction: 'deep_analysis',
      referenceId,
    });
  } catch {
    // Silently fail refund
  }
}

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}
