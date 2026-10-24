// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Runner (Phase 18: Autopilot Core)
//
// Executes one Autopilot run under the ONE-parent-execution model:
//   claim run (atomic) → snapshot profile/context → for each niche:
//     startDiscoveryJob (EXISTING production pipeline, ≈20/batch)
//     → poll job to terminal state
//     → resolve discovered payloads to persisted Lead rows
//     → AutopilotLead ledger insert (DB-level unique guard)
//   → collect ALL eligible leads of the run
//   → ONE parent WorkflowExecution for the whole run/batch
//     (leads are child items under it — NEVER one execution per lead)
//   → detached finalizer settles per-lead outcomes + run aggregates
//   → honest counters + errors → schedule next run
//
// Concurrency story (layered):
//   1. AutopilotWorkflow ACTIVE→RUNNING claim via updateMany count==1
//   2. AutopilotRun QUEUED→RUNNING claim via updateMany count==1
//   3. Per-user in-process async mutex (single Node runtime deployment)
//   4. AutopilotLead @@unique([autopilotId, leadId]) — DB-level
//      "one lead processed at most once per autopilot"
//   5. WorkflowExecution.idempotencyKey (stable per autopilot RUN)
//   6. AutopilotRun.runKey @@unique — duplicate invocation protection
//      (a replayed scheduler slot / manual invocation converges on the
//      SAME run row instead of creating a second run)
//   7. Discovery credits: idempotency keys inside the pipeline itself
//
// Billing (unchanged semantics, single scope per run):
//   ONE actual workflow execution = ONE flat 5-credit charge keyed
//   `wfexec-run:autopilot-{id}-run-{runId}` — idempotent under replay;
//   discovery alone charges 0; never-started runs auto-refund.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { startDiscoveryJob } from '@/lib/lead-discovery-service';
import { executeWorkflowBatch } from '@/lib/workflow-batch';
import { checkCreditSufficiency, CREDIT_COSTS } from '@/lib/credit-service';
import {
  chargeWorkflowExecutionFee,
  refundWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS,
} from '@/lib/workflow-credits';
import { normalizeCountryName } from '@/lib/countries';
import { MAX_COUNTRIES_PER_JOB } from '@/lib/lead-discovery/normalization';
import { runCountriesFromGeography } from './country-selection';
import { resolveBusinessProfileForUser } from '@/lib/lead-intelligence';
import { normalizeNicheKey } from '@/lib/niches';
import {
  AUTOPILOT_DISCOVERY_BATCH,
  AUTOPILOT_EXECUTION_SETTLE_POLL_MS,
  AUTOPILOT_EXECUTION_SETTLE_TIMEOUT_MS,
  AUTOPILOT_JOB_POLL_MS,
  AUTOPILOT_JOB_TIMEOUT_MS,
  AUTOPILOT_NICHE_PACING_MS,
  AUTOPILOT_STUCK_MS,
  SCHEDULE_INTERVAL_MS,
  isAutopilotSchedule,
  type AutopilotSchedule,
} from './constants';
import { computeNextRunAt, parsePersistedSchedule } from './schedule';
import { isAutopilotPlanEligible, resolveUserPlan } from '@/lib/entitlement-service';

// ===== per-user in-process mutex =====

const userLocks = new Map<string, Promise<unknown>>();

/**
 * Serialize async work per user within this process. The production
 * deployment is a single Node runtime over SQLite; combined with the
 * DB-level ledger unique constraint this makes concurrent autopilot
 * runs for the same user safe.
 */
export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) || Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  userLocks.set(userId, previous.then(() => gate));
  try {
    await previous.catch(() => {});
    return await fn();
  } finally {
    release();
    if (userLocks.get(userId) === gate) {
      // chain completed — clean up so the map does not grow forever
      userLocks.delete(userId);
    }
  }
}

// ===== scheduling helpers =====

/**
 * Legacy-compatible next-run helper (Phase 18 API surface, kept for
 * backward compatibility with existing callers/tests).
 * Phase 22: whitelist strings keep their EXACT legacy absolute-interval
 * behavior; canonical JSON schedule strings compute through the
 * timezone-aware engine; anything else → null (legacy contract).
 */
export function computeNextRun(schedule: string, from: Date = new Date()): Date | null {
  if (typeof schedule !== 'string') return null;
  const trimmed = schedule.trim();
  if (!trimmed) return null;
  if (isAutopilotSchedule(trimmed)) {
    return new Date(from.getTime() + SCHEDULE_INTERVAL_MS[trimmed]);
  }
  if (trimmed.startsWith('{')) {
    return computeNextRunAt(parsePersistedSchedule(trimmed), from);
  }
  return null;
}

// ===== discovery job helpers =====

interface DiscoveredPayload {
  businessName?: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  [k: string]: unknown;
}

interface DiscoveryJobRow {
  id: string;
  status: string;
  totalFound: number;
  imported: number;
  duplicates: number;
  failed: number;
  filteredOut: number;
  errorMessage: string | null;
  resultData: string | null;
}

async function pollDiscoveryJob(jobId: string): Promise<DiscoveryJobRow> {
  const deadline = Date.now() + AUTOPILOT_JOB_TIMEOUT_MS;
  for (;;) {
    await new Promise((r) => setTimeout(r, AUTOPILOT_JOB_POLL_MS));
    const job = await db.discoveryJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error(`Discovery job ${jobId} disappeared`);
    if (job.status === 'completed' || job.status === 'failed') {
      return {
        id: job.id,
        status: job.status,
        totalFound: job.totalFound,
        imported: job.imported,
        duplicates: job.duplicates,
        failed: job.failed,
        filteredOut: job.filteredOut,
        errorMessage: job.errorMessage,
        resultData: job.resultData,
      };
    }
    if (Date.now() > deadline) {
      throw new Error(`Discovery job ${jobId} timed out after ${Math.round(AUTOPILOT_JOB_TIMEOUT_MS / 60000)} min`);
    }
  }
}

/**
 * Resolve a discovered payload to its PERSISTED lead row for this user.
 * The discovery pipeline already persisted + deduped everything in
 * resultData; matching is deterministic (website → email → phone →
 * name+location) — no guessing, no invented fields. Returns null when
 * the payload cannot be matched to a persisted lead.
 */
