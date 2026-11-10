// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Consent Contract (shared between frontend + backend)
//
// Single source of truth for:
//   - Canonical consent purpose identifiers (aligned across UI + API)
//   - TypeScript types for consent state, history, API request/response
//   - Notice version tracking
//   - Default consent state factory
//
// Both `src/app/api/gdpr/consent/route.ts` and
// `src/app/dashboard/privacy/page.tsx` import from this module so the
// contract CANNOT drift between frontend and backend.
//
// Phase P0 fix — Privacy Consent API Contract
// ═══════════════════════════════════════════════════════════════════

// ── Notice version ──────────────────────────────────────────────────
// Bumped whenever the consent notice text changes materially. Stored
// in every consent record so historical consents remain auditable
// against the notice version that was in effect when they were given.
export const CONSENT_NOTICE_VERSION = '2.0';
export const CONSENT_POLICY_EFFECTIVE_DATE = '2026-11-10';

// ── Canonical consent purposes ──────────────────────────────────────
// These identifiers are the ONLY valid values for the `purpose` field
// in consent API requests. They are shared between the frontend
// dashboard and the backend API — DO NOT define separate purpose
// identifiers in either file.
export type ConsentPurpose =
  | 'essential_service'        // Required — cannot be withdrawn while account is active
  | 'ai_processing'            // Optional — AI provider calls (lead analysis, outreach, chat)
  | 'marketing_communications' // Optional — product updates, announcements, promotions
  | 'analytics_telemetry'      // Optional — aggregated, anonymized usage analytics
  | 'third_party_integrations'; // Optional — Gmail, WhatsApp, Telegram, Calendar connections

export interface ConsentPurposeDefinition {
  purpose: ConsentPurpose;
  title: string;
  description: string;
  essential: boolean;
  // What processing is affected when this consent is withdrawn:
  withdrawalConsequence: string;
}

export const CONSENT_PURPOSES: ConsentPurposeDefinition[] = [
  {
    purpose: 'essential_service',
    title: 'Essential Service',
    description:
      'Account creation, authentication, billing, and core lead/pipeline management. ' +
      'This processing is required to provide the AcquisitionOS service you signed up for.',
    essential: true,
    withdrawalConsequence:
      'Cannot be withdrawn while your account is active. To stop essential processing, ' +
      'delete your account via Settings → Delete Account.',
  },
  {
    purpose: 'ai_processing',
    title: 'AI Processing',
    description:
      'Use AI providers (Z-AI, OpenAI, Anthropic, etc.) to analyze leads, generate ' +
      'outreach messages, provide AI chat assistance, and enrich lead data. Your ' +
      'prompts and lead context are sent to the configured AI provider.',
    essential: false,
    withdrawalConsequence:
      'AI-powered features (lead analysis, outreach generation, AI chat, lead enrichment, ' +
      'autonomous outreach) will be disabled. Existing lead and pipeline data remains ' +
      'fully accessible. You can re-grant consent at any time.',
  },
  {
    purpose: 'marketing_communications',
    title: 'Marketing Communications',
    description:
      'Receive product updates, feature announcements, and promotional offers via email. ' +
      'You can unsubscribe at any time.',
    essential: false,
    withdrawalConsequence:
      'You will stop receiving marketing emails. Transactional emails (password reset, ' +
      'invoice receipts, security alerts) are unaffected — these are sent under the ' +
      'essential_service consent.',
  },
  {
    purpose: 'analytics_telemetry',
    title: 'Analytics & Telemetry',
    description:
      'Collect aggregated, anonymized usage analytics to improve the product. No personal ' +
      'identification — only aggregate counts and usage patterns.',
    essential: false,
    withdrawalConsequence:
      'We will stop collecting usage analytics for your account. Product improvement ' +
      'decisions will rely on aggregate data from other users who have consented.',
  },
  {
    purpose: 'third_party_integrations',
    title: 'Third-Party Integrations',
    description:
      'Connect Gmail, WhatsApp, Telegram, and Google Calendar. Each integration shares ' +
      'only the data necessary for that integration (e.g. Gmail integration shares email ' +
      'metadata for outreach campaigns).',
    essential: false,
    withdrawalConsequence:
      'New third-party integration connections will be blocked. Existing connections ' +
      'remain active until you disconnect them in Settings. Core lead/pipeline data ' +
      'remains accessible.',
  },
];

