// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Prometheus Metrics Endpoint
// Phase 14.2: Observability Infrastructure
// GET /api/metrics — Returns Prometheus-format metrics
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { metricsCollector } from '@/lib/observability/metrics-collector';
import { db } from '@/lib/db';

async function collectDatabaseMetrics(): Promise<void> {
  try {
    const start = performance.now();

    // Count users
    const activeUsers = await db.user.count({
      where: { isActive: true, deletedAt: null },
    });
    metricsCollector.setGauge('active_users', undefined, activeUsers);

    // Count total credits remaining
    const creditAggregate = await db.user.aggregate({
      _sum: { credits: true },
      where: { isActive: true, deletedAt: null },
    });
    metricsCollector.setGauge('credits_remaining', undefined, creditAggregate._sum.credits || 0);

    // Count leads
    const leadCount = await db.lead.count({
      where: { isActive: true },
    });
    metricsCollector.incrementCounter('api_requests_total', { route: '/metrics' }, 0);

    // Workflow execution stats
    const runningWorkflows = await db.workflowExecution.count({
      where: { status: 'running' },
    });
    metricsCollector.setGauge('queue_depth', undefined, runningWorkflows);

    // Active sessions as websocket proxy
    const activeSessions = await db.userSession.count({
      where: { isRevoked: false, expiresAt: { gt: new Date() } },
    });
    metricsCollector.setGauge('websocket_connections', undefined, activeSessions);

    // Payment stats
    const paymentSuccess = await db.paymentOrder.count({
      where: { status: 'completed' },
    });
    const paymentFailed = await db.paymentOrder.count({
      where: { status: 'failed' },
    });
    metricsCollector.setGauge('payment_success_total', undefined, paymentSuccess);
    metricsCollector.setGauge('payment_failures_total', undefined, paymentFailed);

    // AI cost tracking
    const aiCostAggregate = await db.aiCostRecord.aggregate({
      _sum: { costUsd: true },
    });
    metricsCollector.setGauge('ai_cost_total', undefined, aiCostAggregate._sum.costUsd || 0);

    // Measure DB query duration
    const dbDuration = (performance.now() - start) / 1000;
    metricsCollector.observeHistogram('db_query_duration_seconds', { operation: 'metrics_collection' }, dbDuration);
  } catch (error) {
    console.error('Failed to collect database metrics:', error);
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    // Collect real data from the database
    await collectDatabaseMetrics();

    // Generate Prometheus text format output
    const output = metricsCollector.toPrometheusFormat();

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Metrics endpoint error:', error);
    return new NextResponse('# Error collecting metrics\n', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
