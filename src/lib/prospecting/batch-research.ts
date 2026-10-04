// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Batch Deep-Research Queue (Sections 15-16, 18)
//
// Research MANY leads without clicking each one:
//   Lead Queue → per-lead prospect pipeline (concurrency-limited)
//   → per-lead status tracking → honest per-lead results.
//
// Pattern: ResearchJob (DB row + detached processing + status polling) —
// mirrors the DiscoveryJob pattern. Credits are charged per lead BY the
// prospect pipeline itself (its own idempotency + refund semantics, cost =
// PIPELINE_CREDIT_COST). Before starting, the UI shows the estimated cost
// (leads × per-lead cost) — the batch never silently consumes credits:
// when the balance runs out, remaining leads are SKIPPED with a reason.
// Per-lead progress lives in the job's results JSON; the Lead row itself
// is never annotated (no researchStatus on leads).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { checkCreditSufficiency } from '@/lib/credit-service';
import {
  startProspectPipeline,
  runProspectPipeline,
} from './pipeline';
import { PIPELINE_CREDIT_COST, type ResearchDepth } from './types';

const DEFAULT_CONCURRENCY = parseInt(process.env.RESEARCH_BATCH_CONCURRENCY || '2', 10);
const MAX_BATCH_SIZE = parseInt(process.env.RESEARCH_BATCH_MAX || '200', 10);

export interface BatchResearchResult {
  success: boolean;
  jobId?: string;
  total?: number;
  estimatedCostPerLead?: number;
  error?: string;
  errorCode?: 'NO_LEADS' | 'BATCH_TOO_LARGE' | 'ALREADY_RUNNING';
}

export interface BatchLeadResult {
  leadId: string;
  businessName: string;
  status: 'completed' | 'failed' | 'skipped';
  pipelineId?: string;
  error?: string;
}

interface BatchResultRow {
  results: BatchLeadResult[];
  completedCount: number;
  failedCount: number;
  skippedCount: number;
}

function safeParseResults(raw: string | null): BatchResultRow {
  const empty: BatchResultRow = { results: [], completedCount: 0, failedCount: 0, skippedCount: 0 };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.results)) {
      return {
        results: parsed.results,
        completedCount: typeof parsed.completedCount === 'number' ? parsed.completedCount : 0,
        failedCount: typeof parsed.failedCount === 'number' ? parsed.failedCount : 0,
        skippedCount: typeof parsed.skippedCount === 'number' ? parsed.skippedCount : 0,
      };
    }
    return empty;
  } catch {
    return empty;
  }
}

async function persistResults(jobId: string, row: BatchResultRow): Promise<void> {
  await db.researchJob.update({
    where: { id: jobId },
    data: {
      results: JSON.stringify(row),
      completedCount: row.completedCount,
      failedCount: row.failedCount,
      skippedCount: row.skippedCount,
    },
  }).catch(() => {});
}

/** Start a batch research job over the given leads (validated to the user). */
export async function startBatchResearch(
  userId: string,
  leadIds: string[],
  depth: ResearchDepth = 'deep'
): Promise<BatchResearchResult> {
  const unique = [...new Set(leadIds.filter((id) => typeof id === 'string' && id))];
  if (unique.length === 0) {
    return { success: false, error: 'No leads provided', errorCode: 'NO_LEADS' };
  }
  if (unique.length > MAX_BATCH_SIZE) {
    return {
      success: false,
      error: `Batch too large (max ${MAX_BATCH_SIZE})`,
      errorCode: 'BATCH_TOO_LARGE',
    };
  }

  // Ownership check — only the user's own active leads
  const owned = await db.lead.findMany({
    where: { id: { in: unique }, userId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (owned.length === 0) {
    return { success: false, error: 'No valid leads found', errorCode: 'NO_LEADS' };
  }

  // One live batch per user — a second concurrent batch would double-spend
  const live = await db.researchJob.findFirst({
    where: { userId, status: { in: ['queued', 'running'] } },
  });
  if (live) {
    return {
      success: false,
      error: 'A research batch is already running. Wait for it to finish.',
      errorCode: 'ALREADY_RUNNING',
    };
  }

  const job = await db.researchJob.create({
    data: {
      userId,
      status: 'queued',
      depth,
      leadIds: JSON.stringify(owned.map((l) => l.id)),
      total: owned.length,
    },
  });

  // Fire-and-forget batch processing (DiscoveryJob pattern)
  void processBatchResearch(job.id).catch(async (err) => {
    console.error(`[ResearchBatch] Unhandled failure for job ${job.id}:`, err);
    await db.researchJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: 'Unexpected batch error', completedAt: new Date() },
    }).catch(() => {});
  });

  return {
    success: true,
    jobId: job.id,
    total: owned.length,
    estimatedCostPerLead: PIPELINE_CREDIT_COST,
  };
}

