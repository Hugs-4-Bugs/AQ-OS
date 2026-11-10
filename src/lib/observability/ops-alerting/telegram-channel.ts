// AcquisitionOS — Ops Alerting: Telegram delivery channel
// Sends OPS alerts (NOT user-facing notifications) to a dedicated Telegram
// chat via the Telegram Bot API.
//
// CONFIGURATION:
//   ALERT_TELEGRAM_BOT_TOKEN — Bot token from @BotFather
//   ALERT_TELEGRAM_CHAT_ID   — Target chat ID
//   ALERT_ENVIRONMENT        — Environment label
//   ALERT_APP_NAME           — Application identifier (default: acquisitionos)
//
// PRIVACY: Messages contain ONLY app name, env, alert name, severity,
// component, current value, threshold, start time, duration, dashboard link.
// NEVER: email, user IDs, tenant IDs, API keys, tokens, prompts, message
// bodies, IP addresses, stack traces.

import logger from '@/lib/logger';

export interface OpsAlertPayload {
  alertName: string;
  severity: 'critical' | 'warning' | 'recovery' | 'info';
  component: string;
  currentValue: string;
  threshold: string;
  startedAt: string;
  durationSeconds?: number;
  dashboardUrl?: string;
  dedupKey: string;
  shortSummary?: string;
}

interface TelegramDeliveryResult {
  ok: boolean;
  messageId?: number;
  error?: string;
  attempt: number;
}

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const MAX_MESSAGE_LENGTH = 4096;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function severityEmoji(severity: OpsAlertPayload['severity']): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'warning':  return '🟡';
    case 'recovery': return '🟢';
    case 'info':     return '🔵';
    default:         return '⚪';
  }
}

function severityLabel(severity: OpsAlertPayload['severity']): string {
  const sev: string = severity;
  return sev.toUpperCase();
}

function buildMessage(payload: OpsAlertPayload): string {
  const appName = process.env.ALERT_APP_NAME || 'acquisitionos';
  const env = process.env.ALERT_ENVIRONMENT || process.env.NODE_ENV || 'development';
  const lines: string[] = [];

  lines.push(`${severityEmoji(payload.severity)} *${escapeMarkdownV2(appName)}* \\[${escapeMarkdownV2(env)}\\]`);
  lines.push(`*Alert:* ${escapeMarkdownV2(payload.alertName)}`);
  lines.push(`*Severity:* ${escapeMarkdownV2(severityLabel(payload.severity))}`);
  lines.push(`*Component:* ${escapeMarkdownV2(payload.component)}`);
  lines.push(`*Current:* ${escapeMarkdownV2(payload.currentValue)}`);
  lines.push(`*Threshold:* ${escapeMarkdownV2(payload.threshold)}`);
  lines.push(`*Started:* ${escapeMarkdownV2(payload.startedAt)}`);
  if (payload.durationSeconds !== undefined) {
    lines.push(`*Duration:* ${escapeMarkdownV2(formatDuration(payload.durationSeconds))}`);
  }
  if (payload.shortSummary) {
    lines.push(`*Summary:* ${escapeMarkdownV2(payload.shortSummary)}`);
  }
  if (payload.dashboardUrl) {
    lines.push(`*Dashboard:* ${escapeMarkdownV2(payload.dashboardUrl)}`);
  }
  lines.push(`*DedupKey:* \`${escapeMarkdownV2(payload.dedupKey)}\``);

  return lines.join('\n');
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function truncateForTelegram(message: string): string {
  if (message.length <= MAX_MESSAGE_LENGTH) return message;
  const marker = '\n\\.\\.\\.\\(truncated\\)';
  return message.slice(0, MAX_MESSAGE_LENGTH - marker.length) + marker;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredBackoff(attempt: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * base * 0.5;
  return Math.min(base + jitter, 8000);
}

export async function sendOpsAlertToTelegram(
  payload: OpsAlertPayload
): Promise<TelegramDeliveryResult> {
  const botToken = process.env.ALERT_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return {
      ok: false,
      attempt: 0,
      error: 'ALERT_TELEGRAM_BOT_TOKEN or ALERT_TELEGRAM_CHAT_ID not configured',
    };
  }

  const message = truncateForTelegram(buildMessage(payload));

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') || '1');
        logger.warn('[ops-alert-telegram] rate-limited, backing off', undefined, { retryAfter, attempt });
        if (attempt < MAX_RETRIES) {
          await sleep(retryAfter * 1000);
          continue;
        }
        return { ok: false, attempt, error: `rate-limited (retry-after ${retryAfter}s)` };
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => 'unknown error');
        if (attempt < MAX_RETRIES) {
          await sleep(jitteredBackoff(attempt));
          continue;
        }
        return { ok: false, attempt, error: `Telegram API ${res.status}: ${errText}` };
      }

      const data = await res.json().catch(() => ({}));
      return { ok: true, attempt, messageId: data?.result?.message_id };
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

export async function sendTelegramTestAlert(): Promise<TelegramDeliveryResult> {
  return sendOpsAlertToTelegram({
    alertName: 'Test Alert',
    severity: 'info',
    component: 'ops-alerting',
    currentValue: 'test',
    threshold: 'n/a',
    startedAt: new Date().toISOString(),
    dedupKey: `test-${Date.now()}`,
    shortSummary: 'This is a test alert from AcquisitionOS ops-alerting. If you received this, Telegram delivery is working.',
    dashboardUrl: process.env.ALERT_DASHBOARD_URL || undefined,
  });
}
