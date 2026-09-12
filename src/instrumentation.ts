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
  }
}
