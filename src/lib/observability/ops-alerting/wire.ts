// AcquisitionOS — Ops Alerting: Wire
// Bridges the existing AlertEngine to the ops-alerting dispatcher so that
// fired alerts are delivered via Telegram + WhatsApp.
// Monkey-patches evaluateAll() to intercept newly-fired alerts.

import type { AlertEngine, Alert } from '@/lib/observability/alerts';
import { dispatchOpsAlert, checkEscalation } from './dispatcher';
import type { OpsAlertPayload } from './telegram-channel';
import logger from '@/lib/logger';

let wired = false;

function mapSeverity(alertSeverity: Alert['severity']): OpsAlertPayload['severity'] {
  switch (alertSeverity) {
    case 'critical': return 'critical';
    case 'high':     return 'warning';
    case 'medium':   return 'warning';
    case 'low':      return 'info';
    case 'info':     return 'info';
    default:         return 'info';
  }
}

function alertToPayload(alert: Alert): OpsAlertPayload {
  const dashboardUrl = process.env.ALERT_DASHBOARD_URL || undefined;
  return {
    alertName: alert.name,
    severity: mapSeverity(alert.severity),
    component: alert.labels?.ruleId || alert.name,
    currentValue: alert.currentValue,
    threshold: alert.threshold,
    startedAt: alert.firedAt,
    dedupKey: alert.labels?.ruleId || alert.id,
    dashboardUrl,
    shortSummary: alert.description,
  };
}

export function wireOpsAlertDispatchers(engine: AlertEngine): void {
  if (wired) {
    logger.info('Ops alert dispatchers already wired — skipping');
    return;
  }
  wired = true;

  const originalEvaluateAll = engine.evaluateAll.bind(engine);
  engine.evaluateAll = function patchedEvaluateAll(): Alert[] {
    const newAlerts = originalEvaluateAll();
    for (const alert of newAlerts) {
      try {
        const payload = alertToPayload(alert);
        const escalated = checkEscalation(payload);
        if (!escalated) {
          dispatchOpsAlert(payload);
        }
      } catch (err) {
        logger.error('Failed to dispatch ops alert', undefined, {
          alertId: alert.id,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }

    try {
      const history = engine.getAlertHistory(50);
      const recentlyResolved = history.filter(
        (a) =>
          a.status === 'resolved' &&
          a.resolvedAt &&
          Date.now() - new Date(a.resolvedAt).getTime() < 35_000
      );
      for (const resolved of recentlyResolved) {
        const recoveryPayload: OpsAlertPayload = {
          ...alertToPayload(resolved),
          severity: 'recovery',
          currentValue: 'resolved',
          durationSeconds: resolved.resolvedAt
            ? Math.round((new Date(resolved.resolvedAt).getTime() - new Date(resolved.firedAt).getTime()) / 1000)
            : undefined,
        };
        dispatchOpsAlert(recoveryPayload);
      }
    } catch (err) {
      logger.warn('Failed to emit recovery notifications', undefined, {
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }

    return newAlerts;
  };

  logger.info('Ops alert dispatchers wired to AlertEngine', undefined, {
    telegram: Boolean(process.env.ALERT_TELEGRAM_BOT_TOKEN),
    whatsapp: Boolean(process.env.ALERT_WHATSAPP_TOKEN),
    dashboard: process.env.ALERT_DASHBOARD_URL || '(not set)',
  });
}

export function isWired(): boolean {
  return wired;
}

export function _resetWire(): void {
  wired = false;
}
