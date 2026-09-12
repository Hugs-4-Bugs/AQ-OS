// ═══════════════════════════════════════════════════════════════════
// GET + DELETE /api/analytics/share/[token] — Access & Revoke Shared Dashboard
// Task 7: Access shared dashboard by token, revoke share
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getSharedDashboard, revokeShare, checkShareAccess } from '@/lib/dashboard-sharing-service';

// GET /api/analytics/share/[token] — Access a shared dashboard
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // First, check if the share exists and is valid
    const share = await getSharedDashboard(token);

    if (!share) {
      return NextResponse.json(
        { error: 'Share not found, expired, or revoked' },
        { status: 404 }
      );
    }

    // Check access: try with auth, but also allow unauthenticated access for public shares
    let requestingUserId: string | undefined;

    try {
      // Try to get authenticated user (non-blocking)
      const authHeader = request.headers.get('authorization');
      const accessTokenCookie = request.cookies.get('access_token')?.value;
      if (authHeader || accessTokenCookie) {
        // Use withAuth to get the user
        const authResult = await withAuth(request, async (user) => user as unknown as NextResponse);
        if ('id' in authResult) {
          requestingUserId = (authResult as { id: string }).id;
        }
      }
    } catch {
      // Not authenticated — that's OK for public shares
    }

    // Check access permissions
    const accessResult = await checkShareAccess(token, requestingUserId);

    if (!accessResult.hasAccess) {
      return NextResponse.json(
        { error: accessResult.reason || 'Access denied' },
        { status: 403 }
      );
    }

    // Return the share details with dashboard type info
    return NextResponse.json({
      share: {
        id: share.id,
        dashboardType: share.dashboardType,
        permissions: share.permissions,
        orgSharing: share.orgSharing,
        expiresAt: share.expiresAt,
        accessCount: share.accessCount,
        lastAccessedAt: share.lastAccessedAt,
      },
    });
  } catch (error) {
    console.error('[GET /api/analytics/share/[token]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to access shared dashboard' },
      { status: 500 }
    );
  }
}

// DELETE /api/analytics/share/[token] — Revoke a share
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { token } = await params;

      // Find the share by token to get its ID
      const share = await getSharedDashboard(token);

      if (!share) {
        return NextResponse.json(
          { error: 'Share not found' },
          { status: 404 }
        );
      }

      const result = await revokeShare(share.id, user.id);

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revoke share';
      console.error('[DELETE /api/analytics/share/[token]] Error:', error);

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message.includes('Only the share creator')) {
        return NextResponse.json({ error: message }, { status: 403 });
      }

      return NextResponse.json(
        { error: 'Failed to revoke share' },
        { status: 500 }
      );
    }
  });
}
