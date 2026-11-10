// AcquisitionOS — Ops Alerting: Dispatcher
// Receives AlertEngine events and dispatches them to Telegram + WhatsApp
// with deduplication, grouping, escalation, and delivery audit.

import { sendOpsAlertToTelegram } from './telegram-channel';
import { sendOpsAlertToWhatsApp } from './whatsapp-channel';
import type { OpsAlertPayload } from './telegram-channel';
import logger from '@/lib/logger';

const DEDUP_COOLDOWN_MS: Record<OpsAlertPayload['severity'], number> = {
  critical: 5 * 60 * 1000,
  warning: 15 * 60 * 1000,
  recovery: 30 * 60 * 1000,
  info: 60 * 60 * 1000,
};

const dedupState = new Map<string, number>();

interface DeliveryAuditEntry {
  timestamp: string;
  dedupKey: string;
  alertName: string;
  severity: OpsAlertPayload['severity'];
  telegram: { ok: boolean; error?: string; attempt: number } | null;
  whatsapp: { ok: boolean; error?: string; attempt: number } | null;
  suppressed: boolean;
}

const AUDIT_MAX = 200;
const deliveryAudit: DeliveryAuditEntry[] = [];

const GROUPING_WINDOW_MS = 30_000;
interface PendingGroup {
  severity: OpsAlertPayload['severity'];
  firstPayload: OpsAlertPayload;
  allPayloads: OpsAlertPayload[];
  flushAt: number;
}
const pendingGroups = new Map<string, PendingGroup>();

let flushTimer: ReturnType<typeof setInterval> | null = null;

const ESCALATION_MS = 30 * 60 * 1000;
const escalationState = new Map<string, number>();

const acknowledgedAlerts = new Set<string>();

function shouldSuppress(payload: OpsAlertPayload): boolean {
  const last = dedupState.get(payload.dedupKey);
  if (!last) return false;
  const cooldown = DEDUP_COOLDOWN_MS[payload.severity] ?? 15 * 60 * 1000;
  return Date.now() - last < cooldown;
}

function markSent(payload: OpsAlertPayload): void {
  dedupState.set(payload.dedupKey, Date.now());
  if (dedupState.size > 500) {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [k, ts] of dedupState.entries()) {
      if (ts < cutoff) dedupState.delete(k);
    }
  }
}

async function deliverImmediate(payload: OpsAlertPayload): Promise<void> {
  const sendTelegram = ['critical', 'warning', 'recovery', 'info'].includes(payload.severity);
  const sendWhatsApp = ['critical', 'recovery'].includes(payload.severity);

  let telegramResult: DeliveryAuditEntry['telegram'] = null;
  let whatsappResult: DeliveryAuditEntry['whatsapp'] = null;

  if (sendTelegram) {
    const r = await sendOpsAlertToTelegram(payload);
    telegramResult = { ok: r.ok, error: r.error, attempt: r.attempt };
    if (!r.ok) {
      logger.error('Ops alert delivery to Telegram failed', undefined, {
        alertName: payload.alertName,
        error: r.error,
      });
    }
  }

  if (sendWhatsApp) {
    const r = await sendOpsAlertToWhatsApp(payload);
    whatsappResult = { ok: r.ok, error: r.error, attempt: r.attempt };
    if (!r.ok) {
      logger.warn('Ops alert delivery to WhatsApp failed', undefined, {
        alertName: payload.alertName,
        error: r.error,
      });
    }
  }

  deliveryAudit.push({
    timestamp: new Date().toISOString(),
    dedupKey: payload.dedupKey,
    alertName: payload.alertName,
    severity: payload.severity,
    telegram: telegramResult,
    whatsapp: whatsappResult,
    suppressed: false,
  });
  if (deliveryAudit.length > AUDIT_MAX) {
    deliveryAudit.splice(0, deliveryAudit.length - AUDIT_MAX);
  }
}