async function resolvePersistedLead(
  userId: string,
  payload: DiscoveredPayload
): Promise<{ id: string; businessName: string; niche: string | null } | null> {
  const leadSelect = { id: true, businessName: true, niche: true };
  const website = typeof payload.website === 'string' ? payload.website.trim() : '';
  if (website) {
    const bySite = await db.lead.findFirst({
      where: { userId, website, isActive: true },
      select: leadSelect,
    });
    if (bySite) return bySite;
  }
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (email) {
    const byEmail = await db.lead.findFirst({
      where: { userId, email, isActive: true },
      select: leadSelect,
    });
    if (byEmail) return byEmail;
  }
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  if (phone) {
    const byPhone = await db.lead.findFirst({
      where: { userId, phone, isActive: true },
      select: leadSelect,
    });
    if (byPhone) return byPhone;
  }
  const name = typeof payload.businessName === 'string' ? payload.businessName.trim() : '';
  if (name) {
    const city = typeof payload.city === 'string' ? payload.city.trim() : null;
    const countryRaw = typeof payload.country === 'string' ? payload.country.trim() : null;
    const country = countryRaw ? normalizeCountryName(countryRaw) || countryRaw : null;
    const byName = await db.lead.findFirst({
      where: {
        userId,
        businessName: name,
        isActive: true,
        ...(city ? { city } : {}),
        ...(country ? { country } : {}),
      },
      select: leadSelect,
    });
    if (byName) return byName;
    // name-only fallback (dedup service treats name matches as duplicates too)
    const byNameOnly = await db.lead.findFirst({
      where: { userId, businessName: name, isActive: true },
      select: leadSelect,
    });
    if (byNameOnly) return byNameOnly;
  }
  return null;
}

// ===== run execution =====

export interface AutopilotRunOutcome {
  runId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  discovered: number;
  saved: number;
  processed: number;
  executionsCreated: number;
  /** Phase 18 — the run's ONE parent WorkflowExecution (null until created). */
  executionId?: string | null;
  /** Phase 18 — the run's idempotency/run key. */
  runKey?: string | null;
  perNiche: Array<{
    niche: string;
    jobId: string | null;
    /** Phase 21 — every discovery job id of this niche's fan-out
     * (single-element = legacy/Worldwide/single-country shape). */
    jobs?: string[];
    /** Phase 21 — the countries this niche's jobs targeted
     * ([] = Worldwide). */
    countries?: string[];
    /** Phase 21 — true when this niche ran with global targeting. */
    worldwide?: boolean;
    status: string;
    discovered: number;
    imported: number;
    duplicates: number;
    error?: string;
  }>;
  error?: string;
}

