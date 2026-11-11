// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Consent Enforcement Helper
//
// Server-side consent enforcement for optional processing purposes.
// Uses the existing canonical consent contract from consent-contract.ts.
//
// Design:
//   - Fail-closed for optional purposes (missing/declined/withdrawn → blocked)
//   - Essential service always permitted
//   - No client-side trust
//   - No caching that allows stale consent after withdrawal
//   - Reads consent state fresh from DB on each call
//
// Phase 7 — Consent Downstream Enforcement
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import {
  deserializeConsentData,
  isEssentialPurpose,
  type ConsentPurpose,
  type ConsentStateEntry,
} from './consent-contract';

// ── Consent enforcement error ───────────────────────────────────────
export class ConsentDeniedError extends Error {
  constructor(
    public readonly purpose: ConsentPurpose,
    message: string
  ) {
    super(message);
    this.name = 'ConsentDeniedError';
  }
}

// ── Consent check result ────────────────────────────────────────────
export interface ConsentCheckResult {
  granted: boolean;
  purpose: ConsentPurpose;
  status: ConsentStateEntry['status'] | 'not_set';
  reason?: string;
}

// ── Check consent for a specific purpose ────────────────────────────
// Reads the user's consent state fresh from the database on every call.
// No caching — ensures withdrawal takes effect immediately.
export async function checkConsent(
  userId: string,
  purpose: ConsentPurpose
): Promise<ConsentCheckResult> {
  // Essential service is always granted (required for account to function)
  if (isEssentialPurpose(purpose)) {
    return { granted: true, purpose, status: 'granted' };
  }

  try {
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: { notificationPreferences: true },
    });

    if (!settings) {
      // No settings record → consent state is default (optional = declined)
      return {
        granted: false,
        purpose,
        status: 'not_set',
        reason: 'Consent state not initialized — optional consent defaults to declined',
      };
    }

    const { state } = deserializeConsentData(settings.notificationPreferences);
    const entry = state[purpose];

    if (!entry) {
      return {
        granted: false,
        purpose,
        status: 'not_set',
        reason: 'Consent record not found — optional consent defaults to declined',
      };
    }

    const granted = entry.status === 'granted';
    return {
      granted,
      purpose,
      status: entry.status,
      ...(granted ? {} : { reason: `Consent for "${purpose}" is ${entry.status}` }),
    };
  } catch (error) {
    // Fail-closed: if we can't read consent, optional processing is blocked
    return {
      granted: false,
      purpose,
      status: 'not_set',
      reason: `Consent check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

// ── Require consent (throws if not granted) ─────────────────────────
// Use this at processing boundaries where the calling code expects
// consent to be granted. Throws ConsentDeniedError if not.
export async function requireConsent(
  userId: string,
  purpose: ConsentPurpose
): Promise<void> {
  const result = await checkConsent(userId, purpose);
  if (!result.granted) {
    throw new ConsentDeniedError(
      purpose,
      result.reason || `Consent for "${purpose}" is required but not granted.`
    );
  }
}

// ── Check if consent is granted (boolean, no throw) ─────────────────
// Use this when you want to check consent without throwing, e.g. to
// conditionally skip optional processing.
export async function hasConsent(
  userId: string,
  purpose: ConsentPurpose
): Promise<boolean> {
  const result = await checkConsent(userId, purpose);
  return result.granted;
}
