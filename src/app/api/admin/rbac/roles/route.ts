// GET /api/admin/rbac/roles — Returns the admin role catalog + permission matrix
// Server-side authorized: requires 'rbac.read' permission
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { ADMIN_ROLES, ADMIN_ROLE_DESCRIPTIONS, getRolePermissions, type AdminRole } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  return withPermission(request, 'rbac.read', async () => {
    const roles = ADMIN_ROLES.map((role: AdminRole) => ({
      role,
      description: ADMIN_ROLE_DESCRIPTIONS[role],
      permissions: getRolePermissions(role),
    }));
    return NextResponse.json({ success: true, data: { roles } });
  });
}
