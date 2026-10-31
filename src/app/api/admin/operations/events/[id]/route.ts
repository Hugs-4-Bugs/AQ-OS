// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — PATCH /api/admin/operations/events/[id]
// Phase 32: Resolve (acknowledge) a SystemEvent.
// RBAC: system.events.resolve (super_admin, admin)
// Idempotent — resolving an already-resolved event returns 200 with
// alreadyResolved=true (no state change).
// Audit-logged.
//
// Body (optional):
//   { note?: string }
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { resolveOperationalEvent } from '@/lib/admin-operations-service';
import { getClientIp, getUserAgent } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function safeGetHeader(request: NextRequest, name: string): string | undefined {
  try {
    return request.headers.get(name) || undefined;
  } catch {
    return undefined;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: eventId } = await params;
  return withPermission(request, 'system.events.resolve', async (admin) => {
    try {
      if (!eventId || eventId.length < 4) {
        return NextResponse.json(
          { success: false, error: 'Valid event id is required' },
          { status: 400 }
        );
      }

      let note: string | undefined;
      try {
        const body = await request.json();
        if (typeof body?.note === 'string' && body.note.trim().length > 0) {
          note = body.note.trim().slice(0, 500); // bound length
        }
      } catch {
        // body is optional — ignore parse errors
      }

      const result = await resolveOperationalEvent({
        eventId,
        adminId: admin.id,
        adminEmail: admin.email,
        ipAddress: getClientIp(request) || safeGetHeader(request, 'x-forwarded-for'),
        userAgent: getUserAgent(request) || safeGetHeader(request, 'user-agent'),
        note,
      });

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resolve event';
      // Distinguish 404 (event not found) from 500 (internal error)
      if (message.includes('not found')) {
        return NextResponse.json({ success: false, error: message }, { status: 404 });
      }
      console.error('[AdminOpsAPI] event resolve error:', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  });
}
