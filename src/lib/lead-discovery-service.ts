// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Discovery Service
// Phase 7: Lead Discovery Engine + Scraping + Enrichment
//
// Async job-based discovery using z-ai-web-dev-sdk
// Supports: ai_search, google_maps, justdial, indiamart, yelp, etc.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { deductCredits, refundCredits, CREDIT_COSTS } from '@/lib/credit-service';
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
  type AdapterErrorKind,
} from '@/lib/lead-discovery/source-adapters';
import { normalizeCountryName } from '@/lib/countries';
import { deriveImportVerificationStatus } from '@/lib/lead-discovery/verification';
import {
  type HardCriteria,
  type HardRejectReason,
  describeHardCriteria,
  describeRejectReason,
  hasEnforceableCriteria,
  hasEmployeeConstraint,
  matchHardCriteria,
} from '@/lib/discovery/hard-criteria';

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
  /**
   * Optional since worldwide support (spec §5): when omitted the search
   * runs without a country constraint instead of failing validation.
   */
  country?: string;
  city?: string;
  source: DiscoverySource;
  maxResults?: number;
  requirements?: string;
  /**
   * Structured HARD criteria (employee range, website presence, excluded
   * types) extracted from the user's request. Enforced server-side AFTER
   * provider results arrive — AI ranking can never override them.
   */
  criteria?: HardCriteria | null;
  /** Business context (spec §3): which of the user's business profiles this
   * job runs as + campaign-specific overrides. Ownership is verified in
   * resolveBusinessContext when the context is USED (never trusted blindly). */
  businessProfileId?: string | null;
  /** EXPLICIT None (spec §8): when false, the job runs WITHOUT business
   * context — null businessProfileId must NOT fall back to the default. */
  useBusinessContext?: boolean;
  campaign?: {
    objective?: string;
    audience?: string;
    offer?: string;
    outcome?: string;
    cta?: string;
    tone?: string;
    instructions?: string;
  } | null;
  /**
   * Credit-integrity identity for this logical operation (client-generated
   * UUID). When supplied, a replayed start returns the SAME job instead of
   * creating a second chargeable one (one operation → one billing event).
   */
  idempotencyKey?: string | null;
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
  /** Provider listing URL (provenance) — where on the source this lead was found. */
  sourceUrl?: string;
  /** Search query / variation that produced this lead (spec §3.3 provenance). */
  discoveredVia?: string;
  /** Same identity returned by 2+ independent sources (spec §7.2 corroboration). */
  corroborated?: boolean;
  /** REAL street address or provider context (stored in Lead.notes). */
  address?: string;
  /** Actual employee count when the provider/LLM stated one. null = unknown. */
  employeeCount?: number | null;
  /** Provider employee RANGE when no exact count exists (e.g. "51-100", "10000+"). */
  employeeRange?: string | null;
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
  /** Candidates rejected by the deterministic hard-criteria validator. */
  filteredOut: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  resultData?: DiscoveredLead[];
}

// ===== Z-AI API PACING =====

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The z-ai endpoints (web_search AND chat) rate-limit bursts with 429. All
// SDK calls across all jobs share one pacer: minimum spacing between calls
// + retry-with-backoff on 429. This turns burst-failures into slow-but-
// reliable jobs instead of silently-empty extractions.
// (Env-overridable for unit tests: DISCOVERY_ZAI_MIN_INTERVAL_MS=0 removes
// pacing in mocked-provider tests. Production default is unchanged at 4s.)
const ZAI_MIN_INTERVAL_MS = parseInt(process.env.DISCOVERY_ZAI_MIN_INTERVAL_MS || '4000', 10);
const ZAI_RETRY_BACKOFFS_MS = [8000, 15000, 25000];
let lastZaiCallAt = 0;

