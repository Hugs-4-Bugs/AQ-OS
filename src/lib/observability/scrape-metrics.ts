// AcquisitionOS — Privacy-safe scrape metrics
// Adds low-cardinality gauges derived from DB aggregates so the Prometheus
// /api/metrics/scrape endpoint can expose business-level SLO metrics WITHOUT
// requiring super_admin auth.
//
// PRIVACY GUARANTEE (DPDP): Every gauge is an integer COUNT or numeric SUM.
// No email, name, IP, prompt, or message body is emitted as a metric value
// or label. Labels are strictly limited to category enums.

import type { PrismaClient } from '@prisma/client';
import { metricsCollector } from './metrics-collector';

const scrapeState = { devWarned: false };

export async function collectScrapeSafeMetrics(db: PrismaClient): Promise<void> {
  const safe = <T>(p: Promise<T>, label: string, fallback: T): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((resolve) =>
        setTimeout(() => {
          console.warn(`[scrape-metrics] ${label} timed out — emitting fallback`);
          resolve(fallback);
        }, 2000)
      ),
    ]).catch((err) => {
      console.warn(`[scrape-metrics] ${label} failed:`, err instanceof Error ? err.message : err);
      return fallback;
    });

  const [
    activeUsers,
    totalLeads,
    runningWorkflows,
    queuedWorkflows,
    paymentSuccess,
    paymentFailed,
    aiCost,
    activeSessions,
  ] = await Promise.all([
    safe(db.user.count({ where: { isActive: true, deletedAt: null } }), 'active_users', 0),
    safe(db.lead.count({ where: { isActive: true } }), 'total_leads', 0),
    safe(db.workflowExecution.count({ where: { status: 'running' } }), 'running_workflows', 0),
    safe(db.workflowExecution.count({ where: { status: { in: ['queued', 'waiting', 'pending'] } } }), 'queued_workflows', 0),
    safe(db.paymentOrder.count({ where: { status: 'completed' } }), 'payment_success', 0),
    safe(db.paymentOrder.count({ where: { status: 'failed' } }), 'payment_failed', 0),
    safe(db.aiCostRecord.aggregate({ _sum: { costUsd: true } }).then((r) => r._sum.costUsd || 0), 'ai_cost', 0),
    safe(db.userSession.count({ where: { isRevoked: false, expiresAt: { gt: new Date() } } }), 'active_sessions', 0),
  ]);

  metricsCollector.setGauge('active_users_total', undefined, activeUsers);
  metricsCollector.setGauge('total_leads_total', undefined, totalLeads);
  metricsCollector.setGauge('total_workflows_running', undefined, runningWorkflows);
  metricsCollector.setGauge('total_queue_backlog', undefined, queuedWorkflows);
  metricsCollector.setGauge('total_payment_success_count', undefined, paymentSuccess);
  metricsCollector.setGauge('total_payment_failed_count', undefined, paymentFailed);
  metricsCollector.setGauge('total_ai_cost_usd', undefined, Number(aiCost.toFixed(6)));
  metricsCollector.setGauge('total_open_sessions', undefined, activeSessions);
}

export const scrapeMetricsState = scrapeState;
