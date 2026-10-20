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

/** AutopilotRun lifecycle states. */
export type AutopilotRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

/** AutopilotLead ledger statuses. */
export type AutopilotLeadStatus = 'DISCOVERED' | 'EXEC_QUEUED' | 'EXEC_FAILED';

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

/** Max niches selectable per autopilot (multi-select, bounded). */
export const AUTOPILOT_MAX_NICHES = 10;
/** Max niche string length (matches discovery route sanitization). */
export const AUTOPILOT_NICHE_MAX_LEN = 200;

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

/** Poll interval while waiting for an async discovery job to finish. */
export const AUTOPILOT_JOB_POLL_MS = 3000;
/** Hard timeout for one discovery job inside an autopilot run. */
export const AUTOPILOT_JOB_TIMEOUT_MS = 15 * 60 * 1000;

/** Runs/autopilots stuck in RUNNING longer than this are recovered as failed. */
export const AUTOPILOT_STUCK_MS = 60 * 60 * 1000; // 60 minutes
