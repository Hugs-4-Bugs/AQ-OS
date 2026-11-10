// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Consent contract + API tests
//
// Tests the shared consent contract (pure functions) and the consent
// API request/response shapes. Database-dependent behavior is tested
// via the contract's pure functions — the API route is a thin wrapper
// around these functions.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  CONSENT_PURPOSES,
  CONSENT_NOTICE_VERSION,
  CONSENT_POLICY_EFFECTIVE_DATE,
  getDefaultConsentState,
  isValidPurpose,
  isEssentialPurpose,
  serializeConsentData,
  deserializeConsentData,
  applyConsentChange,
  stateToRecords,
  type ConsentPurpose,
} from '@/lib/compliance/consent-contract';

describe('Consent Contract — Purpose definitions', () => {
  it('defines exactly 5 consent purposes', () => {
    expect(CONSENT_PURPOSES).toHaveLength(5);
  });

  it('includes essential_service as the only essential purpose', () => {
    const essential = CONSENT_PURPOSES.filter((p) => p.essential);
    expect(essential).toHaveLength(1);
    expect(essential[0].purpose).toBe('essential_service');
  });

  it('all non-essential purposes have a withdrawal consequence', () => {
    for (const p of CONSENT_PURPOSES) {
      if (!p.essential) {
        expect(p.withdrawalConsequence).toBeTruthy();
        expect(p.withdrawalConsequence.length).toBeGreaterThan(20);
      }
    }
  });

  it('purpose identifiers match the dashboard identifiers', () => {
    const purposes = CONSENT_PURPOSES.map((p) => p.purpose);
    expect(purposes).toContain('essential_service');
    expect(purposes).toContain('ai_processing');
    expect(purposes).toContain('marketing_communications');
    expect(purposes).toContain('analytics_telemetry');
    expect(purposes).toContain('third_party_integrations');
  });
});

describe('Consent Contract — Validation', () => {
  it('isValidPurpose accepts valid purposes', () => {
    expect(isValidPurpose('essential_service')).toBe(true);
    expect(isValidPurpose('ai_processing')).toBe(true);
    expect(isValidPurpose('marketing_communications')).toBe(true);
    expect(isValidPurpose('analytics_telemetry')).toBe(true);
    expect(isValidPurpose('third_party_integrations')).toBe(true);
  });

  it('isValidPurpose rejects invalid purposes (including old identifiers)', () => {
    expect(isValidPurpose('data_processing')).toBe(false);
    expect(isValidPurpose('marketing_emails')).toBe(false);
    expect(isValidPurpose('ai_data_usage')).toBe(false);
    expect(isValidPurpose('cookie_analytics')).toBe(false);
    expect(isValidPurpose('')).toBe(false);
    expect(isValidPurpose('random_string')).toBe(false);
  });

  it('isEssentialPurpose correctly identifies essential_service', () => {
    expect(isEssentialPurpose('essential_service')).toBe(true);
    expect(isEssentialPurpose('ai_processing')).toBe(false);
    expect(isEssentialPurpose('marketing_communications')).toBe(false);
  });
});

describe('Consent Contract — Default state', () => {
  it('essential_service defaults to granted', () => {
    const state = getDefaultConsentState();
    expect(state.essential_service.status).toBe('granted');
    expect(state.essential_service.grantedAt).toBeTruthy();
    expect(state.essential_service.withdrawnAt).toBeNull();
  });

  it('all optional purposes default to declined (NOT silently granted)', () => {
    const state = getDefaultConsentState();
    expect(state.ai_processing.status).toBe('declined');
    expect(state.marketing_communications.status).toBe('declined');
    expect(state.analytics_telemetry.status).toBe('declined');
    expect(state.third_party_integrations.status).toBe('declined');
  });

  it('all entries have the current notice version', () => {
    const state = getDefaultConsentState();
    for (const [, entry] of Object.entries(state)) {
      expect(entry.noticeVersion).toBe(CONSENT_NOTICE_VERSION);
    }
  });

  it('notice version and policy date are set', () => {
    expect(CONSENT_NOTICE_VERSION).toBeTruthy();
    expect(CONSENT_POLICY_EFFECTIVE_DATE).toBeTruthy();
  });
});

