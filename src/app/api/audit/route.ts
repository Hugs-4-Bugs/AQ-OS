// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Audit Log API
// Phase 14.6: Compliance
// GET: Query audit logs with filtering (admin/owner only)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// ── GET: Query Audit Logs ──────────────────────────────────────────
export async function GET(request: NextRequest) {
  return withSuperAdmin(request, async () => {
    try {
      const { searchParams } = new URL(request.url);

      // Pagination
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
      const skip = (page - 1) * limit;

      // Filters
      const userId = searchParams.get('userId') || undefined;
      const action = searchParams.get('action') || undefined;
      const resource = searchParams.get('resource') || undefined;
      const resourceId = searchParams.get('resourceId') || undefined;
      const startDate = searchParams.get('startDate') || undefined;
      const endDate = searchParams.get('endDate') || undefined;
      const ipAddress = searchParams.get('ipAddress') || undefined;
      const search = searchParams.get('search') || undefined;

      // Build where clause
      const where: Prisma.AuditLogWhereInput = {};

      if (userId) where.userId = userId;
      if (action) where.action = { contains: action };
      if (resource) where.resource = resource;
      if (resourceId) where.resourceId = resourceId;
      if (ipAddress) where.ipAddress = ipAddress;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      if (search) {
        where.OR = [
          { action: { contains: search } },
          { details: { contains: search } },
          { resource: { contains: search } },
          { ipAddress: { contains: search } },
        ];
      }

      const [logs, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
              },
            },
          },
        }),
        db.auditLog.count({ where }),
      ]);

      // Get available filter options
      const [actions, resources] = await Promise.all([
        db.auditLog.findMany({
          select: { action: true },
          distinct: ['action'],
          orderBy: { action: 'asc' },
          take: 100,
        }),
        db.auditLog.findMany({
          select: { resource: true },
          distinct: ['resource'],
          where: { resource: { not: null } },
          orderBy: { resource: 'asc' },
          take: 100,
        }),
      ]);

      return NextResponse.json({
        logs: logs.map((log) => ({
          id: log.id,
          userId: log.userId,
          userEmail: log.user?.email,
          userName: log.user?.name,
          userRole: log.user?.role,
          action: log.action,
          details: log.details ? (() => { try { return JSON.parse(log.details); } catch { return log.details; } })() : null,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          resource: log.resource,
          resourceId: log.resourceId,
          createdAt: log.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          hasMore: skip + limit < total,
          totalPages: Math.ceil(total / limit),
        },
        filters: {
          actions: actions.map((a) => a.action),
          resources: resources.map((r) => r.resource).filter(Boolean),
        },
      });
    } catch (error) {
      console.error('Get audit logs error:', error);
      return NextResponse.json({ error: 'Failed to get audit logs' }, { status: 500 });
    }
  });
}
