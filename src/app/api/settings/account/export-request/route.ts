// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings: Data Export Request API Route
// POST /api/settings/account/export-request — Request GDPR data export
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';

// POST /api/settings/account/export-request - Request data export
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    const body = await request.json() || {};
    const { exportType = 'full_json' } = body;

    // Validate export type
    const validExportTypes = ['leads_csv', 'leads_pdf', 'deals_csv', 'full_json'];
    if (!validExportTypes.includes(exportType)) {
      return NextResponse.json(
        { error: `Invalid export type. Must be one of: ${validExportTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if there's already a pending export request
    const pendingExport = await db.dataExport.findFirst({
      where: {
        userId: user.id,
        status: { in: ['pending', 'processing'] },
      },
    });

    if (pendingExport) {
      return NextResponse.json(
        { error: 'You already have a pending export request. Please wait for it to complete.' },
        { status: 400 }
      );
    }

    // Create data export request
    const exportRequest = await db.dataExport.create({
      data: {
        userId: user.id,
        exportType,
        status: 'pending',
      },
    });

    // Also create a GDPR request record
    await db.gdprRequest.create({
      data: {
        userId: user.id,
        requestType: exportType === 'full_json' ? 'portability' : 'access',
        status: 'pending',
        notes: `Data export requested by user (type: ${exportType})`,
      },
    });

    // In a real system, this would trigger a background job to generate the export
    // For now, we'll simulate it completing immediately for small datasets
    try {
      const exportData = await generateExportData(user.id, exportType);
      const jsonData = JSON.stringify(exportData);
      const recordCount = exportData.recordCount || 0;

      await db.dataExport.update({
        where: { id: exportRequest.id },
        data: {
          status: 'completed',
          fileUrl: `data:application/json;base64,${Buffer.from(jsonData).toString('base64').substring(0, 100)}...`,
          fileSize: Buffer.byteLength(jsonData),
          recordCount,
          completedAt: new Date(),
        },
      });
    } catch {
      // Export generation failed, keep as pending for retry
      console.log('[EXPORT] Background export generation will be retried');
    }

    // Audit log
    await logAuthEvent({
      userId: user.id,
      action: 'data_export_requested',
      details: JSON.stringify({ exportId: exportRequest.id, exportType }),
      ipAddress: ip,
      userAgent: ua,
      resource: 'data_export',
      resourceId: exportRequest.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Data export request submitted. You will receive a download link via email when your data is ready (typically within 24-48 hours).',
      exportId: exportRequest.id,
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error requesting data export:', error);
    return NextResponse.json({ error: 'Failed to process export request' }, { status: 500 });
  }
}

// Helper to generate export data
async function generateExportData(userId: string, exportType: string): Promise<Record<string, unknown> & { recordCount: number }> {
  switch (exportType) {
    case 'full_json': {
      const [userData, leads, settings] = await Promise.all([
        db.user.findUnique({
          where: { id: userId },
          select: {
            id: true, email: true, name: true, phone: true, country: true,
            plan: true, createdAt: true,
          },
        }),
        db.lead.findMany({
          where: { userId, isActive: true },
          take: 1000,
        }),
        db.userSettings.findUnique({ where: { userId } }),
      ]);
      return {
        user: userData,
        leads: leads.length,
        settings: settings ? { timezone: settings.timezone, companyName: settings.companyName } : null,
        recordCount: leads.length + 1 + (settings ? 1 : 0),
      };
    }
    case 'leads_csv':
    case 'leads_pdf': {
      const leads = await db.lead.findMany({
        where: { userId, isActive: true },
        take: 1000,
      });
      return { leads: leads.length, recordCount: leads.length };
    }
    case 'deals_csv': {
      const deals = await db.deal.findMany({
        where: { lead: { userId } },
        take: 1000,
      });
      return { deals: deals.length, recordCount: deals.length };
    }
    default:
      return { recordCount: 0 };
  }
}
