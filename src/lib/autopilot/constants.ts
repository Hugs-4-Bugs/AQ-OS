// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Constants & State Machine
//
// Autopilot = automated client acquisition: the user selects MULTIPLE
// niches (reusing the existing discovery vocabulary) + geography; on
// every scheduled (or manual) run the system discovers NEW leads via
// the existing production discovery pipeline, deduplicates them, and
// executes the user's configured WorkflowDefinition against each new
// lead. It is strictly SEPARATE from normal (lead-triggered) workflow
// execution and has its own UI tab — it never runs "against a
// manually selected lead".
//
// Entitlement (server-enforced in entitlement-service.ts):
//   free/starter → disabled · pro → 3 active · elite → 7 active
// ═══════════════════════════════════════════════════════════════════

/** AutopilotWorkflow lifecycle states. */
export const AUTOPILOT_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'DISABLED',
] as const;

export type AutopilotStatus = (typeof AUTOPILOT_STATUSES)[number];

/**
 * Allowed state transitions (state machine, enforced server-side):
 *
 *   DRAFT     → ACTIVE | COMPLETED | DISABLED (user decisions)
 *   ACTIVE    → PAUSED | RUNNING (user pause / system run-claim)
 *               | COMPLETED | DISABLED
 *   PAUSED    → ACTIVE | COMPLETED | DISABLED
 *   RUNNING   → ACTIVE | FAILED (system, on run end / recovery)
 *   FAILED    → ACTIVE | DISABLED (user re-activates after fixing)
 *   COMPLETED → DISABLED (terminal for execution purposes)
 *   DISABLED  → (terminal — set on plan downgrade; history preserved)
 */
