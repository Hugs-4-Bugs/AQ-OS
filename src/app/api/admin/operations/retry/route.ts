// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/admin/operations/retry
// Phase 32 (HARDENED): REAL retry execution — actually invokes the
// underlying retry mechanism via executeRealRetry().
//
// RBAC: system.operations.retry (super_admin, admin)
// Audit-logged with the ACTUAL result (not just intent).
//
// Body:
//   {
//     idempotencyKey: string (>= 4 chars, required),
//     operationType: string (>= 3 chars, required),
//     targetId: string (required for real retry execution),
//     note?: string
//   }
//
// Returns:
//   status: 'executed' | 'already_completed' | 'rejected_non_retryable' | 'rejected_not_found'
//
// The retry ACTUALLY executes (calls retryExecution() for workflow_reexecute)
// or is explicitly rejected with a structured reason. Intent-only recording
// is NEVER the success path.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { executeRealRetry } from '@/lib/admin-operations-service';
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
      if (!targetId) {
        return NextResponse.json(
          { success: false, error: 'targetId is required for real retry execution' },
          { status: 400 }
        );
      }

      const data = await executeRealRetry({
        idempotencyKey,
        operationType,
        targetId,
        adminId: admin.id,
        adminEmail: admin.email,
        ipAddress: getClientIp(request) || safeGetHeader(request, 'x-forwarded-for'),
        userAgent: getUserAgent(request) || safeGetHeader(request, 'user-agent'),
      });

      // Map execution status to HTTP status:
      // - executed / already_completed → 200
      // - rejected_non_retryable → 409 (Conflict — state doesn't allow retry)
      // - rejected_not_found → 404
      const httpStatus =
        data.status === 'rejected_not_found' ? 404 :
        data.status === 'rejected_non_retryable' ? 409 :
        200;

      return NextResponse.json({ success: data.accepted, data }, { status: httpStatus });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to execute retry';
      console.error('[AdminOpsAPI] retry error:', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  });
}
