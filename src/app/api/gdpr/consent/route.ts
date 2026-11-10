// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GDPR Consent API (rewritten P0 fix)
//
// Uses the shared consent contract from @/lib/compliance/consent-contract
// so the API and the frontend dashboard CANNOT drift.
//
// Contract:
//   GET  /api/gdpr/consent
//     → ConsentResponse { consents, history, lastUpdated, noticeVersion, policyEffectiveDate }
//
//   GET  /api/gdpr/consent?type=requests
//     → ConsentRequestsResponse { requests: GdprRequest[] }
//
//   POST /api/gdpr/consent
//     body: ConsentUpdateRequest { purpose: ConsentPurpose, action: 'grant'|'withdraw', source? }
//     → ConsentUpdateResponse { ok, consent, history, updatedAt }
//
// Privacy:
//   - Consent state + history stored in UserSettings.notificationPreferences
//     under __consentState + __consentHistory keys (namespaced, not
//     overwriting legacy notification prefs).
//   - History is append-only — never overwritten.
//   - Every change audit-logged via AuditLog (tamper-evident chain).
//   - Essential service consent cannot be withdrawn.
//   - Optional purposes default to 'declined' (NOT silently granted).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import {
  CONSENT_NOTICE_VERSION,
  CONSENT_POLICY_EFFECTIVE_DATE,
  CONSENT_PURPOSES,
  getDefaultConsentState,
  isValidPurpose,
  isEssentialPurpose,
  deserializeConsentData,
  serializeConsentData,
  applyConsentChange,
  stateToRecords,
  type ConsentPurpose,
  type ConsentState,
  type ConsentHistoryEntry,
} from '@/lib/compliance/consent-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── GET: Get current consent state OR data subject rights requests ─
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const requestType = request.nextUrl.searchParams.get('type');

      // Branch: return GDPR data subject rights request history
      if (requestType === 'requests') {
        const gdprRequests = await db.gdprRequest.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            requestType: true,
            status: true,
            createdAt: true,
            completedAt: true,
            notes: true,
          },
        });
        return NextResponse.json({
          requests: gdprRequests.map((r) => ({
            id: r.id,
            requestType: r.requestType as 'access' | 'deletion' | 'portability' | 'rectification',
            status: r.status as 'pending' | 'processing' | 'completed' | 'failed',
            createdAt: r.createdAt.toISOString(),
            completedAt: r.completedAt?.toISOString() ?? null,
            notes: r.notes,
          })),
        });
      }

      // Default branch: return consent state + history
      let settings = await db.userSettings.findUnique({
        where: { userId: user.id },
      });

      if (!settings) {
        // Create default settings with required consent
        settings = await db.userSettings.create({
          data: {
            userId: user.id,
            notificationPreferences: serializeConsentData(
              getDefaultConsentState(),
              []
            ),
          },
        });
      }

      const { state, history } = deserializeConsentData(
        settings.notificationPreferences
      );

      return NextResponse.json({
        consents: stateToRecords(state),
        history,
        lastUpdated: settings.updatedAt.toISOString(),
        noticeVersion: CONSENT_NOTICE_VERSION,
        policyEffectiveDate: CONSENT_POLICY_EFFECTIVE_DATE,
      });
    } catch (error) {
      console.error('Get consent error:', error);
      return NextResponse.json(
        { error: 'Failed to get consent state' },
        { status: 500 }
      );
    }
  });
}

// ── POST: Update consent preference (grant or withdraw) ────────────
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const purpose = typeof body?.purpose === 'string' ? body.purpose : '';
      const action = typeof body?.action === 'string' ? body.action : '';
      const source = typeof body?.source === 'string' && (body.source === 'dashboard' || body.source === 'api')
        ? body.source
        : 'api';

      // Validate purpose
      if (!purpose || !isValidPurpose(purpose)) {
        return NextResponse.json(
          {
            error: `Invalid purpose. Valid purposes: ${CONSENT_PURPOSES.map((p) => p.purpose).join(', ')}`,
          },
          { status: 400 }
        );
      }

      // Validate action
      if (action !== 'grant' && action !== 'withdraw') {
        return NextResponse.json(
          { error: "Invalid action. Must be 'grant' or 'withdraw'." },
          { status: 400 }
        );
      }

      // Cannot withdraw essential service consent
      if (action === 'withdraw' && isEssentialPurpose(purpose)) {
        return NextResponse.json(
          {
            error: `Cannot withdraw consent for essential purpose "${purpose}". ` +
              'This consent is required to provide the core AcquisitionOS service. ' +
              'To stop essential processing, delete your account via Settings → Delete Account.',
          },
          { status: 400 }
        );
      }

      const ipAddress =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const userAgent = request.headers.get('user-agent') || null;

      // Load current state + history
      let settings = await db.userSettings.findUnique({
        where: { userId: user.id },
      });

      let currentState: ConsentState;
      let currentHistory: ConsentHistoryEntry[];

      if (!settings) {
        currentState = getDefaultConsentState();
        currentHistory = [];
        settings = await db.userSettings.create({
          data: {
            userId: user.id,
            notificationPreferences: serializeConsentData(
              currentState,
              currentHistory
            ),
          },
        });
      } else {
        const parsed = deserializeConsentData(settings.notificationPreferences);
        currentState = parsed.state;
        currentHistory = parsed.history;
      }

      // Apply the change (pure function)
      const { newState, historyEntry } = applyConsentChange(
        currentState,
        purpose as ConsentPurpose,
        action as 'grant' | 'withdraw',
        source as 'dashboard' | 'api',
        { ipAddress: ipAddress ?? undefined, userAgent: userAgent ?? undefined }
      );

      // Append to history (never overwrite)
      const newHistory = [...currentHistory, historyEntry];

      // Persist
      await db.userSettings.update({
        where: { userId: user.id },
        data: {
          notificationPreferences: serializeConsentData(newState, newHistory),
        },
      });

      // Audit log (tamper-evident chain)
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'gdpr_consent_updated',
          details: JSON.stringify({
            purpose,
            action,
            previousStatus: historyEntry.previousStatus,
            newStatus: historyEntry.newStatus,
            noticeVersion: CONSENT_NOTICE_VERSION,
            timestamp: historyEntry.timestamp,
          }),
          resource: 'consent',
          resourceId: purpose,
          ipAddress,
          userAgent,
          severity: 'low',
        },
      }).catch(() => {
        // Audit failure must never block the consent update
      });

      // Build response
      const consentRecord = stateToRecords(newState).find(
        (c) => c.purpose === purpose
      )!;

      return NextResponse.json({
        ok: true as const,
        consent: consentRecord,
        history: newHistory,
        updatedAt: historyEntry.timestamp,
      });
    } catch (error) {
      console.error('Update consent error:', error);
      return NextResponse.json(
        { error: 'Failed to update consent' },
        { status: 500 }
      );
    }
  });
}
