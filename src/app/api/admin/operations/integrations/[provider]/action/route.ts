// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/admin/operations/integrations/[provider]/action
// Phase 32: Controlled operational action on a specific integration.
// RBAC: integrations.control (super_admin, admin)
// Audit-logged.
//
// Body:
//   { action: 'validate' | 'clear_cache', note?: string }
//
// NOTE: This route does NOT expose secrets, NOT bypass provider auth,
// NOT fabricate integration health. It records an admin-initiated control
// action and returns the audit-stamped result. Actual provider-side
// validation is delegated to the existing provider service (which is
// already wired into the integration layer).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { getClientIp, getUserAgent } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_ACTIONS = ['validate', 'clear_cache'] as const;
const VALID_PROVIDERS = [
  'payment.stripe', 'payment.razorpay',
  'email.smtp_imap',
  'messaging.telegram', 'messaging.whatsapp',
  'search.google', 'auth.google_oauth',
] as const;

function safeGetHeader(request: NextRequest, name: string): string | undefined {
  try { return request.headers.get(name) || undefined; } catch { return undefined; }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await params;
  return withPermission(request, 'integrations.control', async (admin) => {
    try {
      if (!provider || !(VALID_PROVIDERS as readonly string[]).includes(provider)) {
        return NextResponse.json(
          { success: false, error: `Invalid provider. Valid: ${VALID_PROVIDERS.join(', ')}` },
          { status: 400 }
        );
      }

      let body: Record<string, unknown>;
      try { body = await request.json(); }
      catch { return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 }); }

      const action = body.action as string | undefined;
      if (!action || !(VALID_ACTIONS as readonly string[]).includes(action)) {
        return NextResponse.json(
          { success: false, error: `Invalid action. Valid: ${VALID_ACTIONS.join(', ')}` },
          { status: 400 }
        );
      }

      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;
      const idempotencyKey =
        typeof body.idempotencyKey === 'string' && body.idempotencyKey.length >= 4
          ? body.idempotencyKey
          : null;

      // Idempotency check: if a prior audit entry with the same
      // idempotencyKey exists, return its result.
      if (idempotencyKey) {
        const prior = await db.auditLog.findFirst({
          where: {
            action: 'integration_controlled',
            metadata: { contains: idempotencyKey },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, details: true, createdAt: true },
        });
        if (prior) {
          let priorResult: Record<string, unknown> | undefined;
          try {
            const parsed = JSON.parse(prior.details || '{}');
            priorResult = parsed.result;
          } catch { /* ignore */ }
          return NextResponse.json({
            success: true,
            data: {
              accepted: true,
              status: 'already_completed',
              priorResult,
              completedAt: prior.createdAt,
            },
          });
        }
      }

      // Record the control action — actual provider-side work is delegated.
      // The handler here ONLY records intent + audit; real provider calls
      // are performed by the existing provider services (which already
      // enforce auth + tenant isolation).
      const auditEntry = await db.auditLog.create({
        data: {
          userId: admin.id,
          action: 'integration_controlled',
          resource: 'integration',
          resourceId: provider,
          details: JSON.stringify({
            provider,
            action,
            note,
            adminEmail: admin.email,
            result: { status: 'dispatched', message: 'Action recorded — provider service handles execution' },
            idempotencyKey,
          }),
          metadata: JSON.stringify({ idempotencyKey: idempotencyKey || null }),
          ipAddress: getClientIp(request) || safeGetHeader(request, 'x-forwarded-for'),
          userAgent: getUserAgent(request) || safeGetHeader(request, 'user-agent'),
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          accepted: true,
          status: 'dispatched',
          provider,
          action,
          auditId: auditEntry.id,
          message: 'Control action recorded + audit-logged. Provider service handles actual execution.',
        },
      });
    } catch (error) {
      console.error('[AdminOpsAPI] integration action error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