interface AutopilotRow {
  id: string;
  userId: string;
  orgId: string | null;
  name: string;
  status: string;
  niches: string;
  geography: string;
  profileMappings: string;
  workflowId: string;
  schedule: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ═══ Phase 21 — multi-country discovery fan-out ═══
//
// The run's country selection resolves ONCE at run start (from the
// SAME in-memory autopilot row the whole run executes against — a
// config update after start can never mutate an in-flight run). The
// resolved list is snapshotted into AutopilotRun.config and fanned out
// to discovery jobs in MAX_COUNTRIES_PER_JOB chunks (the discovery
// pipeline's own per-job country bound):
//   • Worldwide        → ONE job per niche with NO country constraint
//   • ≤10 countries    → ONE job per niche carrying the full selection
//   • >10 countries    → one job per (niche × ≤10-country chunk)
// Every chunk job builds its own niche×country targeting combos inside
// the EXISTING Phase 8/9 discovery machinery — each discovered lead is
// attributed to the combo (niche/country/city) that produced it, and
// cross-combo/cross-country dedup happens inside the pipeline exactly
// as it already does for multi-niche runs.
function countryJobGroups(countries: string[]): (string[] | undefined)[] {
  if (countries.length === 0) return [undefined]; // Worldwide
  const groups: string[][] = [];
  for (let i = 0; i < countries.length; i += MAX_COUNTRIES_PER_JOB) {
    groups.push(countries.slice(i, i + MAX_COUNTRIES_PER_JOB));
  }
  return groups;
}

/** Normalized niche key (Phase 20 mapping lookup — never case-sensitive). */
const normalizeNicheKeyOf = (niche: string): string => normalizeNicheKey(niche);

/**
 * Execute one run of an autopilot. The caller MUST have already set the
 * autopilot status to RUNNING (scheduler does it atomically; the manual
 * route does it before calling) — this function claims its own run row
 * atomically and does the rest.
 */
export async function executeAutopilotRun(
  autopilot: AutopilotRow,
  runId: string,
  trigger: 'manual' | 'scheduler'
): Promise<AutopilotRunOutcome> {
  // Atomic run claim: only one winner can flip QUEUED→RUNNING.
  const claimed = await db.autopilotRun.updateMany({
    where: { id: runId, status: 'QUEUED' },
    data: { status: 'RUNNING', startedAt: new Date() },
  });
  if (claimed.count !== 1) {
    // Another worker already claimed this run — do not execute twice.
    // A CANCELLED run reports cancellation honestly (Phase 18).
    const current = await db.autopilotRun.findUnique({
      where: { id: runId },
      select: { status: true },
    }).catch(() => null);
    if (current?.status === 'CANCELLED') {
      return {
        runId,
        status: 'CANCELLED' as const,
        discovered: 0, saved: 0, processed: 0, executionsCreated: 0,
        perNiche: [],
        error: 'Run was cancelled before it started',
      };
    }
    return {
      runId,
      status: 'FAILED',
      discovered: 0, saved: 0, processed: 0, executionsCreated: 0,
      perNiche: [],
      error: 'Run was already claimed by another worker',
    };
  }

  const niches = parseJson<string[]>(autopilot.niches, []);
  const geo = parseJson<{ country?: string; city?: string; countries?: string[] }>(autopilot.geography, {});
  // Phase 21 — the run's IMMUTABLE country snapshot: resolved from the
  // row loaded at invocation start (Phase 21 `countries` key wins;
  // legacy single `country` falls back; neither → Worldwide). A config
  // change after this point cannot affect the executing run.
  const runCountries = runCountriesFromGeography(geo);
  const runWorldwide = runCountries.length === 0;
  const geoGroups = countryJobGroups(runCountries);
  // Phase 20 — { [nicheKey]: businessProfileId } mapping from the saved
  // Autopilot configuration (legacy rows / unmapped niches → empty).
  const profileMappings = parseJson<Record<string, string>>(autopilot.profileMappings ?? '{}', {});

  const perNiche: AutopilotRunOutcome['perNiche'] = [];
  let discovered = 0;
  let saved = 0;
  let processed = 0;
  let executionsCreated = 0;
  let executionId: string | null = null;
  let hardFailures = 0;
  // Part 2 — set once the workflow execution fee can no longer be paid:
  // remaining leads are skipped honestly instead of the loop pointlessly
  // re-attempting a charge that will keep failing.
  let insufficientCredits = false;
  // Phase 18 — every eligible lead of the WHOLE run (across all niches).
  // ONE parent execution is created for this collection after discovery.
  const runLeads: { id: string; businessName: string; niche: string | null }[] = [];
  // Phase 20 — per-lead profile resolution (leadId → the resolution of the
  // niche that produced it in THIS run). Passed to the batch engine so each
  // lead is personalized with its niche's mapped Business Profile.
  const profileResolutionsByLeadId = new Map<string, Awaited<ReturnType<typeof resolveBusinessProfileForUser>>>();

  try {
    // Linked workflow must exist, belong to the user, and be ACTIVE.
    const workflow = await db.workflowDefinition.findFirst({
      where: { id: autopilot.workflowId, userId: autopilot.userId },
      select: { id: true, status: true, name: true, profileId: true },
    });
    if (!workflow) throw new Error('Linked workflow not found for this account');
    if (workflow.status !== 'active') {
      throw new Error(`Linked workflow "${workflow.name}" is not active — activate it in Workflows first`);
    }

    // Pre-flight credit check for the discovery phase (honest refusal
    // BEFORE any work instead of mid-run starvation). Workflow action
    // credits are enforced by the execution engine per step.
    // Phase 21 — the estimate scales with the number of discovery jobs
    // (niches × country-chunks); Worldwide and single-country runs keep
    // the EXACT legacy estimate (one job per niche).
    const discoveryJobs = niches.length * geoGroups.length;
    const planCredits = discoveryJobs * AUTOPILOT_DISCOVERY_BATCH * CREDIT_COSTS.lead_discovery;
    const sufficiency = await checkCreditSufficiency(autopilot.userId, planCredits);
    if (!sufficiency.sufficient) {
      throw new Error(
        `Insufficient credits for discovery: need ~${planCredits}, available ${sufficiency.balance}. Top up credits and run again.`
      );
    }

    // ── Part 2 — pre-flight for the workflow execution fee ──
    // Every ACTUAL autopilot workflow execution is billed through the
    // central flat-fee service (5 credits, below). Discovery alone is
    // never billed as a workflow execution, but an autopilot whose
    // balance cannot even cover ONE execution fee cannot achieve its
    // purpose — refuse honestly before burning discovery credits.
    const feeSufficiency = await checkCreditSufficiency(
      autopilot.userId,
      WORKFLOW_EXECUTION_FEE_CREDITS
    );
    if (!feeSufficiency.sufficient) {
      throw new Error(
        `Insufficient credits for workflow execution: each run costs ${WORKFLOW_EXECUTION_FEE_CREDITS}, available ${feeSufficiency.balance}. Top up credits and run again.`
      );
    }

    // ── Phase 18/20 — resolve + snapshot the run's profile/context ONCE at
    // run start. Per-niche resolution REUSES the same Phase 11–17 canonical
    // chain (explicit niche mapping → workflow's own profile → user default);
    // the batch engine receives a per-lead resolution map so every lead is
    // personalized with the profile mapped to the niche that produced it.
    // The run-level snapshot below preserves what the RUN was configured
    // with (later profile edits never rewrite history). Personalization
    // must never break the run — a lookup failure degrades to source
    // 'none' and execution continues unpersonalized.
    const profileResolution = await resolveBusinessProfileForUser(
      autopilot.userId,
      { workflowProfileId: workflow.profileId ?? null }
    ).catch(() => ({ profile: null, source: 'none' as const }));

    // Phase 20 — per-niche resolutions (ONE query per DISTINCT mapped
    // profile id via the canonical resolver; unmapped niches share the
    // run-level resolution object — no extra queries).
    const nicheProfileResolutions = new Map<string, Awaited<ReturnType<typeof resolveBusinessProfileForUser>>>();
    const mappedProfileIds = [
      ...new Set(niches.map((n) => profileMappings[normalizeNicheKeyOf(n)]).filter((v): v is string => !!v)),
    ];
    for (const profileId of mappedProfileIds) {
      nicheProfileResolutions.set(
        profileId,
        await resolveBusinessProfileForUser(
          autopilot.userId,
          { explicitProfileId: profileId, workflowProfileId: workflow.profileId ?? null }
        ).catch(() => ({ profile: null, source: 'none' as const }))
      );
    }
    const resolutionForNiche = (niche: string) =>
      nicheProfileResolutions.get(profileMappings[normalizeNicheKeyOf(niche)] ?? '') ?? profileResolution;

    const runKeyRow = await db.autopilotRun.findUnique({
      where: { id: runId },
      select: { runKey: true, status: true },
    }).catch(() => null);
    if (runKeyRow?.status === 'RUNNING') {
      await db.autopilotRun.update({
        where: { id: runId },
        data: {
          config: JSON.stringify({
            niches,
            geography: geo,
            // Phase 21 — the run's immutable country snapshot ([] = Worldwide).
            countries: runCountries,
            worldwide: runWorldwide,
            // Phase 22 — immutable schedule snapshot: the schedule config
            // that fired this run (interval/timezone/anchor at run start;
            // later schedule edits never rewrite history).
            schedule: parsePersistedSchedule(autopilot.schedule),
            profileMappings,
            nicheProfiles: niches.map((niche) => {
              const r = resolutionForNiche(niche);
              return {
                niche,
                profileId: r.profile?.id ?? null,
                profileName: r.profile?.name ?? null,
                profileSource: r.source,
              };
            }),
            profile: {
              profileId: profileResolution.profile?.id ?? null,
              profileName: profileResolution.profile?.name ?? null,
              profileSource: profileResolution.source,
              preferredTone: profileResolution.profile?.preferredTone ?? null,
              preferredLanguage: profileResolution.profile?.preferredLanguage ?? null,
              cta: profileResolution.profile?.cta ?? null,
            },
            workflow: { id: workflow.id, name: workflow.name, profileId: workflow.profileId ?? null },
          }),
        },
      }).catch(() => {
        // Snapshot persistence is best-effort — the run itself proceeds.
      });
    }

    for (const niche of niches) {
      // ── Phase 21 — per-niche aggregation across the country fan-out ──
      // One discovery job per (niche × country-group). Worldwide = ONE
      // job with no country constraint. Legacy single-country rows and
      // ≤MAX_COUNTRIES_PER_JOB selections fan out to exactly ONE job —
      // byte-identical call shape to Phase 18/20 for those configs.
      const nicheJobIds: string[] = [];
      const nicheJobErrors: string[] = [];
      let nicheDiscovered = 0;
      let nicheImported = 0;
      let nicheDuplicates = 0;
      let jobsCompleted = 0;
      let jobsFailed = 0;

      // ── Phase 20 — when THIS niche has a profile mapping, its
      // resolution is recorded per lead for per-lead personalization
      // downstream (the canonical chain: mapped profile → workflow
      // profile → default). Unmapped niches intentionally leave the map
      // empty so the batch call stays byte-identical to Phase 18 for
      // legacy configurations. Applies identically to every country
      // group of this niche.
      const nicheHasMapping = !!profileMappings[normalizeNicheKeyOf(niche)];
      const nicheResolution = nicheHasMapping ? resolutionForNiche(niche) : null;

      for (let gi = 0; gi < geoGroups.length; gi++) {
        const group = geoGroups[gi];

        // ── 1. Start discovery via the EXISTING production pipeline ──
        // Phase 21: the group's countries ride the pipeline's own
        // multi-country input (countries[]) — the Phase 8/9 targeting
        // machinery turns them into per-country combos with per-combo
        // attribution and cross-country dedup INSIDE the job.
        let jobId: string | null = null;
        try {
          const job = await startDiscoveryJob(
            autopilot.userId,
            {
              niche,
              ...(group ? { countries: group } : {}),
              city: geo.city,
              source: 'ai_search',
              maxResults: AUTOPILOT_DISCOVERY_BATCH,
            },
            autopilot.orgId || undefined
          );
          if (job.status === 'failed' || !job.jobId) {
            hardFailures++;
            jobsFailed++;
            nicheJobErrors.push(
              (group ? `[${group.join(', ')}] ` : '') + (job.message || 'Discovery job failed to start')
            );
            continue;
          }
          jobId = job.jobId;
          nicheJobIds.push(jobId);
        } catch (startErr) {
          hardFailures++;
          jobsFailed++;
          nicheJobErrors.push(
            (group ? `[${group.join(', ')}] ` : '') +
            (startErr instanceof Error ? startErr.message : 'Discovery start error')
          );
          continue;
        }

        // ── 2. Wait for the job to reach a terminal state ──
        let job: DiscoveryJobRow;
        try {
          job = await pollDiscoveryJob(jobId);
        } catch (pollErr) {
          hardFailures++;
          jobsFailed++;
          nicheJobErrors.push(
            (group ? `[${group.join(', ')}] ` : '') +
            (pollErr instanceof Error ? pollErr.message : 'Discovery poll error')
          );
          continue;
        }

        discovered += job.totalFound;
        saved += job.imported;
        nicheDiscovered += job.totalFound;
        nicheImported += job.imported;
        nicheDuplicates += job.duplicates;
        if (job.status === 'failed') {
          hardFailures++;
          jobsFailed++;
          nicheJobErrors.push(
            (group ? `[${group.join(', ')}] ` : '') + (job.errorMessage || 'Discovery job failed')
          );
        } else {
          jobsCompleted++;
        }

        // ── 3. Resolve discovered payloads → persisted leads → ledger ──
        // Phase 18 ONE-parent-execution model: leads are COLLECTED here
        // across all niches AND all country groups; after the loops the
        // run creates exactly ONE parent WorkflowExecution for the whole
        // batch (child item rows carry the per-lead statuses). Never one
        // execution record per lead — and never one per niche or per
        // country. The batch coordinator is the SAME engine the manual
        // execute route uses.
        const payloads = job.resultData ? parseJson<DiscoveredPayload[]>(job.resultData, []) : [];
        for (const payload of payloads) {
          const lead = await resolvePersistedLead(autopilot.userId, payload);
          if (!lead) continue; // payload could not be matched — skip honestly (counted via job counters)
          processed++;
          try {
            // DB-level idempotency: unique(autopilotId, leadId). If this
            // lead was already processed by ANY earlier run of this
            // autopilot (or surfaced by another country group of THIS
            // run), the insert loses and we skip — a lead can never be
            // executed twice.
            await db.autopilotLead.create({
              data: {
                autopilotId: autopilot.id,
                runId,
                leadId: lead.id,
                userId: autopilot.userId,
                status: 'DISCOVERED',
              },
            });
          } catch {
            // Unique constraint hit → already processed by a previous
            // run (or another group of this run's cross-country dedup).
            continue;
          }
          runLeads.push(lead);
          if (nicheResolution) profileResolutionsByLeadId.set(lead.id, nicheResolution);
        }

        // Pacing between discovery jobs (niche × country groups).
        if (gi < geoGroups.length - 1) {
          await new Promise((r) => setTimeout(r, AUTOPILOT_NICHE_PACING_MS));
        }
      }

      perNiche.push({
        niche,
        // Phase 21 — every discovery job id of this niche's fan-out
        // (single-element array = legacy/Worldwide shape).
        jobId: nicheJobIds[0] ?? null,
        jobs: nicheJobIds,
        // Phase 21 — the countries this niche's jobs targeted ([] = Worldwide).
        countries: runCountries,
        worldwide: runWorldwide,
        status:
          jobsFailed === 0 && jobsCompleted > 0
            ? 'COMPLETED'
            : jobsCompleted > 0
              ? 'PARTIAL'
              : 'FAILED',
        discovered: nicheDiscovered,
        imported: nicheImported,
        duplicates: nicheDuplicates,
        ...(nicheJobErrors.length > 0 ? { error: nicheJobErrors.join(' | ') } : {}),
      });

      // Pacing between niches.
      await new Promise((r) => setTimeout(r, AUTOPILOT_NICHE_PACING_MS));
    }

    // ── Phase 18: ONE parent execution for the WHOLE run ──
    // All eligible leads (every niche) ride ONE WorkflowExecution; the
    // flat fee is charged ONCE for that execution (never per lead, never
    // per niche). Stable keys make scheduler replay / worker retry /
    // duplicate queue delivery converge on the SAME execution + charge.
    if (runLeads.length > 0) {
      // Cancellation check: a run cancelled mid-discovery creates NO
      // execution and NO charge (nothing has been charged yet — the fee
      // is charged below, immediately before execution creation).
      const runNow = await db.autopilotRun.findUnique({
        where: { id: runId },
        select: { status: true, runKey: true },
      }).catch(() => null);
      if (runNow?.status === 'CANCELLED') {
        return {
          runId,
          status: 'CANCELLED' as const,
          discovered, saved, processed,
          executionsCreated: 0,
          runKey: runNow.runKey,
          perNiche,
          error: 'Run was cancelled during discovery — no execution was created',
        };
      }

      const idempotencyKey = `autopilot:${autopilot.id}:run:${runId}`;
      const chargeKey = `wfexec-run:autopilot-${autopilot.id}-run-${runId}`;
      const charge = await chargeWorkflowExecutionFee({
        userId: autopilot.userId,
        workflowId: autopilot.workflowId,
        chargeKey,
        source: 'AUTOPILOT',
        referenceId: idempotencyKey,
        leadCount: runLeads.length,
      });
      if (!charge.ok) {
        const insufficientError =
          `Insufficient credits for workflow execution: need ${charge.fee}, available ${charge.balance}. Nothing was executed for this run.`;
        await db.autopilotLead.updateMany({
          where: { autopilotId: autopilot.id, runId, leadId: { in: runLeads.map((l) => l.id) } },
          data: { status: 'EXEC_FAILED', error: insufficientError },
        });
        hardFailures++;
        insufficientCredits = true;
      } else {
        try {
          const batchResult = await executeWorkflowBatch(
            autopilot.workflowId,
            autopilot.userId,
            {
              leads: runLeads,
              targetSnapshot: {
                mode: 'autopilot',
                source: 'autopilot',
                autopilotId: autopilot.id,
                runId,
                runKey: runNow?.runKey ?? null,
                niches,
                trigger,
                leadCount: runLeads.length,
              },
              idempotencyKey,
              // Phase 20 — per-lead profile resolutions keyed by leadId:
              // each lead personalizes with the Business Profile mapped to
              // the niche that produced it (falls back to the run-level
              // resolution for unmapped niches). Reuses the batch engine's
              // existing resolvedProfile pathway — no parallel system.
              profileResolutionsByLeadId:
                profileResolutionsByLeadId.size > 0
                  ? Object.fromEntries(profileResolutionsByLeadId)
                  : undefined,
              // Background: the batch processes the run's leads sequentially
              // with provider-friendly pacing; the detached finalizer below
              // settles per-lead outcomes once the execution is terminal.
              awaitCompletion: false,
              // This run's ONE charge covers this ONE execution — the batch
              // runner releases the fee if the run terminates with ZERO
              // steps completed (never-started refund, same ledger keys).
              neverStartedAutoRefund: true,
            }
          );
          if (batchResult.executionId) {
            executionsCreated = 1;
            executionId = batchResult.executionId;
            await db.autopilotLead.updateMany({
              where: { autopilotId: autopilot.id, runId, leadId: { in: runLeads.map((l) => l.id) } },
              data: { status: 'EXEC_QUEUED', executionId },
            });
            // Detached settle: per-lead outcomes + run aggregates update
            // when the parent execution reaches a terminal state. Never
            // blocks the invocation; failures are logged, never thrown.
            void settleRunExecutionOutcome(runId, executionId).catch((err) => {
              console.error('[AutopilotRunner] Run outcome settle failed:', err);
            });
          } else {
            // The execution record could not be created — release the fee
            // idempotently, then record the honest per-lead failure.
            await refundWorkflowExecutionFee({
              userId: autopilot.userId,
              workflowId: autopilot.workflowId,
              chargeKey,
              source: 'AUTOPILOT',
              referenceId: idempotencyKey,
            }).catch(() => {
              // Ledger idempotency makes a later retry safe.
            });
            await db.autopilotLead.updateMany({
              where: { autopilotId: autopilot.id, runId, leadId: { in: runLeads.map((l) => l.id) } },
              data: {
                status: 'EXEC_FAILED',
                error: batchResult.error || 'Execution failed to start',
              },
            });
            hardFailures++;
          }
        } catch (execErr) {
          // The execution never started (record could not be created) —
          // release the fee idempotently, then record the honest
          // per-lead failure.
          await refundWorkflowExecutionFee({
            userId: autopilot.userId,
            workflowId: autopilot.workflowId,
            chargeKey,
            source: 'AUTOPILOT',
            referenceId: idempotencyKey,
          }).catch(() => {
            // Ledger idempotency makes a later retry safe.
          });
          await db.autopilotLead.updateMany({
            where: { autopilotId: autopilot.id, runId, leadId: { in: runLeads.map((l) => l.id) } },
            data: {
              status: 'EXEC_FAILED',
              error: execErr instanceof Error ? execErr.message : 'Execution failed',
            },
          });
          hardFailures++;
        }
      }
    }
    // ── 4. Honest run finalization ──
    const status: 'COMPLETED' | 'FAILED' = hardFailures > 0 && saved === 0 && executionsCreated === 0
      ? 'FAILED'
      : 'COMPLETED';
    const errorSummary = perNiche
      .filter((n) => n.error)
      .map((n) => `${n.niche}: ${n.error}`)
      .join(' | ');
    const insufficientSummary = insufficientCredits
      ? `Insufficient credits: workflow execution fee (${WORKFLOW_EXECUTION_FEE_CREDITS}) could not be paid; discovered leads were not executed.`
      : '';

    // Status-guarded finalize: only a still-RUNNING run transitions to
    // COMPLETED/FAILED here — a run cancelled mid-discovery keeps its
    // CANCELLED status (counters still update honestly).
    const finalizeData = {
      discovered,
      saved,
      processed,
      executionsCreated,
      ...(executionId ? { executionId } : {}),
      ...(runKeyRow?.runKey ? { runKey: runKeyRow.runKey } : {}),
    };
    const finalized = await db.autopilotRun.updateMany({
      where: { id: runId, status: 'RUNNING' },
      data: {
        status,
        ...finalizeData,
        completedAt: new Date(),
        ...((errorSummary || insufficientSummary)
          ? { error: [insufficientSummary, errorSummary].filter(Boolean).join(' | ').substring(0, 2000) }
          : {}),
        ...(status === 'FAILED' && !errorSummary && !insufficientSummary
          ? { error: 'Run failed — no leads imported and no executions created' }
          : {}),
      },
    });
    if (finalized.count !== 1) {
      // Run was cancelled (or claimed elsewhere) — counters stay honest.
      await db.autopilotRun.update({
        where: { id: runId },
        data: finalizeData,
      }).catch(() => {});
    }

    return {
      runId, status, discovered, saved, processed, executionsCreated, perNiche,
      executionId,
      runKey: runKeyRow?.runKey ?? null,
      ...((errorSummary || insufficientSummary)
        ? { error: [insufficientSummary, errorSummary].filter(Boolean).join(' | ') }
        : {}),
    };
  } catch (fatal) {
    const message = fatal instanceof Error ? fatal.message : 'Autopilot run failed';
    // Status-guarded: never overwrite a CANCELLED run with FAILED.
    const failed = await db.autopilotRun.updateMany({
      where: { id: runId, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        error: message.substring(0, 2000),
        discovered, saved, processed, executionsCreated,
        ...(executionId ? { executionId } : {}),
        completedAt: new Date(),
      },
    });
    if (failed.count !== 1) {
      await db.autopilotRun.update({
        where: { id: runId },
        data: { discovered, saved, processed, executionsCreated },
      }).catch(() => {});
    }
    return {
      runId, status: 'FAILED', discovered, saved, processed, executionsCreated,
      executionId,
      perNiche, error: message,
    };
  }
}

/**
 * Run an autopilot end-to-end under the per-user lock: create the run
 * row (QUEUED) with its idempotency runKey, execute it, then finalize
 * autopilot counters + state. `trigger` is 'manual' (API) or 'scheduler'
 * (cron) — BOTH paths converge on this core service (Phase 18 rule).
 *
 * runKey (Phase 18 duplicate-invocation protection):
 *   scheduler → `scheduled:{autopilotId}:{slotEpoch}` — a replayed tick
 *   for the same due slot converges on the SAME run row (unique index).
 *   manual → `manual:{autopilotId}:{epochMs}` — unique per invocation;
 *   concurrent double-clicks are still stopped by the open-run guard.
 */
export async function runAutopilot(
  autopilotId: string,
  userId: string,
  trigger: 'manual' | 'scheduler',
  options: { runKey?: string } = {}
): Promise<{ ok: boolean; runId?: string; error?: string; code?: string; duplicate?: boolean; outcome?: AutopilotRunOutcome }> {
  return withUserLock(userId, async () => {
    const autopilot = await db.autopilotWorkflow.findFirst({
      where: { id: autopilotId, userId },
    });
    if (!autopilot) {
      return { ok: false, error: 'Autopilot not found', code: 'NOT_FOUND' };
    }
    // ── Phase 23 — DEFENSE-IN-DEPTH ENTITLEMENT GATE.
    //
    // The manual route (`/api/autopilot/[id]/run`) and the scheduler tick
    // (`scheduler-runner.ts`) BOTH re-check the user's plan BEFORE calling
    // runAutopilot. This third check lives INSIDE runAutopilot — the
    // deepest boundary — so any code path that bypasses the route-level
    // gate (a future cron route, a test fixture, a stray direct call)
    // STILL cannot fire autonomous work for an ineligible plan.
    //
    // The check is:
    //   · read-only (resolves the plan from the DB live, never cached
    //     across invocations — a downgrade that happened since the
    //     route-level check is honored here)
    //   · non-mutating (the autopilot row stays ACTIVE / RUNNING / etc.
    //     as it was — no disable, no delete — the scheduler path which
    //     pre-claimed ACTIVE→RUNNING is unaffected because we return
    //     BEFORE the state-machine claim)
    //   · zero-credit (no ledger row is written; the actual 5-credit
    //     charge happens later inside executeAutopilotRun, AFTER this
    //     gate, so a blocked run never bills anything)
    //
    // The 'scheduler' trigger should never reach this branch in practice
    // (the scheduler's own entitlement gate at scheduler-runner.ts:114
    // already skipped the call). The branch is here as defense-in-depth.
    // ──
    const { plan: livePlan } = await resolveUserPlan(userId);
    if (!isAutopilotPlanEligible(livePlan)) {
      return {
        ok: false,
        error:
          'Autopilot is Pro/Elite only — your current plan is not eligible. Upgrade to Pro or Elite to run Autopilot.',
        code: 'PLAN_INELIGIBLE',
      };
    }
    // Manual runs require ACTIVE. The scheduler path claims ACTIVE→RUNNING
    // before calling, so RUNNING is also acceptable there.
    const acceptable = trigger === 'manual' ? ['ACTIVE'] : ['ACTIVE', 'RUNNING'];
    if (!acceptable.includes(autopilot.status)) {
      return {
        ok: false,
        error: `Autopilot is ${autopilot.status} — only ACTIVE autopilots can run`,
        code: 'INVALID_STATE',
      };
    }
    // Concurrent-run guard: no second run while one is QUEUED/RUNNING.
    const openRun = await db.autopilotRun.findFirst({
      where: { autopilotId: autopilot.id, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true },
    });
    if (openRun) {
      return {
        ok: false,
        error: 'A run is already queued or running for this Autopilot',
        code: 'RUN_IN_PROGRESS',
      };
    }

    // Phase 18 — runKey duplicate-invocation check: if this exact key
    // already has a run row, the invocation is a REPLAY — return the
    // existing run idempotently (no second run, no second execution).
    const runKey =
      options.runKey ??
      (trigger === 'scheduler'
        ? `scheduled:${autopilot.id}:${new Date().getTime()}`
        : `manual:${autopilot.id}:${new Date().getTime()}`);
    const existing = await db.autopilotRun.findUnique({
      where: { runKey },
      select: { id: true },
    }).catch(() => null);
    if (existing) {
      return { ok: true, runId: existing.id, duplicate: true };
    }

    // Atomic state claim: ACTIVE→RUNNING. The scheduler path already
    // flipped ACTIVE→RUNNING before calling (count==1 winner); the manual
    // path claims here. Either way exactly one claim succeeds.
    if (autopilot.status === 'ACTIVE') {
      const claimed = await db.autopilotWorkflow.updateMany({
        where: { id: autopilot.id, status: 'ACTIVE' },
        data: { status: 'RUNNING' },
      });
      if (claimed.count !== 1) {
        return {
          ok: false,
          error: 'Autopilot state changed concurrently — run not started',
          code: 'STATE_CONFLICT',
        };
      }
    }

    const run = await db.autopilotRun.create({
      data: {
        autopilotId: autopilot.id,
        userId,
        status: 'QUEUED',
        trigger,
        runKey,
        config: JSON.stringify({
          niches: parseJson<string[]>(autopilot.niches, []),
          geography: parseJson<Record<string, string>>(autopilot.geography, {}),
          // Phase 22 — immutable schedule snapshot: which schedule
          // config fired this run (interval/timezone/anchor at run
          // start; later schedule edits never rewrite history).
          schedule: parsePersistedSchedule(autopilot.schedule),
        }),
      },
    }).catch(async (createErr: unknown) => {
      // runKey unique violation = duplicate invocation racing past the
      // pre-check — converge on the existing run row (idempotent replay).
      if (createErr && typeof createErr === 'object' && 'code' in createErr &&
          (createErr as { code?: string }).code === 'P2002') {
        const prior = await db.autopilotRun.findUnique({
          where: { runKey },
          select: { id: true },
        }).catch(() => null);
        if (prior) return { id: prior.id, duplicate: true };
      }
      throw createErr;
    }) as { id: string; duplicate?: boolean };
    if (run.duplicate) {
      // Duplicate invocation — release the ACTIVE→RUNNING claim we took
      // (the original run owns the autopilot state) and report honestly.
      await db.autopilotWorkflow.updateMany({
        where: { id: autopilot.id, status: 'RUNNING' },
        data: { status: 'ACTIVE' },
      }).catch(() => {});
      return { ok: true, runId: run.id, duplicate: true };
    }

    const outcome = await executeAutopilotRun(
      autopilot as unknown as AutopilotRow,
      run.id,
      trigger
    );

    // Finalize autopilot row: RUNNING → ACTIVE/FAILED + counters.
    // A CANCELLED run returns the autopilot to ACTIVE (user-initiated
    // stop — not a failure).
    const stillOurs = await db.autopilotWorkflow.updateMany({
      where: { id: autopilot.id, status: 'RUNNING' },
      data: {
        status: outcome.status === 'FAILED' ? 'FAILED' : 'ACTIVE',
        lastRunAt: new Date(),
        lastError: outcome.error ? outcome.error.substring(0, 2000) : null,
        runCount: { increment: 1 },
        totalDiscovered: { increment: outcome.discovered },
        totalSaved: { increment: outcome.saved },
        totalProcessed: { increment: outcome.processed },
        totalExecutions: { increment: outcome.executionsCreated },
      },
    });
    if (stillOurs.count !== 1) {
      // Recovery path already flipped the state — make counters honest anyway.
      await db.autopilotWorkflow.update({
        where: { id: autopilot.id },
        data: {
          runCount: { increment: 1 },
          totalDiscovered: { increment: outcome.discovered },
          totalSaved: { increment: outcome.saved },
          totalProcessed: { increment: outcome.processed },
          totalExecutions: { increment: outcome.executionsCreated },
        },
      });
    }
    return { ok: true, runId: run.id, outcome };
  });
}

// ===== Phase 18: run outcome settlement (detached finalizer) =====

/** Terminal WorkflowExecution statuses (same taxonomy as the batch engine). */
const EXECUTION_TERMINAL_STATUSES = ['completed', 'failed', 'cancelled', 'exhausted', 'partial'];

function isTerminalExecutionStatus(status: string): boolean {
  return EXECUTION_TERMINAL_STATUSES.includes(status);
}

/**
 * Phase 18 — settle the run's ONE parent execution outcome: poll (detached,
 * never blocking the invocation) until the execution reaches a terminal
 * state, then propagate per-lead results to the AutopilotLead ledger
 * (EXEC_COMPLETED / EXEC_FAILED) and the run's aggregate counters
 * (leadsCompleted / leadsFailed). Bounded by AUTOPILOT_EXECUTION_SETTLE_TIMEOUT_MS.
 *
 * Failure isolation: a lead that failed only marks THAT lead — the run's
 * own status is not rewritten here (the run already finalized honestly).
 */
export async function settleRunExecutionOutcome(
  runId: string,
  executionId: string
): Promise<void> {
  const deadline = Date.now() + AUTOPILOT_EXECUTION_SETTLE_TIMEOUT_MS;
  let status: string | null = null;
  for (;;) {
    const execution = await db.workflowExecution.findUnique({
      where: { id: executionId },
      select: { status: true },
    }).catch(() => null);
    if (!execution) {
      // Execution row disappeared (deleted) — nothing to settle.
      return;
    }
    status = execution.status;
    if (isTerminalExecutionStatus(status)) break;
    if (Date.now() > deadline) {
      console.warn(
        `[AutopilotRunner] Settle timeout for run ${runId}: execution ${executionId} still '${status}' after ${Math.round(AUTOPILOT_EXECUTION_SETTLE_TIMEOUT_MS / 60000)} min — ledger stays EXEC_QUEUED (honest).`
      );
      return;
    }
    await new Promise((r) => setTimeout(r, AUTOPILOT_EXECUTION_SETTLE_POLL_MS));
  }

  // Terminal — per-lead outcomes from the execution's item ledger.
  const items = await db.workflowExecutionLead.findMany({
    where: { executionId },
    select: { leadId: true, status: true, error: true },
  });
  const completedLeadIds = items
    .filter((i) => i.status === 'completed' && i.leadId)
    .map((i) => i.leadId as string);
  const notCompleted = items.filter((i) => i.status !== 'completed' && i.leadId);

  if (completedLeadIds.length > 0) {
    await db.autopilotLead.updateMany({
      where: { runId, executionId, leadId: { in: completedLeadIds } },
      data: { status: 'EXEC_COMPLETED', error: null },
    }).catch(() => {});
  }
  // Per-lead failures keep their own error text (item-level fidelity).
  for (const item of notCompleted) {
    await db.autopilotLead.updateMany({
      where: { runId, executionId, leadId: item.leadId as string, status: 'EXEC_QUEUED' },
      data: {
        status: 'EXEC_FAILED',
        error: (item.error || `Execution ${status} — lead not completed`).substring(0, 500),
      },
    }).catch(() => {});
  }

  // Run-level aggregates (idempotent under re-settle).
  await db.autopilotRun.update({
    where: { id: runId },
    data: {
      leadsCompleted: completedLeadIds.length,
      leadsFailed: notCompleted.length,
    },
  }).catch(() => {});
}

// ===== Phase 18: run cancellation =====

export interface CancelRunResult {
  ok: boolean;
  error?: string;
  code?: string;
  run?: { id: string; status: string };
}

/**
 * Phase 18 — cancel a run (user-initiated stop).
 *   QUEUED  → CANCELLED atomically (the runner's QUEUED→RUNNING claim
 *             then loses; no discovery, no execution, no charge).
 *   RUNNING → CANCELLED + its parent execution is set to 'cancelled',
 *             which the batch engine honors at the next step boundary
 *             (existing mid-run cancellation machinery — not new retry
 *             logic). The detached settle finalizer then updates per-lead
 *             ledger statuses + run aggregates honestly.
 *   Terminal states are rejected — history is never rewritten.
 * Ownership is enforced by the userId scope (cross-user = not found).
 */
export async function cancelAutopilotRun(
  userId: string,
  runId: string
): Promise<CancelRunResult> {
  const run = await db.autopilotRun.findFirst({
    where: { id: runId, userId },
    select: { id: true, status: true, executionId: true, autopilotId: true },
  });
  if (!run) {
    return { ok: false, error: 'Run not found', code: 'NOT_FOUND' };
  }
  if (run.status !== 'QUEUED' && run.status !== 'RUNNING') {
    return {
      ok: false,
      error: `Run is already ${run.status} — only QUEUED or RUNNING runs can be cancelled`,
      code: 'INVALID_STATE',
    };
  }

  if (run.status === 'QUEUED') {
    // Atomic flip: only one winner (this call OR the runner's claim).
    const flipped = await db.autopilotRun.updateMany({
      where: { id: run.id, status: 'QUEUED' },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    if (flipped.count !== 1) {
      // The runner claimed it in the race — re-read and report honestly.
      const now = await db.autopilotRun.findUnique({
        where: { id: run.id },
        select: { status: true },
      });
      return {
        ok: false,
        error: `Run transitioned to ${now?.status ?? 'RUNNING'} before cancellation`,
        code: 'STATE_CONFLICT',
      };
    }
    return { ok: true, run: { id: run.id, status: 'CANCELLED' } };
  }

  // RUNNING — cancel the run + signal the parent execution to stop.
  await db.autopilotRun.update({
    where: { id: run.id },
    data: { status: 'CANCELLED', completedAt: new Date() },
  });
  if (run.executionId) {
    await db.workflowExecution.update({
      where: { id: run.executionId },
      data: { status: 'cancelled' },
    }).catch(() => {
      // Execution already terminal/deleted — settle already handled it.
    });
    // Ensure the settle finalizer wakes up for this run even if the
    // runner's detached watcher already timed out earlier.
    void settleRunExecutionOutcome(run.id, run.executionId).catch(() => {});
  }
  // The autopilot row itself is finalized by runAutopilot's own RUNNING→
  // ACTIVE/FAILED updateMany (CANCELLED outcome → ACTIVE). If the runner
  // already finished, flip a lingering RUNNING autopilot back to ACTIVE.
  await db.autopilotWorkflow.updateMany({
    where: { id: run.autopilotId, status: 'RUNNING' },
    data: { status: 'ACTIVE' },
  }).catch(() => {});
  return { ok: true, run: { id: run.id, status: 'CANCELLED' } };
}

// ===== stuck-run recovery =====

export interface RecoveryResult {
  recoveredRuns: number;
  recoveredAutopilots: number;
}

/**
 * Honest recovery of interrupted runs: anything stuck in RUNNING for
 * over AUTOPILOT_STUCK_MS is marked FAILED with an explicit recovery
 * note, and its autopilot returns to ACTIVE (or FAILED if the autopilot
 * row was left RUNNING by a crash). Idempotent — safe to call on every
 * scheduler tick.
 */
export async function recoverStuckAutopilotRuns(): Promise<RecoveryResult> {
  const stuckBefore = new Date(Date.now() - AUTOPILOT_STUCK_MS);

  // 1. Stuck runs (startedAt in the past beyond the threshold).
  const stuckRuns = await db.autopilotRun.findMany({
    where: { status: 'RUNNING', startedAt: { lt: stuckBefore } },
    select: { id: true, autopilotId: true },
  });
  for (const run of stuckRuns) {
    await db.autopilotRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        error: 'Recovered by scheduler: run stuck in RUNNING for over 60 minutes (process restart or timeout).',
        completedAt: new Date(),
      },
    });
  }

  // 2. Autopilots stuck in RUNNING (process died mid-run).
  const stuckAutopilots = await db.autopilotWorkflow.findMany({
    where: { status: 'RUNNING', lastRunAt: { lt: stuckBefore } },
    select: { id: true },
  });
  for (const ap of stuckAutopilots) {
    await db.autopilotWorkflow.update({
      where: { id: ap.id },
      data: { status: 'FAILED', lastError: 'Recovered by scheduler: was stuck in RUNNING for over 60 minutes.' },
    });
  }

  return { recoveredRuns: stuckRuns.length, recoveredAutopilots: stuckAutopilots.length };
}
