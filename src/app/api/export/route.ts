// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Data Export API Route
// Exports leads, deals, pipeline, or communications as CSV
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withFeature, withCredits } from '@/lib/plan-gates';
import { db } from '@/lib/db';
import { deductCredits } from '@/lib/credit-service';
import type { AuthUser } from '@/lib/auth';

// ─── CSV Helpers ───────────────────────────────────────────

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map((row) => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
}

// ─── Export Data Queries ───────────────────────────────────

async function getLeadsData(userId: string) {
  const leads = await db.lead.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: {
      businessName: true,
      ownerName: true,
      niche: true,
      country: true,
      city: true,
      stage: true,
      replyScore: true,
      conversionScore: true,
      urgencyScore: true,
      revenuePotentialScore: true,
      email: true,
      phone: true,
      website: true,
      source: true,
      hasWebsite: true,
      websiteQuality: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const headers = [
    'Business Name', 'Owner', 'Niche', 'Country', 'City', 'Stage',
    'Reply Score', 'Conversion Score', 'Urgency Score', 'Revenue Potential Score',
    'Email', 'Phone', 'Website', 'Source', 'Has Website', 'Website Quality',
    'Created At', 'Updated At',
  ];

  const rows = leads.map((l) => [
    l.businessName, l.ownerName ?? '', l.niche ?? '', l.country ?? '', l.city ?? '',
    l.stage, l.replyScore, l.conversionScore, l.urgencyScore, l.revenuePotentialScore,
    l.email ?? '', l.phone ?? '', l.website ?? '', l.source ?? '',
    l.hasWebsite ? 'Yes' : 'No', l.websiteQuality ?? '',
    l.createdAt.toISOString(), l.updatedAt.toISOString(),
  ]);

  return { headers, rows, count: leads.length };
}

async function getDealsData(userId: string) {
  const deals = await db.deal.findMany({
    where: { lead: { userId } },
    orderBy: { createdAt: 'desc' },
    select: {
      projectType: true,
      status: true,
      proposedPrice: true,
      finalPrice: true,
      currency: true,
      projectScope: true,
      implementationTimeline: true,
      maintenancePlan: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      lead: { select: { businessName: true, niche: true } },
    },
  });

  const headers = [
    'Business Name', 'Niche', 'Project Type', 'Status',
    'Proposed Price', 'Final Price', 'Currency', 'Scope',
    'Timeline', 'Maintenance Plan', 'Notes', 'Created At', 'Updated At',
  ];

  const rows = deals.map((d) => [
    d.lead?.businessName ?? '', d.lead?.niche ?? '',
    d.projectType ?? '', d.status, d.proposedPrice ?? '', d.finalPrice ?? '',
    d.currency, d.projectScope ?? '', d.implementationTimeline ?? '',
    d.maintenancePlan ?? '', d.notes ?? '',
    d.createdAt.toISOString(), d.updatedAt.toISOString(),
  ]);

  return { headers, rows, count: deals.length };
}

async function getPipelineData(userId: string) {
  const leads = await db.lead.findMany({
    where: { userId, isActive: true, stage: { not: 'discovered' } },
    orderBy: { updatedAt: 'desc' },
    select: {
      businessName: true,
      ownerName: true,
      niche: true,
      country: true,
      stage: true,
      conversionScore: true,
      revenuePotentialScore: true,
      bestContactPerson: true,
      bestChannel: true,
      email: true,
      phone: true,
      lastContactedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const headers = [
    'Business Name', 'Owner', 'Niche', 'Country', 'Stage',
    'Conversion Score', 'Revenue Potential Score',
    'Best Contact', 'Best Channel', 'Email', 'Phone',
    'Last Contacted', 'Created At', 'Updated At',
  ];

  const rows = leads.map((l) => [
    l.businessName, l.ownerName ?? '', l.niche ?? '', l.country ?? '',
    l.stage, l.conversionScore, l.revenuePotentialScore,
    l.bestContactPerson ?? '', l.bestChannel ?? '',
    l.email ?? '', l.phone ?? '',
    l.lastContactedAt?.toISOString() ?? '',
    l.createdAt.toISOString(), l.updatedAt.toISOString(),
  ]);

  return { headers, rows, count: leads.length };
}

async function getCommunicationsData(userId: string) {
  const comms = await db.outreachMessage.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      channel: true,
      direction: true,
      subject: true,
      content: true,
      status: true,
      generatedByAI: true,
      sentAt: true,
      openedAt: true,
      repliedAt: true,
      lead: { select: { businessName: true } },
      createdAt: true,
    },
    take: 500,
  });

  const headers = [
    'Business Name', 'Channel', 'Direction', 'Subject',
    'Status', 'AI Generated', 'Sent At', 'Opened At',
    'Replied At', 'Created At',
  ];

  const rows = comms.map((c) => [
    c.lead?.businessName ?? '', c.channel, c.direction,
    c.subject ?? '', c.status, c.generatedByAI ? 'Yes' : 'No',
    c.sentAt?.toISOString() ?? '', c.openedAt?.toISOString() ?? '',
    c.repliedAt?.toISOString() ?? '', c.createdAt.toISOString(),
  ]);

  return { headers, rows, count: comms.length };
}

// ─── Route Handler ─────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Step 1: Authenticate + Feature gate + Credits gate
  return withFeature(request, 'data_export', async (user: AuthUser) => {
    return withCredits(request, 'data_export', async (_user: AuthUser, creditInfo) => {
      const { searchParams } = new URL(request.url);
      const type = searchParams.get('type') || 'leads';

      // Step 2: Fetch data based on type
      let data: { headers: string[]; rows: unknown[][]; count: number };

      switch (type) {
        case 'deals':
          data = await getDealsData(user.id);
          break;
        case 'pipeline':
          data = await getPipelineData(user.id);
          break;
        case 'communications':
          data = await getCommunicationsData(user.id);
          break;
        case 'leads':
        default:
          data = await getLeadsData(user.id);
          break;
      }

      // Step 3: Convert to CSV
      const csv = toCSV(data.headers, data.rows);

      // Step 4: Deduct credits
      if (creditInfo.required > 0) {
        await deductCredits({
          userId: user.id,
          action: 'data_export',
          cost: creditInfo.required,
          referenceId: `export-${type}-${Date.now()}`,
        });
      }

      // Step 5: Log the export in UsageTracking
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      try {
        await db.usageTracking.upsert({
          where: {
            userId_feature_periodStart: {
              userId: user.id,
              feature: 'data_export',
              periodStart,
            },
          },
          create: {
            userId: user.id,
            feature: 'data_export',
            action: `export_${type}`,
            count: 1,
            periodStart,
            periodEnd,
          },
          update: {
            count: { increment: 1 },
            action: `export_${type}`,
          },
        });
      } catch {
        // Non-critical — don't fail the export if tracking fails
      }

      // Step 6: Return as downloadable CSV
      const filename = `acquisitionos-${type}-export-${new Date().toISOString().slice(0, 10)}.csv`;
      const bom = '\uFEFF'; // BOM for UTF-8 Excel compatibility

      return new NextResponse(bom + csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv;charset=utf-8;',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'X-Export-Count': String(data.count),
        },
      });
    });
  });
}