export const AUTOPILOT_TRANSITIONS: Record<AutopilotStatus, AutopilotStatus[]> = {
  DRAFT: ['ACTIVE', 'COMPLETED', 'DISABLED'],
  ACTIVE: ['PAUSED', 'RUNNING', 'COMPLETED', 'DISABLED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'DISABLED'],
  RUNNING: ['ACTIVE', 'FAILED'],
  FAILED: ['ACTIVE', 'DISABLED'],
  COMPLETED: ['DISABLED'],
  DISABLED: [],
};

export function canTransitionAutopilot(from: string, to: string): boolean {
  const allowed = AUTOPILOT_TRANSITIONS[from as AutopilotStatus];
  return !!allowed && allowed.includes(to as AutopilotStatus);
}

/** AutopilotRun lifecycle states (Phase 18 adds CANCELLED). */
export type AutopilotRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

/** Terminal AutopilotRun statuses (no further transitions). */
export const AUTOPILOT_RUN_TERMINAL: readonly AutopilotRunStatus[] = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

/** AutopilotLead ledger statuses (Phase 18 adds EXEC_COMPLETED). */
export type AutopilotLeadStatus =
  | 'DISCOVERED'
  | 'EXEC_QUEUED'
  | 'EXEC_COMPLETED'
  | 'EXEC_FAILED';

/**
 * Schedules accepted server-side (whitelist — no free-form cron).
 * `computeNextRun` maps each to a concrete interval.
 */
export const AUTOPILOT_SCHEDULES = [
  'hourly',
  'every_6_hours',
  'every_12_hours',
  'daily',
  'weekly',
] as const;

export type AutopilotSchedule = (typeof AUTOPILOT_SCHEDULES)[number];

export const SCHEDULE_INTERVAL_MS: Record<AutopilotSchedule, number> = {
  hourly: 60 * 60 * 1000,
  every_6_hours: 6 * 60 * 60 * 1000,
  every_12_hours: 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export function isAutopilotSchedule(v: unknown): v is AutopilotSchedule {
  return typeof v === 'string' && (AUTOPILOT_SCHEDULES as readonly string[]).includes(v);
}

// ── Phase 22 — configurable scheduling (canonical representation) ──

/**
 * Phase 22 — interval units accepted by the canonical schedule config.
 * Hourly granularity is the floor: there is deliberately no sub-hour
 * unit (a 1-HOUR interval is the tightest schedule allowed).
 */
export const AUTOPILOT_SCHEDULE_UNITS = ['HOURS', 'DAYS', 'WEEKS'] as const;
export type AutopilotScheduleUnit = (typeof AUTOPILOT_SCHEDULE_UNITS)[number];

/** Minimum interval multiplier (every: 1 = "every hour / day / week"). */
export const AUTOPILOT_SCHEDULE_EVERY_MIN = 1;

/**
 * Server-enforced upper bound for `every` per unit. Deterministic and
 * explicit — a larger interval is REJECTED with a clear error (never a
 * silent clamp): HOURS ≤ 168 (1 week), DAYS ≤ 365 (1 year),
 * WEEKS ≤ 52 (1 year).
 */
export const AUTOPILOT_SCHEDULE_EVERY_MAX: Record<AutopilotScheduleUnit, number> = {
  HOURS: 168,
  DAYS: 365,
  WEEKS: 52,
};

/**
 * Phase 22 — maps each legacy whitelist schedule onto the equivalent
 * canonical config parameters (unit + every). Used for backward
 * compatibility: legacy rows/callers keep working unchanged.
 */
export const LEGACY_SCHEDULE_TO_UNIT_EVERY: Record<AutopilotSchedule, { unit: AutopilotScheduleUnit; every: number }> = {
  hourly: { unit: 'HOURS', every: 1 },
  every_6_hours: { unit: 'HOURS', every: 6 },
  every_12_hours: { unit: 'HOURS', every: 12 },
  daily: { unit: 'DAYS', every: 1 },
  weekly: { unit: 'WEEKS', every: 1 },
};

/** Max niches selectable per autopilot (multi-select, bounded). */
export const AUTOPILOT_MAX_NICHES = 10;
/** Max niche string length (matches discovery route sanitization). */
export const AUTOPILOT_NICHE_MAX_LEN = 200;

/**
 * Phase 21 — max individual countries selectable per autopilot. A
 * deterministic, server-enforced bound (never a silent truncation): a
 * larger selection is REJECTED with a clear error before any row is
 * created. Worldwide (the sentinel) is the intended way to target the
 * whole globe and is NOT subject to this cap. The runner fans the
 * selection out to discovery jobs in MAX_COUNTRIES_PER_JOB chunks, so
 * this cap also bounds run duration to the same order as the legacy
 * multi-niche worst case.
 */
export const AUTOPILOT_MAX_COUNTRIES = 30;

/**
 * Discovery batch size per niche — Autopilot REUSES the existing
 * production discovery pipeline at the same ≈20-leads/batch scale as
 * the Discover page defaults. Deliberately NOT increased.
 */
export const AUTOPILOT_DISCOVERY_BATCH = 20;

/** Pacing (ms) between workflow executions inside one run — keeps the
 * AI provider and email provider load gentle on top of the existing
 * provider-level 429 backoff. */
export const AUTOPILOT_EXECUTION_PACING_MS = parseInt(
  process.env.AUTOPILOT_EXECUTION_PACING_MS || '1500',
  10
);

/** Pacing (ms) between niches inside one run. */
export const AUTOPILOT_NICHE_PACING_MS = parseInt(
  process.env.AUTOPILOT_NICHE_PACING_MS || '2000',
  10
);

/** Poll interval while waiting for an async discovery job to finish.
 * (Env-tunable like the other pacing knobs — tests set it to ~10ms.) */
export const AUTOPILOT_JOB_POLL_MS = parseInt(
  process.env.AUTOPILOT_JOB_POLL_MS || '3000',
  10
);
/** Hard timeout for one discovery job inside an autopilot run. */
export const AUTOPILOT_JOB_TIMEOUT_MS = 15 * 60 * 1000;

/** Runs/autopilots stuck in RUNNING longer than this are recovered as failed. */
export const AUTOPILOT_STUCK_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Phase 18 — settle timeout for the run finalizer: how long it waits for the
 * run's ONE parent WorkflowExecution to reach a terminal state (completed /
 * failed / cancelled / partial / exhausted) before giving up honestly. The
 * batch engine paces leads sequentially, so large runs take minutes — the
 * finalizer polls in the background and never blocks the invocation.
 */
export const AUTOPILOT_EXECUTION_SETTLE_TIMEOUT_MS = parseInt(
  process.env.AUTOPILOT_EXECUTION_SETTLE_TIMEOUT_MS || String(60 * 60 * 1000),
  10
);

/** Phase 18 — poll interval for the run finalizer's execution watch. */
export const AUTOPILOT_EXECUTION_SETTLE_POLL_MS = parseInt(
  process.env.AUTOPILOT_EXECUTION_SETTLE_POLL_MS || '5000',
  10
);
