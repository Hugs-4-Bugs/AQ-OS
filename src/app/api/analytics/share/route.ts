// ═══════════════════════════════════════════════════════════════════
// GET + POST /api/analytics/share — Dashboard Sharing
// Task 7: List user's shares and create new shares
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getUserShares, shareDashboard } from '@/lib/dashboard-sharing-service';
import type { DashboardType, SharePermission } from '@/lib/dashboard-sharing-service';

// GET /api/analytics/share — Get user's shares
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const shares = await getUserShares(user.id);
      return NextResponse.json({ shares });
    } catch (error) {
      console.error('[GET /api/analytics/share] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch shares' },
        { status: 500 }
      );
    }
  });
}

// POST /api/analytics/share — Create a new share
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { dashboardType, permissions, allowedUsers, orgSharing, expiresAt } = body;

      // Validate required field
      if (!dashboardType) {
        return NextResponse.json(
          { error: 'Missing required field: dashboardType' },
          { status: 400 }
        );
      }

      // Validate dashboardType
      const validTypes: DashboardType[] = ['executive', 'sales', 'ai', 'ops'];
      if (!validTypes.includes(dashboardType)) {
        return NextResponse.json(
          { error: `Invalid dashboardType. Must be one of: ${validTypes.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate permissions if provided
      if (permissions) {
        const validPermissions: SharePermission[] = ['readonly', 'comment', 'edit'];
        if (!validPermissions.includes(permissions)) {
          return NextResponse.json(
            { error: `Invalid permissions. Must be one of: ${validPermissions.join(', ')}` },
            { status: 400 }
          );
        }
      }

      // Validate allowedUsers if provided
      if (allowedUsers && !Array.isArray(allowedUsers)) {
        return NextResponse.json(
          { error: 'allowedUsers must be an array of user IDs' },
          { status: 400 }
        );
      }

      // Validate expiresAt if provided
      if (expiresAt && new Date(expiresAt) <= new Date()) {
        return NextResponse.json(
          { error: 'expiresAt must be a future date' },
          { status: 400 }
        );
      }

      const share = await shareDashboard(user.id, dashboardType, {
        permissions: permissions || undefined,
        allowedUsers: allowedUsers || undefined,
        orgSharing: orgSharing || undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });

      return NextResponse.json({ share }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create share';
      console.error('[POST /api/analytics/share] Error:', error);

      if (message.includes('Invalid') || message.includes('required')) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      return NextResponse.json(
        { error: 'Failed to create share' },
        { status: 500 }
      );
    }
  });
}
