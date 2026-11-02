// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Public Stats API (for landing page hero)
//
// GET /api/public/stats
// Returns AGGREGATE, NON-SENSITIVE metrics for the public landing page.
// No user emails, no IDs, no credentials, no PII — just counts and
// aggregate niche breakdowns that prove the platform is actively used.
//
// This is publicly readable (no auth) by design: the landing page needs
// to show real data to visitors. Every field is carefully chosen to be
// safe for public consumption.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // cache for 5 minutes

export async function GET() {
  try {
    const now = new Date();
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const d7 = new Date(now); d7.setDate(d7.getDate() - 7);

    const [
      totalLeads,
      leads30d,
      leads7d,
      contactedLeads,
      totalOutreach,
      autopilotRuns,
      autopilotWorkflows,
      activeSubscriptions,
      totalUsers,
      topNiches,
      topSources,
      leadStages,
      recentActivityCount,
    ] = await Promise.all([
      db.lead.count({ where: { isActive: true, deletedAt: null } }),
      db.lead.count({ where: { isActive: true, deletedAt: null, createdAt: { gte: d30 } } }),
      db.lead.count({ where: { isActive: true, deletedAt: null, createdAt: { gte: d7 } } }),
      db.lead.count({ where: { isActive: true, deletedAt: null, stage: 'contacted' } }),
      db.outreachMessage.count(),
      db.autopilotRun.count().catch(() => 0),
      db.autopilotWorkflow.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
      db.subscription.count({ where: { status: 'active' } }),
      db.user.count({ where: { deletedAt: null } }),
      db.lead.groupBy({
        by: ['niche'],
        _count: { niche: true },
        where: { isActive: true, deletedAt: null, niche: { not: null } },
        orderBy: { _count: { niche: 'desc' } },
        take: 6,
      }),
      db.lead.groupBy({
        by: ['source'],
        _count: { source: true },
        where: { isActive: true, deletedAt: null, source: { not: null } },
        orderBy: { _count: { source: 'desc' } },
        take: 4,
      }),
      db.lead.groupBy({
        by: ['stage'],
        _count: { stage: true },
        where: { isActive: true, deletedAt: null },
      }),
      db.leadActivity.count({ where: { createdAt: { gte: d7 } } }),
    ]);

    // Format niches for display (capitalize, clean)
    const nicheBreakdown = topNiches.map((n) => ({
      niche: (n.niche || 'Unknown').replace(/\b\w/g, (c) => c.toUpperCase()),
      count: n._count.niche,
    }));

    const sourceBreakdown = topSources.map((s) => ({
      source: (s.source || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      count: s._count.source,
    }));

    const stageBreakdown = leadStages.map((s) => ({
      stage: s.stage,
      count: s._count.stage,
    }));

    return NextResponse.json({
      success: true,
      data: {
        generatedAt: now.toISOString(),
        // Headline metrics
        totalLeadsDiscovered: totalLeads,
        leadsDiscovered30d: leads30d,
        leadsDiscovered7d: leads7d,
        leadsContacted: contactedLeads,
        outreachMessagesSent: totalOutreach,
        autopilotRuns,
        activeAutopilotWorkflows: autopilotWorkflows,
        activeSubscriptions,
        totalUsers,
        activityEvents7d: recentActivityCount,
        // Breakdowns (safe, aggregate)
        topNiches: nicheBreakdown,
        topSources: sourceBreakdown,
        leadStages: stageBreakdown,
        // Derived metrics
        contactRate: totalLeads > 0 ? Math.round((contactedLeads / totalLeads) * 100) : 0,
        automationActive: autopilotWorkflows > 0,
      },
    });
  } catch (error) {
    console.error('Public stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Stats temporarily unavailable' },
      { status: 500 },
    );
  }
}
