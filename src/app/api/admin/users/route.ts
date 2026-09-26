// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin User Management API (list)
//
// GET /api/admin/users
// Paginated, searchable user listing for the Admin Dashboard.
// PLATFORM-LEVEL access across ALL tenants — guarded by withSuperAdmin.
//
// SECURITY:
// - Only safe, non-sensitive fields are ever returned. Credential and
//   OTP fields (passwordHash, loginOtp, magicLinkToken, resetOtp, …)
//   are NEVER selected.
// - Read-only listing; mutations live in /api/admin/users/[id] PATCH.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// Whitelisted selectable columns — deliberately excludes every secret field.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatar: true,
  role: true,
  plan: true,
  credits: true,
  creditsMonthly: true,
  isTrial: true,
  trialEndsAt: true,
  isActive: true,
  emailVerified: true,
  authProvider: true,
  company: true,
  country: true,
  orgId: true,
  developerAccessEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  deletedAt: true,
} as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withSuperAdmin(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const search = (searchParams.get('search') || '').trim();
      const roleFilter = searchParams.get('role') || '';
      const planFilter = searchParams.get('plan') || '';
      const statusFilter = searchParams.get('status') || ''; // active | inactive
      const sortBy = searchParams.get('sortBy') || 'newest';
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

      // ── Build where clause ───────────────────────────────────
      const where: Prisma.UserWhereInput = { deletedAt: null };

      if (search) {
        where.OR = [
          { email: { contains: search } },
          { name: { contains: search } },
          { company: { contains: search } },
        ];
      }
      if (roleFilter) where.role = roleFilter;
      if (planFilter) where.plan = planFilter;
      if (statusFilter === 'active') where.isActive = true;
      if (statusFilter === 'inactive') where.isActive = false;

      // ── Sorting ──────────────────────────────────────────────
      let orderBy: Prisma.UserOrderByWithRelationInput;
      switch (sortBy) {
        case 'oldest':
          orderBy = { createdAt: 'asc' };
          break;
        case 'email':
          orderBy = { email: 'asc' };
          break;
        case 'credits':
          orderBy = { credits: 'desc' };
          break;
        case 'last-login':
          orderBy = { lastLoginAt: 'desc' };
          break;
        case 'newest':
        default:
          orderBy = { createdAt: 'desc' };
      }

      // ── Query + aggregate stats in parallel ──────────────────
      const [users, total, filteredTotal, roleGroups, planGroups, activeCount] =
        await Promise.all([
          db.user.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            select: SAFE_USER_SELECT,
          }),
          db.user.count({ where: { deletedAt: null } }),
          db.user.count({ where }),
          db.user.groupBy({ by: ['role'], _count: { role: true }, where: { deletedAt: null } }),
          db.user.groupBy({ by: ['plan'], _count: { plan: true }, where: { deletedAt: null } }),
          db.user.count({ where: { deletedAt: null, isActive: true } }),
        ]);

      return NextResponse.json({
        success: true,
        data: {
          users,
          pagination: {
            page,
            limit,
            total: filteredTotal,
            totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
          },
          stats: {
            totalUsers: total,
            activeUsers: activeCount,
            byRole: roleGroups.map((g) => ({ role: g.role, count: g._count.role })),
            byPlan: planGroups.map((g) => ({ plan: g.plan, count: g._count.plan })),
          },
        },
      });
    } catch (error) {
      console.error('Admin users list error:', error);
      return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
    }
  });
}