async function pacedZaiCall<T>(
  fn: () => Promise<T>,
  retries = ZAI_RETRY_BACKOFFS_MS.length
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const now = Date.now();
    const wait = lastZaiCallAt + ZAI_MIN_INTERVAL_MS - now;
    if (wait > 0) await sleep(wait);
    lastZaiCallAt = Date.now();
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof Error && /429|too many|rate/i.test(err.message);
      if (retryable && attempt < retries) {
        const backoff = ZAI_RETRY_BACKOFFS_MS[Math.min(attempt, ZAI_RETRY_BACKOFFS_MS.length - 1)];
        console.warn(`[DiscoveryService] z-ai API rate-limited — retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${retries})`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

// ===== CONSTANTS =====

const MAX_CONCURRENT_JOBS = parseInt(process.env.DISCOVERY_MAX_CONCURRENT_JOBS || '3', 10);
/**
 * Default per-job target. Raised 50 → 200 (spec §3.1: do not hardcode a
 * tiny global result limit when providers and the user's plan permit more;
 * still a bounded, rate-limit-respecting ceiling, env-overridable).
 */
const RESULTS_PER_JOB = parseInt(process.env.DISCOVERY_RESULTS_PER_JOB || '200', 10);
const CREDIT_COST_PER_LEAD = CREDIT_COSTS.lead_discovery;

/**
 * Error thrown by discoverFromSource carrying the provider's structured
 * error kind — so the job processor can distinguish a genuine zero-result
 * search (kind: 'no_results') from a provider failure / rate limit and
 * complete the job honestly instead of reporting a blanket failure (§3.4).
 */
class DiscoverySourceError extends Error {
  kind: AdapterErrorKind;
  retryAfterMinutes?: number;
  constructor(message: string, kind: AdapterErrorKind, retryAfterMinutes?: number) {
    super(message);
    this.name = 'DiscoverySourceError';
    this.kind = kind;
    this.retryAfterMinutes = retryAfterMinutes;
  }
}

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
  // Validate params — country is intentionally optional (worldwide search,
  // spec §5: "Support worldwide searches without requiring a country")
  if (!params.niche || !params.source) {
    return {
      jobId: '',
      status: 'failed',
      message: 'Missing required fields: niche, source',
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
      country: params.country || '', // '' = worldwide (column is NOT NULL)
      city: params.city || null,
      totalFound: 0,
      imported: 0,
      duplicates: 0,
      failed: 0,
      // Business context (spec §3) — persisted with the job so later
      // research and outreach replay the SAME context.
      businessProfileId: params.businessProfileId || null,
      campaignObjective: params.campaign?.objective || null,
      campaignAudience: params.campaign?.audience || null,
      campaignOffer: params.campaign?.offer || null,
      campaignOutcome: params.campaign?.outcome || null,
      campaignCta: params.campaign?.cta || null,
      campaignTone: params.campaign?.tone || null,
      campaignInstructions: params.campaign?.instructions || null,
      // Operation identity — enables request-level dedupe upstream.
      idempotencyKey: params.idempotencyKey || null,
      // EXPLICIT None — persisted so later replays also skip the default
      // profile instead of silently re-attaching business context.
      useBusinessContext: params.useBusinessContext === false ? false : true,
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
    filteredOut: job.filteredOut,
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
      filteredOut: job.filteredOut,
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
export async function processDiscoveryJob(
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

    // Step 1b: EMPLOYEE-COUNT ENRICHMENT (only when an employee constraint
    // is requested). Per-company targeted searches resolve missing sizes
    // from REAL evidence before validation — so the hard gate has real
    // data to verify instead of rejecting every candidate as unknown.
    const hardCriteria =
      params.criteria && hasEnforceableCriteria(params.criteria) ? params.criteria : null;
    let filteredOut = 0;
    const filterReasons = new Map<HardRejectReason, number>();

    if (hardCriteria && hasEmployeeConstraint(hardCriteria)) {
      try {
        const { enriched, enrichedCount } = await enrichLeadEvidence(zai, discoveredLeads, params);
        discoveredLeads = enriched;
        console.log(`[DiscoveryService] enrichment resolved evidence for ${enrichedCount} candidates`);
      } catch (enrichErr) {
        console.error('[DiscoveryService] enrichment failed (continuing with unenriched candidates):', enrichErr);
      }
    }

    // Step 1c: HARD CRITERIA ENFORCEMENT (server-side, deterministic).
    // Runs AFTER provider results are received, BEFORE dedupe/credits/import.
    // This is INDEPENDENT of the AI extraction/ranking — a candidate that
    // violates an explicit hard constraint (or whose employee count cannot
    // be verified when an employee range was requested) is rejected here,
    // even if the AI scored it highly. Fewer verified results is honest;
    // padding the list with unverified companies is not acceptable.
    if (hardCriteria) {
      const beforeCount = discoveredLeads.length;
      const kept: DiscoveredLead[] = [];
      for (const lead of discoveredLeads) {
        const verdict = matchHardCriteria(lead, hardCriteria);
        if (verdict.match) {
          kept.push(lead);
        } else {
          filteredOut++;
          const reason = (verdict.reason || 'employee_count_unverified') as HardRejectReason;
          filterReasons.set(reason, (filterReasons.get(reason) || 0) + 1);
        }
      }
      discoveredLeads = rankVerifiedLeads(kept);
      console.log(
        `[DiscoveryService] hard criteria (${describeHardCriteria(hardCriteria)}): ${beforeCount} candidates → ${discoveredLeads.length} verified, ${filteredOut} rejected`
      );
    }

    // Step 2: Deduplicate and import leads
    let imported = 0;
    let duplicates = 0;
    let failedCount = 0;

    // Evidence-based verification tally (spec §7.2): the summary must state
    // HOW the stored verification labels were derived, never a blanket
    // "verified" claim. Corroboration by 2+ sources → partially_verified;
    // single-source imports stay unverified until a real verification
    // workflow assesses them.
    let partiallyVerifiedCount = 0;
    let unverifiedCount = 0;

    // Bounded, evidence-based website reachability checks (no AI, no
    // credits, fail-open). Findings are stored per lead as an evidence note
    // (+ websiteStatus on success) — a failed probe is recorded as an
    // observation that may be temporary, never as a permanent judgment.
    let websiteProbes = new Map<string, WebsiteProbeOutcome>();
    try {
      websiteProbes = await probeWebsitesForEvidence(discoveredLeads);
      if (websiteProbes.size > 0) {
        console.log(`[DiscoveryService] website reachability probes: ${websiteProbes.size} domain(s) checked`);
      }
    } catch (probeErr) {
      console.warn('[DiscoveryService] website probe step failed (continuing without probe evidence):', probeErr instanceof Error ? probeErr.message : probeErr);
    }

    // Key the credit slot on the CANDIDATE INDEX (stable per job), not on
    // the mutable `imported` counter: when a lead create fails and is
    // refunded, the counter does not advance, so a counter key would make
    // the NEXT candidate collide with the refunded row and import free.
    // With a stable slot index every candidate has its own billing slot
    // and a replayed job can never double-charge any slot.
    for (let leadSlot = 0; leadSlot < discoveredLeads.length; leadSlot++) {
      const leadData = discoveredLeads[leadSlot];
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
          // Preserve useful information from the duplicate listing instead of
          // discarding it (spec §8): fill empty fields + provenance. Non-
          // destructive, idempotent, never overwrites existing values.
          if (dupCheck.duplicateOf) {
            await mergeFillDuplicate(dupCheck.duplicateOf, leadData);
          }
          continue;
        }

        // Deduct credit for this lead. Idempotency key = job + position,
        // so a retried/replayed job can NEVER double-charge the same slot
        // (spec §12: usage accounting must be idempotent).
        const creditResult = await deductCredits({
          userId,
          action: 'lead_discovery',
          cost: CREDIT_COST_PER_LEAD,
          referenceId: jobId,
          idempotencyKey: `${jobId}:lead:${leadSlot}`,
        });

        if (!creditResult.success) {
          failedCount++;
          continue;
        }

        // Canonical country (spec §5 normalization) — falls back to the raw
        // value when it cannot be confidently resolved, never guesses.
        const rawCountry = leadData.country || params.country;
        const canonicalCountry = normalizeCountryName(rawCountry) || rawCountry;

        // Honest import-time verification label: corroboration by 2+
        // independent sources during this run → partially_verified;
        // everything else → unverified (discovered, not yet assessed).
        const importVerificationStatus = deriveImportVerificationStatus(!!leadData.corroborated);
        if (importVerificationStatus === 'partially_verified') partiallyVerifiedCount++;
        else unverifiedCount++;

        // Website probe evidence for THIS lead (when its domain was probed)
        let websiteStatus: string | null = null;
        let probeNote = '';
        if (leadData.website) {
          let host: string | null = null;
          try {
            host = new URL(leadData.website).host.replace(/^www\./, '');
          } catch {
            host = null;
          }
          const probe = host ? websiteProbes.get(host) : undefined;
          if (probe?.reachable) {
            // The site answered — that is real, time-stamped evidence.
            websiteStatus = 'VERIFIED';
            probeNote = `Website responded to discovery reachability check on ${new Date().toISOString().slice(0, 10)} (${probe.detail}).`;
          } else if (probe) {
            probeNote = `Website did not respond during discovery check on ${new Date().toISOString().slice(0, 10)} (${probe.detail}) — may be a temporary or regional issue, not yet verified.`;
          }
        }

        try {
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
              country: canonicalCountry,
              niche: leadData.niche || params.niche,
              source: leadData.source || params.source,
              stage: 'discovered',
              hasWebsite: !!leadData.website,
              employeeCount:
                typeof leadData.employeeCount === 'number' && Number.isFinite(leadData.employeeCount)
                  ? Math.round(leadData.employeeCount)
                  : null,
              employeeRange: leadData.employeeRange || null,
              sourceUrl: leadData.sourceUrl || null,
              discoveredVia: leadData.discoveredVia || null,
              verificationStatus: importVerificationStatus,
              notes: [leadData.address ? `Address: ${leadData.address}` : '', probeNote]
                .filter(Boolean)
                .join(' ') || null,
              websiteStatus,
            },
          });
        } catch (createErr) {
          // The lead was NOT saved — the credit must not be kept (spec §12:
          // never charge for a failed operation). Idempotent deduction means
          // the refund plus key makes retries safe.
          failedCount++;
          console.error(`[DiscoveryService] Failed to import lead — refunding credit:`, createErr);
          await refundCredits({
            userId,
            amount: CREDIT_COST_PER_LEAD,
            originalAction: 'lead_discovery',
            referenceId: jobId,
          }).catch((refundErr) => {
            console.error('[DiscoveryService] Credit refund failed (ledger keeps reference):', refundErr);
          });
          continue;
        }

        imported++;
      } catch (leadErr) {
        failedCount++;
        console.error(`[DiscoveryService] Failed to import lead:`, leadErr);
      }
    }

    // Update job as completed — filteredOut records honest rejection counts
    await db.discoveryJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        totalFound: discoveredLeads.length,
        imported,
        duplicates,
        failed: failedCount,
        filteredOut,
        resultData: JSON.stringify(discoveredLeads.slice(0, 100)), // Store up to 100 results
        completedAt: new Date(),
      },
    });

    // Audit log — includes the verification tally for traceability
    await logAuditEvent(userId, 'discovery_completed', {
      jobId,
      source: params.source,
      totalFound: discoveredLeads.length,
      imported,
      duplicates,
      failed: failedCount,
      verificationTally: {
        partially_verified: partiallyVerifiedCount,
        unverified: unverifiedCount,
      },
    });

    // User-facing notification (deduped per discovery job) — HONEST counts:
    // the summary distinguishes corroboration-based "partially verified"
    // from single-source "not yet verified" and never calls AI-discovered
    // records "verified" (spec §7.2: verification requires a method).
    const summaryMessage = buildDiscoveryCompletionMessage({
      source: params.source || '',
      imported,
      partiallyVerified: partiallyVerifiedCount,
      unverified: unverifiedCount,
      duplicates,
      filteredOut,
      filterReasonFragments:
        hardCriteria && filterReasons.size > 0
          ? Array.from(filterReasons.entries()).slice(0, 3).map(([r, n]) => `${n} ${describeRejectReason(r)}`)
          : [],
      skippedSourceFragments: skippedSourceNotes.map((n) => n.split(':')[0].trim()).filter(Boolean),
    });
    await createNotificationOnce({
      userId,
      type: 'discovery_completed',
      title: 'Lead discovery completed',
      message: summaryMessage,
      actionUrl: imported > 0 ? '/business-ai/leads' : '/business-ai/discover',
      metadata: {
        jobId,
        source: params.source,
        totalFound: discoveredLeads.length,
        imported,
        duplicates,
        failed: failedCount,
        filteredOut,
        verificationTally: { partially_verified: partiallyVerifiedCount, unverified: unverifiedCount },
      },
      dedupeKey: `discovery:${jobId}:completed`,
    }).catch(() => {
      // Never fail the discovery path because of a notification problem
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // ══ HONEST OUTCOME CLASSIFICATION (spec §3.4) ═════════════════
    // A provider that answered "no results" is NOT a failure. Blanket-
    // failing genuine zero-result searches is exactly what produced the
    // old misleading "No suitable leads found" behavior.
    if (error instanceof DiscoverySourceError && error.kind === 'no_results') {
      const reason = `No results: ${errorMessage}`;
      await db.discoveryJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          totalFound: 0,
          imported: 0,
          duplicates: 0,
          failed: 0,
          filteredOut: 0,
          errorMessage: reason,
          completedAt: new Date(),
        },
      });

      await logAuditEvent(userId, 'discovery_completed_empty', {
        jobId,
        source: params.source,
        reason: errorMessage,
      });

      await createNotificationOnce({
        userId,
        type: 'discovery_completed',
        title: 'Lead discovery completed — no results',
        message: `No matching businesses were returned: ${errorMessage}`,
        actionUrl: '/business-ai/discover',
        metadata: { jobId, source: params.source, totalFound: 0, imported: 0 },
        dedupeKey: `discovery:${jobId}:completed`,
      }).catch(() => {
        // Never fail the discovery path because of a notification problem
      });
      return;
    }

    // Provider failure / rate limit / infrastructure error — job failed,
    // with a truthful, actionable message (retry window when known).
    const friendlyMessage =
      error instanceof DiscoverySourceError && error.kind === 'rate_limited'
        ? `${errorMessage}${error.retryAfterMinutes ? ` (retry in ~${error.retryAfterMinutes} min)` : ''}`
        : errorMessage;

    // Update job as failed
    await db.discoveryJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage: friendlyMessage,
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

  const searchLocation = [params.city, params.country].filter(Boolean).join(', ');
  const result = await runSourceAdapter(
    params.source as DiscoverySourceId,
    params.niche,
    searchLocation,
    maxResults
  );

  if (result.error) {
    // Surface the exact, honest reason — preserving the structured kind so
    // the job processor can distinguish "genuinely no results" from "provider
    // failed / rate limited" (spec §3.4) instead of a blanket failure.
    throw new DiscoverySourceError(
      result.error.message,
      result.error.kind,
      result.error.retryAfterMinutes
    );
  }

  return sanitizeDiscoveredLeads(result.leads, params, maxResults);
}

