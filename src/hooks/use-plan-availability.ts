'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — usePlanAvailability
//
// Fetches the public GET /api/payments/provider-status response and
// exposes both halves of the FINAL PAYMENT ACTIVATION ARCHITECTURE:
//
//   • planStatus — every paid plan (Starter/Pro/Elite) is IMPLEMENTED
//     and ACTIVE. The pricing surfaces must NEVER render "Coming Soon"
//     for a paid plan; a missing provider env var is a configuration
//     state, not a product availability decision.
//
//   • planAvailability — per plan/cycle provider configuration
//     booleans. Used ONLY to decide whether the plan card shows the
//     "checkout implemented — payment provider configuration required"
//     notice under an ENABLED CTA. It never disables the CTA.
//
// Server-side checkout routes remain the real enforcement point: an
// enabled CTA clicked without provider configuration reaches the
// server, which reports the missing configuration honestly (no fake
// payment path).
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';

export interface PlanCycleAvailability {
  stripe: boolean;
  razorpay: boolean;
  available: boolean;
}

export type PlanAvailabilityMap = Record<
  string,
  Record<'monthly' | 'yearly', PlanCycleAvailability>
>;

export interface ProviderStatusPayload {
  planStatus: Record<string, string> | null;
  planAvailability: PlanAvailabilityMap;
  anyAvailable: boolean;
}

/** Hook — fetches the provider-status snapshot. Returns null while the
 * request is pending/failed (availability is advisory; the server
 * still enforces everything). */
export function usePlanAvailability(): PlanAvailabilityMap | null {
  const [availability, setAvailability] = useState<PlanAvailabilityMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/payments/provider-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && data.planAvailability) {
          setAvailability(data.planAvailability as PlanAvailabilityMap);
        }
      })
      .catch(() => {
        /* availability is advisory — server-side checkout still enforces */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}

/**
 * Whether the plan/cycle's provider configuration is complete.
 * Returns null when availability is not yet known (endpoint pending or
 * failed) — callers must keep the CTA ENABLED in that case and let the
 * server report any missing configuration honestly.
 *
 * SEMANTICS (final payment activation architecture): `false` means
 * "configuration required" — it does NOT mean the plan is unavailable.
 * Callers use it only to show the config-required notice; they must
 * NOT render "Coming Soon" or disable the purchase button.
 */
export function isPlanCheckoutAvailable(
  availability: PlanAvailabilityMap | null,
  plan: string,
  cycle: 'monthly' | 'yearly'
): boolean | null {
  if (!availability) return null;
  const entry = availability[plan]?.[cycle];
  if (!entry) return null;
  return entry.available;
}
