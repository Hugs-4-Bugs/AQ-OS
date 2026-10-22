// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Target Resolution (shared)
//
// Moved verbatim from the execute route (Oct 2026, multi-lead execution
// model): the niche lead resolver is needed BOTH by the HTTP route (which
// resolves the target before accepting the run) and by the background
// niche-discovery continuation (which re-resolves the niche after discovery
// imports new leads). One implementation, one owner-scope rule.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { splitNicheList, leadMatchesRequestedNiches } from '@/lib/workflow-retry';

export interface ResolvedTargetLead {
  id: string;
  businessName: string;
  niche?: string | null;
  city?: string | null;
  stage?: string | null;
}

/** Default request-size guard for one run's target population. */
export function maxTargetLeads(): number {
  const v = Number(process.env.WORKFLOW_MAX_TARGET_LEADS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 1000;
}

/** Resolution page size for niche/custom target queries — chunked database
 * queries keep memory flat while paging through arbitrarily large sets. */
export const RESOLUTION_PAGE_SIZE = 500;

/** Resolve a niche/industry target against the caller's own active leads.
 *
 * Pages through the ENTIRE matching set in chunked queries: there is no
 * arbitrary take(500) truncation. The request-size guard (maxTargetLeads)
 * bounds pathological sets honestly at the caller.
 *
 * A niche target may list multiple niches ("hospital, dentist"). Each
 * requested niche is matched EXACTLY (case-insensitive) against the leads'
 * OWN stored niche, so a lead is attributed to the niche it actually
 * carries — never relabeled with the comma-joined request string.
 */
export async function resolveNicheLeads(
  userId: string,
  niche: string
): Promise<ResolvedTargetLead[]> {
  const wantedList = splitNicheList(niche);
  if (wantedList.length === 0) return [];
  // Candidate narrowing per requested niche (contains stays index-friendly
  // on SQLite; the exact per-niche match is re-checked in JS below).
  const nicheContains = wantedList.map((n) => ({ niche: { contains: n } }));
  const all: ResolvedTargetLead[] = [];
  let skip = 0;
  for (;;) {
    const candidates = await db.lead.findMany({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
        ...(wantedList.length === 1
          ? { niche: { contains: wantedList[0] } }
          : { OR: nicheContains }),
      },
      select: { id: true, businessName: true, niche: true, city: true, stage: true },
      take: RESOLUTION_PAGE_SIZE,
      skip,
    });
    all.push(...candidates.filter((l) => leadMatchesRequestedNiches(l.niche, wantedList)));
    if (candidates.length < RESOLUTION_PAGE_SIZE) break;
    skip += RESOLUTION_PAGE_SIZE;
    if (all.length >= maxTargetLeads()) break; // bounded; caller enforces honestly
  }
  return all;
}
