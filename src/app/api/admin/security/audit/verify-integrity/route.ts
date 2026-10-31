// POST /api/admin/security/audit/verify-integrity — verify audit chain
// RBAC: audit.read (super_admin, admin, support, analytics)
// The verification itself is audited.
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { verifyAuditIntegrity, recordAuditEvent } from '@/lib/security/audit-chain';
import { getClientIp, getUserAgent } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'audit.read', async (admin) => {
    try {
      const result = await verifyAuditIntegrity();

      // Audit the verification operation itself
      await recordAuditEvent({
        actorId: admin.id,
        action: 'audit_integrity_verification',
        resource: 'audit_chain',
        details: {
          valid: result.valid,
          totalEvents: result.totalEvents,
          violationCount: result.allViolations.length,
          firstViolation: result.firstViolation?.message || null,
        },
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
        severity: result.valid ? 'LOW' : 'CRITICAL',
        outcome: result.valid ? 'success' : 'failed',
        securityEventType: 'security_scan_triggered',
      }).catch(() => {});

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      console.error('[SecurityAPI] integrity verification error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
