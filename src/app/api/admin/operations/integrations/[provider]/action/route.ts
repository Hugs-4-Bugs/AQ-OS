// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/admin/operations/integrations/[provider]/action
// Phase 32 (HARDENED): REAL integration action — actually invokes the
// provider validation via executeRealIntegrationAction().
//
// RBAC: integrations.control (super_admin, admin)
// Audit-logged with the ACTUAL provider response (not just intent).
//
// Body:
//   { action: 'validate' | 'clear_cache', idempotencyKey?: string, note?: string }
//
// Returns:
//   status: 'executed' | 'already_completed' | 'rejected' | 'skipped'
//   providerResult: { reachable, latencyMs, error, details } — REAL provider response
//
// For 'validate': actually tests provider configuration + reachability.
// For 'clear_cache': explicitly skipped (no cache layer in this architecture).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { executeRealIntegrationAction } from '@/lib/admin-operations-service';
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

      const data = await executeRealIntegrationAction({
        provider,
        action,
        idempotencyKey,
        adminId: admin.id,
        adminEmail: admin.email,
        ipAddress: getClientIp(request) || safeGetHeader(request, 'x-forwarded-for'),
        userAgent: getUserAgent(request) || safeGetHeader(request, 'user-agent'),
      });

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