/** Background processor — bounded concurrency, honest per-lead results. */
async function processBatchResearch(jobId: string): Promise<void> {
  const job = await db.researchJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'queued') return;

  let leadIds: string[] = [];
  try {
    const parsed = JSON.parse(job.leadIds);
    if (Array.isArray(parsed)) leadIds = parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    leadIds = [];
  }
  const concurrency = Number.isFinite(DEFAULT_CONCURRENCY) && DEFAULT_CONCURRENCY > 0
    ? Math.min(DEFAULT_CONCURRENCY, 4)
    : 2;

  await db.researchJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date() },
  });

  // Lead names for results
  const leads = await db.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, businessName: true },
  });
  const nameById = new Map(leads.map((l) => [l.id, l.businessName]));

  const row: BatchResultRow = { results: [], completedCount: 0, failedCount: 0, skippedCount: 0 };
  let stopReason: string | null = null;

  const runOne = async (leadId: string): Promise<void> => {
    const businessName = nameById.get(leadId) || 'Unknown';

    // Credit gate BEFORE starting this lead — never silently overdraw.
    // The per-lead cost is the prospect pipeline's own constant charge.
    const perLeadCost = PIPELINE_CREDIT_COST;
    const balance = await checkCreditSufficiency(job.userId, perLeadCost);
    if (!balance.sufficient) {
      row.results.push({
        leadId,
        businessName,
        status: 'skipped',
        error: `Insufficient credits (${balance.balance} left, needs ${perLeadCost})`,
      });
      row.skippedCount += 1;
      stopReason = `Stopped early: insufficient credits (${balance.balance} left)`;
      return;
    }

    const started = await startProspectPipeline(job.userId, leadId);
    if (!started.success || !started.pipelineId) {
      row.results.push({
        leadId,
        businessName,
        status: 'skipped',
        error: started.error || 'Could not start pipeline',
      });
      row.skippedCount += 1;
      return;
    }

    try {
      await runProspectPipeline(started.pipelineId);
      const pipeline = await db.prospectPipeline.findUnique({
        where: { id: started.pipelineId },
        select: { status: true, error: true },
      });
      if (pipeline?.status === 'completed') {
        row.results.push({ leadId, businessName, status: 'completed', pipelineId: started.pipelineId });
        row.completedCount += 1;
      } else {
        row.results.push({
          leadId,
          businessName,
          status: 'failed',
          pipelineId: started.pipelineId,
          error: pipeline?.error || 'Pipeline failed',
        });
        row.failedCount += 1;
      }
    } catch (err) {
      row.results.push({
        leadId,
        businessName,
        status: 'failed',
        pipelineId: started.pipelineId,
        error: err instanceof Error ? err.message : String(err),
      });
      row.failedCount += 1;
    }
  };

  // Bounded-concurrency worker pool over the lead queue
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(leadIds.length, 1)) }, async () => {
    while (cursor < leadIds.length && !stopReason) {
      const leadId = leadIds[cursor++];
      await runOne(leadId);
      await persistResults(jobId, row).catch(() => {});
    }
  });
  await Promise.all(workers);

  // Remaining leads (when stopped early for credit reasons) are skipped
  while (cursor < leadIds.length) {
    const leadId = leadIds[cursor++];
    row.results.push({
      leadId,
      businessName: nameById.get(leadId) || 'Unknown',
      status: 'skipped',
      error: stopReason || 'Not processed',
    });
    row.skippedCount += 1;
  }

  await db.researchJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      results: JSON.stringify(row),
      completedCount: row.completedCount,
      failedCount: row.failedCount,
      skippedCount: row.skippedCount,
      error: stopReason,
      completedAt: new Date(),
    },
  }).catch(() => {});
}

/** Read model for the status endpoint. */
export async function getResearchJobStatus(jobId: string, userId: string) {
  const job = await db.researchJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!job) return null;
  const parsed = safeParseResults(job.results);
  return {
    id: job.id,
    status: job.status as 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
    depth: job.depth === 'quick' ? ('quick' as const) : ('deep' as const),
    total: job.total,
    completedCount: job.completedCount,
    failedCount: job.failedCount,
    skippedCount: job.skippedCount,
    results: parsed.results,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}
