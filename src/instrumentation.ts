/**
 * AcquisitionOS — Next.js Instrumentation (ROOT STARTUP HOOK)
 *
 * ═══════════════════════════════════════════════════════════════════
 * CRITICAL — THIS IS THE FILE NEXT.JS ACTUALLY LOADS AT STARTUP.
 *
 * Next.js looks for `instrumentation.ts` at the project root OR
 * `src/instrumentation.ts` (when srcDir is enabled). It does NOT load
 * `src/app/instrumentation.ts` — that file is dead code.
 *
 * This file is responsible for:
 *   1. Loading .env files into process.env (FC standalone does NOT
 *      auto-load .env — without this, ALL env vars are missing on FC,
 *      breaking Google OAuth, magic link, DB, email, everything).
 *   2. Detecting and restoring .env corruption.
 *   3. Validating all auth-critical environment variables.
 *   4. Logging a clear auth-provider startup summary.
 *   5. Initializing Sentry (if configured).
 *
 * WHY THIS MATTERS:
 *   On Aliyun Function Compute (standalone mode), the .env file is NOT
 *   automatically loaded. Without explicit loading here, process.env
 *   is empty for server-side vars → GOOGLE_CLIENT_ID is missing →
 *   Google auth shows "unavailable" → magic link DB queries fail →
 *   everything breaks. This single file fixes ALL of those issues.
 * ═══════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// .env file parser
// ---------------------------------------------------------------------------

/**
 * Parse a .env file and return a map of key→value pairs.
 * Supports:
 *   - KEY=value
 *   - KEY="value with spaces"
 *   - KEY='value'
 *   - # comments
 *   - empty lines
 *   - export KEY=value
 */
function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      let kv = trimmed;
      if (kv.startsWith('export ')) kv = kv.slice(7).trim();

      const eqIndex = kv.indexOf('=');
      if (eqIndex === -1) continue;

      const key = kv.slice(0, eqIndex).trim();
      let value = kv.slice(eqIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key) result[key] = value;
    }
  } catch {
    // File doesn't exist or can't be read — return empty
  }
  return result;
}

// ---------------------------------------------------------------------------
// .env loader
// ---------------------------------------------------------------------------

/**
 * Load .env files into process.env if they're not already set.
 *
 * Precedence (highest first):
 *   1. Existing process.env values (FC console / Docker env vars)
 *   2. .env.local (local overrides)
 *   3. .env.production (production-specific)
 *   4. .env (defaults)
 *
 * We only set vars that are NOT already in process.env, so explicit
 * environment configuration always wins over .env files.
 *
 * CRITICAL: On FC standalone, this is the ONLY way server-side env vars
 * (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL, SMTP_*, etc.)
 * get loaded. Without this, all auth fails.
 */
function loadEnvFiles(): void {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, '.env.local'),
    path.join(cwd, '.env.production'),
    path.join(cwd, '.env'),
    // Also check the standalone directory (for FC deployments where
    // the .env file is bundled alongside server.js)
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '..', '.env.production'),
    path.join(__dirname, '..', '.env'),
  ];

  // Collect all env vars from .env files (later files don't override
  // earlier ones — we process in reverse precedence order)
  const merged: Record<string, string> = {};
  for (const file of [...candidates].reverse()) {
    const parsed = parseEnvFile(file);
    for (const [k, v] of Object.entries(parsed)) {
      merged[k] = v;
    }
  }

  // Set vars that aren't already in process.env
  let loadedCount = 0;
  const loadedKeys: string[] = [];
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
      loadedCount++;
      loadedKeys.push(key);
    }
  }

  if (loadedCount > 0) {
    console.warn(`[instrumentation] Loaded ${loadedCount} env var(s) from .env files into process.env`);
    console.warn(`[instrumentation] Keys loaded: ${loadedKeys.join(', ')}`);
  } else {
    console.warn('[instrumentation] No new env vars loaded from .env files (all already set in process.env)');
  }
}

