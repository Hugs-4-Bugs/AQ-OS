// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/admin/operations/integrations/[provider]/action
// Phase 32 (HARDENED) + Phase 33 BLOCKER 3 FIX:
// REAL integration action — actually invokes provider validation.
// Configuration changes are now audited via recordConfigChange()
// with before/after state + secret redaction.
//
// RBAC: integrations.control (super_admin, admin)
// Audit-logged with the ACTUAL provider response (not just intent).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { executeRealIntegrationAction } from '@/lib/admin-operations-service';
import { recordConfigChange } from '@/lib/security/audit-chain';
import { getRequestId } from '@/lib/security/request-id';
import { getClientIp, getUserAgent } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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
      let body: Record<string, unknown>;
      try { body = await request.json(); }
      catch { return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 }); }

      const action = typeof body.action === 'string' ? body.action : '';
      const idempotencyKey =
        typeof body.idempotencyKey === 'string' && body.idempotencyKey.length >= 4
          ? body.idempotencyKey
          : undefined;

      if (action !== 'validate' && action !== 'clear_cache') {
        return NextResponse.json(
          { success: false, error: 'Invalid action. Valid: validate, clear_cache' },
          { status: 400 }
        );
      }

      // BLOCKER 1: Server-enforced sensitive action confirmation
      const { requireConfirmation } = await import('@/lib/security/require-confirmation');
      const confirmResult = await requireConfirmation(request, admin, {
        actionType: 'admin_integration_control',
        targetId: provider,
      });
      if (!confirmResult.valid) {
        return NextResponse.json({ success: false, error: confirmResult.reason }, { status: 403 });
      }

      const data = await executeRealIntegrationAction({
        provider,
        action,
        idempotencyKey,
        adminId: admin.id,
        adminEmail: admin.email,
        ipAddress: getClientIp(request) || safeGetHeader(request, 'x-forwarded-for'),
        userAgent: getUserAgent(request) || safeGetHeader(request, 'user-agent'),
      });

      // BLOCKER 3 FIX: Record configuration change via recordConfigChange
      // with before/after state + secret redaction.
      const requestId = getRequestId(request);
      void recordConfigChange({
        adminId: admin.id,
        configKey: provider,
        configCategory: provider.split('.')[0],
        beforeValue: { action, status: 'before_validation' },
        afterValue: {
          action,
          status: data.status,
          configured: data.providerResult?.configured,
          reachable: data.providerResult?.reachable,
          verificationLevel: data.providerResult?.verificationLevel,
        },
        requestId,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
        confirmed: data.status === 'executed',
      }).catch(() => {});

      const httpStatus =
        data.status === 'rejected' ? 400 :
        data.status === 'already_completed' ? 200 :
        data.status === 'skipped' ? 200 :
        200;

      return NextResponse.json({ success: data.accepted, data }, { status: httpStatus });
    } catch (error) {
      console.error('[AdminOpsAPI] integration action error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