// ── Consent state (persisted) ───────────────────────────────────────
// Stored in UserSettings.notificationPreferences as JSON. The shape is
// versioned — the `version` field tracks the notice version that was
// in effect when the consent was last changed.
export interface ConsentStateEntry {
  purpose: ConsentPurpose;
  status: 'granted' | 'declined' | 'withdrawn';
  grantedAt: string | null;     // ISO timestamp of first grant
  changedAt: string;            // ISO timestamp of last status change
  withdrawnAt: string | null;   // ISO timestamp of last withdrawal (if status === 'withdrawn')
  noticeVersion: string;        // CONSENT_NOTICE_VERSION at time of last change
  source: 'signup' | 'dashboard' | 'api' | 'default'; // how the consent was set
}

export type ConsentState = Record<ConsentPurpose, ConsentStateEntry>;

// ── Consent history (append-only audit trail) ───────────────────────
// Stored alongside ConsentState in UserSettings.notificationPreferences
// under a `__history` key. NEVER overwritten — only appended to.
// This provides the auditable consent history required by DPDP §11(5).
export interface ConsentHistoryEntry {
  timestamp: string;            // ISO timestamp of the change
  purpose: ConsentPurpose;
  action: 'grant' | 'decline' | 'withdraw';
  previousStatus: ConsentStateEntry['status'] | 'not_set';
  newStatus: ConsentStateEntry['status'];
  noticeVersion: string;
  source: 'signup' | 'dashboard' | 'api' | 'default';
  ipAddress?: string;
  userAgent?: string;
}

// ── API request contract ────────────────────────────────────────────
// POST /api/gdpr/consent
export interface ConsentUpdateRequest {
  purpose: ConsentPurpose;
  action: 'grant' | 'withdraw';
  // Optional source tracking — defaults to 'api' if not provided
  source?: 'dashboard' | 'api';
}

// ── API response contract ───────────────────────────────────────────
// GET /api/gdpr/consent → ConsentResponse
// POST /api/gdpr/consent → ConsentUpdateResponse
// GET /api/gdpr/consent?type=requests → ConsentRequestsResponse
export interface ConsentRecord {
  purpose: ConsentPurpose;
  title: string;
  description: string;
  essential: boolean;
  withdrawalConsequence: string;
  status: ConsentStateEntry['status'] | 'not_set';
  grantedAt: string | null;
  changedAt: string | null;
  withdrawnAt: string | null;
  noticeVersion: string;
}

export interface ConsentResponse {
  consents: ConsentRecord[];
  history: ConsentHistoryEntry[];
  lastUpdated: string;
  noticeVersion: string;
  policyEffectiveDate: string;
}

export interface ConsentUpdateResponse {
  ok: true;
  consent: ConsentRecord;
  history: ConsentHistoryEntry[];
  updatedAt: string;
}

export interface ConsentRequestsResponse {
  requests: Array<{
    id: string;
    requestType: 'access' | 'deletion' | 'portability' | 'rectification';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    createdAt: string;
    completedAt: string | null;
    notes: string | null;
  }>;
}

// ── Default consent state factory ───────────────────────────────────
// Essential service is granted by default (required for account to function).
// All optional purposes default to 'not_set' status — they are NOT silently
// granted. The user must explicitly grant each optional purpose.
export function getDefaultConsentState(): ConsentState {
  const now = new Date().toISOString();
  const state: Partial<ConsentState> = {};
  for (const def of CONSENT_PURPOSES) {
    state[def.purpose] = {
      purpose: def.purpose,
      status: def.essential ? 'granted' : 'declined',
      grantedAt: def.essential ? now : null,
      changedAt: now,
      withdrawnAt: null,
      noticeVersion: CONSENT_NOTICE_VERSION,
      source: 'default',
    };
  }
  return state as ConsentState;
}

// ── Purpose validation ──────────────────────────────────────────────
const VALID_PURPOSES = new Set<ConsentPurpose>(
  CONSENT_PURPOSES.map((p) => p.purpose)
);

export function isValidPurpose(purpose: string): purpose is ConsentPurpose {
  return VALID_PURPOSES.has(purpose as ConsentPurpose);
}

export function isEssentialPurpose(purpose: ConsentPurpose): boolean {
  const def = CONSENT_PURPOSES.find((p) => p.purpose === purpose);
  return def?.essential ?? false;
}

// ── Serialization helpers ───────────────────────────────────────────
// Consent state + history are stored as JSON in
// UserSettings.notificationPreferences. The shape is:
//   {
//     "__consentState": ConsentState,
//     "__consentHistory": ConsentHistoryEntry[]
//   }
// The double-underscore prefix distinguishes consent data from any
// legacy notification-preference data that may have been stored
// previously.

const CONSENT_STATE_KEY = '__consentState';
const CONSENT_HISTORY_KEY = '__consentHistory';

