// GET /api/admin/security/suspicious-activity — deterministic suspicious activity detection
// RBAC: security.events.read (super_admin, admin)
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { detectSuspiciousActivity } from '@/lib/security/audit-chain';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withPermission(request, 'security.events.read', async () => {
    try {
      const detections = await detectSuspiciousActivity();
      return NextResponse.json({ success: true, data: { detections } });
    } catch (error) {
      console.error('[SecurityAPI] suspicious activity error:', error);
      return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
  });
}