/**
 * Universal lead validation (applies to EVERY source, including AI search):
 *   1. A lead without a business name is discarded.
 *   2. Malformed / junk records are discarded (names that are actually URLs,
 *      email addresses, or pathologically long strings — clearly not a
 *      business identity).
 *   3. A candidate that EXPLICITLY contradicts the requested geography is
 *      discarded (its own stated country resolves to a different country
 *      than the one the user asked for). Candidates with NO stated country,
 *      or an unresolvable one, are kept — absence of evidence is not a
 *      contradiction (worldwide searches legitimately return such leads).
 *   4. Per-source duplicates are removed.
 *
 * NOTE — location is intentionally NOT a rejection criterion otherwise.
 * The previous rule ("a lead without any location information — its own, or
 * the search's — is discarded") could only ever fire on WORLDWIDE searches:
 * when the search itself had a location, `params.city`/`params.country`
 * made every candidate pass. On worldwide runs (no country/city selected)
 * candidates legitimately carry no location, so the rule silently
 * discarded ALL extracted results — the job then "completed" with
 * totalFound=0 and nothing persisted to the Leads page. Worldwide
 * candidates are now retained; location is displayed as "Unknown
 * location" when absent (matches the Leads UI).
 */
export function sanitizeDiscoveredLeads(
  leads: DiscoveredLead[],
  params: DiscoveryParams,
  maxResults: number
): DiscoveredLead[] {
  const seen = new Set<string>();
  const out: DiscoveredLead[] = [];

  const requestedCountry = params.country
    ? normalizeCountryName(params.country)?.toLowerCase() || null
    : null;

  for (const lead of leads) {
    const name = (lead.businessName || '').trim();
    if (!name || name.length < 2) continue;

    // Malformed identity guard: a "business name" that is actually a URL,
    // an email address, or a >120-char fragment is extraction noise, not a
    // real business. Conservative — only unambiguous junk is dropped.
    const lowered = name.toLowerCase();
    if (
      lowered.includes('http://') ||
      lowered.includes('https://') ||
      lowered.startsWith('www.') ||
      lowered.includes('@') ||
      name.length > 120
    ) {
      continue;
    }

    // Geography contradiction: the candidate EXPLICITLY states a country
    // that is different from the requested one. When either side cannot be
    // confidently canonicalized, the check is skipped (never guesses).
    if (requestedCountry && lead.country) {
      const candidateCountry = normalizeCountryName(lead.country)?.toLowerCase() || null;
      if (candidateCountry && candidateCountry !== requestedCountry) {
        continue;
      }
    }

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
 * Deterministic ranking of VALIDATED leads (runs after hard-criteria
 * enforcement, before import):
 *   1. Leads with a verified exact employeeCount first, then range-only,
 *      then unknown — most verifiable evidence first.
 *   2. Within each tier: higher rating first, then leads with a website.
 * The ordering is stable, so results are reproducible for the same input.
 */
function rankVerifiedLeads(leads: DiscoveredLead[]): DiscoveredLead[] {
  const evidenceTier = (lead: DiscoveredLead): number =>
    typeof lead.employeeCount === 'number' && Number.isFinite(lead.employeeCount) ? 0 : lead.employeeRange ? 1 : 2;
  return [...leads].sort((a, b) => {
    const tier = evidenceTier(a) - evidenceTier(b);
    if (tier !== 0) return tier;
    const rating = (b.rating ?? 0) - (a.rating ?? 0);
    if (rating !== 0) return rating;
    return (b.website ? 1 : 0) - (a.website ? 1 : 0);
  });
}

// ===== DUPLICATE MERGE-FILL (spec §8) =====

/**
 * Fill ONLY empty fields on an existing lead from a duplicate discovery
 * result. Never overwrites existing (stronger) evidence with incoming
 * (weaker) evidence — non-conflicting merge only. Idempotent: running
 * again changes nothing. Preserves the duplicate listing's provenance in
 * notes and upgrades verification when the second sighting comes from a
 * DIFFERENT source (independent corroboration, spec §7.2).
 */
async function mergeFillDuplicate(leadId: string, incoming: DiscoveredLead): Promise<void> {
  try {
    const existing = await db.lead.findUnique({ where: { id: leadId } });
    if (!existing) return;

    const data: Record<string, unknown> = {};
    if (!existing.email && incoming.email) data.email = incoming.email;
    if (!existing.phone && incoming.phone) data.phone = incoming.phone;
    if (!existing.website && incoming.website) {
      data.website = incoming.website;
      data.hasWebsite = true;
    }
    if (!existing.sourceUrl && incoming.sourceUrl) data.sourceUrl = incoming.sourceUrl;
    if (
      incoming.employeeCount != null &&
      Number.isFinite(incoming.employeeCount) &&
      existing.employeeCount == null
    ) {
      data.employeeCount = Math.round(incoming.employeeCount);
    }
    if (incoming.employeeRange && !existing.employeeRange) {
      data.employeeRange = incoming.employeeRange;
    }

    // Independent corroboration: same identity, different source
    if (
      existing.verificationStatus === 'unverified' &&
      incoming.source &&
      existing.source &&
      existing.source !== incoming.source
    ) {
      data.verificationStatus = 'partially_verified';
    }

    const mergedSomething = Object.keys(data).length > 0;
    if (!mergedSomething) return;

    // Bounded provenance note (never overwrite the user's own notes)
    const provenance = `Re-sighted via ${incoming.source}${incoming.sourceUrl ? ` — ${incoming.sourceUrl}` : ''}; merged non-conflicting fields only.`;
    const currentNotes = existing.notes || '';
    data.notes = (currentNotes ? `${currentNotes} | ` : '') + provenance;
    if ((data.notes as string).length > 2000) {
      data.notes = (data.notes as string).slice(-2000);
    }

    await db.lead.update({ where: { id: leadId }, data });
  } catch (mergeErr) {
    // Merge-fill is best-effort: the duplicate is still counted, never fatal
    console.warn('[DiscoveryService] merge-fill skipped:', mergeErr instanceof Error ? mergeErr.message : mergeErr);
  }
}

// ===== WEBSITE REACHABILITY PROBE (spec §6: evidence-based, bounded) =====

const WEBSITE_PROBE_TIMEOUT_MS = 4000;
const WEBSITE_PROBE_MAX_PER_JOB = parseInt(process.env.DISCOVERY_WEBSITE_PROBE_MAX || '20', 10);

interface WebsiteProbeOutcome {
  /** The server answered (any HTTP status) — network-level reachability. */
  reachable: boolean;
  /** Human-readable evidence: HTTP status, or the network error. */
  detail: string;
}

/**
 * Probe ONE website for network reachability. ANY HTTP response (including
 * 401/403 bot blocks and 5xx) counts as "reachable" — the server answered.
 * Only network-level failures (DNS, refused, TLS, timeout) are unreachable.
 * A temporary failure is never stored as a permanent judgment: the evidence
 * note explicitly says the site may be temporarily unavailable.
 */
async function probeWebsiteOnce(url: string): Promise<WebsiteProbeOutcome> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(WEBSITE_PROBE_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AcquisitionOS-Bot/1.0; +https://acquisitionos.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    return { reachable: true, detail: `HTTP ${response.status}` };
  } catch (err) {
    const detail = err instanceof Error
      ? (err.name === 'TimeoutError' || /timeout|abort/i.test(err.message) ? 'timed out' : err.message.slice(0, 120))
      : 'network error';
    return { reachable: false, detail };
  }
}

/**
 * Bounded reachability check for discovered leads that HAVE a website:
 * sequential, domain-deduplicated, capped per job (fail-open — any probe
 * problem never blocks the import). No AI calls, no credits.
 */
async function probeWebsitesForEvidence(
  leads: DiscoveredLead[],
  maxProbes = WEBSITE_PROBE_MAX_PER_JOB
): Promise<Map<string, WebsiteProbeOutcome>> {
  const byDomain = new Map<string, string>();
  for (const lead of leads) {
    const site = (lead.website || '').trim();
    if (!site) continue;
    try {
      const host = new URL(site).host.replace(/^www\./, '');
      if (!byDomain.has(host)) byDomain.set(host, site);
    } catch {
      // Unparseable URL — skip probing; the lead keeps its raw website value
    }
  }

  const outcomes = new Map<string, WebsiteProbeOutcome>();
  let probed = 0;
  for (const [host, url] of byDomain) {
    if (probed >= maxProbes) break;
    probed++;
    outcomes.set(host, await probeWebsiteOnce(url));
    await sleep(300); // small stagger between probes
  }
  return outcomes;
}

// ===== HONEST COMPLETION SUMMARY (spec §7.2 / §10) =====

export interface DiscoveryCompletionSummary {
  source: string;
  imported: number;
  /** Leads tagged partially_verified (corroborated by 2+ sources). */
  partiallyVerified: number;
  /** Leads tagged unverified — discovered, not yet assessed. */
  unverified: number;
  duplicates: number;
  filteredOut: number;
  /** Preformatted rejection-reason fragments, e.g. ["12 unknown employee count"]. */
  filterReasonFragments: string[];
  /** Preformatted skipped-source fragments, e.g. ["yelp: not configured"]. */
  skippedSourceFragments: string[];
}

/**
 * Build the user-facing completion message. The word "verified" is NEVER
 * used for leads whose stored status is unverified — corroboration by 2+
 * sources is reported as "partially verified", single-source imports as
 * "not yet verified". This is the honest summary required by spec §7.2:
 * AI extraction alone is discovery, not verification.
 */
export function buildDiscoveryCompletionMessage(s: DiscoveryCompletionSummary): string {
  const source = s.source || 'your sources';
  if (s.imported <= 0) {
    let message = `Discovery finished for ${source} — no leads were imported this time.`;
    if (s.filteredOut > 0) {
      message += ` ${s.filteredOut} candidate${s.filteredOut === 1 ? '' : 's'} rejected by hard filters${s.filterReasonFragments.length ? ' — ' + s.filterReasonFragments.slice(0, 3).join(', ') : ''}.`;
    }
    if (s.skippedSourceFragments.length > 0) {
      message += ` Skipped: ${s.skippedSourceFragments.slice(0, 3).join(', ')}${s.skippedSourceFragments.length > 3 ? ` +${s.skippedSourceFragments.length - 3} more` : ''}.`;
    }
    return message;
  }

  const parts: string[] = [
    `Discovery finished: ${s.imported} lead${s.imported === 1 ? '' : 's'} imported from ${source}`,
  ];
  if (s.partiallyVerified > 0 || s.unverified > 0) {
    parts.push(
      `${s.partiallyVerified} partially verified (same business seen in 2+ sources), ${s.unverified} not yet verified (single source — pending assessment)`
    );
  }
  if (s.duplicates > 0) parts.push(`${s.duplicates} duplicate${s.duplicates === 1 ? '' : 's'} skipped`);
  let message = parts.join(' — ') + '.';
  if (s.filteredOut > 0) {
    message += ` Hard filters rejected ${s.filteredOut} candidate${s.filteredOut === 1 ? '' : 's'}${s.filterReasonFragments.length ? ' — ' + s.filterReasonFragments.slice(0, 3).join(', ') : ''}.`;
  }
  if (s.skippedSourceFragments.length > 0) {
    message += ` Skipped: ${s.skippedSourceFragments.slice(0, 3).join(', ')}${s.skippedSourceFragments.length > 3 ? ` +${s.skippedSourceFragments.length - 3} more` : ''}.`;
  }
  return message;
}

// ===== LEAD EVIDENCE ENRICHMENT =====

/**
 * Resolve missing hard-constraint data (employee count, website) for
 * candidates via targeted per-company web searches.
 *
 * The generic provider (web search) has no native employee filter, and list
 * pages rarely expose each company's size or URL in its snippet. Without
 * this step nearly every candidate arrives with employeeCount = null and
 * website = null, and an explicit "20-200 employees + website" request
 * would (honestly) reject almost everything.
 *
 * Honesty guarantees:
 *   - values come ONLY from explicit statements in real search evidence;
 *   - the enrichment LLM is forbidden from estimating/averaging/guessing;
 *   - evidence that states nothing leaves the field UNKNOWN, which the
 *     hard validator then rejects — we never fabricate a passing value.
 */
async function enrichLeadEvidence(
  zai: ZAI,
  leads: DiscoveredLead[],
  params: DiscoveryParams,
  maxCandidates = 30,
  batchSize = 5
): Promise<{ enriched: DiscoveredLead[]; enrichedCount: number }> {
  const needIndexes: number[] = [];
  leads.forEach((lead, idx) => {
    const needsSize = lead.employeeCount == null && !lead.employeeRange;
    const needsSite = !lead.website;
    if (needsSize || needsSite) needIndexes.push(idx);
  });

  if (needIndexes.length === 0) {
    return { enriched: leads, enrichedCount: 0 };
  }

  const capped = needIndexes.slice(0, maxCandidates);
  const updates = new Map<
    number,
    { employeeCount: number | null; employeeRange: string | null; website?: string | null }
  >();

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // One evidence search per candidate. All SDK calls go through the shared
  // job-wide pacer (pacedZaiCall), which spaces calls out and retries 429s.
  async function searchEvidence(lead: DiscoveredLead): Promise<Array<{ name?: string; url?: string; snippet?: string }>> {
    const query = `"${lead.businessName}" ${params.niche} official website employees company size headcount`;
    try {
      const res = await pacedZaiCall(() => zai.functions.invoke('web_search', { query, num: 5 }));
      return Array.isArray(res) ? res : [];
    } catch (err) {
      console.error(`[DiscoveryService] evidence search failed for "${lead.businessName}":`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  for (let i = 0; i < capped.length; i += batchSize) {
    const batch = capped.slice(i, i + batchSize);

    // Gather REAL evidence for each company in the batch (staggered, retry-on-429)
    const evidences: Array<{ status: 'fulfilled' | 'rejected'; value?: Array<{ name?: string; url?: string; snippet?: string }> }> = [];
    for (let j = 0; j < batch.length; j++) {
      const lead = leads[batch[j]];
      if (j > 0) await sleep(1200); // stagger to stay under the rate limit
      try {
        evidences.push({ status: 'fulfilled', value: await searchEvidence(lead) });
      } catch {
        evidences.push({ status: 'rejected' });
      }
    }

    const evidenceText = batch
      .map((leadIdx, j) => {
        const lead = leads[leadIdx];
        const ev = evidences[j];
        if (ev.status !== 'fulfilled' || !Array.isArray(ev.value) || ev.value.length === 0) {
          return `[company ${j + 1}: ${lead.businessName}]\n(no search evidence found)`;
        }
        const rows = ev.value
          .slice(0, 5)
          .map((r: { name?: string; url?: string; snippet?: string }) =>
            `- ${(r.name || '').slice(0, 120)}: ${(r.snippet || '').slice(0, 300)} (${r.url || ''})`
          )
          .join('\n');
        return `[company ${j + 1}: ${lead.businessName}]\n${rows}`;
      })
      .join('\n\n');

    try {
      const response = await pacedZaiCall(() =>
        zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content:
                'You are a precise data extraction assistant. Return only valid JSON arrays. NEVER invent, estimate, or average values — extract only what the evidence explicitly states.',
            },
            {
              role: 'user',
              content: `For each company below, extract its official website and current employee count from the search evidence ONLY.
Rules:
- website: the company's OWN official website URL (e.g. https://acme.io) if it is clearly identifiable from the evidence (its domain appearing as the company's site, a LinkedIn/company-directory entry linking to it). Otherwise null. Never return a marketplace, news article, or job-board URL.
- employeeCount/employeeRange: use ONLY explicit statements of employee count / headcount / company size (e.g. "85 employees", "51-200 employees", "10,000+ employees"). Exact number → employeeCount (employeeRange null). Only a range → employeeRange as that exact string (employeeCount null).
- NEVER estimate or guess. If the evidence does not state a value, return null for that field.
Return ONLY a JSON array with one object per company, in the same order as given: {"website": string|null, "employeeCount": number|null, "employeeRange": string|null}

${evidenceText}`,
          },
        ],
        model: 'auto',
        // Deterministic evidence extraction — never creative
        temperature: 0,
      })
      );

      let cleaned = (response.choices?.[0]?.message?.content || '[]').trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      const arr = JSON.parse(cleaned);
      if (Array.isArray(arr)) {
        batch.forEach((leadIdx, j) => {
          const item = arr[j] as Record<string, unknown> | undefined;
          if (!item) return;
          const ec =
            typeof item.employeeCount === 'number' &&
            Number.isFinite(item.employeeCount) &&
            item.employeeCount > 0
              ? Math.round(item.employeeCount)
              : null;
          const er =
            typeof item.employeeRange === 'string' && item.employeeRange.trim()
              ? item.employeeRange.trim().slice(0, 40)
              : null;
          const site =
            typeof item.website === 'string' && /^https?:\/\//i.test(item.website.trim())
              ? item.website.trim()
              : null;
          // Deterministic anti-misattribution guard: only accept a resolved
          // website when the domain clearly corresponds to the company name
          // ("Juro" → juro.com ✓, "Juro" → rfp.wiki ✗). Prevents enrichment
          // from attaching a directory/news domain to a company.
          let guardedSite: string | null = null;
          if (site) {
            try {
              const host = new URL(site).hostname.replace(/^www\./, '');
              const domainRoot = host.split('.').slice(-2).join('.');
              const nameToken = leads[leadIdx].businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
              const domainToken = domainRoot.replace(/[^a-z0-9]/g, '');
              if (nameToken.length >= 4 && domainToken.includes(nameToken)) {
                guardedSite = site;
              }
            } catch {
              guardedSite = null;
            }
          }
          if (ec !== null || er !== null || guardedSite !== null) {
            updates.set(leadIdx, { employeeCount: ec, employeeRange: er, website: guardedSite });
          }
        });
      }
    } catch (err) {
      console.error('[DiscoveryService] evidence enrichment batch failed:', err);
    }
  }

  const enriched = [...leads];
  let enrichedCount = 0;
  for (const [idx, data] of updates) {
    const lead = enriched[idx];
    // Fill ONLY missing values — never overwrite data the provider gave us
    enriched[idx] = {
      ...lead,
      employeeCount: lead.employeeCount ?? data.employeeCount,
      employeeRange: lead.employeeRange ?? data.employeeRange,
      website: lead.website || data.website || undefined,
    };
    enrichedCount++;
  }

  console.log(
    `[DiscoveryService] evidence enrichment: ${capped.length} candidates looked up, ${enrichedCount} resolved with evidence`
  );

  return { enriched, enrichedCount };
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
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // The web_search provider rate-limits bursts (429). Searches run with a
  // stagger and retry-with-backoff so a full job completes reliably.
  async function searchOnce(query: string, num: number): Promise<Array<{ url: string; name: string; snippet: string }>> {
    return pacedZaiCall(() => zai.functions.invoke('web_search', { query, num }));
  }

  for (let qi = 0; qi < searchQueries.length; qi++) {
    const query = searchQueries[qi];
    if (discoveredLeads.length >= maxResults) break;

    try {
      // Web search
      const searchResults = await searchOnce(query, Math.min(20, maxResults - discoveredLeads.length));

      console.log(`[DiscoveryService] "${query}" → ${searchResults.length} search results`);

      if (searchResults.length === 0) continue;

      // Extract structured lead data from search results using LLM
      let leadsFromResults = await extractLeadsFromSearchResults(
        zai,
        searchResults,
        params,
        maxResults - discoveredLeads.length
      );

      // The extraction LLM is stochastic: for list/directory-style results it
      // sometimes over-excludes and returns []. One relaxed retry keeps
      // recall usable WITHOUT ever inventing data — the relaxed prompt still
      // reports unknown sizes/counts as null and the hard validator remains
      // the final gate.
      if (leadsFromResults.length === 0) {
        leadsFromResults = await extractLeadsFromSearchResults(
          zai,
          searchResults,
          params,
          maxResults - discoveredLeads.length,
          true
        );
      }

      // Record which search variation produced each lead (spec §3.3 provenance).
      // Leads extracted from this query keep the query text; never overwrite
      // a provenance tag set by a more specific inner step.
      discoveredLeads.push(
        ...leadsFromResults.map((l) => ({ ...l, discoveredVia: l.discoveredVia ?? query }))
      );
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
 * ALSO records cross-source corroboration: when the same business identity is
 * returned by 2+ different sources, the lead is tagged `corroborated: true`
 * (spec §7.2 — corroboration is identity confidence, never field-level proof).
 */
function dedupeDiscoveredLeads(leads: DiscoveredLead[]): DiscoveredLead[] {
  const seen = new Set<string>();
  const unique: DiscoveredLead[] = [];
  /** Key -> set of distinct sources that returned it (for corroboration). */
  const keySources = new Map<string, Set<string>>();

  const normalizeName = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizeSite = (site?: string) =>
    site ? site.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') : '';

  const keysFor = (lead: DiscoveredLead): string[] => [
    lead.website ? `site:${normalizeSite(lead.website)}` : '',
    lead.email ? `email:${lead.email.toLowerCase()}` : '',
    `name:${normalizeName(lead.businessName)}`,
  ].filter(Boolean);

  for (const lead of leads) {
    const keys = keysFor(lead);

    // Track which sources contributed to this identity
    for (const k of keys) {
      if (!keySources.has(k)) keySources.set(k, new Set());
      keySources.get(k)!.add(lead.source);
    }

    // A lead is a duplicate if any of its keys was already seen
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    unique.push(lead);
  }

  // Corroborated = identity surfaced from 2+ independent sources
  for (const lead of unique) {
    const sources = new Set<string>();
    for (const k of keysFor(lead)) {
      for (const src of keySources.get(k) ?? []) sources.add(src);
    }
    if (sources.size >= 2) {
      lead.corroborated = true;
      // Provenance upgrade: record the independent sources explicitly
      lead.discoveredVia = `corroborated by: ${Array.from(sources).sort().join(' + ')}`;
    }
  }

  return unique;
}

/**
 * Bounded, intent-preserving query expansion (spec §3.3). Adds industry
 * synonyms and standard commercial phrasings — NEVER unrelated industries —
 * so a niche with thin first-query recall still fills the requested result
 * count without drifting from the user's intent. Hard-capped at 10 queries.
 */
const NICHE_SYNONYMS: Record<string, string[]> = {
  dental: ['dentist', 'dental clinic', 'orthodontist'],
  healthcare: ['medical clinic', 'doctor office', 'health center'],
  clinic: ['medical clinic', 'health center'],
  restaurant: ['restaurants', 'dining', 'eatery'],
  cafe: ['coffee shop', 'café'],
  gym: ['fitness center', 'fitness studio'],
  fitness: ['gym', 'personal trainer'],
  salon: ['hair salon', 'beauty salon'],
  spa: ['day spa', 'wellness center'],
  hotel: ['hotels', 'boutique hotel'],
  'real estate': ['real estate agency', 'realtor', 'property agency'],
  legal: ['law firm', 'attorney office'],
  lawyer: ['law firm', 'attorney'],
  accounting: ['accounting firm', 'CPA firm'],
  construction: ['construction company', 'contractor'],
  automotive: ['auto repair shop', 'car dealership'],
  'e-commerce': ['online store', 'ecommerce company'],
  manufacturing: ['manufacturer', 'factory'],
  logistics: ['logistics company', 'freight company'],
  education: ['training institute', 'tutoring center'],
  marketing: ['marketing agency', 'digital marketing agency'],
  software: ['software company', 'SaaS company'],
  it: ['IT services company', 'IT company'],
};

/**
 * Expand a niche into synonymous/commercial variants, preserving intent.
 * Returns at most 3 synonyms, only when known — no generic padding.
 *
 * REVERSE LOOKUP: the map is keyed by the canonical niche ("dental"), but
 * users type the variant ("dentist"). When the requested niche matches one
 * of the map's synonym VALUES, its key and sibling synonyms are returned —
 * otherwise niches like "dentist" or "restaurants" (a value of "restaurant")
 * expand to nothing and the job runs with only the 4 base queries, capping
 * real volume at ~40 raw results (the provider returns 10 per query).
 */
function nicheVariants(niche: string): string[] {
  const key = niche.toLowerCase().trim();
  if (NICHE_SYNONYMS[key]) return NICHE_SYNONYMS[key];
  for (const [canonical, variants] of Object.entries(NICHE_SYNONYMS)) {
    if (variants.includes(key)) {
      // Siblings first (same industry, different phrasing), then the
      // canonical key itself — bounded to 3 like the forward lookup.
      const siblings = variants.filter((v) => v !== key);
      return [...siblings, canonical].slice(0, 3);
    }
  }
  return [];
}

export function buildSearchQueries(params: DiscoveryParams): string[] {
  const { niche, country, city, source } = params;
  // Worldwide-safe location string (spec §5): pieces that exist are joined;
  // when neither is provided the queries run location-free.
  const location = [city, country].filter(Boolean).join(', ');
  const queries: string[] = [];

  // BUSINESS-CONTEXT QUERIES (spec §3/§6): when a campaign override or the
  // selected business profile says WHO the user targets, add 1-2 intent-
  // driven queries so discovery surfaces prospects relevant to the SENDER'S
  // offer — e.g. "corporate wellness providers partnering with hospitals" —
  // while keeping every query on-niche and on-location.
  const offerHint = params.campaign?.offer?.trim() || params.campaign?.audience?.trim() || '';
  const contextQuery = offerHint && source === 'ai_search'
    ? `${niche} businesses serving ${offerHint}${location ? ` in ${location}` : ''}`.replace(/\s+/g, ' ')
    : '';

  switch (source) {
    case 'ai_search': {
      queries.push(`${niche} businesses${location ? ` in ${location}` : ''}`);
      queries.push(`${niche} companies ${location} contact details`.replace(/\s+/g, ' '));
      queries.push(`best ${niche} services${location ? ` in ${location}` : ''} reviews`);
      // Intent-preserving expansion (spec §3.3): synonyms of the SAME
      // industry, not unrelated industries. Each variant reaches provider
      // pages the primary phrasing misses, materially raising recall.
      for (const variant of nicheVariants(niche)) {
        queries.push(`${variant} businesses in ${location}`);
        queries.push(`${variant} ${location} contact details`);
      }
      // Directory/list phrasing surfaces company-list pages that single-
      // result pages miss — still strictly on-niche and on-location.
      queries.push(`${niche} companies directory list ${location}`.replace(/\s+/g, ' '));
      if (contextQuery) queries.unshift(contextQuery);
      break;
    }
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
  //
  // EXCEPTION — explicit EMPLOYEE-COUNT criteria: when the user requested an
  // employee range/count as a hard constraint, size-targeted queries ARE added
  // — and run FIRST, because they are the ones that surface pages stating
  // company sizes (directories, company lists, LinkedIn-size pages), which is
  // what makes the subsequent hard validation able to VERIFY employee counts
  // instead of rejecting everything as unknown. The provider rate-limits
  // bursts, so the most valuable queries must not be last.
  const c = params.criteria;
  if (c && (c.exactEmployeeCount !== undefined || c.employeeMin !== undefined || c.employeeMax !== undefined)) {
    const reqMin = c.exactEmployeeCount ?? c.employeeMin ?? 0;
    const reqMax = c.exactEmployeeCount ?? c.employeeMax ?? Number.POSITIVE_INFINITY;

    // Standard company-size buckets (the labels directories like LinkedIn/
    // Wellfound/gregslist actually print in their snippets). Quoting them
    // ("51-200 employees") surfaces pages whose snippets name companies
    // WITH sizes — the highest-yield search strategy for size-verified
    // discovery. Only buckets intersecting the requested range are used.
    const BUCKETS: Array<{ label: string; min: number; max: number | null }> = [
      { label: '1-10', min: 1, max: 10 },
      { label: '11-50', min: 11, max: 50 },
      { label: '51-200', min: 51, max: 200 },
      { label: '201-500', min: 201, max: 500 },
      { label: '501-1,000', min: 501, max: 1000 },
      { label: '1,001-5,000', min: 1001, max: 5000 },
      { label: '5,001-10,000', min: 5001, max: 10000 },
      { label: '10,000+', min: 10000, max: null },
    ];
    const overlapping = BUCKETS.filter(
      (b) => b.min <= reqMax && (b.max === null || b.max >= reqMin)
    ).slice(0, 2);

    const sizeDesc =
      c.exactEmployeeCount !== undefined
        ? `exactly ${c.exactEmployeeCount} employees`
        : c.employeeMin !== undefined && c.employeeMax !== undefined
          ? `${c.employeeMin}-${c.employeeMax} employees`
          : c.employeeMin !== undefined
            ? `more than ${c.employeeMin} employees`
            : `fewer than ${c.employeeMax} employees`;

    const sizeQueries: string[] = overlapping.map(
      (b) => `${niche} companies in ${location} "${b.label} employees"`
    );
    sizeQueries.push(`mid-size ${niche} companies ${location} employee count ${sizeDesc}`);
    queries.unshift(...sizeQueries);
  }

  // Provider rate limits make every query cost ~4s of pacing — keep the
  // total bounded so a job cannot run unbounded, while still leaving room
  // for expansion. The most valuable (size-targeted) queries run first.
  return queries.slice(0, 10);
}

// ===== LLM EXTRACTION =====

async function extractLeadsFromSearchResults(
  zai: ZAI,
  searchResults: Array<{ url: string; name: string; snippet: string }>,
  params: DiscoveryParams,
  maxLeads: number,
  relaxed = false
): Promise<DiscoveredLead[]> {
  if (searchResults.length === 0) return [];

  const resultsText = searchResults
    .slice(0, 20)
    .map((r, i) => `[${i + 1}] Name: ${r.name}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`)
    .join('\n\n');

  // Hard criteria make the extraction itself strict — but the FINAL gate is
  // the deterministic validator (matchHardCriteria), which the LLM cannot
  // influence. Unknown employee counts must be reported honestly as null.
  const c = params.criteria;
  const hardFilterLines: string[] = [];
  if (c) {
    if (c.exactEmployeeCount !== undefined) {
      hardFilterLines.push(`- Employee count: EXACTLY ${c.exactEmployeeCount} employees (inclusive). A company with any other employee count MUST NOT be included.`);
    } else if (c.employeeMin !== undefined && c.employeeMax !== undefined) {
      hardFilterLines.push(`- Employee count: between ${c.employeeMin} and ${c.employeeMax} (inclusive). A company with fewer than ${c.employeeMin} or more than ${c.employeeMax} employees MUST NOT be included.`);
    } else if (c.employeeMin !== undefined) {
      hardFilterLines.push(`- Employee count: at least ${c.employeeMin}. A company with fewer employees MUST NOT be included.`);
    } else if (c.employeeMax !== undefined) {
      hardFilterLines.push(`- Employee count: at most ${c.employeeMax}. A company with more employees MUST NOT be included.`);
    }
    if (c.excludeTypes.length > 0) {
      hardFilterLines.push(`- Excluded company types (MUST NOT be included under any circumstances): ${c.excludeTypes.join(', ')}.`);
    }
    if (c.website === 'required') {
      hardFilterLines.push('- Website: REQUIRED. Only include businesses that have a real website URL.');
    } else if (c.website === 'absent') {
      hardFilterLines.push('- Website: must be ABSENT. Only include businesses WITHOUT a website.');
    }
  }

  const hardFilterBlock =
    hardFilterLines.length > 0
      ? `HARD FILTERS (a business that CONTRADICTS any of these MUST NOT appear in your output — e.g. evidence shows a clearly larger/smaller company size than the range, or the business IS an excluded type, or it clearly has no website):
${hardFilterLines.join('\n')}
IMPORTANT — do NOT over-exclude: if a business plausibly matches the niche and hard filters but its employee count or website is NOT VISIBLE in the snippets, still INCLUDE it with employeeCount: null / employeeRange: null / website: null. A later verification step looks up missing evidence. NEVER GUESS a value, and NEVER exclude a business merely because its size is unknown — exclude it ONLY when the evidence CONTRADICTS a filter.`
      : '';

  const softSignalBlock =
    c && (c.growthSignals || c.hiringSignals)
      ? `SOFT PREFERENCES (rank higher, never reject): ${[
          c.growthSignals ? 'recent growth / expansion signals' : '',
          c.hiringSignals ? 'hiring or recruiting activity' : '',
        ].filter(Boolean).join(', ')}.`
      : '';

  const strictnessBlock = relaxed
    ? `The previous extraction pass returned nothing. This is a SECOND, more inclusive pass:
- Extract EVERY concrete business/company named in the results that fits the NICHE and is not an obviously excluded type.
- Review/directory platforms (e.g. G2, Capterra) and media sites are NOT businesses of the niche — skip those.
- If a size or website is not visible, include the business with employeeCount: null / employeeRange: null / website: null.
- NEVER invent a value.`
    : `Enforce the HARD FILTERS strictly, but do NOT over-exclude: unknown size/website is NOT a reason to exclude — include with nulls and let the verification step decide.`;

  const prompt = `You are a business lead extraction assistant. Extract structured business lead data from the search results below.

NICHE: ${params.niche}
COUNTRY: ${params.country}
CITY: ${params.city || 'Not specified'}
TARGET SOURCE: ${params.source}
QUALIFYING REQUIREMENTS: ${params.requirements || 'None — accept all matching businesses'}
${hardFilterBlock ? `\n${hardFilterBlock}\n` : ''}${softSignalBlock ? `\n${softSignalBlock}\n` : ''}
${strictnessBlock}

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
- employeeCount: (number or null) The business's ACTUAL employee count, but ONLY if explicitly stated in the search results (e.g. "85 employees", "headcount: 120"). NEVER estimate or invent this number. If not stated, use null.
- employeeRange: (string or null) If the results only give an employee RANGE (e.g. "51-100", "201-500", "10,000+"), put that exact range string here and set employeeCount to null.
- city: City if different from search
- country: Country if different from search

${hardFilterBlock ? 'Enforce the HARD FILTERS strictly. ' : ''}Prioritize businesses that match the qualifying requirements and soft preferences when present.
Return ONLY a JSON array of objects. No explanation, no markdown.
If no businesses found, return empty array [].
Maximum ${maxLeads} results.`;

  try {
    const response = await pacedZaiCall(() =>
      zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a precise data extraction assistant. Return only valid JSON arrays. No markdown, no explanations.' },
          { role: 'user', content: prompt },
        ],
        model: 'auto',
        // Data extraction must be deterministic — sampling variance was
        // producing wildly different candidate yields between runs.
        temperature: 0,
      })
    );

    const content = response.choices?.[0]?.message?.content || '[]';

    // Parse the LLM response - handle potential markdown wrapping
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    // Validate and normalize each lead
    const normalized = parsed
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
        employeeCount:
          typeof lead.employeeCount === 'number' && Number.isFinite(lead.employeeCount) && lead.employeeCount >= 0
            ? Math.round(lead.employeeCount)
            : null,
        employeeRange:
          typeof lead.employeeRange === 'string' && lead.employeeRange.trim()
            ? lead.employeeRange.trim().slice(0, 40)
            : null,
        city: lead.city ? String(lead.city).trim() : undefined,
        country: lead.country ? String(lead.country).trim() : undefined,
        niche: params.niche,
        source: params.source,
      }));
    console.log(`[DiscoveryService] LLM extraction: ${normalized.length} candidates (raw ${Array.isArray(parsed) ? parsed.length : 0}, cap ${maxLeads})`);
    if (normalized.length === 0) {
      // Observability: an empty extraction must be distinguishable from an
      // API failure or an unexpected response shape.
      console.log(`[DiscoveryService] extraction empty — raw content (${content.length} chars): ${content.slice(0, 300)}`);
    }
    return normalized;
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