// ---------------------------------------------------------------------------
// Startup validation — logs (never throws) missing critical auth vars
// ---------------------------------------------------------------------------

function logStartupAuthStatus(): void {
  const required = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'AUTH_SECRET',
    'NEXTAUTH_SECRET',
    'DATABASE_URL',
    'JWT_SECRET',
  ];

  const smtpKeys = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
  ];

  console.warn('');
  console.warn('═══════════════════════════════════════════════════════');
  console.warn('  AcquisitionOS — Auth Provider Startup Check');
  console.warn('═══════════════════════════════════════════════════════');

  for (const key of required) {
    if (!process.env[key]) {
      console.error(`  STARTUP ERROR: ${key} is NOT SET in environment`);
    } else {
      console.warn(`  STARTUP OK: ${key} is configured`);
    }
  }

  for (const key of smtpKeys) {
    const val = process.env[key] || process.env[key.replace('SMTP_', 'GMAIL_')] || null;
    if (!val) {
      console.error(`  SMTP ERROR: ${key} is NOT SET (magic link emails will fail)`);
    } else {
      console.warn(`  SMTP OK: ${key} is configured`);
    }
  }

  // Google OAuth specific check
  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleConfigured =
    !!googleId &&
    !!googleSecret &&
    !googleId.startsWith('your-') &&
    !googleSecret.startsWith('your-') &&
    googleId.includes('.apps.googleusercontent.com');

  console.warn(`  Google OAuth : ${googleConfigured ? 'AVAILABLE' : 'UNAVAILABLE'}`);
  console.warn(`  App URL      : ${process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'NOT SET'}`);
  console.warn(`  Database     : ${process.env.DATABASE_URL ? 'CONFIGURED' : 'MISSING'}`);
  console.warn('═══════════════════════════════════════════════════════');
  console.warn('');

  if (!googleConfigured) {
    console.warn('WARNING: Google OAuth credentials not properly configured. Check FC Secrets panel for GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
}

// ---------------------------------------------------------------------------
// Main register() — called once by Next.js at server startup
// ---------------------------------------------------------------------------

export async function register() {
  // Only run on the server (not during edge build)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // ── Step 1: Load .env files FIRST ──────────────────────────────
    // This is the CRITICAL step. Without it, FC standalone has no env vars.
    loadEnvFiles();

    // ── Step 2: Run env safeguard (detect/restore .env corruption) ──
    try {
      const { validateAndLogEnv } = await import('@/lib/env-safeguard');
      validateAndLogEnv();
    } catch (err) {
      console.error('[instrumentation] env-safeguard failed (non-fatal):', err);
    }

    // ── Step 3: Log auth provider startup status ───────────────────
    logStartupAuthStatus();

    // ── Step 3b: Log every SMTP env var alias (SET/MISSING) ────────
    // This is the #1 diagnostic for the "Email delivery is not
    // configured" error — reveals exactly which SMTP_* / GMAIL_* /
    // EMAIL_* / MAIL_* variable the Secrets panel has populated.
    try {
      const { logSmtpEnvAliases } = await import('@/lib/email-ethereal');
      logSmtpEnvAliases();
    } catch (err) {
      console.error('[instrumentation] logSmtpEnvAliases failed (non-fatal):', err);
    }

    // ── Step 4: Initialize Sentry (if configured) ──────────────────
    try {
      const { initSentry } = await import('@/lib/observability/sentry');
      initSentry();
    } catch (err) {
      // Sentry is optional — ignore errors
    }

    // ── Step 5: Log startup event ──────────────────────────────────
    try {
      const logger = await import('@/lib/logger');
      logger.info('AcquisitionOS server starting', { service: 'startup' }, {
        version: '2.0.0',
        nodeVersion: process.version,
        environment: process.env.NODE_ENV,
      });
    } catch {
      // Logger is optional
    }

    // ── Step 5b: Register agent event handlers (Workstream D §6) ───
    // The event dispatcher (agent-event-dispatcher.ts) supports 9 event
    // types. Each MUST have a registered handler — otherwise events
    // are persisted but then fail with "No handler registered". This
    // registration is idempotent (safe for hot reload —
    // registeredEventTypes() prevents duplicate registration).
    try {
      const { registerEventHandler, registeredEventTypes } = await import('@/lib/ai/agent-event-dispatcher');
      if (registeredEventTypes().length === 0) {
        const { handleApprovalResponseEvent } = await import('@/lib/ai/approval-escalation');
        const {
          handleNewLeadEvent,
          handleNewEmailEvent,
          handleFollowUpDueEvent,
          handleScheduledEvent,
          handleWorkflowCompletionEvent,
        } = await import('@/lib/ai/agent-continuation');
        registerEventHandler('approval_response', handleApprovalResponseEvent);
        registerEventHandler('new_lead', handleNewLeadEvent);
        registerEventHandler('new_email', handleNewEmailEvent);
        registerEventHandler('follow_up_due', handleFollowUpDueEvent);
        registerEventHandler('scheduled', handleScheduledEvent);
        registerEventHandler('workflow_completion', handleWorkflowCompletionEvent);
        console.warn('[instrumentation] registered 6 agent event handlers (approval_response, new_lead, new_email, follow_up_due, scheduled, workflow_completion)');
      }
    } catch (err) {
      console.error('[instrumentation] event handler registration failed (non-fatal):', err);
    }

    // ── Step 6: Autopilot scheduler heartbeat ──────────────────────
    // The cron route (POST /api/cron/autopilot-scheduler, CRON_SECRET) is the
    // primary trigger in deployments that have an external scheduler. In
    // environments without one (sandbox / preview / single-instance FC), this
    // in-process heartbeat drives the SAME shared tick so scheduled Autopilots
    // actually run — mirroring the documented workflow-scheduler pattern.
    //
    // Double-execution safety does NOT depend on this timer: every tick
    // recovers stuck runs and claims work atomically (ACTIVE→RUNNING
    // updateMany winner, QUEUED→RUNNING run claim, AutopilotLead ledger
    // unique constraint), so overlapping ticks can never execute the same
    // autopilot or lead twice. AUTOPILOT_SCHEDULER_DISABLED=1 opts out.
    if (process.env.AUTOPILOT_SCHEDULER_DISABLED !== '1') {
      const intervalMs = Number(process.env.AUTOPILOT_SCHEDULER_INTERVAL_MS || 300000); // 5 min
      console.warn(
        `[autopilot-scheduler] heartbeat enabled: interval=${Math.round(intervalMs / 1000)}s, first tick in 20s` +
        ` (Phase 22: timezone-aware schedules, atomic claims, runKey idempotency)`
      );
      let ticking = false; // per-process re-entrancy guard (claims are the real guard)
      const heartbeatTick = async (): Promise<void> => {
        if (ticking) return;
        ticking = true;
        try {
          const { runAutopilotSchedulerTick } = await import('@/lib/autopilot/scheduler-runner');
          const result = await runAutopilotSchedulerTick();
          if (result.dueCount > 0 || result.recoveredRuns > 0 || result.recoveredAutopilots > 0) {
            console.warn(
              `[autopilot-heartbeat] tick: due=${result.dueCount} started=${result.started} ` +
              `recoveredRuns=${result.recoveredRuns} recoveredAutopilots=${result.recoveredAutopilots}`
            );
          }
          // Phase 26 v3 — Decision 10A: also tick the agent scheduler.
          // Runs in the same heartbeat (every 5 min) — does NOT create a
          // competing scheduler loop. Agent runs are fire-and-forget
          // (do NOT block the heartbeat).
          try {
            const { runAgentSchedulerTick } = await import('@/lib/ai/agent-scheduler');
            const agentResult = await runAgentSchedulerTick();
            if (agentResult.triggeredCount > 0 || agentResult.skippedInFlight > 0) {
              console.warn(
                `[agent-scheduler] tick: checked=${agentResult.checkedCount} triggered=${agentResult.triggeredCount} skippedInFlight=${agentResult.skippedInFlight}`
              );
            }
          } catch (agentErr) {
            console.error(
              '[agent-scheduler] tick failed (non-fatal):',
              agentErr instanceof Error ? agentErr.message : agentErr
            );
          }
          // Phase 26 D — process pending agent events (event dispatcher tick).
          // Uses the SAME heartbeat as the autopilot + agent scheduler — NO
          // second scheduler. Events are claimed atomically (pending →
          // processing CAS) and handlers are idempotent (withIdempotency).
          try {
            const { processPendingEvents } = await import('@/lib/ai/agent-event-dispatcher');
            const eventResult = await processPendingEvents();
            if (eventResult.processed > 0 || eventResult.failed > 0 || eventResult.retriedLater > 0) {
              console.warn(
                `[event-dispatcher] tick: scanned=${eventResult.scanned} processed=${eventResult.processed} ` +
                `failed=${eventResult.failed} retried=${eventResult.retriedLater} duplicates=${eventResult.duplicatesSkipped}`
              );
            }
          } catch (eventErr) {
            console.error(
              '[event-dispatcher] tick failed (non-fatal):',
              eventErr instanceof Error ? eventErr.message : eventErr
            );
          }
          // Phase 26 D §8 — expire stale approvals (proactive sweep).
          // Approvals past their expiresAt with status='requested' are
          // transitioned to 'expired' + their paused runs are terminated.
          // This prevents runs from being stuck in
          // 'paused_awaiting_approval' forever when the user never
          // responds. Safe (no side effects beyond status transitions).
          try {
            const { expireStaleApprovals } = await import('@/lib/ai/approval-escalation');
            const expired = await expireStaleApprovals();
            if (expired.expired > 0) {
              console.warn(`[approval-expiry] swept ${expired.expired} stale approvals`);
            }
          } catch (expireErr) {
            console.error(
              '[approval-expiry] sweep failed (non-fatal):',
              expireErr instanceof Error ? expireErr.message : expireErr
            );
          }
          // Phase 26 D §7 — check for due follow-up reminders and emit
          // 'follow_up_due' events. Each due reminder triggers the
          // handleFollowUpDueEvent handler → continuePipelineForLead
          // → FOLLOW_UP agent. Idempotent (UNIQUE idempotencyKey per
          // reminder). Bounded (50 per tick). Same heartbeat — NO second
          // scheduler.
          try {
            const { checkDueFollowUps } = await import('@/lib/ai/agent-event-dispatcher');
            const followUpResult = await checkDueFollowUps();
            if (followUpResult.emitted > 0 || followUpResult.duplicates > 0) {
              console.warn(
                `[follow-up-check] tick: checked=${followUpResult.checked} ` +
                `emitted=${followUpResult.emitted} duplicates=${followUpResult.duplicates}`
              );
            }
          } catch (followUpErr) {
            console.error(
              '[follow-up-check] tick failed (non-fatal):',
              followUpErr instanceof Error ? followUpErr.message : followUpErr
            );
          }
        } catch (err) {
          console.error(
            '[autopilot-heartbeat] tick failed (non-fatal):',
            err instanceof Error ? err.message : err
          );
        } finally {
          ticking = false;
        }
      };
      // First tick shortly after boot (lets Prisma/DB settle), then fixed interval.
      const firstTimer = setTimeout(heartbeatTick, 20000);
      firstTimer.unref?.();
      const timer = setInterval(heartbeatTick, intervalMs);
      timer.unref?.(); // never keep the process alive just for the heartbeat
    }
  }
}
