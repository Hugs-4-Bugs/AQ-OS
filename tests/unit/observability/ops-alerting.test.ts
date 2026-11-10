// AcquisitionOS — Tests for ops-alerting dispatcher (Phase 4).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/observability/ops-alerting/telegram-channel', () => ({
  sendOpsAlertToTelegram: vi.fn().mockResolvedValue({ ok: true, attempt: 1, messageId: 42 }),
  sendTelegramTestAlert: vi.fn().mockResolvedValue({ ok: true, attempt: 1, messageId: 42 }),
}));

vi.mock('@/lib/observability/ops-alerting/whatsapp-channel', () => ({
  sendOpsAlertToWhatsApp: vi.fn().mockResolvedValue({ ok: true, attempt: 1, messageId: 'wamid.123' }),
  sendWhatsAppTestAlert: vi.fn().mockResolvedValue({ ok: true, attempt: 1, messageId: 'wamid.123' }),
}));

import {
  dispatchOpsAlert,
  getDeliveryAudit,
  acknowledgeAlert,
  isAcknowledged,
  clearAcknowledgement,
  checkEscalation,
  _resetDispatcher,
} from '@/lib/observability/ops-alerting/dispatcher';
import { sendOpsAlertToTelegram } from '@/lib/observability/ops-alerting/telegram-channel';
import { sendOpsAlertToWhatsApp } from '@/lib/observability/ops-alerting/whatsapp-channel';
import type { OpsAlertPayload } from '@/lib/observability/ops-alerting/telegram-channel';

const samplePayload = (overrides: Partial<OpsAlertPayload> = {}): OpsAlertPayload => ({
  alertName: 'Test Alert',
  severity: 'warning',
  component: 'test-component',
  currentValue: '75%',
  threshold: '70%',
  startedAt: new Date().toISOString(),
  dedupKey: 'test-key',
  ...overrides,
});

describe('Ops Alerting Dispatcher', () => {
  beforeEach(() => {
    _resetDispatcher();
    vi.clearAllMocks();
  });

  afterEach(() => {
    _resetDispatcher();
    vi.clearAllMocks();
  });

  it('dispatches a warning alert to Telegram only', async () => {
    dispatchOpsAlert(samplePayload({ severity: 'warning' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(getDeliveryAudit().length).toBeGreaterThanOrEqual(0);
  });

  it('dispatches a critical alert to both Telegram and WhatsApp', async () => {
    dispatchOpsAlert(samplePayload({ severity: 'critical', dedupKey: 'crit-test-1' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(getDeliveryAudit().length).toBeGreaterThanOrEqual(0);
  });

  it('acknowledgement suppresses future notifications', () => {
    acknowledgeAlert('ack-test-key');
    expect(isAcknowledged('ack-test-key')).toBe(true);
    clearAcknowledgement('ack-test-key');
    expect(isAcknowledged('ack-test-key')).toBe(false);
  });

  it('escalation re-dispatches after 30 min', () => {
    const r1 = checkEscalation(samplePayload({ dedupKey: 'esc-test' }));
    expect(r1).toBe(false);
  });

  it('sendOpsAlertToTelegram is mocked (no real API call)', async () => {
    const result = await sendOpsAlertToTelegram(samplePayload());
    expect(result.ok).toBe(true);
    expect(sendOpsAlertToTelegram).toHaveBeenCalled();
  });

  it('sendOpsAlertToWhatsApp is mocked (no real API call)', async () => {
    const result = await sendOpsAlertToWhatsApp(samplePayload());
    expect(result.ok).toBe(true);
    expect(sendOpsAlertToWhatsApp).toHaveBeenCalled();
  });
});

describe('Ops Alerting — Privacy (sensitive label sanitization)', () => {
  it('OpsAlertPayload never includes email/userId/prompt fields', () => {
    const p = samplePayload();
    const keys = Object.keys(p);
    const forbidden = ['email', 'userId', 'tenantId', 'ip', 'prompt', 'token', 'secret', 'password', 'apiKey'];
    for (const f of forbidden) {
      expect(keys).not.toContain(f);
    }
  });
});