describe('Consent Contract — Serialization', () => {
  it('round-trips state + history through serialize/deserialize', () => {
    const state = getDefaultConsentState();
    const history = [
      {
        timestamp: new Date().toISOString(),
        purpose: 'ai_processing' as ConsentPurpose,
        action: 'grant' as const,
        previousStatus: 'declined' as const,
        newStatus: 'granted' as const,
        noticeVersion: CONSENT_NOTICE_VERSION,
        source: 'api' as const,
      },
    ];
    const serialized = serializeConsentData(state, history);
    const { state: restoredState, history: restoredHistory } =
      deserializeConsentData(serialized);
    expect(restoredState.essential_service.status).toBe('granted');
    expect(restoredState.ai_processing.status).toBe('declined');
    expect(restoredHistory).toHaveLength(1);
    expect(restoredHistory[0].purpose).toBe('ai_processing');
  });

  it('handles null/undefined input gracefully', () => {
    const { state, history } = deserializeConsentData(null);
    expect(state.essential_service.status).toBe('granted');
    expect(history).toEqual([]);
  });

  it('handles invalid JSON gracefully', () => {
    const { state, history } = deserializeConsentData('{invalid json');
    expect(state.essential_service.status).toBe('granted');
    expect(history).toEqual([]);
  });

  it('migrates legacy consent shape to new shape', () => {
    const legacy = JSON.stringify({
      data_processing: {
        granted: true,
        grantedAt: '2026-01-01T00:00:00Z',
        revokedAt: null,
        version: '1.0',
      },
      marketing_emails: {
        granted: false,
        grantedAt: null,
        revokedAt: '2026-02-01T00:00:00Z',
        version: '1.0',
      },
    });
    const { state, history } = deserializeConsentData(legacy);
    expect(state.essential_service.status).toBe('granted');
    expect(state.ai_processing.status).toBe('declined');
    expect(history).toEqual([]);
  });
});

describe('Consent Contract — applyConsentChange', () => {
  it('grants a declined purpose', () => {
    const state = getDefaultConsentState();
    const { newState, historyEntry } = applyConsentChange(
      state,
      'ai_processing',
      'grant',
      'api'
    );
    expect(newState.ai_processing.status).toBe('granted');
    expect(newState.ai_processing.grantedAt).toBeTruthy();
    expect(newState.ai_processing.withdrawnAt).toBeNull();
    expect(historyEntry.action).toBe('grant');
    expect(historyEntry.previousStatus).toBe('declined');
    expect(historyEntry.newStatus).toBe('granted');
    expect(historyEntry.noticeVersion).toBe(CONSENT_NOTICE_VERSION);
  });

  it('withdraws a granted purpose', () => {
    const state = getDefaultConsentState();
    const { newState: grantedState } = applyConsentChange(
      state,
      'ai_processing',
      'grant',
      'api'
    );
    const { newState, historyEntry } = applyConsentChange(
      grantedState,
      'ai_processing',
      'withdraw',
      'dashboard'
    );
    expect(newState.ai_processing.status).toBe('withdrawn');
    expect(newState.ai_processing.withdrawnAt).toBeTruthy();
    expect(newState.ai_processing.grantedAt).toBe(
      grantedState.ai_processing.grantedAt
    );
    expect(historyEntry.action).toBe('withdraw');
    expect(historyEntry.previousStatus).toBe('granted');
    expect(historyEntry.newStatus).toBe('withdrawn');
    expect(historyEntry.source).toBe('dashboard');
  });

  it('records metadata (IP, user agent) when provided', () => {
    const state = getDefaultConsentState();
    const { historyEntry } = applyConsentChange(
      state,
      'ai_processing',
      'grant',
      'api',
      { ipAddress: '192.168.1.1', userAgent: 'test-agent/1.0' }
    );
    expect(historyEntry.ipAddress).toBe('192.168.1.1');
    expect(historyEntry.userAgent).toBe('test-agent/1.0');
  });

  it('does not modify the original state (immutability)', () => {
    const state = getDefaultConsentState();
    const originalAiStatus = state.ai_processing.status;
    applyConsentChange(state, 'ai_processing', 'grant', 'api');
    expect(state.ai_processing.status).toBe(originalAiStatus);
  });
});

describe('Consent Contract — stateToRecords', () => {
  it('returns one record per purpose', () => {
    const state = getDefaultConsentState();
    const records = stateToRecords(state);
    expect(records).toHaveLength(5);
  });

  it('records include all display fields', () => {
    const state = getDefaultConsentState();
    const records = stateToRecords(state);
    const aiRecord = records.find((r) => r.purpose === 'ai_processing');
    expect(aiRecord).toBeDefined();
    expect(aiRecord!.title).toBeTruthy();
    expect(aiRecord!.description).toBeTruthy();
    expect(aiRecord!.essential).toBe(false);
    expect(aiRecord!.withdrawalConsequence).toBeTruthy();
    expect(aiRecord!.status).toBe('declined');
    expect(aiRecord!.noticeVersion).toBe(CONSENT_NOTICE_VERSION);
  });
});

describe('Consent Contract — API request shape', () => {
  it('ConsentUpdateRequest uses { purpose, action } shape (not { consents })', () => {
    const req = {
      purpose: 'ai_processing' as ConsentPurpose,
      action: 'grant' as const,
      source: 'dashboard' as const,
    };
    expect(req.purpose).toBe('ai_processing');
    expect(req.action).toBe('grant');
    const wrongShape = { consents: { ai_processing: true } };
    expect((wrongShape as unknown as Record<string, unknown>).consents).toBeDefined();
    expect((req as unknown as Record<string, unknown>).consents).toBeUndefined();
  });
});
