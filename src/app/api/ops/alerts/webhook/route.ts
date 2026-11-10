// AcquisitionOS — POST /api/ops/alerts/webhook
// Receives Alertmanager webhook notifications and dispatches them through
// the ops-alerting dispatcher (Telegram + WhatsApp).
//
// AUTHENTICATION: Bearer token from OPS_ALERT_WEBHOOK_TOKEN env var.
// PRIVACY: sanitizes incoming Alertmanager labels — drops user/email/ip/
// prompt/token/secret/password/apiKey/filename/leadId, truncates annotations.

import { NextRequest, NextResponse } from 'next/server';
import { dispatchOpsAlert } from '@/lib/observability/ops-alerting/dispatcher';
import type { OpsAlertPayload } from '@/lib/observability/ops-alerting/telegram-channel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SENSITIVE_LABEL_PATTERNS = [
  /^user$/i, /^userId$/i, /^user_id$/i, /^email$/i, /^tenantId$/i, /^tenant_id$/i,
  /^ip$/i, /^ipAddress$/i, /^clientIp$/i, /^prompt$/i, /^token$/i, /^secret$/i,
  /^password$/i, /^apiKey$/i, /^api_key$/i, /^filename$/i, /^fileName$/i,
  /^conversationId$/i, /^leadId$/i, /^lead_id$/i,
];

interface AlertmanagerAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  generatorURL: string;
  fingerprint: string;
}

interface AlertmanagerWebhookPayload {
  version: string;
  groupKey: string;
  status: string;
  receiver: string;
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
  alerts: AlertmanagerAlert[];
}

function sanitizeLabels(labels: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels)) {
    if (SENSITIVE_LABEL_PATTERNS.some((p) => p.test(k))) continue;
    out[k] = v.slice(0, 100);
  }
  return out;
}

function truncate(text: string, max: number = 200): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

function mapSeverity(status: string, labels: Record<string, string>): OpsAlertPayload['severity'] {
  if (status === 'resolved') return 'recovery';
  const sev = labels.severity?.toLowerCase();
  if (sev === 'critical') return 'critical';
  if (sev === 'warning') return 'warning';
  return 'info';
}

function authenticate(request: NextRequest): { ok: true } | { ok: false; reason: string } {
  const configured = process.env.OPS_ALERT_WEBHOOK_TOKEN;
  const isProd = process.env.NODE_ENV === 'production';

  if (!configured) {
    if (isProd) return { ok: false, reason: 'OPS_ALERT_WEBHOOK_TOKEN not configured' };
    return { ok: true };
  }

  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, reason: 'no bearer token' };

  const presented = Buffer.from(match[1]);
  const expected = Buffer.from(configured);
  if (presented.length !== expected.length) return { ok: false, reason: 'token length mismatch' };
  let diff = 0;
  for (let i = 0; i < presented.length; i++) diff |= presented[i] ^ expected[i];
  return diff === 0 ? { ok: true } : { ok: false, reason: 'token mismatch' };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = authenticate(request);
  if (!auth.ok) {
    return new NextResponse('Unauthorized\n', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer realm="acquisitionos-alerts"' },
    });
  }

  let payload: AlertmanagerWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  if (!payload.alerts || !Array.isArray(payload.alerts)) {
    return NextResponse.json({ ok: false, error: 'no alerts array' }, { status: 400 });
  }

  const dispatched: string[] = [];
  for (const alert of payload.alerts) {
    const sanitizedLabels = sanitizeLabels(alert.labels);
    const dedupKey = alert.fingerprint || `${sanitizedLabels.alertname}-${sanitizedLabels.component}`;
    const opsPayload: OpsAlertPayload = {
      alertName: sanitizedLabels.alertname || 'Unknown Alert',
      severity: mapSeverity(alert.status, sanitizedLabels),
      component: sanitizedLabels.component || 'unknown',
      currentValue: truncate(alert.annotations?.currentValue || sanitizedLabels.severity || 'n/a'),
      threshold: truncate(alert.annotations?.threshold || 'n/a'),
      startedAt: alert.startsAt,
      ...(alert.status === 'resolved' && alert.endsAt
        ? {
            durationSeconds: Math.max(
              0,
              Math.round((new Date(alert.endsAt).getTime() - new Date(alert.startsAt).getTime()) / 1000)
            ),
          }
        : {}),
      dedupKey,
      shortSummary: truncate(alert.annotations?.description || alert.annotations?.summary || '', 200),
      dashboardUrl: alert.generatorURL || process.env.ALERT_DASHBOARD_URL || undefined,
    };
    dispatchOpsAlert(opsPayload);
    dispatched.push(dedupKey);
  }

  return NextResponse.json(
    {
      ok: true,
      timestamp: new Date().toISOString(),
      received: payload.alerts.length,
      dispatched: dispatched.length,
      dedupKeys: dispatched,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: true, service: 'acquisitionos-alert-webhook', timestamp: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
