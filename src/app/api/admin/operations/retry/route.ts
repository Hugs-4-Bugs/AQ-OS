// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/admin/operations/retry
// Phase 32: Idempotent retry of a failed operation.
// RBAC: system.operations.retry (super_admin, admin)
// Audit-logged.
//
// Body:
//   {
//     idempotencyKey: string (>= 4 chars, required),
//     operationType: string (>= 3 chars, required),
//     targetId?: string,
//     note?: string
//   }
//
// Returns:
//   { status: 'started' | 'already_completed' | 'already_in_progress' }
//
// The actual retry execution is performed by the existing operation
// service that owns the operation. This route records the retry intent
// + audit entry and returns the dispatch status.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { retryFailedOperation } from '@/lib/admin-operations-service';
import { getClientIp, getUserAgent } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function safeGetHeader(request: NextRequest, name: string): string | undefined {
  try { return request.headers.get(name) || undefined; } catch { return undefined; }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'system.operations.retry', async (admin) => {
    try {
      let body: Record<string, unknown>;
      try { body = await request.json(); }
      catch { return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 }); }

      const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
      const operationType = typeof body.operationType === 'string' ? body.operationType : '';
      const targetId = typeof body.targetId === 'string' ? body.targetId : undefined;

      if (idempotencyKey.length < 4) {
        return NextResponse.json(
          { success: false, error: 'idempotencyKey must be at least 4 characters' },
          { status: 400 }
        );
      }
      if (operationType.length < 3) {
        return NextResponse.json(
          { success: false, error: 'operationType must be at least 3 characters' },
          { status: 400 }
        );
      }

      const data = await retryFailedOperation({
        idempotencyKey,
        operationType,
        targetId,
        adminId: admin.id,
        adminEmail: admin.email,
        ipAddress: getClientIp(request) || safeGetHeader(request, 'x-forwarded-for'),
        userAgent: getUserAgent(request) || safeGetHeader(request, 'user-agent'),
      });

      return NextResponse.json({ success: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to record retry';
      console.error('[AdminOpsAPI] retry error:', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  });
}
