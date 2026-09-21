// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Single Reliable Lead Resolution Path (executions)
//
// Every AI / workflow execution that operates on a lead MUST resolve
// the lead through this module. Rules:
//
//   1. The lead identifier ALWAYS comes from the trusted execution
//      context (UI → API → workflow/pipeline context). It is never
//      generated, inferred, or chosen by an AI model.
//   2. Resolution is OWNER-SCOPED (userId) + active + not soft-deleted —
//      the same rule the prospect pipeline has always applied.
//      Execution paths never expand authorization to org-shared leads;
//      org sharing is a VIEW concern handled by /api/leads/[id].
//   3. Failures are distinguished SERVER-SIDE for diagnosis
//      (LEAD_ID_MISSING / LEAD_NOT_FOUND / LEAD_ACCESS_DENIED /
//      LEAD_LOOKUP_ERROR) but the user-facing message stays generic
//      ("Lead not found") — internal details are never exposed.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import type { Lead, Prisma } from '@prisma/client';

export type LeadResolutionFailure =
  | 'LEAD_ID_MISSING'
  | 'LEAD_NOT_FOUND'
  | 'LEAD_ACCESS_DENIED'
  | 'LEAD_LOOKUP_ERROR';

export type LeadResolutionResult<T = Lead> =
  | { ok: true; lead: T }
  | { ok: false; reason: LeadResolutionFailure; userMessage: string };

/**
 * Generic, safe-to-show message for any failed lead resolution.
 * Deliberately identical for NOT_FOUND and ACCESS_DENIED so the UI
 * never reveals whether a lead id exists for another account.
 */
export function userMessageForLeadFailure(reason: LeadResolutionFailure): string {
  return 'Lead not found';
}

function isValidLeadId(leadId: unknown): leadId is string {
  return typeof leadId === 'string' && leadId.trim().length > 0 && leadId.length <= 64;
}

/**
 * Resolve a lead for an execution path (AI pipeline, workflow action,
 * AI analysis/scoring/outreach). Owner-scoped; never expands access.
 *
 * @param userId    the authenticated user from the execution context
 * @param leadId    the lead id from the trusted execution context
 * @param opts      optional Prisma include/select passthrough so call
 *                  sites keep their exact query shapes
 */
export async function resolveLeadForExecution<
  T = Lead
>(
  userId: string,
  leadId: unknown,
  opts?: { include?: Prisma.LeadInclude; select?: Prisma.LeadSelect }
): Promise<LeadResolutionResult<T>> {
  // 1. Validate the lead id
  if (!isValidLeadId(leadId) || !userId) {
    console.warn(
      `[LeadResolution] LEAD_ID_MISSING: userId=${userId || 'NONE'} leadId=${String(leadId).slice(0, 64) || 'NONE'}`
    );
    return { ok: false, reason: 'LEAD_ID_MISSING', userMessage: userMessageForLeadFailure('LEAD_ID_MISSING') };
  }

  try {
    // 2. Owner-scoped lookup (id + userId + active + not deleted)
    const lead = await db.lead.findFirst({
      where: { id: leadId, userId, isActive: true, deletedAt: null },
      ...(opts?.include ? { include: opts.include } : {}),
      ...(opts?.select ? { select: opts.select } : {}),
    });

    if (lead) return { ok: true, lead: lead as T };

    // 3. Distinguish NOT_FOUND vs ACCESS_DENIED — server-side logs only
    const existing = await db.lead.findUnique({
      where: { id: leadId },
      select: { userId: true, isActive: true, deletedAt: true },
    });

    if (!existing) {
      console.warn(`[LeadResolution] LEAD_NOT_FOUND: no lead with id=${leadId} (requested by user=${userId})`);
      return { ok: false, reason: 'LEAD_NOT_FOUND', userMessage: userMessageForLeadFailure('LEAD_NOT_FOUND') };
    }

    if (existing.userId !== userId) {
      console.warn(
        `[LeadResolution] LEAD_ACCESS_DENIED: lead=${leadId} belongs to user=${existing.userId}, requester=${userId}`
      );
      return { ok: false, reason: 'LEAD_ACCESS_DENIED', userMessage: userMessageForLeadFailure('LEAD_ACCESS_DENIED') };
    }

    // Lead exists and is owned, but is inactive or soft-deleted
    console.warn(
      `[LeadResolution] LEAD_NOT_FOUND: lead=${leadId} is inactive or deleted (isActive=${existing.isActive}, deletedAt=${existing.deletedAt}) for user=${userId}`
    );
    return { ok: false, reason: 'LEAD_NOT_FOUND', userMessage: userMessageForLeadFailure('LEAD_NOT_FOUND') };
  } catch (err) {
    console.error(`[LeadResolution] LEAD_LOOKUP_ERROR: lead=${leadId} user=${userId}`, err);
    return { ok: false, reason: 'LEAD_LOOKUP_ERROR', userMessage: userMessageForLeadFailure('LEAD_LOOKUP_ERROR') };
  }
}