export interface PersistedConsentData {
  [CONSENT_STATE_KEY]: ConsentState;
  [CONSENT_HISTORY_KEY]: ConsentHistoryEntry[];
}

export function serializeConsentData(
  state: ConsentState,
  history: ConsentHistoryEntry[]
): string {
  const data: PersistedConsentData = {
    [CONSENT_STATE_KEY]: state,
    [CONSENT_HISTORY_KEY]: history,
  };
  return JSON.stringify(data);
}

export function deserializeConsentData(
  raw: string | null | undefined
): { state: ConsentState; history: ConsentHistoryEntry[] } {
  if (!raw) {
    return { state: getDefaultConsentState(), history: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    // Handle both the new shape ({__consentState, __consentHistory})
    // and the legacy shape ({purpose: {granted, ...}, ...}).
    if (parsed[CONSENT_STATE_KEY] && parsed[CONSENT_HISTORY_KEY]) {
      return {
        state: { ...getDefaultConsentState(), ...parsed[CONSENT_STATE_KEY] },
        history: parsed[CONSENT_HISTORY_KEY] as ConsentHistoryEntry[],
      };
    }
    // Legacy shape — migrate to new shape
    const migratedState = getDefaultConsentState();
    for (const def of CONSENT_PURPOSES) {
      const legacyKey = def.purpose;
      const legacyEntry = parsed[legacyKey];
      if (legacyEntry) {
        migratedState[def.purpose] = {
          purpose: def.purpose,
          status: legacyEntry.granted ? 'granted' : 'withdrawn',
          grantedAt: legacyEntry.grantedAt ?? null,
          changedAt: legacyEntry.grantedAt ?? legacyEntry.revokedAt ?? new Date().toISOString(),
          withdrawnAt: legacyEntry.revokedAt ?? null,
          noticeVersion: legacyEntry.version ?? '1.0',
          source: 'default',
        };
      }
    }
    return { state: migratedState, history: [] };
  } catch {
    return { state: getDefaultConsentState(), history: [] };
  }
}

// ── Apply a consent change ──────────────────────────────────────────
// Pure function — does NOT touch the database. Returns the new state
// and the history entry to append. Caller is responsible for persisting.
export function applyConsentChange(
  currentState: ConsentState,
  purpose: ConsentPurpose,
  action: 'grant' | 'withdraw',
  source: 'signup' | 'dashboard' | 'api' | 'default',
  metadata?: { ipAddress?: string; userAgent?: string }
): { newState: ConsentState; historyEntry: ConsentHistoryEntry } {
  const now = new Date().toISOString();
  const currentEntry = currentState[purpose];
  const previousStatus = currentEntry?.status ?? 'not_set';

  // Determine new status
  let newStatus: ConsentStateEntry['status'];
  if (action === 'grant') {
    newStatus = 'granted';
  } else {
    // withdraw → status becomes 'withdrawn'
    newStatus = 'withdrawn';
  }

  const newEntry: ConsentStateEntry = {
    purpose,
    status: newStatus,
    grantedAt:
      action === 'grant'
        ? now
        : currentEntry?.grantedAt ?? null, // preserve original grant time on withdrawal
    changedAt: now,
    withdrawnAt: action === 'withdraw' ? now : null,
    noticeVersion: CONSENT_NOTICE_VERSION,
    source,
  };

  const newState: ConsentState = {
    ...currentState,
    [purpose]: newEntry,
  };

  const historyEntry: ConsentHistoryEntry = {
    timestamp: now,
    purpose,
    action,
    previousStatus,
    newStatus,
    noticeVersion: CONSENT_NOTICE_VERSION,
    source,
    ...(metadata?.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
    ...(metadata?.userAgent ? { userAgent: metadata.userAgent } : {}),
  };

  return { newState, historyEntry };
}

// ── Convert state to response records ───────────────────────────────
export function stateToRecords(state: ConsentState): ConsentRecord[] {
  return CONSENT_PURPOSES.map((def) => {
    const entry = state[def.purpose];
    return {
      purpose: def.purpose,
      title: def.title,
      description: def.description,
      essential: def.essential,
      withdrawalConsequence: def.withdrawalConsequence,
      status: entry?.status ?? 'not_set',
      grantedAt: entry?.grantedAt ?? null,
      changedAt: entry?.changedAt ?? null,
      withdrawnAt: entry?.withdrawnAt ?? null,
      noticeVersion: entry?.noticeVersion ?? CONSENT_NOTICE_VERSION,
    };
  });
}

export {
  CONSENT_STATE_KEY,
  CONSENT_HISTORY_KEY,
};
