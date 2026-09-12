// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Alerting Rules
// Phase 11: Observability Infrastructure
//
// Defines alert rules with thresholds:
// - High error rate (>5% of requests)
// - Slow response time (>2s average)
// - Database connection failure
// - High memory usage (>85%)
// - Credit system anomaly detection
// ═══════════════════════════════════════════════════════════════════

import { apiMonitor } from './api-monitor';
import { logger } from './logger';
import { metricsCollector } from './metrics-collector';

// ===== TYPES =====

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertStatus = 'firing' | 'resolved';

export interface Alert {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  threshold: string;
  currentValue: string;
  firedAt: string;
  resolvedAt?: string;
  labels: Record<string, string>;
}

interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  evaluate: () => AlertEvaluationResult;
  cooldownMs: number; // Minimum time between alerts for the same rule
}

interface AlertEvaluationResult {
  firing: boolean;
  currentValue: string;
  threshold: string;
  details?: string;
}

// ===== ALERT STATE =====

const MAX_ALERT_HISTORY = 200;
let activeAlerts: Map<string, Alert> = new Map();
let alertHistory: Alert[] = [];
let lastFireTime: Map<string, number> = new Map();

// ===== ALERT RULES =====

const ALERT_RULES: AlertRule[] = [
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    description: 'More than 5% of API requests are returning errors (4xx/5xx)',
    severity: 'critical',
    cooldownMs: 300000, // 5 minutes
    evaluate: () => {
      const summary = apiMonitor.getSummary();
      const errorRate = summary.errorRate * 100;
      return {
        firing: errorRate > 5 && summary.totalRequests > 10,
        currentValue: `${errorRate.toFixed(2)}%`,
        threshold: '>5%',
        details: `${summary.totalErrors} errors out of ${summary.totalRequests} requests`,
      };
    },
  },
  {
    id: 'slow-response-time',
    name: 'Slow Response Time',
    description: 'Average API response time exceeds 2 seconds',
    severity: 'high',
    cooldownMs: 300000,
    evaluate: () => {
      const summary = apiMonitor.getSummary();
      const avgMs = summary.avgResponseTimeMs;
      return {
        firing: avgMs > 2000 && summary.totalRequests > 5,
        currentValue: `${avgMs.toFixed(0)}ms`,
        threshold: '>2000ms',
        details: summary.slowEndpoints.length > 0
          ? `Slow endpoints: ${summary.slowEndpoints.map(e => `${e.route} (${e.p95Ms}ms p95)`).join(', ')}`
          : undefined,
      };
    },
  },
  {
    id: 'database-connection-failure',
    name: 'Database Connection Failure',
    description: 'Database queries are failing or timing out',
    severity: 'critical',
    cooldownMs: 60000, // 1 minute
    evaluate: () => {
      // Check if we have any 5xx errors on DB-dependent endpoints
      const summary = apiMonitor.getSummary();
      const dbErrorRate = summary.statusCodeDistribution['5xx'];
      const totalRequests = Object.values(summary.statusCodeDistribution).reduce((a, b) => a + b, 0);
      const hasDbIssues = dbErrorRate > 0 && totalRequests > 0 && (dbErrorRate / totalRequests) > 0.1;
      return {
        firing: hasDbIssues,
        currentValue: `${dbErrorRate} server errors`,
        threshold: '<10% server errors',
        details: hasDbIssues ? 'Multiple 5xx errors detected, possible database connectivity issues' : undefined,
      };
    },
  },
  {
    id: 'high-memory-usage',
    name: 'High Memory Usage',
    description: 'Process heap usage exceeds 85% of allocated heap',
    severity: 'high',
    cooldownMs: 300000,
    evaluate: () => {
      const mem = process.memoryUsage();
      const heapUsagePercent = (mem.heapUsed / mem.heapTotal) * 100;
      const rssMB = mem.rss / (1024 * 1024);
      return {
        firing: heapUsagePercent > 85,
        currentValue: `${heapUsagePercent.toFixed(1)}% (${rssMB.toFixed(0)}MB RSS)`,
        threshold: '>85% heap usage',
        details: `Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(0)}MB, RSS: ${rssMB.toFixed(0)}MB`,
      };
    },
  },
  {
    id: 'critical-memory-usage',
    name: 'Critical Memory Usage',
    description: 'Process heap usage exceeds 95% — risk of OOM',
    severity: 'critical',
    cooldownMs: 60000,
    evaluate: () => {
      const mem = process.memoryUsage();
      const heapUsagePercent = (mem.heapUsed / mem.heapTotal) * 100;
      return {
        firing: heapUsagePercent > 95,
        currentValue: `${heapUsagePercent.toFixed(1)}%`,
        threshold: '>95% heap usage',
        details: `Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(0)}MB`,
      };
    },
  },
  {
    id: 'credit-anomaly-detection',
    name: 'Credit System Anomaly',
    description: 'Unusual credit consumption pattern detected',
    severity: 'medium',
    cooldownMs: 600000, // 10 minutes
    evaluate: () => {
      // Check for credit anomalies by looking at the metrics
      const metrics = metricsCollector.getMetrics();
      const creditsConsumed = metrics.counters.find(c => c.name === 'credits_consumed_total');
      const totalCredits = creditsConsumed?.value || 0;
      // Simple anomaly: if more than 1000 credits consumed in the current session
      // In production, this would compare against historical baselines
      return {
        firing: totalCredits > 1000,
        currentValue: `${totalCredits} credits consumed`,
        threshold: '<1000 per session (baseline)',
        details: 'Unusual credit consumption pattern detected. Review recent AI operations.',
      };
    },
  },
  {
    id: 'api-latency-spike',
    name: 'API Latency Spike',
    description: 'P95 response time exceeds 5 seconds',
    severity: 'high',
    cooldownMs: 180000, // 3 minutes
    evaluate: () => {
      const endpointStats = apiMonitor.getAllEndpointStats();
      let maxP95 = 0;
      let worstEndpoint = '';
      for (const stat of endpointStats) {
        if (stat.p95ResponseTimeMs > maxP95) {
          maxP95 = stat.p95ResponseTimeMs;
          worstEndpoint = `${stat.method} ${stat.route}`;
        }
      }
      return {
        firing: maxP95 > 5000,
        currentValue: `${maxP95.toFixed(0)}ms (p95 on ${worstEndpoint})`,
        threshold: '>5000ms p95',
        details: worstEndpoint ? `Worst endpoint: ${worstEndpoint}` : undefined,
      };
    },
  },
  {
    id: 'zero-request-volume',
    name: 'Zero Request Volume',
    description: 'No API requests received in the last 5 minutes (when expected)',
    severity: 'low',
    cooldownMs: 600000,
    evaluate: () => {
      const summary = apiMonitor.getSummary();
      // Only alert if we previously had traffic
      return {
        firing: summary.totalRequests > 100 && summary.requestsPerMinute === 0,
        currentValue: `${summary.requestsPerMinute} req/min`,
        threshold: '>0 req/min',
        details: 'Application may be unreachable or experiencing issues',
      };
    },
  },
];

