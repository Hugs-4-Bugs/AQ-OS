// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Quota Status API Route
// Returns quota usage vs. limits for all features on the
// authenticated user's plan.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';
import { getQuotaStatus } from '@/lib/usage-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const quotaStatus = await getQuotaStatus(user.id);
      return NextResponse.json(quotaStatus);
    } catch (error) {
      console.error('[QuotaAPI] Error fetching quota status:', error);
      return NextResponse.json(
        { error: 'Failed to fetch quota status' },
        { status: 500 }
      );
    }
  });
}
