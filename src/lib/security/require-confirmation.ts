// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Sensitive Action Confirmation Enforcer
// Phase 33: Server-enforced confirmation for ALL sensitive mutations.
//
// This helper provides a reusable `requireConfirmation()` function that
// any sensitive mutation endpoint can call to enforce server-side
// confirmation before performing the mutation.
//
// Usage in a route handler:
//   const confirmResult = await requireConfirmation(request, admin, {
//     actionType: 'admin_refund',
//     targetId: userId,
//   });
//   if (!confirmResult.valid) {
//     return NextResponse.json({ error: confirmResult.reason }, { status: 403 });
//   }
//   // ... proceed with mutation ...
// ═══════════════════════════════════════════════════════════════════

import type { NextRequest, NextResponse } from 'next/server';
import { confirmAction, recordAuditEvent, type SensitiveAction } from '@/lib/security/audit-chain';
import { getRequestId } from '@/lib/security/request-id';
import { getClientIp, getUserAgent } from '@/lib/auth';

export interface RequireConfirmationParams {
  actionType: SensitiveAction;
  targetId: string;
}

export interface ConfirmationResult {
  valid: boolean;
  reason?: string;
  confirmationId?: string;
  requestId: string;
}

/**
 * Require and validate a sensitive action confirmation from the request body.
 *
 * Extracts `confirmationId` + `token` from the request body, validates them
 * through `confirmAction()`, and returns the result.
 *
 * If confirmation is missing/invalid/expired/already-used/wrong-target/wrong-admin,
 * returns `{ valid: false }` — the caller must reject the mutation.
 *
 * Also records a chained audit event for the failed attempt.
 */
export async function requireConfirmation(
  request: NextRequest,
  admin: { id: string; email: string },
  params: RequireConfirmationParams
): Promise<ConfirmationResult> {
  const requestId = getRequestId(request);
  const ipAddress = getClientIp(request);
  const userAgent = getUserAgent(request);

  // Extract confirmation from request body
  let body: Record<string, unknown>;
  try {
    // Clone the request to allow the caller to re-read the body
    const cloned = request.clone();
    body = await cloned.json();
  } catch {
    // Record failed attempt
    await recordAuditEvent({
      actorId: admin.id,
      action: params.actionType,
      resource: 'confirmation',
      resourceId: params.targetId,
      details: { reason: 'invalid_json_body' },
      ipAddress,
      userAgent,
      requestId,
      severity: 'HIGH',
      outcome: 'denied',
      securityEventType: 'sensitive_action_rejected',
      confirmed: false,
    }).catch(() => {});

    return { valid: false, reason: 'Invalid JSON body — confirmationId and token required', requestId };
  }

  const confirmationId = typeof body.confirmationId === 'string' ? body.confirmationId : '';
  const token = typeof body.token === 'string' ? body.token : '';

  if (!confirmationId || !token) {
    // Record failed attempt — no confirmation provided
    await recordAuditEvent({
      actorId: admin.id,
      action: params.actionType,
      resource: 'confirmation',
      resourceId: params.targetId,
      details: { reason: 'missing_confirmation', targetId: params.targetId },
      ipAddress,
      userAgent,
      requestId,
      severity: 'HIGH',
      outcome: 'denied',
      securityEventType: 'sensitive_action_rejected',
      confirmed: false,
    }).catch(() => {});

    return {
      valid: false,
      reason: 'Sensitive action confirmation required. Call POST /api/admin/security/confirmation/request first, then provide confirmationId + token.',
      requestId,
    };
  }

  // Validate + consume the confirmation
  const result = await confirmAction({
    confirmationId,
    token,
    actionType: params.actionType,
    targetId: params.targetId,
    adminId: admin.id,
  });

  if (!result.valid) {
    // Record failed confirmation
    await recordAuditEvent({
      actorId: admin.id,
      action: params.actionType,
      resource: 'confirmation',
      resourceId: params.targetId,
      details: { reason: 'confirmation_failed', rejectionReason: result.reason, confirmationId },
      ipAddress,
      userAgent,
      requestId,
      severity: 'HIGH',
      outcome: 'denied',
      securityEventType: 'sensitive_action_rejected',
      confirmed: false,
    }).catch(() => {});

    return { valid: false, reason: `Confirmation invalid: ${result.reason}`, requestId };
  }

  return { valid: true, confirmationId: result.confirmationId, requestId };
}
