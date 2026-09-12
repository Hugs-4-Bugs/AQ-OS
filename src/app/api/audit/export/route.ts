// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Audit Export API
// Phase 14.6: Compliance
// GET: Export audit logs (JSON/CSV) with filtering (admin/owner)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// ── GET: Export Audit Logs ─────────────────────────────────────────
export async function GET(request: NextRequest) {
  return withAdmin(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      // Export format
      const format = searchParams.get('format') || 'json'; // json | csv

      // Filters (same as audit/route.ts)
      const userId = searchParams.get('userId') || undefined;
      const action = searchParams.get('action') || undefined;
      const resource = searchParams.get('resource') || undefined;
      const startDate = searchParams.get('startDate') || undefined;
      const endDate = searchParams.get('endDate') || undefined;
      const limit = Math.min(parseInt(searchParams.get('limit') || '10000'), 50000);

      // Build where clause
      const where: Prisma.AuditLogWhereInput = {};

      if (userId) where.userId = userId;
      if (action) where.action = { contains: action };
      if (resource) where.resource = resource;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      // Fetch logs
      const logs = await db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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
      });

      // Create export record
      const exportRecord = await db.dataExport.create({
        data: {
          userId: user.id,
          exportType: 'audit_log_export',
          status: 'completed',
          recordCount: logs.length,
          completedAt: new Date(),
        },
      });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'audit_log_exported',
          details: JSON.stringify({
            exportId: exportRecord.id,
            format,
            recordCount: logs.length,
            filters: { userId, action, resource, startDate, endDate },
          }),
          resource: 'audit',
          resourceId: exportRecord.id,
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });

      if (format === 'csv') {
        // Generate CSV
        const headers = [
          'ID', 'Timestamp', 'User ID', 'User Email', 'User Name',
          'User Role', 'Action', 'Resource', 'Resource ID',
          'IP Address', 'User Agent', 'Details',
        ];

        const rows = logs.map((log) => [
          log.id,
          log.createdAt.toISOString(),
          log.userId,
          log.user?.email || '',
          log.user?.name || '',
          log.user?.role || '',
          log.action,
          log.resource || '',
          log.resourceId || '',
          log.ipAddress || '',
          log.userAgent || '',
          (log.details || '').replace(/"/g, '""'),
        ]);

        const csvContent = [
          headers.join(','),
          ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
        ].join('\n');

        return new NextResponse(csvContent, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.csv"`,
          },
        });
      }

      // JSON format
      return NextResponse.json({
        exportId: exportRecord.id,
        exportedAt: new Date().toISOString(),
        totalRecords: logs.length,
        filters: { userId, action, resource, startDate, endDate },
        logs: logs.map((log) => ({
          id: log.id,
          timestamp: log.createdAt.toISOString(),
          userId: log.userId,
          userEmail: log.user?.email,
          userName: log.user?.name,
          userRole: log.user?.role,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          details: log.details ? (() => { try { return JSON.parse(log.details); } catch { return log.details; } })() : null,
        })),
      });
    } catch (error) {
      console.error('Export audit logs error:', error);
      return NextResponse.json({ error: 'Failed to export audit logs' }, { status: 500 });
    }
  });
}
