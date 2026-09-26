// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Platform Overview API
//
// GET /api/admin/overview
// Aggregated platform-wide statistics for the Admin Dashboard overview
// page. PLATFORM-LEVEL data across ALL tenants — guarded by
// withSuperAdmin (org-level owner/admin roles must never reach this).
// Read-only: performs no writes.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// ─── Helpers ──────────────────────────────────────────────────────────

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

function monthStart(offset = 0): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - offset, 1);
}

function lastMonthEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
}

/** Bucket user signup dates into per-day counts for the last N days. */
function buildSignupTrend(
  signups: { createdAt: Date }[],
  days: number
): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i);
    counts.set(d.toISOString().slice(0, 10), 0);
  }
  for (const s of signups) {
    const key = s.createdAt.toISOString().slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

// ─── GET /api/admin/overview ─────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withSuperAdmin(request, async () => {
    try {
      const now = new Date();
      const d7 = daysAgo(7);
      const d30 = daysAgo(30);
      const thisMonthStart = monthStart(0);
      const lastMonthStart = monthStart(1);
      const lmEnd = lastMonthEnd();

      // ── Users ────────────────────────────────────────────────
      const [
        totalUsers,
        activeUsers,
        verifiedUsers,
        newUsers30d,
        newUsers7d,
        todayUsers,
        usersByRole,
        usersByPlan,
        recentSignupRows,
      ] = await Promise.all([
        db.user.count({ where: { deletedAt: null } }),
        db.user.count({ where: { deletedAt: null, isActive: true } }),
        db.user.count({ where: { deletedAt: null, emailVerified: true } }),
        db.user.count({ where: { deletedAt: null, createdAt: { gte: d30 } } }),
        db.user.count({ where: { deletedAt: null, createdAt: { gte: d7 } } }),
        db.user.count({ where: { deletedAt: null, createdAt: { gte: startOfToday() } } }),
        db.user.groupBy({ by: ['role'], _count: { role: true }, where: { deletedAt: null } }),
        db.user.groupBy({ by: ['plan'], _count: { plan: true }, where: { deletedAt: null } }),
        db.user.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            plan: true,
            isActive: true,
            createdAt: true,
          },
        }),
      ]);

      // Signup trend — last 30 days, bucketed per day in JS (SQLite-safe)
      const signupRows = await db.user.findMany({
        where: { deletedAt: null, createdAt: { gte: d30 } },
        select: { createdAt: true },
      });
      const signupTrend = buildSignupTrend(signupRows, 30);

      // ── Leads ────────────────────────────────────────────────
      const [totalLeads, leads7d, leads30d] = await Promise.all([
        db.lead.count(),
        db.lead.count({ where: { createdAt: { gte: d7 } } }),
        db.lead.count({ where: { createdAt: { gte: d30 } } }),
      ]);

      // ── Workflows & executions ───────────────────────────────
      const [
        workflowDefs,
        execStatusGroups,
        execTotal,
        exec7d,
      ] = await Promise.all([
        db.workflowDefinition.count(),
        db.workflowExecution.groupBy({ by: ['status'], _count: { status: true } }),
        db.workflowExecution.count(),
        db.workflowExecution.count({ where: { startedAt: { gte: d7 } } }),
      ]);
      const execByStatus = execStatusGroups.map((g) => ({
        status: g.status,
        count: g._count.status,
      }));
      const completedExecutions = execByStatus.find((s) => s.status === 'completed')?.count || 0;
      const failedExecutions = execByStatus.find((s) => s.status === 'failed')?.count || 0;
      const runningExecutions = execByStatus.find((s) => s.status === 'running')?.count || 0;
      const finished = completedExecutions + failedExecutions;
      const successRate = finished > 0 ? Math.round((completedExecutions / finished) * 100) : 100;

      // ── Outreach ─────────────────────────────────────────────
      const [totalSequences, totalOutreachMessages] = await Promise.all([
        db.outreachSequence.count(),
        db.outreachMessage.count(),
      ]);

      // ── Billing / revenue ────────────────────────────────────
      const completedThisMonth = await db.paymentOrder.findMany({
        where: { status: 'completed', createdAt: { gte: thisMonthStart } },
        select: { amount: true },
      });
      const completedLastMonth = await db.paymentOrder.findMany({
        where: { status: 'completed', createdAt: { gte: lastMonthStart, lte: lmEnd } },
        select: { amount: true },
      });
      const [revenueAllTime, completedOrders, failedOrders, activeSubscriptions, trialingSubs] =
        await Promise.all([
          db.paymentOrder.aggregate({ _sum: { amount: true }, where: { status: 'completed' } }),
          db.paymentOrder.count({ where: { status: 'completed' } }),
          db.paymentOrder.count({ where: { status: 'failed' } }),
          db.subscription.count({ where: { status: 'active' } }),
          db.subscription.count({ where: { status: 'trialing' } }),
        ]);
      const revenueThisMonth = completedThisMonth.reduce((s, p) => s + p.amount, 0);
      const revenueLastMonth = completedLastMonth.reduce((s, p) => s + p.amount, 0);
      const momChange =
        revenueLastMonth === 0
          ? revenueThisMonth > 0
            ? 100
            : 0
          : Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100);

      // ── Credits ──────────────────────────────────────────────
      const [creditSum, ledgerCount, ledger30d] = await Promise.all([
        db.user.aggregate({ _sum: { credits: true }, where: { deletedAt: null } }),
        db.creditsLedger.count(),
        db.creditsLedger.count({ where: { createdAt: { gte: d30 } } }),
      ]);

      // ── Feedback & system health ─────────────────────────────
      const [feedbackTotal, feedbackOpenGroups, systemUnresolved, systemCritical] =
        await Promise.all([
          db.feedbackReport.count(),
          db.feedbackReport.groupBy({
            by: ['status'],
            _count: { status: true },
            where: { status: { notIn: ['closed', 'released', 'rejected', 'duplicate', 'fixed'] } },
          }),
          db.systemEvent.count({ where: { resolved: false } }),
          db.systemEvent.count({ where: { resolved: false, type: { in: ['critical', 'error'] } } }),
        ]);
      const feedbackOpen = feedbackOpenGroups.reduce((s, g) => s + g._count.status, 0);

      // ── Recent platform activity (audit trail) ───────────────
      const recentAudit = await db.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          createdAt: true,
          user: { select: { email: true, name: true } },
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          generatedAt: now.toISOString(),
          users: {
            total: totalUsers,
            active: activeUsers,
            inactive: totalUsers - activeUsers,
            verified: verifiedUsers,
            newLast7d: newUsers7d,
            newLast30d: newUsers30d,
            today: todayUsers,
            byRole: usersByRole.map((g) => ({ role: g.role, count: g._count.role })),
            byPlan: usersByPlan.map((g) => ({ plan: g.plan, count: g._count.plan })),
          },
          signupTrend,
          leads: { total: totalLeads, last7d: leads7d, last30d: leads30d },
          workflows: {
            definitions: workflowDefs,
            executions: execTotal,
            executionsLast7d: exec7d,
            completed: completedExecutions,
            failed: failedExecutions,
            running: runningExecutions,
            successRate,
            byStatus: execByStatus,
          },
          outreach: { sequences: totalSequences, messages: totalOutreachMessages },
          billing: {
            revenueThisMonth,
            revenueLastMonth,
            momChangePercent: momChange,
            revenueAllTime: revenueAllTime._sum.amount || 0,
            completedOrders,
            failedOrders,
            activeSubscriptions,
            trialingSubscriptions: trialingSubs,
          },
          credits: {
            totalBalance: creditSum._sum.credits || 0,
            ledgerEntries: ledgerCount,
            ledgerLast30d: ledger30d,
          },
          feedback: { total: feedbackTotal, open: feedbackOpen },
          system: { unresolvedEvents: systemUnresolved, criticalEvents: systemCritical },
          recentSignups: recentSignupRows,
          recentAudit,
        },
      });
    } catch (error) {
      console.error('Admin overview error:', error);
      return NextResponse.json(
        { error: 'Failed to load platform overview' },
        { status: 500 }
      );
    }
  });
}
