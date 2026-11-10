// AcquisitionOS — Ops Alerting: WhatsApp delivery channel
// Sends OPS alerts via WhatsApp Business Cloud API (Meta).
//
// CONFIGURATION:
//   ALERT_WHATSAPP_TOKEN     — Meta WhatsApp Business access token
//   ALERT_WHATSAPP_PHONE_ID  — Phone Number ID from Meta Business Manager
//   ALERT_WHATSAPP_RECIPIENT — E.164 recipient number (dedicated ops phone/group)
//
// Template (must be approved in Meta Business Manager):
//   Name: acquisitionos_ops_alert
//   Language: en_US
//   Category: UTILITY
//   Body: {{1}} alert: {{2}} on {{3}} ({{4}})
//         Current: {{5}} | Threshold: {{6}}
//         Started: {{7}}
//         Dashboard: {{8}}
//
// PRIVACY: same guarantees as Telegram channel — no PII.

import logger from '@/lib/logger';
import type { OpsAlertPayload } from './telegram-channel';

export type { OpsAlertPayload };

interface WhatsAppDeliveryResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  attempt: number;
}

const WHATSAPP_API_BASE = 'https://graph.facebook.com';
const WHATSAPP_API_VERSION = 'v18.0';
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 800;

function severityTag(severity: OpsAlertPayload['severity']): string {
  const sev: string = severity;
  switch (sev) {
    case 'critical': return 'CRITICAL';
    case 'warning':  return 'WARNING';
    case 'recovery': return 'RECOVERY';
    case 'info':     return 'INFO';
    default:         return sev.toUpperCase();
  }
}

function buildTemplateComponents(payload: OpsAlertPayload): {
  name: string;
  language: { code: string };
  components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }>;
} {
  const env = process.env.ALERT_ENVIRONMENT || process.env.NODE_ENV || 'development';
  const dashboard = payload.dashboardUrl || '(not configured)';
  return {
    name: 'acquisitionos_ops_alert',
    language: { code: 'en_US' },
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: severityTag(payload.severity) },
          { type: 'text', text: payload.alertName.slice(0, 80) },
          { type: 'text', text: payload.component.slice(0, 80) },
          { type: 'text', text: env },
          { type: 'text', text: payload.currentValue.slice(0, 80) },
          { type: 'text', text: payload.threshold.slice(0, 80) },
          { type: 'text', text: payload.startedAt },
          { type: 'text', text: dashboard.slice(0, 200) },
        ],
      },
    ],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredBackoff(attempt: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * base * 0.5;
  return Math.min(base + jitter, 10000);
}

export async function sendOpsAlertToWhatsApp(
  payload: OpsAlertPayload
): Promise<WhatsAppDeliveryResult> {
  const token = process.env.ALERT_WHATSAPP_TOKEN;
  const phoneId = process.env.ALERT_WHATSAPP_PHONE_ID;
  const recipient = process.env.ALERT_WHATSAPP_RECIPIENT;

  if (!token || !phoneId || !recipient) {
    return {
      ok: false,
      attempt: 0,
      error: 'ALERT_WHATSAPP_TOKEN / ALERT_WHATSAPP_PHONE_ID / ALERT_WHATSAPP_RECIPIENT not configured',
    };
  }

  const template = buildTemplateComponents(payload);
  const url = `${WHATSAPP_API_BASE}/${WHATSAPP_API_VERSION}/${phoneId}/messages`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'template',
          template,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') || '2');
        logger.warn('[ops-alert-whatsapp] rate-limited, backing off', undefined, { retryAfter, attempt });
        if (attempt < MAX_RETRIES) {
          await sleep(retryAfter * 1000);
          continue;
        }
        return { ok: false, attempt, error: `rate-limited (retry-after ${retryAfter}s)` };
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => 'unknown error');
        if (errText.includes('template') && errText.includes('not found')) {
          return {
            ok: false,
            attempt,
            error: 'WhatsApp template "acquisitionos_ops_alert" not approved. Approve it in Meta Business Manager → WhatsApp Manager → Templates.',
          };
        }
        if (attempt < MAX_RETRIES) {
          await sleep(jitteredBackoff(attempt));
          continue;
        }
        return { ok: false, attempt, error: `WhatsApp API ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data = await res.json().catch(() => ({}));
      const messageId = data?.messages?.[0]?.id;
      return { ok: true, attempt, messageId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        await sleep(jitteredBackoff(attempt));
        continue;
      }
      return { ok: false, attempt, error: msg };
    }
  }

  return { ok: false, attempt: MAX_RETRIES, error: 'exhausted retries' };
}

export async function sendWhatsAppTestAlert(): Promise<WhatsAppDeliveryResult> {
  return sendOpsAlertToWhatsApp({
    alertName: 'Test Alert',
    severity: 'info',
    component: 'ops-alerting',
    currentValue: 'test',
    threshold: 'n/a',
    startedAt: new Date().toISOString(),
    dedupKey: `test-${Date.now()}`,
    shortSummary: 'Test alert from AcquisitionOS ops-alerting.',
    dashboardUrl: process.env.ALERT_DASHBOARD_URL || undefined,
  });
}