// ===== ALERT ENGINE =====

class AlertEngine {
  private evaluationInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start periodic alert evaluation.
   */
  start(intervalMs: number = 30000): void {
    if (this.evaluationInterval) return;

    this.evaluationInterval = setInterval(() => {
      this.evaluateAll();
    }, intervalMs);

    // Allow process to exit even with interval running
    if (this.evaluationInterval.unref) {
      this.evaluationInterval.unref();
    }

    logger.info('Alert engine started', undefined, { intervalMs });
  }

  /**
   * Stop periodic alert evaluation.
   */
  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
    logger.info('Alert engine stopped');
  }

  /**
   * Evaluate all alert rules.
   */
  evaluateAll(): Alert[] {
    const now = Date.now();
    const newAlerts: Alert[] = [];

    for (const rule of ALERT_RULES) {
      try {
        const result = rule.evaluate();

        if (result.firing) {
          // Check cooldown
          const lastFire = lastFireTime.get(rule.id) || 0;
          if (now - lastFire < rule.cooldownMs) continue;

          // Check if alert is already active
          const existingAlert = activeAlerts.get(rule.id);
          if (existingAlert && existingAlert.status === 'firing') continue;

          // Create new alert
          const alert: Alert = {
            id: `${rule.id}-${now}`,
            name: rule.name,
            description: rule.description,
            severity: rule.severity,
            status: 'firing',
            threshold: result.threshold,
            currentValue: result.currentValue,
            firedAt: new Date().toISOString(),
            labels: { ruleId: rule.id },
          };

          activeAlerts.set(rule.id, alert);
          alertHistory.push(alert);
          lastFireTime.set(rule.id, now);
          newAlerts.push(alert);

          // Log the alert
          logger.warn(`Alert fired: ${rule.name}`, undefined, {
            alertId: alert.id,
            severity: rule.severity,
            currentValue: result.currentValue,
            threshold: result.threshold,
            details: result.details,
          });

          // Increment anomaly alert counter
          metricsCollector.incrementCounter('anomaly_alerts_total', { rule: rule.id, severity: rule.severity });

        } else {
          // Resolve existing alert if any
          const existingAlert = activeAlerts.get(rule.id);
          if (existingAlert && existingAlert.status === 'firing') {
            existingAlert.status = 'resolved';
            existingAlert.resolvedAt = new Date().toISOString();
            alertHistory.push({ ...existingAlert });
            activeAlerts.delete(rule.id);

            logger.info(`Alert resolved: ${rule.name}`, undefined, {
              alertId: existingAlert.id,
              duration: Date.now() - new Date(existingAlert.firedAt).getTime(),
            });
          }
        }
      } catch (error) {
        logger.error(`Error evaluating alert rule: ${rule.name}`, undefined, { error: error instanceof Error ? error : new Error(String(error)) });
      }
    }

    // Trim alert history
    if (alertHistory.length > MAX_ALERT_HISTORY) {
      alertHistory = alertHistory.slice(-MAX_ALERT_HISTORY);
    }

    return newAlerts;
  }

  /**
   * Get all currently firing alerts.
   */
  getActiveAlerts(): Alert[] {
    return Array.from(activeAlerts.values()).filter(a => a.status === 'firing');
  }

  /**
   * Get alert history (firing + resolved).
   */
  getAlertHistory(count: number = 50): Alert[] {
    return alertHistory.slice(-count);
  }

  /**
   * Get a summary of alert counts by severity.
   */
  getAlertSummary(): Record<AlertSeverity, number> {
    const active = this.getActiveAlerts();
    const summary: Record<AlertSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const alert of active) {
      summary[alert.severity]++;
    }
    return summary;
  }

  /**
   * Get all registered alert rules.
   */
  getRules(): AlertRule[] {
    return [...ALERT_RULES];
  }
}

// ===== SINGLETON EXPORT =====

const globalForAlertEngine = globalThis as unknown as {
  __alertEngine: AlertEngine | undefined;
};

export const alertEngine = globalForAlertEngine.__alertEngine ?? new AlertEngine();

if (process.env.NODE_ENV !== 'production') {
  globalForAlertEngine.__alertEngine = alertEngine;
}

export { AlertEngine, ALERT_RULES };
