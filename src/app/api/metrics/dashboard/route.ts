// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Metrics Dashboard API
// Phase 11: Observability Infrastructure
// GET /api/metrics/dashboard — Returns comprehensive observability data
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth-middleware';
import { db, dbMonitor, getConnectionPoolStats } from '@/lib/db';
import { apiMonitor } from '@/lib/observability/api-monitor';
import { alertEngine } from '@/lib/observability/alerts';
import { logger } from '@/lib/observability/logger';
import { getRecentTraces } from '@/lib/observability/tracer';

export async function GET(request: NextRequest) {
  return withAdmin(request, async () => {
  try {
    // ── System Health Metrics ────────────────────────────────────
    const mem = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptimeSeconds = process.uptime();

    const systemHealth = {
      uptime: uptimeSeconds,
      uptimeFormatted: formatUptime(uptimeSeconds),
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapUsagePercent: Math.round((mem.heapUsed / mem.heapTotal) * 10000) / 100,
        external: Math.round(mem.external / 1024 / 1024),
        arrayBuffers: Math.round(mem.arrayBuffers / 1024 / 1024),
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000),
        system: Math.round(cpuUsage.system / 1000),
      },
      nodeVersion: process.version,
      pid: process.pid,
      environment: process.env.NODE_ENV || 'development',
    };

    // ── Connection Pool ──────────────────────────────────────────
    const connectionPool = getConnectionPoolStats();

    // ── Application Metrics ──────────────────────────────────────
    const apiSummary = apiMonitor.getSummary();
    const endpointStats = apiMonitor.getAllEndpointStats();
    const requestVolumeTimeline = apiMonitor.getRequestVolumeTimeline();

    const applicationMetrics = {
      requests: {
        total: apiSummary.totalRequests,
        errors: apiSummary.totalErrors,
        errorRate: Math.round(apiSummary.errorRate * 10000) / 100,
        requestsPerMinute: apiSummary.requestsPerMinute,
        avgResponseTimeMs: apiSummary.avgResponseTimeMs,
        statusCodeDistribution: apiSummary.statusCodeDistribution,
      },
      slowEndpoints: apiSummary.slowEndpoints,
      requestVolumeTimeline,
      topEndpoints: endpointStats
        .sort((a, b) => b.totalRequests - a.totalRequests)
        .slice(0, 10)
        .map(s => ({
          route: s.route,
          method: s.method,
          avgMs: Math.round(s.avgResponseTimeMs),
          p95Ms: Math.round(s.p95ResponseTimeMs),
          p99Ms: Math.round(s.p99ResponseTimeMs),
          errorRate: Math.round(s.errorRate * 10000) / 100,
        })),
    };

    // ── Database Metrics ─────────────────────────────────────────
    const dbStats = dbMonitor.getStats();
    const dbMetrics = {
      totalQueries: dbStats.totalQueries,
      slowQueries: dbStats.slowQueries,
      avgQueryTimeMs: Math.round(dbStats.avgQueryTimeMs * 100) / 100,
      queriesByOperation: dbMonitor.getQueryCountByOperation(),
      recentSlowQueries: dbMonitor.getRecentSlowQueries(10),
      connectionPool,
    };

    // ── Business Metrics ─────────────────────────────────────────
    let businessMetrics = {
      totalLeads: 0,
      activeLeads: 0,
      totalDeals: 0,
      wonDeals: 0,
      totalDealValue: 0,
      activeUsers: 0,
      totalCredits: 0,
      creditsConsumedToday: 0,
      activeWorkflows: 0,
    };

    try {
      const [
        totalLeads,
        activeLeads,
        totalDeals,
        wonDeals,
        dealValueAgg,
        activeUsers,
        creditAgg,
        creditsToday,
        activeWorkflows,
      ] = await Promise.all([
        db.lead.count(),
        db.lead.count({ where: { isActive: true } }),
        db.deal.count(),
        db.deal.count({ where: { status: 'won' } }),
        db.deal.aggregate({ _sum: { finalPrice: true }, where: { status: 'won' } }),
        db.user.count({ where: { isActive: true, deletedAt: null } }),
        db.user.aggregate({ _sum: { credits: true }, where: { isActive: true, deletedAt: null } }),
        db.creditsLedger.aggregate({
          _sum: { credits: true },
          where: {
            credits: { lt: 0 },
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        }),
        db.workflowExecution.count({ where: { status: 'running' } }),
      ]);

      businessMetrics = {
        totalLeads,
        activeLeads,
        totalDeals,
        wonDeals,
        totalDealValue: dealValueAgg._sum.finalPrice || 0,
        activeUsers,
        totalCredits: creditAgg._sum.credits || 0,
        creditsConsumedToday: Math.abs(creditsToday._sum.credits || 0),
        activeWorkflows,
      };
    } catch {
      // Business metrics are best-effort
    }

    // ── Alerts ───────────────────────────────────────────────────
    const activeAlerts = alertEngine.getActiveAlerts();
    const alertHistory = alertEngine.getAlertHistory(20);
    const alertSummary = alertEngine.getAlertSummary();

    // ── Recent Logs ──────────────────────────────────────────────
    // The core logger does not buffer entries in memory — use empty
    // structures so the dashboard payload shape stays intact.
    const recentLogs: Array<Record<string, unknown>> = [];
    const logCounts: Record<string, number> = { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 };

    // ── Recent Traces ────────────────────────────────────────────
    const recentTraces = getRecentTraces(10);

    // ── Compose Response ─────────────────────────────────────────
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      systemHealth,
      applicationMetrics,
      dbMetrics,
      businessMetrics,
      alerts: {
        active: activeAlerts,
        history: alertHistory,
        summary: alertSummary,
      },
      logs: {
        recent: recentLogs,
        counts: logCounts,
      },
      traces: recentTraces.map(t => ({
        traceId: t.traceId,
        rootOperation: t.rootOperation,
        spanCount: t.spanCount,
        totalDurationMs: t.totalDurationMs,
        status: t.status,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to collect dashboard metrics', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
  });
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}