async function flushPendingGroups(): Promise<void> {
  const now = Date.now();
  const due: PendingGroup[] = [];
  for (const [key, group] of pendingGroups.entries()) {
    if (now >= group.flushAt) {
      due.push(group);
      pendingGroups.delete(key);
    }
  }
  for (const group of due) {
    if (group.allPayloads.length === 1) {
      await deliverImmediate(group.firstPayload);
    } else {
      const merged: OpsAlertPayload = {
        alertName: `${group.allPayloads.length} alerts fired`,
        severity: group.severity,
        component: 'multiple',
        currentValue: `${group.allPayloads.length} active`,
        threshold: 'grouped within 30s',
        startedAt: group.firstPayload.startedAt,
        dashboardUrl: group.firstPayload.dashboardUrl,
        dedupKey: `group-${group.severity}-${now}`,
        shortSummary: group.allPayloads.slice(0, 5).map((p) => p.alertName).join('; ') +
          (group.allPayloads.length > 5 ? ` (+${group.allPayloads.length - 5} more)` : ''),
      };
      await deliverImmediate(merged);
    }
  }
}

export function dispatchOpsAlert(payload: OpsAlertPayload): void {
  void (async (): Promise<void> => {
    if (shouldSuppress(payload)) {
      deliveryAudit.push({
        timestamp: new Date().toISOString(),
        dedupKey: payload.dedupKey,
        alertName: payload.alertName,
        severity: payload.severity,
        telegram: null,
        whatsapp: null,
        suppressed: true,
      });
      if (deliveryAudit.length > AUDIT_MAX) {
        deliveryAudit.splice(0, deliveryAudit.length - AUDIT_MAX);
      }
      return;
    }

    const key = payload.severity;
    const existing = pendingGroups.get(key);
    if (existing) {
      existing.allPayloads.push(payload);
      return;
    }
    pendingGroups.set(key, {
      severity: payload.severity,
      firstPayload: payload,
      allPayloads: [payload],
      flushAt: Date.now() + GROUPING_WINDOW_MS,
    });

    markSent(payload);

    if (!flushTimer) {
      flushTimer = setInterval(() => {
        void flushPendingGroups();
      }, 5000);
      flushTimer.unref?.();
    }
  })().catch((err) => {
    logger.error('dispatchOpsAlert failed', undefined, {
      error: err instanceof Error ? err : new Error(String(err)),
    });
  });
}

export function checkEscalation(payload: OpsAlertPayload): boolean {
  const now = Date.now();
  const firstFired = escalationState.get(payload.dedupKey);
  if (!firstFired) {
    escalationState.set(payload.dedupKey, now);
    return false;
  }
  if (now - firstFired > ESCALATION_MS) {
    escalationState.set(payload.dedupKey, now);
    dedupState.delete(payload.dedupKey);
    void deliverImmediate({
      ...payload,
      severity: 'critical',
      shortSummary: `[ESCALATED] still firing after ${Math.round((now - firstFired) / 60000)} min`,
    });
    return true;
  }
  return false;
}

export function acknowledgeAlert(dedupKey: string): void {
  acknowledgedAlerts.add(dedupKey);
}
export function isAcknowledged(dedupKey: string): boolean {
  return acknowledgedAlerts.has(dedupKey);
}
export function clearAcknowledgement(dedupKey: string): void {
  acknowledgedAlerts.delete(dedupKey);
}

export function getDeliveryAudit(limit: number = 50): DeliveryAuditEntry[] {
  return deliveryAudit.slice(-limit);
}

export function getPendingGroupCount(): number {
  return pendingGroups.size;
}

export function getDedupStateSize(): number {
  return dedupState.size;
}

export function _resetDispatcher(): void {
  dedupState.clear();
  pendingGroups.clear();
  escalationState.clear();
  acknowledgedAlerts.clear();
  deliveryAudit.length = 0;
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
