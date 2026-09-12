// ═══════════════════════════════════════════════════════════════════
// POST + GET /api/reports — Report CRUD
// Phase 13: Create and list reports
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// POST /api/reports — Create a new report
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { name, description, type, dashboard, filters, chartConfig, scheduleCron, exportFormat } = body;

      // Validate required fields
      if (!name || !type) {
        return NextResponse.json(
          { error: 'Missing required fields: name, type' },
          { status: 400 }
        );
      }

      // Validate type
      const validTypes = ['custom', 'saved', 'scheduled'];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: 'Invalid type. Must be one of: custom, saved, scheduled' },
          { status: 400 }
        );
      }

      // Validate export format
      if (exportFormat && !['pdf', 'csv', 'json'].includes(exportFormat)) {
        return NextResponse.json(
          { error: 'Invalid exportFormat. Must be one of: pdf, csv, json' },
          { status: 400 }
        );
      }

      const report = await db.report.create({
        data: {
          userId: user.id,
          name,
          description: description || null,
          type,
          dashboard: dashboard || null,
          filters: JSON.stringify(filters || {}),
          chartConfig: JSON.stringify(chartConfig || {}),
          scheduleCron: scheduleCron || null,
          exportFormat: exportFormat || 'json',
          orgId: user.orgId || null,
        },
      });

      // Audit log — report generated
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'report_generated',
          details: JSON.stringify({ reportId: report.id, name, type, dashboard }),
          resource: 'report',
          resourceId: report.id,
        },
      }).catch(() => {});

      // Audit log — export created (tracks when report export is initiated)
      if (exportFormat) {
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: 'export_created',
            details: JSON.stringify({ reportId: report.id, name, exportFormat, type }),
            resource: 'report',
            resourceId: report.id,
          },
        }).catch(() => {});
      }

      return NextResponse.json({ report }, { status: 201 });
    } catch (error) {
      console.error('[POST /api/reports] Error:', error);
      return NextResponse.json(
        { error: 'Failed to create report' },
        { status: 500 }
      );
    }
  });
}

// GET /api/reports — List reports with pagination
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
      const type = searchParams.get('type') || undefined;
      const dashboard = searchParams.get('dashboard') || undefined;

      const where: Record<string, unknown> = { userId: user.id };
      if (type) where.type = type;
      if (dashboard) where.dashboard = dashboard;

      const [data, total] = await Promise.all([
        db.report.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.report.count({ where }),
      ]);

      return NextResponse.json({
        data,
        total,
        page,
        limit,
      });
    } catch (error) {
      console.error('[GET /api/reports] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch reports' },
        { status: 500 }
      );
    }
  });
}
